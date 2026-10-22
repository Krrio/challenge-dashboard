// Conceptual data-access contract for the Challenge Manager server. server.mjs
// depends on this shape, not on a specific storage backend, so a local
// MockRepository and a future GoogleSheetsRepository can be swapped without
// touching the request handlers, domain validation or the front end.
// See docs/sheet-driven-architecture.md for the full migration plan.
export class ConfigRepository {
  /** Load (or lazily create) the persisted state. Called once at startup. */
  async init() {
    throw new Error("ConfigRepository.init is not implemented.");
  }

  /** Current in-memory state: { revision, challenges, calendar, history, packs }. */
  get state() {
    throw new Error("ConfigRepository.state is not implemented.");
  }

  async getChallenge(id) {
    return this.state.challenges.find((item) => item.id === id) || null;
  }

  async listChallenges() {
    return this.state.challenges;
  }

  async getCalendar(month) {
    return this.state.calendar?.[month] || null;
  }

  /** Normalized dependent-tab catalogs (bosses, presets, etc.) for suggestions and validation. */
  async getReferences() {
    throw new Error("ConfigRepository.getReferences is not implemented.");
  }

  /** Atomically replace the persisted state and update the in-memory snapshot. */
  async persist(_nextState) {
    throw new Error("ConfigRepository.persist is not implemented.");
  }
}
