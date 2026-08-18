const CUES = [
  ["fire", /\b(?:fire|flame|burn)\b|燃烧|火焰|烈焰/iu],
  ["warmth", /\b(?:love|warmth|home|hold|heart|embrace)\b|温暖|拥抱|爱意|心/iu],
  ["hope", /\b(?:hope|dream|dawn|wish|rise)\b|希望|梦想|黎明|愿望/iu],
  ["cool", /\b(?:cool|cold|winter|moon|rain)\b|清冷|寒冷|冬|月光|雨/iu],
  ["clarity", /\b(?:clear|awake|open my eyes)\b|清醒|苏醒|明晰/iu],
];

export function analyzeLyric(text) {
  const value = typeof text === "string" ? text.slice(0, 1200) : "";
  for (const [cue, pattern] of CUES) {
    if (pattern.test(value)) return { cue, confidence: 0.72, explicitMarker: false };
  }
  const marker = value.match(/\[(Female|Male|Duet)\]/i);
  return marker
    ? { cue: "none", vocalHint: marker[1].toLowerCase(), confidence: 0.9, explicitMarker: true }
    : { cue: "none", confidence: 0, explicitMarker: false };
}

export function parseSyncedLyrics(value) {
  const rows = [];
  for (const line of String(value || "").split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, "").trim();
    for (const stamp of stamps) rows.push({ timeMs: (Number(stamp[1]) * 60 + Number(stamp[2])) * 1000, text: text.slice(0, 240) });
  }
  return rows.sort((a, b) => a.timeMs - b.timeMs).slice(0, 4000);
}
