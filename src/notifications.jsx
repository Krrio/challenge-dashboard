import { createRoot } from "react-dom/client";
import { Toaster, usePreferences } from "./components/sonner.jsx";
import { toast as sonner } from "sonner";
import { t, message } from "./i18n.js";

// Keep the React notification root outside the vanilla app's replaceable views.
createRoot(document.getElementById("toaster-root")).render(<Toaster />);

const deploymentStates = new Map();
const notificationIds = new Map();

function LocalizedMessage({ value }) {
  usePreferences();
  return value && typeof value === "object" ? t(value.key, value.values) : message(value);
}

const localized = (value) => value == null ? undefined : <LocalizedMessage value={value} />;

// Reuse active notices, but give a fresh ID to a notice whose exit animation has started.
export const toast = Object.fromEntries(["success", "warning", "error"].map((type) => [type, (title, { id: key, ...options } = {}) => {
  options.description = options.rawDescription ? options.description : localized(options.description);
  delete options.rawDescription;
  if (!key) return sonner[type](localized(title), options);
  const id = notificationIds.get(key) || crypto.randomUUID();
  notificationIds.set(key, id);
  const forget = () => { if (notificationIds.get(key) === id) notificationIds.delete(key); };
  return sonner[type](localized(title), { ...options, id, onDismiss: forget, onAutoClose: forget });
}]));

export function notifyDeployment(job, connectionError = "") {
  const signature = `${job.status}:${connectionError}`;
  if (deploymentStates.get(job.id) === signature) return;
  deploymentStates.set(job.id, signature);
  const id = `deploy-${job.id}`;
  const subject = job.packName || job.challengeId;
  const action = job.deletion ? "Deletion" : "STAGE push";
  if (connectionError) {
    sonner.loading(localized("Reconnecting to STAGE"), { id, description: localized({ key: "{build}: waiting for the build status.", values: { build: job.id } }), duration: Infinity });
  } else if (["Queued", "Running"].includes(job.status)) {
    sonner.loading(localized(`${action} ${job.status === "Queued" ? "queued" : "in progress"}`), {
      id, description: `${subject} (${job.id})`, duration: Infinity,
    });
  } else if (job.status === "Success") {
    const title = job.deletion ? (job.deletion.kind === "pack" ? "Challenge pack deleted" : "Challenge deleted")
      : job.packId ? "Challenge pack pushed to STAGE" : "Challenge pushed to STAGE";
    sonner.success(localized(title), { id, description: `${subject} (${job.id})`, duration: 6000 });
  } else if (job.status === "Failure") {
    sonner.error(localized(`${action} failed`), { id, description: localized({ key: "{subject} ({build}). No changes were committed.", values: { subject, build: job.id } }), duration: 8000 });
  }
}
