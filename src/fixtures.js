export { brackets } from "./domain.js";

const bossNames = [
  "Scarred Orc",
  "Poisonous Orc",
  "Stone Skin Orc",
  "Eyeless Behemoth",
  "Acid Behemoth",
  "Ashen Behemoth",
  "Orc Chieftain",
  "Orc Bellwether",
  "Orc Warmaster",
  "Vile Wizard",
  "Soulless Wizard",
  "Nefarious Wizard",
  "Possessed Hound",
  "Crimson Hound",
  "Infernal Hound",
  "The Princess",
  "Demonic Nymph",
  "Blood Diva",
  "Punisher",
  "Crusher",
  "Skull Smasher",
  "Undead Marshal",
  "Hell's Guardian",
  "Dark End",
  "Orkish Outcast",
  "Banned Brute",
  "Cursed Orc",
  "Infernal Beast",
  "Hellfire Beast",
  "Soul Devourer",
  "Revenant Assassin",
  "Shadow Striker",
  "Stealth Assassin",
  "Savage Lurker",
  "Forgotten Maw",
  "Wild Fang",
  "Bone Sorcerer",
  "Skull Reaper",
  "Razor-Clawed Recluse",
  "Chaos Minion",
  "The Mangler",
  "Corrupt Templar",
  "Firestorm",
  "Acid Spitter",
  "Darkness Sower",
  "Cursed Knight",
  "Fallen Paladin",
  "Savage Spawn",
  "Blind Fury",
  "Monstrous Pincer",
  "Dark Pawn",
  "White Terror",
  "Hellbringer",
  "Creeping Atrocity",
  "Evil Nucleus",
  "Damned Legion",
  "The Pest",
  "Dark Herald",
  "Killer Claw",
  "Lumbering Maw",
  "Primal Rage",
  "Flesh Eater",
  "Lord of Ashes",
  "Hunter Orc",
  "Treerot Thornbark",
  "Forest Wrath",
  "Deadly Root",
  "Mortal Shadow",
  "Lethal Instinct",
  "Hellmage",
  "Death Embracer",
  "Doom Harbringer",
  "Necrodaemon",
  "Deadly Horns",
  "Shackled Beast",
  "Walking Desecration",
  "Bloody Defiance",
  "Dark Profanity",
];

function bossId(name) {
  return name
    .replaceAll("'", "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

export const bossOptions = bossNames.map((label) => ({ label, value: bossId(label) }));

// Full ChallengeDifficultyFactorPresets STAGE config, transcribed column-for-column from the sheet.
// Column order matches the sheet header exactly, left to right (name is the row key).
export const difficultyFactorColumns = [
  "spread", "minFactor", "maxFactor", "iapFactor", "spent24h", "spent7d",
  "damageToHealthRatio", "statModifierMultiplier", "bossDamageMultiplier", "bossDamageMin", "bossDamageMax",
  "bossResistMultiplier", "maxSpawnModifier", "spawnsMin", "spawnsMax",
  "desiredAverageCP", "minPlayersToCalculateRealAverage",
  "bossDefenceModifier", "bossDefenceMin", "bossDefenceMax",
];

const difficultyFactorRows = {
  "30low": [0.2, 0.4, 1.45, 0.8, 3, 20, 2, 0.5, 0.5, 0.75, 1.5, 0, 0.62, 0.63, 1.28, 25000, 15, 0.5, 0.75, 1.5],
  "30high": [0.2, 0.5, 1.55, 0.7, 6, 30, 1.6, 0.5, 0.5, 0.75, 1.5, 0, 0.64, 0.68, 1.35, 42000, 15, 0.5, 0.75, 1.5],
  "40low": [0.2, 0.4, 1.5, 0.7, 8, 40, 1.5, 0.5, 0.5, 0.75, 1.5, 0, 0.62, 0.63, 1.31, 56000, 15, 0.5, 0.75, 1.5],
  "40high": [0.2, 0.4, 1.65, 0.7, 15, 70, 1.4, 0.5, 0.5, 0.75, 1.5, 0, 0.57, 0.66, 1.37, 124000, 15, 0.5, 0.75, 1.5],
  "50low": [0.2, 0.5, 1.35, 0.7, 10, 65, 1.3, 0.5, 0.5, 0.75, 1.5, 0, 0.6, 0.7, 1.21, 109000, 15, 0.5, 0.75, 1.5],
  "50mid": [0.2, 0.5, 1.4, 0.7, 15, 100, 1.2, 0.5, 0.5, 0.75, 1.5, 0, 0.6, 0.7, 1.24, 182000, 15, 0.5, 0.75, 1.5],
  "50high": [0.2, 0.35, 1.95, 0.7, 25, 125, 1.1, 0.5, 0.5, 0.75, 1.5, 0, 0.46, 0.7, 1.44, 525000, 15, 0.5, 0.75, 1.5],
  "60low": [0.2, 0.55, 1.4, 0.7, 15, 80, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.2, 270000, 15, 0.5, 0.75, 1.5],
  "60mid": [0.2, 0.55, 1.45, 0.7, 20, 120, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.22, 478000, 15, 0.5, 0.75, 1.5],
  "60high": [0.2, 0.5, 1.65, 0.7, 25, 160, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.49, 0.76, 1.32, 970000, 15, 0.5, 0.75, 1.5],
  "70low": [0.2, 0.55, 1.4, 0.7, 20, 100, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.2, 928000, 15, 0.5, 0.75, 1.5],
  "70mid": [0.2, 0.6, 1.4, 0.7, 25, 150, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.8, 1.2, 1780000, 15, 0.5, 0.75, 1.5],
  "70high": [0.2, 0.55, 1.35, 0.7, 35, 200, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.77, 1.18, 3760000, 12, 0.5, 0.75, 1.5],
  "70veryHigh": [0.2, 0.6, 2.4, 0.7, 50, 300, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.42, 0.83, 1.58, 13000000, 8, 0.5, 0.75, 1.5],
  "15mid": [0.2, 0.35, 1.7, 0.9, 2, 10, 2, 0.5, 0.5, 0.75, 1.5, 0, 0.93, 0.39, 1.65, 4300, 15, 0.5, 0.75, 1.5],
  "15mid_v2": [0.2, 0.35, 1.7, 0.9, 2, 10, 2, 0.5, 0.5, 0.75, 1.5, 0, 0.93, 0.39, 1.65, 4300, 15, 0.5, 0.75, 1.5],
  "20mid": [0.2, 0.3, 1.75, 0.75, 3, 15, 2, 0.5, 0.5, 0.75, 1.5, 0, 0.51, 0.64, 1.38, 11000, 15, 0.5, 0.75, 1.5],
  "20mid_v2": [0.2, 0.3, 1.75, 0.75, 3, 15, 2, 0.5, 0.5, 0.75, 1.5, 0, 0.51, 0.64, 1.38, 13000, 15, 0.5, 0.75, 1.5],
  "30low_d1": [0.2, 0.4, 1.45, 0.8, 3, 20, 2, 0.5, 0.5, 0.75, 1.5, 0, 0.62, 0.63, 1.28, 17800, 15, 0.5, 0.75, 1.5],
  "30low_d2": [0.2, 0.4, 1.45, 0.8, 3, 20, 2, 0.5, 0.5, 0.75, 1.5, 0, 0.62, 0.63, 1.28, 23900, 15, 0.5, 0.75, 1.5],
  "30low_d3": [0.2, 0.4, 1.45, 0.8, 3, 20, 2, 0.5, 0.5, 0.75, 1.5, 0, 0.62, 0.63, 1.28, 26700, 15, 0.5, 0.75, 1.5],
  "30high_d1": [0.2, 0.5, 1.55, 0.7, 6, 30, 1.6, 0.5, 0.5, 0.75, 1.5, 0, 0.64, 0.68, 1.35, 32400, 15, 0.5, 0.75, 1.5],
  "30high_d2": [0.2, 0.5, 1.55, 0.7, 6, 30, 1.6, 0.5, 0.5, 0.75, 1.5, 0, 0.64, 0.68, 1.35, 43000, 15, 0.5, 0.75, 1.5],
  "30high_d3": [0.2, 0.5, 1.55, 0.7, 6, 30, 1.6, 0.5, 0.5, 0.75, 1.5, 0, 0.64, 0.68, 1.35, 58700, 15, 0.5, 0.75, 1.5],
  "30high_v2_d1": [0.2, 0.5, 1.55, 0.7, 6, 30, 1.6, 0.5, 0.5, 0.75, 1.5, 0, 0.64, 0.68, 1.35, 34000, 15, 0.5, 0.75, 1.5],
  "30high_v2_d2": [0.2, 0.5, 1.55, 0.7, 6, 30, 1.6, 0.5, 0.5, 0.75, 1.5, 0, 0.64, 0.68, 1.35, 45400, 15, 0.5, 0.75, 1.5],
  "30high_v2_d3": [0.2, 0.5, 1.55, 0.7, 6, 30, 1.6, 0.5, 0.5, 0.75, 1.5, 0, 0.64, 0.68, 1.35, 65100, 15, 0.5, 0.75, 1.5],
  "40low_d1": [0.2, 0.4, 1.5, 0.7, 8, 40, 1.5, 0.5, 0.5, 0.75, 1.5, 0, 0.62, 0.63, 1.31, 46000, 15, 0.5, 0.75, 1.5],
  "40low_d2": [0.2, 0.4, 1.5, 0.7, 8, 40, 1.5, 0.5, 0.5, 0.75, 1.5, 0, 0.62, 0.63, 1.31, 55300, 15, 0.5, 0.75, 1.5],
  "40low_d3": [0.2, 0.4, 1.5, 0.7, 8, 40, 1.5, 0.5, 0.5, 0.75, 1.5, 0, 0.62, 0.63, 1.31, 61500, 15, 0.5, 0.75, 1.5],
  "40high_d1": [0.2, 0.4, 1.65, 0.7, 15, 70, 1.4, 0.5, 0.5, 0.75, 1.5, 0, 0.57, 0.66, 1.37, 85300, 15, 0.5, 0.75, 1.5],
  "40high_d2": [0.2, 0.4, 1.65, 0.7, 15, 70, 1.4, 0.5, 0.5, 0.75, 1.5, 0, 0.57, 0.66, 1.37, 107000, 15, 0.5, 0.75, 1.5],
  "40high_d3": [0.2, 0.4, 1.65, 0.7, 15, 70, 1.4, 0.5, 0.5, 0.75, 1.5, 0, 0.57, 0.66, 1.37, 145000, 15, 0.5, 0.75, 1.5],
  "40high_v2_d1": [0.2, 0.4, 1.65, 0.7, 15, 70, 1.4, 0.5, 0.5, 0.75, 1.5, 0, 0.57, 0.66, 1.37, 87600, 15, 0.5, 0.75, 1.5],
  "40high_v2_d2": [0.2, 0.4, 1.65, 0.7, 15, 70, 1.4, 0.5, 0.5, 0.75, 1.5, 0, 0.57, 0.66, 1.37, 115000, 15, 0.5, 0.75, 1.5],
  "40high_v2_d3": [0.2, 0.4, 1.65, 0.7, 15, 70, 1.4, 0.5, 0.5, 0.75, 1.5, 0, 0.57, 0.66, 1.37, 159000, 15, 0.5, 0.75, 1.5],
  "50low_d1": [0.2, 0.5, 1.35, 0.7, 10, 65, 1.3, 0.5, 0.5, 0.75, 1.5, 0, 0.6, 0.7, 1.21, 78000, 15, 0.5, 0.75, 1.5],
  "50low_d2": [0.2, 0.5, 1.35, 0.7, 10, 65, 1.3, 0.5, 0.5, 0.75, 1.5, 0, 0.6, 0.7, 1.21, 110000, 15, 0.5, 0.75, 1.5],
  "50low_d3": [0.2, 0.5, 1.35, 0.7, 10, 65, 1.3, 0.5, 0.5, 0.75, 1.5, 0, 0.6, 0.7, 1.21, 125000, 15, 0.5, 0.75, 1.5],
  "50mid_d1": [0.2, 0.5, 1.4, 0.7, 15, 100, 1.2, 0.5, 0.5, 0.75, 1.5, 0, 0.6, 0.7, 1.24, 152000, 15, 0.5, 0.75, 1.5],
  "50mid_d2": [0.2, 0.5, 1.4, 0.7, 15, 100, 1.2, 0.5, 0.5, 0.75, 1.5, 0, 0.6, 0.7, 1.24, 200000, 15, 0.5, 0.75, 1.5],
  "50mid_d3": [0.2, 0.5, 1.4, 0.7, 15, 100, 1.2, 0.5, 0.5, 0.75, 1.5, 0, 0.6, 0.7, 1.24, 228000, 15, 0.5, 0.75, 1.5],
  "50high_d1": [0.2, 0.35, 1.95, 0.7, 25, 125, 1.1, 0.5, 0.5, 0.75, 1.5, 0, 0.46, 0.7, 1.44, 285000, 15, 0.5, 0.75, 1.5],
  "50high_d2": [0.2, 0.35, 1.95, 0.7, 25, 125, 1.1, 0.5, 0.5, 0.75, 1.5, 0, 0.46, 0.7, 1.44, 367000, 15, 0.5, 0.75, 1.5],
  "50high_d3": [0.2, 0.35, 1.95, 0.7, 25, 125, 1.1, 0.5, 0.5, 0.75, 1.5, 0, 0.46, 0.7, 1.44, 416000, 15, 0.5, 0.75, 1.5],
  "50high_v2_d1": [0.2, 0.35, 1.95, 0.7, 25, 125, 1.1, 0.5, 0.5, 0.75, 1.5, 0, 0.46, 0.7, 1.44, 305000, 15, 0.5, 0.75, 1.5],
  "50high_v2_d2": [0.2, 0.35, 1.95, 0.7, 25, 125, 1.1, 0.5, 0.5, 0.75, 1.5, 0, 0.46, 0.7, 1.44, 411000, 15, 0.5, 0.75, 1.5],
  "50high_v2_d3": [0.2, 0.35, 1.95, 0.7, 25, 125, 1.1, 0.5, 0.5, 0.75, 1.5, 0, 0.46, 0.7, 1.44, 479000, 15, 0.5, 0.75, 1.5],
  "60low_d1": [0.2, 0.55, 1.4, 0.7, 15, 80, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.2, 174000, 15, 0.5, 0.75, 1.5],
  "60low_d2": [0.2, 0.55, 1.4, 0.7, 15, 80, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.2, 252000, 15, 0.5, 0.75, 1.5],
  "60low_d3": [0.2, 0.55, 1.4, 0.7, 15, 80, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.2, 327000, 15, 0.5, 0.75, 1.5],
  "60mid_d1": [0.2, 0.55, 1.45, 0.7, 20, 120, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.22, 357000, 15, 0.5, 0.75, 1.5],
  "60mid_d2": [0.2, 0.55, 1.45, 0.7, 20, 120, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.22, 475000, 15, 0.5, 0.75, 1.5],
  "60mid_d3": [0.2, 0.55, 1.45, 0.7, 20, 120, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.22, 610000, 15, 0.5, 0.75, 1.5],
  "60high_d1": [0.2, 0.5, 1.65, 0.7, 25, 160, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.49, 0.76, 1.32, 755000, 15, 0.5, 0.75, 1.5],
  "60high_d2": [0.2, 0.5, 1.65, 0.7, 25, 160, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.49, 0.76, 1.32, 980000, 15, 0.5, 0.75, 1.5],
  "60high_d3": [0.2, 0.5, 1.65, 0.7, 25, 160, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.49, 0.76, 1.32, 1180000, 15, 0.5, 0.75, 1.5],
  "60high_v2_d1": [0.2, 0.5, 1.65, 0.7, 25, 160, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.49, 0.76, 1.32, 782000, 15, 0.5, 0.75, 1.5],
  "60high_v2_d2": [0.2, 0.5, 1.65, 0.7, 25, 160, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.49, 0.76, 1.32, 1020000, 15, 0.5, 0.75, 1.5],
  "60high_v2_d3": [0.2, 0.5, 1.65, 0.7, 25, 160, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.49, 0.76, 1.32, 1220000, 15, 0.5, 0.75, 1.5],
  "70low_d1": [0.2, 0.55, 1.4, 0.7, 20, 100, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.2, 1075000, 15, 0.5, 0.75, 1.5],
  "70low_d2": [0.2, 0.55, 1.4, 0.7, 20, 100, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.2, 649000, 15, 0.5, 0.75, 1.5],
  "70low_d3": [0.2, 0.55, 1.4, 0.7, 20, 100, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.2, 912000, 15, 0.5, 0.75, 1.5],
  "70low_v2_d1": [0.2, 0.55, 1.4, 0.7, 20, 100, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.2, 474000, 15, 0.5, 0.75, 1.5],
  "70low_v2_d2": [0.2, 0.55, 1.4, 0.7, 20, 100, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.2, 696000, 15, 0.5, 0.75, 1.5],
  "70low_v2_d3": [0.2, 0.55, 1.4, 0.7, 20, 100, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.2, 876000, 15, 0.5, 0.75, 1.5],
  "70low_v2_d4": [0.2, 0.55, 1.4, 0.7, 20, 100, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.2, 1030000, 15, 0.5, 0.75, 1.5],
  "70low_v2_d5": [0.2, 0.55, 1.4, 0.7, 20, 100, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.78, 1.2, 1240000, 15, 0.5, 0.75, 1.5],
  "70mid_d1": [0.2, 0.6, 1.4, 0.7, 25, 150, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.8, 1.2, 2126000, 15, 0.5, 0.75, 1.5],
  "70mid_d2": [0.2, 0.6, 1.4, 0.7, 25, 150, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.8, 1.2, 1468000, 15, 0.5, 0.75, 1.5],
  "70mid_d3": [0.2, 0.6, 1.4, 0.7, 25, 150, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.8, 1.2, 1568000, 15, 0.5, 0.75, 1.5],
  "70mid_v2_d1": [0.2, 0.6, 1.4, 0.7, 25, 150, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.8, 1.2, 935000, 15, 0.5, 0.75, 1.5],
  "70mid_v2_d2": [0.2, 0.6, 1.4, 0.7, 25, 150, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.8, 1.2, 1200000, 15, 0.5, 0.75, 1.5],
  "70mid_v2_d3": [0.2, 0.6, 1.4, 0.7, 25, 150, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.8, 1.2, 1570000, 15, 0.5, 0.75, 1.5],
  "70mid_v2_d4": [0.2, 0.6, 1.4, 0.7, 25, 150, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.8, 1.2, 2070000, 15, 0.5, 0.75, 1.5],
  "70mid_v2_d5": [0.2, 0.6, 1.4, 0.7, 25, 150, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.8, 1.2, 2720000, 15, 0.5, 0.75, 1.5],
  "70high_d1": [0.2, 0.55, 1.35, 0.7, 35, 200, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.77, 1.18, 4327000, 12, 0.5, 0.75, 1.5],
  "70high_d2": [0.2, 0.55, 1.35, 0.7, 35, 200, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.77, 1.18, 3135000, 12, 0.5, 0.75, 1.5],
  "70high_d3": [0.2, 0.55, 1.35, 0.7, 35, 200, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.77, 1.18, 3804000, 12, 0.5, 0.75, 1.5],
  "70high_v2_d1": [0.2, 0.55, 1.35, 0.7, 35, 200, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.77, 1.18, 2270000, 12, 0.5, 0.75, 1.5],
  "70high_v2_d2": [0.2, 0.55, 1.35, 0.7, 35, 200, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.77, 1.18, 2680000, 12, 0.5, 0.75, 1.5],
  "70high_v2_d3": [0.2, 0.55, 1.35, 0.7, 35, 200, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.77, 1.18, 3420000, 12, 0.5, 0.75, 1.5],
  "70high_v2_d4": [0.2, 0.55, 1.35, 0.7, 35, 200, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.77, 1.18, 4530000, 12, 0.5, 0.75, 1.5],
  "70high_v2_d5": [0.2, 0.55, 1.35, 0.7, 35, 200, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.5, 0.77, 1.18, 5650000, 12, 0.5, 0.75, 1.5],
  "70veryHigh_d1": [0.2, 0.6, 2.4, 0.7, 50, 300, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.42, 0.83, 1.58, 8245000, 8, 0.5, 0.75, 1.5],
  "70veryHigh_d2": [0.2, 0.6, 2.4, 0.7, 50, 300, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.42, 0.83, 1.58, 6600000, 8, 0.5, 0.75, 1.5],
  "70veryHigh_d3": [0.2, 0.6, 2.4, 0.7, 50, 300, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.42, 0.83, 1.58, 7497000, 8, 0.5, 0.75, 1.5],
  "70veryHigh_v2_d1": [0.2, 0.6, 2.4, 0.7, 50, 300, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.42, 0.83, 1.58, 6890000, 8, 0.5, 0.75, 1.5],
  "70veryHigh_v2_d2": [0.2, 0.6, 2.4, 0.7, 50, 300, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.42, 0.83, 1.58, 8150000, 8, 0.5, 0.75, 1.5],
  "70veryHigh_v2_d3": [0.2, 0.6, 2.4, 0.7, 50, 300, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.42, 0.83, 1.58, 11000000, 8, 0.5, 0.75, 1.5],
  "70veryHigh_v2_d4": [0.2, 0.6, 2.4, 0.7, 50, 300, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.42, 0.83, 1.58, 13300000, 8, 0.5, 0.75, 1.5],
  "70veryHigh_v2_d5": [0.2, 0.6, 2.4, 0.7, 50, 300, 1, 0.5, 0.5, 0.75, 1.5, 0, 0.42, 0.83, 1.58, 14500000, 8, 0.5, 0.75, 1.5],
  "disabled": [0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 0.9, 1.1, 1, 1, 1, 1, 1],
};

// Full per-preset data, keyed by column name, e.g. difficultyFactorPresetData["50high_d3"].desiredAverageCP.
export const difficultyFactorPresetData = Object.fromEntries(
  Object.entries(difficultyFactorRows).map(([name, values]) => [
    name,
    Object.fromEntries(difficultyFactorColumns.map((column, index) => [column, values[index]])),
  ]),
);

// Preset names from the ChallengeDifficultyFactorPresets STAGE config. Keep in sync with that sheet;
// this is the exact and only set of keys DifficultyFactorPreset may hold.
export const difficultyFactorPresets = Object.keys(difficultyFactorRows);

// Suggested DifficultyFactorPreset per level bracket: the preset that best matches a
// fresh challenge in that bracket. Only used to pre-fill the field when the bracket
// changes; the value stays a normal dropdown choice and can always be overridden.
export const defaultDifficultyFactorPresetByBracket = {
  "15-19": "15mid",
  "20-29": "20mid",
  "30-39": "30high_d2",
  "40-49": "40high_d2",
  "50-59": "50high_d3",
  "60-69": "60high_d2",
  "70-90": "70high_d3",
};

// DropTier filled in whenever the level bracket changes; the user can still pick another tier.
export const defaultDropTierByBracket = {
  "15-19": "DC_Level10",
  "20-29": "DC_Level20",
  "30-39": "DC_Level30",
  "40-49": "DC_Level40",
  "50-59": "DC_Level50",
  "60-69": "DC_Level69",
  "70-90": "DC_Level70",
};

// Distinct WavePreset keys from existing ChallengeSetupConfig rows, grouped as: the base preset per
// boss or Last Stand arena, its _V1-_V5 and 70Diff1-3 variants, then the level/difficulty presets
// that only ScarredOrc, OrkishOutcast and OrcChieftain have.
const waveBosses = [
  "ScarredOrc", "PoisonousOrc", "StoneSkinOrc", "OrkishOutcast", "BannedBrute", "CursedOrc", "OrcChieftain", "OrcBellwether",
  "OrcWarmaster", "PosessedHound", "InfernalHound", "CrimsonHound", "RevenantAssassin", "ShadowStriker", "StealthAssassin",
  "Necrodaemon", "ShackledBeast", "DeadlyHorns", "HunterOrc", "LethalInstinct", "MortalShadow", "Punisher", "SkullSmasher",
  "Crusher", "RazorClawedRecluse", "KillerClaw", "WhiteTerror", "SavageLurker", "WildFang", "ForgottenMaw", "WalkingDesecration",
  "BloodyDefiance", "DarkProfanity", "VileWizard", "NefariousWizard", "SoullessWizard",
  "LastStand_Forest", "LastStand_RockyFields", "LastStand_DarkTemple", "LastStand_Graveyard", "LastStand_Cave",
];
const waveLevelPresets = (boss) => [
  `${boss}15`, `${boss}20`,
  ...[[30, ["d11", "d22", "d33"], 2], [40, ["d11", "d22", "d33"], 2], [50, ["d11", "d22", "d33"], 3], [60, ["d11", "d22", "d33"], 3],
    [70, ["d11", "d22", "d33", "d44", "d55"], 4]]
    .flatMap(([level, difficulties, variants]) => difficulties.flatMap((difficulty) =>
      Array.from({ length: variants }, (_, index) => `${boss}${level}_${difficulty}_v${index + 1}`))),
];
const wavePresets = [
  ...waveBosses,
  ...["_V1", "_V2", "_V3", "_V4", "_V5", "70Diff1", "70Diff2", "70Diff3"].flatMap((suffix) => waveBosses.map((boss) => `${boss}${suffix}`)),
  ...["ScarredOrc", "OrkishOutcast", "OrcChieftain"].flatMap(waveLevelPresets),
];

export const presets = {
  bosses: [...bossOptions.map((option) => option.value), "FrostWarden", "EmberQueen", "IronGolem"],
  // Arena keys stay as stored in the sheet; only the label is spelled out for reading.
  arenas: [
    { value: "Forest", label: "Forest" }, { value: "DarkTemple", label: "Dark Temple" }, { value: "Graveyard", label: "Graveyard" },
    { value: "Cave", label: "Cave" }, { value: "Rockyfields", label: "Rockyfields" },
  ],
  waves: wavePresets,
  rewards: ["ColdReward50_D3_V3", "BronzeStage", "SilverStage", "GoldStage", "MythicStage"],
  groups: ["Solo", "Duo", "Squad", "Guild"],
  drops: ["DC_Level10", "DC_Level20", "DC_Level30", "DC_Level40", "DC_Level50", "DC_Level60", "DC_Level69", "DC_Level70"],
  difficultyFactors: difficultyFactorPresets,
  // EventGraphicURL values used by existing ChallengeSetupConfig rows (boss portraits, then arena images).
  eventGraphics: [
    "challenge/ui_img_orc_chieftain_1.png", "challenge/ui_img_orc_chieftain_2.png", "challenge/ui_img_orc_chieftain_3.png",
    "challenge/ui_img_orkish_outcast_1.png", "challenge/ui_img_orkish_outcast_2.png", "challenge/ui_img_orkish_outcast_3.png",
    "challenge/ui_img_punisher_1.png", "challenge/ui_img_punisher_2.png", "challenge/ui_img_punisher_3.png",
    "challenge/ui_img_vile_wizard_1.png", "challenge/ui_img_vile_wizard_2.png", "challenge/ui_img_vile_wizard_3.png",
    "challenge/ui_img_scarred_orc_1.png", "challenge/ui_img_scarred_orc_2.png", "challenge/ui_img_scarred_orc_3.png",
    "challenge/ui_image_savage_lurker_1.png", "challenge/ui_image_savage_lurker_2.png", "challenge/ui_image_savage_lurker_3.png",
    "challenge/ui_img_possessed_hound_1.png", "challenge/ui_img_possessed_hound_2.png", "challenge/ui_img_possessed_hound_3.png",
    "challenge/ui_img_hunter_orc_1.png", "challenge/ui_img_hunter_orc_2.png", "challenge/ui_img_hunter_orc_3.png",
    "challenge/ui_img_necrodaemon_1.png", "challenge/ui_img_necrodaemon_2.png", "challenge/ui_img_necrodaemon_3.png",
    "challenge/ui_img_revenant_assassin_1.png", "challenge/ui_img_revenant_assassin_2.png", "challenge/ui_img_revenant_assassin_3.png",
    "challenge/ui_img_razor_clawed_recluse_1.png", "challenge/ui_img_razor_clawed_recluse_2.png", "challenge/ui_img_razor_clawed_recluse_3.png",
    "challenge/ui_img_walking_desecration_1.png", "challenge/ui_img_walking_desecration_2.png", "challenge/ui_img_walking_desecration_3.png",
    "challenge/ui_image_dark_temple.png", "challenge/ui_image_forest.png", "challenge/ui_image_rocky_fields.png",
    "challenge/ui_image_graveyard.png", "challenge/ui_image_cave.png",
  ],
  // BadgeBackgroundURL values used by existing ChallengeSetupConfig rows (boss badges, then arena badges).
  badgeBackgrounds: [
    "challenge/badge_image_orc_chieftain_1.png", "challenge/badge_image_orc_chieftain_2.png", "challenge/badge_image_orc_chieftain_3.png",
    "challenge/badge_image_orkish_outcast_1.png", "challenge/badge_image_orkish_outcast_2.png", "challenge/badge_image_orkish_outcast_3.png",
    "challenge/badge_image_punisher_1.png", "challenge/badge_image_punisher_2.png", "challenge/badge_image_punisher_3.png",
    "challenge/badge_image_vile_wizard_1.png", "challenge/badge_image_vile_wizard_2.png", "challenge/badge_image_vile_wizard_3.png",
    "challenge/badge_image_scarred_orc_1.png", "challenge/badge_image_scarred_orc_2.png", "challenge/badge_image_scarred_orc_3.png",
    "challenge/badge_image_savage_lurker_1.png", "challenge/badge_image_savage_lurker_2.png", "challenge/badge_image_savage_lurker_3.png",
    "challenge/badge_image_possessed_hound_1.png", "challenge/badge_image_possessed_hound_2.png", "challenge/badge_image_possessed_hound_3.png",
    "challenge/badge_image_hunter_orc_1.png", "challenge/badge_image_hunter_orc_2.png", "challenge/badge_image_hunter_orc_3.png",
    "challenge/badge_image_necrodaemon_1.png", "challenge/badge_image_necrodaemon_2.png", "challenge/badge_image_necrodaemon_3.png",
    "challenge/badge_image_revenant_assassin_1.png", "challenge/badge_image_revenant_assassin_2.png", "challenge/badge_image_revenant_assassin_3.png",
    "challenge/badge_image_clawed_recluse_1.png", "challenge/badge_image_clawed_recluse_2.png", "challenge/badge_image_clawed_recluse_3.png",
    "challenge/badge_image_walking_desecration_1.png", "challenge/badge_image_walking_desecration_2.png", "challenge/badge_image_walking_desecration_3.png",
    "challenge/badge_image_dark_temple.png", "challenge/badge_image_forest.png", "challenge/badge_image_rocky_fields.png",
    "challenge/badge_image_graveyard.png", "challenge/badge_image_cave.png",
  ],
  // Distinct ChallengeDescription localization keys from existing ChallengeSetupConfig rows, in boss
  // roster order (as in WavePreset) with the Last Stand key last. The test value DominikTest1 is left out.
  descriptions: [
    "IDS_Scarred_Orc_Description", "IDS_Poisonous_Orc_Description", "IDS_Stone_Skin_Orc_Description", "IDS_Orkish_Outcast_Description",
    "IDS_Banned_Brute_Description", "IDS_Cursed_Orc_Description", "IDS_Orc_Chieftain_Description", "IDS_Orc_Bellwether_Description",
    "IDS_Orc_Warmaster_Description", "IDS_Possessed_Hound_Description", "IDS_Infernal_Hound_Description", "IDS_Crimson_Hound_Description",
    "IDS_Revenant_Assassin_Description", "IDS_Shadow_Striker_Description", "IDS_Stealth_Assassin_Description", "IDS_Necrodaemon_Description",
    "IDS_Shackled_Beast_Description", "IDS_Deadly_Horns_Description", "IDS_Hunter_Orc_Description", "IDS_Lethal_Instinct_Description",
    "IDS_Mortal_Shadow_Description", "IDS_Punisher_Description", "IDS_Skull_Smasher_Description", "IDS_Crusher_Description",
    "IDS_Razor-Clawed_Recluse_Description", "IDS_Killer_Claw_Description", "IDS_White_Terror_Description", "IDS_Savage_Lurker_Description",
    "IDS_Wild_Fang_Description", "IDS_Forgotten_Maw_Description", "IDS_Walking_Desecration_Description", "IDS_Bloody_Defiance_Description",
    "IDS_Dark_Profanity_Description", "IDS_Vile_Wizard_Description", "IDS_Nefarious_Wizard_Description", "IDS_Soulless_Wizard_Description",
    "IDS_LS_Description",
  ],
  // ImmuneIconsInChallengeDescription keys; a challenge may list several.
  immunityIcons: ["Physical", "Cold", "Fire", "Poison"],
};

const fixtureChallenges = [
  {
    id: "ScarredOrcTest",
    status: "Scheduled",
    identity: {
      competitionGroup: "orc-stage",
      displayName: "Scarred Orc Trial",
      targetName: "Scarred Orc",
      description: "Internal STAGE challenge for validating the orc boss event.",
    },
    eligibility: { minLevel: 40, maxLevel: 49, minCP: 12000, maxCP: 26000 },
    content: { modeId: 0, bossId: "ScarredOrc", arena: "RuinedKeep", wavePreset: "Standard3" },
    timing: { durationHours: 24, attemptDurationSeconds: 180, timerPerWave: 60 },
    rewards: { rewardPreset: "SilverStage", dropTier: "T2", materialDropVariant: "OrcHide" },
    players: { groupPreset: "Duo", minRequired: 1, players: 2, hardLimit: 2 },
    visuals: {
      eventGraphicUrl: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=640&q=80",
      badgeBackgroundUrl: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=640&q=80",
      immuneIcons: ["bleed", "stun"],
    },
    advanced: { difficultyFactorPreset: "40low_d2", minutesLeftToUseHardLimit: 15 },
  },
  {
    id: "FrostWarden70",
    status: "Ready",
    identity: {
      competitionGroup: "winter-stage",
      displayName: "Frost Warden Lockdown",
      targetName: "Frost Warden",
      description: "High-level bracket smoke test for reward and ranking tuning.",
    },
    eligibility: { minLevel: 70, maxLevel: 90, minCP: 38000, maxCP: 95000 },
    content: { modeId: 1, bossId: "FrostWarden", arena: "GlacierGate", wavePreset: "Elite5" },
    timing: { durationHours: 48, attemptDurationSeconds: 240, timerPerWave: 75 },
    rewards: { rewardPreset: "GoldStage", dropTier: "T3", materialDropVariant: "FrostCore" },
    players: { groupPreset: "Squad", minRequired: 2, players: 4, hardLimit: 4 },
    visuals: {
      eventGraphicUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=640&q=80",
      badgeBackgroundUrl: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=640&q=80",
      immuneIcons: ["freeze"],
    },
    advanced: { difficultyFactorPreset: "70high_d3", minutesLeftToUseHardLimit: 20 },
  },
  {
    id: "EmberQueenDraft",
    status: "Draft",
    identity: {
      competitionGroup: "ember-stage",
      displayName: "Ember Queen Draft",
      targetName: "Ember Queen",
      description: "Draft event for tuning fire immunity messaging.",
    },
    eligibility: { minLevel: 50, maxLevel: 59, minCP: 21000, maxCP: 42000 },
    content: { modeId: 0, bossId: "EmberQueen", arena: "ForgeYard", wavePreset: "Endurance7" },
    timing: { durationHours: 24, attemptDurationSeconds: 210, timerPerWave: 65 },
    rewards: { rewardPreset: "SilverStage", dropTier: "T2", materialDropVariant: "AshShard" },
    players: { groupPreset: "Solo", minRequired: 1, players: 1, hardLimit: 1 },
    visuals: {
      eventGraphicUrl: "https://images.unsplash.com/photo-1496523720220-b62e33cf3161?auto=format&fit=crop&w=640&q=80",
      badgeBackgroundUrl: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=640&q=80",
      immuneIcons: ["burn"],
    },
    advanced: { difficultyFactorPreset: "50mid_d2", minutesLeftToUseHardLimit: 10 },
  },
];

const fixtureCalendar = {
  "2026-09": {
    14: { "40-49": [{ startUtc: "19:00", challengeId: "ScarredOrcTest" }] },
    18: { "70-90": [{ startUtc: "18:00", challengeId: "FrostWarden70" }] },
    22: {
      "40-49": [
        { startUtc: "15:00", challengeId: "LegacySpider" },
        { startUtc: "20:00", challengeId: "ScarredOrcTest" },
      ],
    },
  },
};

export function createStore() {
  return {
    revision: 0,
    challenges: structuredClone(fixtureChallenges),
    calendar: structuredClone(fixtureCalendar),
    history: [
      { id: "STAGE-1182", challengeId: "ScarredOrcTest", status: "Success", time: "2026-09-13 18:24 UTC", initiator: "Fixture", log: "Historical fixture; no external build was triggered." },
      { id: "STAGE-1177", challengeId: "FrostWarden70", status: "Success", time: "2026-09-10 11:06 UTC", initiator: "Fixture", log: "Historical fixture; no external build was triggered." },
    ],
  };
}
