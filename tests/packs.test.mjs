import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";
import { bossOptions, createStore } from "../src/fixtures.js";
import { evaluatePack as evaluateWith, generatePack as generateWith } from "../src/packs.js";
import { buildReferenceCatalog } from "../src/references.js";
import { packPresets } from "../src/pack-presets.js";
import { applyPlan, calendarEntries, setupRow } from "../src/domain.js";
import { spreadsheetChallenge, spreadsheetRow } from "./fixtures/spreadsheet.mjs";

// Packs read bosses and pack presets from the repository reference catalog; tests use the mock catalog.
const references = buildReferenceCatalog();
const evaluatePack = (store, input, options = {}) => evaluateWith(store, input, { references, ...options });
const generatePack = (pack) => generateWith(pack, references);

const makePack = () => ({
  id: "pack-thirty", name: "Thirty bosses", idPrefix: "Thirty", namePattern: "{boss} Trial {index}",
  bossIds: bossOptions.slice(0, 30).map((boss) => boss.value), template: structuredClone(createStore().challenges[0]),
  schedule: { month: "2028-02", day: 28, startUtc: "19:00", levelBracket: "40-49", mode: "sequential", intervalDays: 1 },
});
const blocking = (result) => result.validation.filter((item) => item.severity === "error");

test("30-boss packs preserve all shared spreadsheet fields and numeric export formats", () => {
  const pack = makePack();
  pack.template = structuredClone(spreadsheetChallenge);
  pack.schedule.levelBracket = "50-59";
  const plan = evaluatePack(createStore(), pack);
  assert.deepEqual(blocking(plan), []);
  assert.equal(plan.challenges.length, 30);
  for (const challenge of plan.challenges) {
    const row = setupRow(challenge);
    for (const key of Object.keys(spreadsheetRow).filter((key) => !["CompetitionID", "BossID", "DisplayName", "TargetName"].includes(key))) {
      assert.equal(row[key], spreadsheetRow[key], `${challenge.id}: ${key}`);
    }
  }
});

test("pack generates 30 distinct bosses and names with independent copies of shared configuration", () => {
  const pack = makePack();
  const members = generatePack(pack);
  assert.equal(members.length, 30);
  assert.equal(new Set(members.map((member) => member.challenge.id)).size, 30);
  assert.equal(new Set(members.map((member) => member.challenge.identity.displayName)).size, 30);
  for (const [index, { challenge }] of members.entries()) {
    assert.equal(challenge.content.bossId, bossOptions[index].value);
    assert.equal(challenge.identity.targetName, bossOptions[index].label);
    for (const key of ["eligibility", "timing", "rewards", "players", "visuals", "advanced"]) assert.deepEqual(challenge[key], pack.template[key]);
    assert.equal(challenge.identity.competitionGroup, pack.template.identity.competitionGroup);
    assert.equal(challenge.content.arena, pack.template.content.arena);
  }
  members[0].challenge.timing.durationHours = 3;
  assert.equal(members[1].challenge.timing.durationHours, 24);
  assert.equal(pack.template.timing.durationHours, 24);
  assert.deepEqual(members.slice(0, 3).map(({ schedule }) => [schedule.month, schedule.day]), [["2028-02", 28], ["2028-02", 29], ["2028-03", 1]]);
});

test("same-time pack merges all 30 appends into one cell without losing existing entries", () => {
  const store = createStore();
  const before = structuredClone(store);
  const pack = makePack();
  Object.assign(pack.schedule, { month: "2026-09", day: 22, mode: "simultaneous" });
  const plan = evaluatePack(store, pack);
  assert.deepEqual(blocking(plan), []);
  assert.equal(plan.diff.mutations.length, 1);
  assert.equal(plan.diff.mutations[0].after.length, 32);
  assert.deepEqual(plan.diff.mutations[0].after.slice(0, 2), store.calendar["2026-09"][22]["40-49"]);
  const committed = applyPlan(store, plan);
  assert.equal(committed.challenges.length, 33);
  assert.equal(committed.packs[0].challengeIds.length, 30);
  assert.equal(committed.revision, 1);
  assert.deepEqual(store, before);
  const repeat = evaluatePack(committed, committed.packs[0]);
  assert.deepEqual(blocking(repeat), []);
  assert.equal(repeat.diff.setup.length + repeat.diff.calendar.length + repeat.diff.pack.length, 0);
});

test("packs reject invalid shared values, duplicate bosses, invalid dates, unknown presets and foreign IDs", () => {
  for (const change of [
    (pack) => { pack.bossIds = []; },
    (pack) => { pack.bossIds = ["ScarredOrc", "ScarredOrc"]; },
    (pack) => { pack.bossIds = ["UnknownBoss"]; },
    (pack) => { pack.template.timing.durationHours = 0; },
    (pack) => { pack.template.players.minRequired = 999; },
    (pack) => { pack.template = null; },
    (pack) => { pack.id = "__proto__"; },
    (pack) => { pack.idPrefix = "bad|prefix"; },
    (pack) => { pack.namePattern = "Missing boss placeholder"; },
    (pack) => { pack.schedule.day = 31; },
    (pack) => { pack.schedule.startUtc = "24:00"; },
    (pack) => { pack.schedule.intervalDays = 0.5; },
    (pack) => { pack.schedule.mode = "unknown"; },
    (pack) => { pack.schedule.levelBracket = "70-90"; },
    (pack) => { pack.schedule.month = "9999-12"; pack.schedule.day = 31; },
  ]) {
    const pack = makePack();
    change(pack);
    assert.ok(blocking(evaluatePack(createStore(), pack)).length, JSON.stringify(pack));
  }
  const store = createStore();
  store.challenges.push(generatePack(makePack())[0].challenge);
  assert.ok(blocking(evaluatePack(store, makePack())).some((item) => /already in use/.test(item.text)));
});

test("published packs can be rescheduled without duplicate setups and cannot rename their IDs", () => {
  const store = applyPlan(createStore(), evaluatePack(createStore(), makePack()));
  const pack = structuredClone(store.packs[0]);
  pack.idPrefix = "Renamed";
  assert.ok(blocking(evaluatePack(store, pack)).some((item) => item.field === "pack.idPrefix"));
  pack.idPrefix = "Thirty";
  pack.schedule.month = "2028-04";
  const plan = evaluatePack(store, pack);
  assert.deepEqual(blocking(plan), []);
  assert.equal(plan.diff.setup.length, 0);
  const committed = applyPlan(store, plan);
  assert.equal(committed.challenges.length, 33);
  assert.equal(calendarEntries(committed.calendar).length, calendarEntries(store.calendar).length + 30);
  const reduced = structuredClone(committed.packs[0]);
  reduced.bossIds.pop();
  const removal = evaluatePack(committed, reduced);
  assert.ok(removal.validation.some((item) => /Removed members/.test(item.text)));
  assert.equal(applyPlan(committed, removal).challenges.length, 33);
});

async function harness(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "challenge-packs-"));
  const storePath = join(directory, "store.json");
  const app = await createApp({ storePath, queueDelay: 5, runBuild: async () => {}, ...options });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (path, payload) => {
    const response = await fetch(url + path, payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {});
    return { status: response.status, body: await response.json() };
  };
  t.after(async () => { await app.waitForIdle(); await new Promise((resolve) => app.server.close(resolve)); });
  return { ...app, request, storePath };
}

test("batch deploy writes the reviewed 30-member pack in one write and imports each month once", async (t) => {
  let finish;
  let started = false;
  const gate = new Promise((resolve) => { finish = resolve; });
  const h = await harness(t, { runBuild: () => { started = true; return gate; } });
  const before = (await h.request("/api/state")).body;
  const pack = makePack();
  const preview = await h.request("/api/preview", { pack });
  assert.equal(preview.status, 200);
  const stale = (await h.request("/api/preview", { pack })).body;
  pack.template.timing.durationHours = 123;
  assert.equal((await h.request("/api/deploy", { target: "production", previewId: preview.body.id })).status, 403);
  try {
    const job = await h.request("/api/deploy", { target: "stage", previewId: preview.body.id, pack });
    assert.equal(job.status, 202);
    assert.equal(job.body.challengeIds.length, 30);
    while (!started) await new Promise((resolve) => setTimeout(resolve, 5));
    // The whole reviewed pack is in the sheet before the first import starts; the edited payload is ignored.
    const during = (await h.request("/api/state")).body;
    assert.equal(during.challenges.length, before.challenges.length + 30);
    assert.equal(during.challenges.at(-1).timing.durationHours, 24);
    assert.equal(during.packs.length, 1);
    assert.deepEqual(during.history[0].months, ["2028-02", "2028-03"]);
    assert.equal((await h.request("/api/deploy", { target: "stage", previewId: stale.id })).status, 409);
  } finally { finish(); await h.waitForIdle(); }
  const committed = (await h.request("/api/state")).body;
  assert.equal(committed.challenges.length, 33);
  assert.equal(committed.challenges.at(-1).timing.durationHours, 24);
  assert.equal(committed.revision, 1);
  assert.deepEqual(committed.history[0].builds.map((build) => [build.parameters.UTC_YEAR, build.parameters.UTC_MONTH, build.status]),
    [["2028", "02", "SUCCESS"], ["2028", "03", "SUCCESS"]]);
  assert.equal(committed.history[0].packName, "Thirty bosses");
  assert.equal(committed.history[0].status, "Success");
  assert.deepEqual(JSON.parse(await readFile(h.storePath, "utf8")), committed);
  assert.equal((await h.request("/api/deploy", { target: "stage", previewId: stale.id })).status, 409);
  assert.equal((await h.request("/api/preview", { pack: committed.packs[0] })).status, 409);
});

test("invalid and failed batches leave all setups, calendars and pack definitions unchanged", async (t) => {
  const h = await harness(t, { runBuild: async () => { throw new Error("Batch failure"); } });
  const before = (await h.request("/api/state")).body;
  const invalid = makePack();
  invalid.bossIds.push("UnknownBoss");
  assert.equal((await h.request("/api/preview", { pack: invalid })).status, 422);
  assert.deepEqual((await h.request("/api/state")).body, before);
  const plan = (await h.request("/api/preview", { pack: makePack() })).body;
  await h.request("/api/deploy", { target: "stage", previewId: plan.id });
  await h.waitForIdle();
  const failed = (await h.request("/api/state")).body;
  assert.deepEqual(failed.challenges, before.challenges);
  assert.deepEqual(failed.calendar, before.calendar);
  assert.equal(failed.packs?.length || 0, 0);
  assert.equal(failed.revision, 2, "One write and one rollback");
  assert.equal(failed.history[0].status, "Failure");
});

test("when a later month fails, the sheet is rolled back and earlier months are imported again", async (t) => {
  const h = await harness(t, { runBuild: async (_plan, parameters) => {
    if (parameters.UTC_MONTH === "03") throw new Error("March import failed");
  } });
  const before = (await h.request("/api/state")).body;
  const plan = (await h.request("/api/preview", { pack: makePack() })).body;
  await h.request("/api/deploy", { target: "stage", previewId: plan.id });
  await h.waitForIdle();
  const failed = (await h.request("/api/state")).body;
  assert.deepEqual(failed.challenges, before.challenges);
  assert.deepEqual(failed.calendar, before.calendar);
  assert.equal(failed.packs.length, 0);
  assert.deepEqual(failed.history[0].builds.map((build) => [build.parameters.UTC_MONTH, build.status, Boolean(build.rollback)]),
    [["02", "SUCCESS", false], ["03", "FAILURE", false], ["02", "SUCCESS", true]]);
  assert.match(failed.history[0].log, /March import failed.*rolled back and 2028-02 imported again/);
});

test("Regression Pack uses the 45 sheet rows exactly and ignores client-supplied members", () => {
  const regression = packPresets.regression.challenges;
  assert.equal(regression.length, 45);
  assert.deepEqual(regression.map((challenge) => challenge.id), Array.from({ length: 45 }, (_, index) => `CheckReg${index + 1}`));
  assert.deepEqual(setupRow(regression[0]), {
    CompetitionID: "CheckReg1", CompetitionGroup: "regChallenge", "Min Level": 60, "Max Level": 69, "Min CP": 0, "Max CP": 2650000000,
    ModeID: 0, BossID: "OrcChieftain", DisplayName: "Swarm6_70_D5_v4", TargetName: "Orc Chieftain",
    ChallengeDescription: "IDS_Orc_Chieftain_Description", EventGraphicURL: "challenge/ui_img_orc_chieftain_1.png",
    ImmuneIconsInChallengeDescription: "Physical", BadgeBackgroundURL: "challenge/badge_image_orc_chieftain_1.png",
    RewardPreset: "FireReward60", Arena: "Rockyfields", WavePreset: "OrcChieftain70_D55_v4", "Duration (h)": 24, "AttemptDuration(s)": 480,
    TimerPerWave: "", AttemptPrices: "1,1,2,3,4", NpcLevelMultiplier: 1, PlayersGroupPreset: "", MinPlayersRequired: 5, Players: 25,
    PlayersHardLimit: 40, MinutesInactive: 60, MinInactivePlayers: 0, MaxInactivePlayers: 0, SeparateLevels: 0, MinNpcLevelVariance: 0.9,
    MaxNpcLevelVariance: 1.1, DropTier: "DC_Level69", MaterialDropVariant: "16", PositionRankingMultiplier: 1.6,
    RankingScoreMultiplier: 1.1913651058504537, DifficultyFactorPreset: "60low_d1", MinutesLeftToUseHardLimit: 360,
  });
  assert.deepEqual(regression[2].visuals.immuneIcons, ["Physical", "Poison"]);

  const pack = {
    id: "regression-pack", name: "Regression Pack", preset: "regression", idPrefix: "Injected", namePattern: "", bossIds: ["Injected"],
    template: structuredClone(regression[0]),
    schedule: { month: "2028-02", day: 10, startUtc: "19:00", levelBracket: "40-49", mode: "simultaneous", intervalDays: 1 },
  };
  const plan = evaluatePack(createStore(), pack);
  assert.deepEqual(blocking(plan), []);
  assert.equal(plan.challenges.length, 45);
  assert.deepEqual(plan.challenges.map(setupRow), regression.map(setupRow));
  assert.ok(plan.schedules.every((schedule) => schedule.levelBracket === "60-69" && schedule.day === 10));
  assert.equal(plan.pack.idPrefix, "CheckReg");
  assert.equal(plan.pack.preset, "regression");
  assert.equal(plan.pack.bossIds.length, 45);
  assert.deepEqual(plan.diff.pack.find((row) => row.field === "Challenges"), { field: "Challenges", oldValue: "(new pack)", newValue: 45 });

  assert.deepEqual(blocking(evaluatePack(createStore(), { ...pack, preset: "rc" })).map((item) => item.text), ["This preset pack has no challenges yet."]);
  assert.ok(blocking(evaluatePack(createStore(), { ...pack, preset: "__proto__" })).some((item) => item.text === "Unknown pack preset."));
});
