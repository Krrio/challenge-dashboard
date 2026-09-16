import test from "node:test";
import assert from "node:assert/strict";
import { t, message } from "../src/i18n.js";

test("translations preserve technical values, unknown text and user-authored interpolation", () => {
  assert.equal(t("Settings", {}, "pl-PL"), "Ustawienia");
  assert.equal(t("Settings", {}, "en-US"), "Settings");
  assert.equal(t("BossID", {}, "pl-PL"), "BossID");
  assert.equal(t("{name}. Pack saved locally.", { name: "Settings {boss}" }, "pl-PL"), "Settings {boss}. Paczkę zapisano lokalnie.");
  assert.equal(t("Name pattern must include {boss}; {index} is optional (maximum 160 characters).", {}, "pl-PL").includes("{boss}"), true);
});

test("Polish validation formats field names and numeric limits without changing the underlying messages", () => {
  assert.equal(message("Display name is required.", "pl-PL"), "Pole Nazwa wyświetlana jest wymagane.");
  assert.equal(message("Duration must be a finite number of at least 0.01.", "pl-PL"), "Pole Czas trwania musi być skończoną liczbą nie mniejszą niż 0.01.");
  assert.equal(message("Calendar bracket must match the setup range (40-49).", "pl-PL"), "Przedział kalendarza musi odpowiadać zakresowi konfiguracji (40-49).");
  assert.equal(message("Unrecognized server detail.", "pl-PL"), "Unrecognized server detail.");
});
