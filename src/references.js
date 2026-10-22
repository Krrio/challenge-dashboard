// Normalizes the dependent-tab preset catalogs into the shape the UI and validation
// layer consume, regardless of which repository (mock or, later, Google Sheets) they
// came from. Each entry keeps its source tab and source key so the UI can explain
// where a value came from, per the sheet-driven architecture spec (docs/sheet-driven-architecture.md).
//
// In mock mode every catalog is built from src/fixtures.js. A future
// GoogleSheetsRepository would build the same shape from real sheet rows instead;
// nothing downstream needs to change to accept that.
import { bossOptions, presets, difficultyFactorPresetData } from "./fixtures.js";

function entries(values, { sourceTab, label } = {}) {
  return values.map((value) => ({
    value,
    label: typeof label === "function" ? label(value) : value,
    sourceTab,
    sourceKey: value,
  }));
}

export function buildReferenceCatalog() {
  return {
    bosses: bossOptions.map(({ value, label }) => ({ value, label, sourceTab: "BossConfig", sourceKey: value })),
    arenas: presets.arenas.map(({ value, label }) => ({ value, label, sourceTab: "ArenaConfig", sourceKey: value })),
    wavePresets: entries(presets.waves, { sourceTab: "WavePresetsConfig" }),
    rewardPresets: entries(presets.rewards, { sourceTab: "ChallengeRewardsConfig" }),
    dropTiers: entries(presets.drops, { sourceTab: "DropTierConfig" }),
    playerGroupPresets: entries(presets.groups, { sourceTab: "PlayerGroupPresetsConfig" }),
    difficultyPresets: entries(presets.difficultyFactors, {
      sourceTab: "ChallengeDifficultyFactorPresets",
      label: (value) => value,
    }).map((entry) => ({ ...entry, details: difficultyFactorPresetData[entry.value] || null })),
    eventGraphics: entries(presets.eventGraphics, { sourceTab: "ChallengeSetupConfig" }),
    badgeBackgrounds: entries(presets.badgeBackgrounds, { sourceTab: "ChallengeSetupConfig" }),
    immunityIcons: entries(presets.immunityIcons, { sourceTab: "ChallengeSetupConfig" }),
    challengeDescriptions: entries(presets.descriptions, { sourceTab: "ChallengeSetupConfig" }),
    syncedAt: new Date().toISOString(),
  };
}
