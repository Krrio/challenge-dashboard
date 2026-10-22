import { Alert, Badge, Button, Calendar, Card, CardContent, CardHeader, Combobox, Field, Input, Select, Table } from "./components/ui.js";
import { bossOptions, brackets, presets, createStore, defaultDifficultyFactorPresetByBracket, defaultDropTierByBracket, difficultyFactorPresetData } from "./fixtures.js";
import { bossLabel, generatePack, evaluatePack } from "./packs.js";
import { removePackMembers } from "./deletion.js";
import { toast, notifyDeployment } from "./generated/notifications.js";
import { t, message, locale } from "./i18n.js";
import { getPreferences, setPreferences, preferencesKey, preferencesEvent } from "./preferences.js";
import { bracketForRange, monthDays, isValidUrl, isAssetPath, parseDecimalInput, identityErrors, setupRow, nextStart, calendarEntries, scheduleTimestamp,
  validateChallenge as validateModel, buildDiff as diffModel, getCellEntries as cellEntries } from "./domain.js";

const fieldTooltips = {
  id: "Unique ChallengeSetupConfig identifier. Use a stable ID such as ScarredOrcTest or FrostWarden70.",
  "identity.competitionGroup": "Groups related challenge configs for the event pipeline. Enter a short group key such as orc-stage.",
  "identity.displayName": "Challenge title in the game. Enter its localization key, for example IDS_DC_Title_Knives_Out.",
  "identity.targetName": "Name of the target or boss shown in challenge context. Enter a readable target name.",
  "identity.description": "Localization key for the boss or mode description, for example IDS_Revenant_Assassin_Description. Pick a key from the list or type your own text.",
  "eligibility.minLevel": "Lowest player level allowed into the challenge. Enter a whole number matching a supported bracket.",
  "eligibility.maxLevel": "Highest player level allowed into the challenge. Enter a whole number greater than or equal to Min Level.",
  "eligibility.minCP": "Minimum combat power gate. Enter a whole number; it must be less than or equal to Max CP.",
  "eligibility.maxCP": "Maximum combat power gate. Enter a whole number; it must be greater than or equal to Min CP.",
  "content.modeId": "0: regular challenge ending with a boss. 1: Last Stand mode.",
  "content.bossId": "Boss identifier used by the challenge content setup. Pick the boss this challenge should spawn.",
  "content.arena": "Arena where the challenge takes place. Search and pick one of the listed arenas, for example Dark Temple.",
  "content.wavePreset": "Key from WavePresetsConfig, for example RevenantAssassin_V3. Search and pick one of the listed presets.",
  "timing.durationHours": "Total challenge availability window in hours. Enter 24 for one day, 48 for two days.",
  "timing.attemptDurationSeconds": "Maximum duration of a single attempt in seconds. Enter a whole number such as 180.",
  "timing.timerPerWave": "Wave duration in seconds for Last Stand mode. Leave empty when not used.",
  "rewards.rewardPreset": "Key from ChallengeRewardsConfig, for example ColdReward50_D3_V3. Select a suggestion or enter a config key.",
  "rewards.dropTier": "Drop configuration key, for example DC_Level50. Filled in from the level bracket; pick another tier from the list when needed.",
  "rewards.materialDropVariant": "Material drop variant from the game config, for example 16. Preserve the configured value.",
  "players.groupPreset": "Optional player division preset key. Enter a config key or leave empty to use the individual division limits.",
  "players.minRequired": "Minimum players needed to create a division. Smaller groups are distributed among existing divisions (minPlayersRequired).",
  "players.players": "Soft maximum number of players in a division (playersLimit). Must not exceed PlayersHardLimit.",
  "players.hardLimit": "Hard maximum players per division, including extra players without a competition (playersHardLimit).",
  "visuals.eventGraphicUrl": "NPC or mode portrait. Enter a relative asset path such as challenge/image.png or an HTTP/HTTPS image URL.",
  "visuals.badgeBackgroundUrl": "Badge background. Enter a relative asset path such as challenge/badge.png or an HTTP/HTTPS image URL.",
  "visuals.immuneIcons": "Immunity icons shown in the challenge description. Select one or more, for example Cold and Fire.",
  "advanced.attemptPrices": "Ticket prices for attempts, separated by commas, for example 1,1,2,3,4. Leave empty when not configured.",
  "advanced.npcLevelMultiplier": "NPC level multiplier used for balancing, for example 1. Decimal values are allowed.",
  "advanced.minNpcLevelVariance": "Lower NPC level variance value, for example 0.9. Accepts a decimal point or comma.",
  "advanced.maxNpcLevelVariance": "Upper NPC level variance value, for example 1.1. Must be at least the lower value.",
  "advanced.minutesInactive": "Minutes since last activity after which a player is inactive (maxActivePlayerIdleMinutes).",
  "advanced.minInactivePlayers": "Lower player limit from the sheet, mapped to activePlayersLimit on the backend.",
  "advanced.maxInactivePlayers": "Upper inactive-player limit, mapped to inactivePlayersLimit on the backend.",
  "advanced.separateLevels": "Create separate divisions for each player level. Stored as 1 when enabled and 0 when disabled.",
  "advanced.positionRankingMultiplier": "Position ranking multiplier from the game config, for example 14.9. Decimal values are allowed.",
  "advanced.rankingScoreMultiplier": "Ranking score multiplier from the game config, for example 0.7831. Decimal values are allowed.",
  "advanced.difficultyFactorPreset": "Difficulty factor preset from ChallengeDifficultyFactorPresets. Auto-filled to match Min/Max Level whenever the bracket changes; search and pick a different one from the list any time.",
  "advanced.minutesLeftToUseHardLimit": "Minutes before the challenge ends when players may be assigned up to the hard limit. Empty disables it; 0 or any positive whole number enables it.",
  "schedule.challengeId": "Challenge to place into ChallengeCalendar. Pick an existing draft or setup config ID.",
  "schedule.date": "Calendar day for the schedule entry. Click the UTC day that should receive this challenge.",
  "schedule.startUtc": "UTC start time stored in the calendar cell. Enter HH:mm, for example 19:00.",
  "schedule.levelBracket": "ChallengeCalendar level bracket column. Pick the bracket matching Min Level and Max Level.",
};

const fieldPlaceholders = {
  id: "ScarredOrcTest",
  "identity.competitionGroup": "orc-stage",
  "identity.displayName": "IDS_DC_Title_Knives_Out",
  "identity.targetName": "Scarred Orc",
  "identity.description": "IDS_Revenant_Assassin_Description",
  "eligibility.minLevel": "40",
  "eligibility.maxLevel": "49",
  "eligibility.minCP": "12000",
  "eligibility.maxCP": "26000",
  "timing.durationHours": "24",
  "timing.attemptDurationSeconds": "180",
  "timing.timerPerWave": "60",
  "rewards.materialDropVariant": "16",
  "visuals.eventGraphicUrl": "challenge/ui_img_revenant_assassin_1.png",
  "visuals.badgeBackgroundUrl": "challenge/badge_image_revenant_assassin_1.png",
  "advanced.attemptPrices": "1,1,2,3,4",
  "advanced.minNpcLevelVariance": "0.9",
  "advanced.maxNpcLevelVariance": "1.1",
  "schedule.startUtc": "19:00",
};

const app = document.querySelector("#app");
const storageKey = "challenge-manager.workspace.v1";
const today = new Date();
const initialStore = createStore();
const state = {
  view: "overview", month: today.toISOString().slice(0, 7),
  challengeLists: {
    overview: { query: "", status: "", boss: "", page: 1, menuId: null },
    challenges: { query: "", status: "", boss: "", page: 1, menuId: null },
  },
  remote: initialStore, challenges: structuredClone(initialStore.challenges),
  selectedId: initialStore.challenges[0].id, draft: structuredClone(initialStore.challenges[0]),
  schedule: { challengeId: initialStore.challenges[0].id, month: today.toISOString().slice(0, 7), day: today.getUTCDate(), startUtc: "19:00", levelBracket: "40-49" },
  savedDrafts: {}, savedScratch: {}, scratch: {}, reviewed: false, plan: null, previewLoading: false,
  pack: null, savedPacks: {}, packEdits: {}, singleEditor: null, packBossQuery: "", packCalendarMonth: "",
  deletionDialog: null, pendingRemoval: null,
  deploy: { status: "Idle", build: null, log: null }, history: initialStore.history,
  ready: false, loading: false, notice: null, storageError: "", submitting: false,
  // Normalized dependent-tab catalogs from GET /api/references (bosses, presets, ...).
  // null until the first successful fetch; every reader falls back to the static
  // fixtures.js catalogs until then, so the UI behaves the same either way.
  references: null,
};
let previewRequest = 0;
let pollTimer = null;
let renderedPack = null;
let deletionRequest = 0;

function clone(value) { return structuredClone(value); }
function isBusy() { return state.submitting || ["Queued", "Running"].includes(state.deploy.status); }
function originalId() { return !state.pack && state.remote.challenges.some((item) => item.id === state.selectedId) ? state.selectedId : ""; }
function validationContext() { return { ...state.remote, originalId: originalId() }; }
function validateChallenge() {
  if (state.pack) return packEvaluation().validation;
  return [
    ...validateModel(state.draft, state.schedule, validationContext()),
    ...identityErrors(state.draft, state.challenges, state.selectedId),
  ].filter((item, index, items) => items.findIndex((other) => other.field === item.field && other.text === item.text) === index);
}
function hasBlockingErrors() { return validateChallenge().some((item) => item.severity === "error"); }
function getCellEntries(month, day, levelBracket) { return cellEntries(state.remote.calendar, { month, day, levelBracket }); }
function buildDiff() { return state.pack ? packEvaluation().diff : diffModel(state.remote, state.draft, state.schedule, originalId()); }
function isDirty() {
  if (state.pack) return JSON.stringify(currentPack()) !== JSON.stringify(state.savedPacks[state.pack.id] || state.remote.packs?.find((pack) => pack.id === state.pack.id));
  const saved = Object.hasOwn(state.savedScratch, state.selectedId || "__new__") ? state.savedScratch[state.selectedId || "__new__"] : state.challenges.find((item) => item.id === state.selectedId);
  return !saved || JSON.stringify(setupRow(saved)) !== JSON.stringify(setupRow(state.draft));
}
function syncWorkingChallenges() {
  state.challenges = state.remote.challenges.map((item) => clone(state.savedDrafts[item.id] || item));
  for (const draft of Object.values(state.savedDrafts)) {
    if (!state.challenges.some((item) => item.id === draft.id)) state.challenges.push(clone(draft));
  }
  state.history = state.remote.history;
}

function persistLocal() {
  try {
    if (state.pack) state.packEdits[state.pack.id] = clone(currentPack());
    localStorage.setItem(storageKey, JSON.stringify({
      version: 1, savedDrafts: state.savedDrafts, savedScratch: state.savedScratch, scratch: state.scratch,
      savedPacks: state.savedPacks, packEdits: state.packEdits, singleEditor: state.singleEditor,
      pendingRemoval: state.pendingRemoval,
      editor: { selectedId: state.selectedId, draft: state.draft, schedule: state.schedule, packId: state.pack?.id || null },
    }));
    state.storageError = "";
  } catch {
    state.storageError = "Local drafts could not be saved. Keep this tab open and free browser storage.";
  }
}
function draftShape(draft) {
  return draft && typeof draft.id === "string" &&
    ["identity", "eligibility", "content", "timing", "rewards", "players", "visuals", "advanced"]
      .every((key) => draft[key] && typeof draft[key] === "object" && !Array.isArray(draft[key])) &&
    (!draft.visuals.immuneIcons || Array.isArray(draft.visuals.immuneIcons));
}
function packShape(pack) {
  return pack && typeof pack.id === "string" && !identityErrors({ id: pack.id }).length &&
    typeof pack.name === "string" && typeof pack.idPrefix === "string" && typeof pack.namePattern === "string" &&
    Array.isArray(pack.bossIds) && pack.bossIds.every((id) => typeof id === "string") && draftShape(pack.template) &&
    pack.schedule && monthDays(pack.schedule.month) && Number.isInteger(pack.schedule.day);
}
function restoreLocal() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !saved.savedDrafts || !saved.scratch ||
      !Object.values(saved.savedDrafts).every(draftShape) || !Object.values(saved.scratch).every(draftShape) ||
      !Object.values(saved.savedScratch || {}).every(draftShape) ||
      !draftShape(saved.editor?.draft) || !monthDays(saved.editor?.schedule?.month) ||
      !Number.isInteger(saved.editor.schedule.day) || saved.editor.schedule.day < 1 ||
      saved.editor.schedule.day > monthDays(saved.editor.schedule.month) ||
      !brackets.includes(saved.editor.schedule.levelBracket)) throw new Error();
    if (!Object.values(saved.savedPacks || {}).every(packShape) || !Object.values(saved.packEdits || {}).every(packShape) ||
      (saved.singleEditor && (!draftShape(saved.singleEditor.draft) || !monthDays(saved.singleEditor.schedule?.month)))) throw new Error();
    const activePack = saved.editor.packId ? saved.packEdits?.[saved.editor.packId] || saved.savedPacks?.[saved.editor.packId] : null;
    if (saved.editor.packId && (!packShape(activePack) || activePack.id !== saved.editor.packId)) throw new Error();
    state.savedDrafts = saved.savedDrafts;
    state.savedScratch = saved.savedScratch || {};
    state.scratch = saved.scratch;
    state.selectedId = saved.editor.selectedId;
    state.draft = saved.editor.draft;
    state.schedule = saved.editor.schedule;
    state.month = state.schedule.month;
    state.savedPacks = saved.savedPacks || {};
    state.packEdits = saved.packEdits || {};
    state.singleEditor = saved.singleEditor || null;
    state.pack = clone(activePack);
    state.packCalendarMonth = state.schedule.month;
    state.pendingRemoval = typeof saved.pendingRemoval === "string" ? saved.pendingRemoval : null;
  } catch {
    state.storageError = "Saved browser data could not be read. Server data is still available.";
  }
}
async function api(path, payload) {
  let response;
  try {
    response = await fetch(path, {
      ...(payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("Cannot reach the local server. Check that it is running, then retry.");
  }
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || "Request failed."), { status: response.status, validation: result.validation });
  return result;
}
async function initialize() {
  if (state.loading) return;
  state.loading = true;
  render();
  try {
    state.remote = await api("/api/state");
    // Best-effort: the editor already works from static fixtures.js catalogs, so a
    // failed or slow /api/references fetch never blocks loading the app itself.
    api("/api/references").then((references) => { state.references = references; render(); }).catch(() => {});
    state.draft = clone(state.remote.challenges[0] || blankChallenge());
    state.selectedId = state.remote.challenges[0]?.id || "";
    state.schedule.challengeId = state.draft.id;
    state.schedule.levelBracket = bracketForRange(state.draft.eligibility.minLevel, state.draft.eligibility.maxLevel) || "40-49";
    restoreLocal();
    const removal = state.remote.history.find((job) => job.previewId === state.pendingRemoval && job.deletion);
    if (removal?.status === "Success") { cleanupDeletion(removal.deletion); notifyDeployment(removal); }
    else if (removal?.status === "Failure") { state.pendingRemoval = null; persistLocal(); notifyDeployment(removal); }
    const published = state.remote.challenges.find((item) => item.id === state.draft.id);
    if (!state.pack && published && JSON.stringify(setupRow(published)) === JSON.stringify(setupRow(state.draft))) {
      state.selectedId = published.id;
      delete state.savedDrafts[published.id];
    }
    syncWorkingChallenges();
    state.ready = true;
    state.notice = null;
    const active = state.history.find((job) => ["Queued", "Running"].includes(job.status));
    if (active) {
      state.deploy = { status: active.status, build: active.id, log: active.log };
      notifyDeployment(active);
      pollDeployment();
    }
  } catch (error) {
    state.notice = { variant: "red", text: error.message };
  } finally {
    state.loading = false;
    render();
  }
}
function invalidatePreview() {
  previewRequest += 1;
  state.reviewed = false;
  state.plan = null;
  state.previewLoading = false;
}
function setView(view) {
  closeOverviewMenu();
  if (view === "preview" && state.ready && !isBusy()) return previewChanges();
  state.view = view;
  render();
}
function updateDraft(path, value, { deferRender = false } = {}) {
  if (isBusy()) return;
  if (path === "id" && originalId()) return;
  const parts = path.split(".");
  let cursor = state.draft;
  for (const part of parts.slice(0, -1)) cursor = cursor[part];
  cursor[parts.at(-1)] = value;
  if (path === "id") state.schedule.challengeId = value;
  if (["eligibility.minLevel", "eligibility.maxLevel"].includes(path)) {
    const bracket = bracketForRange(state.draft.eligibility.minLevel, state.draft.eligibility.maxLevel);
    if (bracket) {
      if (bracket !== state.schedule.levelBracket) {
        const suggestedPreset = defaultDifficultyFactorPresetByBracket[bracket];
        if (suggestedPreset) state.draft.advanced.difficultyFactorPreset = suggestedPreset;
        if (defaultDropTierByBracket[bracket]) state.draft.rewards.dropTier = defaultDropTierByBracket[bracket];
      }
      state.schedule.levelBracket = bracket;
    }
  }
  state.notice = null;
  invalidatePreview();
  persistLocal();
  if (!deferRender) render();
}
function updateSchedule(key, value) {
  if (isBusy()) return;
  if (key === "challengeId") return selectChallenge(value, "calendar");
  state.schedule[key] = ["day", "intervalDays"].includes(key) ? (value === "" ? "" : Number(value)) : value;
  if (key === "month") {
    clampScheduleDay();
    state.month = value;
    if (state.pack) state.packCalendarMonth = value;
  }
  state.notice = null;
  invalidatePreview();
  persistLocal();
  render();
}
function clampScheduleDay() {
  state.schedule.day = Math.max(1, Math.min(state.schedule.day, monthDays(state.schedule.month)));
}
function stashDraft() {
  if (state.pack) { persistLocal(); return; }
  if (isDirty()) state.scratch[state.selectedId || "__new__"] = clone(state.draft);
}
function selectChallenge(id, view = "setup") {
  if (isBusy()) return;
  if (state.pack) leavePack();
  if (id === state.draft.id) {
    state.view = view;
    render();
    return;
  }
  const challenge = state.challenges.find((item) => item.id === id);
  if (!challenge) return;
  stashDraft();
  state.selectedId = id;
  state.draft = clone(state.scratch[id] || challenge);
  state.schedule.challengeId = state.draft.id;
  delete state.schedule.previous;
  const bracket = bracketForRange(state.draft.eligibility.minLevel, state.draft.eligibility.maxLevel);
  if (bracket) state.schedule.levelBracket = bracket;
  invalidatePreview();
  state.notice = null;
  state.view = view;
  persistLocal();
  render();
}
function newChallenge() {
  if (isBusy()) return;
  if (state.pack) leavePack();
  stashDraft();
  let id = "NewStageChallenge";
  for (let number = 2; state.challenges.some((item) => item.id === id); number += 1) id = `NewStageChallenge${number}`;
  state.selectedId = "";
  state.draft = clone(state.scratch.__new__ || blankChallenge(id));
  state.schedule = { challengeId: state.draft.id, month: state.month, day: state.schedule.day, startUtc: "19:00",
    levelBracket: bracketForRange(state.draft.eligibility.minLevel, state.draft.eligibility.maxLevel) || "30-39" };
  invalidatePreview();
  state.view = "setup";
  state.notice = null;
  persistLocal();
  render();
}

function blankChallenge(id = "NewStageChallenge") {
  return {
    id, status: "Draft",
    identity: { competitionGroup: "stage-group", displayName: "", targetName: "", description: "" },
    eligibility: { minLevel: 30, maxLevel: 39, minCP: 0, maxCP: 0 },
    content: { modeId: 0, bossId: "ScarredOrc", arena: "", wavePreset: "" },
    timing: { durationHours: 24, attemptDurationSeconds: 180, timerPerWave: 60 },
    rewards: { rewardPreset: "", dropTier: defaultDropTierByBracket["30-39"], materialDropVariant: "" },
    players: { groupPreset: "", minRequired: 15, players: 35, hardLimit: 50 },
    visuals: { eventGraphicUrl: "", badgeBackgroundUrl: "", immuneIcons: [] },
    advanced: { difficultyFactorPreset: defaultDifficultyFactorPresetByBracket["30-39"] || "", attemptPrices: "1,1,2,3,4", minutesLeftToUseHardLimit: 300, separateLevels: false },
  };
}
function saveDraft() {
  if (isBusy()) return;
  state.notice = null;
  if (state.pack) {
    state.savedPacks[state.pack.id] = clone(currentPack());
    persistLocal();
    if (state.storageError) toast.error("Pack could not be saved", { id: "save-draft", description: state.storageError });
    else toast.success("Challenge pack saved", { id: "save-draft", description: { key: "{name}. Pack saved locally.", values: { name: state.pack.name || t("Untitled pack") } } });
    render();
    return;
  }
  const errors = identityErrors(state.draft, state.challenges, state.selectedId);
  if (originalId() && state.draft.id !== originalId()) errors.push({ text: "Existing setup IDs cannot be renamed." });
  if (errors.length) {
    state.savedScratch[state.selectedId || "__new__"] = clone(state.draft);
    state.scratch[state.selectedId || "__new__"] = clone(state.draft);
    persistLocal();
    if (state.storageError) toast.error("Draft could not be saved", { id: "save-draft", description: state.storageError });
    else toast.warning("Draft saved with validation issues", { id: "save-draft", description: "Draft saved locally. A unique valid ID is required before deployment." });
    render();
    return;
  }
  const oldKey = state.selectedId || "__new__";
  delete state.savedScratch[oldKey];
  if (state.selectedId && state.selectedId !== state.draft.id) delete state.savedDrafts[state.selectedId];
  state.savedDrafts[state.draft.id] = clone({ ...state.draft, status: "Draft" });
  const deployed = state.remote.challenges.find((item) => item.id === state.draft.id);
  if (deployed && JSON.stringify(setupRow(deployed)) === JSON.stringify(setupRow(state.draft))) delete state.savedDrafts[state.draft.id];
  delete state.scratch[oldKey];
  state.selectedId = state.draft.id;
  syncWorkingChallenges();
  persistLocal();
  if (state.storageError) toast.error("Challenge could not be saved", { id: "save-draft", description: state.storageError });
  else toast.success("Challenge saved", { id: "save-draft", description: { key: "{id}. Draft saved locally.", values: { id: state.draft.id } } });
  render();
}
async function previewChanges() {
  if (isBusy()) return;
  invalidatePreview();
  state.view = "preview";
  state.notice = null;
  if (hasBlockingErrors()) return render();
  const diff = buildDiff();
  if (!diff.setup.length && !diff.calendar.length && !diff.pack?.length) return render();
  const request = previewRequest;
  state.previewLoading = true;
  render();
  try {
    const plan = await api("/api/preview", state.pack ? { pack: currentPack() } : { challenge: state.draft, schedule: state.schedule, originalId: originalId() });
    if (request !== previewRequest) return;
    state.plan = plan;
  } catch (error) {
    if (request === previewRequest) {
      state.notice = { variant: "red", text: error.message };
      toast.error("Preview could not be prepared", { id: "preview-error", description: error.message });
    }
  } finally {
    if (request === previewRequest) {
      state.previewLoading = false;
      render();
    }
  }
}
async function pushToStage() {
  if (isBusy() || !state.reviewed || !state.plan || hasBlockingErrors()) return;
  state.submitting = true;
  const previewId = state.plan.id;
  render();
  try {
    const job = await api("/api/deploy", { target: "stage", previewId });
    state.deploy = { status: job.status, build: job.id, log: job.log };
    state.history = [job, ...state.history.filter((item) => item.id !== job.id)];
    invalidatePreview();
    state.notice = null;
    notifyDeployment(job);
    pollDeployment();
  } catch (error) {
    state.notice = { variant: "red", text: error.message };
    invalidatePreview();
    try {
      state.remote = await api("/api/state");
      syncWorkingChallenges();
      const active = state.history.find((job) => job.previewId === previewId) || state.history.find((job) => ["Queued", "Running"].includes(job.status));
      if (active) {
        state.deploy = { status: active.status, build: active.id, log: active.log };
        if (active.previewId === previewId) state.notice = null;
        notifyDeployment(active);
        pollDeployment();
      }
    } catch {}
    if (state.notice) toast.error("STAGE push could not be confirmed", { id: "deploy-error", description: state.notice.text });
  } finally {
    state.submitting = false;
    render();
  }
}
async function pollDeployment() {
  clearTimeout(pollTimer);
  try {
    const remote = await api("/api/state");
    const job = remote.history.find((item) => item.id === state.deploy.build);
    if (!job) throw new Error("Deployment record not found. Refresh the server status.");
    state.remote = remote;
    state.deploy = { status: job.status, build: job.id, log: job.log };
    if (job.status === "Success") {
      if (job.deletion) {
        cleanupDeletion(job.deletion);
      } else if (job.packId) {
        const publishedPack = remote.packs?.find((pack) => pack.id === job.packId);
        if (publishedPack) {
          state.savedPacks[job.packId] = clone(publishedPack);
          delete state.packEdits[job.packId];
          if (state.pack?.id === job.packId) {
            state.pack = clone(publishedPack);
            state.draft = clone(publishedPack.template);
            state.schedule = clone(publishedPack.schedule);
          }
        }
      } else {
        const published = remote.challenges.find((item) => item.id === job.challengeId);
        const saved = state.savedDrafts[job.challengeId];
        if (saved && published && JSON.stringify(setupRow(saved)) === JSON.stringify(setupRow(published))) delete state.savedDrafts[job.challengeId];
        if (!state.pack && published && state.draft.id === published.id && JSON.stringify(setupRow(state.draft)) === JSON.stringify(setupRow(published))) {
          delete state.scratch[state.selectedId || "__new__"];
          delete state.savedScratch[state.selectedId || "__new__"];
          state.selectedId = published.id;
          state.draft = clone(published);
          delete state.schedule.previous;
        }
      }
      persistLocal();
    }
    if (job.status === "Failure" && job.deletion) { state.pendingRemoval = null; persistLocal(); }
    syncWorkingChallenges();
    state.notice = null;
    notifyDeployment(job);
    render();
    if (["Queued", "Running"].includes(job.status)) pollTimer = setTimeout(pollDeployment, 500);
  } catch (error) {
    state.notice = { variant: "amber", text: `${error.message} Reconnecting to check deployment status.` };
    notifyDeployment({ id: state.deploy.build, status: state.deploy.status }, error.message);
    render();
    pollTimer = setTimeout(pollDeployment, 2500);
  }
}

function cleanupDeletion({ challengeIds = [], packIds = [] }) {
  const deleted = new Set(challengeIds);
  for (const drafts of [state.savedDrafts, state.savedScratch, state.scratch]) {
    for (const [key, draft] of Object.entries(drafts)) if (deleted.has(key) || deleted.has(draft.id)) delete drafts[key];
  }
  for (const packs of [state.savedPacks, state.packEdits]) {
    for (const [id, pack] of Object.entries(packs)) {
      if (packIds.includes(id)) delete packs[id];
      else packs[id] = removePackMembers(pack, challengeIds);
    }
  }
  const emptyEditor = () => {
    const draft = clone(state.challenges[0] || blankChallenge());
    return { draft, selectedId: state.challenges[0]?.id || "", schedule: {
      challengeId: draft.id, month: state.month, day: 1, startUtc: "19:00",
      levelBracket: bracketForRange(draft.eligibility.minLevel, draft.eligibility.maxLevel) || "30-39",
    } };
  };
  syncWorkingChallenges();
  if (state.singleEditor && (deleted.has(state.singleEditor.selectedId) || deleted.has(state.singleEditor.draft.id))) state.singleEditor = emptyEditor();
  if (state.pack && packIds.includes(state.pack.id)) {
    const single = state.singleEditor || emptyEditor();
    state.pack = null;
    state.singleEditor = null;
    state.selectedId = single.selectedId;
    state.draft = clone(single.draft);
    state.schedule = clone(single.schedule);
  } else if (state.pack) {
    state.pack = removePackMembers(currentPack(), challengeIds);
  }
  if (!state.pack && (deleted.has(state.selectedId) || deleted.has(state.draft.id))) Object.assign(state, emptyEditor());
  if (deleted.has(state.schedule.previous?.challengeId)) delete state.schedule.previous;
  state.pendingRemoval = null;
  invalidatePreview();
  persistLocal();
}

function openDeletion(kind, id) {
  if (isBusy()) return;
  const item = kind === "pack" ? allPacks().find((pack) => pack.id === id) : state.challenges.find((challenge) => challenge.id === id);
  if (!item) return;
  closeOverviewMenu();
  const published = kind === "pack" ? state.remote.packs?.some((pack) => pack.id === id) : state.remote.challenges.some((challenge) => challenge.id === id);
  state.deletionDialog = { kind, id, label: kind === "pack" ? item.name : id, local: !published, includeChallenges: false,
    plan: null, loading: false, error: "", focusSelector: kind === "pack" ? `[data-pack-delete="${CSS.escape(id)}"]` : `#overview-more-${CSS.escape(id)}` };
  if (published) prepareDeletion();
  else render();
}

async function prepareDeletion() {
  const dialog = state.deletionDialog;
  if (!dialog || dialog.local || state.submitting) return;
  const request = ++deletionRequest;
  dialog.loading = true;
  dialog.plan = null;
  dialog.error = "";
  render();
  try {
    const plan = await api("/api/preview", { deletion: { kind: dialog.kind, id: dialog.id, includeChallenges: dialog.includeChallenges } });
    if (state.deletionDialog === dialog && request === deletionRequest) dialog.plan = plan;
  } catch (error) {
    if (state.deletionDialog === dialog && request === deletionRequest) dialog.error = error.message;
  } finally {
    if (state.deletionDialog === dialog && request === deletionRequest) { dialog.loading = false; render(); }
  }
}

function closeDeletion() {
  if (state.submitting) return;
  const selector = state.deletionDialog?.focusSelector;
  state.deletionDialog = null;
  deletionRequest += 1;
  render();
  if (selector) app.querySelector(selector)?.focus({ preventScroll: true });
}

async function confirmDeletion() {
  const dialog = state.deletionDialog;
  if (!dialog || dialog.loading || isBusy() || (!dialog.local && !dialog.plan)) return;
  if (dialog.local) {
    cleanupDeletion({ challengeIds: dialog.kind === "challenge" ? [dialog.id] : [], packIds: dialog.kind === "pack" ? [dialog.id] : [] });
    state.deletionDialog = null;
    state.notice = null;
    if (state.storageError) toast.error("Deletion could not be saved", { id: "delete-draft", description: state.storageError });
    else toast.success(dialog.kind === "pack" ? "Challenge pack draft deleted" : "Challenge draft deleted", { id: "delete-draft", description: dialog.label || dialog.id, rawDescription: true });
    render();
    return;
  }
  const previewId = dialog.plan.id;
  state.pendingRemoval = previewId;
  persistLocal();
  if (state.storageError) { dialog.error = state.storageError; render(); return; }
  state.submitting = true;
  dialog.error = "";
  render();
  const acceptJob = (job) => {
    state.deletionDialog = null;
    state.deploy = { status: job.status, build: job.id, log: job.log };
    state.history = [job, ...state.history.filter((item) => item.id !== job.id)];
    state.view = "history";
    invalidatePreview();
    notifyDeployment(job);
    pollDeployment();
  };
  try {
    acceptJob(await api("/api/deploy", { target: "stage", previewId }));
  } catch (error) {
    dialog.plan = null;
    dialog.error = error.message;
    try {
      state.remote = await api("/api/state");
      syncWorkingChallenges();
      const job = state.history.find((item) => item.previewId === previewId && item.deletion);
      if (job) acceptJob(job);
      else if (error.status && error.status < 500) { state.pendingRemoval = null; persistLocal(); }
    } catch {}
  } finally {
    state.submitting = false;
    render();
  }
}

function renderDeletionDialog() {
  const dialog = state.deletionDialog;
  if (!dialog) return "";
  const deletion = dialog.plan?.deletion;
  return `<dialog id="delete-dialog" class="delete-dialog" aria-labelledby="delete-title" aria-describedby="delete-description">
    <h2 id="delete-title">${t(dialog.kind === "pack" ? "Delete challenge pack?" : "Delete challenge?")}</h2>
    <p class="delete-target">${escapeHtml(dialog.label || dialog.id)}</p>
    <p id="delete-description">${t(dialog.local ? "This draft will be removed from this browser. Published data and deployment history will not change." : "Deletion will run as a STAGE build. Data is removed only after success. Previous deployment history is preserved.")}</p>
    ${dialog.kind === "pack" && !dialog.local ? `<label class="checkbox-label delete-scope"><input id="delete-pack-members" type="checkbox" data-delete-members ${dialog.includeChallenges ? "checked" : ""} ${state.submitting ? "disabled" : ""} /> ${t("Also delete generated challenges and their calendar entries")}</label>` : ""}
    <div class="delete-impact" aria-live="polite">
      ${dialog.loading ? `<p class="helper">${t("Checking deletion scope...")}</p>` : ""}
      ${deletion ? `<ul><li>${locale() === "pl-PL" ? t("To delete: {challenges} challenges, {entries} calendar entries.", { challenges: deletion.challengeCount, entries: deletion.entryCount }) : `${deletion.challengeCount} ${deletion.challengeCount === 1 ? "challenge" : "challenges"} and ${deletion.entryCount} calendar ${deletion.entryCount === 1 ? "entry" : "entries"} will be deleted.`}</li>${deletion.kind === "pack" ? `<li>${t("The pack definition will be deleted.")}</li>` : ""}${deletion.updatedPacks.length ? `<li>${locale() === "pl-PL" ? t("Membership will be removed from {count} packs.", { count: deletion.updatedPacks.length }) : `Membership will be removed from ${deletion.updatedPacks.length} ${deletion.updatedPacks.length === 1 ? "pack" : "packs"}.`}</li>` : ""}${deletion.retainedChallengeCount ? `<li>${t("{count} generated challenges and associated calendar entries will be kept.", { count: deletion.retainedChallengeCount })}</li>` : ""}</ul>` : ""}
      ${deletion?.challengeIds.length ? `<details><summary>${t("Affected Challenge IDs ({count})", { count: deletion.challengeIds.length })}</summary><ul class="delete-id-list">${deletion.challengeIds.map((id) => `<li>${escapeHtml(id)}</li>`).join("")}</ul></details>` : ""}
      ${dialog.error ? Alert({ variant: "red", children: escapeHtml(message(dialog.error)) }) : ""}
    </div>
    <div class="delete-dialog-actions">
      ${Button({ children: t("Cancel"), attrs: `id="delete-cancel" data-action="cancel-delete" autofocus ${state.submitting ? "disabled" : ""}` })}
      ${dialog.error && !dialog.local ? Button({ children: t("Refresh confirmation"), attrs: 'data-action="refresh-delete"' }) : ""}
      ${Button({ children: t(state.submitting ? "Starting deletion..." : dialog.local ? "Delete draft" : "Delete from STAGE"), variant: "danger", className: "confirm-delete", attrs: `id="delete-confirm" data-action="confirm-delete" ${dialog.loading || state.submitting || (!dialog.local && !dialog.plan) ? "disabled" : ""}` })}
    </div>
  </dialog>`;
}

function currentPack() {
  return { ...state.pack, template: state.draft, schedule: state.schedule };
}

function evaluateCurrentPack() {
  const result = evaluatePack(state.remote, currentPack());
  for (const challenge of result.challenges) {
    if (state.savedDrafts[challenge.id] && !state.remote.challenges.some((item) => item.id === challenge.id)) {
      result.validation.push({ severity: "error", field: "pack.idPrefix", challengeId: challenge.id, text: "A local single-challenge draft already uses this ID." });
    }
  }
  if (result.validation.some((item) => item.severity === "error")) result.validation = result.validation.filter((item) => item.severity !== "pass");
  return result;
}

function packEvaluation() { return renderedPack || evaluateCurrentPack(); }

function allPacks() {
  const packs = new Map((state.remote.packs || []).map((pack) => [pack.id, pack]));
  for (const pack of [...Object.values(state.savedPacks), ...Object.values(state.packEdits)]) packs.set(pack.id, pack);
  if (state.pack) packs.set(state.pack.id, currentPack());
  return [...packs.values()];
}

function openPack(id, view = "setup") {
  if (isBusy()) return;
  const pack = allPacks().find((item) => item.id === id);
  if (!pack) return;
  stashDraft();
  if (!state.pack) state.singleEditor = clone({ selectedId: state.selectedId, draft: state.draft, schedule: state.schedule });
  state.pack = clone(pack);
  state.draft = clone(pack.template);
  state.schedule = clone(pack.schedule);
  state.packCalendarMonth = pack.schedule.month;
  state.packBossQuery = "";
  state.notice = null;
  invalidatePreview();
  state.view = view;
  persistLocal();
  render();
}

function leavePack() {
  if (!state.pack) return;
  persistLocal();
  const single = state.singleEditor;
  state.pack = null;
  state.singleEditor = null;
  if (single) {
    state.selectedId = single.selectedId;
    state.draft = clone(single.draft);
    state.schedule = clone(single.schedule);
  } else {
    state.draft = clone(state.remote.challenges[0] || blankChallenge());
    state.selectedId = state.remote.challenges[0]?.id || "";
    state.schedule = { challengeId: state.draft.id, month: state.month, day: 1, startUtc: "19:00",
      levelBracket: bracketForRange(state.draft.eligibility.minLevel, state.draft.eligibility.maxLevel) || "40-49" };
  }
  invalidatePreview();
  persistLocal();
}

function newPack(sourceId = "") {
  if (isBusy()) return;
  const source = allPacks().find((item) => item.id === sourceId);
  const template = clone(source?.template || state.draft);
  let prefix = source ? `${source.idPrefix.slice(0, 52)}Copy` : "BossPack";
  const base = prefix;
  for (let number = 2; allPacks().some((pack) => pack.idPrefix === prefix) || state.challenges.some((item) => item.id.startsWith(`${prefix}-`)); number += 1) prefix = `${base}${number}`;
  const pack = {
    id: crypto.randomUUID(), name: source ? t("{name} copy", { name: source.name.slice(0, 110) }) : t("New boss pack"), idPrefix: prefix,
    namePattern: source?.namePattern || t("{boss} Trial"), bossIds: source ? [...source.bossIds] : [template.content.bossId], template,
    schedule: { month: state.schedule.month, day: state.schedule.day, startUtc: state.schedule.startUtc || "19:00",
      levelBracket: bracketForRange(template.eligibility.minLevel, template.eligibility.maxLevel) || "40-49", mode: "sequential", intervalDays: 1 },
  };
  state.packEdits[pack.id] = pack;
  openPack(pack.id);
}

function packChanged() {
  invalidatePreview();
  state.notice = null;
  persistLocal();
  render();
}

function renderPackContext() {
  return `<div class="pack-context"><div><span class="pack-context-label">${t("Challenge pack")}</span><h2>${escapeHtml(state.pack.name || t("Untitled pack"))}</h2><span class="helper">${t("{count} challenges", { count: state.pack.bossIds.length })}</span></div><div class="toolbar-left">${Button({ children: t("All packs"), attrs: 'data-view="packs"' })}${Button({ children: t("Single challenge"), attrs: 'data-action="leave-pack"' })}</div></div>`;
}

function renderPacks() {
  const packs = allPacks();
  return `<section class="view">
    <div class="toolbar challenges-toolbar">${Button({ children: `${overviewIcon("plus")}${t("New Pack")}`, variant: "primary", attrs: 'data-action="new-pack"' })}</div>
    <section class="overview-challenges" aria-labelledby="packs-title">
      <div class="overview-table-toolbar"><h2 id="packs-title">${t("Challenge Packs")}</h2><span class="helper">${locale() === "pl-PL" ? t("{count} packs", { count: packs.length }) : `${packs.length} ${packs.length === 1 ? "pack" : "packs"}`}</span></div>
      <div class="overview-table-scroll" tabindex="0" role="region" aria-label="${t("Challenge packs table")}">
        <table class="overview-table pack-list-table"><thead><tr>${["Pack", "Challenges", "Level Range", "Start (UTC)", "Status", "Actions"].map((title) => `<th scope="col">${t(title)}</th>`).join("")}</tr></thead>
        <tbody>${packs.map((pack) => {
          const published = state.remote.packs?.find((item) => item.id === pack.id);
          const deployed = published && JSON.stringify(pack) === JSON.stringify(published);
          return `<tr data-pack-row="${escapeHtml(pack.id)}"><td class="overview-id">${escapeHtml(pack.name || t("Untitled pack"))}</td><td>${pack.bossIds.length}</td><td>${escapeHtml(pack.schedule.levelBracket)}</td><td>${escapeHtml(pack.schedule.month)}-${String(pack.schedule.day).padStart(2, "0")} ${escapeHtml(pack.schedule.startUtc)}</td><td><span class="overview-status ${deployed ? "overview-status-active" : "overview-status-draft"}"><span class="overview-status-dot" aria-hidden="true"></span>${t(deployed ? "Deployed" : "Local draft")}</span></td><td><div class="overview-row-actions">
            ${Button({ className: "overview-icon-button", children: overviewIcon("pencil"), attrs: `data-pack-open="${escapeHtml(pack.id)}" aria-label="${t("Edit {name}", { name: escapeHtml(pack.name) })}" title="${t("Edit pack")}"` })}
            ${Button({ className: "overview-icon-button", children: overviewIcon("calendar-days"), attrs: `data-pack-schedule="${escapeHtml(pack.id)}" aria-label="${t("Schedule {name}", { name: escapeHtml(pack.name) })}" title="${t("Schedule pack")}"` })}
            ${Button({ className: "overview-icon-button", children: overviewIcon("copy"), attrs: `data-pack-copy="${escapeHtml(pack.id)}" aria-label="${t("Duplicate {name}", { name: escapeHtml(pack.name) })}" title="${t("Duplicate pack")}"` })}
            ${Button({ className: "overview-icon-button delete-icon-button", children: overviewIcon("trash-2"), attrs: `data-pack-delete="${escapeHtml(pack.id)}" aria-label="${t("Delete {name}", { name: escapeHtml(pack.name) })}" title="${t("Delete pack")}"` })}
          </div></td></tr>`;
        }).join("") || `<tr><td colspan="6" class="overview-empty">${t("No challenge packs yet.")}</td></tr>`}</tbody></table>
      </div>
    </section>
  </section>`;
}

function packTextField(label, key, tooltip, readonly = false) {
  const error = validateChallenge().find((item) => item.field === `pack.${key}` && item.severity === "error");
  return Field({ label, id: `pack-${key}`, tooltip, error: error?.text || "",
    control: Input({ value: state.pack[key], attrs: `id="pack-${key}" data-pack-field="${key}" ${readonly ? "readonly" : ""}` }) });
}

function renderPackEditor() {
  const query = state.packBossQuery.trim().toLowerCase();
  return section("Pack", t("Shared configuration"), `<div class="form-grid">
    ${packTextField("Pack name", "name", "Name of this reusable boss pack.")}
    ${packTextField("Challenge ID prefix", "idPrefix", "Generated IDs use this prefix followed by the boss ID. A deployed prefix is fixed.", state.remote.packs?.some((pack) => pack.id === state.pack.id))}
    ${packTextField("Challenge name pattern", "namePattern", "Use {boss} for the boss name and optionally {index} for its position, for example {boss} Trial.")}
  </div>`) + section("Bosses", `${t("{count} selected", { count: state.pack.bossIds.length })}`, `<div class="pack-boss-toolbar">
    ${Input({ value: state.packBossQuery, attrs: `id="pack-boss-search" data-pack-search aria-label="${t("Search pack bosses")}" placeholder="${t("Search bosses...")}"` })}
    ${Button({ children: t("Select visible"), attrs: 'data-action="pack-select-visible"' })}
    ${Button({ children: t("Clear"), attrs: 'data-action="pack-clear-bosses"' })}
    </div><div class="pack-boss-options">${bossOptions.map((boss) => `<label class="pack-boss-option" ${boss.label.toLowerCase().includes(query) ? "" : "hidden"}><input type="checkbox" data-pack-boss="${escapeHtml(boss.value)}" ${state.pack.bossIds.includes(boss.value) ? "checked" : ""} /><span>${escapeHtml(boss.label)}</span></label>`).join("")}</div>
    <details class="pack-members" data-pack-members><summary>${t("Selected challenges ({count})", { count: state.pack.bossIds.length })}</summary>${renderPackMembers(true)}</details>`);
}

function renderPackMembers(reorder = false, members = generatePack(currentPack())) {
  return `<div class="table-wrap"><table class="pack-member-table"><thead><tr>${["#", "Boss", "Challenge ID", "Name", "Start (UTC)", ...(reorder ? ["Order"] : [])].map((title) => `<th scope="col">${t(title)}</th>`).join("")}</tr></thead><tbody>${members.map(({ challenge, schedule }, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(bossLabel(challenge.content.bossId))}</td><td>${escapeHtml(challenge.id)}</td><td>${escapeHtml(challenge.identity.displayName)}</td><td>${schedule.month ? `${schedule.month}-${String(schedule.day).padStart(2, "0")} ${escapeHtml(schedule.startUtc)}` : t("Invalid date")}</td>${reorder ? `<td><div class="toolbar-left">${Button({ children: overviewIcon("chevron-left"), className: "pack-order-up", attrs: `data-pack-order="${index}" data-direction="-1" title="${t("Move up")}" aria-label="${t("Move {name} up", { name: escapeHtml(bossLabel(challenge.content.bossId)) })}" ${index === 0 ? "disabled" : ""}` })}${Button({ children: overviewIcon("chevron-right"), className: "pack-order-down", attrs: `data-pack-order="${index}" data-direction="1" title="${t("Move down")}" aria-label="${t("Move {name} down", { name: escapeHtml(bossLabel(challenge.content.bossId)) })}" ${index === members.length - 1 ? "disabled" : ""}` })}</div></td>` : ""}</tr>`).join("") || `<tr><td colspan="${reorder ? 6 : 5}" class="empty-state">${t("No bosses selected.")}</td></tr>`}</tbody></table></div>`;
}

function classForStatus(status) {
  return status === "Draft" ? "status-draft" : status === "Ready" ? "status-ready" : "status-scheduled";
}

function html(strings, ...values) {
  return strings.reduce((result, part, index) => result + part + (values[index] ?? ""), "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render() {
  renderedPack = state.pack ? evaluateCurrentPack() : null;
  const active = document.activeElement;
  const calendarShell = app.querySelector(".calendar-shell");
  const calendarScroll = calendarShell ? { left: calendarShell.scrollLeft, top: calendarShell.scrollTop } : null;
  const overviewScrollLeft = app.querySelector(".overview-table-scroll")?.scrollLeft || 0;
  const advancedOpen = app.querySelector("[data-advanced]")?.open;
  const bossScroll = app.querySelector(".pack-boss-options")?.scrollTop || 0;
  const membersOpen = app.querySelector("[data-pack-members]")?.open;
  const openDiffs = [...app.querySelectorAll("[data-pack-diff][open]")].map((element) => element.dataset.packDiff);
  const focusId = active?.id;
  const activeSelector =
    active?.dataset?.field
      ? `[data-field="${CSS.escape(active.dataset.field)}"]`
      : active?.dataset?.numberField
        ? `[data-number-field="${CSS.escape(active.dataset.numberField)}"]`
        : active?.dataset?.schedule
          ? `[data-schedule="${CSS.escape(active.dataset.schedule)}"]`
          : "";
  const selectionStart = typeof active?.selectionStart === "number" ? active.selectionStart : null;
  const selectionEnd = typeof active?.selectionEnd === "number" ? active.selectionEnd : null;

  app.innerHTML = html`
    <div class="app-shell">
      ${renderSidebar()}
      <main class="main">
        ${renderTopbar()}
        <div class="content">
          <div role="status" aria-live="polite">
            ${state.storageError ? Alert({ variant: "amber", children: escapeHtml(message(state.storageError)) }) : ""}
            ${state.notice ? Alert({ variant: state.notice.variant, children: escapeHtml(message(state.notice.text)) }) : ""}
          </div>
          ${!state.ready ? `<div class="notice">${state.loading ? t("Loading challenges...") : Button({ children: t("Retry connection"), attrs: 'data-action="retry-load"' })}</div>` :
            `<fieldset class="workflow-controls" ${isBusy() && state.view !== "settings" ? "disabled" : ""}>${renderView()}</fieldset>`}
        </div>
      </main>
    </div>
    ${renderDeletionDialog()}
  `;
  // Reopen collapsible sections before restoring focus: an input inside a closed <details>
  // cannot take focus, which made typing in Advanced settings stop after every keystroke.
  if (advancedOpen) app.querySelector("[data-advanced]")?.setAttribute("open", "");
  if (membersOpen) app.querySelector("[data-pack-members]")?.setAttribute("open", "");
  app.querySelectorAll("[data-pack-diff]").forEach((element) => { element.open = openDiffs.includes(element.dataset.packDiff); });
  const restoredSelector = activeSelector || (focusId ? `#${CSS.escape(focusId)}` : "");
  if (restoredSelector) {
    const nextActive = app.querySelector(restoredSelector);
    if (nextActive) {
      if (active?.matches("input, textarea, select") && !active.matches("[data-preference]") && nextActive.tagName === active.tagName) {
        for (const name of ["aria-invalid", "aria-describedby", "class", "placeholder", "title"]) {
          const value = nextActive.getAttribute(name);
          if (value === null) active.removeAttribute(name);
          else active.setAttribute(name, value);
        }
        nextActive.replaceWith(active);
        active.focus({ preventScroll: true });
      } else nextActive.focus({ preventScroll: true });
      if (selectionStart !== null && active?.matches('input[type="text"], textarea')) active.setSelectionRange(selectionStart, selectionEnd);
    }
  }
  const nextShell = app.querySelector(".calendar-shell");
  if (calendarScroll && nextShell) {
    nextShell.scrollLeft = calendarScroll.left;
    nextShell.scrollTop = calendarScroll.top;
  } else if (nextShell) {
    const selected = nextShell.querySelector(".cal-cell.selected");
    if (selected) {
      const cell = selected.getBoundingClientRect();
      const shell = nextShell.getBoundingClientRect();
      if (cell.bottom > shell.bottom) nextShell.scrollTop = cell.top - shell.top - 42;
      if (cell.right > shell.right) nextShell.scrollLeft = cell.right - shell.right + 8;
    }
  }
  const overviewTable = app.querySelector(".overview-table-scroll");
  if (overviewTable) overviewTable.scrollLeft = overviewScrollLeft;
  const bossOptions = app.querySelector(".pack-boss-options");
  if (bossOptions) bossOptions.scrollTop = bossScroll;
  positionOverviewMenu();
  const deletionDialog = app.querySelector("#delete-dialog");
  if (deletionDialog) {
    deletionDialog.showModal();
    if (focusId && active?.closest("#delete-dialog")) deletionDialog.querySelector(`#${CSS.escape(focusId)}`)?.focus({ preventScroll: true });
  }
  renderedPack = null;
}

function renderSidebar() {
  const items = [
    ["overview", "Overview"],
    ["challenges", "Challenges"],
    ["packs", "Challenge Packs"],
    ["setup", "Challenge Setup"],
    ["calendar", "Calendar"],
    ["preview", "Preview"],
    ["history", "Deploy History"],
    ["settings", "Settings"],
  ];
  return html`
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">CM</div>
        <div>
          <div class="brand-title">Challenge Manager</div>
          <div class="brand-subtitle">${t("Internal browser tool")}</div>
        </div>
      </div>
      <nav class="nav" aria-label="${t("Main navigation")}">
        ${items.map(([id, label]) => `<button class="${state.view === id ? "active" : ""}" data-view="${id}" type="button" ${!state.ready ? "disabled" : ""} aria-current="${state.view === id ? "page" : "false"}">${t(label)}</button>`).join("")}
      </nav>
      <div class="side-note">
        ${t("STAGE only. Production is not exposed in UI and non-STAGE targets are rejected by the deploy adapter.")}
      </div>
    </aside>
  `;
}

function renderTopbar() {
  const titles = {
    overview: ["Workflow Overview", "Create, schedule, validate, preview, deploy"],
    challenges: ["Challenge List", "Search and edit mock ChallengeSetupConfig rows"],
    packs: ["Challenge Packs", "Shared setup and batch scheduling"],
    setup: ["Challenge Setup", "Grouped editor over the wide setup sheet"],
    calendar: ["Challenge Calendar", "Append-safe monthly schedule matrix"],
    preview: ["Preview & Deploy", "Review exact sheet mutations before STAGE push"],
    history: ["Deploy History", "Mock Jenkins status and audit trail"],
    settings: ["Settings", "Local adapters and STAGE-only guardrails"],
  };
  const [title, subtitle] = state.pack && state.view === "setup" ? ["Pack Setup", state.pack.name || t("New pack")] : titles[state.view];
  return html`
    <header class="topbar">
      <div class="topbar-heading">
        <div class="eyebrow">${state.pack && state.view === "setup" ? escapeHtml(subtitle) : t(subtitle)}</div>
        <div class="topbar-title-row">
          <h1>${t(title)}</h1>
          ${Badge({ children: "STAGE", variant: "stage", className: "topbar-stage" })}
        </div>
      </div>
      <details class="profile-menu" data-profile-menu>
        <summary class="profile-trigger" aria-label="${t("Profile for Jason D.")}">
          <span class="profile-avatar" aria-hidden="true">JD</span>
          <span class="profile-identity">
            <span class="profile-name">Jason D.</span>
            <span class="profile-role">${t("Game Ops")}</span>
          </span>
          ${overviewIcon("chevron-down")}
        </summary>
        <div class="profile-popover">
          <div class="profile-popover-heading">
            <span class="profile-name">Jason D.</span>
            <span class="profile-role">${t("Demo account")}</span>
          </div>
          <button type="button" data-view="settings">${overviewIcon("settings")}${t("Settings")}</button>
        </div>
      </details>
    </header>
  `;
}

function renderView() {
  if (state.view === "packs") return renderPacks();
  if (state.view === "overview") return renderOverview();
  if (state.view === "challenges") return renderChallenges();
  if (state.view === "setup") return renderSetup();
  if (state.view === "calendar") return renderCalendar();
  if (state.view === "preview") return renderPreview();
  if (state.view === "history") return renderHistory();
  return renderSettings();
}

function renderOverview() {
  const entries = calendarEntries(state.remote.calendar);
  const now = Date.now();
  const activeCount = state.challenges.filter((challenge) => overviewStatus(challenge, entries, now) === "Active").length;
  const previousMonth = shiftMonth(state.month, -1);
  const entryCount = (month) => entries.filter((entry) => entry.month === month).length;
  const deploys = state.history.map((item) => ({ ...item, timestamp: historyTimestamp(item) }));
  const deployCount = (month) => deploys.filter((item) => item.timestamp && new Date(item.timestamp).toISOString().slice(0, 7) === month).length;
  const finished = deploys.filter((item) => ["Success", "Failure"].includes(item.status));
  const failed = finished.filter((item) => item.status === "Failure").length;
  const versus = t("vs {month}", { month: monthLabel(previousMonth, { month: "short", year: "numeric" }) });
  return html`
    <section class="view overview-dashboard">
      <div class="toolbar">
        <div>
          <h2>${t("STAGE challenge workflow")}</h2>
          <p class="helper">${t("Mock data preserves the spreadsheet mental model while hiding wide rows behind safer controls.")}</p>
        </div>
        ${Button({ children: `${overviewIcon("plus")}<span>${t("New Challenge")}</span>`, variant: "primary", attrs: 'data-action="new-challenge"' })}
      </div>
      <div class="card dash-kpis" role="list">
        ${kpiTile({ icon: "zap", label: "Active Challenges", value: activeCount, detail: t("{count} challenges in setup", { count: state.challenges.length }) })}
        ${kpiTile({ icon: "calendar-days", label: "Scheduled This Month", value: entryCount(state.month), delta: entryCount(state.month) - entryCount(previousMonth), detail: versus })}
        ${kpiTile({ icon: "rocket", label: "STAGE Deploys", value: deployCount(state.month), delta: deployCount(state.month) - deployCount(previousMonth), detail: versus })}
        ${kpiTile({ icon: "circle-check", label: "Deploy Success Rate", value: finished.length ? `${Math.round(((finished.length - failed) / finished.length) * 100)}%` : "—",
          detail: finished.length ? t("{failed} failed of {count} builds", { failed, count: finished.length }) : t("No finished builds yet") })}
      </div>
      <div class="dash-grid">
        ${renderScheduleChart(entries)}
        ${renderBossUsage(entries)}
        ${renderRecentDeploys(deploys, now)}
        ${renderMonthStreak(entries, now)}
      </div>
      ${renderChallengeList()}
    </section>
  `;
}

function shiftMonth(month, delta) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthLabel(month, options) {
  return new Intl.DateTimeFormat(locale(), { ...options, timeZone: "UTC" }).format(Date.parse(`${month}-01T00:00:00Z`));
}

// Fixture builds use "YYYY-MM-DD HH:mm UTC"; server builds use ISO timestamps.
function historyTimestamp(item) {
  const timestamp = Date.parse(String(item.time || "").replace(/ UTC$/, "Z").replace(" ", "T"));
  return Number.isFinite(timestamp) ? timestamp : null;
}

// The chart window: three months before the selected month, the month itself and two ahead.
function overviewMonths() {
  return Array.from({ length: 6 }, (_, index) => shiftMonth(state.month, index - 3));
}

function kpiTile({ icon, label, value, delta, detail }) {
  return html`
    <div class="dash-kpi" role="listitem">
      <span class="dash-kpi-icon">${overviewIcon(icon)}</span>
      <div class="dash-kpi-body">
        <div class="summary-label">${t(label)}</div>
        <div class="dash-kpi-value"><span class="summary-value">${escapeHtml(value)}</span>${delta === undefined ? "" : deltaPill(delta)}</div>
        <div class="summary-detail">${escapeHtml(detail)}</div>
      </div>
    </div>
  `;
}

function deltaPill(delta) {
  const tone = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const paths = {
    up: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17" /><path d="M16 7h6v6" />',
    down: '<path d="M22 17 13.5 8.5 8.5 13.5 2 7" /><path d="M16 17h6v-6" />',
    flat: '<path d="M5 12h14" />',
  };
  const text = delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "0";
  return `<span class="dash-delta dash-delta-${tone}"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[tone]}</svg>${text}</span>`;
}

function packChallengeIds() {
  return new Set((state.remote.packs || []).flatMap((pack) => pack.challengeIds || pack.bossIds.map((boss) => `${pack.idPrefix}-${boss}`)));
}

function dashCardHead(id, title, subtitle, action = "") {
  return html`
    <div class="dash-card-head">
      <div>
        <h2 id="${id}">${t(title)}</h2>
        ${subtitle ? `<p class="helper">${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${action}
    </div>
  `;
}

function dashLink(view, label) {
  return `<button type="button" class="dash-link" data-view="${view}">${t(label)}${overviewIcon("arrow-right")}</button>`;
}

function renderScheduleChart(entries) {
  const packIds = packChallengeIds();
  const months = overviewMonths();
  const rows = months.map((month) => {
    const inMonth = entries.filter((entry) => entry.month === month);
    const pack = inMonth.filter((entry) => packIds.has(entry.challengeId)).length;
    return { month, single: inMonth.length - pack, pack, total: inMonth.length };
  });
  // The tallest month fills ~80% of the track so its tooltip stays inside the plot.
  const scale = Math.max(1, ...rows.map((row) => row.total)) / 0.8;
  const range = `${monthLabel(months[0], { month: "short" })} – ${monthLabel(months.at(-1), { month: "short", year: "numeric" })}`;
  const legend = html`
    <ul class="dash-legend">
      <li><span class="dash-swatch dash-tone-1" aria-hidden="true"></span>${t("Single challenges")}</li>
      <li><span class="dash-swatch dash-tone-2" aria-hidden="true"></span>${t("Pack challenges")}</li>
    </ul>
  `;
  return html`
    <section class="card dash-card dash-schedule" aria-labelledby="dash-schedule-title">
      ${dashCardHead("dash-schedule-title", "Schedule overview", t("Calendar entries per month, {range}", { range }), legend)}
      <div class="dash-plot" role="list">
        ${rows.map((row, index) => {
          const height = `${((row.total / scale) * 100).toFixed(1)}%`;
          const name = monthLabel(row.month, { month: "long", year: "numeric" });
          const edge = index === 0 ? "first" : index === rows.length - 1 ? "last" : "";
          return html`
            <div class="dash-col ${row.month === state.month ? "current" : ""} ${edge}" role="listitem" tabindex="0" style="--h: ${height}"
              aria-label="${escapeHtml(t("{month}: {total} entries, {single} single, {pack} from packs", { ...row, month: name }))}">
              <div class="dash-track" aria-hidden="true">
                <span class="dash-band"></span>
                <span class="dash-stack">
                  ${row.single ? `<span class="dash-seg dash-tone-1" style="flex-grow: ${row.single}"></span>` : ""}
                  ${row.pack ? `<span class="dash-seg dash-tone-2" style="flex-grow: ${row.pack}"></span>` : ""}
                </span>
                <span class="dash-tip"><strong>${row.total}</strong><span class="dash-tip-detail">${escapeHtml(name)} · <span class="dash-swatch dash-tone-1"></span>${row.single} <span class="dash-swatch dash-tone-2"></span>${row.pack}</span></span>
              </div>
              <span class="dash-col-label" aria-hidden="true">${escapeHtml(monthLabel(row.month, { month: "short" }))}</span>
            </div>
          `;
        }).join("")}
      </div>
      ${rows.some((row) => row.total) ? "" : `<p class="dash-empty">${t("No calendar entries in this period.")}</p>`}
    </section>
  `;
}

function renderBossUsage(entries) {
  const months = new Set(overviewMonths());
  const bossById = new Map([...state.challenges, ...state.remote.challenges].map((challenge) => [challenge.id, challenge.content.bossId]));
  const bossName = (id) => (state.references?.bosses || bossOptions).find((boss) => boss.value === id)?.label || id;
  const counts = new Map();
  for (const entry of entries) {
    if (!months.has(entry.month)) continue;
    const boss = bossById.get(entry.challengeId) || "";
    counts.set(boss, (counts.get(boss) || 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = ranked.slice(0, ranked.length > 4 ? 3 : 4);
  const otherCount = ranked.slice(shown.length).reduce((sum, [, count]) => sum + count, 0);
  const slices = [
    ...shown.map(([boss, count], index) => ({ label: boss ? bossName(boss) : t("No setup config"), count, tone: String(index + 1) })),
    ...(otherCount ? [{ label: t("Other bosses"), count: otherCount, tone: "other" }] : []),
  ];
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const percent = (count) => `${Math.round((count / total) * 100)}%`;
  // Round caps extend each arc by half the stroke, so the gap must exceed the stroke width.
  const radius = 46, stroke = 11, circumference = 2 * Math.PI * radius, gap = slices.length > 1 ? stroke + 5 : 0;
  let offset = 0;
  const arcs = slices.map((slice) => {
    const length = (slice.count / total) * circumference;
    const arc = `<circle class="dash-arc dash-stroke-${slice.tone}" cx="60" cy="60" r="${radius}" stroke-width="${stroke}"
      stroke-dasharray="${Math.max(length - gap, 0.01).toFixed(2)} ${circumference.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"
      ${slices.length > 1 ? 'stroke-linecap="round"' : ""}><title>${escapeHtml(`${slice.label}: ${slice.count} (${percent(slice.count)})`)}</title></circle>`;
    offset += length;
    return arc;
  });
  return html`
    <section class="card dash-card dash-bosses" aria-labelledby="dash-bosses-title">
      ${dashCardHead("dash-bosses-title", "Boss usage", t("Share of calendar entries in the same period"))}
      <div class="dash-donut">
        <svg viewBox="0 0 120 120" role="img" aria-label="${escapeHtml(slices.map((slice) => `${slice.label} ${percent(slice.count)}`).join(", ") || t("No calendar entries in this period."))}">
          <circle class="dash-donut-track" cx="60" cy="60" r="${radius}" stroke-width="${stroke}" />
          <g transform="rotate(-90 60 60)">${arcs.join("")}</g>
        </svg>
        <div class="dash-donut-center" aria-hidden="true"><strong>${total}</strong><span>${t("total")}</span></div>
      </div>
      ${total ? html`
        <ul class="dash-share-list">
          ${slices.map((slice) => `<li><span class="dash-swatch dash-tone-${slice.tone}" aria-hidden="true"></span><span class="dash-share-name">${escapeHtml(slice.label)}</span><span class="dash-share-count">${slice.count}</span><strong>${percent(slice.count)}</strong></li>`).join("")}
        </ul>
      ` : `<p class="dash-empty">${t("No calendar entries in this period.")}</p>`}
    </section>
  `;
}

function relativeTime(timestamp, now) {
  const seconds = Math.round((timestamp - now) / 1000);
  const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  const [unit, size] = units.find(([, length]) => Math.abs(seconds) >= length) || ["minute", 60];
  return new Intl.RelativeTimeFormat(locale(), { numeric: "auto" }).format(Math.round(seconds / size), unit);
}

function renderRecentDeploys(deploys, now) {
  const recent = [...deploys].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 4);
  const tone = (status) => (status === "Success" ? "overview-status-active" : status === "Failure" ? "overview-status-disabled" : "overview-status-ready");
  return html`
    <section class="card dash-card dash-activity" aria-labelledby="dash-activity-title">
      ${dashCardHead("dash-activity-title", "Recent deployments", "", dashLink("history", "View all"))}
      ${recent.length ? html`
        <ul class="dash-activity-list">
          ${recent.map((item) => {
            const kind = item.deletion ? "deletion" : item.packId ? "pack" : "challenge";
            return html`
              <li>
                <span class="dash-activity-icon dash-activity-${kind}" aria-hidden="true">${overviewIcon({ deletion: "trash-2", pack: "layers", challenge: "rocket" }[kind])}</span>
                <div class="dash-activity-text">
                  <strong>${escapeHtml(item.packName || item.challengeId)}</strong>
                  <span>${escapeHtml(item.id)} · ${t({ deletion: "Deletion", pack: "Pack deploy", challenge: "Challenge deploy" }[kind])}</span>
                </div>
                <div class="dash-activity-meta">
                  <span class="overview-status ${tone(item.status)}"><span class="overview-status-dot" aria-hidden="true"></span>${t(item.status)}</span>
                  ${item.timestamp ? `<time datetime="${new Date(item.timestamp).toISOString()}" title="${escapeHtml(item.time)}">${escapeHtml(relativeTime(item.timestamp, now))}</time>` : ""}
                </div>
              </li>
            `;
          }).join("")}
        </ul>
      ` : `<p class="dash-empty">${t("No deployments yet.")}</p>`}
    </section>
  `;
}

function renderMonthStreak(entries, now) {
  const month = state.month;
  const [year, number] = month.split("-").map(Number);
  const weekStart = locale() === "pl-PL" ? 1 : 0;
  const leading = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() - weekStart + 7) % 7;
  // 2024-01-07 is a Sunday, so the offset yields a Sunday- or Monday-first header.
  const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale(), { weekday: "narrow", timeZone: "UTC" }).format(Date.UTC(2024, 0, 7 + weekStart + index)));
  const counts = new Map();
  entries.filter((entry) => entry.month === month).forEach((entry) => counts.set(entry.day, (counts.get(entry.day) || 0) + 1));
  const today = new Date(now).toISOString().slice(0, 10);
  const dateOf = (day) => `${month}-${String(day).padStart(2, "0")}`;
  const completed = [...counts.keys()].filter((day) => dateOf(day) < today).length;
  const days = Array.from({ length: monthDays(month) }, (_, index) => {
    const day = index + 1;
    const count = counts.get(day) || 0;
    const classes = ["dash-day", count && "scheduled", count && dateOf(day) < today && "past", dateOf(day) === today && "today"].filter(Boolean).join(" ");
    const label = count ? t("Day {day}: {count} calendar entries", { day, count }) : "";
    return `<span class="${classes}" ${label ? `title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"` : 'aria-hidden="true"'}>${day}</span>`;
  });
  return html`
    <section class="card dash-card dash-streak" aria-labelledby="dash-streak-title">
      ${dashCardHead("dash-streak-title", "Monthly schedule", monthLabel(month, { month: "long", year: "numeric" }), dashLink("calendar", "Open calendar"))}
      <div class="dash-streak-summary">
        <p><strong>${counts.size}</strong> ${t("/ {days} days with entries", { days: monthDays(month) })}</p>
        <span class="dash-done-chip">${overviewIcon("circle-check")}${t("{count} completed", { count: completed })}</span>
      </div>
      <div class="dash-days">
        ${weekdays.map((day) => `<span class="dash-weekday" aria-hidden="true">${escapeHtml(day)}</span>`).join("")}
        ${'<span class="dash-day blank" aria-hidden="true"></span>'.repeat(leading)}
        ${days.join("")}
      </div>
    </section>
  `;
}

function overviewIcon(name) {
  return `<img class="overview-icon" src="/src/icons/${name}.svg" width="18" height="18" alt="" aria-hidden="true" />`;
}

function overviewStatus(challenge, entries, now) {
  if (challenge.status === "Disabled") return "Disabled";
  const status = challengeStatus(challenge);
  if (status === "Draft") return status;
  const duration = challenge.timing.durationHours * 3600000;
  const active = entries.some((entry) => {
    const start = scheduleTimestamp(entry);
    return entry.challengeId === challenge.id && start <= now && now < start + duration;
  });
  return active ? "Active" : status;
}

function overviewDate(challengeId) {
  const entry = nextStart(state.remote.calendar, challengeId);
  if (!entry) return '<span class="overview-no-date">&mdash;</span>';
  const timestamp = scheduleTimestamp(entry);
  const date = new Intl.DateTimeFormat(locale(), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(timestamp);
  return `<time datetime="${new Date(timestamp).toISOString()}">${date} ${entry.startUtc}</time>`;
}

function challengeListState() {
  return state.challengeLists[state.view] || state.challengeLists.overview;
}

function overviewFilter(name, placeholder, options) {
  return `<select class="select overview-filter" id="overview-filter-${name}" data-overview-filter="${name}" aria-label="${t(name === "status" ? "Filter by status" : "Filter by boss")}">
    <option value="">${t(placeholder)}</option>
    ${options.map(({ value, label }) => `<option value="${escapeHtml(value)}" ${challengeListState()[name] === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
  </select>`;
}

function renderChallengeList() {
  const list = challengeListState();
  const { query, status, boss } = list;
  const normalizedQuery = query.trim().toLowerCase();
  const entries = calendarEntries(state.remote.calendar);
  const now = Date.now();
  const matches = state.challenges.map((challenge) => ({ challenge, status: overviewStatus(challenge, entries, now) }))
    .filter((row) => {
      const label = bossOptions.find((option) => option.value === row.challenge.content.bossId)?.label || "";
      const text = [row.challenge.id, row.challenge.identity.displayName, row.challenge.content.bossId, label].join(" ").toLowerCase();
      return (!status || row.status === status) && (!boss || row.challenge.content.bossId === boss) && text.includes(normalizedQuery);
    });
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.max(1, Math.min(list.page, pageCount));
  list.page = page;
  const rows = matches.slice((page - 1) * pageSize, page * pageSize);
  const bossFilters = [...new Set(state.challenges.map((challenge) => challenge.content.bossId))]
    .map((value) => ({ value, label: bossOptions.find((option) => option.value === value)?.label || value }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const statuses = ["Active", "Scheduled", "Ready", "Draft", "Disabled"].map((value) => ({ value, label: t(value) }));
  const first = matches.length ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, matches.length);
  const filtered = query || status || boss;
  if (!rows.some((row) => row.challenge.id === list.menuId)) list.menuId = null;
  return html`
    <section class="overview-challenges" aria-labelledby="overview-challenges-title">
      <div class="overview-table-toolbar">
        <h2 id="overview-challenges-title">${t("Challenges")}</h2>
        <div class="overview-filters">
          <div class="overview-search">
            ${overviewIcon("search")}
            ${Input({ value: query, attrs: `id="overview-search" data-overview-query aria-label="${t("Search challenges")}" placeholder="${t("Search challenges...")}"` })}
          </div>
          ${overviewFilter("status", "All Statuses", statuses)}
          ${overviewFilter("boss", "All Bosses", bossFilters)}
        </div>
      </div>
      <div class="overview-table-scroll" tabindex="0" role="region" aria-label="${t("Challenges table")}">
        <table class="overview-table">
          <colgroup><col class="overview-col-id" /><col class="overview-col-boss" /><col class="overview-col-level" /><col class="overview-col-status" /><col class="overview-col-date" /><col class="overview-col-actions" /></colgroup>
          <thead><tr>${["Challenge ID", "Boss", "Level Range", "Status", "Next Start (UTC)", "Actions"].map((label) => `<th scope="col">${t(label)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows.length ? rows.map(({ challenge, status: rowStatus }) => html`
              <tr data-overview-row="${escapeHtml(challenge.id)}">
                <td class="overview-id" title="${escapeHtml(challenge.identity.displayName)}">${escapeHtml(challenge.id)}</td>
                <td>${escapeHtml(challenge.content.bossId)}</td>
                <td class="overview-level">${escapeHtml(challenge.eligibility.minLevel)} &ndash; ${escapeHtml(challenge.eligibility.maxLevel)}</td>
                <td><span class="overview-status overview-status-${rowStatus.toLowerCase()}"><span class="overview-status-dot" aria-hidden="true"></span>${t(rowStatus)}</span></td>
                <td class="overview-date">${overviewDate(challenge.id)}</td>
                <td><div class="overview-row-actions">
                  ${Button({ className: "overview-icon-button", children: overviewIcon("pencil"), attrs: `data-edit="${escapeHtml(challenge.id)}" title="${t("Edit challenge")}" aria-label="${t("Edit {name}", { name: escapeHtml(challenge.id) })}"` })}
                  ${Button({ className: "overview-icon-button", children: overviewIcon("ellipsis"), attrs: `id="overview-more-${escapeHtml(challenge.id)}" data-overview-more="${escapeHtml(challenge.id)}" title="${t("More actions")}" aria-label="${t("More actions for {name}", { name: escapeHtml(challenge.id) })}" aria-haspopup="menu" aria-expanded="${list.menuId === challenge.id}" ${list.menuId === challenge.id ? 'aria-controls="overview-action-menu"' : ""}` })}
                </div></td>
              </tr>
            `).join("") : `<tr><td colspan="6" class="overview-empty">${t("No challenges found.")}${filtered ? Button({ children: t("Clear filters"), attrs: 'data-overview-reset' }) : ""}</td></tr>`}
          </tbody>
        </table>
      </div>
      <footer class="overview-table-footer">
        <p class="overview-result-count" aria-live="polite">${t("Showing {first}-{last} of {count} challenges", { first, last, count: matches.length })}</p>
        ${renderOverviewPagination(page, pageCount)}
      </footer>
      ${list.menuId ? html`
        <div class="overview-action-menu" id="overview-action-menu" role="menu" aria-label="${t("Challenge actions")}">
          <button type="button" role="menuitem" data-overview-schedule="${escapeHtml(list.menuId)}">${overviewIcon("calendar-days")}${t("Schedule challenge")}</button>
          <button type="button" role="menuitem" data-overview-copy="${escapeHtml(list.menuId)}">${overviewIcon("copy")}${t("Copy ID")}</button>
          <button type="button" role="menuitem" class="delete-menu-item" data-challenge-delete="${escapeHtml(list.menuId)}">${overviewIcon("trash-2")}${t("Delete challenge")}</button>
        </div>
      ` : ""}
    </section>
  `;
}

function renderOverviewPagination(page, count) {
  const numbers = count <= 7 ? Array.from({ length: count }, (_, index) => index + 1) :
    [...new Set([1, count, page - 1, page, page + 1, ...(page <= 3 ? [2, 3, 4] : []), ...(page >= count - 2 ? [count - 3, count - 2, count - 1] : [])])]
      .filter((number) => number >= 1 && number <= count).sort((a, b) => a - b);
  return html`<nav class="overview-pagination" aria-label="${t("Challenges pagination")}">
    ${Button({ className: "overview-page-button", children: overviewIcon("chevron-left"), attrs: `id="overview-previous-page" data-overview-page="${page - 1}" title="${t("Previous page")}" aria-label="${t("Previous page")}" ${page === 1 ? "disabled" : ""}` })}
    ${numbers.map((number, index) => `${index && number - numbers[index - 1] > 1 ? '<span class="overview-page-gap" aria-hidden="true">&hellip;</span>' : ""}${Button({ className: `overview-page-button ${number === page ? "current" : ""}`, children: number, attrs: `id="overview-page-${number}" data-overview-page="${number}" aria-label="${t("Page {number}", { number })}" ${number === page ? 'aria-current="page"' : ""}` })}`).join("")}
    ${Button({ className: "overview-page-button", children: overviewIcon("chevron-right"), attrs: `id="overview-next-page" data-overview-page="${page + 1}" title="${t("Next page")}" aria-label="${t("Next page")}" ${page === count ? "disabled" : ""}` })}
  </nav>`;
}

function positionOverviewMenu() {
  const menu = app.querySelector("#overview-action-menu");
  const trigger = document.getElementById(`overview-more-${challengeListState().menuId}`);
  if (!menu || !trigger) return;
  const anchor = trigger.getBoundingClientRect();
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(12, Math.min(innerWidth - bounds.width - 12, anchor.right - bounds.width))}px`;
  menu.style.top = `${Math.max(12, anchor.bottom + bounds.height + 6 <= innerHeight ? anchor.bottom + 6 : anchor.top - bounds.height - 6)}px`;
}

function closeOverviewMenu(restoreFocus = false) {
  const list = challengeListState();
  if (!list.menuId) return;
  const trigger = document.getElementById(`overview-more-${list.menuId}`);
  list.menuId = null;
  app.querySelector("#overview-action-menu")?.remove();
  trigger?.setAttribute("aria-expanded", "false");
  trigger?.removeAttribute("aria-controls");
  if (restoreFocus) trigger?.focus({ preventScroll: true });
}

function renderChallenges() {
  return html`
    <section class="view">
      <div class="toolbar challenges-toolbar">
        ${Button({ children: `${overviewIcon("plus")}<span>${t("New Challenge")}</span>`, variant: "primary", attrs: 'data-action="new-challenge"' })}
      </div>
      ${renderChallengeList()}
    </section>
  `;
}

function challengeStatus(challenge) {
  if (challenge.status === "Draft" || state.savedDrafts[challenge.id] || validateModel(challenge).some((item) => item.severity === "error")) return "Draft";
  return nextStart(state.remote.calendar, challenge.id) ? "Scheduled" : "Ready";
}

function renderSetup() {
  return html`
    <section class="editor-layout">
      <div class="section-stack">
        ${state.pack ? renderPackContext() : ""}
        ${state.pack ? renderPackEditor() : ""}
        ${renderIdentitySection()}
        ${renderEligibilitySection()}
        ${renderContentSection()}
        ${renderTimingSection()}
        ${renderRewardsSection()}
        ${renderPlayersSection()}
        ${renderVisualsSection()}
        ${renderAdvancedSection()}
      </div>
      <aside class="rail">
        ${renderValidationCard()}
        ${Card({
          children: CardContent({
            className: "section-stack",
            children: html`
            <p class="helper">${t(isDirty() ? "Unsaved changes" : state.savedDrafts[state.draft.id] || state.savedScratch[state.selectedId || "__new__"] ? "Local draft" : "Saved setup")}</p>
            ${Button({ children: t(state.pack ? "Save Pack" : "Save Draft"), attrs: 'data-action="save-draft"' })}
            ${Button({ children: t(state.pack ? "Schedule Pack" : "Schedule Challenge"), attrs: 'data-action="open-calendar"' })}
            ${!state.pack ? Button({ children: `${overviewIcon("copy")}${t("Create Pack")}`, attrs: 'data-action="new-pack"' }) : ""}
            ${Button({ children: t("Preview Changes"), variant: "primary", attrs: 'data-action="preview"' })}
            <p class="helper">${t("Deploy remains unavailable until Preview is reviewed. Draft saves are allowed with validation errors.")}</p>
            `,
          }),
        })}
      </aside>
    </section>
  `;
}

function renderIdentitySection() {
  return section(
    "Identity",
    t("ChallengeSetupConfig identity fields"),
    html`
      <div class="form-grid">
        ${!state.pack ? textField("Challenge ID", "id", state.draft.id) : ""}
        ${textField("Competition Group", "identity.competitionGroup", state.draft.identity.competitionGroup)}
        ${!state.pack ? textField("Display Name", "identity.displayName", state.draft.identity.displayName) : ""}
        ${!state.pack ? textField("Target Name", "identity.targetName", state.draft.identity.targetName) : ""}
        ${descriptionField()}
      </div>
    `,
  );
}

function renderEligibilitySection() {
  return section(
    "Player Eligibility",
    t("Min and max gates used for setup and calendar bracket validation"),
    html`
      <div class="form-grid">
        ${numberField("Min Level", "eligibility.minLevel", state.draft.eligibility.minLevel)}
        ${numberField("Max Level", "eligibility.maxLevel", state.draft.eligibility.maxLevel)}
        ${numberField("Min CP", "eligibility.minCP", state.draft.eligibility.minCP)}
        ${numberField("Max CP", "eligibility.maxCP", state.draft.eligibility.maxCP)}
      </div>
    `,
    supportedBracketsTooltip(),
  );
}

function renderContentSection() {
  return section(
    "Challenge Content",
    t("Mode, boss, arena and wave preset"),
    html`
      <div class="form-grid">
        ${modeField()}
        ${!state.pack ? bossField() : ""}
        ${presetField("Arena", "content.arena", state.draft.content.arena, optionsFor("arenas", presets.arenas), { listOnly: true })}
        ${presetField("WavePreset", "content.wavePreset", state.draft.content.wavePreset, optionsFor("wavePresets", presets.waves), { listOnly: true })}
      </div>
    `,
  );
}

function renderTimingSection() {
  return section(
    "Timing & Entry",
    t("Stored as spreadsheet-compatible numeric values"),
    html`
      <div class="form-grid three">
        ${numberField("Duration (h)", "timing.durationHours", state.draft.timing.durationHours, "24h = 1 day")}
        ${numberField("AttemptDuration(s)", "timing.attemptDurationSeconds", state.draft.timing.attemptDurationSeconds)}
        ${numberField("TimerPerWave", "timing.timerPerWave", state.draft.timing.timerPerWave)}
      </div>
    `,
  );
}

function renderRewardsSection() {
  return section(
    "Rewards & Ranking",
    t("Reward preset, drop tier and material variant"),
    html`
      <div class="form-grid">
        ${presetField("RewardPreset", "rewards.rewardPreset", state.draft.rewards.rewardPreset, optionsFor("rewardPresets", presets.rewards))}
        ${presetField("DropTier", "rewards.dropTier", state.draft.rewards.dropTier, optionsFor("dropTiers", presets.drops), { listOnly: true })}
        ${textField("MaterialDropVariant", "rewards.materialDropVariant", state.draft.rewards.materialDropVariant)}
      </div>
    `,
  );
}

function renderPlayersSection() {
  return section(
    "Player Grouping",
    t("Group preset and participation limits"),
    html`
      <div class="form-grid">
        ${presetField("PlayersGroupPreset", "players.groupPreset", state.draft.players.groupPreset, optionsFor("playerGroupPresets", presets.groups))}
        ${numberField("MinPlayersRequired", "players.minRequired", state.draft.players.minRequired)}
        ${numberField("Players", "players.players", state.draft.players.players)}
        ${numberField("PlayersHardLimit", "players.hardLimit", state.draft.players.hardLimit)}
      </div>
    `,
  );
}

function renderVisualsSection() {
  return section(
    "Visual Assets",
    "",
    html`
      <div class="form-grid">
        ${assetPathField("EventGraphicURL", "eventGraphicUrl", "eventGraphics")}
        ${assetPathField("BadgeBackgroundURL", "badgeBackgroundUrl", "badgeBackgrounds")}
        ${immunityIconsField()}
      </div>
      <div class="image-row">
        ${imagePreview(state.draft.visuals.eventGraphicUrl, "Event graphic preview")}
        ${imagePreview(state.draft.visuals.badgeBackgroundUrl, "Badge background preview")}
      </div>
    `,
  );
}

function section(title, subtitle, body, titleAddon = "") {
  return Card({
    children: CardContent({
      children: `${CardHeader({ title, description: subtitle, titleAddon })}${body}`,
    }),
  });
}

function supportedBracketsTooltip() {
  return html`
    <span class="tooltip brackets-tooltip">
      <button class="brackets-trigger" type="button" aria-describedby="supported-brackets-help">${t("Supported brackets")}<span class="tooltip-trigger" aria-hidden="true"></span></button>
      <span class="tooltip-content" id="supported-brackets-help" role="tooltip">
        <strong>${t("Supported brackets")}</strong>
        <span class="bracket-list">${brackets.map((bracket) => `<span>${bracket}</span>`).join("")}</span>
        <span>${t("Min Level and Max Level must match one bracket exactly.")}</span>
      </span>
    </span>
  `;
}

function fieldOptions(label, path) {
  const error = validateChallenge().find((item) => item.severity === "error" && item.field === path);
  return { label, id: `field-${path}`, tooltip: tooltipFor(path, label), error: error?.text || "" };
}
function fieldAttributes(path) {
  const error = validateChallenge().some((item) => item.severity === "error" && item.field === path);
  return `id="field-${path}" aria-invalid="${error}" ${error ? `aria-describedby="field-${path}-error"` : ""}`;
}
function textField(label, path, value) {
  return Field({
    ...fieldOptions(label, path),
    control: Input({ value, attrs: `${fieldAttributes(path)} data-field="${path}" placeholder="${escapeHtml(placeholderFor(path))}" ${path === "id" && originalId() ? 'readonly aria-readonly="true"' : ""}` }),
  });
}
function numberField(label, path, value, helper = "") {
  const fractional = ["timing.durationHours", "advanced.npcLevelMultiplier", "advanced.minNpcLevelVariance", "advanced.maxNpcLevelVariance", "advanced.positionRankingMultiplier", "advanced.rankingScoreMultiplier"].includes(path);
  const display = fractional && typeof value === "number" && locale() === "pl-PL" ? String(value).replace(".", ",") : value;
  return Field({ ...fieldOptions(label, path), helper,
    control: Input({ value: display ?? "", type: fractional ? "text" : "number", attrs: `${fieldAttributes(path)} ${fractional ? 'inputmode="decimal"' : 'min="0" step="1"'} data-number-field="${path}" placeholder="${escapeHtml(placeholderFor(path))}"` }),
  });
}

// Reads a normalized catalog from GET /api/references when it has loaded; falls back
// to the static fixtures.js list otherwise, so the field behaves identically before
// and after that fetch resolves. `fallbackValues` may be plain config-key strings or
// already-shaped { value, label } entries (e.g. bossOptions).
function optionsFor(catalogKey, fallbackValues) {
  const catalog = state.references?.[catalogKey];
  if (catalog) return catalog.map(({ value, label }) => ({ value, label }));
  return fallbackValues.map((entry) => (typeof entry === "object" ? entry : { value: entry, label: entry }));
}

// `listOnly` presets accept only catalog values: typing searches the list (debounced) instead of
// entering a custom key. A stored value missing from the catalog still shows until it is changed.
function presetField(label, path, value, options, { listOnly = false } = {}) {
  return Field({
    ...fieldOptions(label, path),
    control: Combobox({ value, options, path, attrs: fieldAttributes(path),
      ...(listOnly ? { placeholder: "Search...", debounce: 250 } : { placeholder: "Config key...", allowCustom: true }) }),
  });
}

// ChallengeDescription suggests the localization keys used in the sheet; any other text can still be typed.
function descriptionField() {
  const path = "identity.description";
  return Field({
    ...fieldOptions("Description", path),
    full: true,
    control: Combobox({
      value: state.draft.identity.description || "",
      options: optionsFor("challengeDescriptions", presets.descriptions),
      path,
      attrs: fieldAttributes(path),
      placeholder: placeholderFor(path),
      allowCustom: true,
      debounce: 250,
      toggleLabel: "Open description keys",
      emptyLabel: "No matching keys. The typed text is kept.",
    }),
  });
}

function modeField() {
  const path = "content.modeId";
  return Field({
    ...fieldOptions("ModeID", path),
    control: Combobox({
      value: state.draft.content.modeId,
      options: [{ value: 0, label: t("0 - Regular challenge") }, { value: 1, label: t("1 - Last Stand") }],
      path,
      attrs: fieldAttributes(path),
      placeholder: "Select mode...",
    }),
  });
}

function bossField() {
  const path = "content.bossId";
  return Field({
    ...fieldOptions("BossID", path),
    control: Combobox({
      value: state.draft.content.bossId,
      options: optionsFor("bosses", bossOptions),
      path,
      attrs: fieldAttributes(path),
      placeholder: "Search boss...",
      toggleLabel: "Open boss list",
      emptyLabel: "No boss found.",
    }),
  });
}
function difficultyFactorPresetField() {
  const path = "advanced.difficultyFactorPreset";
  return Field({
    ...fieldOptions("Difficulty Factor Preset", path),
    control: Combobox({
      value: state.draft.advanced.difficultyFactorPreset || "",
      options: optionsFor("difficultyPresets", presets.difficultyFactors),
      path,
      attrs: fieldAttributes(path),
      placeholder: "Search preset...",
      toggleLabel: "Open difficulty preset list",
      emptyLabel: "No matching difficulty preset.",
    }),
  });
}
// Known graphic assets as a searchable list. Other relative asset paths and HTTP(S) URLs can
// still be typed; filtering and the preview re-render wait until typing pauses.
function assetPathField(label, key, catalogKey) {
  const path = `visuals.${key}`;
  return Field({
    ...fieldOptions(label, path),
    control: Combobox({
      value: state.draft.visuals[key] || "",
      options: optionsFor(catalogKey, presets[catalogKey]),
      path,
      attrs: fieldAttributes(path),
      placeholder: "Search or enter a path...",
      allowCustom: true,
      debounce: 250,
      toggleLabel: "Open graphics list",
      emptyLabel: "No matching graphics. The typed value is kept.",
    }),
  });
}
// Several immunity icons can be selected; the search waits until typing pauses, like EventGraphicURL.
function immunityIconsField() {
  const path = "visuals.immuneIcons";
  return Field({
    ...fieldOptions("Immunity Icons", path),
    control: Combobox({
      value: state.draft.visuals.immuneIcons || [],
      options: optionsFor("immunityIcons", presets.immunityIcons),
      path,
      attrs: fieldAttributes(path),
      placeholder: "Search icons...",
      multiple: true,
      debounce: 250,
      toggleLabel: "Open icon list",
      emptyLabel: "No matching icons.",
    }),
  });
}
function difficultyFactorPresetDetails() {
  const name = state.draft.advanced.difficultyFactorPreset;
  // Prefer the value carried by the reference catalog entry (matches the sheet-driven
  // architecture: the display data travels with the selected reference) and fall back
  // to the static fixtures.js table before /api/references has loaded.
  const row = state.references?.difficultyPresets?.find((entry) => entry.value === name)?.details || difficultyFactorPresetData[name];
  if (!row) {
    return `<p class="helper">${t("Select a Difficulty Factor Preset to see its ChallengeDifficultyFactorPresets values.")}</p>`;
  }
  const cp = new Intl.NumberFormat(locale()).format(row.desiredAverageCP);
  const tiles = [
    ["Difficulty Factor", `${row.minFactor} – ${row.maxFactor} (${t("spread")} ${row.spread})`],
    ["IAP Factor", row.iapFactor],
    ["Spent 24h / 7d", `${row.spent24h} / ${row.spent7d}`],
    ["Damage / Health Ratio", row.damageToHealthRatio],
    ["Stat Modifier", `x${row.statModifierMultiplier}`],
    ["Boss Damage", `x${row.bossDamageMultiplier} (${row.bossDamageMin}–${row.bossDamageMax})`],
    ["Boss Resist", `x${row.bossResistMultiplier}`],
    ["Max Spawn Modifier", row.maxSpawnModifier],
    ["Spawns", `${row.spawnsMin} – ${row.spawnsMax}`],
    ["Desired Average CP", cp],
    ["Min Players (Real Avg)", row.minPlayersToCalculateRealAverage],
    ["Boss Defence", `x${row.bossDefenceModifier} (${row.bossDefenceMin}–${row.bossDefenceMax})`],
  ];
  return `
    <div class="settings-grid difficulty-preset-details">
      ${tiles.map(([key, value]) => settingBox(t(key), escapeHtml(String(value)))).join("")}
    </div>
  `;
}
function renderAdvancedSection() {
  const a = state.draft.advanced;
  return `<details class="advanced-section" data-advanced><summary>${t("Advanced settings")}</summary><div class="form-grid">
    ${difficultyFactorPresetField()}
    ${difficultyFactorPresetDetails()}
    ${textField("Attempt Prices", "advanced.attemptPrices", a.attemptPrices || "")}
    ${numberField("Hard Limit Window (min)", "advanced.minutesLeftToUseHardLimit", a.minutesLeftToUseHardLimit)}
    ${numberField("Inactive Minutes", "advanced.minutesInactive", a.minutesInactive)}
    ${numberField("Min Inactive Players", "advanced.minInactivePlayers", a.minInactivePlayers)}
    ${numberField("Max Inactive Players", "advanced.maxInactivePlayers", a.maxInactivePlayers)}
    ${numberField("NPC Level Multiplier", "advanced.npcLevelMultiplier", a.npcLevelMultiplier)}
    ${numberField("Min NPC Level Variance", "advanced.minNpcLevelVariance", a.minNpcLevelVariance)}
    ${numberField("Max NPC Level Variance", "advanced.maxNpcLevelVariance", a.maxNpcLevelVariance)}
    ${numberField("Position Ranking Multiplier", "advanced.positionRankingMultiplier", a.positionRankingMultiplier)}
    ${numberField("Ranking Score Multiplier", "advanced.rankingScoreMultiplier", a.rankingScoreMultiplier)}
    ${Field({ ...fieldOptions("Separate Levels", "advanced.separateLevels"), control: `<div class="checkbox-control"><input ${fieldAttributes("advanced.separateLevels")} type="checkbox" data-boolean-field="advanced.separateLevels" ${a.separateLevels === true || a.separateLevels === 1 ? "checked" : ""} /></div>` })}
  </div></details>`;
}

function imagePreview(url, alt) {
  if (isAssetPath(url)) {
    return `<div class="asset-reference" aria-label="${t(alt)}"><span>${escapeHtml(url)}</span><span class="helper">${t("Game asset")}</span></div>`;
  }
  if (!url || !isValidUrl(url)) {
    return Alert({ variant: "amber", children: t("No valid image URL.") });
  }
  return `<img class="thumb" src="${escapeHtml(url)}" alt="${t(alt)}" data-image-preview />`;
}

function renderValidationCard() {
  const items = validateChallenge();
  const checks = state.pack ? [...items.reduce((groups, item) => {
    const key = `${item.severity}/${item.field}/${item.text}`;
    if (!groups.has(key)) groups.set(key, { ...item, count: 0 });
    groups.get(key).count += 1;
    return groups;
  }, new Map()).values()] : items;
  const errors = items.filter((item) => item.severity === "error").length;
  const warnings = items.filter((item) => item.severity === "warn").length;
  return Card({
    children: CardContent({
      children: html`
        ${CardHeader({ title: "Validation", description: `${t("{errors} blocking, {warnings} warning", { errors, warnings })}` })}
        <div class="checklist">
          ${checks.map((item) => `<div class="check-item"><span class="dot ${item.severity}"></span><span>${escapeHtml(message(item.text))}${item.count > 1 ? ` (${t("{count} challenges", { count: item.count })})` : item.challengeId ? `<span class="helper"> ${escapeHtml(item.challengeId)}</span>` : ""}</span></div>`).join("")}
        </div>
      `,
    }),
  });
}

function renderCalendar() {
  return html`
    ${state.pack ? renderPackContext() : ""}
    <section class="calendar-layout">
      ${Card({
        children: html`
        ${CardContent({
          children: html`
          <div class="toolbar">
            <div class="toolbar-left">
              ${Button({ children: t("Previous"), attrs: state.pack ? 'data-pack-calendar-month="-1"' : 'data-month="-1"' })}
              <span class="selected-date">${state.pack ? new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${state.packCalendarMonth}-01T00:00:00Z`)) : formatScheduleDate()}</span>
              ${Button({ children: t("Next"), attrs: state.pack ? 'data-pack-calendar-month="1"' : 'data-month="1"' })}
              ${Button({ children: t("Today"), attrs: 'data-action="today"' })}
            </div>
          </div>
          `,
        })}
        <div class="calendar-shell">${renderCalendarGrid()}</div>
        `,
      })}
      <aside class="rail">
        ${Card({
          children: CardContent({
            children: html`
            ${CardHeader({ title: state.pack ? "Schedule Pack" : "Schedule Challenge", description: state.pack ? `${t("{count} challenges", { count: state.pack.bossIds.length })}` : t(state.schedule.previous ? "Editing the selected calendar entry." : "Adding a calendar entry.") })}
            <div class="section-stack">
              ${state.schedule.previous ? Button({ children: t("Add a new entry"), attrs: 'data-action="new-schedule"' }) : ""}
              ${state.pack ? selectPackField() : selectChallengeField()}
              ${dateScheduleField()}
              ${textScheduleField("Start UTC", "startUtc", state.schedule.startUtc)}
              ${selectScheduleField("Level Bracket", "levelBracket", state.schedule.levelBracket, brackets)}
              ${state.pack ? renderPackScheduleFields() : ""}
              ${Button({ children: t("Preview Changes"), variant: "primary", attrs: 'data-action="preview"' })}
            </div>
            `,
          }),
        })}
        ${renderValidationCard()}
      </aside>
    </section>
  `;
}

function formatScheduleDate() {
  const [year, month] = state.schedule.month.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, state.schedule.day));
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function renderCalendarGrid() {
  const month = state.pack ? state.packCalendarMonth : state.schedule.month;
  const days = monthDays(month);
  const pending = state.pack ? generatePack(currentPack()).filter((member) => member.schedule.month === month) : [];
  let cells = `<div class="cal-head">${t("Day")}</div>${brackets.map((bracket) => `<div class="cal-head">${bracket}</div>`).join("")}`;
  for (let day = 1; day <= days; day += 1) {
    cells += `<div class="cal-day">${day}</div>`;
    brackets.forEach((bracket) => {
      const entries = getCellEntries(month, day, bracket);
      const proposed = pending.filter(({ schedule }) => schedule.day === day && schedule.levelBracket === bracket && !entries.some((entry) => entry.challengeId === schedule.challengeId && entry.startUtc === schedule.startUtc));
      const selected = state.schedule.month === month && state.schedule.day === day && state.schedule.levelBracket === bracket;
      cells += html`
        <div class="cal-cell ${selected ? "selected" : ""}" role="group" aria-label="${t("Day {day}, bracket {bracket}", { day, bracket })}">
          <button class="cell-select" type="button" id="cell-${day}-${bracket}" data-cell-day="${day}" data-cell-bracket="${bracket}" aria-label="${t("Schedule on day {day}, bracket {bracket}", { day, bracket })}" aria-pressed="${selected}"><span class="sr-only">${t("Select cell")}</span></button>
          ${
            entries.length
              ? entries
                  .map(
                    (entry, index) =>
                      `<button type="button" class="entry ${entryTone(entry.challengeId, index)}" data-entry-day="${day}" data-entry-bracket="${bracket}" data-entry-index="${index}" title="${t("{id} at {time} UTC", { id: escapeHtml(entry.challengeId), time: escapeHtml(entry.startUtc) })}"><span class="id">${escapeHtml(calendarEntryLabel(entry.challengeId))}</span><span class="time">${escapeHtml(entry.startUtc)}</span></button>`,
                  )
                  .join("")
              : proposed.length ? "" : `<div class="empty-cell">${t("Empty")}</div>`
          }
          ${proposed.map(({ challenge, schedule }) => `<div class="entry entry-blue pack-pending-entry" title="${t("Pending: {id} at {time} UTC", { id: escapeHtml(challenge.id), time: escapeHtml(schedule.startUtc) })}"><span class="id">${escapeHtml(challenge.identity.displayName)}</span><span class="time">${escapeHtml(schedule.startUtc)}</span></div>`).join("")}
        </div>
      `;
    });
  }
  return `<div class="calendar-grid">${cells}</div>`;
}

function calendarEntryLabel(challengeId) {
  return state.challenges.find((item) => item.id === challengeId)?.identity.displayName || challengeId;
}

function entryTone(challengeId, index) {
  if (challengeId === state.schedule.challengeId) return "entry-pink";
  if (!state.challenges.some((item) => item.id === challengeId)) return "entry-neutral";
  return ["entry-green", "entry-blue", "entry-pink"][index % 3];
}

function selectChallengeField() {
  const options = state.challenges.concat(state.challenges.some((item) => item.id === state.draft.id) ? [] : [state.draft]).map((item) => item.id);
  return Field({
    ...fieldOptions("Challenge", "schedule.challengeId"),
    control: Select({ value: state.schedule.challengeId, options, attrs: `${fieldAttributes("schedule.challengeId")} data-schedule="challengeId"` }),
  });
}

function selectPackField() {
  return Field({ label: "Challenge pack", id: "schedule-pack", control: `<select id="schedule-pack" class="select" data-select-pack>${allPacks().map((pack) => `<option value="${escapeHtml(pack.id)}" ${pack.id === state.pack.id ? "selected" : ""}>${escapeHtml(pack.name)}</option>`).join("")}</select>` });
}

function renderPackScheduleFields() {
  return `<fieldset class="pack-schedule-mode"><legend>${t("Schedule")}</legend><div class="segmented-control">
    ${[ ["sequential", "Sequential"], ["simultaneous", "Same time"] ].map(([value, label]) => `<label><input type="radio" name="pack-mode" data-pack-mode value="${value}" ${state.schedule.mode === value ? "checked" : ""} /><span>${t(label)}</span></label>`).join("")}
    </div></fieldset>${state.schedule.mode === "sequential" ? Field({ label: "Interval (days)", id: "pack-interval", control: Input({ type: "number", value: state.schedule.intervalDays, attrs: 'id="pack-interval" data-schedule="intervalDays" min="1" max="366" step="1"' }) }) : ""}
    ${Button({ children: t("Edit shared setup"), attrs: 'data-view="setup"' })}`;
}

function dateScheduleField() {
  return Field({
    ...fieldOptions("Date", "schedule.date"),
    helper: "Choose the UTC calendar day for this ChallengeCalendar cell.",
    control: Calendar({ month: state.schedule.month, selectedDay: state.schedule.day }),
  });
}

function textScheduleField(label, key, value) {
  const path = `schedule.${key}`;
  return Field({
    ...fieldOptions(label, path),
    control: Input({ value, attrs: `${fieldAttributes(path)} data-schedule="${key}" inputmode="numeric" maxlength="5" placeholder="${escapeHtml(placeholderFor(path))}"` }),
  });
}

function selectScheduleField(label, key, value, options) {
  return Field({ ...fieldOptions(label, `schedule.${key}`), control: Select({ value, options, attrs: `${fieldAttributes(`schedule.${key}`)} data-schedule="${key}"` }) });
}

function tooltipFor(path, label) {
  return fieldTooltips[path] || t("{field} controls the mapped ChallengeSetupConfig or ChallengeCalendar value. Enter the agreed config value for this STAGE challenge.", { field: t(label) });
}

function placeholderFor(path) {
  return t(fieldPlaceholders[path] || "");
}

function renderPreview() {
  const diff = state.plan?.diff || buildDiff();
  const errors = hasBlockingErrors();
  const hasChanges = diff.setup.length + diff.calendar.length + (diff.pack?.length || 0) > 0;
  return html`
    <section class="preview-layout">
      <div class="section-stack">
        ${state.pack ? renderPackContext() : ""}
        ${state.pack ? section("Pack schedule", `${t("{count} challenges", { count: state.pack.bossIds.length })}`, renderPackMembers(false, state.plan?.members || generatePack(currentPack()))) : ""}
        ${!hasChanges ? Alert({ children: t("No changes to deploy.") }) : ""}
        ${state.previewLoading ? Alert({ children: t("Preparing server preview...") }) : ""}
        ${errors ? Alert({ variant: "red", children: t("Blocking validation issues must be resolved before STAGE deploy.") }) : ""}
        ${Card({
          children: CardContent({
            children: `${CardHeader({
              title: "ChallengeSetupConfig diff",
              description: t("Only changed mapped columns are shown."),
            })}${state.pack ? renderPackSetupDiff() : diffList(diff.setup)}`,
          }),
        })}
        ${state.pack && diff.pack?.length ? section("Pack changes", state.pack.name, diffList(diff.pack)) : ""}
        ${Card({
          children: CardContent({
            children: `${CardHeader({
              title: "ChallengeCalendar diff",
              description: t("Existing entries in the cell are preserved."),
            })}${diffList(diff.calendar)}`,
          }),
        })}
      </div>
      <aside class="rail">
        ${renderValidationCard()}
        ${Card({
          children: CardContent({
            className: "section-stack",
            children: html`
            ${state.plan ? `<label class="checkbox-label"><input id="review-preview" type="checkbox" data-review ${state.reviewed ? "checked" : ""} ${errors ? "disabled" : ""} /> ${state.pack ? t("I reviewed all {count} challenges", { count: state.pack.bossIds.length }) : t("I reviewed these changes")}</label>` : ""}
            ${!state.plan && !errors && hasChanges && !state.previewLoading ? Button({ children: t("Refresh preview"), attrs: 'data-action="preview"' }) : ""}
            ${Button({ children: t(state.submitting ? "Starting deployment..." : "Push to STAGE"), variant: "primary", attrs: `data-action="deploy" ${!state.reviewed || !state.plan || errors || !hasChanges ? "disabled" : ""}` })}
            ${renderDeployStatus()}
            `,
          }),
        })}
      </aside>
    </section>
  `;
}

function diffList(rows) {
  if (!rows.length) return Alert({ children: t("No changes detected for this section.") });
  return html`
    <div class="diff-list">
      ${rows
        .map(
          (row) => html`
            <div class="diff-row">
              <div class="diff-field">${escapeHtml(row.field)}</div>
              <div class="diff-values">
                <div class="old-value">${escapeHtml(row.oldValue)}</div>
                <div class="new-value">${escapeHtml(row.newValue)}</div>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderPackSetupDiff() {
  const members = state.plan?.members || packEvaluation().members;
  return members.map(({ challenge, diff }) => `<details class="pack-preview-member" data-pack-diff="${escapeHtml(challenge.id)}"><summary>${escapeHtml(challenge.id)}<span class="helper"> ${t("{count} changed fields", { count: diff?.setup.length || 0 })}</span></summary>${diffList(diff?.setup || [])}</details>`).join("");
}

function renderDeployStatus() {
  const order = ["Queued", "Running", state.deploy.status === "Failure" ? "Failure" : "Success"];
  const current = order.indexOf(state.deploy.status);
  return html`
    <div class="deploy-flow">
      ${order
        .map((step, index) => `<div class="deploy-step ${state.deploy.status === step ? "active" : current > index && state.deploy.status !== "Failure" ? "done" : ""}">${t(step)}</div>`)
        .join("")}
    </div>
    ${Alert({
      variant: state.deploy.status === "Failure" ? "red" : "default",
      children: html`
      <strong>${t("Status:")}</strong> ${t(state.deploy.status)}<br />
      <strong>${t("Build:")}</strong> ${escapeHtml(state.deploy.build || t("No STAGE build triggered"))}<br />
      <strong>${t("Log:")}</strong> ${escapeHtml(message(state.deploy.log || "Available after queueing"))}
      `,
    })}
  `;
}

function renderHistory() {
  return html`
    <section class="view">
      ${Card({
        className: "deploy-history",
        children: CardContent({
          children: `${CardHeader({
            title: "Deploy audit trail",
            description: t("Local STAGE deployments and approved changes."),
          })}${Table({
            head: ["Build", "Challenge", "Status", "Time (UTC)", "Details"],
            rows: state.history.map(
              (item) => html`
                <tr>
                  <td><strong>${escapeHtml(item.id)}</strong></td>
                  <td>${escapeHtml(item.packName || item.challengeId)}${item.deletion ? `<div class="helper">${t("Deletion: {count} challenges", { count: item.deletion.challengeCount })}</div>` : item.packId ? `<div class="helper">${t("{count} challenges", { count: item.challengeIds.length })}</div>` : ""}</td>
                  <td><span class="overview-status ${item.status === "Success" ? "overview-status-active" : item.status === "Failure" ? "overview-status-disabled" : "overview-status-ready"}"><span class="overview-status-dot" aria-hidden="true"></span>${t(item.status)}</span></td>
                  <td>${escapeHtml(item.time)}</td>
                  <td><details><summary>${t("Build details")}</summary><p class="helper">${escapeHtml(t(item.initiator || "Local user"))}</p><p>${escapeHtml(message(item.log || "Historical fixture"))}</p>${item.packId ? `<p>${item.challengeIds.map(escapeHtml).join(", ")}</p>` : ""}${item.diff ? diffList([...item.diff.setup, ...item.diff.calendar, ...(item.diff.pack || [])]) : ""}</details></td>
                </tr>
              `,
            ),
          })}`,
        }),
      })}
    </section>
  `;
}

function renderSettings() {
  const preferences = getPreferences();
  return html`
    <section class="view">
      <section class="preferences-section" aria-labelledby="preferences-title">
        <h2 id="preferences-title">${t("Appearance & language")}</h2>
        <div class="preference-row">
          <label for="settings-language">${t("Language")}</label>
          <select id="settings-language" class="select" data-preference="language">
            <option value="en" ${preferences.language === "en" ? "selected" : ""}>English</option>
            <option value="pl" ${preferences.language === "pl" ? "selected" : ""}>Polski</option>
          </select>
        </div>
        <div class="preference-row">
          <span id="theme-label">${t("Dark theme")}</span>
          <div class="theme-control"><span class="helper">${t(preferences.theme === "dark" ? "Dark" : "Light")}</span>
            <button id="settings-theme" class="theme-switch" type="button" role="switch" aria-labelledby="theme-label" aria-checked="${preferences.theme === "dark"}" data-action="toggle-theme"><span></span></button>
          </div>
        </div>
      </section>
      <h2>${t("Adapters")}</h2>
      <div class="settings-grid">
        ${settingBox("APP_ENV", "local")}
        ${settingBox("DATA_PROVIDER", "mock")}
        ${settingBox("JENKINS_PROVIDER", "mock")}
        ${settingBox("DEPLOY_ENV", "stage")}
      </div>
      ${Alert({
        variant: "red",
        children: t("Security acceptance guard: manually calling the deploy adapter with any target other than STAGE returns a rejection."),
      })}
      ${Card({
        children: CardContent({
          className: "section-stack",
          children: html`
          <h2>${t("Adapter boundary")}</h2>
          <p class="helper">
            ${t("The UI talks to normalized ChallengeDraft and ScheduleEntry shapes. Spreadsheet row formatting and append-safe calendar cell mutation are isolated in mapper functions in this prototype.")}
          </p>

          `,
        }),
      })}
    </section>
  `;
}

function changePreferences(changes) {
  if (!setPreferences(changes)) {
    state.notice = { variant: "amber", text: "Preferences changed for this tab only. Browser storage is unavailable." };
    toast.error("Preferences could not be saved", { id: "preferences", description: state.notice.text });
    render();
  }
}

function settingBox(key, value) {
  return html`
    <div class="setting-box">
      <div class="setting-key">${key}</div>
      <div class="setting-value">${value}</div>
    </div>
  `;
}

function bindEvents() {
  app.addEventListener("error", (event) => {
    if (!event.target.matches?.("[data-image-preview]")) return;
    const notice = document.createElement("div");
    notice.className = "notice amber";
    notice.textContent = t("Image failed to load");
    event.target.replaceWith(notice);
  }, true);
  const visibleComboboxOptions = (root) => [...root.querySelectorAll("[data-combobox-option]")].filter((option) => !option.hidden);
  const setComboboxOpen = (root, open, resetFilter = false) => {
    const input = root.querySelector("[data-combobox-input]");
    const menu = root.querySelector(".combobox-menu");
    if (resetFilter) {
      root.querySelectorAll("[data-combobox-option]").forEach((option) => { option.hidden = false; });
      root.querySelector(".combobox-empty").hidden = true;
    }
    menu.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
    if (!open) {
      input.removeAttribute("aria-activedescendant");
      root.querySelectorAll(".combobox-option.active").forEach((option) => option.classList.remove("active"));
    }
  };
  const activateComboboxOption = (root, option) => {
    root.querySelectorAll(".combobox-option.active").forEach((item) => item.classList.remove("active"));
    if (!option) return;
    option.classList.add("active");
    root.querySelector("[data-combobox-input]").setAttribute("aria-activedescendant", option.id);
    option.scrollIntoView({ block: "nearest" });
  };
  // Spaces, underscores, hyphens, dots and slashes match each other, so "scarred orc" finds ui_img_scarred_orc_1.png.
  const searchText = (text) => text.toLocaleLowerCase().replace(/[\s_\-./]+/g, " ").trim();
  const filterCombobox = (input) => {
    const root = input.closest("[data-combobox]");
    const query = searchText(input.value);
    root.querySelectorAll("[data-combobox-option]").forEach((option) => {
      option.hidden = !searchText(option.dataset.label).includes(query);
    });
    const options = visibleComboboxOptions(root);
    root.querySelector(".combobox-empty").hidden = options.length > 0;
    setComboboxOpen(root, true);
    activateComboboxOption(root, root.hasAttribute("data-allow-custom") ? null : options[0]);
  };
  // Comboboxes with data-debounce write a typed custom value into the draft immediately but
  // re-render, re-validate and filter only once typing pauses for that many milliseconds.
  const comboboxDebounces = new Map();
  const cancelComboboxDebounce = (path) => {
    clearTimeout(comboboxDebounces.get(path)?.timer);
    comboboxDebounces.delete(path);
  };
  const flushComboboxDebounce = (path) => {
    const pending = comboboxDebounces.get(path);
    if (!pending) return;
    cancelComboboxDebounce(path);
    pending.run();
  };
  const debounceCombobox = (input) => {
    const path = input.dataset.comboboxInput;
    const root = input.closest("[data-combobox]");
    const allowCustom = root.hasAttribute("data-allow-custom");
    if (allowCustom) {
      root.dataset.selectedLabel = input.value;
      updateDraft(path, input.value, { deferRender: true });
    }
    if (root.querySelector(".combobox-menu").hidden) setComboboxOpen(root, true);
    const run = () => {
      const selector = `[data-combobox-input="${CSS.escape(path)}"]`;
      const wasOpen = app.querySelector(selector)?.getAttribute("aria-expanded") === "true";
      if (allowCustom) render();
      const current = app.querySelector(selector);
      if (!current) return;
      if (wasOpen && current === document.activeElement) filterCombobox(current);
      else setComboboxOpen(current.closest("[data-combobox]"), false);
    };
    cancelComboboxDebounce(path);
    comboboxDebounces.set(path, { run, timer: setTimeout(() => { comboboxDebounces.delete(path); run(); }, Number(root.dataset.debounce)) });
  };
  // Multi-select: write the new selection, then keep the list open with the same search and active option.
  const setComboboxValues = (root, values, activeValue = "") => {
    if (isBusy()) return;
    const input = root.querySelector("[data-combobox-input]");
    const path = input.dataset.comboboxInput;
    const query = input.value;
    const reopen = !root.querySelector(".combobox-menu").hidden;
    cancelComboboxDebounce(path);
    const hidden = root.querySelector('[type="hidden"][data-field]');
    hidden.value = values.join(",");
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    const next = app.querySelector(`[data-combobox-input="${CSS.escape(path)}"]`);
    if (!next) return;
    next.value = query;
    next.focus({ preventScroll: true });
    const nextRoot = next.closest("[data-combobox]");
    if (!reopen) return setComboboxOpen(nextRoot, false);
    filterCombobox(next);
    const option = [...nextRoot.querySelectorAll("[data-combobox-option]")].find((item) => item.dataset.value === activeValue && !item.hidden);
    if (option) activateComboboxOption(nextRoot, option);
  };
  const comboboxValues = (root) => root.querySelector('[type="hidden"][data-field]').value.split(",").filter(Boolean);
  const toggleComboboxOption = (option) => {
    const root = option.closest("[data-combobox]");
    const values = comboboxValues(root);
    const value = option.dataset.value;
    setComboboxValues(root, values.includes(value) ? values.filter((item) => item !== value) : [...values, value], value);
  };
  const chooseComboboxOption = (option) => {
    if (option.closest("[data-multiple]")) return toggleComboboxOption(option);
    if (isBusy()) return;
    const root = option.closest("[data-combobox]");
    const input = root.querySelector("[data-combobox-input]");
    const value = root.querySelector('[type="hidden"][data-field]');
    cancelComboboxDebounce(input.dataset.comboboxInput);
    input.value = option.dataset.label;
    root.dataset.selectedLabel = option.dataset.label;
    setComboboxOpen(root, false);
    if (root.hasAttribute("data-allow-custom")) {
      updateDraft(input.dataset.comboboxInput, option.dataset.value);
      const next = document.getElementById(input.id);
      next?.focus({ preventScroll: true });
      if (next) setComboboxOpen(next.closest("[data-combobox]"), false);
    } else {
      value.value = option.dataset.value;
      value.dispatchEvent(new Event("input", { bubbles: true }));
      // Restoring focus after the re-render reopens the list; a choice should leave it closed.
      const next = app.querySelector(`[data-combobox-input="${CSS.escape(input.dataset.comboboxInput)}"]`);
      if (next) setComboboxOpen(next.closest("[data-combobox]"), false);
    }
  };
  const positionTooltip = (event) => {
    const tooltip = event.target.closest?.(".tooltip");
    if (!tooltip) return;
    const content = tooltip.querySelector(".tooltip-content");
    const trigger = tooltip.getBoundingClientRect();
    const bounds = content.getBoundingClientRect();
    content.style.left = `${Math.max(12, Math.min(innerWidth - bounds.width - 12, trigger.left - bounds.width / 2))}px`;
    const above = trigger.top - bounds.height - 8;
    content.style.top = `${Math.max(12, Math.min(innerHeight - bounds.height - 12, above >= 12 ? above : trigger.bottom + 8))}px`;
  };
  app.addEventListener("pointerover", positionTooltip);
  app.addEventListener("focusin", (event) => {
    positionTooltip(event);
    if (event.target.matches("[data-combobox-input]")) {
      const root = event.target.closest("[data-combobox]");
      setComboboxOpen(root, true, true);
      event.target.select();
    }
  });
  app.addEventListener("focusout", (event) => {
    const root = event.target.closest?.("[data-combobox]");
    if (!root) return;
    setTimeout(() => {
      if (!root.isConnected || root.contains(document.activeElement)) return;
      if (!root.hasAttribute("data-allow-custom")) root.querySelector("[data-combobox-input]").value = root.dataset.selectedLabel;
      setComboboxOpen(root, false);
    }, 0);
  });
  app.addEventListener("keydown", (event) => {
    const deletionDialog = event.target.closest("#delete-dialog");
    if (deletionDialog && event.key === "Tab") {
      const controls = [...deletionDialog.querySelectorAll('button:not(:disabled), input:not(:disabled), summary')]
        .filter((control) => control.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || (event.shiftKey ? event.target === first : event.target === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
      return;
    }
    const profileMenu = event.target.closest("[data-profile-menu]");
    if (event.key === "Escape" && profileMenu?.open) {
      event.preventDefault();
      profileMenu.open = false;
      profileMenu.querySelector("summary").focus({ preventScroll: true });
      return;
    }
    const actionMenu = event.target.closest("#overview-action-menu");
    if (actionMenu) {
      const items = [...actionMenu.querySelectorAll('[role="menuitem"]')];
      const index = items.indexOf(event.target);
      if (event.key === "Escape") {
        event.preventDefault();
        closeOverviewMenu(true);
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      } else if (event.key === "Tab") closeOverviewMenu(true);
      return;
    }
    if (event.key === "Escape" && event.target.matches(".tooltip-trigger")) return event.target.blur();
    if (!event.target.matches("[data-combobox-input]")) return;
    // Navigate the filtered list, not the one from before typing paused.
    if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) flushComboboxDebounce(event.target.dataset.comboboxInput);
    const root = event.target.closest("[data-combobox]");
    const options = visibleComboboxOptions(root);
    const active = root.querySelector(".combobox-option.active");
    if (event.key === "Escape") {
      event.preventDefault();
      event.target.value = root.dataset.selectedLabel;
      setComboboxOpen(root, false);
      return;
    }
    if (event.key === "Backspace" && root.hasAttribute("data-multiple") && !event.target.value) {
      const values = comboboxValues(root);
      if (values.length) {
        event.preventDefault();
        setComboboxValues(root, values.slice(0, -1));
      }
      return;
    }
    if (event.key === "Enter" && !root.querySelector(".combobox-menu").hidden) {
      event.preventDefault();
      if (active) chooseComboboxOption(active);
      else setComboboxOpen(root, false);
      return;
    }
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    if (root.querySelector(".combobox-menu").hidden) setComboboxOpen(root, true, true);
    const current = Math.max(0, options.indexOf(active));
    const index = event.key === "ArrowDown" ? Math.min(options.length - 1, active ? current + 1 : 0) : Math.max(0, current - 1);
    activateComboboxOption(root, options[index]);
  });
  const handleInput = (event) => {
    const field = event.target;
    if (event.isComposing || isBusy()) return;
    if (field.matches("[data-delete-members]") && state.deletionDialog) {
      state.deletionDialog.includeChallenges = field.checked;
      return prepareDeletion();
    }
    if (field.matches("[data-pack-search]")) {
      state.packBossQuery = field.value;
      const query = field.value.trim().toLowerCase();
      app.querySelectorAll(".pack-boss-option").forEach((option) => { option.hidden = !option.textContent.toLowerCase().includes(query); });
      return;
    }
    if (state.pack && field.matches("[data-pack-field]")) {
      state.pack[field.dataset.packField] = field.value;
      return packChanged();
    }
    if (state.pack && field.matches("[data-pack-boss]")) {
      if (field.checked && !state.pack.bossIds.includes(field.dataset.packBoss)) state.pack.bossIds.push(field.dataset.packBoss);
      else if (!field.checked) state.pack.bossIds = state.pack.bossIds.filter((id) => id !== field.dataset.packBoss);
      return packChanged();
    }
    if (state.pack && field.matches("[data-pack-mode]") && field.checked) return updateSchedule("mode", field.value);
    if (field.matches("[data-overview-query]")) {
      const list = challengeListState();
      list.query = field.value;
      list.page = 1;
      closeOverviewMenu();
      render();
      return;
    }
    if (field.matches("[data-combobox-input]")) {
      if (field.closest("[data-combobox]").hasAttribute("data-debounce")) return debounceCombobox(field);
      if (field.closest("[data-combobox]").hasAttribute("data-allow-custom")) updateDraft(field.dataset.comboboxInput, field.value);
      return filterCombobox(field);
    }
    if (field.matches("[data-field]")) {
      const value = field.dataset.field === "visuals.immuneIcons"
        ? field.value.split(",").map((icon) => icon.trim()).filter(Boolean)
        : field.dataset.field === "content.modeId" && field.value !== "" ? Number(field.value) : field.value;
      updateDraft(field.dataset.field, value);
    }
    if (field.matches("[data-number-field]")) {
      updateDraft(field.dataset.numberField, parseDecimalInput(field.value));
    }
    if (field.matches("[data-schedule]")) updateSchedule(field.dataset.schedule, field.value);
  };
  app.addEventListener("input", handleInput);
  app.addEventListener("compositionend", handleInput);
  app.addEventListener("change", (event) => {
    if (event.target.dataset.preference === "language") return changePreferences({ language: event.target.value });
    if (isBusy()) return;
    const field = event.target;
    if (field.matches("[data-select-pack]")) return openPack(field.value, "calendar");
    if (field.matches("[data-overview-filter]")) {
      const list = challengeListState();
      list[field.dataset.overviewFilter] = field.value;
      list.page = 1;
      closeOverviewMenu();
      render();
      return;
    }
    if (field.matches("[data-review]")) {
      state.reviewed = field.checked && !!state.plan && !hasBlockingErrors();
      render();
    }
    if (field.matches("[data-boolean-field]")) updateDraft(field.dataset.booleanField, field.checked);
  });
  app.addEventListener("click", (event) => {
    if (event.target.matches?.(".combobox-control")) return event.target.querySelector("[data-combobox-input]").focus();
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    const data = button.dataset;
    if (button.hasAttribute("data-combobox-toggle")) {
      const root = button.closest("[data-combobox]");
      const input = root.querySelector("[data-combobox-input]");
      input.focus();
      return;
    }
    if (button.hasAttribute("data-combobox-option")) return chooseComboboxOption(button);
    if (button.hasAttribute("data-combobox-remove")) {
      const root = button.closest("[data-combobox]");
      return setComboboxValues(root, comboboxValues(root).filter((item) => item !== button.dataset.comboboxRemove));
    }
    if (data.view) return setView(data.view);
    if (data.action === "toggle-theme") return changePreferences({ theme: getPreferences().theme === "dark" ? "light" : "dark" });
    if (data.action === "retry-load") return initialize();
    if (isBusy()) return;
    if (data.action === "cancel-delete") return closeDeletion();
    if (data.action === "confirm-delete") return confirmDeletion();
    if (data.action === "refresh-delete") return prepareDeletion();
    if (data.challengeDelete) return openDeletion("challenge", data.challengeDelete);
    if (data.packDelete) return openDeletion("pack", data.packDelete);
    if (data.packOpen) return openPack(data.packOpen);
    if (data.packSchedule) return openPack(data.packSchedule, "calendar");
    if (data.packCopy) return newPack(data.packCopy);
    if (data.action === "new-pack") return newPack();
    if (data.action === "leave-pack") { leavePack(); return setView("setup"); }
    if (state.pack && data.action === "pack-clear-bosses") { state.pack.bossIds = []; return packChanged(); }
    if (state.pack && data.action === "pack-select-visible") {
      const visible = bossOptions.filter((boss) => boss.label.toLowerCase().includes(state.packBossQuery.trim().toLowerCase())).map((boss) => boss.value);
      state.pack.bossIds = [...new Set([...state.pack.bossIds, ...visible])];
      return packChanged();
    }
    if (state.pack && Object.hasOwn(data, "packOrder")) {
      const index = Number(data.packOrder);
      const next = index + Number(data.direction);
      if (next >= 0 && next < state.pack.bossIds.length) {
        [state.pack.bossIds[index], state.pack.bossIds[next]] = [state.pack.bossIds[next], state.pack.bossIds[index]];
        packChanged();
      }
      return;
    }
    if (state.pack && data.packCalendarMonth) {
      const month = new Date(`${state.packCalendarMonth}-01T00:00:00Z`);
      month.setUTCMonth(month.getUTCMonth() + Number(data.packCalendarMonth));
      const value = month.toISOString().slice(0, 7);
      if (monthDays(value)) state.packCalendarMonth = value;
      render();
      return;
    }
    if (data.overviewMore) {
      const list = challengeListState();
      const open = list.menuId !== data.overviewMore;
      closeOverviewMenu();
      if (open) {
        list.menuId = data.overviewMore;
        render();
        app.querySelector('#overview-action-menu [role="menuitem"]')?.focus({ preventScroll: true });
      }
      return;
    }
    if (data.overviewSchedule) {
      closeOverviewMenu();
      return selectChallenge(data.overviewSchedule, "calendar");
    }
    if (data.overviewCopy) {
      closeOverviewMenu(true);
      navigator.clipboard.writeText(data.overviewCopy).then(() => {
        toast.success("Challenge ID copied", { id: "clipboard", description: data.overviewCopy, rawDescription: true });
      }).catch(() => {
        toast.error("Could not copy the ID", { id: "clipboard", description: "Check clipboard permissions." });
      });
      return;
    }
    if (data.overviewPage) {
      challengeListState().page = Number(data.overviewPage);
      closeOverviewMenu();
      render();
      return;
    }
    if (button.hasAttribute("data-overview-reset")) {
      Object.assign(challengeListState(), { query: "", status: "", boss: "", page: 1, menuId: null });
      render();
      app.querySelector("#overview-search")?.focus({ preventScroll: true });
      return;
    }
    if (data.edit) return selectChallenge(data.edit);
    if (data.entryDay) {
      const month = state.pack ? state.packCalendarMonth : state.schedule.month;
      const entry = getCellEntries(month, Number(data.entryDay), data.entryBracket)[Number(data.entryIndex)];
      if (!state.challenges.some((item) => item.id === entry.challengeId)) {
        state.notice = { variant: "amber", text: `${entry.challengeId} has no setup configuration. Its calendar entry will be preserved.` };
        return render();
      }
      selectChallenge(entry.challengeId, "calendar");
      state.schedule = { challengeId: entry.challengeId, startUtc: entry.startUtc, month,
        day: Number(data.entryDay), levelBracket: data.entryBracket };
      state.schedule.previous = clone(state.schedule);
      invalidatePreview();
      persistLocal();
      return render();
    }
    if (data.cellDay) {
      if (state.pack) state.schedule.month = state.packCalendarMonth;
      state.schedule.day = Number(data.cellDay);
      state.schedule.levelBracket = data.cellBracket;
      delete state.schedule.previous;
      invalidatePreview();
      persistLocal();
      return render();
    }
    if (data.calendarDay) return updateSchedule("day", data.calendarDay);
    if (data.month) {
      const date = new Date(`${state.schedule.month}-01T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + Number(data.month));
      const month = date.toISOString().slice(0, 7);
      if (monthDays(month)) updateSchedule("month", month);
      return;
    }
    const action = data.action;
    if (action === "new-challenge") newChallenge();
    if (action === "save-draft") saveDraft();
    if (action === "open-calendar") setView("calendar");
    if (action === "preview") previewChanges();
    if (action === "deploy") pushToStage();
    if (action === "new-schedule") {
      delete state.schedule.previous;
      invalidatePreview();
      persistLocal();
      render();
    }
    if (action === "today") {
      const now = new Date();
      state.schedule.day = now.getUTCDate();
      updateSchedule("month", now.toISOString().slice(0, 7));
    }
  });
  app.addEventListener("cancel", (event) => {
    if (event.target.id !== "delete-dialog") return;
    event.preventDefault();
    closeDeletion();
  }, true);
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest?.("[data-profile-menu]")) {
      const profileMenu = app.querySelector("[data-profile-menu]");
      if (profileMenu) profileMenu.open = false;
    }
    if (!event.target.closest?.("#overview-action-menu, [data-overview-more]")) closeOverviewMenu();
    if (event.target.closest?.("[data-combobox]")) return;
    app.querySelectorAll("[data-combobox]").forEach((root) => {
      root.querySelector("[data-combobox-input]").value = root.dataset.selectedLabel;
      setComboboxOpen(root, false);
    });
  });
  window.addEventListener("resize", () => closeOverviewMenu());
  window.addEventListener(preferencesEvent, render);
  window.addEventListener("storage", (event) => {
    if (event.key !== preferencesKey && event.key !== null) return;
    try {
      const preferences = JSON.parse(event.newValue) || { language: "en", theme: "light" };
      setPreferences(preferences, false);
    } catch {}
  });
  document.addEventListener("scroll", (event) => {
    if (!event.target.closest?.("#overview-action-menu")) positionOverviewMenu();
  }, true);
  window.addEventListener("beforeunload", (event) => {
    if (state.storageError && isDirty()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
bindEvents();
initialize();
