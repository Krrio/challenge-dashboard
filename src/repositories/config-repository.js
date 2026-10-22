// Data-access contract for the Challenge Manager server. server.mjs depends on this shape, not on
// a specific storage backend, so the local MockRepository and a future GoogleSheetsRepository can
// be swapped without touching the request handlers, domain validation or the front end.
// See docs/sheet-driven-architecture.md for the full migration plan.
export class ConfigRepository {
  /** Load the current spreadsheet snapshot and dashboard metadata. Called once at startup. */
  async init() {
    throw new Error("ConfigRepository.init is not implemented.");
  }

  /** Current snapshot: { revision, challenges, calendar, packs, history, nextBuildNumber }. */
  get state() {
    throw new Error("ConfigRepository.state is not implemented.");
  }

  /** Spreadsheet the STAGE import job reads (the SPREADSHEET_ID build parameter). */
  get spreadsheetId() {
    throw new Error("ConfigRepository.spreadsheetId is not implemented.");
  }

  /** Normalized dependent-tab catalogs (bosses, presets, pack presets) for lists, validation and packs. */
  async getReferences() {
    throw new Error("ConfigRepository.getReferences is not implemented.");
  }

  /**
   * Write targeted row, cell and pack changes ({ setup, calendar, packs }, see sheet-changes.js).
   * Every target must still hold its `before` value, otherwise nothing is written and the call
   * rejects with status 409. Resolves to the new snapshot.
   */
  async applyChanges(_changes) {
    throw new Error("ConfigRepository.applyChanges is not implemented.");
  }

  /** Insert or update a deployment audit record, optionally with dashboard metadata such as nextBuildNumber. */
  async saveJob(_job, _metadata = {}) {
    throw new Error("ConfigRepository.saveJob is not implemented.");
  }
}
