export const preferencesKey = "challenge-manager.preferences.v1";
export const preferencesEvent = "app-preferences-change";

export function getPreferences() {
  return { language: document.documentElement.lang === "pl" ? "pl" : "en",
    theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light" };
}

export function setPreferences(changes, persist = true) {
  const previous = getPreferences();
  const next = { ...previous, ...changes };
  if (!["en", "pl"].includes(next.language) || !["light", "dark"].includes(next.theme)) return false;
  document.documentElement.lang = next.language;
  document.documentElement.dataset.theme = next.theme;
  let saved = true;
  if (persist) {
    try { localStorage.setItem(preferencesKey, JSON.stringify(next)); }
    catch { saved = false; }
  }
  window.dispatchEvent(new Event(preferencesEvent));
  return saved;
}
