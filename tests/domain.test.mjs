import test from "node:test";
import assert from "node:assert/strict";
import { bossOptions, createStore } from "../src/fixtures.js";
import { isAssetPath, parseDecimalInput } from "../src/domain.js";
import { spreadsheetChallenge, spreadsheetRow } from "./fixtures/spreadsheet.mjs";
import { validateChallenge, buildDiff, appendEntry, applyPlan, nextStart, monthDays, setupRow, identityErrors } from "../src/domain.js";

const fixture = () => {
  const store = createStore();
  return { store, challenge: structuredClone(store.challenges[0]),
    schedule: { challengeId: "ScarredOrcTest", month: "2026-09", day: 22, startUtc: "21:00", levelBracket: "40-49" } };
};
const errors = (challenge, schedule, store) => validateChallenge(challenge, schedule, { ...store, now: Date.parse("2026-09-01T00:00:00Z") }).filter((item) => item.severity === "error");

test("spreadsheet sample validates and maps all 38 columns in sheet order", () => {
  assert.deepEqual(validateChallenge(spreadsheetChallenge).filter((item) => item.severity === "error"), []);
  const row = setupRow(spreadsheetChallenge);
  assert.equal(Object.keys(row).length, 38);
  assert.deepEqual(Object.keys(row), Object.keys(spreadsheetRow));
  assert.deepEqual(row, spreadsheetRow);
});

test("decimal input accepts Polish and English separators without losing invalid drafts", () => {
  for (const [input, expected] of [["0,9", 0.9], ["1.1", 1.1], ["0,7831", 0.7831], ["14.9", 14.9], ["", ""], ["0", 0], ["-1,2", -1.2], ["1,", 1]]) {
    assert.equal(parseDecimalInput(input), expected);
  }
  for (const input of ["1,2,3", "0x10", "NaN", "Infinity", "1e999", "invalid", "-"]) {
    assert.equal(parseDecimalInput(input), input);
  }
});

test("sheet formats allow fractional NPC variance and numeric flags but reject invalid values", () => {
  const sample = () => structuredClone(spreadsheetChallenge);
  for (const [value, expected] of [[true, 1], [false, 0], [1, 1], [0, 0], [undefined, ""], ["", ""]]) {
    const challenge = sample();
    challenge.advanced.separateLevels = value;
    assert.equal(setupRow(challenge).SeparateLevels, expected);
    assert.equal(validateChallenge(challenge).some((item) => item.severity === "error"), false);
  }
  for (const value of [2, "0", "false", {}]) {
    const challenge = sample();
    challenge.advanced.separateLevels = value;
    assert.ok(validateChallenge(challenge).some((item) => item.field === "advanced.separateLevels"));
  }
  for (const value of [-1, Infinity, "0,9"]) {
    const challenge = sample();
    challenge.advanced.minNpcLevelVariance = value;
    assert.ok(validateChallenge(challenge).some((item) => item.field === "advanced.minNpcLevelVariance"));
  }
  const challenge = sample();
  challenge.advanced.minNpcLevelVariance = 1.2;
  assert.ok(validateChallenge(challenge).some((item) => item.field === "advanced.maxNpcLevelVariance"));
});

test("hard limit window distinguishes blank from zero and has no duration-based maximum", () => {
  for (const value of ["", 0, 300, 1000000]) {
    const challenge = structuredClone(spreadsheetChallenge);
    challenge.advanced.minutesLeftToUseHardLimit = value;
    assert.deepEqual(validateChallenge(challenge).filter((item) => item.severity === "error"), []);
    assert.equal(setupRow(challenge).MinutesLeftToUseHardLimit, value);
  }
  for (const value of [-1, 0.5, Infinity, "100"]) {
    const challenge = structuredClone(spreadsheetChallenge);
    challenge.advanced.minutesLeftToUseHardLimit = value;
    assert.ok(validateChallenge(challenge).some((item) => item.field === "advanced.minutesLeftToUseHardLimit"));
  }
});

test("config catalogs are suggestions while mode IDs remain explicit numeric values", () => {
  const challenge = structuredClone(spreadsheetChallenge);
  challenge.content.arena = "Arena_Not_In_Mock_Catalog";
  challenge.content.wavePreset = "Wave_Not_In_Mock_Catalog";
  challenge.rewards.rewardPreset = "Rewards_Not_In_Mock_Catalog";
  challenge.rewards.dropTier = "DC_Level60";
  challenge.players.groupPreset = "CustomDivision";
  for (const mode of [0, 1]) {
    challenge.content.modeId = mode;
    assert.deepEqual(validateChallenge(challenge).filter((item) => item.severity === "error"), []);
    assert.equal(setupRow(challenge).ModeID, mode);
  }
  for (const mode of ["BossRush", "WaveDefense", "ArenaGauntlet", "0", 2, null, false]) {
    challenge.content.modeId = mode;
    assert.ok(validateChallenge(challenge).some((item) => item.field === "content.modeId"));
    assert.equal(challenge.content.modeId, mode, "No inferred migration of existing data");
  }
  for (const value of ["", " ", " NewArena", "Arena\nOther", 5]) {
    challenge.content.arena = value;
    assert.ok(validateChallenge(challenge).some((item) => item.field === "content.arena"));
  }
});

test("asset references accept game paths or web URLs and reject unsafe path forms", () => {
  for (const path of ["challenge/image.png", "challenge/sub/badge.webp", "https://example.com/image.png"]) {
    const challenge = structuredClone(spreadsheetChallenge);
    challenge.visuals.eventGraphicUrl = path;
    assert.deepEqual(validateChallenge(challenge).filter((item) => item.severity === "error"), []);
    assert.equal(setupRow(challenge).EventGraphicURL, path);
  }
  for (const path of ["../image.png", "challenge/../secret", "/challenge/image.png", "//evil.example/image.png", "challenge\\image.png", "challenge/%2e%2e/secret", "javascript:alert(1)", "data:image/png;base64,a", "file:///image.png", "challenge//image.png"]) {
    const challenge = structuredClone(spreadsheetChallenge);
    challenge.visuals.eventGraphicUrl = path;
    assert.equal(isAssetPath(path), false);
    assert.ok(validateChallenge(challenge).some((item) => item.field === "visuals.eventGraphicUrl"), path);
  }
});

test("attempt prices accept ordered ticket counts, including blanks and zero", () => {
  for (const value of ["", "0", "1,1,2,3,4", "1, 2, 3"]) {
    const challenge = structuredClone(spreadsheetChallenge);
    challenge.advanced.attemptPrices = value;
    assert.deepEqual(validateChallenge(challenge).filter((item) => item.severity === "error"), []);
    assert.equal(setupRow(challenge).AttemptPrices, value);
  }
  for (const value of ["1,,2", "1,", "-1,2", "1.5,2", "1;2", "NaN", "Infinity", " "]) {
    const challenge = structuredClone(spreadsheetChallenge);
    challenge.advanced.attemptPrices = value;
    assert.ok(validateChallenge(challenge).some((item) => item.field === "advanced.attemptPrices"));
  }
});

test("boss catalog has unique labels and stable config IDs", () => {
  assert.equal(bossOptions.length, 78);
  assert.equal(new Set(bossOptions.map((option) => option.label)).size, bossOptions.length);
  assert.equal(new Set(bossOptions.map((option) => option.value)).size, bossOptions.length);
  assert.deepEqual(bossOptions.find((option) => option.label === "Razor-Clawed Recluse"), {
    label: "Razor-Clawed Recluse", value: "RazorClawedRecluse",
  });
  assert.equal(bossOptions.find((option) => option.label === "Lord of Ashes").value, "LordOfAshes");
});

test("a valid challenge can be scheduled and overlapping availability is a warning", () => {
  const { store, challenge, schedule } = fixture();
  assert.deepEqual(errors(challenge, schedule, store), []);
  assert.ok(validateChallenge(challenge, schedule, store).some((item) => item.text.includes("overlaps")));
});

test("append preserves legacy entries and other times for the same ID", () => {
  const entries = [{ challengeId: "LegacySpider", startUtc: "15:00" }, { challengeId: "ScarredOrcTest", startUtc: "20:00" }];
  const result = appendEntry(entries, { challengeId: "ScarredOrcTest", startUtc: "21:00" });
  assert.equal(result.length, 3);
  assert.deepEqual(result.slice(0, 2), entries);
  assert.deepEqual(appendEntry(result, result[2]), result);
  assert.equal(entries.length, 2);
});

test("editing one occurrence changes only that occurrence, including moves between cells", () => {
  const { store, challenge, schedule } = fixture();
  schedule.previous = { ...schedule, startUtc: "20:00" };
  let diff = buildDiff(store, challenge, schedule);
  assert.deepEqual(diff.mutations[0].after.map((entry) => entry.startUtc), ["15:00", "21:00"]);
  schedule.day = 23;
  diff = buildDiff(store, challenge, schedule);
  assert.equal(diff.mutations.length, 2);
  assert.deepEqual(diff.mutations[0].after, [{ startUtc: "15:00", challengeId: "LegacySpider" }]);
  assert.deepEqual(diff.mutations[1].after, [{ startUtc: "21:00", challengeId: "ScarredOrcTest" }]);
});

test("an unchanged setup and schedule produces no mutations", () => {
  const { store, challenge, schedule } = fixture();
  schedule.startUtc = "20:00";
  const diff = buildDiff(store, challenge, schedule);
  assert.equal(diff.setup.length, 0);
  assert.equal(diff.calendar.length, 0);
});

test("saving a local copy cannot erase the deployed baseline diff", () => {
  const { store, challenge, schedule } = fixture();
  challenge.identity.displayName = "Updated Orc";
  const savedDraft = structuredClone(challenge);
  const diff = buildDiff(store, savedDraft, schedule);
  assert.deepEqual(diff.setup.find((row) => row.field === "DisplayName"), {
    field: "DisplayName", oldValue: "Scarred Orc Trial", newValue: "Updated Orc",
  });
});

test("numeric blanks, nonfinite numbers, negatives and fractions cannot bypass validation", () => {
  for (const value of ["", null, NaN, Infinity, -1, 1.5, "180"]) {
    const { store, challenge, schedule } = fixture();
    challenge.timing.attemptDurationSeconds = value;
    assert.ok(errors(challenge, schedule, store).some((item) => item.field === "timing.attemptDurationSeconds"), String(value));
  }
  const { challenge, schedule, store } = fixture();
  challenge.timing.timerPerWave = "";
  assert.equal(errors(challenge, schedule, store).length, 0);
});

test("player limits, CP range and duration relationships are validated", () => {
  const { store, challenge, schedule } = fixture();
  challenge.players.minRequired = 5;
  challenge.players.players = 4;
  challenge.players.hardLimit = 3;
  challenge.eligibility.minCP = 99999;
  challenge.timing.durationHours = 0.01;
  challenge.timing.timerPerWave = 181;
  const fields = errors(challenge, schedule, store).map((item) => item.field);
  for (const field of ["players.players", "players.hardLimit", "eligibility.maxCP", "timing.attemptDurationSeconds", "timing.timerPerWave"]) {
    assert.ok(fields.includes(field), field);
  }
});

test("invalid UTC dates and times are blocked, including non-leap February", () => {
  for (const [month, day, time] of [["2026-02", 29, "19:00"], ["2026-13", 1, "19:00"], ["2026-09", 0, "19:00"], ["2026-09", 1.5, "19:00"], ["2026-09", 14, "24:00"], ["2026-09", 14, "19:60"]]) {
    const { store, challenge, schedule } = fixture();
    Object.assign(schedule, { month, day, startUtc: time });
    assert.ok(errors(challenge, schedule, store).length > 0);
  }
  assert.equal(monthDays("2028-02"), 29);
  assert.equal(monthDays("2026-02"), 28);
});

test("scheduled challenge, preset, and all existing brackets must be consistent", () => {
  const { store, challenge, schedule } = fixture();
  schedule.challengeId = "Unknown";
  challenge.content.modeId = "Unsupported";
  challenge.eligibility.minLevel = 50;
  challenge.eligibility.maxLevel = 59;
  schedule.levelBracket = "50-59";
  const fields = errors(challenge, schedule, store).map((item) => item.field);
  assert.ok(fields.includes("schedule.challengeId"));
  assert.ok(fields.includes("content.modeId"));
  assert.ok(fields.includes("eligibility.maxLevel"));
});

test("identity prevents collisions, unsafe delimiters and renaming a published ID", () => {
  const { store, challenge, schedule } = fixture();
  assert.equal(identityErrors(challenge, store.challenges, "").length, 1);
  challenge.id = "New:ID | injected";
  assert.ok(identityErrors(challenge).length);
  challenge.id = "NewValidID";
  assert.ok(validateChallenge(challenge, schedule, { ...store, originalId: "ScarredOrcTest" }).some((item) => item.text.includes("renamed")));
});

test("next start is the earliest future occurrence, independent of insertion order", () => {
  const calendar = { "2026-11": { 3: { "40-49": [{ challengeId: "a", startUtc: "12:00" }] } },
    "2026-09": { 2: { "40-49": [{ challengeId: "a", startUtc: "08:00" }] }, 20: { "40-49": [
      { challengeId: "a", startUtc: "20:00" }, { challengeId: "a", startUtc: "10:00" },
    ] } } };
  const next = nextStart(calendar, "a", Date.parse("2026-09-14T00:00:00Z"));
  assert.equal(next.month, "2026-09");
  assert.equal(next.day, 20);
  assert.equal(next.startUtc, "10:00");
});

test("advanced columns appear in the diff and atomic commit preserves source objects", () => {
  const { store, challenge, schedule } = fixture();
  challenge.advanced.difficultyFactorPreset = "StageHard";
  challenge.advanced.minutesLeftToUseHardLimit = 30;
  challenge.visuals.immuneIcons = ["stun", "freeze"];
  const diff = buildDiff(store, challenge, schedule);
  assert.ok(diff.setup.some((row) => row.field === "DifficultyFactorPreset"));
  assert.ok(diff.setup.some((row) => row.field === "MinutesLeftToUseHardLimit"));
  const committed = applyPlan(store, { challenge, schedule, diff });
  assert.equal(committed.revision, store.revision + 1);
  assert.deepEqual(committed.challenges[2], store.challenges[2]);
  assert.equal(store.calendar["2026-09"][22]["40-49"].length, 2);
  assert.equal(committed.calendar["2026-09"][22]["40-49"].length, 3);
  assert.equal(setupRow(committed.challenges[0]).ImmuneIconsInChallengeDescription, "stun,freeze");
});
