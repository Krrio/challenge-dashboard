// Example row and column order transcribed from the supplied spreadsheet PDF.
export const spreadsheetChallenge = {
  id: "RevenantAssassin50_D3_V3", status: "Draft",
  identity: {
    competitionGroup: "Revenant Assassin", displayName: "IDS_DC_Title_Knives_Out",
    targetName: "Revenant Assassin", description: "IDS_Revenant_Assassin_Description",
  },
  eligibility: { minLevel: 50, maxLevel: 59, minCP: 350000, maxCP: 2650000000 },
  content: { modeId: 0, bossId: "RevenantAssassin", arena: "DarkTemple", wavePreset: "RevenantAssassin_V3" },
  timing: { durationHours: 24, attemptDurationSeconds: 480, timerPerWave: "" },
  rewards: { rewardPreset: "ColdReward50_D3_V3", dropTier: "DC_Level50", materialDropVariant: "16" },
  players: { groupPreset: "", minRequired: 15, players: 35, hardLimit: 50 },
  visuals: {
    eventGraphicUrl: "challenge/ui_img_revenant_assassin_1.png",
    badgeBackgroundUrl: "challenge/badge_image_revenant_assassin_1.png", immuneIcons: ["Cold"],
  },
  advanced: {
    attemptPrices: "1,1,2,3,4", npcLevelMultiplier: 1, minutesInactive: 60,
    minInactivePlayers: 0, maxInactivePlayers: 0, separateLevels: false,
    minNpcLevelVariance: 0.9, maxNpcLevelVariance: 1.1,
    positionRankingMultiplier: 14.9, rankingScoreMultiplier: 0.7831,
    difficultyFactorPreset: "50high_d3", minutesLeftToUseHardLimit: 300,
  },
};

export const spreadsheetRow = {
  CompetitionID: "RevenantAssassin50_D3_V3", CompetitionGroup: "Revenant Assassin",
  "Min Level": 50, "Max Level": 59, "Min CP": 350000, "Max CP": 2650000000,
  ModeID: 0, BossID: "RevenantAssassin", DisplayName: "IDS_DC_Title_Knives_Out",
  TargetName: "Revenant Assassin", ChallengeDescription: "IDS_Revenant_Assassin_Description",
  EventGraphicURL: "challenge/ui_img_revenant_assassin_1.png", ImmuneIconsInChallengeDescription: "Cold",
  BadgeBackgroundURL: "challenge/badge_image_revenant_assassin_1.png",
  RewardPreset: "ColdReward50_D3_V3", Arena: "DarkTemple", WavePreset: "RevenantAssassin_V3",
  "Duration (h)": 24, "AttemptDuration(s)": 480, TimerPerWave: "", AttemptPrices: "1,1,2,3,4",
  NpcLevelMultiplier: 1, PlayersGroupPreset: "", MinPlayersRequired: 15, Players: 35,
  PlayersHardLimit: 50, MinutesInactive: 60, MinInactivePlayers: 0, MaxInactivePlayers: 0,
  SeparateLevels: 0, MinNpcLevelVariance: 0.9, MaxNpcLevelVariance: 1.1,
  DropTier: "DC_Level50", MaterialDropVariant: "16", PositionRankingMultiplier: 14.9,
  RankingScoreMultiplier: 0.7831, DifficultyFactorPreset: "50high_d3", MinutesLeftToUseHardLimit: 300,
};
