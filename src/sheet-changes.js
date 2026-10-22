// Targeted spreadsheet writes. An approved plan becomes a list of ChallengeSetupConfig rows,
// ChallengeCalendar cells and pack records, each with the value it expects to replace (`before`)
// and the value to write (`after`). Repositories apply the list with optimistic concurrency: when
// any target no longer holds its `before` value, nothing is written. The same list, inverted,
// rolls a deployment back.
import { applyPlan, calendarEntries } from "./domain.js";

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const copy = (value) => (value == null ? null : structuredClone(value));
// A missing cell is null, not an empty list, so a rollback can remove cells a deployment created.
const cellAt = (calendar, { month, day, levelBracket }) => calendar?.[month]?.[day]?.[levelBracket] ?? null;

function recordChanges(beforeItems = [], afterItems = []) {
  const before = new Map(beforeItems.map((item) => [item.id, item]));
  const after = new Map(afterItems.map((item) => [item.id, item]));
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((id) => !same(before.get(id), after.get(id)))
    .map((id) => ({ id, before: copy(before.get(id)), after: copy(after.get(id)) }));
}

export function planChanges(state, plan) {
  const next = applyPlan(state, plan);
  const calendar = [];
  for (const month of new Set([...Object.keys(state.calendar), ...Object.keys(next.calendar)])) {
    for (const day of new Set([...Object.keys(state.calendar[month] || {}), ...Object.keys(next.calendar[month] || {})])) {
      const brackets = new Set([...Object.keys(state.calendar[month]?.[day] || {}), ...Object.keys(next.calendar[month]?.[day] || {})]);
      for (const levelBracket of brackets) {
        const cell = { month, day: Number(day), levelBracket };
        const before = cellAt(state.calendar, cell);
        const after = cellAt(next.calendar, cell);
        if (!same(before, after)) calendar.push({ ...cell, before: copy(before), after: copy(after) });
      }
    }
  }
  return { setup: recordChanges(state.challenges, next.challenges), calendar, packs: recordChanges(state.packs, next.packs) };
}

export function invertChanges(changes) {
  const swap = (item) => ({ ...item, before: item.after, after: item.before });
  return { setup: changes.setup.map(swap), calendar: changes.calendar.map(swap), packs: changes.packs.map(swap) };
}

export function countChanges(changes) {
  return { rows: changes.setup.length, cells: changes.calendar.length, packs: changes.packs.length };
}

// Whether every target currently holds its `before` value, its `after` value, or neither.
export function changesState(state, changes) {
  const targets = [
    ...changes.setup.map((row) => [state.challenges.find((item) => item.id === row.id), row]),
    ...changes.calendar.map((cell) => [cellAt(state.calendar, cell), cell]),
    ...changes.packs.map((pack) => [(state.packs || []).find((item) => item.id === pack.id), pack]),
  ];
  if (targets.every(([current, change]) => same(current, change.before))) return "before";
  if (targets.every(([current, change]) => same(current, change.after))) return "after";
  return "mixed";
}

export function applyChanges(state, changes) {
  const conflicts = [
    ...changes.setup.filter((row) => !same(state.challenges.find((item) => item.id === row.id), row.before)).map((row) => `ChallengeSetupConfig ${row.id}`),
    ...changes.calendar.filter((cell) => !same(cellAt(state.calendar, cell), cell.before)).map((cell) => `ChallengeCalendar ${cell.month} day ${cell.day}, bracket ${cell.levelBracket}`),
    ...changes.packs.filter((pack) => !same((state.packs || []).find((item) => item.id === pack.id), pack.before)).map((pack) => `pack ${pack.id}`),
  ];
  if (conflicts.length) {
    const listed = conflicts.slice(0, 3).join("; ") + (conflicts.length > 3 ? `; +${conflicts.length - 3} more` : "");
    throw Object.assign(new Error(`The spreadsheet changed since this preview (${listed}). Nothing was written.`), { status: 409, conflicts });
  }
  const next = structuredClone(state);
  const upsert = (items, { id, after }) => {
    const index = items.findIndex((item) => item.id === id);
    if (after === null) return index < 0 ? items : items.filter((item) => item.id !== id);
    if (index < 0) items.push(copy(after));
    else items[index] = copy(after);
    return items;
  };
  for (const row of changes.setup) next.challenges = upsert(next.challenges, row);
  for (const cell of changes.calendar) {
    if (cell.after === null) {
      delete next.calendar[cell.month]?.[cell.day]?.[cell.levelBracket];
      if (next.calendar[cell.month]?.[cell.day] && !Object.keys(next.calendar[cell.month][cell.day]).length) delete next.calendar[cell.month][cell.day];
      if (next.calendar[cell.month] && !Object.keys(next.calendar[cell.month]).length) delete next.calendar[cell.month];
      continue;
    }
    next.calendar[cell.month] ||= {};
    next.calendar[cell.month][cell.day] ||= {};
    next.calendar[cell.month][cell.day][cell.levelBracket] = copy(cell.after);
  }
  if (changes.packs.length) next.packs ||= [];
  for (const pack of changes.packs) next.packs = upsert(next.packs, pack);
  next.revision += 1;
  return next;
}

// UTC months the STAGE importer must re-read: every month with a changed calendar cell, plus
// current and future months that schedule a challenge whose setup row changed.
export function importMonths(changes, calendar, now = Date.now()) {
  const months = new Set(changes.calendar.map((cell) => cell.month));
  const currentMonth = new Date(now).toISOString().slice(0, 7);
  const changedIds = new Set(changes.setup.map((row) => row.id));
  for (const entry of calendarEntries(calendar)) {
    if (changedIds.has(entry.challengeId) && entry.month >= currentMonth) months.add(entry.month);
  }
  return [...months].sort();
}
