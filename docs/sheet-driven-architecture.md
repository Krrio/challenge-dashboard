# Challenge Manager — sheet-driven architecture

Repository-aware spec for `Krrio/challenge-dashboard` (branch `main`), STAGE only.

**Goal:** keep Google Sheets as source of truth while preserving the existing UI, validation, preview and STAGE deployment workflow.

**Core decision:** do not rebuild every spreadsheet relationship inside the app. Read real sheet data and use it to power dropdowns, previews and cross-sheet validation. Write only where the Challenge Manager is explicitly responsible: `ChallengeSetupConfig` and `ChallengeCalendar`.

## 1. Executive summary

The project is already much more than a prototype: a mature editor, challenge packs, calendar editing, deletion flows, bilingual UI, browser persistence, preview plans, immutable deploy reviews, mock build lifecycle, audit history and server-side validation. The next step is an **adapter migration, not a rewrite**.

- Keep the existing front-end flow and domain logic as the product shell.
- Replace static fixture catalogs and the local JSON baseline with a repository layer that can read from Google Sheets.
- Treat dependent tabs (reward presets, wave presets, arenas, player-group presets, other config catalogs) as read-only reference sources at first.
- Use those reference rows to populate suggestions, validation status and contextual previews in the existing Challenge Setup UI.
- Keep `ChallengeSetupConfig` and `ChallengeCalendar` as controlled write targets, with the current preview → immutable plan → STAGE deploy safety model.
- Keep a mock adapter for local development so no company credentials are required to work on UI/domain behavior.

**What changes conceptually:** Challenge Manager becomes a smart UI + validation layer over the spreadsheet ecosystem, not a competing configuration database.

## 2. What already exists in the repository

| Area | Current implementation | Implication for the migration |
|---|---|---|
| Application shell | Local Node.js app. Most views/state live in `src/app.js`; UI helpers in `src/components/ui.js`; React is currently isolated mainly to Sonner notifications. | Do not introduce a framework rewrite just to add Sheets integration. |
| Domain layer | `src/domain.js` already owns validation, spreadsheet row mapping, calendar mutation logic and diffs. | This is the natural place to keep pure rules; remove only assumptions that require fixture-owned catalogs. |
| Mock data | `src/fixtures.js` provides mock configs and preset catalogs; `.data/store.json` persists deployed mock state. | Replace behind interfaces; preserve as `MockRepository` for local work and tests. |
| Server API | `GET /api/state`, `POST /api/preview`, `POST /api/deploy`. Deploy is server-enforced STAGE-only. | Preserve the endpoints initially to minimize front-end churn. |
| Safety model | Preview returns an expiring single-use plan tied to store revision. Deploy rejects stale plans and commits after successful mock build. | Keep this model. It maps well to real sheet/Jenkins integration and prevents blind writes. |
| Packs & deletion | Pack generation/scheduling plus challenge/pack deletion are already implemented and transaction-like. | Adapters must support batch reads/writes and deletion planning without bypassing review. |
| i18n & preferences | English/Polish, dark theme, cross-tab preference sync. | No architectural reason to touch this. |
| Testing | Node domain/API tests plus Playwright browser tests. | Add adapter contract tests and fixture-based sheet parsing tests rather than discarding the current test suite. |

## 3. Current flow worth preserving

```
Editor / Pack / Delete
  |
  v
POST /api/preview
  |
  +--> server validation
  +--> diff calculation
  +--> immutable preview plan (revision-bound, 15 min)
  |
  v
User reviews changes
  |
  v
POST /api/deploy target=stage
  |
  +--> stale-plan check
  +--> validation repeated
  +--> Queued -> Running -> Success/Failure
  |
  v
Commit state only on success
```

This is a strong safety boundary. The Sheets/Jenkins work should plug in underneath it instead of replacing it.

## 4. Target architecture: Sheets remain source of truth

```
            GOOGLE SHEETS
+----------------+ +----------------+ +----------------+
| Reward configs | | Wave presets   | | Arena / other  |
+-------+--------+ +-------+--------+ +-------+--------+
        \                  |                  /
         \                 |                 /
          +------ Reference Catalog -------+
                        |
                        v
                Challenge Manager UI
                - autocomplete
                - contextual preview
                - validation
                - cross-sheet checks
                        |
                        v
                Preview / immutable plan
                        |
                    STAGE deploy
                        |
          +-------------+-------------+
          v                           v
  ChallengeSetupConfig        ChallengeCalendar
          |                           |
          +------------- Jenkins ------+
                        |
                      STAGE
```

**Important boundary:** the app may read many tabs, but that does not mean it should edit them. Start with broad READ access and narrow WRITE ownership.

## 5. Adapter/repository boundary

```js
// conceptual contract - exact naming can follow the existing code style
class ConfigRepository {
  async loadState()
  async getChallenge(id)
  async listChallenges()
  async getCalendar(month)
  async getReferences()
  async applyApprovedPlan(plan)
}

class MockRepository extends ConfigRepository { ... }
class GoogleSheetsRepository extends ConfigRepository { ... }
```

The server and domain code depend on `ConfigRepository`, not on `.data/store.json` or Google APIs directly. This keeps local development and test behavior intact.

> **Implemented (Phase 1):** `src/repositories/config-repository.js` defines this contract; `src/repositories/mock.js` implements it as `MockRepository`, wrapping the exact local-store behavior `server.mjs` used to inline. `server.mjs` takes a `repository` (defaulting to `MockRepository`) instead of touching the filesystem directly. A `GoogleSheetsRepository` does not exist yet — see the confirmation checklist in section 14 before building one.
>
> **Implemented (Phase 1b):** the contract no longer persists a whole state snapshot. It is `init()`, `state`, `spreadsheetId`, `getReferences()`, `applyChanges(changes)` and `saveJob(job)`. `applyChanges` receives targeted `ChallengeSetupConfig` row, `ChallengeCalendar` cell and pack changes (`src/sheet-changes.js`), each with the value it expects to replace, and writes nothing if any target changed since the preview (HTTP 409). That is the shape a Sheets adapter needs: a values batch update guarded by a re-read of the same ranges.

## 6. Reference Catalog

The biggest value is not merely reading rows — it's resolving references between tabs and exposing them to the UI in a normalized form.

```
ReferenceCatalog
  rewardPresets[]
  wavePresets[]
  arenas[]
  bosses[]
  playerGroupPresets[]
  difficultyPresets[]
  dropTiers[]
  ...future catalogs
```

- Each reference keeps its source tab and source key so the UI can explain where it came from.
- The display model can contain label/details for preview, while the stored setup value remains the exact config key expected by the game.
- If a value exists in `ChallengeSetupConfig` but is absent from the current catalog, preserve it and show an explicit unresolved-reference warning instead of silently rewriting it.
- Reference fetching should be cacheable with a visible last-synced timestamp and a manual refresh action.

> **Implemented (Phase 1):** `src/references.js` builds exactly this shape (`{ value, label, sourceTab, sourceKey }` per entry, plus `syncedAt`) from `src/fixtures.js` today, served via `GET /api/references`. `src/app.js`'s preset fields (`BossID`, `Arena`, `WavePreset`, `RewardPreset`, `DropTier`, `PlayersGroupPreset`, `DifficultyFactorPreset`) read from that catalog when it has loaded and fall back to the static fixtures otherwise, so the UI behaves identically before and after the fetch resolves.
>
> **Implemented (Phase 1b):** validation (`validateChallenge`, via `context.references`) and packs (`evaluatePack`/`generatePack`) no longer import `src/fixtures.js`; they receive the catalog from the caller. The server passes `repository.getReferences()`, so a boss or pack preset served by a future Sheets repository is accepted without code changes. The catalog also carries the ready-made pack presets (Regression Pack, RC Pack).

## 7. How this changes the existing Setup UI

The visual product can remain almost identical — the difference is where field options and validation evidence come from.

| Field | Today | After integration | Example UX |
|---|---|---|---|
| RewardPreset | Editable config key + fixture suggestions | Options read from reward-related sheet(s) | Dropdown/search + reward content preview + source tab badge |
| WavePreset | Editable config key + fixture suggestions | Options read from `WavePresetsConfig` | Dropdown/search + wave summary |
| Arena | Editable config key + fixture suggestions | Options read from arena config tab | Dropdown/search + exists/missing validation |
| BossID | Known fixture list | Boss catalog read from real config source | Searchable select; unresolved legacy values remain visible |
| Player group / difficulty / drop | Fixture-backed or free-form | Reference-aware suggestions from real tabs | Choose existing key or retain explicit free-form only where the game supports it |

**Do not over-constrain:** some spreadsheet fields are intentionally config keys, and the README already notes that local catalogs are not exhaustive. The real integration should distinguish: known reference, valid-but-unresolved key, and invalid format.

## 8. Cross-sheet validation model

1. **Local/domain validation:** ID syntax, numeric ranges, timing relationships, bracket matching, duplicate scheduling, asset path syntax, player limits, etc.
2. **Reference validation:** does RewardPreset/WavePreset/Arena/BossID/etc. resolve in the current sheet snapshot?
3. **Cross-tab semantic validation:** optional future checks such as reward preset compatibility or mode-specific requirements, only where the actual sheets support those rules.
4. **Deploy-time revalidation:** rerun both local and reference validation against the revision/snapshot used to create the approved plan.

```
READY FOR STAGE
  18 checks passed
  0 blocking errors
  2 warnings

  RewardPreset  FireReward60      OK - ChallengeRewardsConfig
  WavePreset    InfernalHound_V1  OK - WavePresetsConfig
  Arena         Graveyard         OK - ArenaConfig
  Calendar      60-69             OK - matches setup
  Visual asset  badge URL         WARN - missing
```

## 9. API evolution with minimal front-end disruption

```
GET /api/state
  -> current challenges, calendar, packs, history, revision

GET /api/references       // new, optional
  -> normalized catalogs + source metadata + syncedAt

POST /api/preview
  -> same payloads as today
  -> validates against repository snapshot
  -> returns immutable plan + diff + validation

POST /api/deploy
  -> target must still equal 'stage'
  -> invokes approved write/Jenkins adapter
  -> commits audit state only after success
```

If reference data is small enough, it can be included in `/api/state` at first; splitting it later is straightforward. *(Implemented as a separate `GET /api/references` endpoint — see section 6.)*

## 10. Controlled writes to the spreadsheet

- `ChallengeSetupConfig`: update the exact row for an existing `CompetitionID` or append a new row after validation.
- `ChallengeCalendar`: mutate only the targeted day + level bracket cell, preserving all other entries in that cell and all unrelated cells.
- Dependent tabs: read-only in the first real integration. Offer "Open in Sheet" when a user needs to create/edit a preset that the dashboard does not own.
- Use optimistic concurrency: capture a revision/hash/ETag-equivalent for the relevant sheet range when previewing; reject deploy if the source changed before write.
- For pack deploys, batch all generated setup/calendar mutations into one approved plan. Do not partially apply a pack.
- For deletion, resolve affected rows/cells server-side exactly as the current code already resolves affected IDs server-side.

## 11. Jenkins integration stays behind deploy

The dashboard must not become a direct browser-to-Jenkins client. Jenkins credentials stay server-side.

```
Browser UI
  |
  v
Challenge Manager server
  |
  +--> Google Sheets adapter
  |
  +--> Jenkins adapter (STAGE job only)
  |
  v
STAGE
```

**Known parameters:** the STAGE job takes `SPREADSHEET_ID`, `UTC_YEAR`, `UTC_MONTH` and `IMPORTER_TYPE` (only `challenge`) and imports one UTC month from the spreadsheet. That settles the ordering: write the sheet first, then run one import per affected month (every month with a changed calendar cell, plus current and future months that schedule a changed setup).

> **Implemented (Phase 1b, mock):** `src/integrations/jenkins.js` builds these parameters and `MockJenkins` stands in for the job. A deployment writes the approved rows and cells, then imports each month in order. If an import fails, the written rows and cells are rolled back and months already imported are imported again from the restored sheet. A deployment interrupted by a restart is rolled back on startup. Every build and its parameters are recorded in the audit history. Whether the team prefers rollback or a retry of the failed import still needs confirmation (section 14).

- Keep the existing server-side hard rejection of non-stage targets.
- Use a dedicated service account/token with the minimum permission required to trigger/read the one STAGE job.
- Expose friendly build states in the existing UI; keep raw Jenkins URL/log as secondary detail.
- Only mark a plan as successfully applied after the agreed real-world sequence is complete. Exact Sheets-before-Jenkins vs. Jenkins-before-Sheets ordering must be confirmed with the team.

## 12. Concrete mapping to the current codebase

| Current file | Keep / change | Suggested responsibility after migration |
|---|---|---|
| `src/app.js` | Mostly keep | Render UI, editor state, drafts, API calls, reference-driven selects/previews. |
| `src/domain.js` | Keep pure rules; refactor fixture dependencies | Validation, row mapping, calendar mutations, diffs. Accept reference context instead of importing preset catalogs directly. |
| `src/fixtures.js` | Keep for local/mock mode | Mock repository seed and test fixtures; no longer the production reference authority. |
| `src/packs.js` | Keep | Generate and validate pack operations against repository/reference context. |
| `src/deletion.js` | Keep | Build deletion plan from repository snapshot. |
| `server.mjs` | Refactor around repository/adapters | Orchestrate preview plans, revisions, deploy, Jenkins status and persistence/audit. |
| `src/repositories/mock.js` | **Added** | Current local `.data` behavior behind an interface. |
| `src/repositories/google-sheets.js` | Not yet added | Read/write only approved sheet ranges; expose revision metadata. |
| `src/references.js` | **Added** | Normalize cross-tab catalogs, resolve IDs, cache snapshot, source metadata. |
| `src/integrations/jenkins.js` | Not yet added | Trigger/poll STAGE build; no browser credentials. |

## 13. Recommended migration phases

**Phase 1 — Create interfaces without changing behavior.** Wrap the current local store and fixture catalogs behind `MockRepository` / `ReferenceCatalog`. Keep every existing test green. No Google credentials yet. ✅ **Done** — see sections 5 and 6.

**Phase 1b — Prepare for the real adapters without credentials.** Targeted row/cell writes with optimistic concurrency, validation and packs driven by the repository catalog, a Jenkins mock with the real parameters (one build per UTC month), rollback and restart recovery. ✅ **Done.**

**Phase 2 — Reference reads only.** Implement a Google Sheets read adapter for selected dependent tabs. Enrich `/api/references`. Drive `RewardPreset`, `WavePreset`, `Arena`, `BossID` and other selects from live normalized rows. No real writes. *(Blocked on the section 14 checklist — no real spreadsheet ID/credentials exist yet.)*

**Phase 3 — Cross-sheet validation.** Pass the live reference snapshot into preview validation. Add resolved/unresolved/invalid statuses and contextual preview cards. Preserve existing free-form behavior where required.

**Phase 4 — Real `ChallengeSetupConfig` read/write.** Read the actual setup rows into repository state. Implement precise row update/append with stale-snapshot protection. Preview diff must show exact sheet mutations before write.

**Phase 5 — Real `ChallengeCalendar` read/write.** Parse the day × level-bracket matrix and preserve multiple entries per cell. Implement targeted occurrence moves/adds matching current domain semantics.

**Phase 6 — Jenkins STAGE adapter.** Replace the mock build function with a STAGE-only Jenkins adapter. Keep queued/running/success/failure UX and audit history.

**Phase 7 — Harden shared usage.** Authentication, access control, service accounts, centralized deployment/audit store if multiple users need concurrent shared operation.

## 14. Team-confirmation checklist before real adapters

- Exact spreadsheet ID(s) and tab names used on STAGE.
- Which tab/column is canonical for each selectable reference: bosses, reward presets, wave presets, arenas, player-group presets, difficulty presets, drop tiers and any others.
- Whether references are unique by one key or require composite keys/aliases.
- Exact `ChallengeCalendar` serialization and delimiter rules in the real sheet. The local mock currently uses `HH:mm:ChallengeID` and its own separator.
- How month/year are represented in the real `ChallengeCalendar` workbook and whether one sheet is rotated/reused monthly.
- Jenkins job URL, authentication method, crumb requirements and expected build result API. Parameters are known (`SPREADSHEET_ID`, `UTC_YEAR`, `UTC_MONTH`, `IMPORTER_TYPE=challenge`); confirm the `UTC_MONTH` format (the mock sends two digits, e.g. `09`) and whether builds for several months may run in parallel.
- Ordering is settled (sheet first, then one import per month). Still open: when an import fails, should the sheet be rolled back (current behavior) or kept and the import retried?
- Concurrency expectations: one operator at a time vs. multiple people editing the same workbook.
- Whether Google Sheets should be accessed via user OAuth or a server service account.
- Which warnings should block deploy in production-like use versus remain warnings.

None of this is guessed at in the current code — Phase 2+ is blocked until these are answered.

## 15. Implementation brief

**Primary instruction:** do not redesign or rewrite the current Challenge Manager. Treat the existing repository as the baseline. Introduce a data-access boundary that lets the same UI/domain workflow run against `MockRepository` locally and `GoogleSheetsRepository` at work. Google Sheets remain the source of truth.

**Priority order:**
1. Preserve all current workflows and tests.
2. Remove direct domain dependency on fixture preset catalogs.
3. Introduce repository + reference-catalog interfaces.
4. Keep mock adapter as default local mode.
5. Add live Sheets READ integration first.
6. Use live rows for suggestions, reference previews and validation.
7. Add controlled writes only for `ChallengeSetupConfig` and `ChallengeCalendar`.
8. Preserve immutable preview plans and STAGE-only server enforcement.
9. Add Jenkins only after real sheet read/write semantics are verified.
10. Never place Google/Jenkins secrets in browser code.

## 16. Definition of done for the next architectural milestone

- [x] Existing single challenge, pack, calendar edit and deletion tests remain green in mock mode.
- [x] UI can switch from fixture options to a normalized reference payload without layout changes.
- [ ] At least RewardPreset, WavePreset, Arena and BossID can be populated from a **real or recorded-sheet** adapter (currently mock-only; blocked on section 14).
- [ ] Preview reports whether every selected external key resolves in the latest reference snapshot (reference validation is not wired into `validateChallenge` yet — local/domain validation is unchanged).
- [x] Unresolved existing values are not destroyed or silently normalized.
- [x] No production target can be requested from the server.
- [x] No Google or Jenkins secret is present in client-delivered JavaScript (none exist yet).
- [x] The next step (real setup/calendar writes) can be implemented by swapping repository methods, not by rewriting the UI.
- [x] Writes are targeted row/cell changes with a before-value check; deployments write the sheet first and run one import build per UTC month with the real Jenkins parameters (mocked).
- [x] Validation and packs read bosses and pack presets from the repository catalog, not from `src/fixtures.js`.

---

*This document was provided by the team as the target architecture and is tracked here so the `docs/sheet-driven-architecture.md` references in `server.mjs`, `src/references.js` and `src/repositories/*.js` resolve to a real file. Update the checkboxes in section 16 as later phases land.*
