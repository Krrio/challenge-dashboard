import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, extname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "./src/fixtures.js";
import { validateChallenge, buildDiff, applyPlan } from "./src/domain.js";
import { evaluatePack } from "./src/packs.js";
import { buildDeletionPlan } from "./src/deletion.js";

const root = dirname(fileURLToPath(import.meta.url));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const httpError = (status, message) => Object.assign(new Error(message), { status });

export async function createApp({ storePath = resolve(root, ".data/store.json"), runBuild = () => delay(1200), queueDelay = 450 } = {}) {
  let store;
  const persist = async (next) => {
    await mkdir(dirname(storePath), { recursive: true });
    const temporary = `${storePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(next, null, 2), "utf8");
    await rename(temporary, storePath);
    store = next;
  };
  try {
    store = JSON.parse(await readFile(storePath, "utf8"));
    if (!Number.isInteger(store.revision) || !Array.isArray(store.challenges) || !store.calendar || !Array.isArray(store.history) ||
      (store.packs != null && !Array.isArray(store.packs))) {
      throw new Error("Invalid local data store. Restore .data/store.json from a backup.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await persist(createStore());
  }
  store.packs ||= [];
  const interrupted = store.history.filter((job) => ["Queued", "Running"].includes(job.status));
  if (interrupted.length) {
    interrupted.forEach((job) => {
      job.status = "Failure";
      job.log = "Server stopped before completion. No setup or calendar changes were committed.";
    });
    await persist(store);
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
  const updateJob = async (id, status, log, next = structuredClone(store)) => {
    Object.assign(next.history.find((job) => job.id === id), { status, log });
    await persist(next);
  };
  const execute = async (id, plan) => {
    try {
      await delay(queueDelay);
      await updateJob(id, "Running", "Mock STAGE build running. Changes are pending.");
      await runBuild(structuredClone(plan));
      await updateJob(id, "Success", plan.deletion ? "Mock STAGE deletion succeeded. Selected data was removed; previous audit records were preserved." : "Mock STAGE build succeeded. Setup and calendar changes were committed together.", applyPlan(store, plan));
    } catch (error) {
      const log = `Deployment failed: ${error.message}. Setup and calendar changes were not committed.`;
      try {
        await updateJob(id, "Failure", log);
      } catch (storageError) {
        Object.assign(store.history.find((job) => job.id === id), { status: "Failure", log: `${log} Audit persistence also failed: ${storageError.message}` });
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
        if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, store);
        if (req.method !== "POST") throw httpError(405, "Method not allowed.");
        const input = await body(req);
        if (url.pathname === "/api/preview") {
          if ([input.pack, input.deletion, input.challenge].filter(Boolean).length > 1) throw httpError(400, "Choose one operation per preview.");
          if (!input.deletion && !input.pack && (!input.challenge || !input.schedule || typeof input.challenge !== "object" || typeof input.schedule !== "object")) {
            throw httpError(400, "A challenge and schedule are required.");
          }
          const batch = input.deletion ? buildDeletionPlan(store, input.deletion) : input.pack ? evaluatePack(store, input.pack) : null;
          const validation = batch ? batch.validation : validateChallenge(input.challenge, input.schedule, { ...store, originalId: input.originalId || "" });
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
          if (plan.revision !== store.revision) throw httpError(409, "Data changed since this preview. Refresh and review again.");
          const validation = plan.deletion ? buildDeletionPlan(store, plan.deletion).validation : plan.pack ? evaluatePack(store, plan.pack).validation : validateChallenge(plan.challenge, plan.schedule, { ...store, originalId: plan.originalId });
          if (validation.some((item) => item.severity === "error")) return json(res, 422, { error: "Validation failed.", validation });
          const buildNumber = store.nextBuildNumber || 1200;
          const id = `STAGE-${buildNumber}`;
          activeBuild = id;
          const next = structuredClone(store);
          next.nextBuildNumber = buildNumber + 1;
          const job = {
            id, previewId: plan.id, challengeId: plan.deletion ? plan.deletion.id : plan.pack ? plan.challenges[0].id : plan.challenge.id, status: "Queued", initiator: "Local user",
            ...(plan.deletion ? { deletion: structuredClone(plan.deletion), challengeIds: [...plan.deletion.challengeIds],
              ...(plan.deletion.kind === "pack" ? { packId: plan.deletion.id, packName: plan.deletion.label } : {}) } : {}),
            ...(plan.pack ? { packId: plan.pack.id, packName: plan.pack.name, challengeIds: plan.challenges.map((item) => item.id) } : {}),
            time: new Date().toISOString(), log: plan.deletion ? "Mock STAGE deletion queued. Data remains unchanged until success." : "Mock STAGE build queued. Changes are pending.",
            diff: structuredClone(plan.diff), ...(plan.deletion ? {} : plan.pack ? { schedules: structuredClone(plan.schedules) } : { schedule: structuredClone(plan.schedule) }),
          };
          next.history.unshift(job);
          try {
            await persist(next);
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
