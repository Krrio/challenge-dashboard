import { bossOptions, presets } from "./fixtures.js";
import { identityErrors, monthDays, scheduleTimestamp, validateChallenge, buildDiff, getCellEntries, serializeEntries } from "./domain.js";

export const bossLabel = (id) => bossOptions.find((boss) => boss.value === id)?.label || id;

export function generatePack(pack) {
  if (!pack?.template || !Array.isArray(pack.bossIds) || !pack.schedule) return [];
  const start = scheduleTimestamp(pack.schedule);
  const interval = pack.schedule.mode === "simultaneous" ? 0 : Number(pack.schedule.intervalDays);
  return pack.bossIds.map((bossId, index) => {
    const challenge = structuredClone(pack.template);
    challenge.id = `${pack.idPrefix || ""}-${bossId}`;
    challenge.status = "Draft";
    challenge.identity = { ...challenge.identity,
      displayName: String(pack.namePattern || "").replaceAll("{boss}", bossLabel(bossId)).replaceAll("{index}", String(index + 1)),
      targetName: bossLabel(bossId),
    };
    challenge.content = { ...challenge.content, bossId };
    const date = new Date(start + index * interval * 86400000);
    const valid = Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1000 && date.getUTCFullYear() <= 9999;
    const schedule = {
      challengeId: challenge.id, month: valid ? date.toISOString().slice(0, 7) : "", day: valid ? date.getUTCDate() : 0,
      startUtc: pack.schedule.startUtc, levelBracket: pack.schedule.levelBracket,
    };
    return { challenge, schedule };
  });
}

export function evaluatePack(store, input, now = Date.now()) {
  const validation = [];
  const diff = { setup: [], calendar: [], mutations: [], pack: [] };
  const result = { pack: null, challenges: [], schedules: [], members: [], validation, diff };
  const error = (field, text) => validation.push({ severity: "error", field, text });
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    error("pack", "A challenge pack is required.");
    return result;
  }
  if (identityErrors({ id: input.id }).length) error("pack.id", "Pack ID is invalid.");
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 120) error("pack.name", "Pack name must contain 1-120 characters.");
  if (typeof input.idPrefix !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(input.idPrefix)) error("pack.idPrefix", "ID prefix must contain 1-64 letters, digits, underscores or hyphens.");
  if (typeof input.namePattern !== "string" || !input.namePattern.includes("{boss}") || input.namePattern.length > 160 || /\{(?!boss\}|index\})[^}]*\}/.test(input.namePattern)) {
    error("pack.namePattern", "Name pattern must include {boss}; {index} is optional (maximum 160 characters).");
  }
  if (!Array.isArray(input.bossIds) || !input.bossIds.length || input.bossIds.length > 100 ||
    input.bossIds.some((id) => !presets.bosses.includes(id)) || new Set(input.bossIds).size !== input.bossIds.length) {
    error("pack.bossIds", "Choose 1-100 different known bosses.");
  }
  if (!input.template || !["identity", "eligibility", "content", "timing", "rewards", "players", "visuals", "advanced"]
    .every((key) => input.template[key] && typeof input.template[key] === "object" && !Array.isArray(input.template[key]))) {
    error("pack.template", "A complete shared setup is required.");
  }
  const schedule = input.schedule;
  if (!schedule || !monthDays(schedule.month) || !Number.isInteger(schedule.day) || schedule.day < 1 || schedule.day > monthDays(schedule.month) ||
    typeof schedule.startUtc !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.startUtc)) error("schedule.date", "Select a valid UTC start date and time.");
  if (!schedule || !["sequential", "simultaneous"].includes(schedule.mode)) error("schedule.mode", "Choose a scheduling mode.");
  if (schedule?.mode === "sequential" && (!Number.isInteger(schedule.intervalDays) || schedule.intervalDays < 1 || schedule.intervalDays > 366)) {
    error("schedule.intervalDays", "Interval must be a whole number from 1 to 366 days.");
  }
  const previous = (store.packs || []).find((pack) => pack.id === input.id);
  if (previous && previous.idPrefix !== input.idPrefix) error("pack.idPrefix", "The ID prefix of a deployed pack cannot be changed. Duplicate the pack instead.");
  if (validation.length) return result;

  const members = generatePack(input);
  const working = structuredClone(store);
  const cells = new Map();
  const ownedIds = previous?.challengeIds || [];
  for (const member of members) {
    const { challenge, schedule } = member;
    const originalId = ownedIds.includes(challenge.id) ? challenge.id : "";
    const checks = validateChallenge(challenge, schedule, { ...working, originalId, now });
    validation.push(...checks.filter((item) => item.severity !== "pass").map((item) => ({ ...item, challengeId: challenge.id })));
    if (checks.some((item) => item.severity === "error")) continue;
    const changes = buildDiff(working, challenge, schedule, originalId);
    member.diff = changes;
    diff.setup.push(...changes.setup.map((row) => ({ ...row, challengeId: challenge.id, field: `${challenge.id} / ${row.field}` })));
    // Accumulate same-cell appends before emitting one final mutation per cell.
    for (const cell of changes.mutations) {
      const key = `${cell.month}/${cell.day}/${cell.levelBracket}`;
      if (!cells.has(key)) cells.set(key, { ...cell, before: structuredClone(getCellEntries(store.calendar, cell)) });
      cells.get(key).after = cell.after;
      working.calendar[cell.month] ||= {};
      working.calendar[cell.month][cell.day] ||= {};
      working.calendar[cell.month][cell.day][cell.levelBracket] = cell.after;
    }
    const index = working.challenges.findIndex((item) => item.id === challenge.id);
    if (index < 0) working.challenges.push(challenge);
    else working.challenges[index] = challenge;
  }
  result.members = members;
  result.challenges = members.map((member) => member.challenge);
  result.schedules = members.map((member) => member.schedule);
  diff.mutations = [...cells.values()];
  diff.calendar = diff.mutations.map((cell) => ({ field: `${cell.month} day ${cell.day}, bracket ${cell.levelBracket}`,
    oldValue: serializeEntries(cell.before), newValue: serializeEntries(cell.after) }));
  const template = structuredClone(input.template);
  template.id = "PackTemplate";
  template.status = "Draft";
  template.identity.displayName = "{boss}";
  template.identity.targetName = "{boss}";
  template.content.bossId = input.bossIds[0];
  result.pack = {
    id: input.id, name: input.name.trim(), idPrefix: input.idPrefix, namePattern: input.namePattern,
    bossIds: [...input.bossIds], template,
    schedule: { month: schedule.month, day: schedule.day, startUtc: schedule.startUtc, levelBracket: schedule.levelBracket,
      mode: schedule.mode, intervalDays: schedule.mode === "simultaneous" ? 1 : schedule.intervalDays },
    challengeIds: [...new Set([...ownedIds, ...result.challenges.map((challenge) => challenge.id)])],
  };
  const metadata = (pack) => pack ? {
    Name: pack.name, "ID prefix": pack.idPrefix, "Name pattern": pack.namePattern, Bosses: pack.bossIds.join(", "),
    "Start UTC": `${pack.schedule.month}-${String(pack.schedule.day).padStart(2, "0")} ${pack.schedule.startUtc}`,
    Mode: pack.schedule.mode, "Interval (days)": pack.schedule.intervalDays, Bracket: pack.schedule.levelBracket,
  } : {};
  const before = metadata(previous);
  for (const [field, newValue] of Object.entries(metadata(result.pack))) {
    if (before[field] !== newValue) diff.pack.push({ field, oldValue: previous ? before[field] ?? "" : "(new pack)", newValue });
  }
  if (previous?.bossIds.some((boss) => !input.bossIds.includes(boss))) validation.push({ severity: "warn", field: "pack.bossIds", text: "Removed members keep their existing setups and calendar entries." });
  if (previous && diff.calendar.length) validation.push({ severity: "warn", field: "schedule.date", text: "New occurrences will be appended; existing pack dates remain unchanged." });
  if (!validation.some((item) => item.severity === "error")) validation.push({ severity: "pass", field: "", text: `${members.length} challenges validated for one STAGE transaction.` });
  return result;
}
