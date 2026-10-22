// Local/mock ConfigRepository: keeps the "spreadsheet" (setups, calendar, packs) and the dashboard
// audit history in .data/store.json. It applies the same targeted row/cell changes a
// GoogleSheetsRepository would write, with the same optimistic-concurrency check, so no company
// credentials are needed to work on UI, domain or deployment behavior. Each write replaces the
// file atomically. See docs/sheet-driven-architecture.md.
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { createStore } from "../fixtures.js";
import { buildReferenceCatalog } from "../references.js";
import { applyChanges as applySheetChanges } from "../sheet-changes.js";
import { ConfigRepository } from "./config-repository.js";

export class MockRepository extends ConfigRepository {
  #storePath;
  #spreadsheetId;
  #store = null;

  constructor(storePath, { spreadsheetId = process.env.SPREADSHEET_ID || "mock-spreadsheet" } = {}) {
    super();
    this.#storePath = storePath;
    this.#spreadsheetId = spreadsheetId;
  }

  get state() {
    return this.#store;
  }

  get spreadsheetId() {
    return this.#spreadsheetId;
  }

  async init() {
    try {
      const parsed = JSON.parse(await readFile(this.#storePath, "utf8"));
      if (!Number.isInteger(parsed.revision) || !Array.isArray(parsed.challenges) || !parsed.calendar || !Array.isArray(parsed.history) ||
        (parsed.packs != null && !Array.isArray(parsed.packs))) {
        throw new Error("Invalid local data store. Restore .data/store.json from a backup.");
      }
      this.#store = parsed;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.#write(createStore());
    }
    this.#store.packs ||= [];
    return this.#store;
  }

  async getReferences() {
    return buildReferenceCatalog();
  }

  async applyChanges(changes) {
    return this.#write(applySheetChanges(this.#store, changes));
  }

  async saveJob(job, metadata = {}) {
    const next = structuredClone(this.#store);
    const index = next.history.findIndex((item) => item.id === job.id);
    if (index < 0) next.history.unshift(structuredClone(job));
    else next.history[index] = structuredClone(job);
    Object.assign(next, metadata);
    return this.#write(next);
  }

  async #write(nextState) {
    await mkdir(dirname(this.#storePath), { recursive: true });
    const temporary = `${this.#storePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(nextState, null, 2), "utf8");
    await rename(temporary, this.#storePath);
    this.#store = nextState;
    return nextState;
  }
}
