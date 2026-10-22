// Local/mock ConfigRepository: the exact behavior server.mjs used to inline
// (atomic JSON writes to .data/store.json, interrupted-build recovery on startup).
// This is the default repository for local development and tests, so no company
// credentials are required to work on UI/domain behavior. See
// docs/sheet-driven-architecture.md, "Phase 1 - Create interfaces without changing
// behavior".
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { createStore } from "../fixtures.js";
import { buildReferenceCatalog } from "../references.js";
import { ConfigRepository } from "./config-repository.js";

export class MockRepository extends ConfigRepository {
  #storePath;
  #store = null;

  constructor(storePath) {
    super();
    this.#storePath = storePath;
  }

  get state() {
    return this.#store;
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
      await this.persist(createStore());
    }
    this.#store.packs ||= [];
    const interrupted = this.#store.history.filter((job) => ["Queued", "Running"].includes(job.status));
    if (interrupted.length) {
      interrupted.forEach((job) => {
        job.status = "Failure";
        job.log = "Server stopped before completion. No setup or calendar changes were committed.";
      });
      await this.persist(this.#store);
    }
    return this.#store;
  }

  async getReferences() {
    return buildReferenceCatalog();
  }

  async persist(nextState) {
    await mkdir(dirname(this.#storePath), { recursive: true });
    const temporary = `${this.#storePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(nextState, null, 2), "utf8");
    await rename(temporary, this.#storePath);
    this.#store = nextState;
    return nextState;
  }
}
