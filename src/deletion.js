import { identityErrors, serializeEntries } from "./domain.js";

export function removePackMembers(pack, challengeIds) {
  const removed = new Set(challengeIds);
  return { ...structuredClone(pack),
    bossIds: pack.bossIds.filter((boss) => !removed.has(`${pack.idPrefix}-${boss}`)),
    ...(pack.challengeIds ? { challengeIds: pack.challengeIds.filter((id) => !removed.has(id)) } : {}),
  };
}

export function buildDeletionPlan(store, request) {
  const fail = (status, text) => { throw Object.assign(new Error(text), { status }); };
  if (!request || !["challenge", "pack"].includes(request.kind) || identityErrors({ id: request.id }).length ||
    (request.includeChallenges !== undefined && typeof request.includeChallenges !== "boolean") ||
    (request.kind === "challenge" && request.includeChallenges)) fail(400, "Choose a valid challenge or pack to delete.");
  const target = request.kind === "pack" ? (store.packs || []).find((pack) => pack.id === request.id) : store.challenges.find((challenge) => challenge.id === request.id);
  if (!target) fail(404, "This item no longer exists. Refresh the list.");
  const ownedIds = request.kind === "pack" ? target.challengeIds || [] : [target.id];
  const challengeIds = request.kind === "challenge" || request.includeChallenges ? [...ownedIds] : [];
  const removed = new Set(challengeIds);
  const challenges = store.challenges.filter((challenge) => removed.has(challenge.id));
  const packIds = request.kind === "pack" ? [target.id] : [];
  const updatedPacks = (store.packs || []).filter((pack) => !packIds.includes(pack.id))
    .map((pack) => removePackMembers(pack, challengeIds))
    .filter((pack) => JSON.stringify(pack) !== JSON.stringify(store.packs.find((item) => item.id === pack.id)));
  const mutations = [];
  let entryCount = 0;
  for (const [month, days] of Object.entries(store.calendar)) {
    for (const [day, brackets] of Object.entries(days)) {
      for (const [levelBracket, before] of Object.entries(brackets)) {
        const after = before.filter((entry) => !removed.has(entry.challengeId));
        if (before.length === after.length) continue;
        entryCount += before.length - after.length;
        mutations.push({ month, day: Number(day), levelBracket, before: structuredClone(before), after: structuredClone(after) });
      }
    }
  }
  const diff = {
    setup: challenges.map((challenge) => ({ field: challenge.id, oldValue: challenge.identity.displayName, newValue: "(deleted)" })),
    calendar: mutations.map((cell) => ({ field: `${cell.month} day ${cell.day}, bracket ${cell.levelBracket}`,
      oldValue: serializeEntries(cell.before), newValue: serializeEntries(cell.after) })),
    mutations,
    pack: [
      ...(request.kind === "pack" ? [{ field: target.name, oldValue: `${target.bossIds.length} bosses`, newValue: "(pack deleted)" }] : []),
      ...updatedPacks.map((pack) => ({ field: pack.name, oldValue: store.packs.find((item) => item.id === pack.id).bossIds.join(", "), newValue: pack.bossIds.join(", ") || "(empty pack)" })),
    ],
  };
  return {
    deletion: { kind: request.kind, id: target.id, label: request.kind === "pack" ? target.name : target.id,
      includeChallenges: request.includeChallenges === true, challengeIds, packIds, updatedPacks, entryCount,
      challengeCount: challenges.length, retainedChallengeCount: request.kind === "pack" && !request.includeChallenges ? store.challenges.filter((challenge) => ownedIds.includes(challenge.id)).length : 0 },
    diff,
    validation: [{ severity: "pass", field: "", text: "Deletion scope and calendar references were verified." }],
  };
}
