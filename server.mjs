import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { validateChallenge, buildDiff } from "./src/domain.js";
import { evaluatePack } from "./src/packs.js";
import { buildDeletionPlan } from "./src/deletion.js";
import { planChanges, invertChanges, changesState, countChanges, importMonths } from "./src/sheet-changes.js";
import { MockJenkins, importParameters } from "./src/integrations/jenkins.js";
import { MockRepository } from "./src/repositories/mock.js";

const root = dirname(fileURLToPath(import.meta.url));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const httpError = (status, message) => Object.assign(new Error(message), { status });
const buildMonth = (build) => `${build.parameters.UTC_YEAR}-${build.parameters.UTC_MONTH}`;

export async function createApp({ storePath = resolve(root, ".data/store.json"), runBuild = () => delay(1200), queueDelay = 450,
  repository = new MockRepository(storePath), jenkins = null } = {}) {
  // The server depends on the ConfigRepository interface and a Jenkins adapter, not on a storage
  // backend or build server directly. MockRepository (local .data/store.json) and MockJenkins are the
  // defaults, so no company credentials are required locally; a GoogleSheetsRepository and a real
  // Jenkins adapter can be passed in instead. See docs/sheet-driven-architecture.md.
  await repository.init();
  const current = () => repository.state;
  jenkins ||= new MockJenkins({ runBuild, nextNumber: 1 + Math.max(0, ...current().history.flatMap((job) => job.builds || []).map((build) => build.number)) });
  const saveJob = (id, patch) => repository.saveJob({ ...current().history.find((job) => job.id === id), ...patch });
  // The rollback data is only needed while a deployment can still be interrupted.
  const finishJob = (id, patch) => {
    const { changes: _rollback, ...job } = { ...current().history.find((item) => item.id === id), ...patch };
    return repository.saveJob(job);
  };

  // A deployment interrupted by a restart may already have written the spreadsheet. Roll its rows
  // and cells back so nothing half-deployed stays behind.
  for (const job of current().history.filter((item) => ["Queued", "Running"].includes(item.status))) {
    const imported = (job.builds || []).filter((build) => build.status === "SUCCESS").map(buildMonth);
    let log = "Server stopped before completion. The spreadsheet was not changed.";
    const written = job.changes ? changesState(current(), job.changes) : "before";
    if (written === "after") {
      try {
        await repository.applyChanges(invertChanges(job.changes));
        log = `Server stopped during the deployment. The approved rows and cells were rolled back.${imported.length ? ` Run the STAGE import again for ${imported.join(", ")}.` : ""}`;
      } catch (error) {
        log = `Server stopped during the deployment and the rollback failed (${error.message}). Check the spreadsheet manually.`;
      }
    } else if (written === "mixed") {
      log = "Server stopped during the deployment and the spreadsheet holds only part of the approved changes. Check it manually.";
    }
    await finishJob(job.id, { status: "Failure", phase: "failed", log });
  }

  const plans = new Map();
  let activeBuild = null;
  let task = Promise.resolve();
  const json = (res, status, data) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(data));
  };
  const body = async (req) => {
    if (!req.headers["content-type"]?.startsWith("application/json")) throw httpError(415, "Use application/json.");
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 512 * 1024) throw httpError(413, "Request is too large.");
      chunks.push(chunk);
    }
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      return parsed;
    } catch {
      throw httpError(400, "Invalid JSON request.");
    }
  };
  // The STAGE importer reads the spreadsheet, so a deployment writes the approved rows and cells
  // first and then runs one import build per affected UTC month. If an import fails, the rows and
  // cells are rolled back and months already imported are imported again from the restored sheet.
  const execute = async (id, plan) => {
    let written = null;
    const builds = [];
    try {
      await delay(queueDelay);
      const changes = planChanges(current(), plan);
      await saveJob(id, { status: "Running", phase: "writing", changes, writes: countChanges(changes), log: "Writing the approved rows and cells to the spreadsheet." });
      await repository.applyChanges(changes);
      written = changes;
      const months = importMonths(changes, current().calendar);
      await saveJob(id, { phase: "importing", months,
        log: months.length ? `Spreadsheet updated. Running the STAGE import for ${months.join(", ")}.` : "Spreadsheet updated. No scheduled month needs a STAGE import." });
      for (const month of months) {
        const build = await jenkins.runImport(importParameters(repository.spreadsheetId, month), plan);
        builds.push(build);
        await saveJob(id, { builds: [...builds] });
        if (build.status !== "SUCCESS") throw new Error(`STAGE import of ${month} failed (build #${build.number})${build.log ? `: ${build.log}` : ""}`);
      }
      await finishJob(id, { status: "Success", phase: "done", builds, log: plan.deletion
        ? "Spreadsheet updated and STAGE import finished. The selected data was removed; previous audit records were preserved."
        : "Spreadsheet updated and STAGE import finished. Setup and calendar changes were written together." });
    } catch (error) {
      let log = error.status === 409 ? `Deployment failed: ${error.message}` : `Deployment failed: ${error.message}. The spreadsheet was not changed.`;
      if (written) {
        try {
          await repository.applyChanges(invertChanges(written));
          const repeated = [];
          for (const build of builds.filter((item) => item.status === "SUCCESS" && !item.rollback)) {
            const repeat = { ...(await jenkins.runImport(build.parameters, plan)), rollback: true };
            builds.push(repeat);
            repeated.push(`${buildMonth(repeat)}${repeat.status === "SUCCESS" ? "" : " (import failed)"}`);
          }
          log = `Deployment failed: ${error.message}. The approved rows and cells were rolled back${repeated.length ? ` and ${repeated.join(", ")} imported again` : ""}.`;
        } catch (rollbackError) {
          log = `Deployment failed: ${error.message}. Rolling the spreadsheet back also failed (${rollbackError.message}); check it manually.`;
        }
      }
      try {
        await finishJob(id, { status: "Failure", phase: "failed", builds, log });
      } catch (storageError) {
        Object.assign(current().history.find((job) => job.id === id), { status: "Failure", phase: "failed", builds, log: `${log} Audit persistence also failed: ${storageError.message}` });
      }
    } finally {
      activeBuild = null;
    }
  };

  const server = createServer(async (req, res) => {
    try {
      // JSON writes require a local host and a same-origin browser request.
      const authority = new URL(`http://${req.headers.host}`);
      if (!["localhost", "127.0.0.1", "[::1]"].includes(authority.hostname)) throw httpError(403, "Local requests only.");
      if (req.headers.origin && req.headers.origin !== authority.origin) throw httpError(403, "Cross-origin requests are not allowed.");
      const url = new URL(req.url, authority);
      if (url.pathname.startsWith("/api/")) {
        if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, current());
        // Normalized dependent-tab catalogs (bosses, presets, ...), sourced from the mock
        // repository today; a GoogleSheetsRepository would answer the same shape from
        // real rows. See docs/sheet-driven-architecture.md, section 6 and 9.
        if (req.method === "GET" && url.pathname === "/api/references") return json(res, 200, await repository.getReferences());
        if (req.method !== "POST") throw httpError(405, "Method not allowed.");
        const input = await body(req);
        if (url.pathname === "/api/preview") {
          if ([input.pack, input.deletion, input.challenge].filter(Boolean).length > 1) throw httpError(400, "Choose one operation per preview.");
          if (!input.deletion && !input.pack && (!input.challenge || !input.schedule || typeof input.challenge !== "object" || typeof input.schedule !== "object")) {
            throw httpError(400, "A challenge and schedule are required.");
          }
          const store = current();
          const references = await repository.getReferences();
          const batch = input.deletion ? buildDeletionPlan(store, input.deletion) : input.pack ? evaluatePack(store, input.pack, { references }) : null;
          const validation = batch ? batch.validation : validateChallenge(input.challenge, input.schedule, { ...store, originalId: input.originalId || "", references });
          if (validation.some((item) => item.severity === "error")) return json(res, 422, { error: "Resolve the validation errors.", validation });
          const diff = batch ? batch.diff : buildDiff(store, input.challenge, input.schedule, input.originalId || "");
          if (!diff.setup.length && !diff.calendar.length && !diff.pack?.length) throw httpError(409, "No changes to deploy.");
          for (const [key, plan] of plans) if (plan.expiresAt < Date.now()) plans.delete(key);
          if (plans.size >= 100) plans.delete(plans.keys().next().value);
          const plan = {
            id: randomUUID(), revision: store.revision, expiresAt: Date.now() + 15 * 60 * 1000,
            ...(batch?.deletion ? { deletion: batch.deletion } : batch ? { pack: batch.pack, challenges: batch.challenges, schedules: batch.schedules, members: batch.members } : {
              challenge: structuredClone(input.challenge), schedule: structuredClone(input.schedule), originalId: input.originalId || "",
            }), diff, validation,
          };
          plans.set(plan.id, plan);
          return json(res, 200, plan);
        }
        if (url.pathname === "/api/deploy") {
          if (input.target !== "stage") throw httpError(403, "Only the STAGE target is allowed.");
          if (activeBuild) throw httpError(409, "A STAGE deployment is already in progress.");
          const plan = plans.get(input.previewId);
          if (!plan || plan.expiresAt < Date.now()) throw httpError(409, "Preview expired or was already used. Review a new preview.");
          const store = current();
          if (plan.revision !== store.revision) throw httpError(409, "Data changed since this preview. Refresh and review again.");
          const references = await repository.getReferences();
          const validation = plan.deletion ? buildDeletionPlan(store, plan.deletion).validation : plan.pack ? evaluatePack(store, plan.pack, { references }).validation
            : validateChallenge(plan.challenge, plan.schedule, { ...store, originalId: plan.originalId, references });
          if (validation.some((item) => item.severity === "error")) return json(res, 422, { error: "Validation failed.", validation });
          const buildNumber = store.nextBuildNumber || 1200;
          const id = `STAGE-${buildNumber}`;
          activeBuild = id;
          const job = {
            id, previewId: plan.id, challengeId: plan.deletion ? plan.deletion.id : plan.pack ? plan.challenges[0].id : plan.challenge.id, status: "Queued", phase: "queued", initiator: "Local user",
            ...(plan.deletion ? { deletion: structuredClone(plan.deletion), challengeIds: [...plan.deletion.challengeIds],
              ...(plan.deletion.kind === "pack" ? { packId: plan.deletion.id, packName: plan.deletion.label } : {}) } : {}),
            ...(plan.pack ? { packId: plan.pack.id, packName: plan.pack.name, challengeIds: plan.challenges.map((item) => item.id) } : {}),
            time: new Date().toISOString(), log: "Deployment queued. The spreadsheet is unchanged until the write starts.",
            diff: structuredClone(plan.diff), ...(plan.deletion ? {} : plan.pack ? { schedules: structuredClone(plan.schedules) } : { schedule: structuredClone(plan.schedule) }),
          };
          try {
            await repository.saveJob(job, { nextBuildNumber: buildNumber + 1 });
          } catch (error) {
            activeBuild = null;
            throw error;
          }
          plans.delete(plan.id);
          task = execute(id, plan);
          return json(res, 202, job);
        }
        throw httpError(404, "API route not found.");
      }
      if (!["GET", "HEAD"].includes(req.method)) throw httpError(405, "Method not allowed.");
      const pathname = decodeURIComponent(url.pathname);
      const requested = pathname === "/" ? "index.html" : pathname.slice(1);
      const path = resolve(root, requested);
      const relativePath = relative(root, path);
      if (isAbsolute(relativePath) || relativePath.startsWith("..") ||
        !(requested === "index.html" || (relativePath.replaceAll("\\", "/").startsWith("src/") && [".js", ".css", ".svg"].includes(extname(path))))) {
        throw httpError(404, "Not found.");
      }
      const content = await readFile(path);
      res.writeHead(200, {
        "Content-Type": { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" }[extname(path)],
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      const status = error.status || (error.code === "ENOENT" || error.code === "EISDIR" ? 404 : error instanceof URIError ? 400 : 500);
      if (status === 500) console.error(error);
      json(res, status, { error: status === 500 ? "Local storage operation failed. Check the server output." : error.message });
    }
  });
  return { server, waitForIdle: () => task };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5173);
  const { server } = await createApp();
  server.on("error", (error) => {
    console.error(error.code === "EADDRINUSE" ? `Port ${port} is in use. Set PORT to another port.` : error);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => console.log(`Challenge Manager running at http://localhost:${port}`));
}
