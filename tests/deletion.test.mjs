import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, bossOptions } from "../src/fixtures.js";
import { applyPlan, calendarEntries } from "../src/domain.js";
import { evaluatePack as evaluateWith, generatePack as generateWith } from "../src/packs.js";
import { buildReferenceCatalog } from "../src/references.js";
import { buildDeletionPlan } from "../src/deletion.js";
import { createApp } from "../server.mjs";

// Packs read bosses and pack presets from the repository reference catalog; tests use the mock catalog.
const references = buildReferenceCatalog();
const evaluatePack = (store, input, options = {}) => evaluateWith(store, input, { references, ...options });
const generatePack = (pack) => generateWith(pack, references);

function packedStore() {
  const store = createStore();
  return applyPlan(store, evaluatePack(store, {
    id: "test-pack", name: "Deletion test pack", idPrefix: "DeleteTest", namePattern: "{boss} Trial",
    bossIds: bossOptions.slice(0, 30).map((boss) => boss.value), template: structuredClone(store.challenges[0]),
    schedule: { month: "2026-09", day: 22, startUtc: "19:00", levelBracket: "40-49", mode: "simultaneous", intervalDays: 1 },
  }));
}

test("single deletion removes all occurrences and pack membership while preserving neighbors and audit history", () => {
  const store = packedStore();
  const id = store.packs[0].challengeIds[0];
  store.calendar["2027-01"] = { 1: { "40-49": [{ challengeId: id, startUtc: "20:00" }, { challengeId: "LegacySpider", startUtc: "21:00" }] } };
  const before = structuredClone(store);
  const plan = buildDeletionPlan(store, { kind: "challenge", id });
  assert.equal(plan.deletion.challengeCount, 1);
  assert.equal(plan.deletion.entryCount, 2);
  assert.equal(plan.deletion.updatedPacks.length, 1);
  const result = applyPlan(store, plan);
  assert.equal(result.challenges.length, 32);
  assert.equal(result.packs[0].bossIds.length, 29);
  assert.equal(result.packs[0].challengeIds.includes(id), false);
  assert.equal(generatePack(result.packs[0]).some((member) => member.challenge.id === id), false);
  assert.equal(calendarEntries(result.calendar).some((entry) => entry.challengeId === id), false);
  assert.deepEqual(result.calendar["2027-01"][1]["40-49"], [{ challengeId: "LegacySpider", startUtc: "21:00" }]);
  assert.deepEqual(result.calendar["2026-09"][22]["40-49"].slice(0, 2), before.calendar["2026-09"][22]["40-49"].slice(0, 2));
  assert.deepEqual(result.history, before.history);
  assert.deepEqual(store, before);
});

test("pack deletion keeps generated challenges by default and cascades only when explicitly requested", () => {
  const store = packedStore();
  const retained = applyPlan(store, buildDeletionPlan(store, { kind: "pack", id: "test-pack" }));
  assert.equal(retained.packs.length, 0);
  assert.deepEqual(retained.challenges, store.challenges);
  assert.deepEqual(retained.calendar, store.calendar);
  store.packs[0].bossIds.pop();
  const plan = buildDeletionPlan(store, { kind: "pack", id: "test-pack", includeChallenges: true });
  assert.equal(plan.deletion.challengeCount, 30, "Previously generated members remain in the explicit cascade scope");
  const removed = applyPlan(store, plan);
  assert.equal(removed.packs.length, 0);
  assert.deepEqual(removed.challenges, createStore().challenges);
  assert.deepEqual(removed.calendar, createStore().calendar);
  assert.deepEqual(removed.history, store.history);
});

test("deletion rejects invalid scope and missing targets", () => {
  for (const request of [null, {}, { kind: "all", id: "x" }, { kind: "challenge", id: "__proto__" },
    { kind: "pack", id: "test-pack", includeChallenges: "true" }, { kind: "challenge", id: "ScarredOrcTest", includeChallenges: true }]) {
    assert.throws(() => buildDeletionPlan(packedStore(), request), (error) => error.status === 400);
  }
  assert.throws(() => buildDeletionPlan(createStore(), { kind: "challenge", id: "Missing" }), (error) => error.status === 404);
});

async function harness(t, options = {}) {
  const path = join(await mkdtemp(join(tmpdir(), "challenge-deletion-")), "store.json");
  await writeFile(path, JSON.stringify(packedStore()));
  const app = await createApp({ storePath: path, queueDelay: 5, runBuild: async () => {}, ...options });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const request = async (route, payload) => {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}${route}`, payload ? {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    } : {});
    return { status: response.status, body: await response.json() };
  };
  t.after(async () => { await app.waitForIdle(); await new Promise((resolve) => app.server.close(resolve)); });
  return { ...app, request, path };
}

test("deletion uses the confirmed snapshot, is atomic and invalidates stale create/delete previews", async (t) => {
  let finish;
  let started = false;
  const gate = new Promise((resolve) => { finish = resolve; });
  const h = await harness(t, { runBuild: () => { started = true; return gate; } });
  const before = (await h.request("/api/state")).body;
  const id = before.challenges[0].id;
  const create = (await h.request("/api/preview", { challenge: before.challenges[0], originalId: id,
    schedule: { challengeId: id, month: "2029-01", day: 1, startUtc: "19:00", levelBracket: "40-49" } })).body;
  const plan = (await h.request("/api/preview", { deletion: { kind: "challenge", id } })).body;
  const stale = (await h.request("/api/preview", { deletion: { kind: "pack", id: "test-pack" } })).body;
  assert.deepEqual((await h.request("/api/state")).body, before);
  assert.equal((await h.request("/api/deploy", { target: "prod", previewId: plan.id })).status, 403);
  try {
    const accepted = await h.request("/api/deploy", { target: "stage", previewId: plan.id,
      deletion: { kind: "pack", id: "test-pack", includeChallenges: true } });
    assert.equal(accepted.status, 202);
    while (!started) await new Promise((resolve) => setTimeout(resolve, 5));
    // The confirmed single-challenge deletion is in the sheet while STAGE imports it.
    const pending = (await h.request("/api/state")).body;
    assert.equal(pending.challenges.some((challenge) => challenge.id === id), false);
    assert.equal(pending.packs.length, 1);
    assert.equal(pending.history[0].phase, "importing");
    assert.equal((await h.request("/api/deploy", { target: "stage", previewId: stale.id })).status, 409);
  } finally { finish(); await h.waitForIdle(); }
  const after = (await h.request("/api/state")).body;
  assert.equal(after.challenges.some((challenge) => challenge.id === id), false);
  assert.equal(after.packs.length, 1, "Unconfirmed cascade payload was ignored");
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.history[0].status, "Success");
  assert.deepEqual(after.history.slice(1), before.history);
  assert.deepEqual(JSON.parse(await readFile(h.path, "utf8")), after);
  for (const previewId of [create.id, stale.id, plan.id]) assert.equal((await h.request("/api/deploy", { target: "stage", previewId })).status, 409);
});

test("failed deletion keeps all challenges, packs and calendar entries intact", async (t) => {
  const h = await harness(t, { runBuild: async () => { throw new Error("Deletion build failed"); } });
  const before = (await h.request("/api/state")).body;
  const plan = (await h.request("/api/preview", { deletion: { kind: "pack", id: "test-pack", includeChallenges: true } })).body;
  await h.request("/api/deploy", { target: "stage", previewId: plan.id });
  await h.waitForIdle();
  const after = (await h.request("/api/state")).body;
  assert.deepEqual(after.challenges, before.challenges);
  assert.deepEqual(after.calendar, before.calendar);
  assert.deepEqual(after.packs, before.packs);
  assert.equal(after.revision, before.revision + 2, "One write and one rollback");
  assert.equal(after.history[0].status, "Failure");
  assert.deepEqual(after.history.slice(1), before.history);
});
