#!/usr/bin/env node

import { normalizeHostPublicContext } from "./public-context-envelope.mjs";

const GEOCODER_ORIGIN = "https://geocoding-api.open-meteo.com";
const FORECAST_ORIGIN = "https://api.open-meteo.com";
const OPENWEATHER_ORIGIN = "https://api.openweathermap.org";
const GEOCODER_PATH = "/v1/search";
const FORECAST_PATH = "/v1/forecast";
const OPENWEATHER_PATH = "/data/3.0/onecall";
const REQUEST_TIMEOUT_MS = 5000;
const TOTAL_TIMEOUT_MS = 15000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_WEATHER_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_WEATHER_FUTURE_MS = 5 * 60 * 1000;
const MAX_PROVIDER_COORDINATE_DRIFT = 0.25;
const OPENWEATHER_KEY_ENV = "YEELIGHT_WELLNESS_OPENWEATHER_API_KEY";
const WEATHER_FIELDS = [
  "temperature", "apparentTemperature", "cloudCover", "humidity", "precipitation",
  "precipitationProbability", "wind", "weatherCode", "condition",
];
const SOLAR_FIELDS = ["sunrise", "sunset", "dayLength", "daylightTrend"];
const REQUIRED_PUBLIC_FACTS = [
  "localDate", "localTime", "timezoneOffset", "weekday", "weekend", "season",
  ...WEATHER_FIELDS, ...SOLAR_FIELDS,
];
const PROVIDER_FACTS = [...WEATHER_FIELDS, ...SOLAR_FIELDS];
const PROVIDER_SOURCE_IDS = new Set([
  "open-meteo-weather", "open-meteo-solar", "openweather-weather", "openweather-solar",
]);
const HOST_INPUT_FIELDS = new Set(["city", "region", "timezone", "now", "context"]);

export class PublicContextError extends Error {
  constructor(code) {
    super(code);
    this.name = "PublicContextError";
    this.code = code;
  }
}

function fail(code) {
  throw new PublicContextError(code);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidCalendarDate(year, month, day) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
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

function normalizeName(value) {
  return String(value).normalize("NFKC").toLocaleLowerCase().replace(/[\s.'’`_-]+/g, "");
}

function localeLanguage(locale, city) {
  if (/[㐀-鿿぀-ヿ가-힯]/u.test(String(city || ""))) return "zh";
  const value = String(locale || "").toLowerCase();
  if (value.startsWith("zh")) return "en";
  if (value.startsWith("de")) return "de";
  return "en";
}

function normalizeRegion(value) {
  return normalizeName(value)
    .replace(/(?:province|state|region|prefecture|city|county|district|省|市|州|县|區|区|自治区)$/u, "");
}

function geocoderRank(entry) {
  const code = String(entry?.feature_code || "").toUpperCase();
  if (code === "PPLC") return 5;
  if (/^PPLA\d?$/.test(code)) return 4;
  if (code === "PPL") return 3;
  if (code.startsWith("PPL")) return 2;
  return 0;
}

function selectGeocoderCandidates(exact, region) {
  let candidates = exact;
  if (region) {
    const wanted = normalizeRegion(region);
    const matching = exact.filter((entry) => [entry.admin1, entry.admin2, entry.country, entry.country_code]
      .some((value) => value && normalizeRegion(value) === wanted));
    if (matching.length === 0) return [];
    candidates = matching;
    const rank = Math.max(...candidates.map(geocoderRank));
    if (rank > 0) candidates = candidates.filter((entry) => geocoderRank(entry) === rank);
  }
  return candidates;
}

function parseInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("input_invalid");
  const allowed = new Set(["city", "region", "locale", "now"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) fail("input_invalid");
  if (!isSafeLabel(input.city, 80) || normalizeName(input.city) === "unknown") fail("city_required");
  if (input.region !== undefined && !isSafeLabel(input.region, 40)) fail("region_invalid");
  if (input.locale !== undefined && (typeof input.locale !== "string" || input.locale.length > 35)) fail("locale_invalid");
  const now = input.now === undefined ? new Date() : new Date(input.now);
  if (Number.isNaN(now.getTime())) fail("time_invalid");
  return {
    city: input.city,
    region: input.region,
    locale: input.locale,
    now,
    nowIso: now.toISOString(),
  };
}

function localParts(instant, timezone) {
  let values = {};
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
  const hour = Number(values.hour);
  if (hour === 24) values.hour = "00";
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function localDate(parts) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function localTime(parts) {
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`;
}

function offsetMinutes(instant, timezone) {
  const parts = localParts(instant, timezone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

function offsetText(minutes) {
  if (!Number.isInteger(minutes) || minutes < -840 || minutes > 840) fail("timezone_invalid");
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function zonedIso(instant, timezone) {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime()) || !isIanaTimezone(timezone)) fail("time_invalid");
  const parts = localParts(instant, timezone);
  return `${localDate(parts)}T${localTime(parts)}${offsetText(offsetMinutes(instant, timezone))}`;
}

function shiftDate(value, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) fail("time_invalid");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

function source(id, kind, retrievedAt, expiresAt = null) {
  return { id, kind, retrievedAt, expiresAt };
}

function fact(value, sourceId, timezone, observedAt, options = {}) {
  return {
    value,
    ...(options.unit ? { unit: options.unit } : {}),
    sourceId,
    observedAt: observedAt ?? null,
    forecastFor: options.forecastFor ?? null,
    timezone,
    freshness: options.freshness || "fresh",
  };
}

function isFreshWeatherObservation(observedAt, now) {
  if (!(observedAt instanceof Date) || Number.isNaN(observedAt.getTime()) || !(now instanceof Date) || Number.isNaN(now.getTime())) return false;
  const age = now.getTime() - observedAt.getTime();
  return age >= -MAX_WEATHER_FUTURE_MS && age <= MAX_WEATHER_AGE_MS;
}

function addUnknown(context, name) {
  if (!context.unknown.includes(name)) context.unknown.push(name);
  context.stale = context.stale.filter((entry) => entry !== name);
  delete context.facts[name];
}

function setKnownFact(context, name, value) {
  context.unknown = context.unknown.filter((entry) => entry !== name);
  context.stale = context.stale.filter((entry) => entry !== name);
  context.facts[name] = value;
}

function addNumeric(context, name, value, sourceId, timezone, observedAt, unit, minimum, maximum) {
  if (!isFiniteNumber(value) || value < minimum || value > maximum) {
    addUnknown(context, name);
    return false;
  }
  setKnownFact(context, name, fact(value, sourceId, timezone, observedAt, { unit }));
  return true;
}

function conditionFor(code) {
  if (!Number.isInteger(code)) return null;
  if (code === 0) return "clear";
  if ([1, 2].includes(code)) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return null;
}

function seasonFor(date, latitude) {
  if (!isFiniteNumber(latitude) || Math.abs(latitude) < 5) return "unknown";
  const month = Number(date.slice(5, 7));
  const north = month <= 2 || month === 12 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "autumn";
  if (latitude >= 0) return north;
  return { winter: "summer", spring: "autumn", summer: "winter", autumn: "spring" }[north];
}

function weekdayFor(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][day];
}

function assertPublicUrl(url, origin, requestPath) {
  const parsed = new URL(url);
  const expected = new URL(origin);
  if (parsed.protocol !== "https:" || parsed.hostname !== expected.hostname || (parsed.port && parsed.port !== "443") || parsed.pathname !== requestPath || parsed.username || parsed.password || parsed.hash) {
    fail("provider_request_invalid");
  }
}

async function readLimited(response) {
  const declared = response.headers?.get?.("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) fail("provider_response_too_large");
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_RESPONSE_BYTES) fail("provider_response_too_large");
    return new TextDecoder().decode(bytes);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
    total += chunk.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      fail("provider_response_too_large");
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function requestJson(url, { origin, requestPath, fetchImpl, signal, validateUrl = null }) {
  if (validateUrl) validateUrl(url);
  else assertPublicUrl(url, origin, requestPath);
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, REQUEST_TIMEOUT_MS);
  timer.unref?.();
  if (signal?.aborted) {
    controller.abort();
    clearTimeout(timer);
    fail("provider_timeout");
  }
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response || response.status !== 200) fail("provider_unavailable");
    const contentType = response.headers?.get?.("content-type") || "";
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) fail("provider_response_invalid");
    const body = await readLimited(response);
    try { return JSON.parse(body); } catch { fail("provider_response_invalid"); }
  } catch (error) {
    if (error instanceof PublicContextError) throw error;
    if (error?.name === "AbortError") fail("provider_timeout");
    fail("provider_unavailable");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function buildContext(input, timezone, latitude, retrievedAt) {
  const instant = new Date(retrievedAt);
  const parts = localParts(instant, timezone);
  const date = localDate(parts);
  const calendarExpiry = new Date(instant.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const context = {
    schemaVersion: "yeelight-wellness-context-v1",
    location: { city: input.city, ...(input.region ? { region: input.region } : {}), timezone },
    retrievedAt,
    sources: [source("geocoding-timezone", "timezone", retrievedAt), source("local-calendar", "calendar", retrievedAt, calendarExpiry)],
    facts: {},
    unknown: [],
    stale: [],
  };
  context.facts.localDate = fact(date, "local-calendar", timezone, retrievedAt, { unit: undefined });
  context.facts.localTime = fact(localTime(parts), "local-calendar", timezone, retrievedAt, { unit: undefined });
  context.facts.timezoneOffset = fact(offsetMinutes(instant, timezone), "geocoding-timezone", timezone, retrievedAt, { unit: "minutes" });
  context.facts.weekday = fact(weekdayFor(date), "local-calendar", timezone, retrievedAt);
  context.facts.weekend = fact(["saturday", "sunday"].includes(context.facts.weekday.value), "local-calendar", timezone, retrievedAt);
  context.facts.season = fact(seasonFor(date, latitude), "local-calendar", timezone, retrievedAt);
  if (context.facts.season.value === "unknown") addUnknown(context, "season");
  return context;
}

function applyForecast(context, payload, timezone, latitude, now) {
  if (!payload || typeof payload !== "object" || payload.timezone !== timezone || !payload.current || !payload.daily) fail("provider_response_invalid");
  const current = payload.current;
  const daily = payload.daily;
  const currentEpoch = Number(current.time);
  if (!Number.isInteger(currentEpoch) || currentEpoch <= 0) fail("provider_response_invalid");
  const observedAt = new Date(currentEpoch * 1000);
  if (Number.isNaN(observedAt.getTime())) fail("provider_response_invalid");
  const weatherFresh = isFreshWeatherObservation(observedAt, now);
  const weatherExpiry = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const solarExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  context.sources.push(source("open-meteo-weather", "weather", context.retrievedAt, weatherExpiry));
  context.sources.push(source("open-meteo-solar", "solar", context.retrievedAt, solarExpiry));
  const weatherSource = "open-meteo-weather";
  if (weatherFresh) {
    const observedIso = observedAt.toISOString();
    addNumeric(context, "temperature", current.temperature_2m, weatherSource, timezone, observedIso, "celsius", -100, 100);
    addNumeric(context, "apparentTemperature", current.apparent_temperature, weatherSource, timezone, observedIso, "celsius", -100, 100);
    addNumeric(context, "cloudCover", current.cloud_cover, weatherSource, timezone, observedIso, "percent", 0, 100);
    addNumeric(context, "humidity", current.relative_humidity_2m, weatherSource, timezone, observedIso, "percent", 0, 100);
    addNumeric(context, "precipitation", current.precipitation, weatherSource, timezone, observedIso, "millimeters", 0, 2000);
    addNumeric(context, "precipitationProbability", current.precipitation_probability, weatherSource, timezone, observedIso, "percent", 0, 100);
    addNumeric(context, "wind", current.wind_speed_10m, weatherSource, timezone, observedIso, "kilometers-per-hour", 0, 500);
    const code = current.weather_code;
    if (Number.isInteger(code) && code >= 0 && code <= 99) {
      context.facts.weatherCode = fact(code, weatherSource, timezone, observedIso, { unit: "wmo-code" });
      const condition = conditionFor(code);
      if (condition) context.facts.condition = fact(condition, weatherSource, timezone, observedIso);
      else addUnknown(context, "condition");
    } else {
      addUnknown(context, "weatherCode");
      addUnknown(context, "condition");
    }
  } else {
    for (const name of WEATHER_FIELDS) addUnknown(context, name);
  }
  const dates = Array.isArray(daily.time) ? daily.time : [];
  const sunrises = Array.isArray(daily.sunrise) ? daily.sunrise : [];
  const sunsets = Array.isArray(daily.sunset) ? daily.sunset : [];
  const lengths = Array.isArray(daily.daylight_duration) ? daily.daylight_duration : [];
  if (dates.length > 16 || sunrises.length !== dates.length || sunsets.length !== dates.length || lengths.length !== dates.length) fail("provider_response_invalid");
  const date = context.facts.localDate.value;
  const todayIndex = sunrises.findIndex((epoch) => Number.isInteger(epoch) && localDate(localParts(new Date(epoch * 1000), timezone)) === date);
  const tomorrow = shiftDate(date, 1);
  const tomorrowIndex = sunrises.findIndex((epoch) => Number.isInteger(epoch) && localDate(localParts(new Date(epoch * 1000), timezone)) === tomorrow);
  const solarForecast = (index, field) => {
    const value = Number(field[index]);
    return Number.isInteger(value) && value > 0 ? new Date(value * 1000) : null;
  };
  const sunrise = todayIndex >= 0 ? solarForecast(todayIndex, sunrises) : null;
  const sunset = todayIndex >= 0 ? solarForecast(todayIndex, sunsets) : null;
  if (sunrise && sunset && localDate(localParts(sunrise, timezone)) === date && localDate(localParts(sunset, timezone)) === date && sunrise < sunset) {
    const sunriseIso = zonedIso(sunrise, timezone);
    const sunsetIso = zonedIso(sunset, timezone);
    context.facts.sunrise = fact(sunriseIso, "open-meteo-solar", timezone, null, { forecastFor: sunriseIso });
    context.facts.sunset = fact(sunsetIso, "open-meteo-solar", timezone, null, { forecastFor: sunsetIso });
    const length = Number(lengths[todayIndex]);
    if (isFiniteNumber(length) && length >= 0 && length <= 86400) context.facts.dayLength = fact(length, "open-meteo-solar", timezone, null, { unit: "seconds", forecastFor: sunriseIso });
    else addUnknown(context, "dayLength");
    const tomorrowLength = tomorrowIndex >= 0 ? Number(lengths[tomorrowIndex]) : NaN;
    if (isFiniteNumber(length) && isFiniteNumber(tomorrowLength)) {
      const delta = tomorrowLength - length;
      context.facts.daylightTrend = fact(Math.abs(delta) < 60 ? "stable" : delta > 0 ? "lengthening" : "shortening", "open-meteo-solar", timezone, null, { forecastFor: sunriseIso });
    } else addUnknown(context, "daylightTrend");
  } else {
    for (const name of ["sunrise", "sunset", "dayLength", "daylightTrend"]) addUnknown(context, name);
  }
  return context;
}

function openWeatherCondition(code) {
  if (!Number.isInteger(code)) return null;
  if (code >= 200 && code <= 299) return "storm";
  if (code >= 300 && code <= 599) return "rain";
  if (code >= 600 && code <= 699) return "snow";
  if (code >= 700 && code <= 799) return "fog";
  if (code === 800) return "clear";
  if (code === 801 || code === 802) return "partly-cloudy";
  if (code === 803 || code === 804) return "cloudy";
  return null;
}

function openWeatherWmoCode(code) {
  if (!Number.isInteger(code)) return null;
  if (code >= 200 && code <= 299) return 95;
  if (code >= 300 && code <= 599) return 61;
  if (code >= 600 && code <= 699) return 71;
  if (code >= 700 && code <= 799) return 45;
  if (code === 800) return 0;
  if (code === 801 || code === 802) return 2;
  if (code === 803 || code === 804) return 3;
  return null;
}

function openWeatherKey(env) {
  const value = env?.[OPENWEATHER_KEY_ENV];
  if (typeof value !== "string" || value.length < 16 || value.length > 256 || value.trim() !== value) return null;
  if (!/^[A-Za-z0-9._~-]+$/.test(value)) return null;
  return value;
}

function assertOpenWeatherUrl(url, key) {
  const parsed = new URL(url);
  const expected = new URL(OPENWEATHER_ORIGIN);
  if (parsed.protocol !== "https:" || parsed.hostname !== expected.hostname || (parsed.port && parsed.port !== "443")
    || parsed.pathname !== OPENWEATHER_PATH || parsed.username || parsed.password || parsed.hash) fail("provider_request_invalid");
  const params = parsed.searchParams;
  const keys = [...new Set([...params.keys()])].sort().join(",");
  if (keys !== "appid,exclude,lat,lon,units" || params.get("appid") !== key || params.get("exclude") !== "minutely,hourly,alerts" || params.get("units") !== "metric") fail("provider_request_invalid");
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90 || !isFiniteNumber(longitude) || longitude < -180 || longitude > 180) fail("provider_request_invalid");
}

function resetProviderFacts(context) {
  for (const name of PROVIDER_FACTS) delete context.facts[name];
  context.unknown = context.unknown.filter((name) => !PROVIDER_FACTS.includes(name));
  context.stale = context.stale.filter((name) => !PROVIDER_FACTS.includes(name));
  context.sources = context.sources.filter((entry) => !PROVIDER_SOURCE_IDS.has(entry.id));
}

function markProviderUnknown(context) {
  for (const name of PROVIDER_FACTS) addUnknown(context, name);
  context.unknown.sort();
}

function factFresh(context, name) {
  return context?.facts?.[name]?.freshness === "fresh";
}

export function publicContextReadiness(context) {
  const missing = REQUIRED_PUBLIC_FACTS.filter((name) => !factFresh(context, name));
  return { ready: missing.length === 0, missing };
}

function validateHostContext(rawInput, options = {}) {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)
    || Object.keys(rawInput).some((key) => !HOST_INPUT_FIELDS.has(key)) || !Object.hasOwn(rawInput, "context")) fail("host_context_invalid");
  const input = parseInput({ city: rawInput.city, ...(rawInput.region === undefined ? {} : { region: rawInput.region }), ...(rawInput.now === undefined ? {} : { now: rawInput.now }) });
  let context;
  try {
    context = normalizeHostPublicContext({
      context: rawInput.context,
      city: input.city,
      region: input.region,
      timezone: rawInput.timezone,
      now: input.now,
      trustedAuthorities: options.trustedAuthorities || [],
    });
  } catch {
    fail("host_context_invalid");
  }
  for (const name of REQUIRED_PUBLIC_FACTS) {
    if (!context.facts[name] && !context.unknown.includes(name) && !context.stale.includes(name)) addUnknown(context, name);
  }
  context.unknown.sort();
  context.stale = context.stale.filter((name) => !context.unknown.includes(name)).sort();
  assertOutput(context);
  return { input, context };
}

export function resolveHostPublicContext(rawInput, options = {}) {
  const { context } = validateHostContext(rawInput, options);
  const readiness = publicContextReadiness(context);
  return readiness.ready
    ? { status: "success", context }
    : { status: "partial", reason: "host_context_incomplete", context };
}

function epochDate(value) {
  const epoch = Number(value);
  if (!Number.isInteger(epoch) || epoch <= 0) return null;
  const date = new Date(epoch * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function openWeatherSolarEntry(entries, date, timezone) {
  return entries.find((entry) => {
    const sunrise = epochDate(entry?.sunrise);
    return sunrise && localDate(localParts(sunrise, timezone)) === date;
  }) || null;
}

function addForecastNumeric(context, name, value, sourceId, timezone, forecastFor, unit, minimum, maximum) {
  if (!isFiniteNumber(value) || value < minimum || value > maximum) {
    addUnknown(context, name);
    return false;
  }
  setKnownFact(context, name, fact(value, sourceId, timezone, null, { unit, forecastFor }));
  return true;
}

function applyOpenWeather(context, payload, timezone, latitude, longitude, now) {
  if (!payload || typeof payload !== "object" || !payload.current || !Array.isArray(payload.daily) || payload.daily.length > 16) fail("provider_response_invalid");
  if (!isFiniteNumber(payload.lat) || !isFiniteNumber(payload.lon)
    || Math.abs(payload.lat - latitude) > MAX_PROVIDER_COORDINATE_DRIFT
    || Math.abs(payload.lon - longitude) > MAX_PROVIDER_COORDINATE_DRIFT) fail("provider_response_invalid");
  const current = payload.current;
  const currentDate = epochDate(current.dt);
  if (!currentDate) fail("provider_response_invalid");
  const weatherFresh = isFreshWeatherObservation(currentDate, now);
  const observedAt = currentDate.toISOString();
  const weatherExpiry = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const solarExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  context.sources.push(source("openweather-weather", "weather", context.retrievedAt, weatherExpiry));
  context.sources.push(source("openweather-solar", "solar", context.retrievedAt, solarExpiry));
  const weatherSource = "openweather-weather";
  if (weatherFresh) {
    addNumeric(context, "temperature", current.temp, weatherSource, timezone, observedAt, "celsius", -100, 100);
    addNumeric(context, "apparentTemperature", current.feels_like, weatherSource, timezone, observedAt, "celsius", -100, 100);
    addNumeric(context, "cloudCover", current.clouds, weatherSource, timezone, observedAt, "percent", 0, 100);
    addNumeric(context, "humidity", current.humidity, weatherSource, timezone, observedAt, "percent", 0, 100);
    const rain = isFiniteNumber(current.rain?.["1h"]) ? current.rain["1h"] : 0;
    const snow = isFiniteNumber(current.snow?.["1h"]) ? current.snow["1h"] : 0;
    addNumeric(context, "precipitation", rain + snow, weatherSource, timezone, observedAt, "millimeters", 0, 2000);
    const weather = Array.isArray(current.weather) ? current.weather[0] : null;
    const providerCode = Number(weather?.id);
    const condition = openWeatherCondition(providerCode);
    const mappedCode = openWeatherWmoCode(providerCode);
    if (condition && Number.isInteger(mappedCode)) {
      context.facts.weatherCode = fact(mappedCode, weatherSource, timezone, observedAt, { unit: "wmo-code" });
      context.facts.condition = fact(condition, weatherSource, timezone, observedAt);
    } else {
      addUnknown(context, "weatherCode");
      addUnknown(context, "condition");
    }
    const windSpeed = isFiniteNumber(current.wind_speed) ? current.wind_speed * 3.6 : NaN;
    addNumeric(context, "wind", windSpeed, weatherSource, timezone, observedAt, "kilometers-per-hour", 0, 500);
  } else {
    for (const name of WEATHER_FIELDS) addUnknown(context, name);
  }
  const daily = payload.daily;
  const date = context.facts.localDate.value;
  const today = openWeatherSolarEntry(daily, date, timezone);
  const tomorrowDate = shiftDate(date, 1);
  const tomorrow = openWeatherSolarEntry(daily, tomorrowDate, timezone);
  if (!today) {
    for (const name of SOLAR_FIELDS) addUnknown(context, name);
    return context;
  }
  const sunrise = epochDate(today.sunrise);
  const sunset = epochDate(today.sunset);
  if (!sunrise || !sunset || localDate(localParts(sunrise, timezone)) !== date || localDate(localParts(sunset, timezone)) !== date || sunrise >= sunset) {
    for (const name of SOLAR_FIELDS) addUnknown(context, name);
    return context;
  }
  const sunriseIso = zonedIso(sunrise, timezone);
  const sunsetIso = zonedIso(sunset, timezone);
  context.facts.sunrise = fact(sunriseIso, "openweather-solar", timezone, null, { forecastFor: sunriseIso });
  context.facts.sunset = fact(sunsetIso, "openweather-solar", timezone, null, { forecastFor: sunsetIso });
  const length = (sunset.getTime() - sunrise.getTime()) / 1000;
  if (length >= 0 && length <= 86400) context.facts.dayLength = fact(length, "openweather-solar", timezone, null, { unit: "seconds", forecastFor: sunriseIso });
  else addUnknown(context, "dayLength");
  const tomorrowSunrise = epochDate(tomorrow?.sunrise);
  const tomorrowSunset = epochDate(tomorrow?.sunset);
  const tomorrowLength = tomorrowSunrise && tomorrowSunset && tomorrowSunset > tomorrowSunrise
    ? (tomorrowSunset.getTime() - tomorrowSunrise.getTime()) / 1000 : NaN;
  if (isFiniteNumber(tomorrowLength)) {
    const delta = tomorrowLength - length;
    context.facts.daylightTrend = fact(Math.abs(delta) < 60 ? "stable" : delta > 0 ? "lengthening" : "shortening", "openweather-solar", timezone, null, { forecastFor: sunriseIso });
  } else addUnknown(context, "daylightTrend");
  const todayDaily = Number(today.pop);
  const forecastFor = today.dt ? epochDate(today.dt) : sunrise;
  if (weatherFresh && forecastFor) addForecastNumeric(context, "precipitationProbability", todayDaily * 100, weatherSource, timezone, zonedIso(forecastFor, timezone), "percent", 0, 100);
  else addUnknown(context, "precipitationProbability");
  return context;
}

function assertOutput(context, secrets = []) {
  const allowedTop = ["schemaVersion", "location", "retrievedAt", "sources", "facts", "unknown", "stale"];
  if (Object.keys(context).some((key) => !allowedTop.includes(key))) fail("context_invalid");
  const serialized = JSON.stringify(context);
  const bearerMarker = ["Be", "arer"].join("");
  if (new RegExp(`https?:\\/\\/|(?:lat(?:itude)?|lon(?:gitude)?)\\s*[:=]|${bearerMarker}\\s|accessToken|refreshToken`, "i").test(serialized)) fail("context_invalid");
  if (secrets.some((secret) => typeof secret === "string" && secret.length > 0 && serialized.includes(secret))) fail("context_invalid");
  if (context.sources.length > 16 || Object.keys(context.facts).length > 64 || context.unknown.length > 64 || context.stale.length > 64) fail("context_invalid");
  return context;
}

export async function resolvePublicContext(rawInput, { fetchImpl = globalThis.fetch, env = process.env, trustedAuthorities = [] } = {}) {
  if (rawInput && typeof rawInput === "object" && !Array.isArray(rawInput) && Object.hasOwn(rawInput, "context")) return resolveHostPublicContext(rawInput, { trustedAuthorities });
  const input = parseInput(rawInput);
  if (typeof fetchImpl !== "function") fail("provider_unavailable");
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), TOTAL_TIMEOUT_MS);
  timer.unref?.();
  try {
    const geoUrl = new URL(GEOCODER_PATH, GEOCODER_ORIGIN);
    geoUrl.search = new URLSearchParams({ name: input.city, count: "10", language: localeLanguage(input.locale, input.city), format: "json" }).toString();
    const geocoding = await requestJson(geoUrl.toString(), { origin: GEOCODER_ORIGIN, requestPath: GEOCODER_PATH, fetchImpl, signal: deadline.signal });
    const results = Array.isArray(geocoding?.results) ? geocoding.results : [];
    const exact = results.filter((entry) => entry && normalizeName(entry.name) === normalizeName(input.city)
      && isFiniteNumber(entry.latitude) && entry.latitude >= -90 && entry.latitude <= 90
      && isFiniteNumber(entry.longitude) && entry.longitude >= -180 && entry.longitude <= 180
      && isIanaTimezone(entry.timezone));
    const candidates = selectGeocoderCandidates(exact, input.region);
    if (candidates.length === 0) fail("city_not_found");
    if (candidates.length !== 1) fail("city_ambiguous");
    const place = candidates[0];
    const context = buildContext(input, place.timezone, place.latitude, input.nowIso);
    const forecastUrl = new URL(FORECAST_PATH, FORECAST_ORIGIN);
    forecastUrl.search = new URLSearchParams({
      latitude: String(place.latitude), longitude: String(place.longitude), timezone: place.timezone,
      timeformat: "unixtime", forecast_days: "3", past_days: "1",
      current: "temperature_2m,apparent_temperature,cloud_cover,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m",
      daily: "sunrise,sunset,daylight_duration",
    }).toString();
    let primaryError = null;
    try {
      const forecast = await requestJson(forecastUrl.toString(), { origin: FORECAST_ORIGIN, requestPath: FORECAST_PATH, fetchImpl, signal: deadline.signal });
      applyForecast(context, forecast, place.timezone, place.latitude, input.now);
      if (publicContextReadiness(context).ready) {
        context.unknown.sort();
        assertOutput(context);
        return { status: "success", context };
      }
      primaryError = new PublicContextError("provider_response_incomplete");
    } catch (error) {
      if (!(error instanceof PublicContextError)) throw error;
      primaryError = error;
    }
    const key = openWeatherKey(env);
    if (key && !deadline.signal.aborted) {
      resetProviderFacts(context);
      try {
        const fallbackUrl = new URL(OPENWEATHER_PATH, OPENWEATHER_ORIGIN);
        fallbackUrl.search = new URLSearchParams({
          lat: String(place.latitude),
          lon: String(place.longitude),
          exclude: "minutely,hourly,alerts",
          units: "metric",
          appid: key,
        }).toString();
        const fallback = await requestJson(fallbackUrl.toString(), {
          origin: OPENWEATHER_ORIGIN,
          requestPath: OPENWEATHER_PATH,
          fetchImpl,
          signal: deadline.signal,
          validateUrl: (url) => assertOpenWeatherUrl(url, key),
        });
        applyOpenWeather(context, fallback, place.timezone, place.latitude, place.longitude, input.now);
        context.unknown.sort();
        assertOutput(context, [key]);
        return { status: publicContextReadiness(context).ready ? "success" : "partial", reason: publicContextReadiness(context).ready ? undefined : "provider_response_incomplete", context };
      } catch (error) {
        if (!(error instanceof PublicContextError)) throw error;
      }
    }
    resetProviderFacts(context);
    markProviderUnknown(context);
    assertOutput(context, [key]);
    return { status: "partial", reason: primaryError?.code || "provider_unavailable", context };
  } catch (error) {
    if (error instanceof PublicContextError) throw error;
    fail("provider_unavailable");
  } finally {
    clearTimeout(timer);
  }
}

function parseArgs(argv) {
  const input = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!["--city", "--region", "--locale", "--now"].includes(key) || argv[index + 1] === undefined) fail("input_invalid");
    input[key.slice(2)] = argv[++index];
  }
  return input;
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) {
    text += chunk;
    if (Buffer.byteLength(text) > 32 * 1024) fail("input_invalid");
  }
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { fail("input_invalid"); }
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).pathname === new URL(import.meta.url).pathname) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const input = Object.keys(args).length > 0 ? args : await readStdin();
    const result = await resolvePublicContext(input || {});
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof PublicContextError ? error.code : "provider_unavailable";
    const clarification = ["city_required", "city_not_found", "city_ambiguous"].includes(code);
    process.stdout.write(`${JSON.stringify({ status: clarification ? "clarification_required" : "partial", reason: code })}\n`);
    process.exitCode = 2;
  }
}
