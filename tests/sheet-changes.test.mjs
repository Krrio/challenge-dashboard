import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";
import { createStore } from "../src/fixtures.js";
import { buildDiff, validateChallenge } from "../src/domain.js";
import { evaluatePack } from "../src/packs.js";
import { buildReferenceCatalog } from "../src/references.js";
import { planChanges, applyChanges, invertChanges, changesState, importMonths } from "../src/sheet-changes.js";
import { importParameters } from "../src/integrations/jenkins.js";
import { MockRepository } from "../src/repositories/mock.js";

const singlePlan = (store, edit, schedule) => {
  const challenge = structuredClone(store.challenges[0]);
  edit(challenge);
  const fullSchedule = { challengeId: challenge.id, startUtc: "19:00", levelBracket: "40-49", ...schedule };
  return { challenge, schedule: fullSchedule, diff: buildDiff(store, challenge, fullSchedule, challenge.id) };
};

test("plans become targeted row and cell changes that roll back exactly", () => {
  const store = createStore();
  const changes = planChanges(store, singlePlan(store, (challenge) => { challenge.identity.displayName = "Changed"; }, { month: "2027-01", day: 5 }));
  assert.deepEqual(changes.setup.map((row) => row.id), ["ScarredOrcTest"]);
  assert.deepEqual(changes.calendar.map(({ month, day, levelBracket, before }) => ({ month, day, levelBracket, before })),
    [{ month: "2027-01", day: 5, levelBracket: "40-49", before: null }]);
  assert.deepEqual(changes.packs, []);
  const written = applyChanges(store, changes);
  assert.equal(written.revision, store.revision + 1);
  assert.equal(written.challenges[0].identity.displayName, "Changed");
  assert.equal(changesState(written, changes), "after");
  const restored = applyChanges(written, invertChanges(changes));
  assert.deepEqual({ ...restored, revision: store.revision }, store, "The created 2027-01 cell and month are removed again");
  assert.equal(changesState(restored, changes), "before");
});

test("a target edited in the sheet after the preview blocks the whole write", () => {
  const store = createStore();
  const changes = planChanges(store, singlePlan(store, (challenge) => { challenge.identity.displayName = "Reviewed"; }, { month: "2026-09", day: 22, startUtc: "21:00" }));
  const edited = structuredClone(store);
  edited.challenges[0].identity.displayName = "Edited directly in the sheet";
  const before = structuredClone(edited);
  assert.throws(() => applyChanges(edited, changes), (error) => error.status === 409 && error.conflicts.includes("ChallengeSetupConfig ScarredOrcTest"));
  assert.deepEqual(edited, before, "Nothing is written when any target conflicts");
  assert.equal(changesState(edited, changes), "mixed");
});

test("STAGE imports cover changed calendar months and future months that schedule a changed setup", () => {
  const store = createStore();
  const now = Date.parse("2026-10-22T12:07:00Z");
  const setupOnly = planChanges(store, { ...singlePlan(store, (challenge) => { challenge.timing.durationHours = 48; }, { month: "2026-09", day: 14 }), diff: { mutations: [] } });
  assert.deepEqual(importMonths(setupOnly, store.calendar, now), [], "Past months are not imported for a setup-only change");
  const calendar = structuredClone(store.calendar);
  calendar["2027-02"] = { 3: { "40-49": [{ challengeId: "ScarredOrcTest", startUtc: "18:00" }] } };
  assert.deepEqual(importMonths(setupOnly, calendar, now), ["2027-02"]);
  const scheduled = planChanges(store, singlePlan(store, () => {}, { month: "2026-09", day: 22, startUtc: "21:00" }));
  assert.deepEqual(importMonths(scheduled, store.calendar, now), ["2026-09"], "A changed calendar cell is always imported");
  assert.deepEqual(importParameters("sheet-1", "2027-02"), { SPREADSHEET_ID: "sheet-1", UTC_YEAR: "2027", UTC_MONTH: "02", IMPORTER_TYPE: "challenge" });
});

test("validation and packs only accept bosses and presets from the repository catalog", async (t) => {
  const store = createStore();
  const references = buildReferenceCatalog();
  const challenge = structuredClone(store.challenges[0]);
  assert.throws(() => validateChallenge(challenge, null, {}), /reference/);
  assert.equal(validateChallenge(challenge, null, { references }).some((item) => item.field === "content.bossId"), false);
  const withoutBoss = { ...references, bosses: references.bosses.filter((boss) => boss.value !== challenge.content.bossId) };
  assert.ok(validateChallenge(challenge, null, { references: withoutBoss }).some((item) => item.field === "content.bossId"));

  const smoke = structuredClone(references.packPresets.regression.challenges[0]);
  smoke.id = "SmokeCheck1";
  const catalog = { ...references, packPresets: { smoke: { name: "Smoke Pack", idPrefix: "SmokeCheck", challenges: [smoke] } } };
  const pack = { id: "smoke-pack", name: "Smoke Pack", preset: "smoke", idPrefix: "", namePattern: "", bossIds: [], template: smoke,
    schedule: { month: "2028-02", day: 10, startUtc: "19:00", levelBracket: "60-69", mode: "simultaneous", intervalDays: 1 } };
  assert.deepEqual(evaluatePack(store, pack, { references: catalog }).challenges.map((item) => item.id), ["SmokeCheck1"]);
  assert.ok(evaluatePack(store, pack, { references }).validation.some((item) => item.text === "Unknown pack preset."));

  // The server validates against whatever catalog its repository serves, e.g. a boss added in the sheet.
  class SheetCatalogRepository extends MockRepository {
    async getReferences() {
      const served = await super.getReferences();
      served.bosses.push({ value: "NewSheetBoss", label: "New Sheet Boss", sourceTab: "BossConfig", sourceKey: "NewSheetBoss" });
      return served;
    }
  }
  const preview = async (repository) => {
    const app = await createApp({ storePath: join(await mkdtemp(join(tmpdir(), "catalog-")), "store.json"), repository, queueDelay: 5, runBuild: async () => {} });
    await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise((resolve) => app.server.close(resolve)));
    const payload = structuredClone(challenge);
    payload.content.bossId = "NewSheetBoss";
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/preview`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge: payload, originalId: payload.id, schedule: { challengeId: payload.id, month: "2027-03", day: 1, startUtc: "19:00", levelBracket: "40-49" } }) });
    return response.status;
  };
  const directory = await mkdtemp(join(tmpdir(), "catalog-repo-"));
  assert.equal(await preview(new SheetCatalogRepository(join(directory, "a.json"))), 200);
  assert.equal(await preview(new MockRepository(join(directory, "b.json"))), 422);
});
