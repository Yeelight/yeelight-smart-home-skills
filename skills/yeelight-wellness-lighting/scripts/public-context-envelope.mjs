import fs from "node:fs";

const schema = JSON.parse(fs.readFileSync(
  new URL("../assets/schemas/public-context.schema.json", import.meta.url),
  "utf8",
));

const MAX_WEATHER_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_ALERT_AGE_MS = 30 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const TOP_LEVEL_FIELDS = new Set(["schemaVersion", "location", "retrievedAt", "sources", "facts", "unknown", "stale"]);
const LOCATION_FIELDS = new Set(["city", "region", "timezone", "holidayRegion"]);
const SOURCE_FIELDS = new Set(["id", "kind", "retrievedAt", "expiresAt", "authority", "issuedAt", "effectiveAt", "area"]);
const FACT_FIELDS = new Set(["value", "unit", "sourceId", "observedAt", "forecastFor", "timezone", "freshness"]);
const ALERT_FACT_FIELDS = new Set(["value", "sourceId", "timezone", "freshness", "authority", "area", "issuedAt", "effectiveAt", "expiresAt"]);
const SOURCE_KINDS = new Set(["weather", "air-quality", "solar", "timezone", "calendar", "holiday", "alert", "cultural", "moon", "user-fact"]);
const FACT_SCHEMAS = schema.properties.facts.properties;

// 事实来源类型是自动执行门禁的一部分；user-fact 只能留在用户偏好层，不能伪装成公共事实。
export const PUBLIC_FACT_SOURCE_KINDS = Object.freeze({
  temperature: ["weather"],
  apparentTemperature: ["weather"],
  cloudCover: ["weather"],
  visibility: ["weather"],
  precipitation: ["weather"],
  precipitationProbability: ["weather"],
  wind: ["weather"],
  humidity: ["weather"],
  weatherCode: ["weather"],
  condition: ["weather"],
  precipitationTransition: ["weather"],
  dayLength: ["solar"],
  uvIndex: ["weather", "solar"],
  solarElevation: ["solar"],
  sunrise: ["solar"],
  sunset: ["solar"],
  solarNoon: ["solar"],
  civilTwilight: ["solar"],
  nauticalTwilight: ["solar"],
  astronomicalTwilight: ["solar"],
  goldenHour: ["solar"],
  blueHour: ["solar"],
  daylightTrend: ["solar"],
  timezoneOffset: ["timezone"],
  dstFold: ["timezone"],
  dstTransition: ["timezone"],
  localDate: ["calendar"],
  localTime: ["calendar"],
  weekday: ["calendar"],
  weekend: ["calendar"],
  season: ["calendar"],
  solstice: ["calendar", "solar"],
  legalHoliday: ["holiday"],
  workday: ["holiday"],
  holidayAdjacency: ["holiday"],
  pm2_5: ["air-quality"],
  pm10: ["air-quality"],
  aqi: ["air-quality"],
  dust: ["air-quality"],
  smoke: ["air-quality"],
  haze: ["air-quality"],
  authorityAlert: ["alert"],
  culturalObservance: ["cultural"],
  moonPhase: ["moon"],
});

function invalid() {
  throw new Error("host_context_invalid");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return isObject(value) && Object.hasOwn(value, key);
}

function isValidCalendarDate(year, month, day) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export function isStrictIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, zone, offsetHour = "0", offsetMinute = "0"] = match;
  if (!isValidCalendarDate(Number(year), Number(month), Number(day))) return false;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return false;
  if (zone !== "Z" && (Number(offsetHour) > 14 || Number(offsetMinute) > 59 || (Number(offsetHour) === 14 && Number(offsetMinute) !== 0))) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function isStrictIsoDate(value) {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return Boolean(match) && isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function isIanaTimezone(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)+$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isSafeLabel(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    && value.trim() === value
    && !/[\r\n<>;&|$(){}\x60]/.test(value)
    && !/^(?:https?|file|data|javascript):/i.test(value);
}

function isAlertArea(area) {
  return isObject(area)
    && Object.keys(area).every((key) => key === "city" || key === "region")
    && isSafeLabel(area.city, 80)
    && (area.region === undefined || isSafeLabel(area.region, 40));
}

function sameArea(left, right) {
  return isAlertArea(left) && isAlertArea(right)
    && left.city === right.city && left.region === right.region;
}

function isTrustedAlert(fact, trustedAuthorities) {
  return trustedAuthorities.some((entry) => isObject(entry)
    && Object.keys(entry).every((key) => key === "authority" || key === "area")
    && isSafeLabel(entry.authority, 80)
    && entry.authority === fact.authority
    && sameArea(entry.area, fact.area));
}

function localParts(instant, timezone) {
  const values = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  if (values.hour === "24") values.hour = "00";
  return values;
}

function localDateFor(instant, timezone) {
  const parts = localParts(instant, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localTimeFor(instant, timezone) {
  const parts = localParts(instant, timezone);
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

function offsetMinutes(instant, timezone) {
  const parts = localParts(instant, timezone);
  const utc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((utc - instant.getTime()) / 60000);
}

function weekdayFor(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][day];
}

function validateFactValue(name, item) {
  const reference = FACT_SCHEMAS[name]?.$ref?.split("/").pop();
  const definition = schema.$defs?.[reference];
  if (name === "authorityAlert") {
    if (!definition?.properties?.value?.enum?.includes(item.value)) invalid();
    return;
  }
  const rule = definition?.allOf?.[1];
  const valueRule = rule?.properties?.value;
  if (!valueRule) invalid();
  const value = item.value;
  if (valueRule.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) invalid();
  if (valueRule.type === "integer" && !Number.isInteger(value)) invalid();
  if (valueRule.type === "boolean" && typeof value !== "boolean") invalid();
  if (Array.isArray(valueRule.enum) && !valueRule.enum.includes(value)) invalid();
  if (valueRule.const !== undefined && value !== valueRule.const) invalid();
  if (typeof value === "number" && valueRule.minimum !== undefined && value < valueRule.minimum) invalid();
  if (typeof value === "number" && valueRule.maximum !== undefined && value > valueRule.maximum) invalid();
  if (valueRule.pattern && (typeof value !== "string" || !new RegExp(valueRule.pattern).test(value))) invalid();
  if (valueRule.format === "date-time" && !isStrictIsoTimestamp(value)) invalid();
  if (valueRule.format === "date" && !isStrictIsoDate(value)) invalid();
  const unitRule = rule?.properties?.unit;
  if (rule?.required?.includes("unit") && !hasOwn(item, "unit")) invalid();
  if (unitRule?.const !== undefined && item.unit !== unitRule.const) invalid();
  if (hasOwn(item, "unit") && (typeof item.unit !== "string" || item.unit.length > 24 || !/^[A-Za-z0-9%°_ -]{0,24}$/.test(item.unit))) invalid();
}

export function isAllowedFactSourceKind(name, kind) {
  return Array.isArray(PUBLIC_FACT_SOURCE_KINDS[name]) && PUBLIC_FACT_SOURCE_KINDS[name].includes(kind);
}

function factTimestamp(item) {
  return hasOwn(item, "issuedAt") ? item.issuedAt : (typeof item.observedAt === "string" ? item.observedAt : item.forecastFor);
}

function validateAlert(item, source, location, now, trustedAuthorities) {
  if (source.kind !== "alert" || !isSafeLabel(item.authority, 80) || !isAlertArea(item.area)) invalid();
  if (item.area.city !== location.city || (location.region && item.area.region !== location.region)) invalid();
  if (source.authority !== item.authority || !sameArea(source.area, item.area)) invalid();
  for (const key of ["issuedAt", "effectiveAt", "expiresAt"]) {
    if (!isStrictIsoTimestamp(item[key]) || source[key] !== item[key]) invalid();
  }
  const issuedAt = new Date(item.issuedAt);
  const effectiveAt = new Date(item.effectiveAt);
  const expiresAt = new Date(item.expiresAt);
  if (!(issuedAt <= effectiveAt && effectiveAt <= expiresAt)) invalid();
  return isTrustedAlert(item, trustedAuthorities);
}

function deriveFreshness(source, item, timezone, now, trustedAuthorities, location) {
  const retrievedAt = new Date(source.retrievedAt);
  const expiresAt = source.expiresAt === null ? null : new Date(source.expiresAt);
  if (retrievedAt.getTime() - now.getTime() > MAX_FUTURE_MS) return "unknown";
  const timestamp = factTimestamp(item);
  if (!isStrictIsoTimestamp(timestamp)) return "unknown";
  const factAt = new Date(timestamp);
  if (source.kind === "alert") {
    if (!validateAlert(item, source, location, now, trustedAuthorities)) return "unknown";
    const effectiveAt = new Date(item.effectiveAt);
    const alertExpiresAt = new Date(item.expiresAt);
    if (effectiveAt > now) return "unknown";
    if (alertExpiresAt <= now || now.getTime() - factAt.getTime() > MAX_ALERT_AGE_MS
      || now.getTime() - retrievedAt.getTime() > MAX_ALERT_AGE_MS) return "stale";
    return "fresh";
  }
  if (expiresAt && expiresAt <= now) return "stale";
  if (["weather", "air-quality"].includes(source.kind)) {
    if (factAt.getTime() - now.getTime() > MAX_FUTURE_MS) return "unknown";
    if (now.getTime() - retrievedAt.getTime() > MAX_WEATHER_AGE_MS || now.getTime() - factAt.getTime() > MAX_WEATHER_AGE_MS) return "stale";
    return "fresh";
  }
  const sameLocalDate = localDateFor(factAt, timezone) === localDateFor(now, timezone)
    && localDateFor(retrievedAt, timezone) === localDateFor(now, timezone);
  if (["solar", "calendar", "timezone", "holiday", "cultural", "moon"].includes(source.kind) && !sameLocalDate) return "stale";
  if (["calendar", "timezone", "holiday"].includes(source.kind) && factAt > now) return "unknown";
  return factAt.getTime() - now.getTime() > MAX_FUTURE_MS && source.kind !== "solar" ? "unknown" : "fresh";
}

function validateSource(entry, sourceById) {
  if (!isObject(entry) || Object.keys(entry).some((key) => !SOURCE_FIELDS.has(key))) invalid();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(entry.id) || sourceById.has(entry.id)) invalid();
  if (!SOURCE_KINDS.has(entry.kind) || !isStrictIsoTimestamp(entry.retrievedAt)) invalid();
  if (!(entry.expiresAt === null || isStrictIsoTimestamp(entry.expiresAt))) invalid();
  if (entry.expiresAt !== null && new Date(entry.expiresAt) <= new Date(entry.retrievedAt)) invalid();
  if (entry.kind === "alert") {
    if (!isSafeLabel(entry.authority, 80) || !isAlertArea(entry.area)) invalid();
    if (!isStrictIsoTimestamp(entry.issuedAt) || !isStrictIsoTimestamp(entry.effectiveAt) || entry.expiresAt === null) invalid();
  } else if (["authority", "issuedAt", "effectiveAt", "area"].some((key) => hasOwn(entry, key))) invalid();
  sourceById.set(entry.id, entry);
}

function validateIndex(values) {
  if (!Array.isArray(values) || values.length > 64) invalid();
  const result = new Set();
  for (const name of values) {
    if (typeof name !== "string" || !hasOwn(FACT_SCHEMAS, name) || result.has(name)) invalid();
    result.add(name);
  }
  return result;
}

function validateDerivedLocalFacts(context, now) {
  const timezone = context.location.timezone;
  const date = localDateFor(now, timezone);
  const expected = {
    localDate: date,
    localTime: localTimeFor(now, timezone),
    timezoneOffset: offsetMinutes(now, timezone),
    weekday: weekdayFor(date),
  };
  expected.weekend = ["saturday", "sunday"].includes(expected.weekday);
  for (const [name, value] of Object.entries(expected)) {
    if (context.facts[name]?.freshness === "fresh" && context.facts[name].value !== value) invalid();
  }
}

export function normalizeHostPublicContext({ context: rawContext, city, region, timezone, now, trustedAuthorities = [] }) {
  if (!isSafeLabel(city, 80) || (region !== undefined && !isSafeLabel(region, 40)) || !isIanaTimezone(timezone)) invalid();
  if (!(now instanceof Date) || Number.isNaN(now.getTime()) || !Array.isArray(trustedAuthorities)) invalid();
  let context;
  try {
    context = JSON.parse(JSON.stringify(rawContext));
  } catch {
    invalid();
  }
  if (!isObject(context) || Object.keys(context).some((key) => !TOP_LEVEL_FIELDS.has(key))) invalid();
  for (const key of TOP_LEVEL_FIELDS) if (!hasOwn(context, key)) invalid();
  if (context.schemaVersion !== "yeelight-wellness-context-v1" || !isStrictIsoTimestamp(context.retrievedAt)) invalid();
  if (new Date(context.retrievedAt).getTime() - now.getTime() > MAX_FUTURE_MS) invalid();
  if (!isObject(context.location) || Object.keys(context.location).some((key) => !LOCATION_FIELDS.has(key))) invalid();
  if (context.location.city !== city || context.location.region !== region || context.location.timezone !== timezone) invalid();
  if (context.location.holidayRegion !== undefined && !/^[A-Za-z0-9_-]{0,32}$/.test(context.location.holidayRegion)) invalid();
  if (!Array.isArray(context.sources) || context.sources.length < 1 || context.sources.length > 16 || !isObject(context.facts) || Object.keys(context.facts).length > 64) invalid();

  const sourceById = new Map();
  for (const entry of context.sources) validateSource(entry, sourceById);
  const declaredUnknown = validateIndex(context.unknown);
  const declaredStale = validateIndex(context.stale);
  for (const name of declaredUnknown) if (declaredStale.has(name)) invalid();
  context.unknown = [];
  context.stale = [];

  for (const [name, item] of Object.entries(context.facts)) {
    const fields = name === "authorityAlert" ? ALERT_FACT_FIELDS : FACT_FIELDS;
    if (!hasOwn(FACT_SCHEMAS, name) || !isObject(item) || Object.keys(item).some((key) => !fields.has(key))) invalid();
    for (const key of ["value", "sourceId", "timezone", "freshness"]) if (!hasOwn(item, key)) invalid();
    if (!sourceById.has(item.sourceId) || item.timezone !== timezone || !["fresh", "stale", "unknown"].includes(item.freshness)) invalid();
    const source = sourceById.get(item.sourceId);
    if (!isAllowedFactSourceKind(name, source.kind)) invalid();
    if (name !== "authorityAlert") {
      const observed = typeof item.observedAt === "string" && isStrictIsoTimestamp(item.observedAt);
      const forecast = typeof item.forecastFor === "string" && isStrictIsoTimestamp(item.forecastFor);
      if (!observed && !forecast) invalid();
      if (hasOwn(item, "observedAt") && item.observedAt !== null && !observed) invalid();
      if (hasOwn(item, "forecastFor") && item.forecastFor !== null && !forecast) invalid();
    }
    validateFactValue(name, item);
    const freshness = deriveFreshness(source, item, timezone, now, trustedAuthorities, context.location);
    if (freshness === "unknown") {
      delete context.facts[name];
      context.unknown.push(name);
    } else {
      item.freshness = freshness;
      if (freshness === "stale") context.stale.push(name);
    }
  }

  for (const name of declaredUnknown) {
    if (!hasOwn(context.facts, name) && !context.unknown.includes(name)) context.unknown.push(name);
  }
  for (const name of declaredStale) {
    if (!hasOwn(context.facts, name) && !context.unknown.includes(name) && !context.stale.includes(name)) context.stale.push(name);
  }
  validateDerivedLocalFacts(context, now);
  context.unknown.sort();
  context.stale.sort();
  return context;
}
