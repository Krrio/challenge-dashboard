import { t, message, locale } from "../i18n.js";

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function Button({ children, variant = "secondary", className = "", attrs = "" }) {
  return `<button type="button" class="${cx("btn", variant, className)}" ${attrs}>${children}</button>`;
}

export function Badge({ children, variant = "default", className = "" }) {
  return `<span class="${cx("badge", `badge-${variant}`, className)}">${children}</span>`;
}

export function Card({ children, className = "" }) {
  return `<div class="${cx("card", className)}">${children}</div>`;
}

export function CardHeader({ title, description = "", action = "" }) {
  return `
    <div class="section-head">
      <div>
        <h2>${t(title)}</h2>
        ${description ? `<p class="helper">${description}</p>` : ""}
      </div>
      ${action}
    </div>
  `;
}

export function CardContent({ children, className = "" }) {
  return `<div class="${cx("card-body", className)}">${children}</div>`;
}

export function Alert({ children, variant = "default", className = "" }) {
  return `<div class="${cx("notice", variant !== "default" && variant, className)}">${children}</div>`;
}

export function Input({ value = "", type = "text", className = "", attrs = "" }) {
  return `<input class="${cx("input", className)}" type="${type}" value="${escapeAttr(value)}" ${attrs} />`;
}

export function Textarea({ value = "", className = "", attrs = "" }) {
  return `<textarea class="${cx("textarea", className)}" ${attrs}>${escapeAttr(value)}</textarea>`;
}

export function Select({ value = "", options = [], className = "", attrs = "" }) {
  const items = options.map((option) => typeof option === "object" ? option : { value: option, label: option });
  return `
    <select class="${cx("select", className)}" ${attrs}>
      ${!items.some((option) => option.value === value) ? `<option value="${escapeAttr(value)}" selected>${escapeAttr(value === "" ? t("Select...") : value)}</option>` : ""}
      ${items.map((option) => `<option value="${escapeAttr(option.value)}" ${option.value === value ? "selected" : ""}>${escapeAttr(option.label)}</option>`).join("")}
    </select>
  `;
}

export function Combobox({ value = "", options = [], path, attrs = "", placeholder = "Search...", allowCustom = false,
  toggleLabel = "", emptyLabel = "" }) {
  const selected = options.find((option) => option.value === value);
  const label = selected?.label || value;
  const listId = `combobox-${path.replaceAll(".", "-")}-list`;
  const resolvedToggleLabel = toggleLabel || (allowCustom ? "Open presets" : "Open list");
  const resolvedEmptyLabel = emptyLabel || (allowCustom ? "No matching presets." : "No matching options.");
  return `
    <div class="combobox" data-combobox ${allowCustom ? "data-allow-custom" : ""} data-selected-label="${escapeAttr(label)}">
      <input class="input combobox-input" type="text" value="${escapeAttr(label)}"
        autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list"
        aria-expanded="false" aria-controls="${listId}" data-combobox-input="${escapeAttr(path)}"
        placeholder="${escapeAttr(t(placeholder))}" ${allowCustom ? `data-field="${escapeAttr(path)}"` : ""} ${attrs} />
      <button class="combobox-toggle" type="button" data-combobox-toggle aria-label="${t(resolvedToggleLabel)}" tabindex="-1"></button>
      ${allowCustom ? "" : `<input type="hidden" value="${escapeAttr(value)}" data-field="${escapeAttr(path)}" />`}
      <div class="combobox-menu" id="${listId}" role="listbox" hidden>
        ${options.map((option, index) => `
          <button class="combobox-option" id="${listId}-${index}" type="button" role="option"
            aria-selected="${option.value === value}" data-combobox-option
            data-value="${escapeAttr(option.value)}" data-label="${escapeAttr(option.label)}">
            <span>${escapeAttr(option.label)}</span><span class="combobox-check ${option.value === value ? "selected" : ""}" aria-hidden="true"></span>
          </button>
        `).join("")}
        <div class="combobox-empty" hidden>${t(resolvedEmptyLabel)}</div>
      </div>
    </div>
  `;
}

export function Tooltip({ content, id = "field-help" }) {
  return `
    <span class="tooltip">
      <button class="tooltip-trigger" type="button" aria-label="${t("Field information")}" aria-describedby="${escapeAttr(id)}"></button>
      <span class="tooltip-content" id="${escapeAttr(id)}" role="tooltip">${escapeAttr(t(content))}</span>
    </span>
  `;
}

export function Calendar({ month, selectedDay }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const weekStart = locale() === "pl-PL" ? 1 : 0;
  const firstDay = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() - weekStart + 7) % 7;
  const monthLabel = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1)),
  );
  const blanks = Array.from({ length: firstDay }, (_, index) => `<span class="calendar-empty" aria-hidden="true" data-empty="${index}"></span>`);
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return `
      <button class="calendar-day ${day === selectedDay ? "selected" : ""}" id="calendar-day-${day}" aria-label="${month}-${String(day).padStart(2, "0")}" aria-pressed="${day === selectedDay}" data-calendar-day="${day}" type="button">
        ${day}
      </button>
    `;
  });

  return `
    <div class="calendar-picker" role="group" aria-label="${t("Schedule date picker")}">
      <div class="calendar-picker-head">
        <button class="calendar-nav" data-month="-1" type="button" aria-label="${t("Previous month")}">‹</button>
        <div class="calendar-title">${monthLabel}</div>
        <button class="calendar-nav" data-month="1" type="button" aria-label="${t("Next month")}">›</button>
      </div>
      <div class="calendar-weekdays">
        ${(weekStart ? ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]).map((day) => `<span>${day}</span>`).join("")}
      </div>
      <div class="calendar-days">${blanks.join("")}${days.join("")}</div>
    </div>
  `;
}

export function Field({ label, control, helper = "", full = false, tooltip = "", id = "", error = "" }) {
  return `
    <div class="field ${full ? "full" : ""}">
      <div class="field-label-row">
        <label ${id ? `for="${escapeAttr(id)}"` : ""}>${escapeAttr(t(label))}</label>
        ${tooltip ? Tooltip({ content: tooltip, id: `${id}-help` }) : ""}
      </div>
      ${control}
      ${error ? `<span class="field-error" id="${escapeAttr(id)}-error">${escapeAttr(message(error))}</span>` : ""}
      ${helper ? `<span class="helper">${t(helper)}</span>` : ""}
    </div>
  `;
}

export function Table({ head, rows }) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${head.map((item) => `<th scope="col">${t(item)}</th>`).join("")}</tr></thead>
        <tbody>${rows.length ? rows.join("") : `<tr><td colspan="${head.length}" class="empty-state">${t("No challenges found.")}</td></tr>`}</tbody>
      </table>
    </div>
  `;
}
