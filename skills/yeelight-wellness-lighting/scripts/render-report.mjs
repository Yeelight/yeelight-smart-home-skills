#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { countLabel, getReportCopy, iconSvg } from "./report-copy.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(scriptDir, "..", "assets", "schemas", "wellness-report.schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const packageRoot = path.resolve(scriptDir, "..");
const heroAssetPath = path.join(packageRoot, "assets", "report", "wellness-hero-v2.png");
const heroAssetMaxBytes = 8 * 1024 * 1024;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function heroDataUri() {
  try {
    const packageRealPath = fs.realpathSync(packageRoot);
    const assetStat = fs.lstatSync(heroAssetPath);
    if (!assetStat.isFile() || assetStat.isSymbolicLink() || assetStat.size > heroAssetMaxBytes) throw new Error("invalid hero asset");
    const assetRealPath = fs.realpathSync(heroAssetPath);
    const relativeAsset = path.relative(packageRealPath, assetRealPath);
    if (!relativeAsset || relativeAsset.startsWith(`..${path.sep}`) || path.isAbsolute(relativeAsset)) throw new Error("hero asset outside package");
    const bytes = fs.readFileSync(heroAssetPath);
    if (bytes.length < pngSignature.length || !pngSignature.equals(bytes.subarray(0, pngSignature.length))) throw new Error("invalid hero asset signature");
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    throw new Error("report hero asset is unavailable");
  }
}

function validationError(message) {
  return new Error(`invalid wellness report ViewModel: ${message}`);
}

function resolveRef(rootSchema, reference) {
  if (typeof reference !== "string" || !reference.startsWith("#/")) return null;
  return reference.slice(2).split("/").reduce((value, key) => value?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], rootSchema);
}

function matchesType(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "null") return value === null;
  return typeof value === type;
}

function isValidCalendarDate(year, month, day) {
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](\d{2}):(\d{2}))$/);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
  const absoluteOffsetHour = Math.abs(offsetHour);
  if (!isValidCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return false;
  if (zone !== "Z" && (absoluteOffsetHour > 14 || offsetMinute > 59 || (absoluteOffsetHour === 14 && offsetMinute !== 0))) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function isIsoDate(value) {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return Boolean(match) && isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function isLocalTime(value) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validate(value, currentSchema, trail = "$") {
  if (!currentSchema) throw validationError(`${trail} has an unresolved schema reference`);
  if (currentSchema.$ref) return validate(value, resolveRef(schema, currentSchema.$ref), trail);
  if (currentSchema.oneOf || currentSchema.anyOf) {
    const branches = currentSchema.oneOf || currentSchema.anyOf;
    let matches = 0;
    for (const branch of branches) {
      try {
        validate(value, branch, trail);
        matches += 1;
      } catch {
        // A branch mismatch is expected while evaluating a closed union.
      }
    }
    const valid = currentSchema.oneOf ? matches === 1 : matches > 0;
    if (!valid) throw validationError(`${trail} does not satisfy ${currentSchema.oneOf ? "oneOf" : "anyOf"}`);
    return;
  }
  if (currentSchema.const !== undefined && value !== currentSchema.const) throw validationError(`${trail} must equal ${JSON.stringify(currentSchema.const)}`);
  if (currentSchema.enum && !currentSchema.enum.includes(value)) throw validationError(`${trail} is not an allowed value`);
  if (currentSchema.type && !matchesType(value, currentSchema.type)) throw validationError(`${trail} must be ${currentSchema.type}`);
  if (typeof value === "string") {
    if (currentSchema.minLength !== undefined && value.length < currentSchema.minLength) throw validationError(`${trail} is too short`);
    if (currentSchema.maxLength !== undefined && value.length > currentSchema.maxLength) throw validationError(`${trail} is too long`);
    if (currentSchema.pattern && !new RegExp(currentSchema.pattern).test(value)) throw validationError(`${trail} contains unsafe or invalid text`);
    if (currentSchema.format === "date-time" && !isIsoTimestamp(value)) throw validationError(`${trail} is not a valid ISO timestamp`);
    if (currentSchema.format === "date" && !isIsoDate(value)) throw validationError(`${trail} is not a valid ISO date`);
    if (currentSchema.format === "time" && !isLocalTime(value)) throw validationError(`${trail} is not a valid local time`);
  }
  if (typeof value === "number") {
    if (currentSchema.minimum !== undefined && value < currentSchema.minimum) throw validationError(`${trail} is below its minimum`);
    if (currentSchema.maximum !== undefined && value > currentSchema.maximum) throw validationError(`${trail} is above its maximum`);
  }
  if (Array.isArray(value)) value.forEach((entry, index) => validate(entry, currentSchema.items || {}, `${trail}[${index}]`));
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = currentSchema.properties || {};
    for (const key of currentSchema.required || []) if (!Object.hasOwn(value, key)) throw validationError(`${trail}.${key} is required`);
    if (currentSchema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(properties, key)) throw validationError(`${trail}.${key} is not allowed`);
    }
    for (const [key, childSchema] of Object.entries(properties)) if (Object.hasOwn(value, key)) validate(value[key], childSchema, `${trail}.${key}`);
  }
}

const bearerWord = ["bear", "er"].join("");
const sensitiveDisplayPattern = new RegExp(`(?:authorization\\s*:|${bearerWord}\\s+[A-Za-z0-9._~+/=-]{8,}|(?:access|refresh)[_-]?token\\s*[:=]|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9._~-]{8,}\\.|^\\[REDACTED\\]$)`, "i");
const stableIdentityPattern = /(?:\b(?:device|entity|home|house|household|profile|task|did)[-_](?:ref[-_])?[A-Za-z0-9][A-Za-z0-9._-]{3,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|^\d{6,}$)/i;
const uriSchemePattern = /(?:\b[A-Za-z][A-Za-z0-9+.-]*:\/\/|\b(?:https?|file|ftp|gopher|javascript|data|mailto|urn|ssh|wss?|blob|tel|sms):)/i;
const coordinateDecimal = String.raw`[-+]?\d{1,3}(?:\.\d+)?`;
const coordinatePairDecimal = String.raw`[-+]?\d{1,3}\.\d+`;
const coordinateHighPrecision = String.raw`[-+]?\d{1,3}\.\d{3,}`;
const coordinatePrefix = String.raw`(?:^|[^A-Za-z0-9])`;
const coordinateSeparator = String.raw`(?:\s*[,;/]\s*|\s+)`;
const coordinatePairEnd = String.raw`(?=\s*(?:$|[.,;!?)]|[。！？；，）”’】》」』]))`;
const coordinateDms = String.raw`\d{1,3}\s*°\s*\d{1,2}(?:\.\d+)?\s*['′’](?:\s*\d{1,2}(?:\.\d+)?\s*(?:["″”])?)?`;
const coordinateLatitude = String.raw`${coordinateDecimal}\s*°?\s*[NS]`;
const coordinateLongitude = String.raw`${coordinateDecimal}\s*°?\s*[EW]`;
const coordinatePatterns = [
  /\b(?:lat(?:itude)?|lon(?:gitude|g)?)\s*[:=]/i,
  new RegExp(`${coordinatePrefix}${coordinateHighPrecision}${coordinateSeparator}${coordinateHighPrecision}`, "i"),
  new RegExp(`${coordinatePrefix}${coordinatePairDecimal}${coordinateSeparator}${coordinatePairDecimal}${coordinatePairEnd}`, "i"),
  new RegExp(`${coordinatePrefix}(?:${coordinateLatitude}${coordinateSeparator}${coordinateLongitude}|${coordinateLongitude}${coordinateSeparator}${coordinateLatitude})(?=$|[^A-Za-z0-9])`, "i"),
  new RegExp(String.raw`${coordinatePrefix}${coordinateHighPrecision}\s*[NSEW](?=$|[^A-Za-z0-9])`, "i"),
  new RegExp(String.raw`${coordinatePrefix}${coordinateDecimal}\s*°\s*[NSEW](?=$|[^A-Za-z0-9])`, "i"),
  new RegExp(String.raw`${coordinatePrefix}${coordinateDms}\s*[NSEW](?=$|[^A-Za-z0-9])`, "i"),
  new RegExp(String.raw`${coordinatePrefix}${coordinateDms}(?:\s*[NS])?${coordinateSeparator}${coordinateDms}(?:\s*[EW])?(?=$|[^A-Za-z0-9])`, "i"),
];
const noWriteStatuses = new Set(["preview", "no-op", "blocked", "uncertain", "stale", "runtime_missing", "runtime_outdated", "auth_required", "clarification_required", "not_supported", "error"]);

function isIdentitySensitiveField(trail) {
  return !/(?:\.id|\.reportId|\.schemaVersion|\.status|\.mode|\.kind|\.priority)$/.test(trail);
}

function rejectSensitiveDisplayText(value, trail = "$") {
  if (typeof value === "string") {
    if (sensitiveDisplayPattern.test(value)) throw validationError(`${trail} contains a sensitive credential marker`);
    if (uriSchemePattern.test(value)) throw validationError(`${trail} contains an external URI scheme`);
    if (isIdentitySensitiveField(trail) && stableIdentityPattern.test(value)) throw validationError(`${trail} contains a sensitive or stable identity marker`);
    if (coordinatePatterns.some((pattern) => pattern.test(value))) throw validationError(`${trail} contains a coordinate`);
    return;
  }
  if (Array.isArray(value)) value.forEach((entry, index) => rejectSensitiveDisplayText(entry, `${trail}[${index}]`));
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) rejectSensitiveDisplayText(child, `${trail}.${key}`);
  }
}

export function validateReport(viewModel) {
  validate(viewModel, schema);
  rejectSensitiveDisplayText(viewModel);
  const ideas = viewModel.ideas || [];
  const missingCity = viewModel.location.city === "unknown";
  if (missingCity && viewModel.status !== "clarification_required") {
    throw validationError("$.status must be clarification_required when location.city is unknown");
  }
  if (missingCity) {
    if (viewModel.recipe.selected) throw validationError("$.recipe.selected must be false when location.city is unknown");
    const selectedIdea = ideas.findIndex((idea) => idea.selected);
    if (selectedIdea !== -1) throw validationError(`$.ideas[${selectedIdea}].selected must be false when location.city is unknown`);
    if (viewModel.location.timezone !== "unknown" || viewModel.location.localDate !== "unknown" || viewModel.location.localTime !== "unknown") {
      throw validationError("location timezone/date/time must remain unknown until city confirmation");
    }
    if (viewModel.location.region && viewModel.location.region !== "unknown") {
      throw validationError("location.region must remain unknown until city confirmation");
    }
    if (viewModel.location.sunrise || viewModel.location.sunset) {
      throw validationError("sunrise and sunset must remain absent until city confirmation");
    }
    if (viewModel.targets.length > 0) throw validationError("targets must be empty until city confirmation");
    if (viewModel.changes.length > 0) throw validationError("changes must be empty until city confirmation");
    if (viewModel.context.freshness !== "unknown" || viewModel.context.weather || viewModel.context.retrievedAt || (viewModel.context.signals?.length || 0) > 0) {
      throw validationError("context reads must be absent until city confirmation");
    }
  }
  const contextBlocked = !missingCity
    && (viewModel.context.freshness !== "fresh"
      || !viewModel.context.weather
      || !viewModel.location.sunrise
      || !viewModel.location.sunset);
  if (contextBlocked) {
    if (!["clarification_required", "stale"].includes(viewModel.status)) throw validationError("status must be clarification_required while day context is incomplete");
    if (viewModel.recipe.selected) throw validationError("recipe.selected must be false while day context is incomplete");
    if (ideas.some((idea) => idea.selected)) throw validationError("ideas must not be selected while day context is incomplete");
    if (viewModel.targets.length > 0) throw validationError("targets must be empty while day context is incomplete");
    if (viewModel.changes.length > 0) throw validationError("changes must be empty while day context is incomplete");
  }
  const ideaIds = new Set();
  for (const idea of ideas) {
    if (ideaIds.has(idea.id)) throw validationError(`ideas contains duplicate id: ${idea.id}`);
    ideaIds.add(idea.id);
  }
  if (noWriteStatuses.has(viewModel.status)) {
    const changedTarget = viewModel.targets.findIndex((target) => target.change === "changed");
    if (changedTarget !== -1) throw validationError(`$.targets[${changedTarget}] cannot claim a changed target for ${viewModel.status}`);
    const executedLightChange = viewModel.changes.findIndex((change) => change.kind === "light");
    if (executedLightChange !== -1) throw validationError(`$.changes[${executedLightChange}] cannot claim an executed light change for ${viewModel.status}`);
  }
  return viewModel;
}

export const validateViewModel = validateReport;

function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function text(value, fallback, copy) {
  const fallbackText = fallback ?? copy?.fallback ?? "Not provided";
  if (value === undefined || value === null || value === "") return escapeHtml(fallbackText);
  if (value === "unknown") return escapeHtml(copy?.unknown ?? "Unconfirmed");
  return escapeHtml(value);
}

function list(items, render, empty, copy) {
  return items?.length ? `<ul class="plain-list">${items.map(render).join("")}</ul>` : `<p class="empty">${text(empty ?? copy?.empty, undefined, copy)}</p>`;
}

function recipeCard(recipe, compact = false, copy, showSelected = true) {
  const tone = recipe.priority === "P0" ? "priority-p0" : recipe.priority === "P1" ? "priority-p1" : "priority-p2";
  const selected = showSelected && recipe.selected;
  return `<article class="recipe ${selected ? "selected" : ""} ${tone}"><div class="recipe-top"><span class="recipe-priority">${text(recipe.priority, undefined, copy)}</span>${selected ? `<span class="selected-mark">${text(copy.ui.selected, undefined, copy)}</span>` : ""}</div><h3>${text(recipe.title, undefined, copy)}</h3>${recipe.principle ? `<p class="recipe-principle">${text(recipe.principle, undefined, copy)}</p>` : ""}${!compact && recipe.strategy ? `<p>${text(recipe.strategy, undefined, copy)}</p>` : ""}${recipe.explanation ? `<p>${text(recipe.explanation, undefined, copy)}</p>` : ""}</article>`;
}

function renderTarget(target, copy) {
  const state = copy.change[target.change] || target.change;
  const stateClass = target.change === "changed" ? "is-changed" : target.change === "preserved" || target.change === "protected" ? "is-preserved" : "is-muted";
  return `<article class="target-row ${stateClass}"><div class="target-heading"><span class="state-dot"></span><strong>${text(target.label, undefined, copy)}</strong><span class="target-state">${text(state, undefined, copy)}</span></div>${target.area ? `<p class="target-area">${text(target.area, undefined, copy)}</p>` : ""}<div class="target-values"><span><small>${text(copy.ui.before, undefined, copy)}</small>${text(target.before, undefined, copy)}</span><span class="value-arrow">→</span><span><small>${text(copy.ui.after, undefined, copy)}</small>${text(target.after, undefined, copy)}</span></div>${target.note ? `<p class="target-note">${text(target.note, undefined, copy)}</p>` : ""}</article>`;
}

function renderSignal(signal, copy) {
  return `<li><span>${text(signal.label, undefined, copy)}</span><strong>${text(signal.value, undefined, copy)}</strong><small>${signal.source ? text(signal.source, undefined, copy) : text(copy.ui.sourceMissing, undefined, copy)}${signal.observedAt ? ` · ${text(signal.observedAt, undefined, copy)}` : signal.forecastFor ? ` · ${text(copy.ui.forecast, undefined, copy)} ${text(signal.forecastFor, undefined, copy)}` : ""} · ${text(copy.freshness[signal.freshness] || copy.unknown, undefined, copy)}</small></li>`;
}

function renderChange(item, copy) {
  return `<article class="change-item"><div class="change-heading"><span class="change-mark"></span><strong>${text(item.label, undefined, copy)}</strong><span class="change-kind">${text(copy.changeKind[item.kind] || copy.ui.change, undefined, copy)}</span></div><p>${text(item.summary, undefined, copy)}</p>${item.before || item.after ? `<small>${item.before ? text(item.before, undefined, copy) : text(copy.fallback, undefined, copy)} → ${item.after ? text(item.after, undefined, copy) : text(copy.fallback, undefined, copy)}</small>` : ""}</article>`;
}

function renderFactList(items, copy, empty = copy.noRecords) {
  return list(items, (item) => `<li>${text(item, undefined, copy)}</li>`, empty, copy);
}

function lacksDayContext(value) {
  return value === undefined || value === null || value === "" || value === "unknown";
}

export function renderReport(viewModel) {
  validateReport(viewModel);
  const { location, context, recipe, summary } = viewModel;
  const copy = getReportCopy(viewModel.locale);
  const weather = context.weather;
  const ideas = viewModel.ideas || [];
  const signals = context.signals || [];
  const needsCity = !location.city || location.city === "unknown";
  const contextBlocked = !needsCity
    && (context.freshness !== "fresh"
      || lacksDayContext(context.weather)
      || lacksDayContext(location.sunrise)
      || lacksDayContext(location.sunset));
  const statusEntry = contextBlocked
    ? [copy.ui.contextRequiredTitle, copy.ui.contextRequiredDetail]
    : viewModel.status === "clarification_required" && !needsCity
    ? [copy.ui.genericClarificationTitle, copy.ui.genericClarificationDetail]
    : copy.status[viewModel.status] || [viewModel.status, copy.ui.terminalRecorded];
  const [statusTitle, statusDetail] = statusEntry;
  const changes = viewModel.changes || [];
  const targets = viewModel.targets || [];
  const principles = viewModel.principles || [];
  const hasPrinciples = principles.length > 0;
  const changedCount = targets.filter((target) => target.change === "changed").length;
  const onlineCount = targets.filter((target) => target.state === "online").length;
  const steadyCount = targets.filter((target) => target.change === "preserved" || target.change === "protected").length;
  const attentionCount = targets.filter((target) => ["offline", "unsupported", "ambiguous", "unknown"].includes(target.change)).length;
  const statusTone = ["success", "no-op"].includes(viewModel.status) ? "positive" : ["partial", "uncertain", "stale"].includes(viewModel.status) ? "caution" : "neutral";
  const city = location.city || copy.ui.locationMissing;
  const timezone = location.timezone || copy.ui.timezoneMissing;
  const localTime = location.localTime || copy.ui.timeMissing;
  const weatherSummary = weather
    ? `${text(weather.label, undefined, copy)}${weather.temperature !== undefined ? ` · ${text(weather.temperature, undefined, copy)}${weather.unit ? ` ${text(weather.unit, undefined, copy)}` : ""}` : ""}`
    : copy.ui.weatherUnknown;
  const sunWindow = location.sunrise && location.sunset ? `${text(location.sunrise, undefined, copy)}${copy.ui.daylightJoin}${text(location.sunset, undefined, copy)}` : copy.ui.daylightUnknown;
  const weatherFreshness = copy.freshness[weather?.freshness] || copy.freshness.unknown;
  const contextFreshness = copy.freshness[context.freshness] || copy.freshness.unknown;
  const sourceCount = signals.length + (weather ? 1 : 0);
  const contextNote = context.freshness === "fresh" ? copy.ui.contextFresh : context.freshness === "mixed" ? copy.ui.contextMixed : context.freshness === "stale" ? copy.ui.contextStale : copy.ui.contextUnknown;
  const heroImage = heroDataUri();
  const fixedStatusHero = noWriteStatuses.has(viewModel.status);
  const heroHeadline = needsCity ? copy.ui.cityHeadline : contextBlocked ? copy.ui.contextHeadline : fixedStatusHero ? statusTitle : summary.headline;
  const heroWhy = needsCity || contextBlocked || fixedStatusHero ? statusDetail : summary.why;
  const planBody = needsCity
    ? `<div class="clarification-card"><span class="clarification-kicker">${text(copy.ui.next, undefined, copy)}</span><h3>${text(copy.ui.clarificationHeadline, undefined, copy)}</h3><p>${text(copy.ui.clarificationBody, undefined, copy)}</p><span class="clarification-note">${text(copy.ui.clarificationNote, undefined, copy)}</span></div>`
    : contextBlocked
      ? `<div class="clarification-card"><span class="clarification-kicker">${text(copy.ui.next, undefined, copy)}</span><h3>${text(copy.ui.contextHeadline, undefined, copy)}</h3><p>${text(copy.ui.contextBody, undefined, copy)}</p><span class="clarification-note">${text(copy.ui.contextNote, undefined, copy)}</span></div>`
    : recipeCard(recipe, false, copy, viewModel.status !== "clarification_required");
  const statusIcon = statusTone === "positive" ? iconSvg("check") : iconSvg("spark");
  const count = (value, kind) => countLabel(copy, value, kind);
  return `<!doctype html>
<html lang="${escapeHtml(copy.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${text(copy.title, undefined, copy)}</title>
<style>
*{box-sizing:border-box}
:root{color-scheme:light;--canvas:#f3f4ef;--paper:#fcfcf8;--paper-strong:#ffffff;--ink:#18211d;--muted:#728078;--line:#d9dfd9;--accent:#e8774f;--accent-soft:#fff0e8;--mint:#5d9e88;--mint-soft:#e4f0ea;--stage:#dfe9e0;--stage-deep:#b7cdbd;--shadow:0 22px 70px rgba(30,48,39,.09)}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--canvas:#101613;--paper:#16221c;--paper-strong:#1a2922;--ink:#edf3ed;--muted:#9aaba0;--line:#2b3932;--accent:#f19a6d;--accent-soft:#3a2821;--mint:#83c9ad;--mint-soft:#1f382f;--stage:#1c2d25;--stage-deep:#2f4b3d;--shadow:0 24px 76px rgba(0,0,0,.24)}}
html{background:var(--canvas)}
body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.58 "Avenir Next","SF Pro Text","PingFang SC","Noto Sans CJK SC",sans-serif;letter-spacing:0}
.shell{max-width:1180px;margin:0 auto;padding:26px 46px 80px}
.masthead{padding:4px 0 48px;border-bottom:1px solid var(--line)}
.topline{display:flex;align-items:center;justify-content:space-between;gap:18px;color:var(--muted);font-size:11px;letter-spacing:0;text-transform:uppercase}
.brand-mark{display:inline-flex;align-items:center;gap:10px;color:var(--ink);font-weight:750}.brand-mark:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 5px var(--accent-soft)}
.status-pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:8px 12px;background:var(--paper);color:var(--ink);letter-spacing:0;text-transform:none;box-shadow:0 8px 26px rgba(30,48,39,.05)}
.status-pill .state-dot{margin:0;width:7px;height:7px}.status-pill.positive .state-dot{background:var(--mint)}.status-pill.caution .state-dot{background:var(--accent)}.status-pill.neutral .state-dot{background:var(--muted)}.status-glyph{display:inline-flex;width:15px;height:15px;color:var(--mint)}.status-pill.caution .status-glyph{color:var(--accent)}.status-pill.neutral .status-glyph{color:var(--muted)}.status-glyph svg{display:block;width:100%;height:100%}
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(330px,.72fr);gap:58px;align-items:end;margin-top:54px}.hero-copy,.hero-stage{min-width:0}.hero-copy{animation:reveal-in .8s cubic-bezier(.2,.8,.2,1) both}.hero-stage{animation:reveal-in .9s .12s cubic-bezier(.2,.8,.2,1) both}
.hero-kicker,.eyebrow{color:var(--mint);font-size:11px;font-weight:800;letter-spacing:0;text-transform:uppercase}.hero-kicker{margin:0 0 20px}.hero h1{font-size:74px;line-height:.98;letter-spacing:0;font-weight:700;margin:0;max-width:680px}.hero-why{font-size:19px;color:var(--muted);max-width:570px;margin:26px 0 0}.hero-meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--muted);font-size:13px;margin-top:28px}.hero-meta span{display:inline-flex;align-items:center;gap:7px}.hero-meta span:before{content:"";width:4px;height:4px;border-radius:50%;background:var(--accent)}
.hero-stage{min-height:344px;border:1px solid var(--line);border-radius:34px;background:var(--stage);position:relative;overflow:hidden;box-shadow:var(--shadow)}.stage-frame{position:absolute;inset:24px;border:1px solid rgba(24,33,29,.16);border-radius:24px;overflow:hidden}.stage-frame:before,.stage-frame:after{content:"";position:absolute;top:0;bottom:0;width:1px;background:rgba(24,33,29,.16)}.stage-frame:before{left:33%}.stage-frame:after{left:66%}.stage-horizon{position:absolute;left:8%;right:8%;bottom:22%;height:1px;background:rgba(24,33,29,.2)}.stage-beam{position:absolute;bottom:-12%;width:15%;height:88%;background:var(--accent);opacity:.32;transform:skewX(-12deg);animation:beam-breathe 4.8s cubic-bezier(.25,.8,.25,1) infinite}.stage-beam:nth-child(1){left:19%;animation-delay:-1.4s}.stage-beam:nth-child(2){left:42%;height:74%;background:var(--mint);opacity:.28;animation-delay:-3.1s}.stage-beam:nth-child(3){left:63%;height:96%;background:var(--accent);opacity:.19;animation-delay:-.6s}.stage-sweep{position:absolute;top:-30%;right:9%;width:24%;height:150%;border-left:1px solid rgba(255,255,255,.72);border-right:1px solid rgba(255,255,255,.3);transform:rotate(17deg);animation:sweep 7s cubic-bezier(.2,.7,.2,1) infinite}.stage-caption{position:absolute;left:28px;right:28px;bottom:25px;display:flex;justify-content:space-between;gap:12px;color:var(--ink);font-size:12px}.stage-caption strong{font-weight:650}.stage-caption span{color:var(--muted)}
.env-rail{display:grid;grid-template-columns:1.1fr 1fr 1.2fr 1fr;border-bottom:1px solid var(--line);animation:reveal-in .8s .2s cubic-bezier(.2,.8,.2,1) both}.env-item{padding:22px 18px 21px;border-right:1px solid var(--line);min-width:0}.env-item:first-child{padding-left:0}.env-item:last-child{border-right:0;padding-right:0}.env-label{display:block;color:var(--muted);font-size:11px;letter-spacing:0;text-transform:uppercase}.env-value{display:block;margin-top:7px;font-size:20px;line-height:1.12;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.env-sub{display:block;color:var(--muted);font-size:12px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.main-grid{display:grid}.band{padding:54px 0;border-bottom:1px solid var(--line);animation:reveal-in .7s cubic-bezier(.2,.8,.2,1) both}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:22px;margin-bottom:24px}.section-heading h2{font-size:34px;line-height:1.02;letter-spacing:0;font-weight:680;margin:5px 0 0}.section-heading>p{color:var(--muted);font-size:13px;margin:0;text-align:right}.story-layout{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(250px,.92fr);gap:26px;align-items:stretch}.feature-panel{border:1px solid var(--line);border-radius:28px;background:var(--paper);padding:30px 32px;border-left:4px solid var(--accent);box-shadow:var(--shadow)}.recipe-top{display:flex;justify-content:space-between;align-items:center;gap:12px}.recipe-priority{color:var(--accent);font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0}.selected-mark{color:var(--mint);font-size:12px}.recipe h3{font-size:32px;line-height:1.04;letter-spacing:0;margin:17px 0 12px}.recipe p{margin:8px 0}.recipe-principle{font-size:18px}.recipe-boundary{border-top:1px solid var(--line);color:var(--muted);font-size:13px;padding-top:15px;margin-top:22px}.principles{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}.principle{border:1px solid var(--line);border-radius:999px;padding:5px 10px;color:var(--muted);font-size:12px}.story-metrics{list-style:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin:0;padding:0;background:var(--line);border:1px solid var(--line);border-radius:24px;overflow:hidden}.metric{background:var(--paper);padding:24px 22px;min-height:132px}.metric:nth-child(1),.metric:nth-child(4){background:var(--accent-soft)}.metric:nth-child(2){background:var(--mint-soft)}.metric-label{display:block;color:var(--muted);font-size:12px}.metric-value{display:block;margin-top:13px;font-size:19px;line-height:1.2;font-weight:650}.metric-note{display:block;color:var(--muted);font-size:12px;margin-top:7px}
.change-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.change-item{border:1px solid var(--line);border-radius:20px;background:var(--paper);padding:20px;transition:transform .5s cubic-bezier(.2,.8,.2,1),box-shadow .5s cubic-bezier(.2,.8,.2,1)}.change-item:hover{transform:translateY(-4px);box-shadow:var(--shadow)}.change-heading,.target-heading{display:flex;align-items:center;gap:8px}.change-mark{width:8px;height:8px;border-radius:50%;background:var(--accent);flex:0 0 auto}.change-kind,.target-state{margin-left:auto;color:var(--muted);font-size:12px}.change-item p{margin:11px 0 0}.change-item small{display:block;color:var(--muted);margin-top:9px}
.fold{border:1px solid var(--line);border-radius:22px;background:var(--paper);overflow:hidden;transition:box-shadow .5s cubic-bezier(.2,.8,.2,1)}.fold:hover{box-shadow:0 16px 45px rgba(30,48,39,.06)}.fold + .fold{margin-top:12px}.fold summary{cursor:pointer;list-style:none;padding:22px 24px;display:flex;align-items:center;gap:12px;font-weight:650;outline:none}.fold summary::-webkit-details-marker{display:none}.fold summary:after{content:"+";margin-left:auto;color:var(--mint);font-size:21px;font-weight:400;line-height:1;transition:transform .5s cubic-bezier(.2,.8,.2,1)}.fold[open] summary:after{content:"−";transform:rotate(180deg)}.fold summary:focus-visible{box-shadow:inset 0 0 0 2px var(--mint-soft)}.fold summary:hover{background:var(--mint-soft)}.summary-count{color:var(--muted);font-size:12px;font-weight:500}.fold-body{padding:0 24px 24px;border-top:1px solid var(--line)}.target-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding-top:18px}.target-row{border:1px solid var(--line);border-radius:16px;background:var(--paper-strong);padding:16px}.target-row.is-changed{border-color:var(--accent);background:var(--accent-soft)}.target-row.is-preserved .state-dot{background:var(--mint)}.target-row.is-changed .state-dot{background:var(--accent)}.target-row.is-muted .state-dot{background:var(--muted)}.target-area,.target-note{color:var(--muted);font-size:12px;margin:6px 0 0}.target-values{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:9px;margin-top:14px;font-size:13px}.target-values span:not(.value-arrow){min-width:0}.target-values small{display:block;color:var(--muted);font-size:11px;margin-bottom:3px}.value-arrow{color:var(--accent);padding-bottom:1px}.evidence-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding-top:18px}.evidence-card{border:1px solid var(--line);border-radius:17px;background:var(--paper-strong);padding:18px}.evidence-card h3{font-size:16px;margin:0 0 10px}.signal-list,.timeline,.plain-list{list-style:none;margin:0;padding:0}.signal-list{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:13px;overflow:hidden}.signal-list li{background:var(--paper-strong);padding:11px 13px;display:grid;grid-template-columns:1fr auto;gap:2px 10px}.signal-list strong{color:var(--accent);font-weight:650}.signal-list small{grid-column:1/-1;color:var(--muted);font-size:11px}.timeline{border-left:1px solid var(--line);padding:4px 0 0 20px;display:grid;gap:17px}.timeline li{display:grid;grid-template-columns:76px 1fr auto;gap:12px;position:relative}.timeline li:before{content:"";position:absolute;left:-25px;top:7px;width:7px;height:7px;background:var(--accent);border-radius:50%;box-shadow:0 0 0 4px var(--accent-soft)}.timeline-time,.timeline-kind{color:var(--muted);font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}.timeline p{color:var(--muted);font-size:13px;margin:5px 0 0}.idea-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line);padding-top:18px}.idea-grid .recipe{background:var(--paper-strong);padding:18px;min-height:154px}.idea-grid .recipe.selected{background:var(--mint-soft);box-shadow:inset 3px 0 var(--accent)}.idea-grid .recipe h3{font-size:18px}.idea-grid .recipe p{font-size:13px;color:var(--muted)}.footer-note{color:var(--muted);font-size:13px;max-width:760px}.footer-note strong{color:var(--ink)}.empty{color:var(--muted)}.muted{color:var(--muted)}
@keyframes reveal-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}@keyframes beam-breathe{0%,100%{transform:skewX(-12deg) translateY(3%);opacity:.18}50%{transform:skewX(-12deg) translateY(-4%);opacity:.36}}@keyframes sweep{0%,100%{transform:rotate(17deg) translateX(-18px);opacity:.18}50%{transform:rotate(17deg) translateX(24px);opacity:.48}}
@media(max-width:900px){.shell{padding-left:28px;padding-right:28px}.hero{grid-template-columns:1fr;gap:28px}.hero-stage{min-height:280px}.story-layout{grid-template-columns:1fr}.change-list{grid-template-columns:repeat(2,minmax(0,1fr))}.idea-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:620px){.shell{padding:18px 16px 54px}.masthead{padding-bottom:34px}.topline{align-items:flex-start;flex-wrap:wrap;letter-spacing:0}.status-pill{padding:7px 10px;max-width:100%;min-width:0}.hero{margin-top:36px;gap:24px}.hero h1{max-width:100%;font-size:48px;letter-spacing:0;overflow-wrap:anywhere}.hero-why{font-size:17px;margin-top:20px}.hero-meta{display:grid;gap:7px;margin-top:22px}.hero-stage{min-height:238px;border-radius:24px}.stage-frame{inset:16px;border-radius:17px}.stage-caption{left:19px;right:19px;bottom:17px}.env-rail{grid-template-columns:repeat(2,minmax(0,1fr))}.env-item,.env-item:first-child,.env-item:last-child{padding:17px 10px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.env-item:nth-child(2n){border-right:0}.env-item:nth-last-child(-n+2){border-bottom:0}.env-value{font-size:18px}.band{padding:38px 0}.section-heading{display:block;margin-bottom:18px}.section-heading>p{text-align:left;margin-top:8px}.section-heading h2{font-size:30px}.feature-panel{padding:22px 20px;border-radius:22px}.recipe h3{font-size:27px}.story-metrics{border-radius:18px}.metric{min-height:112px;padding:19px 16px}.metric-value{font-size:17px}.change-list,.target-grid,.evidence-grid,.idea-grid{grid-template-columns:1fr}.change-item{padding:17px}.fold summary{padding:18px}.fold-body{padding:0 15px 16px}.timeline li{grid-template-columns:62px 1fr}.timeline-kind{grid-column:2}.target-values{font-size:12px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
.hero{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:66px;align-items:center;margin-top:42px}.hero h1{font-size:68px;line-height:1.02;letter-spacing:0;max-width:620px}.hero-why{max-width:500px;font-size:18px;line-height:1.65}.hero-visual{min-height:420px;margin:0;border:1px solid var(--line);border-radius:30px;overflow:hidden;background:#dfe5ea;box-shadow:0 26px 70px rgba(58,72,88,.16);animation:reveal-in .9s .12s cubic-bezier(.2,.8,.2,1) both}.hero-visual img{display:block;width:100%;height:100%;min-height:420px;object-fit:cover;transform:scale(1.01);transition:transform .9s cubic-bezier(.2,.8,.2,1)}.hero-visual:hover img{transform:scale(1.035)}
.env-rail{grid-template-columns:repeat(5,minmax(0,1fr));margin:0 0 4px;padding:0 12px;border:1px solid var(--line);border-radius:18px;background:var(--paper);box-shadow:0 15px 45px rgba(58,72,88,.08)}.env-item{padding:19px 18px 18px}.env-item:first-child{padding-left:14px}.env-item:last-child{padding-right:14px}.env-label{font-size:10px;letter-spacing:0}.env-head{display:flex;align-items:center;gap:7px}.env-icon{font-size:17px;line-height:1}.env-value{font-size:17px}.env-sub{font-size:11px}
.showcase-band{padding-top:26px}.showcase-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.85fr);gap:14px}.showcase-card{min-width:0;border:1px solid var(--line);border-radius:23px;background:var(--paper);box-shadow:0 18px 50px rgba(58,72,88,.07);padding:24px}.showcase-card h2{font-size:21px;letter-spacing:0;margin:0 0 18px}.showcase-card .section-note{margin:0 0 19px;color:var(--muted);font-size:13px}.plan-card{padding:27px 28px;border-top:3px solid var(--accent)}.plan-card .recipe h3{font-size:29px;margin-top:16px}.plan-card .recipe-principle{font-size:17px}.plan-card .recipe-boundary{margin-top:18px}.plan-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin-top:24px;border-top:1px solid var(--line)}.plan-stat{min-width:0;padding:16px 13px 0;border-right:1px solid var(--line)}.plan-stat:first-child{padding-left:0}.plan-stat:last-child{border-right:0;padding-right:0}.plan-stat small{display:block;color:var(--muted);font-size:11px}.plan-stat strong{display:block;margin-top:7px;color:var(--accent);font-size:18px;line-height:1.15}.story-card .change-list{grid-template-columns:1fr;gap:10px}.story-card .change-item{padding:15px;border-radius:15px;background:var(--paper-strong);box-shadow:none}.story-card .change-item p{font-size:13px;line-height:1.45}.story-card .change-item small{font-size:11px}.clarification-card{padding:8px 0 2px}.clarification-kicker{display:inline-block;color:var(--accent);font-size:11px;font-weight:800;letter-spacing:0;text-transform:uppercase}.clarification-card h3{font-size:26px;line-height:1.15;letter-spacing:0;margin:15px 0 12px}.clarification-card p{color:var(--muted);font-size:15px;line-height:1.7;margin:0}.clarification-note{display:block;color:var(--mint);font-size:12px;margin-top:24px}.fold-band{padding:14px 0 0}.fold-band .fold{border-radius:17px;background:var(--paper);box-shadow:none}.fold-band .fold + .fold{margin-top:10px}.fold-band .fold summary{padding:19px 22px}.fold-band .fold-body{padding-bottom:20px}.catalog-band{padding-top:35px}.catalog-band .section-heading{margin-bottom:12px}.catalog-band .fold{margin-top:0}.catalog-band .idea-grid{padding-top:0}.footer-band{padding-top:30px;border-bottom:0}
.summary-hint{color:var(--muted);font-size:12px;font-weight:500}
@media(max-width:1050px){.hero{gap:38px}}
@media(max-width:900px){.hero{grid-template-columns:1fr;gap:28px}.hero-visual,.hero-visual img{min-height:330px}.showcase-grid{grid-template-columns:1fr}.env-rail{grid-template-columns:repeat(5,minmax(145px,1fr));overflow:auto}.env-item{border-right:1px solid var(--line)}}
@media(max-width:620px){.shell{padding:18px 16px 54px}.masthead{padding-bottom:30px}.topline{align-items:flex-start;flex-wrap:wrap;letter-spacing:0}.status-pill{padding:7px 10px;max-width:100%;min-width:0}.hero{margin-top:34px;gap:22px}.hero h1{max-width:100%;font-size:47px;letter-spacing:0;overflow-wrap:anywhere}.hero-why{font-size:16px;margin-top:18px}.hero-meta{display:grid;gap:7px;margin-top:20px}.hero-visual,.hero-visual img{min-height:250px;border-radius:23px}.env-rail{grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible;padding:0}.env-item,.env-item:first-child,.env-item:last-child{padding:16px 12px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.env-item:nth-child(2n){border-right:0}.env-item:nth-last-child(-n+2){border-bottom:0}.env-value{font-size:17px}.env-sub{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere}.showcase-band{padding-top:22px}.showcase-grid{grid-template-columns:1fr;gap:10px}.plan-card{grid-column:auto;padding:22px 20px}.plan-card .recipe h3{font-size:26px}.plan-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.plan-stat:nth-child(2){border-right:0}.plan-stat:nth-child(-n+2){border-bottom:1px solid var(--line);padding-bottom:14px}.plan-stat:nth-child(n+3){padding-top:14px}.plan-stat:nth-child(3){padding-left:0}.plan-stat:nth-child(4){padding-right:0}.showcase-card{padding:20px}.story-card .change-list{grid-template-columns:1fr}.fold-band{padding-top:10px}.fold summary{padding:17px 18px}.summary-hint{display:none}.fold-body{padding:0 14px 16px}.catalog-band{padding-top:28px}.catalog-band .section-heading{display:flex}.catalog-band .section-heading>p{text-align:right;margin-top:0}.idea-grid{grid-template-columns:1fr}.footer-band{padding-top:24px}.section-heading{display:block;margin-bottom:16px}.section-heading>p{text-align:left;margin-top:7px}.section-heading h2{font-size:29px}.target-values{font-size:12px}}
</style>
</head>
<body><div class="shell" data-ready="true">
<header class="masthead"><div class="topline"><span class="brand-mark">${text(copy.brand)}</span><span class="status-pill ${statusTone}" data-status="${text(viewModel.status)}"><span class="status-glyph">${statusIcon}</span><span>${text(statusTitle)}</span></span></div><div class="hero"><div class="hero-copy"><p class="hero-kicker">${text(location.localDate)} · ${text(city)}</p><h1>${text(heroHeadline)}</h1><p class="hero-why">${text(heroWhy)}</p><div class="hero-meta"><span>${text(viewModel.homeLabel, copy.title)}</span><span>${text(viewModel.trigger.label)}</span></div></div><figure class="hero-visual" data-hero-asset="wellness-hero-v2"><img src="${heroImage}" alt="${text(copy.ui.heroAlt)}" width="1536" height="1024"></figure></div></header>
<main class="main-grid">
<section class="env-rail" aria-label="${text(copy.ui.reportContext)}"><div class="env-item"><div class="env-head"><span class="env-icon" aria-hidden="true">${iconSvg("pin")}</span><span class="env-label">${text(copy.ui.location)}</span></div><strong class="env-value">${text(city)}</strong><span class="env-sub">${text(location.region, copy.ui.regionMissing, copy)}</span></div><div class="env-item"><div class="env-head"><span class="env-icon" aria-hidden="true">${iconSvg("clock")}</span><span class="env-label">${text(copy.ui.now)}</span></div><strong class="env-value">${text(localTime)}</strong><span class="env-sub">${text(timezone)}</span></div><div class="env-item"><div class="env-head"><span class="env-icon" aria-hidden="true">${iconSvg("cloud")}</span><span class="env-label">${text(copy.ui.weather)}</span></div><strong class="env-value">${weatherSummary}</strong><span class="env-sub">${text(weatherFreshness)} · ${weather?.source ? text(weather.source, undefined, copy) : text(copy.ui.sourceMissing, undefined, copy)}</span></div><div class="env-item"><div class="env-head"><span class="env-icon" aria-hidden="true">${iconSvg("sun")}</span><span class="env-label">${text(copy.ui.daylight)}</span></div><strong class="env-value">${sunWindow}</strong><span class="env-sub">${text(contextNote, undefined, copy)}</span></div><div class="env-item"><div class="env-head"><span class="env-icon" aria-hidden="true">${iconSvg("bulb")}</span><span class="env-label">${text(copy.ui.currentStatus)}</span></div><strong class="env-value">${needsCity || contextBlocked ? text(copy.ui.strategyWaiting, undefined, copy) : text(recipe.title, undefined, copy)}</strong><span class="env-sub">${needsCity ? text(copy.ui.strategyAfterCity, undefined, copy) : contextBlocked ? text(copy.ui.contextNote, undefined, copy) : text(contextFreshness, undefined, copy)}</span></div></section>
<section class="band showcase-band"><div class="showcase-grid"><article class="showcase-card plan-card"><h2>${text(copy.ui.planTitle, undefined, copy)}</h2><p class="section-note">${needsCity || contextBlocked ? text(copy.ui.planNeedsCity, undefined, copy) : text(contextFreshness, undefined, copy)}</p>${planBody}<div class="plan-stats"><div class="plan-stat"><small>${text(copy.ui.stats.changed, undefined, copy)}</small><strong>${count(changedCount, "targets")}</strong></div><div class="plan-stat"><small>${text(copy.ui.stats.online, undefined, copy)}</small><strong>${onlineCount} / ${targets.length}</strong></div><div class="plan-stat"><small>${text(copy.ui.stats.steady, undefined, copy)}</small><strong>${count(steadyCount, "targets")}</strong></div><div class="plan-stat"><small>${text(copy.ui.stats.attention, undefined, copy)}</small><strong>${count(attentionCount, "targets")}</strong></div></div></article><article class="showcase-card story-card"><h2>${text(copy.ui.storyTitle, undefined, copy)}</h2><p class="section-note">${text(copy.ui.storyNote, undefined, copy)}</p>${changes.length ? `<div class="change-list">${changes.map((item) => renderChange(item, copy)).join("")}</div>` : `<p class="empty">${text(copy.ui.noChanges, undefined, copy)}</p>`}</article></div></section>
<section class="fold-band"><details class="fold"><summary><span aria-hidden="true">${iconSvg("home")}</span>${text(copy.ui.homeSummary, undefined, copy)} <span class="summary-count">${count(targets.length, "targets")}</span><span class="summary-hint">${text(copy.ui.homeHint, undefined, copy)}</span></summary><div class="fold-body">${targets.length ? `<div class="target-grid">${targets.map((item) => renderTarget(item, copy)).join("")}</div>` : `<p class="empty">${text(copy.ui.noTargets, undefined, copy)}</p>`}</div></details><details class="fold"><summary><span aria-hidden="true">${iconSvg("compass")}</span>${text(copy.ui.evidenceSummary, undefined, copy)} <span class="summary-count">${count(sourceCount, "signals")}</span><span class="summary-hint">${text(hasPrinciples ? copy.ui.evidenceHint : copy.ui.evidenceHintNoPreferences, undefined, copy)}</span></summary><div class="fold-body"><div class="evidence-grid"><article class="evidence-card"><h3>${text(copy.ui.triggerTitle, undefined, copy)}</h3><p>${text(viewModel.trigger.label, undefined, copy)}</p>${viewModel.trigger.source ? `<p class="meta">${text(copy.ui.source, undefined, copy)}: ${text(viewModel.trigger.source, undefined, copy)}</p>` : ""}${viewModel.trigger.window ? `<p class="meta">${text(copy.ui.window, undefined, copy)}: ${text(viewModel.trigger.window, undefined, copy)}</p>` : ""}<ul class="signal-list">${signals.length ? signals.map((item) => renderSignal(item, copy)).join("") : `<li><span>${text(copy.ui.noSignals, undefined, copy)}</span><small>${text(copy.ui.noGuess, undefined, copy)}</small></li>`}</ul></article><article class="evidence-card">${hasPrinciples ? `<h3>${text(copy.ui.principlesTitle, undefined, copy)}</h3><div class="principles">${principles.map((item) => `<span class="principle">${text(item, undefined, copy)}</span>`).join("")}</div>` : ""}<h3>${text(copy.ui.unknownTitle, undefined, copy)}</h3>${renderFactList(context.unknown, copy)}<h3>${text(copy.ui.staleTitle, undefined, copy)}</h3>${renderFactList(context.stale, copy)}</article></div></div></details></section>
${ideas.length ? `<section class="band catalog-band"><div class="section-heading"><div><p class="eyebrow">${text(copy.ui.catalogEyebrow, undefined, copy)}</p><h2>${text(copy.ui.catalogTitle, undefined, copy)}</h2></div><p>${count(ideas.length, "ideas")} · ${text(copy.ui.defaultCollapsed, undefined, copy)}</p></div><details class="fold"><summary><span aria-hidden="true">${iconSvg("bulb")}</span>${text(copy.ui.catalogSummary, undefined, copy)} <span class="summary-count">${count(ideas.length, "ideas")}</span></summary><div class="fold-body"><div class="idea-grid">${ideas.map((item) => recipeCard(item, true, copy, !needsCity && !contextBlocked && viewModel.status !== "clarification_required")).join("")}</div></div></details></section>` : ""}
</main></div></body></html>`;
}

function defaultReportRoot() {
  return process.env.YEELIGHT_WELLNESS_REPORT_ROOT
    ? path.resolve(process.env.YEELIGHT_WELLNESS_REPORT_ROOT)
    : path.join(os.tmpdir(), "yeelight-wellness-reports");
}

function ensurePrivateRoot(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  if (!fs.existsSync(resolvedRoot)) fs.mkdirSync(resolvedRoot, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(resolvedRoot);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("report root must be a real directory");
  if ((stat.mode & 0o077) !== 0) throw new Error("report root must be private");
  return resolvedRoot;
}

function assertSafeOutputPath(outputPath, rootDir) {
  if (!path.isAbsolute(outputPath) || outputPath.split(path.sep).includes("..")) throw new Error("output path must be absolute and must not contain traversal segments");
  const resolvedRoot = ensurePrivateRoot(rootDir);
  const resolvedOutput = path.resolve(outputPath);
  if (path.extname(resolvedOutput).toLowerCase() !== ".html") throw new Error("output file must use the .html extension");
  const relativeOutput = path.relative(resolvedRoot, resolvedOutput);
  if (!relativeOutput || relativeOutput.startsWith(`..${path.sep}`) || relativeOutput === ".." || path.isAbsolute(relativeOutput)) {
    throw new Error("output path must remain inside the private report root");
  }
  const parent = path.dirname(resolvedOutput);
  if (!fs.existsSync(parent)) throw new Error("output directory does not exist");
  const lexicalParent = path.resolve(parent);
  const tempRoot = path.resolve(os.tmpdir());
  const isSystemTempPath = lexicalParent === tempRoot || lexicalParent.startsWith(`${tempRoot}${path.sep}`);
  let current = path.parse(parent).root;
  for (const part of parent.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const withinSystemAlias = isSystemTempPath && (current === tempRoot || tempRoot.startsWith(`${current}${path.sep}`));
    if (!withinSystemAlias && fs.lstatSync(current).isSymbolicLink()) throw new Error("output path may not traverse a symlink");
  }
  if (fs.existsSync(resolvedOutput) && fs.lstatSync(resolvedOutput).isSymbolicLink()) throw new Error("output path may not be a symlink");
  return resolvedOutput;
}

export function writePrivateReport(outputPath, html, { force = false, rootDir = defaultReportRoot() } = {}) {
  const safeOutputPath = assertSafeOutputPath(outputPath, rootDir);
  if (fs.existsSync(safeOutputPath) && !force) throw new Error("output file already exists; pass --force to replace it");
  const tempPath = path.join(path.dirname(safeOutputPath), `.${path.basename(safeOutputPath)}.${randomUUID()}.tmp`);
  const descriptor = fs.openSync(tempPath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, html, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    if (force) fs.renameSync(tempPath, safeOutputPath);
    else fs.linkSync(tempPath, safeOutputPath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
  fs.chmodSync(safeOutputPath, 0o600);
  return safeOutputPath;
}

function openReport(outputPath) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open";
  const commandArgs = [outputPath];
  const result = spawnSync(command, commandArgs, { stdio: "ignore" });
  if (result.error || result.status !== 0) throw new Error("unable to open report in this host");
}

function parseArgs(argv) {
  const options = { force: false, open: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force") options.force = true;
    else if (argument === "--open") options.open = true;
    else if (["--input", "--output"].includes(argument)) options[argument.slice(2)] = argv[++index];
    else throw new Error("unknown argument");
  }
  if (!options.output) throw new Error("--output is required");
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const input = options.input ? fs.readFileSync(options.input, "utf8") : fs.readFileSync(0, "utf8");
    const viewModel = JSON.parse(input);
    const output = writePrivateReport(options.output, renderReport(viewModel), { ...options, rootDir: defaultReportRoot() });
    let opened = false;
    let openError;
    if (options.open) {
      try {
        openReport(output);
        opened = true;
      } catch (error) {
        openError = error.message;
      }
    }
    process.stdout.write(`${JSON.stringify({ ok: true, status: viewModel.status, outputPath: output, opened, ...(openError ? { openError } : {}) })}\n`);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "wellness report renderer failed";
    const code = rawMessage.startsWith("invalid wellness report ViewModel")
      ? "invalid_view_model"
      : rawMessage.startsWith("unknown argument") || rawMessage.startsWith("--output is required")
        ? "invalid_arguments"
        : "renderer_error";
    const message = code === "renderer_error"
      ? "wellness report renderer failed"
      : code === "invalid_view_model"
        ? "invalid wellness report ViewModel"
        : rawMessage;
    process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message } })}\n`);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
