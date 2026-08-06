const zh = {
  lang: "zh-CN",
  unknown: "未确认",
  fallback: "未提供",
  empty: "无",
  noRecords: "没有记录",
  title: "Yeelight Wellness",
  brand: "YEELIGHT / WELLNESS",
  status: {
    preview: ["方案已准备好", "当前灯光保持原样。"],
    success: ["灯光已调整", "目标灯光已更新为回执中显示的当前状态。"],
    partial: ["部分灯光已调整", "已完成的变化和仍需确认的灯光会分别显示。"],
    "no-op": ["无需变化", "当前状态已经符合这次灯光方式。"],
    blocked: ["暂未调整", "今天的条件还不适合这次变化。"],
    uncertain: ["暂时无法确认", "无法确认所有灯光的最终状态，请重新查看后再决定下一步。"],
    stale: ["等待新天气", "天气信息需要更新后再调整灯光。"],
    runtime_missing: ["暂时无法调整", "灯光连接暂时不可用。"],
    runtime_outdated: ["需要更新灯光连接", "更新后即可继续调整。"],
    auth_required: ["需要重新连接家庭", "连接完成后即可继续调整。"],
    clarification_required: ["还差一个城市", "请告诉我你所在的城市。确认后，系统会自动取得时区、当地时间、天气与日光，再生成灯光方案。"],
    not_supported: ["能力不支持", "目标不支持这次灯光方式，已保留可用信息。"],
    error: ["没有完成调整", "这次未取得可信的最终结果，请重新查看灯光后再决定下一步。"],
  },
  mode: { scheduled: "定时触发", manual: "手动请求", conversation: "对话触发" },
  change: { changed: "已改变", preserved: "保持原样", protected: "受保护", skipped: "已跳过", offline: "离线", unsupported: "不支持", ambiguous: "待澄清", unknown: "未知" },
  changeKind: { light: "灯光", "planned-light": "计划", report: "记录", context: "环境", schedule: "日程" },
  timelineKind: { input: "输入", decision: "判断", execution: "变化", report: "报告", warning: "留意" },
  freshness: { fresh: "新鲜", mixed: "部分待确认", stale: "已过期", unknown: "未确认" },
  ui: {
    next: "下一步", cityHeadline: "先告诉我你所在的城市", genericClarificationTitle: "还需要一点信息", genericClarificationDetail: "请确认这次请求的目标或范围。", contextRequiredTitle: "正在补齐今天的环境信息", contextRequiredDetail: "天气和日出日落还没有可靠结果，暂时不会生成灯光方案。", contextHeadline: "先补齐今天的环境信息", contextBody: "系统会重新取得当前天气、当地时间和日出日落，完成后再决定是否需要调整灯光。", contextNote: "还没有生成方案，也没有读取灯光范围。", terminalRecorded: "本次结果已记录。", clarificationHeadline: "城市确认后，其他信息会自动补齐", clarificationBody: "你只需要告诉我城市。系统会据此取得当地时区、时间、天气与日光，再决定是否需要灯光变化。", clarificationNote: "当前没有选择方案，也没有写入灯光。",
    location: "位置", locationMissing: "位置未提供", now: "现在", weather: "天气", daylight: "日光", strategy: "当前策略", regionMissing: "区域未提供", timezoneMissing: "时区未提供", timeMissing: "时间未提供", weatherUnknown: "天气未确认", daylightUnknown: "日光窗口未知", daylightJoin: " 至 ", sourceMissing: "可信来源未提供", strategyWaiting: "等待确认", strategyAfterCity: "城市确认后生成", contextFresh: "事实新鲜", contextMixed: "部分事实需要留意", contextStale: "部分资料已过期", contextUnknown: "等待可信上下文",
    planTitle: "为什么这样调整", planNeedsCity: "先补齐当地环境，再决定是否需要变化。", storyTitle: "发生了什么", storyNote: "本次灯光变化如下。", timelineTitle: "处理过程", noChanges: "没有可展示的灯光变化。", stages: "个阶段", targets: "个目标", signals: "个信号", ideas: "个方案", generatedAt: "生成于", selected: "当前采用", before: "之前", after: "现在", source: "来源", window: "窗口", forecast: "预报", stage: "阶段", change: "变化", noSignals: "没有额外太阳或公共信号", noGuess: "缺少的信息会保持空白。", principlesTitle: "你的偏好", unknownTitle: "还没拿到的信息", staleTitle: "需要更新的信息", triggerTitle: "触发方式", noTargets: "没有可信的灯光状态。", noProcess: "没有可展示的过程。", homeSummary: "当前灯光", homeHint: "查看每盏灯现在的状态", evidenceSummary: "为什么这样调整", evidenceHint: "天气、日光和你的偏好", evidenceHintNoPreferences: "触发方式、天气和日光", flowEyebrow: "本次处理", flowTitle: "处理过程", flowSummary: "查看处理过程", catalogEyebrow: "更多灵感", catalogTitle: "更多灯光方式", catalogSummary: "浏览更多创意情景", defaultCollapsed: "点开查看", footerBoundary: "", footerSnapshot: "", heroAlt: "暮色客厅中的柔和灯光", reportContext: "当前环境摘要", currentStatus: "采用的灯光方式",
    stats: { changed: "灯光变化", online: "在线范围", steady: "保持原样", attention: "需要留意" },
  },
};

const en = {
  ...zh,
  lang: "en-US",
  unknown: "Unconfirmed",
  fallback: "Not provided",
  empty: "None",
  noRecords: "No records",
  title: "Yeelight Wellness",
  brand: "YEELIGHT / WELLNESS",
  status: {
    preview: ["Lighting is ready", "The current lights remain unchanged."],
    success: ["Lights adjusted", "The target lights now match the current states shown in this receipt."],
    partial: ["Some lights adjusted", "Completed changes and lights that still need attention are shown separately."],
    "no-op": ["No change needed", "The current state already fits this lighting approach."],
    blocked: ["Not adjusted", "Today's conditions do not suit this change yet."],
    uncertain: ["Unable to confirm", "Some final light states could not be confirmed. Check the lights again before deciding what to do next."],
    stale: ["Waiting for new weather", "Weather needs to refresh before the lights can change."],
    runtime_missing: ["Unable to adjust right now", "The lighting connection is temporarily unavailable."],
    runtime_outdated: ["Lighting connection needs an update", "Continue after the update."],
    auth_required: ["Reconnect the home", "Continue after the home is connected."],
    clarification_required: ["One city is missing", "Tell me your city. The system will then derive timezone, local time, weather, and daylight before creating a lighting plan."],
    not_supported: ["Capability unavailable", "The target does not support this lighting approach; available information is preserved."],
    error: ["Adjustment not completed", "No trustworthy final result is available. Check the lights again before deciding what to do next."],
  },
  mode: { scheduled: "Scheduled", manual: "Manual request", conversation: "Conversation" },
  change: { changed: "Changed", preserved: "Kept", protected: "Protected", skipped: "Skipped", offline: "Offline", unsupported: "Unsupported", ambiguous: "Needs clarification", unknown: "Unknown" },
  changeKind: { light: "Light", "planned-light": "Plan", report: "Record", context: "Context", schedule: "Schedule" },
  timelineKind: { input: "Input", decision: "Decision", execution: "Change", report: "Report", warning: "Note" },
  freshness: { fresh: "Fresh", mixed: "Partly unconfirmed", stale: "Expired", unknown: "Unconfirmed" },
  ui: {
    next: "Next", cityHeadline: "Tell me your city first", genericClarificationTitle: "One more detail is needed", genericClarificationDetail: "Confirm the target or scope for this request.", contextRequiredTitle: "Today's local context is still loading", contextRequiredDetail: "Weather and sunrise or sunset are not reliable yet, so no lighting plan was created.", contextHeadline: "Complete today's local context first", contextBody: "The system will refresh current weather, local time, and sunrise or sunset before deciding whether the lights should change.", contextNote: "No plan was created and no lights were read.", terminalRecorded: "The result is recorded.", clarificationHeadline: "Confirm the city, then the rest fills in", clarificationBody: "Tell us the city. The system will derive the local timezone, local time, weather, and daylight before deciding whether the lights need to change.", clarificationNote: "No recipe was selected and no light was written.",
    location: "Location", locationMissing: "Location not provided", now: "Now", weather: "Weather", daylight: "Daylight", strategy: "Current approach", regionMissing: "Region not provided", timezoneMissing: "Timezone not provided", timeMissing: "Time not provided", weatherUnknown: "Weather unconfirmed", daylightUnknown: "Daylight window unknown", daylightJoin: " to ", sourceMissing: "No trusted source", strategyWaiting: "Waiting for confirmation", strategyAfterCity: "Generated after city confirmation", contextFresh: "Fresh facts", contextMixed: "Some facts need attention", contextStale: "Some facts are expired", contextUnknown: "Waiting for trusted context",
    planTitle: "Why the lights changed", planNeedsCity: "Complete the local context before deciding whether anything should change.", storyTitle: "What happened", storyNote: "These are the light changes from this run.", timelineTitle: "Process", noChanges: "No lighting changes to show.", stages: "stages", targets: "targets", signals: "signals", ideas: "ideas", generatedAt: "Generated", selected: "Selected", before: "Before", after: "Now", source: "Source", window: "Window", forecast: "Forecast", stage: "Stage", change: "Change", noSignals: "No extra solar or public signals", noGuess: "Missing information stays unconfirmed.", principlesTitle: "Your preferences", unknownTitle: "Still waiting for", staleTitle: "Needs an update", triggerTitle: "Triggered by", noTargets: "No trusted light state is available.", noProcess: "No process to show.", homeSummary: "Current lights", homeHint: "See each light's current state", evidenceSummary: "Why this approach", evidenceHint: "Weather, daylight, and your preferences", evidenceHintNoPreferences: "Trigger, weather, and daylight", flowEyebrow: "THIS RUN", flowTitle: "Process", flowSummary: "View the process", catalogEyebrow: "MORE IDEAS", catalogTitle: "More lighting approaches", catalogSummary: "Browse more creative scenes", defaultCollapsed: "Open to browse", footerBoundary: "", footerSnapshot: "", heroAlt: "Soft evening light in a living room", reportContext: "Current context", currentStatus: "Lighting approach",
    stats: { changed: "Light changes", online: "Online scope", steady: "Kept", attention: "Needs attention" },
  },
};

const de = {
  ...en,
  lang: "de-DE",
  unknown: "Nicht bestätigt",
  fallback: "Nicht angegeben",
  empty: "Keine",
  noRecords: "Keine Einträge",
  status: {
    ...en.status,
    preview: ["Lichtidee ist bereit", "Die aktuellen Lichter bleiben unverändert."],
    success: ["Lichter angepasst", "Die Ziellampen entsprechen jetzt den in diesem Beleg gezeigten Zuständen."],
    partial: ["Einige Lichter angepasst", "Abgeschlossene Änderungen und noch zu prüfende Lichter werden getrennt angezeigt."],
    "no-op": ["Keine Änderung nötig", "Der aktuelle Zustand passt bereits zu diesem Lichtkonzept."],
    blocked: ["Nicht angepasst", "Die heutigen Bedingungen passen noch nicht zu dieser Änderung."],
    uncertain: ["Nicht vollständig bestätigt", "Einige endgültige Lichtzustände konnten nicht bestätigt werden. Prüfe die Lichter erneut."],
    stale: ["Warte auf neue Wetterdaten", "Vor der Anpassung müssen die Wetterdaten aktualisiert werden."],
    auth_required: ["Zuhause erneut verbinden", "Danach kann die Anpassung fortgesetzt werden."],
    clarification_required: ["Eine Stadt fehlt", "Nenne deine Stadt. Danach ermittelt das System Zeitzone, Ortszeit, Wetter und Tageslicht vor dem Lichtplan."],
  },
  mode: { scheduled: "Geplant", manual: "Manuelle Anfrage", conversation: "Dialog" },
  change: { changed: "Geändert", preserved: "Beibehalten", protected: "Geschützt", skipped: "Übersprungen", offline: "Offline", unsupported: "Nicht unterstützt", ambiguous: "Klärung nötig", unknown: "Unbekannt" },
  changeKind: { light: "Licht", "planned-light": "Plan", report: "Bericht", context: "Kontext", schedule: "Zeitplan" },
  timelineKind: { input: "Eingabe", decision: "Entscheidung", execution: "Änderung", report: "Bericht", warning: "Hinweis" },
  freshness: { fresh: "Aktuell", mixed: "Teilweise unbestätigt", stale: "Abgelaufen", unknown: "Nicht bestätigt" },
  ui: {
    ...en.ui,
    next: "Nächster Schritt", cityHeadline: "Nenne zuerst deine Stadt", genericClarificationTitle: "Eine Information fehlt noch", genericClarificationDetail: "Bestätige Ziel oder Bereich dieser Anfrage.", contextRequiredTitle: "Die Tagesdaten werden noch ergänzt", contextRequiredDetail: "Wetter sowie Sonnenaufgang und Sonnenuntergang sind noch nicht zuverlässig, daher wurde kein Lichtkonzept erstellt.", contextHeadline: "Zuerst die Tagesdaten ergänzen", contextBody: "Das System lädt Wetter, Ortszeit sowie Sonnenaufgang und Sonnenuntergang neu, bevor es über eine Änderung entscheidet.", contextNote: "Kein Konzept erstellt und keine Lichter gelesen.", terminalRecorded: "Das Ergebnis ist gespeichert.", clarificationHeadline: "Stadt bestätigen, dann ergänzt sich der Rest", clarificationBody: "Nenne die Stadt. Das System ermittelt daraus die lokale Zeitzone, Ortszeit, Wetter und Tageslicht, bevor es über eine Lichtänderung entscheidet.", clarificationNote: "Keine Szene ausgewählt und kein Licht geschrieben.",
    location: "Ort", locationMissing: "Ort nicht angegeben", now: "Jetzt", weather: "Wetter", daylight: "Tageslicht", strategy: "Aktueller Ansatz", regionMissing: "Region nicht angegeben", timezoneMissing: "Zeitzone nicht angegeben", timeMissing: "Zeit nicht angegeben", weatherUnknown: "Wetter nicht bestätigt", daylightUnknown: "Tageslichtfenster unbekannt", daylightJoin: " bis ", sourceMissing: "Keine vertrauenswürdige Quelle", strategyWaiting: "Warte auf Bestätigung", strategyAfterCity: "Nach Stadtbestätigung erstellt", contextFresh: "Aktuelle Fakten", contextMixed: "Einige Fakten brauchen Beachtung", contextStale: "Einige Fakten sind abgelaufen", contextUnknown: "Warte auf vertrauenswürdigen Kontext",
    planTitle: "Warum die Lichter so angepasst wurden", planNeedsCity: "Ergänze zuerst den lokalen Kontext, bevor eine Änderung entschieden wird.", storyTitle: "Was ist passiert", storyNote: "Das sind die Lichtänderungen dieses Laufs.", timelineTitle: "Ablauf", noChanges: "Keine Lichtänderungen vorhanden.", stages: "Phasen", targets: "Ziele", signals: "Signale", ideas: "Szenen", generatedAt: "Erstellt", selected: "Ausgewählt", before: "Vorher", after: "Jetzt", source: "Quelle", window: "Fenster", forecast: "Prognose", stage: "Phase", change: "Änderung", noSignals: "Keine zusätzlichen Sonnen- oder öffentlichen Signale", noGuess: "Fehlende Fakten bleiben unbestätigt.", principlesTitle: "Deine Vorlieben", unknownTitle: "Noch offen", staleTitle: "Muss aktualisiert werden", triggerTitle: "Ausgelöst durch", noTargets: "Kein verlässlicher Lichtzustand verfügbar.", noProcess: "Kein Verlauf vorhanden.", homeSummary: "Aktuelle Lichter", homeHint: "Aktuellen Zustand jeder Lampe ansehen", evidenceSummary: "Warum dieser Ansatz", evidenceHint: "Wetter, Tageslicht und deine Vorlieben", evidenceHintNoPreferences: "Auslöser, Wetter und Tageslicht", flowEyebrow: "DIESER LAUF", flowTitle: "Ablauf", flowSummary: "Ablauf ansehen", catalogEyebrow: "MEHR IDEEN", catalogTitle: "Weitere Lichtideen", catalogSummary: "Weitere Lichtszenen ansehen", defaultCollapsed: "Zum Ansehen öffnen", footerBoundary: "", footerSnapshot: "", heroAlt: "Sanftes Abendlicht in einem Wohnzimmer", reportContext: "Aktueller Kontext", currentStatus: "Lichtkonzept",
    stats: { changed: "Lichtänderungen", online: "Online-Bereich", steady: "Beibehalten", attention: "Zu beachten" },
  },
};

const localeCopies = { zh, en, de };

export function resolveReportLocale(locale) {
  const value = String(locale || "").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("de")) return "de";
  return "en";
}

export function getReportCopy(locale) {
  return localeCopies[resolveReportLocale(locale)] || en;
}

export function countLabel(copy, value, kind) {
  const number = Number(value) || 0;
  const labels = copy.ui;
  if (resolveReportLocale(copy.lang) === "en") return `${number} ${labels[kind]}${number === 1 ? "" : "s"}`;
  if (resolveReportLocale(copy.lang) === "de") return `${number} ${labels[kind]}`;
  return `${number} ${labels[kind]}`;
}

const icons = {
  check: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  spark: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M12 2v5m0 10v5M2 12h5m10 0h5M5 5l3.5 3.5m7 7L19 19m0-14-3.5 3.5m-7 7L5 19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  pin: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.7"/></svg>',
  clock: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cloud: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M7.5 18h9a4.5 4.5 0 1 0-.8-8.93A5.5 5.5 0 0 0 5.2 11.2 3.5 3.5 0 0 0 7.5 18Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sun: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.4" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5v2m0 15v2M2.5 12h2m15 0h2M5.3 5.3l1.4 1.4m10.6 10.6 1.4 1.4m0-13.4-1.4 1.4M6.7 17.3l-1.4 1.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  bulb: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M9 18h6m-5 3h4M8.4 14.8A6 6 0 1 1 15.6 14.8c-.8.7-1.1 1.4-1.2 2.2H9.6c-.1-.8-.4-1.5-1.2-2.2Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  home: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m3.5 10.5 8.5-7 8.5 7v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.5 20.5v-6h5v6" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  compass: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="m14.7 9.3-1.8 3.6-3.6 1.8 1.8-3.6 3.6-1.8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
};

export function iconSvg(name) {
  return icons[name] || icons.spark;
}
