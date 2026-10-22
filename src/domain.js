// ChallengeCalendar level-bracket columns. They describe the sheet layout rather than a reference
// catalog, so they live with the domain rules; fixtures.js re-exports them for the mock seed.
export const brackets = ["15-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-90"];
// ModeID values the game understands: 0 regular challenge ending with a boss, 1 Last Stand.
export const modeIds = [0, 1];

export function monthDays(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return 0;
  const [year, number] = month.split("-").map(Number);
  if (year < 1000 || year > 9999) return 0;
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
}

export function bracketForRange(min, max) {
  return brackets.find((bracket) => bracket === `${min}-${max}`);
}

export function isValidUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function isAssetPath(value) {
  return typeof value === "string" && value.includes("/") &&
    value.split("/").every((part) => /^[A-Za-z0-9_.-]+$/.test(part) && part !== "." && part !== "..");
}

export function parseDecimalInput(value) {
  const text = value.trim();
  if (!text) return "";
  const normalized = text.replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : value;
}

export function getCellEntries(calendar, schedule) {
  const entries = calendar[schedule.month]?.[schedule.day]?.[schedule.levelBracket];
  return Array.isArray(entries) ? entries : [];
}

const sameEntry = (a, b) => a.challengeId === b.challengeId && a.startUtc === b.startUtc;
const sameCell = (a, b) => a.month === b.month && a.day === b.day && a.levelBracket === b.levelBracket;
const sameSchedule = (a, b) => sameCell(a, b) && sameEntry(a, b);

export function appendEntry(entries, entry) {
  return entries.some((item) => sameEntry(item, entry))
    ? structuredClone(entries)
    : [...structuredClone(entries), { startUtc: entry.startUtc, challengeId: entry.challengeId }];
}

export function calendarMutations(calendar, schedule) {
  const cells = [];
  const previous = schedule.previous;
  if (previous && !sameCell(previous, schedule)) {
    const before = getCellEntries(calendar, previous);
    const after = before.filter((entry) => !sameEntry(entry, previous));
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      cells.push({ ...previous, before: structuredClone(before), after: structuredClone(after) });
    }
  }
  const before = getCellEntries(calendar, schedule);
  let remaining = before;
  if (previous && sameCell(previous, schedule) && !sameEntry(previous, schedule)) {
    remaining = before.filter((entry) => !sameEntry(entry, previous));
  }
  const after = appendEntry(remaining, schedule);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    cells.push({ month: schedule.month, day: schedule.day, levelBracket: schedule.levelBracket, before: structuredClone(before), after });
  }
  return cells;
}

export function calendarEntries(calendar) {
  return Object.entries(calendar).flatMap(([month, days]) =>
    Object.entries(days).flatMap(([day, columns]) =>
      Object.entries(columns).flatMap(([levelBracket, entries]) =>
        entries.map((entry) => ({ ...entry, month, day: Number(day), levelBracket })),
      ),
    ),
  );
}

export function scheduleTimestamp(schedule) {
  return Date.parse(`${schedule.month}-${String(schedule.day).padStart(2, "0")}T${schedule.startUtc}:00Z`);
}

export function nextStart(calendar, challengeId, now = Date.now()) {
  return calendarEntries(calendar)
    .filter((entry) => entry.challengeId === challengeId && scheduleTimestamp(entry) >= now)
    .sort((a, b) => scheduleTimestamp(a) - scheduleTimestamp(b))[0] || null;
}

export function identityErrors(challenge, challenges = [], originalId = "") {
  const id = challenge?.id;
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id) || ["constructor", "prototype", "__proto__"].includes(id)) {
    return [{ severity: "error", field: "id", text: "Challenge ID must be 1-128 letters, digits, underscores or hyphens, starting with a letter or digit." }];
  }
  if (challenges.some((item) => item.id === id && item.id !== originalId)) {
    return [{ severity: "error", field: "id", text: "This Challenge ID is already in use. Choose a unique ID." }];
  }
  return [];
}

export function validateChallenge(challenge, schedule = null, context = {}) {
  const { challenges = [], calendar = {}, originalId = challenge?.id, now = Date.now() } = context;
  const items = identityErrors(challenge, challenges, originalId);
  const add = (severity, field, text) => items.push({ severity, field, text });
  const valueAt = (path) => path.split(".").reduce((value, key) => value?.[key], challenge);
  const number = (path, label, min, optional = false, integer = true) => {
    const value = valueAt(path);
    if (optional && (value === "" || value == null)) return;
    if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isSafeInteger(value)) || value < min) {
      add("error", path, `${label} must be ${integer ? "a whole number" : "a finite number"} of at least ${min}.`);
    }
  };
  if (originalId && originalId !== challenge?.id && challenges.some((item) => item.id === originalId)) {
    add("error", "id", "An existing setup ID cannot be renamed. Create a new challenge instead.");
  }
  for (const [path, label] of [
    ["identity.displayName", "Display name"], ["identity.competitionGroup", "Competition group"],
    ["identity.targetName", "Target name"],
  ]) {
    if (typeof valueAt(path) !== "string" || !valueAt(path).trim()) add("error", path, `${label} is required.`);
  }
  for (const path of ["identity.description", "rewards.materialDropVariant", "advanced.difficultyFactorPreset", "advanced.attemptPrices"]) {
    if (valueAt(path) != null && typeof valueAt(path) !== "string") add("error", path, "This value must be text.");
  }
  if (!modeIds.includes(valueAt("content.modeId"))) {
    add("error", "content.modeId", "Select ModeID 0 (regular challenge) or 1 (Last Stand). Legacy mock modes require an explicit selection.");
  }
  // Known bosses come from the repository's reference catalog, never from local fixtures.
  const bosses = context.references?.bosses;
  if (!Array.isArray(bosses)) throw new Error("validateChallenge needs context.references from the repository.");
  if (!bosses.some((boss) => boss.value === valueAt("content.bossId"))) add("error", "content.bossId", "bossId must use a known preset.");
  // The PDF provides examples, not exhaustive catalogs of external config keys.
  for (const [path, optional] of [
    ["content.arena", false], ["content.wavePreset", false], ["rewards.rewardPreset", false],
    ["rewards.dropTier", true], ["players.groupPreset", true],
  ]) {
    const value = valueAt(path);
    if (optional && (value === "" || value == null)) continue;
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
      add("error", path, "Enter a config key on one line, without surrounding spaces.");
    }
  }
  const prices = valueAt("advanced.attemptPrices");
  if (typeof prices === "string" && prices !== "" &&
    prices.split(",").some((price) => !/^\d+$/.test(price.trim()) || !Number.isSafeInteger(Number(price)))) {
    add("error", "advanced.attemptPrices", "Attempt prices must be non-negative whole ticket counts separated by commas, for example 1,1,2,3,4.");
  }
  for (const [path, label, min, optional, integer] of [
    ["eligibility.minLevel", "Min Level", 1], ["eligibility.maxLevel", "Max Level", 1],
    ["eligibility.minCP", "Min CP", 0], ["eligibility.maxCP", "Max CP", 0],
    ["timing.durationHours", "Duration", 0.01, false, false],
    ["timing.attemptDurationSeconds", "Attempt duration", 1],
    ["timing.timerPerWave", "Timer per wave", 0, true],
    ["players.minRequired", "Minimum players", 1, true],
    ["players.players", "Players", 1, true], ["players.hardLimit", "Player hard limit", 1, true],
    ["advanced.minutesLeftToUseHardLimit", "Hard limit window", 0, true],
    ["advanced.minutesInactive", "Inactive minutes", 0, true],
    ["advanced.minInactivePlayers", "Min inactive players", 0, true],
    ["advanced.maxInactivePlayers", "Max inactive players", 0, true],
    ["advanced.npcLevelMultiplier", "NPC level multiplier", 0, true, false],
    ["advanced.minNpcLevelVariance", "Min NPC variance", 0, true, false],
    ["advanced.maxNpcLevelVariance", "Max NPC variance", 0, true, false],
    ["advanced.positionRankingMultiplier", "Position ranking multiplier", 0, true, false],
    ["advanced.rankingScoreMultiplier", "Ranking score multiplier", 0, true, false],
  ]) number(path, label, min, optional, integer);
  for (const [low, high, field, label] of [
    [valueAt("eligibility.minLevel"), valueAt("eligibility.maxLevel"), "eligibility.maxLevel", "Min Level must not exceed Max Level."],
    [valueAt("eligibility.minCP"), valueAt("eligibility.maxCP"), "eligibility.maxCP", "Min CP must not exceed Max CP."],
    [valueAt("players.minRequired"), valueAt("players.players"), "players.players", "Minimum players must not exceed Players."],
    [valueAt("players.players"), valueAt("players.hardLimit"), "players.hardLimit", "Players must not exceed the hard limit."],
    [valueAt("players.minRequired"), valueAt("players.hardLimit"), "players.hardLimit", "Minimum players must not exceed the hard limit."],
    [valueAt("advanced.minInactivePlayers"), valueAt("advanced.maxInactivePlayers"), "advanced.maxInactivePlayers", "Min inactive players must not exceed Max inactive players."],
    [valueAt("advanced.minNpcLevelVariance"), valueAt("advanced.maxNpcLevelVariance"), "advanced.maxNpcLevelVariance", "Min NPC variance must not exceed Max NPC variance."],
  ]) {
    if (typeof low === "number" && typeof high === "number" && low > high) add("error", field, label);
  }
  if (valueAt("timing.attemptDurationSeconds") > valueAt("timing.durationHours") * 3600) {
    add("error", "timing.attemptDurationSeconds", "An attempt cannot last longer than the challenge.");
  }
  if (valueAt("timing.timerPerWave") > valueAt("timing.attemptDurationSeconds")) {
    add("error", "timing.timerPerWave", "A wave timer cannot exceed the attempt duration.");
  }
  if (valueAt("advanced.separateLevels") != null && valueAt("advanced.separateLevels") !== "" &&
    ![true, false, 0, 1].includes(valueAt("advanced.separateLevels"))) {
    add("error", "advanced.separateLevels", "Separate levels must be enabled or disabled.");
  }
  if (valueAt("visuals.immuneIcons") != null &&
    (!Array.isArray(valueAt("visuals.immuneIcons")) || valueAt("visuals.immuneIcons").some((icon) => typeof icon !== "string" || !/^[A-Za-z0-9_-]+$/.test(icon)))) {
    add("error", "visuals.immuneIcons", "Immunity icons must be a list of icon keys using letters, digits, underscores or hyphens.");
  }
  for (const field of ["eventGraphicUrl", "badgeBackgroundUrl"]) {
    const value = valueAt(`visuals.${field}`);
    if (value != null && value !== "" && (typeof value !== "string" || (!isValidUrl(value) && !isAssetPath(value)))) {
      add("error", `visuals.${field}`, "Use an HTTP/HTTPS image URL or a relative asset path such as challenge/image.png.");
    }
  }
  if (!valueAt("visuals.eventGraphicUrl") || !valueAt("visuals.badgeBackgroundUrl")) add("warn", "visuals", "Visual URLs are missing.");
  const bracket = bracketForRange(valueAt("eligibility.minLevel"), valueAt("eligibility.maxLevel"));
  if (!bracket) add("error", "eligibility.maxLevel", "Level range must exactly match a supported calendar bracket.");
  if (schedule) {
    if (schedule.challengeId !== challenge?.id) add("error", "schedule.challengeId", "The scheduled ID must match the challenge in this transaction.");
    if (!brackets.includes(schedule.levelBracket) || (bracket && schedule.levelBracket !== bracket)) {
      add("error", "schedule.levelBracket", `Calendar bracket must match the setup range${bracket ? ` (${bracket})` : ""}.`);
    }
    if (!monthDays(schedule.month) || !Number.isInteger(schedule.day) || schedule.day < 1 || schedule.day > monthDays(schedule.month)) {
      add("error", "schedule.date", "Select an existing UTC calendar date.");
    }
    if (typeof schedule.startUtc !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.startUtc)) {
      add("error", "schedule.startUtc", "Start UTC must be a valid time in HH:mm format.");
    }
    const previous = schedule.previous;
    if (previous && (previous.challengeId !== challenge.id || !getCellEntries(calendar, previous).some((entry) => sameEntry(entry, previous)))) {
      add("error", "schedule.date", "The entry being edited no longer exists. Select it again.");
    }
    if (getCellEntries(calendar, schedule).some((entry) => sameEntry(entry, schedule)) && !(previous && sameSchedule(previous, schedule))) {
      add("warn", "schedule.startUtc", "This exact entry already exists; it will not be added twice.");
    }
    if (scheduleTimestamp(schedule) < now) add("warn", "schedule.date", "The selected start is in the past (UTC).");
    const allEntries = calendarEntries(calendar).filter((entry) => !(previous && sameSchedule(entry, previous)));
    if (allEntries.some((entry) => entry.challengeId === challenge.id && entry.levelBracket !== bracket)) {
      add("error", "eligibility.maxLevel", "Existing calendar entries use a different level bracket. Keep the current range or create a new challenge.");
    }
    const start = scheduleTimestamp(schedule);
    const end = start + valueAt("timing.durationHours") * 3600000;
    if (allEntries.some((entry) => {
      if (sameSchedule(entry, schedule) || entry.levelBracket !== schedule.levelBracket) return false;
      const duration = entry.challengeId === challenge.id ? valueAt("timing.durationHours") :
        challenges.find((item) => item.id === entry.challengeId)?.timing.durationHours;
      const otherStart = scheduleTimestamp(entry);
      return duration > 0 && start < otherStart + duration * 3600000 && end > otherStart;
    })) add("warn", "schedule.startUtc", "This availability window overlaps another challenge in the same bracket.");
  }
  if (!items.some((item) => item.severity === "error")) add("pass", "", "Required fields, numeric limits and schedule consistency are valid.");
  return items;
}

export function setupRow(challenge) {
  const c = challenge;
  const row = {
    CompetitionID: c.id, CompetitionGroup: c.identity?.competitionGroup,
    "Min Level": c.eligibility?.minLevel, "Max Level": c.eligibility?.maxLevel,
    "Min CP": c.eligibility?.minCP, "Max CP": c.eligibility?.maxCP,
    ModeID: c.content?.modeId, BossID: c.content?.bossId,
    DisplayName: c.identity?.displayName, TargetName: c.identity?.targetName,
    ChallengeDescription: c.identity?.description,
    EventGraphicURL: c.visuals?.eventGraphicUrl,
    ImmuneIconsInChallengeDescription: Array.isArray(c.visuals?.immuneIcons) ? c.visuals.immuneIcons.join(",") : "",
    BadgeBackgroundURL: c.visuals?.badgeBackgroundUrl,
    RewardPreset: c.rewards?.rewardPreset, Arena: c.content?.arena, WavePreset: c.content?.wavePreset,
    "Duration (h)": c.timing?.durationHours, "AttemptDuration(s)": c.timing?.attemptDurationSeconds,
    TimerPerWave: c.timing?.timerPerWave, AttemptPrices: c.advanced?.attemptPrices,
    NpcLevelMultiplier: c.advanced?.npcLevelMultiplier,
    PlayersGroupPreset: c.players?.groupPreset, MinPlayersRequired: c.players?.minRequired,
    Players: c.players?.players, PlayersHardLimit: c.players?.hardLimit,
    MinutesInactive: c.advanced?.minutesInactive, MinInactivePlayers: c.advanced?.minInactivePlayers,
    MaxInactivePlayers: c.advanced?.maxInactivePlayers,
    SeparateLevels: typeof c.advanced?.separateLevels === "boolean" ? Number(c.advanced.separateLevels) : c.advanced?.separateLevels,
    MinNpcLevelVariance: c.advanced?.minNpcLevelVariance, MaxNpcLevelVariance: c.advanced?.maxNpcLevelVariance,
    DropTier: c.rewards?.dropTier, MaterialDropVariant: c.rewards?.materialDropVariant,
    PositionRankingMultiplier: c.advanced?.positionRankingMultiplier, RankingScoreMultiplier: c.advanced?.rankingScoreMultiplier,
    DifficultyFactorPreset: c.advanced?.difficultyFactorPreset, MinutesLeftToUseHardLimit: c.advanced?.minutesLeftToUseHardLimit,
  };
  return Object.fromEntries(Object.entries(row).map(([column, value]) => [column, value ?? ""]));
}

export function serializeEntries(entries) {
  return entries.map((entry) => `${entry.startUtc}:${entry.challengeId}`).join(" | ") || "(empty)";
}

export function buildDiff(store, challenge, schedule, originalId = challenge.id) {
  const original = store.challenges.find((item) => item.id === originalId);
  const oldRow = original ? setupRow(original) : {};
  const newRow = setupRow(challenge);
  const setup = Object.keys(newRow)
    .filter((key) => !original || String(oldRow[key] ?? "") !== String(newRow[key] ?? ""))
    .map((key) => ({ field: key, oldValue: original ? oldRow[key] ?? "" : "(new row)", newValue: newRow[key] ?? "" }));
  const mutations = calendarMutations(store.calendar, schedule);
  const calendar = mutations.map((cell) => ({
    field: `${cell.month} day ${cell.day}, bracket ${cell.levelBracket}`,
    oldValue: serializeEntries(cell.before), newValue: serializeEntries(cell.after),
  }));
  return { setup, calendar, mutations };
}

export function applyPlan(store, plan) {
  const next = structuredClone(store);
  const challenges = structuredClone(plan.deletion ? [] : plan.challenges || [plan.challenge]);
  if (plan.deletion) {
    const { challengeIds, packIds, updatedPacks } = plan.deletion;
    next.challenges = next.challenges.filter((challenge) => !challengeIds.includes(challenge.id));
    next.packs = (next.packs || []).filter((pack) => !packIds.includes(pack.id))
      .map((pack) => structuredClone(updatedPacks.find((item) => item.id === pack.id) || pack));
  }
  for (const challenge of challenges) {
    const index = next.challenges.findIndex((item) => item.id === challenge.id);
    if (index < 0) next.challenges.push(challenge);
    else next.challenges[index] = challenge;
  }
  for (const cell of plan.diff.mutations) {
    next.calendar[cell.month] ||= {};
    next.calendar[cell.month][cell.day] ||= {};
    next.calendar[cell.month][cell.day][cell.levelBracket] = structuredClone(cell.after);
  }
  for (const item of next.challenges) {
    if (challenges.some((challenge) => challenge.id === item.id)) item.status = nextStart(next.calendar, item.id) ? "Scheduled" : "Ready";
  }
  if (plan.pack) {
    next.packs ||= [];
    const index = next.packs.findIndex((pack) => pack.id === plan.pack.id);
    if (index < 0) next.packs.push(structuredClone(plan.pack));
    else next.packs[index] = structuredClone(plan.pack);
  }
  next.revision += 1;
  return next;
}
