import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";
import { bossOptions } from "../src/fixtures.js";
import { calendarEntries, setupRow } from "../src/domain.js";
import { spreadsheetChallenge, spreadsheetRow } from "./fixtures/spreadsheet.mjs";

let browser;
before(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "chrome", headless: true, args: ["--disable-gpu"] });
});
after(async () => { await browser?.close(); });

async function session(t, viewport = { width: 1440, height: 1000 }, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "challenge-browser-"));
  const app = await createApp({ storePath: join(directory, "store.json"), queueDelay: 100, ...options });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.clock.setFixedTime(new Date("2026-09-14T10:00:00Z"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Keep these tests deterministic and independent of remote image/font servers.
  await page.route(/https:\/\/(images\.unsplash\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
  await page.goto(url);
  await page.waitForSelector(".workflow-controls");
  t.after(async () => {
    assert.deepEqual(errors, [], "No unhandled browser errors");
    await context.close();
    await app.waitForIdle();
    await new Promise((resolve) => app.server.close(resolve));
  });
  return { page, url };
}
const view = (page, name) => page.locator(`.nav [data-view="${name}"]`).click();
const field = (page, path) => page.locator(`[data-field="${path}"]`);
// Picks an option from a list-only combobox (ModeID, Arena, WavePreset, DropTier, ...).
const choose = async (page, path, label) => {
  await page.locator(`[data-combobox-input="${path}"]`).click();
  await page.locator(`#combobox-${path.replaceAll(".", "-")}-list`).getByRole("option", { name: label, exact: true }).click();
};
const number = (page, path) => page.locator(`[data-number-field="${path}"]`);
const notification = (page, title) => page.locator('[data-sonner-toast]:not([data-removed="true"])')
  .filter({ has: page.locator("[data-title]", { hasText: title }) });

test("spreadsheet sample works in the Polish dark form, reload, preview and STAGE flow", async (t) => {
  const { page, url } = await session(t);
  const assetRequests = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/challenge/")) assetRequests.push(request.url()); });
  await page.locator('[data-action="new-challenge"]').click();
  await field(page, "id").fill(spreadsheetChallenge.id);
  for (const [key, value] of Object.entries(spreadsheetChallenge.identity)) await field(page, `identity.${key}`).fill(value);
  for (const [key, value] of Object.entries(spreadsheetChallenge.eligibility)) await number(page, `eligibility.${key}`).fill(String(value));
  await choose(page, "content.modeId", "1 - Last Stand");
  await choose(page, "content.modeId", "0 - Regular challenge");
  await page.locator('[data-combobox-input="content.bossId"]').fill("Revenant");
  await page.getByRole("option", { name: "Revenant Assassin", exact: true }).click();
  await choose(page, "content.arena", "Dark Temple");
  await choose(page, "content.wavePreset", spreadsheetChallenge.content.wavePreset);
  for (const [key, value] of Object.entries(spreadsheetChallenge.timing)) await number(page, `timing.${key}`).fill(String(value));
  assert.equal(await field(page, "rewards.dropTier").inputValue(), "DC_Level50", "DropTier follows the 50-59 bracket");
  for (const [key, value] of Object.entries(spreadsheetChallenge.rewards)) {
    if (key === "dropTier") await choose(page, "rewards.dropTier", value);
    else await field(page, `rewards.${key}`).fill(value);
  }
  for (const [key, value] of Object.entries(spreadsheetChallenge.players)) {
    await (key === "groupPreset" ? field(page, `players.${key}`) : number(page, `players.${key}`)).fill(String(value));
  }
  for (const [key, value] of Object.entries(spreadsheetChallenge.visuals)) {
    if (key !== "immuneIcons") {
      await field(page, `visuals.${key}`).fill(value);
      continue;
    }
    const icons = page.locator('[data-combobox]:has([data-combobox-input="visuals.immuneIcons"])');
    while (await icons.locator("[data-combobox-remove]").count()) await icons.locator("[data-combobox-remove]").first().click();
    for (const icon of value) {
      await icons.locator("[data-combobox-input]").click();
      await icons.getByRole("option", { name: icon, exact: true }).click();
    }
  }
  await page.locator("[data-advanced] summary").click();
  for (const [key, value] of Object.entries(spreadsheetChallenge.advanced)) {
    if (key === "separateLevels") continue;
    if (key === "difficultyFactorPreset") {
      await page.locator('[data-combobox-input="advanced.difficultyFactorPreset"]').fill(value);
      await page.getByRole("option", { name: value, exact: true }).click();
      continue;
    }
    const input = typeof value === "number" ? number(page, `advanced.${key}`) : field(page, `advanced.${key}`);
    await input.fill(String(value).replace(".", ","));
  }
  await page.locator('[data-boolean-field="advanced.separateLevels"]').check();
  await page.locator('[data-boolean-field="advanced.separateLevels"]').uncheck();
  assert.equal(await page.locator('.checklist .dot.error').count(), 0);
  await page.locator(".asset-reference").nth(1).waitFor();
  assert.equal(await page.locator(".asset-reference").count(), 2);
  assert.deepEqual(assetRequests, [], "Game asset keys are not fetched from the dashboard server");
  await page.locator('[data-action="save-draft"]').click();
  await view(page, "settings");
  await page.locator("#settings-language").selectOption("pl");
  await page.locator("#settings-theme").click();
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "setup");
  await page.locator("[data-advanced] summary").click();
  assert.equal(await number(page, "advanced.minNpcLevelVariance").inputValue(), "0,9");
  assert.equal(await number(page, "advanced.rankingScoreMultiplier").inputValue(), "0,7831");
  assert.equal(await field(page, "players.groupPreset").inputValue(), "");
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem("challenge-manager.workspace.v1")).editor.draft);
  assert.deepEqual(setupRow(draft), spreadsheetRow);
  await mkdir(".tmp/screenshots", { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator("[data-advanced]").screenshot({ path: `.tmp/screenshots/sheet-advanced-${width}.png` });
    await page.locator(".image-row").screenshot({ path: `.tmp/screenshots/sheet-assets-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const response = page.waitForResponse((res) => res.url().endsWith("/api/preview") && res.request().method() === "POST");
  await page.locator('[data-action="preview"]').click();
  const preview = await (await response).json();
  assert.deepEqual(Object.fromEntries(preview.diff.setup.map(({ field, newValue }) => [field, newValue])), spreadsheetRow);
  await page.locator("[data-review]").check();
  await page.locator('[data-action="deploy"]').click();
  await page.waitForFunction(() => document.querySelector(".deploy-step.active")?.textContent === "Sukces");
  const deployed = await (await page.request.get(`${url}/api/state`)).json();
  assert.deepEqual(setupRow(deployed.challenges.find((item) => item.id === spreadsheetChallenge.id)), spreadsheetRow);
  await view(page, "calendar");
  assert.equal(await page.locator("[data-entry-day] .id").filter({ hasText: spreadsheetChallenge.identity.displayName }).count(), 1);
});

test("editable preset lists retain custom typing, keyboard choices and optional blanks", async (t) => {
  const { page } = await session(t);
  await view(page, "setup");
  const reward = field(page, "rewards.rewardPreset");
  await reward.fill("");
  await reward.pressSequentially("MyCustomReward_V2");
  assert.equal(await reward.inputValue(), "MyCustomReward_V2");
  assert.equal(await reward.evaluate((input) => input === document.activeElement), true);
  await reward.press("Enter");
  await reward.press("Tab");
  assert.equal(await reward.inputValue(), "MyCustomReward_V2");
  await reward.fill("ColdReward");
  await page.getByRole("option", { name: "ColdReward50_D3_V3", exact: true }).click();
  assert.equal(await reward.inputValue(), "ColdReward50_D3_V3");
  // List-only presets search instead of storing typed text; the keyboard picks the first match.
  const arena = page.locator('[data-combobox-input="content.arena"]');
  await arena.fill("grave");
  await arena.press("ArrowDown");
  await arena.press("Enter");
  assert.equal(await field(page, "content.arena").inputValue(), "Graveyard");
  assert.equal(await arena.getAttribute("aria-expanded"), "false");
  await arena.fill("NotAnArena");
  await arena.press("Escape");
  assert.equal(await field(page, "content.arena").inputValue(), "Graveyard");
  assert.equal(await arena.inputValue(), "Graveyard");
  await choose(page, "rewards.dropTier", "DC_Level69");
  await field(page, "players.groupPreset").fill("");
  await page.locator("[data-advanced] summary").click();
  const window = number(page, "advanced.minutesLeftToUseHardLimit");
  for (const value of ["5000", "0", ""]) {
    await window.fill(value);
    assert.equal(await window.getAttribute("aria-invalid"), "false");
  }
  const variance = number(page, "advanced.minNpcLevelVariance");
  await variance.fill("not-a-number");
  assert.equal(await variance.getAttribute("aria-invalid"), "true");
  await page.locator('[data-action="save-draft"]').click();
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "setup");
  await page.locator("[data-advanced] summary").click();
  assert.equal(await variance.inputValue(), "not-a-number");
  assert.equal(await field(page, "players.groupPreset").inputValue(), "");
  assert.equal(await field(page, "rewards.dropTier").inputValue(), "DC_Level69");
  assert.equal(await window.inputValue(), "");
});

test("legacy mock modes remain visible and require an explicit choice without losing drafts", async (t) => {
  const { page } = await session(t);
  await view(page, "setup");
  await field(page, "identity.displayName").fill("Retained old draft");
  await page.evaluate(() => {
    const key = "challenge-manager.workspace.v1";
    const saved = JSON.parse(localStorage.getItem(key));
    saved.editor.draft.content.modeId = "BossRush";
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "setup");
  const mode = page.locator('[data-combobox-input="content.modeId"]');
  assert.equal(await field(page, "content.modeId").inputValue(), "BossRush");
  assert.equal(await mode.inputValue(), "BossRush");
  assert.equal(await mode.getAttribute("aria-invalid"), "true");
  assert.match(await page.locator(".checklist").innerText(), /Legacy mock modes require an explicit selection/);
  await choose(page, "content.modeId", "1 - Last Stand");
  assert.equal(await mode.getAttribute("aria-invalid"), "false");
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem("challenge-manager.workspace.v1")).editor.draft);
  assert.equal(draft.content.modeId, 1);
  assert.equal(draft.identity.displayName, "Retained old draft");
});

test("language and theme persist independently without changing drafts or server data", async (t) => {
  const { page, url } = await session(t);
  const baseline = await (await page.request.get(`${url}/api/state`)).json();
  await view(page, "setup");
  await field(page, "identity.displayName").fill("Settings");
  const workspace = await page.evaluate(() => localStorage.getItem("challenge-manager.workspace.v1"));
  let writes = 0;
  page.on("request", (request) => { if (request.method() === "POST") writes += 1; });
  await view(page, "settings");
  await page.locator("#settings-language").selectOption("pl");
  await page.getByRole("switch", { name: "Ciemny motyw" }).click();
  assert.equal(await page.locator("html").getAttribute("lang"), "pl");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.equal(await page.locator("h1").innerText(), "Ustawienia");
  assert.equal(await page.locator("#settings-language").inputValue(), "pl");
  assert.equal(await page.evaluate(() => localStorage.getItem("challenge-manager.workspace.v1")), workspace);
  assert.equal(writes, 0);
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  assert.equal(await page.locator("h1").innerText(), "Przegląd wyzwań");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await view(page, "setup");
  assert.equal(await field(page, "identity.displayName").inputValue(), "Settings");
  assert.equal(await field(page, "id").inputValue(), "ScarredOrcTest");
  assert.equal(await field(page, "content.bossId").inputValue(), "ScarredOrc");
  await view(page, "settings");
  await page.locator("#settings-language").selectOption("en");
  await page.getByRole("switch", { name: "Dark theme" }).press("Space");
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  assert.deepEqual(await (await page.request.get(`${url}/api/state`)).json(), baseline);
});

test("Polish forms, calendar, validation and delete confirmation preserve config values", async (t) => {
  const { page } = await session(t);
  await view(page, "settings");
  await page.locator("#settings-language").selectOption("pl");
  await view(page, "challenges");
  assert.match(await page.locator("thead").innerText(), /ID wyzwania/);
  assert.equal(await page.locator('#overview-filter-status option[value="Draft"]').innerText(), "Szkic");
  await page.getByRole("button", { name: "Nowe wyzwanie", exact: true }).click();
  await field(page, "id").fill("PolskiDraft");
  assert.match(await page.locator(".checklist").innerText(), /Pole Nazwa wyświetlana jest wymagane/);
  await page.locator('[aria-describedby="field-id-help"]').hover();
  assert.match(await page.locator("#field-id-help").innerText(), /Unikalny identyfikator/);
  await page.getByRole("button", { name: "Zaplanuj wyzwanie", exact: true }).click();
  assert.equal(await page.locator(".calendar-weekdays span").first().innerText(), "Pn");
  assert.equal(await page.locator(".calendar-empty").count(), 1);
  assert.match(await page.locator(".calendar-title").innerText(), /wrzesień/);
  await view(page, "setup");
  await page.getByRole("button", { name: "Zapisz szkic", exact: true }).click();
  await notification(page, "Zapisano wyzwanie").waitFor();
  await view(page, "challenges");
  await page.getByRole("textbox", { name: "Szukaj wyzwań", exact: true }).pressSequentially("PolskiDraft");
  await page.locator('[data-overview-more="PolskiDraft"]').click();
  await page.getByRole("menuitem", { name: "Usuń wyzwanie", exact: true }).click();
  assert.match(await page.getByRole("dialog").innerText(), /Usunąć wyzwanie/);
  await page.getByRole("button", { name: "Usuń szkic", exact: true }).click();
  await notification(page, "Usunięto szkic wyzwania").waitFor();
  await view(page, "packs");
  await page.locator('[data-action="new-pack"]').click();
  await page.locator('[data-pack-field="name"]').fill("Settings");
  await page.getByRole("button", { name: "Zapisz paczkę", exact: true }).click();
  await notification(page, "Zapisano paczkę wyzwań").waitFor();
  assert.match(await notification(page, "Zapisano paczkę wyzwań").innerText(), /Settings/);
  await view(page, "packs");
  assert.match(await page.locator("tbody").innerText(), /Settings/);
});

test("existing Sonner notifications update language and theme live", async (t) => {
  const { page } = await session(t);
  await view(page, "setup");
  await page.locator('[data-action="save-draft"]').click();
  await notification(page, "Challenge saved").waitFor();
  await view(page, "settings");
  await page.locator("#settings-language").selectOption("pl");
  await page.locator("#settings-theme").click();
  const saved = notification(page, "Zapisano wyzwanie");
  await saved.waitFor();
  assert.match(await saved.innerText(), /Szkic zapisano lokalnie/);
  assert.equal(await page.locator("[data-sonner-toaster]").getAttribute("data-sonner-theme"), "dark");
  assert.equal(await page.locator('[data-sonner-toast]:not([data-removed="true"])').count(), 1);
  await saved.getByRole("button", { name: "Zamknij powiadomienie" }).click();
  await saved.waitFor({ state: "hidden" });
});

test("preference recovery, cross-tab updates and first-paint theme do not depend on workspace data", async (t) => {
  const { page, url } = await session(t);
  await page.evaluate(() => localStorage.setItem("challenge-manager.preferences.v1", "{invalid"));
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await view(page, "settings");
  await page.locator("#settings-language").focus();
  const other = await page.context().newPage();
  try {
    await other.goto(url);
    await other.evaluate(() => localStorage.setItem("challenge-manager.preferences.v1", JSON.stringify({ language: "pl", theme: "dark" })));
    await page.waitForFunction(() => document.documentElement.lang === "pl");
    assert.equal(await page.locator("#settings-language").inputValue(), "pl");
    assert.equal(await page.locator("#settings-theme").getAttribute("aria-checked"), "true");
    await other.route("**/src/app.js", (route) => route.abort());
    await other.reload();
    assert.equal(await other.locator("html").getAttribute("data-theme"), "dark");
    assert.equal(await other.locator("html").getAttribute("lang"), "pl");
  } finally { await other.close(); }
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); }; });
  await page.locator("#settings-theme").click();
  await notification(page, "Nie udało się zapisać preferencji").waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  assert.match(await page.locator('.content > [role="status"]').innerText(), /tylko w tej karcie/);
});

test("Polish dark views fit desktop and mobile with dark inputs, tables, menus and calendar", async (t) => {
  const { page } = await session(t);
  await view(page, "settings");
  await page.locator("#settings-language").selectOption("pl");
  await page.locator("#settings-theme").click();
  await mkdir(".tmp/screenshots", { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ["overview", "challenges", "packs", "setup", "calendar", "preview", "history", "settings"]) {
      await view(page, name);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} at ${width}px`);
      const bright = await page.locator('body, .card, .input, .select, .overview-challenges, .calendar-picker, .cal-cell, .overview-table th').evaluateAll((elements) => elements.filter((element) => {
        if (!element.getClientRects().length) return false;
        const color = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.map(Number);
        return color && color.length >= 3 && color.slice(0, 3).every((value) => value > 120) && (color.length < 4 || color[3] > 0);
      }).map((element) => element.className));
      assert.deepEqual(bright, [], `No light surfaces: ${name}`);
      if (width !== 320) await page.screenshot({ path: `.tmp/screenshots/pl-dark-${name}-${width}.png`, fullPage: true });
    }
  }
});

test("Sonner saves stay outside view renders, do not steal focus and support dismissal", async (t) => {
  const { page } = await session(t);
  await view(page, "setup");
  const save = page.locator('[data-action="save-draft"]');
  const before = await save.boundingBox();
  await save.click();
  const saved = notification(page, "Challenge saved");
  await saved.waitFor();
  await save.click();
  assert.equal(await saved.count(), 1);
  assert.equal((await save.boundingBox()).y, before.y);
  await field(page, "identity.displayName").fill("Continue editing after saving");
  assert.equal(await field(page, "identity.displayName").evaluate((input) => input === document.activeElement), true);
  assert.equal(await saved.count(), 1);
  await view(page, "challenges");
  await saved.getByRole("button", { name: "Dismiss notification" }).focus();
  await page.keyboard.press("Enter");
  await saved.waitFor({ state: "hidden" });
  await view(page, "packs");
  await page.locator('[data-action="new-pack"]').click();
  await page.locator('[data-action="save-draft"]').click();
  await notification(page, "Challenge pack saved").waitFor();
  assert.equal(await page.locator('[data-sonner-toaster]').count(), 1);
});

test("Sonner auto-dismiss pauses on hover and resumes afterward", async (t) => {
  const { page } = await session(t);
  await page.clock.install();
  await view(page, "setup");
  await page.locator('[data-action="save-draft"]').click();
  const saved = notification(page, "Challenge saved");
  await saved.waitFor();
  await saved.hover();
  await page.clock.fastForward(7000);
  assert.equal(await saved.count(), 1);
  await page.mouse.move(0, 0);
  await page.clock.fastForward(7000);
  await saved.waitFor({ state: "hidden" });
});

for (const failed of [false, true]) {
  test(`Sonner tracks one push through ${failed ? "failure" : "success"} across navigation`, async (t) => {
    const { page, url } = await session(t, undefined, { runBuild: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      if (failed) throw new Error("Test build failed");
    } });
    const before = await (await page.request.get(`${url}/api/state`)).json();
    await view(page, "setup");
    await field(page, "identity.displayName").fill("Toast deployment test");
    await page.locator('[data-action="preview"]').click();
    await page.waitForSelector("[data-review]");
    await page.locator("[data-review]").check();
    await page.locator('[data-action="deploy"]').click();
    await page.locator('[data-sonner-toast][data-type="loading"]').waitFor();
    assert.equal(await page.locator('[data-sonner-toast][data-type="success"]').count(), 0);
    await view(page, "history");
    await notification(page, failed ? "STAGE push failed" : "Challenge pushed to STAGE").waitFor();
    assert.equal(await page.locator('[data-sonner-toast]:not([data-removed="true"])').count(), 1);
    assert.equal(await page.locator('[data-sonner-toast][data-type="loading"]').count(), 0);
    const after = await (await page.request.get(`${url}/api/state`)).json();
    assert.equal(after.history[0].status, failed ? "Failure" : "Success");
    if (failed) assert.deepEqual(after.challenges, before.challenges);
    else assert.equal(after.challenges[0].identity.displayName, "Toast deployment test");
  });
}

test("Sonner reports storage and preview failures without a false success", async (t) => {
  const { page } = await session(t);
  await view(page, "setup");
  await field(page, "identity.displayName").fill("Unsaved change");
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Storage full", "QuotaExceededError"); }; });
  await page.locator('[data-action="save-draft"]').click();
  await notification(page, "Challenge could not be saved").waitFor();
  assert.equal(await page.locator('[data-sonner-toast][data-type="success"]').count(), 0);
  assert.match(await page.locator('.content > [role="status"]').innerText(), /could not be saved/);
  await page.route("**/api/preview", (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "The server data changed." }) }));
  await page.locator('[data-action="preview"]').click();
  await notification(page, "Preview could not be prepared").waitFor();
  assert.equal(await page.locator('[data-action="deploy"]').isDisabled(), true);
});

test("Sonner fits long IDs at desktop and mobile sizes with Poppins and reduced motion", async (t) => {
  const { page } = await session(t);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator('[data-action="new-challenge"]').click();
  await field(page, "id").fill(`LongChallenge${"A".repeat(100)}`);
  await mkdir(".tmp/screenshots", { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('[data-action="save-draft"]').click();
    const saved = notification(page, "Challenge saved");
    await saved.waitFor();
    const box = await saved.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 844);
    assert.equal(await saved.evaluate((element) => element.scrollWidth <= element.clientWidth), true);
    assert.match(await saved.evaluate((element) => getComputedStyle(element).fontFamily), /Poppins/);
    await page.screenshot({ path: `.tmp/screenshots/toast-${width}.png` });
    await saved.getByRole("button", { name: "Dismiss notification" }).click();
    await saved.waitFor({ state: "hidden" });
  }
});

async function choosePackBosses(page, count) {
  await page.locator('[data-action="pack-clear-bosses"]').click();
  for (const boss of bossOptions.slice(0, count)) await page.locator(`[data-pack-boss="${boss.value}"]`).check();
}

async function openChallengeDeletion(page, id) {
  await page.locator(`[data-overview-more="${id}"]`).click();
  await page.getByRole("menuitem", { name: "Delete challenge", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#delete-confirm") && !document.querySelector("#delete-confirm").disabled);
}

async function waitForDeletion(page) {
  await page.waitForFunction(() => {
    const row = document.querySelector(".deploy-history tbody tr");
    return row?.textContent.includes("Deletion:") && row.querySelector(".overview-status")?.textContent === "Success";
  });
  const build = await page.locator(".deploy-history tbody tr").first().locator("td").first().innerText();
  await page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: /deleted/ }).filter({ hasText: build }).waitFor();
}

test("delete confirmation supports cancel, keyboard focus and desktop/mobile layouts without writes", async (t) => {
  const { page, url } = await session(t);
  const before = await (await page.request.get(`${url}/api/state`)).json();
  await mkdir(".tmp/screenshots", { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await openChallengeDeletion(page, "ScarredOrcTest");
    assert.equal(await page.locator("#delete-cancel").evaluate((element) => element === document.activeElement), true);
    const dialog = page.getByRole("dialog");
    assert.match(await dialog.innerText(), /1 challenge and 2 calendar entries/);
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width);
    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => !!document.activeElement.closest("#delete-dialog")), true);
    }
    await page.screenshot({ path: `.tmp/screenshots/delete-confirmation-${width}.png`, fullPage: true });
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.locator('[data-overview-more="ScarredOrcTest"]').evaluate((element) => element === document.activeElement), true);
  }
  assert.deepEqual(await (await page.request.get(`${url}/api/state`)).json(), before);
});

test("deleting the final challenge survives reload and does not resurrect saved drafts", async (t) => {
  const { page, url } = await session(t);
  await view(page, "setup");
  await field(page, "identity.displayName").fill("Draft that must also be removed");
  await page.locator('[data-action="save-draft"]').click();
  for (const id of ["ScarredOrcTest", "FrostWarden70", "EmberQueenDraft"]) {
    await view(page, "challenges");
    await openChallengeDeletion(page, id);
    await page.locator("#delete-confirm").click();
    await page.locator(".deploy-history").waitFor();
    if (id === "ScarredOrcTest") {
      await page.reload();
      await page.waitForSelector(".workflow-controls");
      await view(page, "history");
    }
    await waitForDeletion(page);
  }
  const store = await (await page.request.get(`${url}/api/state`)).json();
  assert.equal(store.challenges.length, 0);
  assert.equal(store.history.length, 5);
  assert.deepEqual(calendarEntries(store.calendar).map((entry) => entry.challengeId), ["LegacySpider"]);
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  assert.equal(await page.locator("[data-overview-row]").count(), 0);
  assert.match(await page.locator(".overview-empty").innerText(), /No challenges found/);
  await view(page, "setup");
  assert.equal(await field(page, "identity.displayName").inputValue(), "");
  await view(page, "challenges");
  await page.locator('[data-action="new-challenge"]').click();
  await field(page, "identity.displayName").fill("First replacement draft");
  await page.locator('[data-action="save-draft"]').click();
  await view(page, "challenges");
  assert.equal(await page.locator("[data-overview-row]").count(), 1);
});

test("local challenge and pack drafts are deleted without STAGE writes and leave the single editor intact", async (t) => {
  const { page, url } = await session(t);
  const before = await (await page.request.get(`${url}/api/state`)).json();
  await page.locator('[data-action="new-challenge"]').click();
  await field(page, "id").fill("LocalOnly");
  await page.locator('[data-action="save-draft"]').click();
  await view(page, "challenges");
  await openChallengeDeletion(page, "LocalOnly");
  assert.equal(await page.locator("#delete-confirm").innerText(), "Delete draft");
  await page.locator("#delete-confirm").click();
  assert.equal(await page.locator('[data-overview-row="LocalOnly"]').count(), 0);
  await view(page, "setup");
  await field(page, "identity.displayName").fill("Keep my single edit");
  await page.locator('[data-action="new-pack"]').click();
  await page.locator('[data-action="save-draft"]').click();
  await view(page, "packs");
  await page.locator("[data-pack-delete]").click();
  assert.equal(await page.locator("#delete-pack-members").count(), 0);
  await page.locator("#delete-confirm").click();
  assert.equal(await page.locator("[data-pack-row]").count(), 0);
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "setup");
  assert.equal(await field(page, "identity.displayName").inputValue(), "Keep my single edit");
  await view(page, "packs");
  assert.equal(await page.locator("[data-pack-row]").count(), 0);
  assert.deepEqual(await (await page.request.get(`${url}/api/state`)).json(), before);
});

for (const includeChallenges of [false, true]) {
  test(`published pack deletion ${includeChallenges ? "removes" : "keeps"} generated challenges`, async (t) => {
    const { page, url } = await session(t);
    await view(page, "packs");
    await page.locator('[data-action="new-pack"]').click();
    await choosePackBosses(page, 3);
    await page.locator('[data-action="preview"]').click();
    await page.waitForSelector("[data-review]");
    await page.locator("[data-review]").check();
    await page.locator('[data-action="deploy"]').click();
    await page.waitForFunction(() => document.querySelector(".deploy-step.active")?.textContent === "Success");
    const before = await (await page.request.get(`${url}/api/state`)).json();
    await view(page, "packs");
    await page.locator("[data-pack-delete]").click();
    assert.equal(await page.locator("#delete-pack-members").isChecked(), false);
    if (includeChallenges) await page.locator("#delete-pack-members").check();
    await page.waitForFunction(() => document.querySelector("#delete-confirm") && !document.querySelector("#delete-confirm").disabled);
    await page.screenshot({ path: `.tmp/screenshots/delete-pack-${includeChallenges}.png`, fullPage: true });
    await page.locator("#delete-confirm").click();
    await waitForDeletion(page);
    const after = await (await page.request.get(`${url}/api/state`)).json();
    assert.equal(after.packs.length, 0);
    assert.equal(after.challenges.length, includeChallenges ? 3 : 6);
    assert.equal(calendarEntries(after.calendar).length, calendarEntries(before.calendar).length - (includeChallenges ? 3 : 0));
    assert.deepEqual(after.history.slice(1), before.history);
    await page.reload();
    await page.waitForSelector(".workflow-controls");
    await view(page, "packs");
    assert.equal(await page.locator("[data-pack-row]").count(), 0);
    await view(page, "setup");
    assert.equal(await page.locator('[data-pack-field="name"]').count(), 0);
    assert.equal(await field(page, "id").inputValue(), "ScarredOrcTest");
  });
}

test("deleting a pack member updates the active editor and saved pack without resurrecting that member", async (t) => {
  const { page, url } = await session(t);
  await view(page, "packs");
  await page.locator('[data-action="new-pack"]').click();
  await choosePackBosses(page, 3);
  await page.locator('[data-action="preview"]').click();
  await page.waitForSelector("[data-review]");
  await page.locator("[data-review]").check();
  await page.locator('[data-action="deploy"]').click();
  await page.waitForFunction(() => document.querySelector(".deploy-step.active")?.textContent === "Success");
  const before = await (await page.request.get(`${url}/api/state`)).json();
  const id = before.packs[0].challengeIds[0];
  await view(page, "setup");
  await page.locator('[data-pack-field="name"]').fill("Keep this pack edit");
  await page.locator('[data-action="save-draft"]').click();
  await view(page, "challenges");
  await page.locator("[data-overview-query]").fill(id);
  await openChallengeDeletion(page, id);
  assert.match(await page.getByRole("dialog").innerText(), /Membership will be removed from 1 pack/);
  await page.locator("#delete-confirm").click();
  await waitForDeletion(page);
  const after = await (await page.request.get(`${url}/api/state`)).json();
  assert.equal(after.challenges.length, before.challenges.length - 1);
  assert.deepEqual(after.packs[0].bossIds, before.packs[0].bossIds.slice(1));
  assert.deepEqual(after.packs[0].challengeIds, before.packs[0].challengeIds.slice(1));
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "setup");
  assert.equal(await page.locator('[data-pack-field="name"]').inputValue(), "Keep this pack edit");
  assert.equal(await page.locator("[data-pack-boss]:checked").count(), 2);
  assert.equal(await page.locator(`[data-pack-boss="${before.packs[0].bossIds[0]}"]`).isChecked(), false);
  await page.locator('[data-action="preview"]').click();
  await page.waitForSelector("[data-review]");
  assert.equal(await page.locator(".pack-member-table tbody tr").count(), 2);
  assert.equal(await page.locator(".pack-member-table").getByText(id, { exact: true }).count(), 0);
});

test("30-boss pack survives reload, schedules across months and deploys once without replacing a single draft", async (t) => {
  const { page, url } = await session(t);
  const before = await (await page.request.get(`${url}/api/state`)).json();
  await view(page, "setup");
  await field(page, "identity.displayName").fill("Unfinished single challenge");
  await page.locator('[data-action="new-pack"]').click();
  await page.locator('[data-pack-field="name"]').fill("September boss pack");
  await page.locator('[data-pack-field="idPrefix"]').fill("September");
  await page.locator('[data-pack-field="namePattern"]').fill("{boss} - September");
  await choosePackBosses(page, 30);
  await number(page, "timing.attemptDurationSeconds").fill("240");
  await page.locator('[data-action="save-draft"]').click();
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "setup");
  assert.equal(await page.locator('[data-pack-boss]:checked').count(), 30);
  assert.equal(await number(page, "timing.attemptDurationSeconds").inputValue(), "240");
  await page.locator('[data-action="open-calendar"]').click();
  await page.locator('[data-calendar-day="28"]').click();
  assert.equal(await page.locator(".pack-pending-entry").count(), 3);
  await page.locator('[data-pack-calendar-month="1"]').click();
  assert.equal(await page.locator(".pack-pending-entry").count(), 27);
  assert.match(await page.locator(".selected-date").innerText(), /October 2026/);
  await page.locator('[data-action="preview"]').click();
  await page.waitForSelector("[data-review]");
  assert.equal(await page.locator(".pack-member-table tbody tr").count(), 30);
  assert.match(await page.locator(".pack-member-table tbody tr").first().innerText(), /2026-09-28/);
  assert.match(await page.locator(".pack-member-table tbody tr").last().innerText(), /2026-10-27/);
  await page.locator("[data-review]").check();
  await view(page, "calendar");
  await page.locator('[data-schedule="startUtc"]').fill("20:00");
  await page.locator('[data-action="preview"]').click();
  await page.waitForSelector("[data-review]");
  assert.equal(await page.locator("[data-review]").isChecked(), false);
  assert.equal(await page.locator('[data-action="deploy"]').isDisabled(), true);
  await page.locator("[data-review]").check();
  await page.locator('[data-action="deploy"]').click();
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "preview");
  await page.waitForFunction(() => document.querySelector(".deploy-step.active")?.textContent === "Success");
  const after = await (await page.request.get(`${url}/api/state`)).json();
  assert.equal(after.challenges.length, before.challenges.length + 30);
  assert.equal(after.history.length, before.history.length + 1);
  assert.equal(after.history[0].challengeIds.length, 30);
  assert.equal(after.history[0].packName, "September boss pack");
  assert.equal(after.packs.length, 1);
  assert.equal(calendarEntries(after.calendar).length, calendarEntries(before.calendar).length + 30);
  assert.ok(after.challenges.slice(3).every((challenge) => challenge.timing.attemptDurationSeconds === 240));
  assert.equal(after.challenges[0].identity.displayName, before.challenges[0].identity.displayName);
  await view(page, "packs");
  assert.match(await page.locator('[data-pack-row]').innerText(), /Deployed/);
  await page.locator('[data-pack-schedule]').click();
  await page.locator('.calendar-picker [data-month="1"]').click();
  await page.locator('[data-action="preview"]').click();
  await page.waitForSelector("[data-review]");
  assert.equal(await page.locator('[data-pack-diff] .old-value').count(), 0);
  await page.locator('[data-action="leave-pack"]').click();
  assert.equal(await field(page, "identity.displayName").inputValue(), "Unfinished single challenge");
  assert.equal(await number(page, "timing.attemptDurationSeconds").inputValue(), "180");
  await view(page, "history");
  assert.match(await page.locator('.deploy-history tbody tr').first().innerText(), /September boss pack/);
});

test("pack picker, reordering, same-time scheduling and previews fit desktop and mobile", async (t) => {
  const { page } = await session(t);
  await view(page, "packs");
  await page.locator('[data-action="new-pack"]').click();
  await choosePackBosses(page, 3);
  const search = page.locator('[data-pack-search]');
  await search.pressSequentially("Behemoth");
  assert.equal(await page.locator('.pack-boss-option:not([hidden])').count(), 3);
  assert.equal(await search.evaluate((element) => element === document.activeElement), true);
  await search.fill("");
  await page.locator('[data-pack-members] > summary').click();
  await page.locator('[data-pack-order="0"][data-direction="1"]').click();
  assert.match(await page.locator('.pack-member-table tbody tr').first().innerText(), /Poisonous Orc/);
  assert.equal(await page.locator('[data-pack-members]').evaluate((element) => element.open), true);
  await page.locator('[data-action="save-draft"]').click();
  await page.locator('[data-action="open-calendar"]').click();
  await page.locator('[data-pack-mode][value="simultaneous"]').check();
  assert.equal(await page.locator('.cal-cell:has(.pack-pending-entry)').count(), 1);
  await mkdir(".tmp/screenshots", { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ["setup", "calendar", "preview", "packs"]) {
      await view(page, name);
      if (name === "preview") await page.waitForSelector("[data-review]");
      await page.screenshot({ path: `.tmp/screenshots/pack-${name}-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} at ${width}`);
    }
  }
});

test("invalid packs can be saved as drafts but cannot be reviewed or deployed", async (t) => {
  const { page, url } = await session(t);
  await view(page, "packs");
  await page.locator('[data-action="new-pack"]').click();
  await page.locator('[data-action="pack-clear-bosses"]').click();
  await page.locator('[data-pack-field="idPrefix"]').fill("");
  await page.locator('[data-action="save-draft"]').click();
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "setup");
  assert.equal(await page.locator('[data-pack-field="idPrefix"]').inputValue(), "");
  assert.equal(await page.locator('[data-pack-boss]:checked').count(), 0);
  await page.locator('[data-action="preview"]').click();
  assert.equal(await page.locator('[data-action="deploy"]').isDisabled(), true);
  assert.equal(await page.locator('[data-review]').count(), 0);
  const store = await (await page.request.get(`${url}/api/state`)).json();
  assert.equal(store.challenges.length, 3);
  assert.equal(store.packs?.length || 0, 0);
});

async function populateOverview(page) {
  const response = await page.request.get(new URL("/api/state", page.url()).href);
  const store = await response.json();
  for (let index = 0; index < 21; index += 1) {
    const challenge = structuredClone(store.challenges[0]);
    challenge.id = `OverviewChallenge${String(index + 1).padStart(2, "0")}`;
    challenge.status = index % 3 === 0 ? "Disabled" : index % 3 === 1 ? "Draft" : "Ready";
    store.challenges.push(challenge);
  }
  store.calendar["2026-09"][14]["40-49"].push({ challengeId: "ScarredOrcTest", startUtc: "09:00" });
  await page.route("**/api/state", (route) => route.fulfill({ json: store }));
  await page.reload();
  await page.waitForSelector(".overview-table");
}

for (const listView of ["overview", "challenges"]) {
  test(`${listView} combines filters and search with five-row pagination`, async (t) => {
    const { page } = await session(t);
    await populateOverview(page);
    await view(page, listView);
    const rows = page.locator("[data-overview-row]");
    const count = page.locator(".overview-result-count");
    assert.equal(await rows.count(), 5);
    if (listView === "overview") assert.equal(await page.locator(".summary-value").first().innerText(), "1");
    assert.match(await count.innerText(), /of 24 challenges/);
    assert.equal(await page.getByRole("button", { name: "Previous page", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Page 5", exact: true }).click();
    assert.equal(await rows.count(), 4);
    assert.match(await count.innerText(), /21.*24 of 24/);
    assert.equal(await page.getByRole("button", { name: "Next page", exact: true }).isDisabled(), true);
    await page.locator('[data-overview-filter="status"]').selectOption("Draft");
    assert.equal(await page.locator('[data-overview-page="1"][aria-current="page"]').count(), 1);
    assert.match(await count.innerText(), /of 8 challenges/);
    await page.locator('[data-overview-filter="boss"]').selectOption("ScarredOrc");
    assert.match(await count.innerText(), /of 7 challenges/);
    const search = page.locator("[data-overview-query]");
    await search.pressSequentially("OverviewChallenge02");
    assert.equal(await rows.count(), 1);
    assert.equal(await search.evaluate((input) => document.activeElement === input), true);
    await search.fill("no results");
    assert.match(await count.innerText(), /0.*0 of 0/);
    await page.locator("[data-overview-reset]").click();
    assert.equal(await rows.count(), 5);
    assert.equal(await search.inputValue(), "");
    await page.locator('[data-overview-filter="status"]').selectOption("Active");
    assert.equal(await rows.count(), 1);
    assert.equal(await rows.first().getAttribute("data-overview-row"), "ScarredOrcTest");
    assert.equal(await page.locator(".overview-table .overview-status-active").innerText(), "Active");
  });

  test(`${listView} icon actions edit, schedule, copy and support keyboard dismissal`, async (t) => {
    const { page, url } = await session(t);
    await view(page, listView);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: url });
    const more = page.getByRole("button", { name: "More actions for FrostWarden70", exact: true });
    await more.click();
    assert.equal(await page.getByRole("menuitem", { name: "Schedule challenge" }).evaluate((item) => item === document.activeElement), true);
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.getByRole("menuitem", { name: "Copy ID" }).evaluate((item) => item === document.activeElement), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("menu").count(), 0);
    assert.equal(await more.evaluate((button) => button === document.activeElement), true);
    await more.click();
    await page.getByRole("menuitem", { name: "Copy ID" }).click();
    await notification(page, "Challenge ID copied").waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "FrostWarden70");
    await more.click();
    await page.getByRole("menuitem", { name: "Schedule challenge" }).click();
    assert.equal(await page.locator('[data-schedule="challengeId"]').inputValue(), "FrostWarden70");
    await view(page, listView);
    await page.getByRole("button", { name: "Edit EmberQueenDraft", exact: true }).click();
    assert.equal(await field(page, "id").inputValue(), "EmberQueenDraft");
  });

  test(`${listView} table and icons render at desktop and mobile widths`, async (t) => {
    const { page } = await session(t);
    await populateOverview(page);
    await view(page, listView);
    await mkdir(".tmp/screenshots", { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: `.tmp/screenshots/${listView}-table-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const icons = await page.locator(".overview-icon").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0));
      assert.equal(icons, true);
      const more = page.locator("[data-overview-more]").first();
      await more.scrollIntoViewIfNeeded();
      const scrollLeft = await page.locator(".overview-table-scroll").evaluate((table) => table.scrollLeft);
      await more.click();
      const box = await page.getByRole("menu").boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      assert.ok(box.y >= 0 && box.y + box.height <= 1000);
      assert.equal(await page.locator(".overview-table-scroll").evaluate((table) => table.scrollLeft), scrollLeft);
      await page.keyboard.press("Escape");
    }
  });
}

test("challenge lists share markup but keep independent filters and pages", async (t) => {
  const { page } = await session(t);
  await populateOverview(page);
  const list = page.locator(".overview-challenges");
  const overviewMarkup = await list.innerHTML();
  await page.getByRole("button", { name: "Page 3", exact: true }).click();
  await view(page, "challenges");
  assert.equal(await list.innerHTML(), overviewMarkup);
  await page.getByRole("combobox", { name: "Filter by status" }).selectOption("Draft");
  await page.getByRole("combobox", { name: "Filter by boss" }).selectOption("ScarredOrc");
  await page.getByRole("textbox", { name: "Search challenges", exact: true }).fill("OverviewChallenge");
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await page.locator("[data-overview-more]").first().click();
  await view(page, "overview");
  assert.equal(await page.getByRole("menu").count(), 0);
  assert.equal(await page.getByRole("combobox", { name: "Filter by status" }).inputValue(), "");
  assert.equal(await page.getByRole("textbox", { name: "Search challenges", exact: true }).inputValue(), "");
  assert.equal(await page.locator('.overview-pagination [aria-current="page"]').innerText(), "3");
  await view(page, "challenges");
  assert.equal(await page.getByRole("menu").count(), 0);
  assert.equal(await page.getByRole("combobox", { name: "Filter by status" }).inputValue(), "Draft");
  assert.equal(await page.getByRole("combobox", { name: "Filter by boss" }).inputValue(), "ScarredOrc");
  assert.equal(await page.getByRole("textbox", { name: "Search challenges", exact: true }).inputValue(), "OverviewChallenge");
  assert.equal(await page.locator('.overview-pagination [aria-current="page"]').innerText(), "2");
  await page.getByRole("button", { name: "New Challenge", exact: true }).click();
  assert.equal(await page.locator(".topbar h1").innerText(), "Challenge Setup");
});

test("deploy history matches challenge table styling and retains build details", async (t) => {
  const { page, url } = await session(t);
  const store = await (await page.request.get(`${url}/api/state`)).json();
  store.history.unshift({
    id: "STAGE-1190", challengeId: "ScarredOrcTest", status: "Failure", time: "2026-09-14 09:30 UTC",
    initiator: "Test operator", log: "Build failed; approved changes were not committed.",
    diff: {
      setup: [{ field: "DisplayName", oldValue: "Scarred Orc Trial", newValue: "Reviewed Orc title" }],
      calendar: [{ field: "2026-09 / 14 / 40-49", oldValue: "19:00:ScarredOrcTest", newValue: "20:00:ScarredOrcTest" }],
    },
  });
  await page.route("**/api/state", (route) => route.fulfill({ json: store }));
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  const tableStyle = (element) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(["height", "paddingTop", "paddingLeft", "backgroundColor", "fontSize", "fontWeight", "textTransform", "borderLeftWidth", "borderBottomColor"].map((key) => [key, style[key]]));
  };
  const headerStyle = await page.locator(".overview-table th").nth(1).evaluate(tableStyle);
  const rowStyle = await page.locator(".overview-table td").nth(1).evaluate(tableStyle);
  await view(page, "history");
  const history = page.locator(".deploy-history");
  assert.deepEqual(await history.locator("th").nth(1).evaluate(tableStyle), headerStyle);
  assert.deepEqual(await history.locator("td").nth(1).evaluate(tableStyle), rowStyle);
  assert.equal(await history.evaluate((element) => getComputedStyle(element).boxShadow), "none");
  assert.equal(await history.locator("input, select, .overview-pagination").count(), 0);
  assert.deepEqual(await history.locator("tbody tr td:first-child").allTextContents(), store.history.map((item) => item.id));
  assert.deepEqual(await history.locator("tbody tr td:nth-child(4)").allTextContents(), store.history.map((item) => item.time));
  assert.deepEqual(await history.locator(".overview-status").allTextContents(), store.history.map((item) => item.status));
  await mkdir(".tmp/screenshots", { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `.tmp/screenshots/history-table-${width}.png`, fullPage: true });
    const details = history.locator("details").first();
    await details.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await details.evaluate((element) => element.open), true);
    assert.match(await details.innerText(), /Test operator/);
    assert.match(await details.innerText(), /Build failed; approved changes were not committed/);
    assert.deepEqual(await details.locator(".old-value").allTextContents(), ["Scarred Orc Trial", "19:00:ScarredOrcTest"]);
    assert.deepEqual(await details.locator(".new-value").allTextContents(), ["Reviewed Orc title", "20:00:ScarredOrcTest"]);
    await details.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.tmp/screenshots/history-details-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await details.evaluate((element) => element.scrollWidth <= element.clientWidth), true);
    await page.keyboard.press("Enter");
    assert.equal(await details.evaluate((element) => element.open), false);
    await history.locator(".table-wrap").evaluate((element) => { element.scrollLeft = 0; });
  }
});

test("search keeps focus and supports typing, caret editing and empty results", async (t) => {
  const { page } = await session(t);
  await view(page, "challenges");
  const search = page.getByRole("textbox", { name: "Search challenges", exact: true });
  await search.pressSequentially("FrostWarden70");
  assert.equal(await search.inputValue(), "FrostWarden70");
  assert.equal(await page.locator("tbody tr").count(), 1);
  assert.equal(await search.evaluate((input) => document.activeElement === input), true);
  await search.press("Home");
  await search.pressSequentially("missing");
  assert.match(await page.locator("tbody").innerText(), /No challenges found/);
  await search.fill("");
  assert.equal(await page.locator("tbody tr").count(), 3);
});

test("draft survives validation errors, navigation and a reload without replacing blanks with zero", async (t) => {
  const { page } = await session(t);
  await page.locator('[data-action="new-challenge"]').click();
  await field(page, "id").fill("BrowserDraft");
  await field(page, "identity.displayName").pressSequentially("Draft title");
  await number(page, "timing.durationHours").fill("");
  await page.locator('[data-action="save-draft"]').click();
  assert.equal(await number(page, "timing.durationHours").inputValue(), "");
  await notification(page, "Challenge saved").waitFor();
  assert.match(await notification(page, "Challenge saved").innerText(), /Draft saved/);
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "setup");
  assert.equal(await field(page, "identity.displayName").inputValue(), "Draft title");
  assert.equal(await number(page, "timing.durationHours").inputValue(), "");
  await page.locator('[data-action="preview"]').click();
  assert.equal(await page.locator('[data-action="deploy"]').isDisabled(), true);
});

test("an incomplete ID can be saved without overwriting another challenge", async (t) => {
  const { page, url } = await session(t);
  await page.locator('[data-action="new-challenge"]').click();
  await field(page, "id").fill("");
  await field(page, "identity.displayName").fill("Incomplete identity");
  await page.locator('[data-action="save-draft"]').click();
  await notification(page, "Draft saved with validation issues").waitFor();
  assert.match(await notification(page, "Draft saved with validation issues").innerText(), /Draft saved locally/);
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "setup");
  assert.equal(await field(page, "id").inputValue(), "");
  assert.equal(await field(page, "identity.displayName").inputValue(), "Incomplete identity");
  await field(page, "id").fill("ScarredOrcTest");
  await page.locator('[data-action="save-draft"]').click();
  const remote = await (await fetch(url + "/api/state")).json();
  assert.equal(remote.challenges[0].identity.displayName, "Scarred Orc Trial");
  await page.locator('[data-action="preview"]').click();
  assert.equal(await page.locator('[data-action="deploy"]').isDisabled(), true);
});

test("number typing preserves fractional duration and native input focus", async (t) => {
  const { page } = await session(t);
  await view(page, "setup");
  const duration = number(page, "timing.durationHours");
  await duration.fill("");
  await duration.pressSequentially("12.5");
  assert.equal(await duration.inputValue(), "12.5");
  assert.equal(await duration.evaluate((input) => input === document.activeElement), true);
});

test("BossID combobox filters names and updates only after selection", async (t) => {
  const { page } = await session(t);
  await view(page, "setup");
  const input = page.locator('[data-combobox-input="content.bossId"]');
  const value = field(page, "content.bossId");
  await input.fill("behemoth");
  const visible = page.locator('[data-combobox-option]:visible');
  assert.equal(await visible.count(), 3);
  assert.deepEqual((await visible.allTextContents()).map((text) => text.trim()), ["Eyeless Behemoth", "Acid Behemoth", "Ashen Behemoth"]);
  assert.equal(await value.inputValue(), "ScarredOrc");
  await page.getByRole("option", { name: "Acid Behemoth" }).click();
  assert.equal(await input.inputValue(), "Acid Behemoth");
  assert.equal(await value.inputValue(), "AcidBehemoth");
  await input.fill("dark prof");
  await input.press("Enter");
  assert.equal(await value.inputValue(), "DarkProfanity");
  await input.fill("no matching boss");
  assert.equal(await input.locator("..").locator(".combobox-empty").isVisible(), true);
  await input.press("Escape");
  assert.equal(await input.inputValue(), "Dark Profanity");
});

test("EventGraphicURL lists known assets, filters once typing pauses and keeps custom values", async (t) => {
  const { page } = await session(t);
  await view(page, "setup");
  const input = page.locator('[data-combobox-input="visuals.eventGraphicUrl"]');
  const options = "#combobox-visuals-eventGraphicUrl-list [data-combobox-option]";
  assert.equal(await page.locator(options).count(), 41);
  await input.focus();
  // A keystroke neither filters nor re-renders synchronously; the debounce applies both later.
  const immediate = await input.evaluate((element, selector) => {
    const root = element.closest("[data-combobox]");
    element.value = "scarred orc";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return { visible: document.querySelectorAll(`${selector}:not([hidden])`).length, sameRoot: element.closest("[data-combobox]") === root && root.isConnected };
  }, options);
  assert.deepEqual(immediate, { visible: 41, sameRoot: true });
  await page.waitForFunction((selector) => document.querySelectorAll(`${selector}:not([hidden])`).length === 3, options);
  assert.deepEqual((await page.locator(`${options}:visible`).allTextContents()).map((text) => text.trim()),
    ["challenge/ui_img_scarred_orc_1.png", "challenge/ui_img_scarred_orc_2.png", "challenge/ui_img_scarred_orc_3.png"]);
  assert.equal(await input.evaluate((element) => document.activeElement === element), true);
  await page.getByRole("option", { name: "challenge/ui_img_scarred_orc_2.png" }).click();
  assert.equal(await input.inputValue(), "challenge/ui_img_scarred_orc_2.png");
  assert.match(await page.locator(".asset-reference").first().innerText(), /ui_img_scarred_orc_2\.png/);
  await input.fill("challenge/custom_event.png");
  await input.press("Escape");
  await page.waitForTimeout(400);
  assert.equal(await input.inputValue(), "challenge/custom_event.png");
  assert.equal(await input.getAttribute("aria-expanded"), "false");
  assert.match(await page.locator(".asset-reference").first().innerText(), /custom_event\.png/);
});

test("new setups use agreed defaults, DropTier follows the bracket and Advanced fields keep focus while typing", async (t) => {
  const { page } = await session(t);
  await page.locator('[data-action="new-challenge"]').click();
  assert.deepEqual(await Promise.all(["players.minRequired", "players.players", "players.hardLimit"].map((path) => number(page, path).inputValue())), ["15", "35", "50"]);
  assert.equal(await field(page, "rewards.dropTier").inputValue(), "DC_Level30");
  await page.locator(".brackets-trigger").hover();
  assert.equal(await page.locator("#supported-brackets-help").isVisible(), true);
  assert.deepEqual(await page.locator("#supported-brackets-help .bracket-list span").allTextContents(), ["15-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-90"]);
  await number(page, "eligibility.minLevel").fill("60");
  await number(page, "eligibility.maxLevel").fill("69");
  assert.equal(await field(page, "rewards.dropTier").inputValue(), "DC_Level69");
  await choose(page, "rewards.dropTier", "DC_Level60");
  assert.equal(await field(page, "rewards.dropTier").inputValue(), "DC_Level60");
  assert.equal(await page.locator("#combobox-content-wavePreset-list [data-combobox-option]").count(), 525);
  assert.deepEqual(await page.locator("#combobox-content-arena-list [data-combobox-option]").evaluateAll((items) => items.map((item) => item.dataset.label)),
    ["Forest", "Dark Temple", "Graveyard", "Cave", "Rockyfields"]);
  await choose(page, "content.arena", "Dark Temple");
  assert.equal(await field(page, "content.arena").inputValue(), "DarkTemple");
  await page.locator("[data-advanced] summary").click();
  const prices = field(page, "advanced.attemptPrices");
  assert.equal(await prices.inputValue(), "1,1,2,3,4");
  assert.equal(await number(page, "advanced.minutesLeftToUseHardLimit").inputValue(), "300");
  await prices.fill("");
  await prices.pressSequentially("2,2,3");
  assert.equal(await prices.inputValue(), "2,2,3");
  const inactive = number(page, "advanced.minutesInactive");
  await inactive.fill("");
  await inactive.pressSequentially("45");
  assert.equal(await inactive.inputValue(), "45");
  assert.equal(await inactive.evaluate((input) => input === document.activeElement), true);
});

test("ChallengeDescription suggests sheet localization keys and keeps custom text", async (t) => {
  const { page } = await session(t);
  await view(page, "setup");
  const options = page.locator("#combobox-identity-description-list [data-combobox-option]");
  assert.equal(await options.count(), 37);
  const description = field(page, "identity.description");
  await description.fill("razor clawed");
  await page.waitForFunction(() => document.querySelectorAll("#combobox-identity-description-list [data-combobox-option]:not([hidden])").length === 1);
  await page.getByRole("option", { name: "IDS_Razor-Clawed_Recluse_Description", exact: true }).click();
  assert.equal(await description.inputValue(), "IDS_Razor-Clawed_Recluse_Description");
  await description.fill("Custom description text");
  await description.press("Escape");
  await page.locator('[data-action="save-draft"]').click();
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "setup");
  assert.equal(await field(page, "identity.description").inputValue(), "Custom description text");
});

test("BadgeBackgroundURL lists the known badge assets", async (t) => {
  const { page } = await session(t);
  await view(page, "setup");
  const options = page.locator("#combobox-visuals-badgeBackgroundUrl-list [data-combobox-option]");
  assert.equal(await options.count(), 41);
  await page.locator('[data-combobox-input="visuals.badgeBackgroundUrl"]').fill("necrodaemon 3");
  await page.waitForFunction(() => document.querySelectorAll("#combobox-visuals-badgeBackgroundUrl-list [data-combobox-option]:not([hidden])").length === 1);
  await page.getByRole("option", { name: "challenge/badge_image_necrodaemon_3.png", exact: true }).click();
  assert.equal(await field(page, "visuals.badgeBackgroundUrl").inputValue(), "challenge/badge_image_necrodaemon_3.png");
});

test("Immunity icons allow several selections, debounce the search and keep unknown legacy icons", async (t) => {
  const { page } = await session(t);
  await view(page, "setup");
  const icons = page.locator('[data-combobox]:has([data-combobox-input="visuals.immuneIcons"])');
  const input = icons.locator("[data-combobox-input]");
  const value = icons.locator('[type="hidden"][data-field]');
  const options = "#combobox-visuals-immuneIcons-list [data-combobox-option]";
  // The fixture's legacy keys are not in the icon list; they stay selected and are marked.
  assert.equal(await value.inputValue(), "bleed,stun");
  assert.equal(await icons.locator(".combobox-chip.unknown").count(), 2);
  await input.click();
  assert.deepEqual(await page.locator(options).evaluateAll((items) => items.map((item) => item.dataset.value)), ["Physical", "Cold", "Fire", "Poison"]);
  await icons.getByRole("option", { name: "Cold", exact: true }).click();
  await icons.getByRole("option", { name: "Fire", exact: true }).click();
  assert.equal(await value.inputValue(), "bleed,stun,Cold,Fire");
  assert.equal(await page.locator("#combobox-visuals-immuneIcons-list").isVisible(), true, "The list stays open for further selections");
  assert.equal(await icons.getByRole("option", { name: "Fire", exact: true }).getAttribute("aria-selected"), "true");
  const immediate = await input.evaluate((element, selector) => {
    element.value = "poi";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return document.querySelectorAll(`${selector}:not([hidden])`).length;
  }, options);
  assert.equal(immediate, 4);
  await page.waitForFunction((selector) => document.querySelectorAll(`${selector}:not([hidden])`).length === 1, options);
  await input.press("Enter");
  assert.equal(await value.inputValue(), "bleed,stun,Cold,Fire,Poison");
  assert.equal(await input.inputValue(), "poi");
  await icons.getByRole("button", { name: "Remove bleed", exact: true }).click();
  await input.fill("");
  await input.press("Backspace");
  assert.equal(await value.inputValue(), "stun,Cold,Fire");
  await page.locator('[data-action="save-draft"]').click();
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "setup");
  assert.equal(await page.locator('[type="hidden"][data-field="visuals.immuneIcons"]').inputValue(), "stun,Cold,Fire");
});

test("calendar challenge selection loads the matching setup and preserves an unfinished editor", async (t) => {
  const { page } = await session(t);
  await view(page, "setup");
  await field(page, "identity.displayName").fill("Unfinished Orc edit");
  await view(page, "calendar");
  await page.locator('[data-schedule="challengeId"]').selectOption("FrostWarden70");
  assert.equal(await page.locator('[data-schedule="levelBracket"]').inputValue(), "70-90");
  await view(page, "setup");
  assert.equal(await field(page, "id").inputValue(), "FrostWarden70");
  assert.equal(await field(page, "content.bossId").inputValue(), "FrostWarden");
  await view(page, "calendar");
  await page.locator('[data-schedule="challengeId"]').selectOption("ScarredOrcTest");
  await view(page, "setup");
  assert.equal(await field(page, "identity.displayName").inputValue(), "Unfinished Orc edit");
});

test("saved changes remain in preview, date changes revoke approval and deployment persists", async (t) => {
  const { page, url } = await session(t);
  await view(page, "setup");
  await field(page, "identity.displayName").fill("Reviewed Orc title");
  await page.locator('[data-action="save-draft"]').click();
  await page.locator('[data-action="preview"]').click();
  await page.waitForSelector("[data-review]");
  assert.match(await page.locator(".diff-list").first().innerText(), /Scarred Orc Trial/);
  assert.match(await page.locator(".diff-list").first().innerText(), /Reviewed Orc title/);
  await page.locator("[data-review]").check();
  assert.equal(await page.locator('[data-action="deploy"]').isDisabled(), false);
  await view(page, "calendar");
  await page.locator('.calendar-picker [data-month="1"]').click();
  await page.locator('[data-action="preview"]').click();
  await page.waitForSelector("[data-review]");
  assert.equal(await page.locator("[data-review]").isChecked(), false);
  assert.equal(await page.locator('[data-action="deploy"]').isDisabled(), true);
  await page.locator("[data-review]").check();
  await page.locator('[data-action="deploy"]').click();
  assert.equal(await page.locator('[data-action="deploy"]').isDisabled(), true);
  await page.waitForFunction(() => document.querySelector(".deploy-step.active")?.textContent === "Success");
  const deployed = await (await fetch(url + "/api/state")).json();
  assert.equal(deployed.challenges[0].identity.displayName, "Reviewed Orc title");
  assert.equal(deployed.history[0].status, "Success");
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "setup");
  assert.equal(await field(page, "identity.displayName").inputValue(), "Reviewed Orc title");
});

test("editing a calendar occurrence retains its neighbors and scroll position", async (t) => {
  const { page } = await session(t);
  await view(page, "calendar");
  const occurrence = page.locator('[data-entry-day="22"][data-entry-bracket="40-49"][data-entry-index="1"]');
  await occurrence.click();
  assert.equal(await page.locator('[data-schedule="startUtc"]').inputValue(), "20:00");
  const previousScroll = await page.locator(".calendar-shell").evaluate((element) => element.scrollTop);
  await page.locator('[data-schedule="startUtc"]').fill("21:00");
  assert.equal(await page.locator(".calendar-shell").evaluate((element) => element.scrollTop), previousScroll);
  await page.locator('[data-action="preview"]').click();
  await page.waitForSelector("[data-review]");
  const calendarDiff = await page.locator(".diff-list").last().innerText();
  assert.match(calendarDiff, /15:00:LegacySpider/);
  assert.match(calendarDiff, /21:00:ScarredOrcTest/);
});

test("refreshing during a new challenge deployment restores the committed identity", async (t) => {
  const { page } = await session(t);
  await page.locator('[data-action="new-challenge"]').click();
  await field(page, "id").fill("RefreshDuringDeploy");
  await field(page, "identity.displayName").fill("Reload test");
  await field(page, "identity.targetName").fill("Scarred Orc");
  await choose(page, "content.arena", "Dark Temple");
  await choose(page, "content.wavePreset", "ScarredOrc");
  await field(page, "rewards.rewardPreset").fill("CustomRewards");
  await page.locator('[data-action="preview"]').click();
  await page.waitForSelector("[data-review]");
  await page.locator("[data-review]").check();
  await page.locator('[data-action="deploy"]').click();
  await page.waitForFunction(() => ["Queued", "Running"].includes(document.querySelector(".deploy-step.active")?.textContent));
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "preview");
  await page.waitForFunction(() => document.querySelector(".deploy-step.active")?.textContent === "Success");
  await view(page, "setup");
  assert.equal(await field(page, "id").inputValue(), "RefreshDuringDeploy");
  assert.equal(await field(page, "id").getAttribute("readonly"), "");
  await page.locator('[data-action="save-draft"]').click();
  await notification(page, "Challenge saved").waitFor();
  assert.match(await notification(page, "Challenge saved").innerText(), /Draft saved locally/);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  await view(page, "challenges");
  assert.match(await page.locator("tbody").innerText(), /RefreshDuringDeploy/);
});

test("corrupt browser storage reports recovery and leaves server data available", async (t) => {
  const { page } = await session(t);
  await page.evaluate(() => localStorage.setItem("challenge-manager.workspace.v1", "invalid json"));
  await page.reload();
  await page.waitForSelector(".workflow-controls");
  assert.match(await page.locator('[role="status"]').innerText(), /could not be read/);
  await view(page, "setup");
  assert.equal(await field(page, "id").inputValue(), "ScarredOrcTest");
});

test("desktop and mobile views stay within the viewport and timing inputs align", async (t) => {
  const { page } = await session(t);
  await mkdir(".tmp/screenshots", { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ["overview", "setup", "calendar", "preview", "history", "settings"]) {
      await view(page, name);
      await page.screenshot({ path: `.tmp/screenshots/${name}-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} at ${width}px`);
    }
    if (width === 1440) {
      await view(page, "setup");
      const boxes = await Promise.all(["timing.durationHours", "timing.attemptDurationSeconds", "timing.timerPerWave"].map((path) => number(page, path).boundingBox()));
      assert.ok(boxes.every((box) => Math.abs(box.y - boxes[0].y) < 1));
      assert.ok(boxes.every((box) => Math.abs(box.height - boxes[0].height) < 1));
    }
  }
});
