# Challenge Manager

Local application for creating, scheduling, reviewing and deploying game challenges to a mock STAGE pipeline.

## Run

Requires Node.js 22 or newer. Install dependencies with `npm install` before the first run.

```powershell
npm run dev
```

Open http://localhost:5173. If that port is occupied:

```powershell
$env:PORT = "5174"
npm run dev
```

The server binds to the local loopback interface. This application is for local development, without company credentials. `npm run dev` and `npm start` build the notification bundle before starting the server. After editing the React notification components with the server running, use `npm run build` and refresh the page.

## Data and workflow

- Saved drafts and unfinished editors are stored in this browser's localStorage. Switching challenges preserves unfinished edits. An incomplete or duplicate ID can be saved as an editor draft but cannot overwrite another challenge.
- Deployed mock configurations, calendar entries and audit history are persisted in `.data/store.json`. Keep a backup of that file when retaining local work matters.
- Draft saves never change the deployed baseline. Preview compares the current editor with that baseline.
- The server validates a preview and issues an expiring, single-use plan ID. Deploy executes that immutable plan. Changed server data requires a new review.
- A mock build progresses through Queued, Running and Success/Failure. Only success commits both setup and calendar together. Interrupted builds are marked failed on restart with no sheet changes applied.
- Clicking an existing calendar event edits that specific occurrence, including moving it to another date. Selecting an empty cell adds an entry. Other occurrences, including legacy IDs, are preserved.
- Editing a published Challenge ID is deliberately disabled to preserve calendar references. Create a new challenge for a new ID.
- Local drafts belong to this browser and origin, so changing the port or browser creates a separate draft workspace.

## Implementation

- `src/app.js`: vanilla JavaScript views, editor state, browser persistence and API calls.
- `src/components/ui.js`: local HTML component helpers with shadcn-inspired styling. These helpers are not React components; this project does not use Tailwind.
- `src/components/sonner.jsx`: the shadcn/ui Sonner component adapted to local theme tokens, using React, Sonner and Lucide icons.
- `src/notifications.jsx`: an isolated React toast root and build-status notifications. Saves, clipboard actions and deletions use toasts; builds update a single progress notification only when their status changes. Validation and persistent storage errors remain inline.
- `scripts/build-ui.mjs`: esbuild bundles only the notification widget into `src/generated/notifications.js`; the remaining app stays vanilla JavaScript.
- `src/preferences.js`: browser-only language/theme preferences and cross-tab synchronization, separate from draft persistence.
- `src/i18n.js` and `src/locales/pl.js`: explicit UI translations, parameterized messages and localized validation. Config keys, boss IDs and authored data are not translated.
- `src/domain.js`: shared validation, row mapping, targeted calendar mutations and diffs.
- `src/packs.js`: shared pack generation, validation and aggregated batch diffs.
- `src/deletion.js`: deletion scopes, calendar cleanup and pack membership updates.
- `src/fixtures.js`: mock configurations and preset catalogs.
- `server.mjs`: local API, persisted mock repository, preview plans and mock STAGE builds.

Endpoints: `GET /api/state`, `POST /api/preview` and `POST /api/deploy`. The deploy API rejects any target other than `stage`, independently of browser validation. Audit records include the approved diff, local initiator, build ID and outcome. No real Jenkins or Google Sheets service is contacted.

## Language and theme

**Settings > Appearance & language** offers English/Polski and a dark-theme switch. Preferences apply immediately, including existing notifications, and survive reload in `challenge-manager.preferences.v1`. The initial HTML applies the saved theme before styles render. Other open tabs synchronize preferences; unavailable browser storage shows a warning while keeping the selection for the current tab.

Polish mode translates navigation, forms, tooltips, actions, validation and notifications. Calendar dates use Polish formatting and a Monday-first week; UTC values, configuration IDs, boss names and existing authored challenge/pack content remain unchanged. Appearance changes do not save drafts, invalidate deployment previews or write to the server.

## Challenge packs

1. Open **Challenge Packs > New Pack**, or use **Create Pack** in Challenge Setup to start from the current configuration.
2. Choose bosses, set an ID prefix and a challenge name pattern. `{boss}` inserts the boss name; `{index}` optionally inserts its position. Generated IDs use `prefix-BossID`; target names use the boss label. All remaining setup fields are shared.
3. Save the pack, then select **Schedule Pack**. Sequential mode schedules one boss per interval (one day by default); Same time mode starts every member together. Reorder bosses under **Selected challenges**. The calendar shows pending entries, including across months; its Previous/Next buttons only browse the displayed month in pack mode.
4. Preview the entire schedule, each challenge's setup changes and the pack metadata. Review once, then **Push to STAGE** starts one mock build for the whole pack.

Packs remain separate from the single-challenge editor. Draft packs and unfinished work survive navigation and reload in localStorage. A successful deployment persists the pack definition, all generated setups and calendar appends in one transaction; a failed build commits none of them. History records the pack name, member IDs, approved changes and one build status.

Saved packs can be selected again in the library or the pack calendar selector. Reusing a published pack updates its existing IDs rather than duplicating setups. Its ID prefix is locked; **Duplicate pack** creates an independent pack with a new prefix. Scheduling again appends new occurrences without deleting earlier ones, and exact duplicate occurrences are not added twice. Removing bosses from a pack does not delete their existing setups or calendar entries. Individual deployed occurrences can still be edited through the normal single-challenge calendar flow.

The existing preview endpoint accepts either the single `challenge`/`schedule` payload or `{ pack: { id, name, idPrefix, namePattern, bossIds, template, schedule } }`. Pack schedules additionally specify `mode` (`sequential` or `simultaneous`) and an integer `intervalDays` from 1 to 366. Packs contain 1-100 distinct known bosses. Generation and all ID, preset, numeric, date and scheduling checks are repeated on the server; client-generated rows cannot override the reviewed snapshot.

## Deleting challenges and packs

- Use **Delete challenge** in a challenge row's action menu, or the trash button in **Challenge Packs**. A confirmation dialog shows the affected records before anything changes.
- Deleting a published challenge also removes all its calendar occurrences and membership in packs. Other challenges and calendar entries remain unchanged.
- Deleting a published pack removes only its definition by default. Select **Also delete generated challenges and their calendar entries** to include every challenge generated by that pack, including members previously removed from its selection.
- Published deletions use a server-approved preview and one mock STAGE build. Only a successful build applies the deletion; prior deployment history is retained. Stale previews require confirmation again.
- Unpublished draft deletion is local to this browser and does not start a build. After a successful published deletion, matching drafts in this browser are also cleared. Reloading during a build resumes tracking and cleanup.

The preview endpoint additionally accepts `{ deletion: { kind: "challenge" | "pack", id, includeChallenges: false } }`. Only packs accept `includeChallenges: true`; affected IDs are resolved on the server, not supplied by the client.

## Validation assumptions

The setup mapping covers the 38 named columns in the supplied spreadsheet PDF, in header order. `tests/fixtures/spreadsheet.mjs` records its Revenant Assassin example, including optional blanks and fractional values, for domain, API, pack and browser regression tests.

- `ModeID` is numeric: `0` is a regular challenge ending with a boss, `1` is Last Stand. Old saved mock names remain visible but require an explicit choice before preview/deployment; no ambiguous migration rewrites existing records or drafts.
- Arena, wave, reward, drop and player-group presets are editable config keys with suggestions, not exhaustive catalogs. New challenges leave required external keys blank for explicit selection. Known PDF examples are included alongside legacy mock suggestions. Existence in the actual game configs is not verified by the local mock.
- Graphic fields accept HTTP/HTTPS URLs or relative game asset paths, e.g. `challenge/image.png`. Game paths are preserved as config values, not fetched from the dashboard server. Path traversal, absolute local paths and non-web URL schemes are rejected.
- NPC variance and multiplier inputs accept decimal points or commas and store finite numbers. `SeparateLevels` is a checkbox internally and maps to numeric `0`/`1` in sheet diffs. Absent optional values remain blank.
- `MinutesLeftToUseHardLimit`: blank disables, zero enables, positive integer values have no maximum tied to the challenge duration. `AttemptPrices` is a comma-separated sequence of non-negative whole ticket counts.
- `MinPlayersRequired` is the minimum division size, `Players` the soft division limit and `PlayersHardLimit` the hard division limit. DisplayName and ChallengeDescription tooltips identify the localization keys used in the supplied example.

Level ranges must exactly match one supported calendar bracket. IDs use letters, digits, underscores and hyphens. Required numeric fields must be finite and valid; blank optional fields remain blank. Time is explicitly UTC in `HH:mm` format. Exact duplicate occurrences, past starts, overlapping availability and absent visual assets are warnings, not automatic overwrites.

The mock calendar serialization is `HH:mm:ChallengeID`, separated by ` | `. The real spreadsheet delimiter, time encoding, required fields by game mode, preset catalogs and Jenkins write/rollback sequence still need team confirmation before adding real adapters. Authentication and permissions for a shared company deployment are not implemented.

## Verification

```powershell
npm test
npm run test:browser
```

Domain/API tests use isolated temporary data stores. Browser tests use Playwright and installed Google Chrome, exercise complete workflows, and capture desktop/mobile screenshots in `.tmp/screenshots`. To use installed Edge, set `$env:BROWSER_CHANNEL = "msedge"`. Remote image/font requests are stubbed in browser tests; image-load failures are displayed explicitly.
