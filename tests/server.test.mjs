import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";
import { setupRow } from "../src/domain.js";
import { spreadsheetChallenge, spreadsheetRow } from "./fixtures/spreadsheet.mjs";

async function harness(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "challenge-manager-test-"));
  const storePath = join(directory, "store.json");
  const app = await createApp({ storePath, queueDelay: 5, runBuild: async () => {}, ...options });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await app.waitForIdle();
    await new Promise((resolve) => app.server.close(resolve));
  });
  const request = async (path, data) => {
    const response = await fetch(url + path, data ? {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    } : {});
    return { status: response.status, body: await response.json() };
  };
  const store = (await request("/api/state")).body;
  const payload = {
    challenge: structuredClone(store.challenges[0]), originalId: store.challenges[0].id,
    schedule: { challengeId: store.challenges[0].id, month: "2026-09", day: 22, startUtc: "21:00", levelBracket: "40-49" },
  };
  payload.challenge.identity.displayName = "Server reviewed title";
  return { ...app, request, payload, store, storePath, url };
}

test("the PDF sample previews and commits all sheet fields without mutating other challenges", async (t) => {
  const h = await harness(t);
  const preview = await h.request("/api/preview", {
    challenge: spreadsheetChallenge,
    schedule: { challengeId: spreadsheetChallenge.id, month: "2028-09", day: 20, startUtc: "19:00", levelBracket: "50-59" },
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.deepEqual(Object.fromEntries(preview.body.diff.setup.map(({ field, newValue }) => [field, newValue])), spreadsheetRow);
  assert.equal((await h.request("/api/deploy", { target: "stage", previewId: preview.body.id })).status, 202);
  await h.waitForIdle();
  const result = (await h.request("/api/state")).body;
  assert.deepEqual(setupRow(result.challenges.find((item) => item.id === spreadsheetChallenge.id)), spreadsheetRow);
  assert.deepEqual(result.challenges.slice(0, 3), h.store.challenges);
  assert.equal(result.history[0].status, "Success");
  assert.equal(result.calendar["2028-09"][20]["50-59"][0].challengeId, spreadsheetChallenge.id);
});

test("backend rejects production, missing preview and invalid input without writes", async (t) => {
  const h = await harness(t);
  assert.equal((await h.request("/api/deploy", { target: "prod" })).status, 403);
  assert.equal((await h.request("/api/deploy", { target: "stage" })).status, 409);
  h.payload.challenge.timing.durationHours = 0;
  assert.equal((await h.request("/api/preview", h.payload)).status, 422);
  assert.equal((await h.request("/api/preview", { challenge: {}, schedule: {} })).status, 422);
  assert.deepEqual((await h.request("/api/state")).body, h.store);
});

test("commit uses reviewed snapshot, blocks parallel deploys and persists a single transaction", async (t) => {
  let finish;
  const h = await harness(t, { runBuild: () => new Promise((resolve) => { finish = resolve; }) });
  const plan = (await h.request("/api/preview", h.payload)).body;
  h.payload.challenge.identity.displayName = "Unreviewed title";
  const job = await h.request("/api/deploy", { target: "stage", previewId: plan.id, challenge: h.payload.challenge });
  assert.equal(job.status, 202);
  const during = (await h.request("/api/state")).body;
  assert.deepEqual(during.challenges, h.store.challenges);
  assert.deepEqual(during.calendar, h.store.calendar);
  assert.equal((await h.request("/api/deploy", { target: "stage", previewId: plan.id })).status, 409);
  while (!finish) await new Promise((resolve) => setTimeout(resolve, 5));
  finish();
  await h.waitForIdle();
  const final = (await h.request("/api/state")).body;
  assert.equal(final.history[0].status, "Success");
  assert.equal(final.challenges[0].identity.displayName, "Server reviewed title");
  assert.equal(final.calendar["2026-09"][22]["40-49"].length, 3);
  assert.equal(final.revision, 1);
  assert.deepEqual(JSON.parse(await readFile(h.storePath, "utf8")), final);
  assert.equal((await h.request("/api/deploy", { target: "stage", previewId: plan.id })).status, 409);
});

test("a stale preview cannot overwrite a later deployment", async (t) => {
  const h = await harness(t);
  const first = (await h.request("/api/preview", h.payload)).body;
  const stale = (await h.request("/api/preview", h.payload)).body;
  await h.request("/api/deploy", { target: "stage", previewId: first.id });
  await h.waitForIdle();
  const rejected = await h.request("/api/deploy", { target: "stage", previewId: stale.id });
  assert.equal(rejected.status, 409);
  assert.match(rejected.body.error, /Data changed/);
});

test("failed mock builds preserve both sheets and record the failure", async (t) => {
  const h = await harness(t, { runBuild: async () => { throw new Error("Simulated Jenkins failure"); } });
  const plan = (await h.request("/api/preview", h.payload)).body;
  await h.request("/api/deploy", { target: "stage", previewId: plan.id });
  await h.waitForIdle();
  const failed = (await h.request("/api/state")).body;
  assert.deepEqual(failed.challenges, h.store.challenges);
  assert.deepEqual(failed.calendar, h.store.calendar);
  assert.equal(failed.revision, 0);
  assert.equal(failed.history[0].status, "Failure");
  assert.match(failed.history[0].log, /not committed/);
});

test("private files, traversal and cross-origin writes are rejected", async (t) => {
  const h = await harness(t);
  for (const path of ["/.data/store.json", "/package.json", "/src/%2e%2e%5cserver.mjs", "/src/%2e%2e%5c.tmp/tools/node_modules/playwright/index.js"]) {
    assert.equal((await fetch(h.url + path)).status, 404, path);
  }
  const response = await fetch(h.url + "/api/deploy", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://example.com" },
    body: JSON.stringify({ target: "stage" }),
  });
  assert.equal(response.status, 403);
});

test("restarting the service recovers an interrupted build without committing changes", async (t) => {
  const h = await harness(t);
  const interrupted = structuredClone(h.store);
  interrupted.history.unshift({ id: "STAGE-interrupted", status: "Running" });
  await writeFile(h.storePath, JSON.stringify(interrupted));
  const restarted = await createApp({ storePath: h.storePath });
  assert.equal(restarted.server.listening, false);
  const persisted = JSON.parse(await readFile(h.storePath, "utf8"));
  assert.equal(persisted.history[0].status, "Failure");
  assert.deepEqual(persisted.challenges, h.store.challenges);
  assert.deepEqual(persisted.calendar, h.store.calendar);
});
