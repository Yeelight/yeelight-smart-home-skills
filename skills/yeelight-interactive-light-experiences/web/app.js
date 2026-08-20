import { icon } from './icons.js';
import { experienceMap, renderExperienceForm, collectInput } from './experience-pages.js';

const api = '/api';
const FEATURED_EXPERIENCE_IDS = Object.freeze(['fortune-light', 'light-game-arena']);
const CINEMA_URL = 'http://127.0.0.1:8789/';
const CINEMA_HEALTH_URL = '/cinema/health';
const SMART_HOME_FALLBACK = Object.freeze([
  { id: 'relax', title: 'Relax', summary: 'Slow the room down with a warm, gentle glow.', intent: 'Wind down', accent: 'amber' },
  { id: 'focus', title: 'Focus', summary: 'Bring clarity to the space when attention matters.', intent: 'Get focused', accent: 'mint' },
  { id: 'movie', title: 'Movie', summary: 'Shape a low-glare cinematic wash around the screen.', intent: 'Start a screening', accent: 'violet' },
  { id: 'party', title: 'Party', summary: 'Open the room with a bright, social pulse.', intent: 'Set the mood', accent: 'coral' },
]);
const state = {
  session: null,
  catalog: [],
  mode: 'mock-18',
  scenario: 'online',
  taps: [],
  current: null,
  topology: null,
  provider: null,
  turn: 'A',
  turnReceipt: null,
  runId: null,
  lastInput: null,
  retryKind: null,
  lastResult: null,
  installationError: '',
  waitTimer: null,
  smartHomeScenes: SMART_HOME_FALLBACK,
  smartHomeAvailable: null,
  smartHomeError: '',
  smartHomeBusy: false,
  smartHomeNeedsRestart: false,
  smartSceneStates: {},
  smartWaitTimer: null,
  smartSceneTimers: new Map(),
  cinema: { status: 'idle', message: '' },
};
const main = document.querySelector('main');
const evidence = document.querySelector('#evidence');
document.querySelector('[data-home]').innerHTML = icon('home');
document.querySelector('[data-finish]').innerHTML = icon('close');

const atlasIndex = Object.keys(experienceMap);
function route() {
  const match = location.hash.match(/^#\/experience\/([a-z0-9-]+)$/);
  return match ? match[1] : null;
}

function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = String(value ?? '');
  return node.innerHTML;
}

function endpoint(path, options = {}) {
  return fetch(`${api}${path}`, {
    headers: { 'content-type': 'application/json', origin: window.location.origin },
    ...options,
  }).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.message || 'The local installation could not complete this request.');
      Object.assign(error, body, { status: response.status });
      throw error;
    }
    return body;
  });
}

function modeLabel() {
  if (state.mode === 'live-proxy-4') return 'Live installation · four light zones';
  if (state.mode === 'live-18') return 'Live installation · eighteen lights';
  if (state.mode === 'proxy-4') return 'Four-zone installation preview';
  return 'Installation preview · eighteen light positions';
}

function publicEvidenceLabel(topology = {}) {
  if (topology?.mode === 'live-proxy-4') return 'Live installation · four zones ready';
  if (topology?.mode === 'live-18') return 'Live installation · eighteen lights ready';
  if (topology?.mode === 'proxy-4') return 'Four-zone preview · ready';
  if (topology?.mode === 'mock-18') return 'Installation preview · ready';
  return 'Light installation · checking readiness';
}

function setEvidence(value) {
  const topology = value?.topology || value;
  state.topology = topology || null;
  evidence.textContent = publicEvidenceLabel(topology);
}

function lightField(count = 18) {
  return Array.from({ length: count }, (_, index) => `<i data-slot="${index + 1}"></i>`).join('');
}

function resetViewport() {
  window.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
}

async function ensureSession() {
  if (state.session) return state.session;
  state.session = await endpoint('/session', { method: 'POST', body: '{}' });
  return state.session;
}

function home() {
  clearWaitingTimer();
  const session = state.session;
  state.session = null;
  state.taps = [];
  state.turn = 'A';
  state.turnReceipt = null;
  state.runId = null;
  state.lastInput = null;
  state.retryKind = null;
  state.lastResult = null;
  state.smartHomeBusy = false;
  clearSmartWaitTimer();
  state.smartSceneTimers.forEach(timer => window.clearTimeout(timer));
  state.smartSceneTimers.clear();
  state.smartSceneStates = {};
  if (session) fetch(`${api}/session/finish`, {
    method: 'POST',
    keepalive: true,
    headers: { 'content-type': 'application/json', origin: window.location.origin },
    body: JSON.stringify({ sessionId: session.sessionId }),
  }).catch(() => {});
  location.hash = '#/';
  renderHome();
}

function card(item) {
  const scene = experienceMap[item?.id];
  if (!scene) return '';
  const recommended = item.recommended ? '<span class="badge">Recommended</span>' : '';
  const number = String(Math.max(1, atlasIndex.indexOf(scene.id) + 1)).padStart(2, '0');
  return `<a class="experience-card scene-${scene.id}" href="#/experience/${scene.id}">
    <div class="card-top"><span>${number} / ${escapeHtml(item.aiRole || scene.mode || 'AI composition')}</span>${recommended}</div>
    <div class="card-content"><h3>${escapeHtml(item.title || scene.title)}</h3><p>${escapeHtml(item.summary || scene.prompt)}</p></div>
    <div class="card-bottom"><span>${escapeHtml(item.duration || '02:00')}</span><span>${icon('arrowRight')}</span></div>
  </a>`;
}

function featuredCard(item) {
  const scene = experienceMap[item?.id];
  if (!scene) return '';
  const number = String(FEATURED_EXPERIENCE_IDS.indexOf(scene.id) + 1).padStart(2, '0');
  return `<a class="experience-card featured-card scene-${scene.id}" href="#/experience/${scene.id}">
    <div class="card-top"><span>${number} / ${escapeHtml(item.aiRole || scene.mode || 'Interactive skill')}</span><span class="card-state">Open experience</span></div>
    <div class="card-content"><h3>${escapeHtml(item.title || scene.title)}</h3><p>${escapeHtml(item.summary || scene.prompt)}</p></div>
    <div class="card-bottom"><span>${escapeHtml(item.duration || '02:00')} · no phone required</span><span>${icon('arrowRight')}</span></div>
  </a>`;
}

function cinemaCard() {
  const status = state.cinema.status;
  const statusLabel = status === 'checking'
    ? 'Checking local service'
    : status === 'reachable'
      ? 'Service detected · open'
      : status === 'unavailable'
        ? 'Service unavailable · retry'
        : 'Separate local experience';
  const message = status === 'unavailable'
    ? 'Cinema Director is not ready on this computer. Retry the local health check before opening it.'
    : 'A film, a soundtrack, and a live light score in its own local space.';
  return `<a class="experience-card featured-card cinema-card cinema-${escapeHtml(status)}" href="${CINEMA_URL}" data-cinema-link aria-describedby="cinema-card-status">
    <div class="card-top"><span>03 / Independent local skill</span><span class="card-state" data-cinema-label>${escapeHtml(statusLabel)}</span></div>
    <div class="card-content"><h3>Cinema Director</h3><p>${escapeHtml(message)}</p></div>
    <div class="card-bottom"><span id="cinema-card-status" data-cinema-status>${escapeHtml(status === 'unavailable' ? 'Health check did not complete' : 'Open the film light game')}</span><span>${icon(status === 'unavailable' ? 'refresh' : 'arrowRight')}</span></div>
  </a>`;
}

function smartSceneStatus(scene) {
  const current = state.smartSceneStates[scene.id] || { phase: 'idle' };
  if (state.smartHomeAvailable === null) return { ...current, phase: 'checking', message: 'Checking preset service' };
  if (state.smartHomeAvailable === false) return { ...current, phase: 'blocked', message: 'Preset service unavailable' };
  if (current.phase === 'loading') return current;
  if (current.phase === 'success') return current;
  if (current.phase === 'applied') return current;
  if (current.phase === 'recovery') return current;
  if (current.phase === 'error') return current;
  return { ...current, phase: 'idle', message: scene.intent || 'Apply this room mood' };
}

function smartSceneCard(scene) {
  const status = smartSceneStatus(scene);
  const loading = status.phase === 'loading';
  const unavailable = status.phase === 'blocked';
  const disabled = state.smartHomeBusy || unavailable || state.smartHomeAvailable !== true;
  const recovery = status.phase === 'recovery';
  const needsRestart = state.smartHomeNeedsRestart && !recovery;
  const actionLabel = loading
    ? status.message || 'Applying the room recipe'
    : status.phase === 'success'
      ? status.message || 'Room response received'
      : status.phase === 'applied'
        ? status.message || 'Applied to the room'
        : status.phase === 'error'
          ? 'Try again'
          : recovery
            ? 'Restart and retry'
          : status.phase === 'checking'
            ? 'Checking preset service'
          : unavailable
            ? 'Preset service unavailable'
            : scene.intent || 'Apply this scene';
  const evidence = `<span class="smart-scene-evidence">${escapeHtml(status.evidence || '')}</span>`;
  return `<button type="button" class="smart-scene-card smart-scene-${escapeHtml(scene.id)} is-${escapeHtml(status.phase)}" data-smart-scene="${escapeHtml(scene.id)}" aria-describedby="smart-scene-status-${escapeHtml(scene.id)}" aria-busy="${loading}"${disabled || needsRestart ? ' disabled' : ''}>
    <span class="smart-scene-art" aria-hidden="true"></span>
    <span class="smart-scene-copy"><span class="smart-scene-kicker">${escapeHtml(scene.intent || 'Smart Home scene')}</span><strong>${escapeHtml(scene.title)}</strong><span>${escapeHtml(scene.summary)}</span></span>
    <span class="smart-scene-footer"><span id="smart-scene-status-${escapeHtml(scene.id)}" class="smart-scene-status" role="status" aria-live="polite">${escapeHtml(actionLabel)}</span>${evidence}<span class="smart-scene-arrow" aria-hidden="true">${icon(status.phase === 'error' || unavailable ? 'refresh' : loading ? 'signal' : status.phase === 'success' || status.phase === 'applied' ? 'check' : 'arrowRight')}</span></span>
  </button>`;
}

function smartHomeSection() {
  const sectionMessage = state.smartHomeAvailable === false
    ? 'The preset service is unavailable. Retry the local check to continue.'
    : state.smartHomeAvailable === null
      ? 'Checking the local preset service before the room controls become active.'
      : 'Four concise examples of a Smart Home Skill turning intent into an 18-light room response.';
  return `<section class="smart-home-section" aria-labelledby="smart-home-title">
    <div class="smart-home-head"><div><div class="eyebrow">Practical application</div><h2 id="smart-home-title">Smart Home Skill</h2><p class="smart-home-tagline">Tell your home what you need.</p></div><div class="smart-home-head-copy"><p data-smart-home-message>${escapeHtml(sectionMessage)}</p><button class="button smart-home-refresh" type="button" data-smart-refresh${state.smartHomeBusy ? ' disabled' : ''}>${icon('refresh')} Check preset service</button></div></div>
    <div class="smart-scene-grid">${state.smartHomeScenes.map(smartSceneCard).join('')}</div>
  </section>`;
}

function renderHome() {
  state.current = null;
  main.dataset.experience = 'home';
  document.title = 'Yeelight Light Experiences';
  const alert = state.installationError
    ? `<div class="home-alert state-box error" role="alert"><strong>Live installation unavailable</strong><p>${escapeHtml(state.installationError)}</p></div>`
    : '';
  main.innerHTML = `<section class="home-hero">
    <div class="hero-copy">
      <div class="eyebrow">IFA collection · Yeelight AI friendly</div>
      <h1>Tell light what you <em>mean.</em></h1>
      <p>Explore two ways AI meets the room: playful Interactive Light Experiences and practical Smart Home scenes that turn everyday intent into physical light.</p>
      <div class="hero-actions"><a class="button primary" href="#/experience/fortune-light">Begin with Fortune Light ${icon('arrowRight')}</a><span class="hero-note">No account · one visitor session · live command acknowledgement</span></div>
    </div>
    <div class="hero-visual" aria-hidden="true">
      <div class="hero-orbit-label">18 SLOT LIGHT FIELD</div>
      <div class="hero-constellation">${lightField()}</div>
      <div class="hero-readout"><i></i><i></i><i></i><i></i></div>
      <div class="hero-orbit-caption"><span>AI plan</span><span>4 quadrants</span></div>
    </div>
  </section>${alert}
  <div class="signal-rail" aria-hidden="true"><span>visitor intent</span><i></i><i></i><i></i><span>room response</span></div>
  <section aria-labelledby="collection-title" class="interactive-section">
    <div class="collection-head"><div><div class="eyebrow">Interactive Light Experiences Skills</div><h2 id="collection-title">Play with the light.</h2></div><p>Three short ways in<br>${escapeHtml(modeLabel())}</p></div>
    <div class="experience-grid">${FEATURED_EXPERIENCE_IDS.map(id => state.catalog.find(item => item?.id === id) || { ...experienceMap[id], summary: experienceMap[id]?.prompt }).filter(Boolean).map(featuredCard).join('')}${cinemaCard()}</div>
  </section>
  ${smartHomeSection()}`;
  bindHome();
  if (state.cinema.status === 'idle') probeCinema();
  if (state.smartHomeAvailable === null) loadSmartHomeScenes();
}

function clearSmartWaitTimer() {
  if (state.smartWaitTimer) window.clearInterval(state.smartWaitTimer);
  state.smartWaitTimer = null;
}

function normalizeSmartScene(scene) {
  if (!scene || typeof scene !== 'object' || typeof scene.id !== 'string') return null;
  const fallback = SMART_HOME_FALLBACK.find(item => item.id === scene.id);
  if (!fallback) return null;
  return {
    ...fallback,
    title: typeof scene.title === 'string' && scene.title.trim() ? scene.title : fallback.title,
    summary: typeof scene.summary === 'string' && scene.summary.trim() ? scene.summary : fallback.summary,
    intent: typeof scene.intent === 'string' && scene.intent.trim() ? scene.intent : fallback.intent,
    accent: typeof scene.accent === 'string' && scene.accent.trim() ? scene.accent : fallback.accent,
  };
}

function smartErrorMessage(error) {
  if (error?.status === 409) return 'Another room response is still finishing. Try again in a moment.';
  if (error?.status === 503) return 'The light installation is not ready yet. Try again when the room is available.';
  if (error?.status === 404) return 'The Smart Home preset service is not available in this installation.';
  return error?.message || 'The room could not apply this scene. Try again.';
}

function smartEvidence(result) {
  const execution = result?.execution || {};
  const evidence = execution.evidence || {};
  const topology = result?.topology || {};
  const physical = Number(evidence.physicalCount ?? topology.physicalCount);
  const logical = Number(evidence.logicalCount ?? topology.logicalCount);
  if (physical === 18) return '18 light positions answered';
  if (physical === 4) return `${logical || 18} positions · 4-zone preview`;
  if (physical > 0) return `${physical} physical zones answered`;
  if (logical > 0) return `${logical} light positions shaped`;
  return 'Room response acknowledged';
}

function smartStatusText(scene, status) {
  if (status.phase === 'loading') return status.message || 'Applying the room recipe';
  if (status.phase === 'success') return status.message || 'Room response received';
  if (status.phase === 'applied') return status.message || 'Applied to the room';
  if (status.phase === 'error') return status.message || 'Try again';
  if (status.phase === 'blocked') return status.message || 'Preset service unavailable';
  return status.message || scene.intent || 'Apply this scene';
}

function updateSmartHomeDom() {
  const section = document.querySelector('.smart-home-section');
  if (!section) return;
  const message = section.querySelector('[data-smart-home-message]');
  if (message) {
    message.textContent = state.smartHomeAvailable === false
      ? (state.smartHomeError || 'The preset service is unavailable. Retry the local check to continue.')
      : state.smartHomeAvailable === null
        ? 'Checking the local preset service before the room controls become active.'
      : state.smartHomeBusy
        ? 'One room request is in progress. Other scenes stay ready for the next visitor.'
        : 'Four concise examples of a Smart Home Skill turning intent into an 18-light room response.';
  }
  const refresh = section.querySelector('[data-smart-refresh]');
  if (refresh) refresh.disabled = state.smartHomeBusy;
  section.querySelectorAll('[data-smart-scene]').forEach(button => {
    const scene = state.smartHomeScenes.find(item => item.id === button.dataset.smartScene);
    if (!scene) return;
    const status = smartSceneStatus(scene);
    const loading = status.phase === 'loading';
    const unavailable = status.phase === 'blocked';
    button.className = `smart-scene-card smart-scene-${scene.id} is-${status.phase}`;
    button.disabled = state.smartHomeBusy || unavailable || state.smartHomeAvailable !== true || state.smartHomeNeedsRestart && status.phase !== 'recovery';
    button.setAttribute('aria-busy', String(loading));
    const statusNode = button.querySelector('.smart-scene-status');
    if (statusNode) statusNode.textContent = smartStatusText(scene, status);
    const evidenceNode = button.querySelector('.smart-scene-evidence');
    if (evidenceNode) evidenceNode.textContent = status.evidence || '';
    const arrow = button.querySelector('.smart-scene-arrow');
    if (arrow) arrow.innerHTML = icon(status.phase === 'error' || status.phase === 'recovery' || unavailable ? 'refresh' : loading || status.phase === 'checking' ? 'signal' : status.phase === 'success' || status.phase === 'applied' ? 'check' : 'arrowRight');
  });
}

async function loadSmartHomeScenes(force = false) {
  if (!force && state.smartHomeAvailable !== null) return;
  state.smartHomeAvailable = null;
  state.smartHomeError = '';
  updateSmartHomeDom();
  try {
    const body = await endpoint('/smart-home/scenes');
    const records = Array.isArray(body) ? body : body?.scenes;
    const scenes = Array.isArray(records) ? records.map(normalizeSmartScene).filter(Boolean) : [];
    if (scenes.length !== SMART_HOME_FALLBACK.length || new Set(scenes.map(scene => scene.id)).size !== SMART_HOME_FALLBACK.length) throw new Error('The preset catalogue is incomplete.');
    state.smartHomeScenes = scenes;
    state.smartHomeAvailable = true;
  } catch (error) {
    state.smartHomeScenes = SMART_HOME_FALLBACK;
    state.smartHomeAvailable = false;
    state.smartHomeError = 'The Smart Home preset service is unavailable. Retry the local check to continue.';
  }
  updateSmartHomeDom();
}

function startSmartWaitTimer(sceneId) {
  clearSmartWaitTimer();
  const phases = ['Translating your request', 'Applying the room recipe', 'Waiting for the room response'];
  const started = Date.now();
  const update = () => {
    const current = state.smartSceneStates[sceneId] || {};
    const index = Math.floor((Date.now() - started) / 1500) % phases.length;
    state.smartSceneStates[sceneId] = { ...current, phase: 'loading', message: phases[index], phaseIndex: index };
    updateSmartHomeDom();
  };
  update();
  state.smartWaitTimer = window.setInterval(update, 1000);
}

async function runSmartHomeScene(sceneId) {
  if (state.smartHomeBusy || state.smartHomeAvailable !== true) return;
  const scene = state.smartHomeScenes.find(item => item.id === sceneId);
  if (!scene) return;
  const existing = state.smartSceneStates[sceneId];
  if (existing?.phase === 'recovery') return restartSmartHomeScene(sceneId);
  state.smartHomeBusy = true;
  state.smartSceneStates[sceneId] = { phase: 'loading', message: 'Translating your request' };
  updateSmartHomeDom();
  startSmartWaitTimer(sceneId);
  const runId = newRunId();
  try {
    const session = await ensureSession();
    const result = await endpoint('/smart-home/scene', {
      method: 'POST',
      body: JSON.stringify({ sessionId: session.sessionId, sceneId: scene.id, runId }),
    });
    clearSmartWaitTimer();
    state.smartHomeBusy = false;
    const execution = result?.execution || {};
    const needsRecovery = ['partial', 'error', 'blocked'].includes(execution.status) || execution.recovery?.needed === true;
    state.smartHomeNeedsRestart = needsRecovery;
    state.smartSceneStates[sceneId] = needsRecovery
      ? { phase: 'recovery', message: 'Response needs a fresh visitor session', evidence: smartEvidence(result), result }
      : { phase: 'success', message: 'Room response received', evidence: smartEvidence(result), result };
    setEvidence(result.topology);
    updateSmartHomeDom();
    if (needsRecovery) return;
    const timer = window.setTimeout(() => {
      const current = state.smartSceneStates[sceneId];
      if (current?.phase !== 'success') return;
      state.smartSceneStates[sceneId] = { ...current, phase: 'applied', message: 'Applied to the room' };
      updateSmartHomeDom();
      state.smartSceneTimers.delete(sceneId);
    }, 4200);
    state.smartSceneTimers.set(sceneId, timer);
  } catch (error) {
    clearSmartWaitTimer();
    state.smartHomeBusy = false;
    state.smartSceneStates[sceneId] = { phase: 'error', message: smartErrorMessage(error) };
    updateSmartHomeDom();
  }
}

async function restartSmartHomeScene(sceneId) {
  if (state.smartHomeBusy || state.smartHomeAvailable !== true) return;
  state.smartHomeBusy = true;
  const previousSession = state.session;
  state.smartSceneStates[sceneId] = { phase: 'loading', message: 'Resetting the visitor session' };
  updateSmartHomeDom();
  try {
    if (previousSession) await endpoint('/session/finish', { method: 'POST', body: JSON.stringify({ sessionId: previousSession.sessionId }) });
  } catch (_) {
    // A new local session is still safe after an expired or already-closed session.
  }
  state.session = null;
  state.smartHomeNeedsRestart = false;
  state.smartHomeBusy = false;
  state.smartSceneStates = {};
  updateSmartHomeDom();
  return runSmartHomeScene(sceneId);
}

async function probeCinema(force = false) {
  if (!force && state.cinema.status !== 'idle') return;
  state.cinema = { status: 'checking', message: '' };
  updateCinemaDom();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 900);
  try {
    await endpoint(CINEMA_HEALTH_URL, { method: 'GET', cache: 'no-store', signal: controller.signal });
    state.cinema = { status: 'reachable', message: '' };
  } catch (_) {
    state.cinema = { status: 'unavailable', message: 'Cinema Director is not ready on this computer.' };
  } finally {
    window.clearTimeout(timeout);
    updateCinemaDom();
  }
}

function updateCinemaDom() {
  const card = document.querySelector('[data-cinema-link]');
  if (!card) return;
  const label = card.querySelector('[data-cinema-label]');
  const status = card.querySelector('[data-cinema-status]');
  const stateName = state.cinema.status;
  const labelText = stateName === 'checking'
    ? 'Checking local service'
    : stateName === 'reachable'
      ? 'Service detected · open'
      : stateName === 'unavailable'
        ? 'Service unavailable · retry'
        : 'Separate local experience';
  if (label) label.textContent = labelText;
  if (status) status.textContent = stateName === 'unavailable' ? 'Health check did not complete' : 'Open the film light game';
  card.classList.remove('cinema-idle', 'cinema-checking', 'cinema-reachable', 'cinema-unavailable');
  card.classList.add(`cinema-${stateName}`);
}

function bindHome() {
  document.querySelectorAll('[data-smart-scene]').forEach(button => button.addEventListener('click', () => runSmartHomeScene(button.dataset.smartScene)));
  document.querySelector('[data-smart-refresh]')?.addEventListener('click', () => loadSmartHomeScenes(true));
  document.querySelector('[data-cinema-link]')?.addEventListener('click', event => {
    if (state.cinema.status === 'unavailable') {
      event.preventDefault();
      probeCinema(true);
    }
  });
}

function sceneArt(id) {
  const index = String(Math.max(1, atlasIndex.indexOf(id) + 1)).padStart(2, '0');
  return `<div class="stage-art scene-${id}" aria-hidden="true"><div class="stage-art-signal"><i></i><i></i><i></i><i></i></div><span class="stage-art-label">Ambient field · scene ${index}</span><span class="stage-art-index">${index}<b>/12</b></span></div>`;
}

const waitingPhases = {
  'fortune-light': ['Reading the coordinates', 'Finding a balancing pair', 'Shaping the luminous reveal', 'Letting the room answer', 'Checking the final glow'],
  'light-dna': ['Listening to the four signals', 'Layering your choices', 'Shaping a light signature', 'Letting the room answer', 'Checking the final glow'],
  'shared-breath': ['Listening to both cadences', 'Finding a common tempo', 'Shaping the shared rhythm', 'Letting the room answer', 'Checking the final glow'],
  'sensory-translator': ['Reading the scene mood', 'Balancing comfort and character', 'Shaping the translation', 'Letting the room answer', 'Checking the final glow'],
  'close-the-day': ['Noticing the two signals', 'Sorting release and keep', 'Shaping the quiet motif', 'Letting the room answer', 'Checking the final glow'],
  'light-game-arena': ['Reviewing the game signal', 'Scoring the remembered sequence', 'Shaping the winning field', 'Letting the room answer', 'Checking the final glow'],
  luma: ['Listening for a temperament', 'Blending three traits', 'Shaping the light spirit', 'Letting the room answer', 'Checking the final glow'],
  'memory-capsule': ['Measuring the small fragment', 'Reducing it to a safe shape', 'Shaping the light postcard', 'Letting the room answer', 'Checking the final glow'],
  'intention-garden': ['Reading the garden signal', 'Growing the bounded seed', 'Shaping the shared field', 'Letting the room answer', 'Checking the final glow'],
  'common-ground': ['Listening to both priorities', 'Finding the overlap', 'Shaping a workable middle', 'Letting the room answer', 'Checking the final glow'],
  'no-shared-prompt': ['Inspecting the shared state', 'Keeping the prompt empty', 'Shaping the next response', 'Letting the room answer', 'Checking the final glow'],
  'impossible-light': ['Reading the contradiction', 'Weighing the trade-off', 'Shaping a coherent answer', 'Letting the room answer', 'Checking the final glow'],
};

function clearWaitingTimer() {
  if (state.waitTimer) window.clearInterval(state.waitTimer);
  state.waitTimer = null;
}

function waitingMarkup(id, restoring = false) {
  const phases = restoring
    ? ['Checking the last trusted state', 'Replaying only confirmed changes', 'Reading the room again']
    : (waitingPhases[id] || waitingPhases['fortune-light']);
  return `<div class="waiting-scene ${restoring ? 'is-restoring' : ''}" data-waiting data-waiting-phases='${JSON.stringify(phases)}'>
    <div class="waiting-orbit" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="waiting-copy"><span class="preview-kicker">${restoring ? 'Verified restore' : 'The room is responding'}</span><h3 data-waiting-phase aria-live="polite">${escapeHtml(phases[0])}</h3><p>${restoring ? 'The installation is checking a trusted snapshot before it changes anything.' : 'The light plan is being interpreted, checked, and answered by the installation.'}</p><div class="waiting-meta"><span>Elapsed <strong data-waiting-elapsed>0:00</strong></span><span data-waiting-note>Stay with the field</span></div></div>
  </div>`;
}

function startWaitingTimer() {
  const root = document.querySelector('[data-waiting]');
  if (!root) return;
  const phases = JSON.parse(root.dataset.waitingPhases || '[]');
  const started = Date.now();
  const phase = root.querySelector('[data-waiting-phase]');
  const elapsed = root.querySelector('[data-waiting-elapsed]');
  const note = root.querySelector('[data-waiting-note]');
  const update = () => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainder = String(seconds % 60).padStart(2, '0');
    if (elapsed) elapsed.textContent = `${minutes}:${remainder}`;
    const phaseIndex = Math.floor(seconds / 3) % Math.max(1, phases.length);
    if (phase && phases[phaseIndex]) phase.textContent = phases[phaseIndex];
    if (note) note.textContent = seconds > 45 ? 'Taking a careful read of the installation' : seconds > 15 ? 'The field is still taking shape' : 'Stay with the field';
    root.style.setProperty('--waiting-phase', String(phaseIndex));
  };
  update();
  state.waitTimer = window.setInterval(update, 1000);
}

function renderExperience(id, stateName = 'form', result = null) {
  const item = experienceMap[id];
  if (!item) return home();
  clearWaitingTimer();
  state.current = id;
  main.dataset.experience = id;
  document.title = `${item.title} · Yeelight Light Experiences`;
  if (stateName === 'form') {
    state.lastInput = null;
    state.retryKind = null;
  }
  if (stateName === 'result') state.lastResult = result;
  const sequential = ['common-ground', 'shared-breath', 'light-game-arena'].includes(id);
  const terminalTurn = sequential && state.turn === 'B';
  const prompt = sequential && state.turn === 'B'
    ? 'Participant B chooses privately. The first selection stays off this screen.'
    : item.prompt;
  const submitLabel = sequential && state.turn === 'A' ? 'Save private turn' : 'Compose with the installation';
  const stateBody = stateName === 'loading'
    ? waitingMarkup(id)
    : stateName === 'restoring'
      ? waitingMarkup(id, true)
      : stateName === 'error'
        ? errorMarkup(result, terminalTurn)
        : stateName === 'result'
          ? resultMarkup(item, result)
          : `<p>${escapeHtml(prompt)}</p><form id="experience-form">${renderExperienceForm(id, { turn: state.turn })}<div class="action-row"><button class="button primary" type="submit">${submitLabel} ${icon('play')}</button><button class="button" type="button" data-home>Return home</button></div></form>`;
  main.innerHTML = `<section class="route-head"><div><a class="eyebrow" href="#/">Collection</a><span class="route-index">${String(Math.max(1, atlasIndex.indexOf(id) + 1)).padStart(2, '0')} / 12</span><h1>${escapeHtml(item.title)}</h1><div class="route-meta">${escapeHtml(item.mode)}</div></div><button class="button" data-finish>Finish ${icon('close')}</button></section><section class="experience-layout"><article class="stage scene-${id}">${sceneArt(id)}<div class="stage-content">${stateBody}</div></article></section>`;
  if (stateName !== 'form') resetViewport();
  bindPage(id, stateName);
  if (stateName === 'loading' || stateName === 'restoring') startWaitingTimer();
}

function errorMarkup(result, terminalTurn) {
  const disposition = result?.retryDisposition || 'restart';
  const canRetry = !terminalTurn && (state.retryKind === 'handoff' || disposition === 'new_run');
  const action = canRetry
    ? `<button class="button" data-retry data-disposition="${escapeHtml(disposition)}">${icon('refresh')} Try again</button>`
    : `<button class="button" data-restart>${icon('refresh')} Restart interaction</button>`;
  const note = canRetry ? '' : '<p class="micro-note">The installation will not replay an uncertain physical action. Start a fresh interaction to continue.</p>';
  return `<div class="state-box error"><h3>${terminalTurn ? 'This private turn is closed' : 'Execution paused'}</h3><p>${escapeHtml(result?.message || 'The experience could not complete.')}</p>${note}${action}</div>`;
}

function resultMarkup(item, result) {
  const plan = result?.plan || {};
  const execution = result?.execution || {};
  const recovery = execution.recovery;
  const source = plan.source || 'deterministic';
  const interpretation = result?.execution?.verification === 'write_acknowledged'
    ? 'Your choices became a closed light plan, and the live Runtime accepted the command without an extra state-read delay.'
    : source === 'ai'
      ? 'Your choices became an AI-crafted light idea, then the installation checked the response.'
      : 'A bounded local light idea was validated, then the installation checked the response.';
  const evidence = execution.evidence || {};
  const lightResponse = execution.status === 'success' || execution.status === 'acknowledged'
    ? `${Number(evidence.physicalCount) === 4 ? 'Four live zones' : Number(evidence.physicalCount) === 18 ? 'Eighteen lights' : 'The light field'} responded`
    : execution.status === 'partial' ? 'The light field paused part-way' : 'The light field did not complete';
  const interpretationLabel = source === 'ai' ? 'AI-crafted idea' : source === 'fallback' ? 'Local fallback idea' : 'Local idea';
  const statusLabel = execution.status === 'success' ? 'Light response verified' : execution.status === 'acknowledged' ? 'Light command acknowledged' : execution.status === 'partial' ? 'Response needs attention' : 'Response paused';
  const recoveryAction = recovery?.restoreAvailable
    ? '<button class="button danger" data-recover>Restore verified state</button>'
    : recovery?.needed
      ? `<p>${escapeHtml(recovery.message || 'A trusted restore is unavailable for this run.')}</p>`
      : '';
  return `<div class="result-intro"><div class="eyebrow">${escapeHtml(interpretationLabel)}</div><h2>${escapeHtml(plan.summary || 'Composition ready')}</h2><p>${escapeHtml(plan.explanation || 'The installation produced a bounded light response.')}</p></div>${sceneResultMarkup(item.id, result)}<div class="result-light-field" aria-hidden="true">${lightField(4)}</div><div class="plan-bars" aria-hidden="true"><i class="bar-primary"></i><i class="bar-secondary"></i><i class="bar-tertiary"></i><i class="bar-quaternary"></i></div><div class="result-ledger"><div><strong>Light response</strong><span>${escapeHtml(lightResponse)}</span></div><div><strong>Field shaped</strong><span>${escapeHtml(`${Number(evidence.logicalCount) || 18} positions`)}</span></div><div><strong>Visit state</strong><span>${escapeHtml(statusLabel)}</span></div></div><div class="state-box"><h3>${escapeHtml(statusLabel)}</h3><p>${interpretation}</p>${recoveryAction}</div><div class="action-row"><button class="button primary" data-finish>Finish and clear</button><button class="button" data-home>Choose another</button></div>`;
}

function sceneResultMarkup(id, result) {
  const features = result?.features || {};
  if (id === 'fortune-light' && features.primary) return `<div class="scene-result"><span class="preview-kicker">Balance found</span><strong>${escapeHtml(features.primary)} / ${escapeHtml(features.secondary || 'Earth')}</strong><small>${escapeHtml(`${Number(features.ratio) || 55}% leading material · ${100 - (Number(features.ratio) || 55)}% balancing material`)}</small></div>`;
  if (id === 'light-dna') return `<div class="scene-result"><span class="preview-kicker">Signature readout</span><strong>${escapeHtml(`${Number(features.roundsCompleted) || 0} contrasts · ${Number(features.ratio) || 52}% intensity`)}</strong><small>The four choices now drive the shape of the light field.</small></div>`;
  if (id === 'shared-breath') return `<div class="scene-result"><span class="preview-kicker">Shared cadence</span><strong>Two private rhythms converged</strong><small>The original tap timings stay private; only the shared category shaped the room.</small></div>`;
  if (id === 'sensory-translator') return `<div class="scene-result"><span class="preview-kicker">Translation readout</span><strong>${escapeHtml(`${features.comfort || 'balanced'} comfort · ${features.tempo || 'measured'} motion`)}</strong><small>${escapeHtml(`${Number(features.ratio) || 48}% brightness became the translation bias.`)}</small></div>`;
  if (id === 'close-the-day') return `<div class="scene-result"><span class="preview-kicker">Four-act close</span><strong>Release and keep became one motif</strong><small>Notice → sort → release → keep, carried by the final light field.</small></div>`;
  if (id === 'light-game-arena') return `<div class="scene-result"><span class="preview-kicker">Game result</span><strong>${escapeHtml(`${Number(features.score) || 0} / ${Number(features.roundsCompleted) || 3} rounds solved`)}</strong><small>The lights presented the questions; the score is all that leaves the game.</small></div>`;
  if (id === 'luma') return `<div class="scene-result"><span class="preview-kicker">Luma temperament</span><strong>${escapeHtml(`${Array.isArray(features.choices) ? features.choices.length : 0} traits blended`)}</strong><small>A three-phase character arc now lives in the light.</small></div>`;
  if (id === 'memory-capsule') return `<div class="scene-result"><span class="preview-kicker">Postcard sealed</span><strong>${escapeHtml(`${features.lengthBucket || 'small'} fragment · ${features.mood || 'steady'} tone`)}</strong><small>The original fragment was discarded before interpretation.</small></div>`;
  if (id === 'intention-garden' && result?.garden) {
    const counts = result.garden.counts || {};
    const total = Number(result.garden.total) || 0;
    return `<div class="scene-result garden-result"><span class="preview-kicker">Garden pulse</span><strong>${escapeHtml(`${total} seeds in the shared field`)}</strong><small>${escapeHtml(Object.entries(counts).map(([name, count]) => `${name} ${count}`).join(' · '))}</small></div>`;
  }
  if (id === 'common-ground') return `<div class="scene-result"><span class="preview-kicker">Common ground</span><strong>${features.overlap === 'direct' ? 'A direct overlap' : 'A complementary overlap'}</strong><small>Both private priorities moved toward one shared light field.</small></div>`;
  if (id === 'no-shared-prompt') {
    const observation = features.stateObservation || {};
    return `<div class="scene-result"><span class="preview-kicker">State handoff</span><strong>Prompt stayed empty</strong><small>${escapeHtml(`${observation.brightnessBand || 'Bounded brightness'} · ${observation.colorFamily || 'coarse color'} · ${observation.onlineBand || 'online check'}`)}</small></div>`;
  }
  if (id === 'impossible-light') return `<div class="scene-result"><span class="preview-kicker">Contradiction resolved</span><strong>${escapeHtml(`${Number(features.ratio) || 50}% middle path`)}</strong><small>The two constraints stayed visible while the light found a workable balance.</small></div>`;
  return '';
}

function renderHandoff(id) {
  main.dataset.experience = id;
  main.innerHTML = `<section class="handoff"><div><div class="eyebrow">Private turn complete</div><h2>Pass the screen to the next participant.</h2><p>Private choices from the prior turn have been cleared from this view.</p><button class="button primary" data-continue>Start participant B ${icon('arrowRight')}</button><button class="button" data-home>Exit to collection</button></div></section>`;
  resetViewport();
  document.querySelector('[data-continue]').addEventListener('click', () => renderExperience(id));
  document.querySelector('[data-home]').addEventListener('click', home);
}

function selectedValue(name) {
  return document.querySelector(`[name="${name}"]:checked`)?.value || '';
}

function updateExperiencePreview(id) {
  if (id === 'fortune-light') {
    const date = document.querySelector('[name="birthDate"]')?.value || '';
    const city = document.querySelector('[name="birthplace"]')?.value || '';
    const label = document.querySelector('[data-fortune-label]');
    const detail = document.querySelector('[data-fortune-detail]');
    const field = document.querySelector('[data-fortune-preview]');
    if (label) label.textContent = date && city ? `${city} · coordinates found` : date || city || 'Set the coordinates';
    if (detail) detail.textContent = date && city ? 'Two balancing materials are ready to emerge.' : 'The room will turn a date and place into a luminous pair.';
    field?.toggleAttribute('data-ready', Boolean(date && city));
  }
  if (id === 'light-dna') {
    const rounds = [...document.querySelectorAll('[name^="dna-"]:checked')].filter(input => !input.name.includes('intensity'));
    const intensities = [...document.querySelectorAll('[data-live-value^="dna-intensity"]')].map(input => Number(input.value));
    const count = rounds.length;
    const average = intensities.length ? Math.round(intensities.reduce((sum, value) => sum + value, 0) / intensities.length) : 52;
    document.querySelector('[data-dna-count]')?.replaceChildren(`${count} / 4 locked`);
    document.querySelector('[data-dna-intensity]')?.replaceChildren(`${average}%`);
    document.querySelector('[data-dna-signal]')?.replaceChildren(count ? rounds.map(input => input.value.split(' ')[0]).join(' · ') : 'Waiting for the first contrast');
    const field = document.querySelector('[data-dna-preview]');
    if (field) field.dataset.signalCount = String(count);
  }
  if (id === 'sensory-translator') {
    const scene = document.querySelector('[name="scene"]');
    const brightness = Number(document.querySelector('[name="comfortBrightness"]')?.value || 48);
    const pace = Number(document.querySelector('[name="motionPace"]')?.value || 1);
    const translation = selectedValue('translation');
    const sceneLabel = scene?.selectedOptions?.[0]?.textContent?.replace(/^A\s+/i, '') || 'Saturated sunset';
    document.querySelector('[data-translator-scene]')?.replaceChildren(sceneLabel);
    document.querySelector('[data-translator-readout]')?.replaceChildren(`Comfort ${brightness}% · motion ${pace} / 3`);
    const preview = document.querySelector('[data-translator-preview]');
    if (preview) {
      preview.dataset.translation = translation;
      preview.style.setProperty('--comfort-level', `${brightness}%`);
      preview.style.setProperty('--motion-level', `${pace}`);
    }
  }
  if (id === 'close-the-day') {
    const release = selectedValue('release');
    const keep = selectedValue('keep');
    const label = document.querySelector('[data-ritual-label]');
    const detail = document.querySelector('[data-ritual-detail]');
    const rail = [...document.querySelectorAll('.ritual-rail i')];
    const complete = Number(Boolean(release)) + Number(Boolean(keep));
    if (label) label.textContent = complete === 2 ? 'Ready to release and keep' : complete === 1 ? 'Sort the second signal' : 'Notice what is here';
    if (detail) detail.textContent = release && keep ? `${release} · ${keep}` : 'Release one weight. Keep one useful spark.';
    rail.forEach((dot, index) => dot.classList.toggle('is-active', index <= complete));
  }
  if (id === 'light-game-arena') {
    const cards = [...document.querySelectorAll('[data-round-card]')];
    const answered = cards.filter(card => card.querySelector('input:checked'));
    const score = answered.filter(card => card.querySelector('input:checked')?.value === card.dataset.answer).length;
    document.querySelector('[data-game-score]')?.replaceChildren(`${score} / 3`);
    const feedback = document.querySelector('[data-game-feedback]');
    if (feedback) feedback.textContent = answered.length ? `${score} correct · ${answered.length} round${answered.length === 1 ? '' : 's'} locked` : 'Choose an answer to lock a round.';
    document.querySelector('[data-game-feedback]')?.toggleAttribute('data-ready', answered.length > 0);
  }
  if (id === 'luma') {
    const choices = [selectedValue('energy'), selectedValue('curiosity'), selectedValue('movement')].filter(Boolean);
    const names = choices.map(value => value.split(' ')[0]);
    document.querySelector('[data-luma-name]')?.replaceChildren(choices.length ? names.join(' · ') : 'Waiting for a temperament');
    document.querySelector('[data-luma-readout]')?.replaceChildren(choices.length ? `${choices.length} of 3 traits tuned` : 'Three choices become one character.');
    const preview = document.querySelector('[data-luma-preview]');
    if (preview) preview.dataset.traits = String(choices.length);
  }
  if (id === 'memory-capsule') {
    const input = document.querySelector('[name="fragment"]');
    const mood = document.querySelector('[name="mood"]')?.value || 'steady';
    const text = String(input?.value || '').trim();
    document.querySelector('[data-memory-preview]')?.replaceChildren(text || 'A small fragment becomes a light, not a record.');
    document.querySelector('[data-memory-tone]')?.replaceChildren(`${mood[0].toUpperCase()}${mood.slice(1)} tone`);
    document.querySelector('[data-memory-count]')?.replaceChildren(String(text.length));
    document.querySelector('[data-memory-card]')?.setAttribute('data-mood', mood);
  }
  if (id === 'intention-garden') {
    const intention = selectedValue('intention');
    document.querySelector('[data-garden-label]')?.replaceChildren(intention ? `${intention} seed selected` : 'Choose one seed');
    const preview = document.querySelector('[data-garden-preview]');
    if (preview) preview.dataset.seed = intention.toLowerCase();
    document.querySelectorAll('[data-garden-sprouts] i').forEach((sprout, index) => sprout.classList.toggle('is-grown', Boolean(intention) && index <= choiceIndex(intention)));
  }
  if (id === 'common-ground') {
    const choice = selectedValue('groundChoice');
    document.querySelector('[data-ground-label]')?.replaceChildren(choice ? `${choice} held privately` : 'Keep your priority private');
    const preview = document.querySelector('[data-ground-preview]');
    if (preview) preview.dataset.choice = choice.toLowerCase();
  }
  if (id === 'no-shared-prompt') {
    const intent = selectedValue('stateIntent');
    const inspect = document.querySelector('[name="inspectState"]')?.checked;
    const log = document.querySelector('[data-inspection-log]');
    if (log) {
      const entries = log.querySelectorAll('span');
      if (entries[1]) entries[1].textContent = inspect ? 'State read permitted' : 'State read paused';
      if (entries[2]) entries[2].textContent = intent ? `${intent} selected` : 'Intent unchosen';
      log.dataset.ready = String(Boolean(intent && inspect));
    }
  }
  if (id === 'impossible-light') {
    const first = selectedValue('constraintOne');
    const second = selectedValue('constraintTwo');
    const bias = Number(document.querySelector('[name="resolutionBias"]')?.value || 50);
    document.querySelector('[data-constraint-one]')?.replaceChildren(first || 'Constraint one');
    document.querySelector('[data-constraint-two]')?.replaceChildren(second || 'Constraint two');
    document.querySelector('[data-resolution-readout]')?.replaceChildren(`${bias}%`);
    const preview = document.querySelector('[data-impossible-preview]');
    if (preview) preview.style.setProperty('--resolution-level', `${bias}%`);
  }
}

function choiceIndex(value) {
  return ['Welcome', 'Focus', 'Ease', 'Wonder'].indexOf(value);
}

function bindPage(id, stateName) {
  document.querySelectorAll('[data-home]').forEach(button => button.addEventListener('click', home));
  document.querySelectorAll('[data-finish]').forEach(button => button.addEventListener('click', finish));
  document.querySelector('[data-retry]')?.addEventListener('click', event => {
    if (event.currentTarget.dataset.disposition === 'new_run') state.runId = null;
    state.retryKind === 'handoff' ? handoff(id) : run(id);
  });
  document.querySelector('[data-restart]')?.addEventListener('click', () => restart(id));
  document.querySelector('[data-recover]')?.addEventListener('click', () => restore(id));
  const nextRound = document.querySelector('[data-next-round]');
  if (nextRound) {
    const cards = [...document.querySelectorAll('[data-round-card]')];
    let active = cards.findIndex(card => !card.hidden);
    nextRound.addEventListener('click', () => {
      if (active < 0) active = 0;
      if (!cards[active]?.querySelector('input:checked')) {
        cards[active]?.classList.add('needs-choice');
        cards[active]?.querySelector('input')?.focus();
        return;
      }
      const next = active + 1;
      if (next >= cards.length) { nextRound.hidden = true; document.querySelector('[data-round-progress]')?.replaceChildren('All four contrasts ready'); return; }
      cards[next].hidden = false;
      cards[next].disabled = false;
      cards[next].removeAttribute('disabled');
      active = next;
      document.querySelector('[data-round-progress]')?.replaceChildren(`Round ${next + 1} of ${cards.length}`);
      if (next === cards.length - 1) nextRound.textContent = 'Reveal final contrast';
    });
  }
  document.querySelectorAll('[data-live-value]').forEach(input => {
    const output = document.querySelector(`[data-value-for="${input.name}"]`);
    if (!output) return;
    const update = () => { output.textContent = `${input.value}${output.dataset.unit || ''}`; };
    input.addEventListener('input', update);
    update();
  });
  const form = document.querySelector('#experience-form');
  form?.addEventListener('change', () => updateExperiencePreview(id));
  form?.addEventListener('input', () => updateExperiencePreview(id));
  updateExperiencePreview(id);
  const tap = document.querySelector('[data-tap]');
  if (tap) tap.addEventListener('click', () => {
    if (state.taps.length < 4) state.taps.push(Date.now());
    document.querySelector('[data-taps]').textContent = `${state.taps.length} / 4 beats`;
    document.querySelectorAll('.rhythm-meter i').forEach((dot, index) => dot.classList.toggle('is-on', index < state.taps.length));
    const preview = document.querySelector('[data-breath-preview]');
    if (preview) {
      preview.dataset.beats = String(state.taps.length);
      document.querySelector('[data-breath-label]')?.replaceChildren(state.taps.length < 4 ? `Beat ${state.taps.length} · keep listening` : 'Cadence captured');
      document.querySelector('[data-breath-detail]')?.replaceChildren(state.taps.length < 4 ? 'The field is following your pace.' : 'A coarse rhythm category is ready for the shared relay.');
      preview.classList.remove('is-pulsing');
      void preview.offsetWidth;
      preview.classList.add('is-pulsing');
    }
  });
  const memory = document.querySelector('[name="fragment"]');
  if (memory) memory.addEventListener('input', event => { const output = document.querySelector('[data-memory-count]'); if (output) output.textContent = String(event.currentTarget.value.length); });
  document.querySelectorAll('[name="intention"]').forEach(input => input.addEventListener('change', event => { const preview = document.querySelector('[data-garden-preview] strong'); if (preview) preview.textContent = `${event.currentTarget.value} seed selected`; }));
  const turnExperience = ['shared-breath', 'light-game-arena', 'common-ground'].includes(id);
  form?.addEventListener('submit', event => {
    event.preventDefault();
    if (id === 'shared-breath' && state.taps.length < 4) {
      document.querySelector('.tap-panel')?.insertAdjacentHTML('beforeend', '<div class="state-box error" role="alert"><h3>Cadence incomplete</h3><p>Tap a four-beat cadence before continuing.</p></div>');
      return;
    }
    if (id === 'light-dna' && document.querySelectorAll('[data-round-card] input:checked').length < 4) {
      document.querySelector('.interview-grid')?.insertAdjacentHTML('beforebegin', '<div class="state-box error" role="alert"><h3>Complete the four signals</h3><p>Lock one choice in each contrast before revealing your light signature.</p></div>');
      return;
    }
    if (id === 'light-game-arena') {
      const cards = document.querySelectorAll('[data-round-card]');
      if ([...cards].some(card => !card.querySelector('input:checked'))) {
        document.querySelector('[data-game-feedback]')?.replaceChildren('Lock an answer for every visible round before continuing.');
        document.querySelector('[data-game-feedback]')?.setAttribute('data-ready', 'false');
        return;
      }
    }
    if (turnExperience && state.turn === 'A') return handoff(id, event.currentTarget);
    run(id, event.currentTarget);
  });
}

async function handoff(id, form) {
  try {
    const sourceForm = form || document.querySelector('#experience-form');
    const input = sourceForm ? collectInput(sourceForm, id, state.taps, { turn: 'A' }) : state.lastInput;
    if (!input) throw new Error('The private turn is no longer available. Start a fresh interaction.');
    state.lastInput = input;
    state.retryKind = 'handoff';
    const session = await ensureSession();
    const result = await endpoint(`/experience/${id}/turn/start`, { method: 'POST', body: JSON.stringify({ sessionId: session.sessionId, input }) });
    state.turnReceipt = result.turn.receipt;
    state.turn = 'B';
    state.taps = [];
    state.lastInput = null;
    state.retryKind = null;
    renderHandoff(id);
  } catch (error) { renderExperience(id, 'error', error); }
}

function newRunId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function run(id, form = document.querySelector('#experience-form')) {
  const sourceForm = form || document.querySelector('#experience-form');
  const input = sourceForm ? collectInput(sourceForm, id, state.taps, { turn: state.turn }) : state.lastInput;
  if (!input) return renderExperience(id, 'error', { message: 'This interaction expired. Start a fresh run to continue.' });
  state.lastInput = input;
  state.retryKind = 'run';
  renderExperience(id, 'loading');
  state.runId ||= newRunId();
  try {
    const session = await ensureSession();
    const payload = { sessionId: session.sessionId, runId: state.runId, input };
    if (state.turn === 'B' && state.turnReceipt) payload.turnReceipt = state.turnReceipt;
    const result = await endpoint(`/experience/${id}/run`, { method: 'POST', body: JSON.stringify(payload) });
    state.runId = null;
    state.turnReceipt = null;
    state.turn = 'A';
    state.taps = [];
    state.lastInput = null;
    state.retryKind = null;
    setEvidence(result.topology);
    renderExperience(id, 'result', result);
  } catch (error) { renderExperience(id, 'error', error); }
}

async function restore(id) {
  const session = state.session;
  const requestId = state.lastResult?.requestId;
  const recoveryRef = state.lastResult?.execution?.recovery?.recoveryRef;
  if (!session || !requestId || !recoveryRef) return renderExperience(id, 'error', { message: 'The verified restore is no longer available.' });
  renderExperience(id, 'restoring');
  try {
    const restored = await endpoint(`/experience/${id}/restore`, { method: 'POST', body: JSON.stringify({ sessionId: session.sessionId, requestId, recoveryRef }) });
    const result = { ...state.lastResult, requestId: restored.requestId, execution: restored.execution, topology: restored.topology };
    setEvidence(restored.topology);
    renderExperience(id, 'result', result);
  } catch (error) { renderExperience(id, 'error', error); }
}

async function finish() {
  clearWaitingTimer();
  const session = state.session;
  state.session = null;
  state.runId = null;
  state.turnReceipt = null;
  state.taps = [];
  state.turn = 'A';
  state.lastInput = null;
  state.retryKind = null;
  state.lastResult = null;
  try { if (session) await endpoint('/session/finish', { method: 'POST', body: JSON.stringify({ sessionId: session.sessionId }) }); } catch (_) { /* Local state is cleared before the best-effort transition. */ }
  home();
}

async function restart(id) {
  clearWaitingTimer();
  const session = state.session;
  state.session = null;
  state.runId = null;
  state.turnReceipt = null;
  state.taps = [];
  state.turn = 'A';
  state.lastInput = null;
  state.retryKind = null;
  state.lastResult = null;
  try {
    if (session) await endpoint('/session/finish', { method: 'POST', body: JSON.stringify({ sessionId: session.sessionId }) });
  } catch (_) {
    // The local state is reset even if the expired session cannot be closed.
  }
  renderExperience(id);
}

async function boot() {
  try {
    const health = await endpoint('/health');
    state.mode = health.mode || state.mode;
    state.scenario = health.scenario || state.scenario;
    const [catalog, topology, provider] = await Promise.all([endpoint('/catalog'), endpoint(`/topology?mode=${state.mode}&scenario=${state.scenario}`), endpoint('/provider/status')]);
    state.catalog = Array.isArray(catalog) ? catalog : catalog.experiences || [];
    state.provider = provider;
    state.installationError = '';
    setEvidence(topology);
  } catch (_) {
    state.catalog = Object.values(experienceMap).map(item => ({ ...item, summary: item.prompt, duration: '02:00', recommended: item.id === 'fortune-light' }));
    state.installationError = state.mode.startsWith('live') ? 'The live room is not ready yet. Visitor actions stay paused until the installation is available.' : '';
    evidence.textContent = state.mode.startsWith('live') ? 'Live installation unavailable · visitor mode paused' : 'Offline catalogue · local preview only';
  }
  const selected = route();
  selected ? renderExperience(selected) : renderHome();
}

window.addEventListener('hashchange', () => { const selected = route(); if (!selected && state.session) home(); else selected ? renderExperience(selected) : renderHome(); });
window.addEventListener('pagehide', () => {
  clearWaitingTimer();
  const session = state.session;
  state.session = null;
  state.runId = null;
  state.turnReceipt = null;
  state.taps = [];
  state.turn = 'A';
  state.lastInput = null;
  state.retryKind = null;
  state.lastResult = null;
  if (session) fetch(`${api}/session/finish`, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', origin: window.location.origin }, body: JSON.stringify({ sessionId: session.sessionId }) }).catch(() => {});
});
window.addEventListener('pageshow', event => { if (!event.persisted) return; state.session = null; state.runId = null; state.turnReceipt = null; state.taps = []; state.turn = 'A'; state.lastInput = null; state.retryKind = null; state.lastResult = null; location.hash = '#/'; renderHome(); });
document.querySelector('[data-home]').addEventListener('click', home);
document.querySelector('[data-finish]').addEventListener('click', finish);
boot();
