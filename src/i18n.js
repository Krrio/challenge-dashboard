import { pl } from "./locales/pl.js";

export function locale() {
  return typeof document !== "undefined" && document.documentElement.lang === "pl" ? "pl-PL" : "en-US";
}

export function t(key, values = {}, language = locale()) {
  const template = language.startsWith("pl") ? pl[key] ?? key : key;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
}

// Translate known application messages without interpreting user-authored content.
export function message(text, language = locale()) {
  if (!text || !language.startsWith("pl")) return text || "";
  if (Object.hasOwn(pl, text)) return t(text, {}, language);
  const patterns = [
    [/^(.+) is required\.$/, (label) => t("{field} is required.", { field: t(label, {}, language) }, language)],
    [/^(.+) must be (a whole number|a finite number) of at least (.+)\.$/, (label, kind, min) => t("{field} must be {kind} of at least {min}.", { field: t(label, {}, language), kind: t(kind, {}, language), min }, language)],
    [/^(.+) must use a known preset\.$/, (field) => t("{field} must use a known preset.", { field }, language)],
    [/^Calendar bracket must match the setup range(.*)\.$/, (range) => t("Calendar bracket must match the setup range{range}.", { range }, language)],
    [/^(\d+) challenges validated for one STAGE transaction\.$/, (count) => t("{count} challenges validated for one STAGE transaction.", { count }, language)],
    [/^(.*) Reconnecting to check deployment status\.$/, (error) => t("{error} Reconnecting to check deployment status.", { error: message(error, language) }, language)],
    [/^(.+) has no setup configuration\. Its calendar entry will be preserved\.$/, (id) => t("{id} has no setup configuration. Its calendar entry will be preserved.", { id }, language)],
    [/^Deployment failed: (.*)\. Setup and calendar changes were not committed\.$/, (error) => t("Deployment failed: {error}. Setup and calendar changes were not committed.", { error }, language)],
    [/^Spreadsheet updated\. Running the STAGE import for (.+)\.$/, (months) => t("Spreadsheet updated. Running the STAGE import for {months}.", { months }, language)],
    [/^Deployment failed: (.*)\. The spreadsheet was not changed\.$/, (error) => t("Deployment failed: {error}. The spreadsheet was not changed.", { error }, language)],
    [/^Deployment failed: (.*)\. The approved rows and cells were rolled back and (.+) imported again\.$/, (error, months) => t("Deployment failed: {error}. The approved rows and cells were rolled back and {months} imported again.", { error, months }, language)],
    [/^Deployment failed: (.*)\. The approved rows and cells were rolled back\.$/, (error) => t("Deployment failed: {error}. The approved rows and cells were rolled back.", { error }, language)],
    [/^Server stopped during the deployment\. The approved rows and cells were rolled back\. Run the STAGE import again for (.+)\.$/, (months) => t("Server stopped during the deployment. The approved rows and cells were rolled back. Run the STAGE import again for {months}.", { months }, language)],
  ];
  for (const [pattern, translate] of patterns) {
    const match = text.match(pattern);
    if (match) return translate(...match.slice(1));
  }
  return text;
}
