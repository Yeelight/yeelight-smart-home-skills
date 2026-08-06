const experiences = [
  ['fortune-light', 'Fortune Light', 'Five Elements study', 'Enter a date and place. Two materials emerge, then resolve into one bounded reveal.'],
  ['light-dna', 'Light DNA', 'Four-round visual interview', 'Let the installation show four contrasts, then choose the signal that feels most like you.'],
  ['shared-breath', 'Shared Breath', 'Private sequential relay', 'Two people create separate, comfortable cadences. The lights negotiate a shared rhythm.'],
  ['sensory-translator', 'Sensory Translator', 'Scene translation', 'Keep the character of a vivid scene while tuning brightness, saturation, and motion.'],
  ['close-the-day', 'Close the Day', 'Release / keep composition', 'Choose what to release and keep. The installation sorts the two signals into a quiet final motif.'],
  ['light-game-arena', 'Light Game Arena', 'Three-round memory game', 'Recall the light sequence, order the colors, and decode the final signal for a score.'],
  ['luma', 'Luma / Light Spirit', 'Three-trait character build', 'Shape a light character through energy, curiosity, and movement.'],
  ['memory-capsule', 'Memory Capsule', 'One-time postcard', 'Write a short non-identifying fragment. Only its bounded shape becomes a light postcard.'],
  ['intention-garden', 'Intention Garden', 'Bounded collective garden', 'Plant one curated intention. The anonymous garden grows with capped category counts.'],
  ['common-ground', 'Common Ground', 'Private two-turn negotiation', 'Two private priorities meet only after the screen has passed to the next participant.'],
  ['no-shared-prompt', 'No Shared Prompt', 'Server state inspection', 'A second agent receives no first prompt and reads only an allowlisted light-state observation.'],
  ['impossible-light', 'Impossible Light', 'Constraint resolution', 'Combine two tensions and inspect how the Skill resolves the trade-off.'],
];

export const experienceMap = Object.fromEntries(experiences.map(([id, title, mode, prompt]) => [id, { id, title, mode, prompt }]));

const choiceSets = {
  'sensory-translator': ['Quiet contrast', 'Lower saturation', 'Soft transition', 'Clear warmth'],
  'close-the-day-release': ['Release urgency', 'Release noise', 'Release clutter', 'Release speed'],
  'close-the-day-keep': ['Keep warmth', 'Keep direction', 'Keep curiosity', 'Keep ease'],
  lumaEnergy: ['Still and observant', 'Bright and curious', 'Warm and social', 'Precise and playful'],
  lumaCuriosity: ['Stay close', 'Look outward', 'Change color', 'Follow motion'],
  lumaMotion: ['Breathe slowly', 'Pulse gently', 'Travel across', 'Hold a shape'],
  intention: ['Welcome', 'Focus', 'Ease', 'Wonder'],
  ground: ['More openness', 'More focus', 'More color', 'More quiet'],
  impossible: ['Vivid + low saturation', 'Alert + visually quiet', 'Warm + high clarity', 'Slow + still alive'],
};

const dnaRounds = [
  { title: 'Warmth', prompt: 'Which material should lead the first impression?', choices: ['Ember', 'Mist', 'Daylight'], hue: 34 },
  { title: 'Focus', prompt: 'Where should attention gather?', choices: ['A single point', 'A wide field', 'A moving edge'], hue: 188 },
  { title: 'Color', prompt: 'How much color should the room reveal?', choices: ['Barely there', 'Balanced', 'Full spectrum'], hue: 276 },
  { title: 'Motion', prompt: 'How should the composition breathe?', choices: ['Still', 'Measured', 'Restless'], hue: 132 },
];

const gameRounds = [
  { title: 'Flash recall', prompt: 'The installation flashed a three-step sequence. Which one did you see?', choices: ['Cyan - silver - cyan', 'Silver - cyan - silver', 'Cyan - cyan - silver'], answer: 'Cyan - silver - cyan' },
  { title: 'Color order', prompt: 'Order the colors from the left bank to the right bank.', choices: ['Amber - mint - violet', 'Violet - amber - mint', 'Mint - violet - amber'], answer: 'Violet - amber - mint' },
  { title: 'Morse decode', prompt: 'The lights answered with short / long / short. What letter is it?', choices: ['K', 'R', 'W'], answer: 'R' },
];

function radioCards(values, name, selected = values[0]) {
  return `<div class="choice-grid">${values.map((value) => `<label class="choice"><input type="radio" name="${name}" value="${value}"${value === selected ? ' checked' : ''}><span>${value}</span></label>`).join('')}</div>`;
}

function slider(label, name, min, max, value, unit) {
  return `<label class="range-field"><span>${label}<output data-value-for="${name}" data-unit="${unit}">${value}${unit}</output></span><input type="range" name="${name}" min="${min}" max="${max}" value="${value}" data-live-value="${name}"></label>`;
}

function roundCards(rounds, namePrefix, activeFrom = 0, activeTo = rounds.length) {
  return rounds.map((round, index) => {
    const hidden = index < activeFrom || index >= activeTo;
    const hueClass = `hue-${round.hue}`;
    const answer = namePrefix === 'game' ? ` data-answer="${round.answer}"` : '';
    const disabled = namePrefix === 'dna' && hidden ? ' disabled' : '';
    const selected = namePrefix === 'dna' ? null : undefined;
    return `<fieldset class="round-card" data-round-card="${index}"${answer}${hidden ? ' hidden' : ''}${disabled}><legend><span class="round-number">0${index + 1}</span>${round.title}</legend><p>${round.prompt}</p><div class="contrast-strip ${hueClass}" aria-hidden="true"><i></i><i></i><i></i></div>${radioCards(round.choices, `${namePrefix}-${index}`, selected)}${namePrefix === 'dna' ? slider('Signal intensity', `dna-intensity-${index}`, 20, 80, 52, '%') : ''}</fieldset>`;
  }).join('');
}

function signalField(className = '') {
  return `<div class="signal-field ${className}" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`;
}

export function renderExperienceForm(id, { turn = 'A' } = {}) {
  if (!experienceMap[id]) return '';
  if (id === 'fortune-light') return `<div class="fortune-preview" data-fortune-preview><div><span class="preview-kicker">Your light reading</span><strong data-fortune-label>Set the coordinates</strong><small data-fortune-detail>The room will turn a date and place into a luminous pair.</small></div>${signalField('fortune-field')}</div><div class="form-grid"><label>Birth date<input required name="birthDate" type="date" max="${new Date().toISOString().slice(0, 10)}"></label><label>Birthplace<select required name="birthplace"><option value="">Choose a place</option><option>Berlin</option><option>Seoul</option><option>Mexico City</option><option>Nairobi</option><option>Sydney</option></select></label></div><div class="micro-note">A transparent Five Elements-inspired reading for this exhibition, not professional fortune telling.</div>`;
  if (id === 'light-dna') return `<div class="dna-console" data-dna-preview><div><span class="preview-kicker">Signal signature</span><strong data-dna-signal>Waiting for the first contrast</strong></div>${signalField('dna-field')}<div class="preview-readout"><span data-dna-count>0 / 4 locked</span><output data-dna-intensity>52%</output></div></div><div class="round-progress"><strong data-round-progress>Round 1 of 4</strong><span>Answer after each contrast appears on the installation.</span></div><div class="interview-grid">${roundCards(dnaRounds, 'dna', 0, 1)}</div><button class="button" type="button" data-next-round>Show next contrast ${arrow()}</button>`;
  if (id === 'shared-breath') return `<div class="turn-chip">Participant ${turn}</div><div class="breath-preview" data-breath-preview><div class="breath-orbit"><i></i><i></i><i></i><i></i></div><div><span class="preview-kicker">Cadence mirror</span><strong data-breath-label>Find your first beat</strong><small data-breath-detail>The field will widen and settle with your pace.</small></div></div><div class="tap-panel"><p>Tap four beats at a comfortable pace. Only a coarse cadence category leaves this screen.</p><button class="tap-button" type="button" data-tap aria-label="Record one cadence beat">Tap cadence</button><output data-taps>0 / 4 beats</output><div class="rhythm-meter" aria-label="Recorded cadence"><i></i><i></i><i></i><i></i></div></div>`;
  if (id === 'sensory-translator') return `<div class="translator-preview" data-translator-preview><div class="preview-readout"><span>Original scene</span><strong data-translator-scene> Saturated sunset</strong></div><div class="translation-bars"><i data-translation-bar="warmth"></i><i data-translation-bar="clarity"></i><i data-translation-bar="motion"></i></div><small data-translator-readout>Comfort 48% · motion 1 / 3</small></div><div class="form-stack"><label>Starting scene<select name="scene"><option value="sunset">A saturated sunset</option><option value="gallery">A bright gallery</option><option value="night-market">A lively night market</option><option value="forest">A deep green forest</option></select></label>${radioCards(choiceSets['sensory-translator'], 'translation')}${slider('Comfort brightness', 'comfortBrightness', 24, 72, 48, '%')}${slider('Motion pace', 'motionPace', 0, 3, 1, ' / 3')}</div>`;
  if (id === 'close-the-day') return `<div class="ritual-preview" data-ritual-preview><div class="ritual-rail"><i class="is-active"></i><i></i><i></i><i></i></div><div><span class="preview-kicker">Four small acts</span><strong data-ritual-label>Notice what is here</strong><small data-ritual-detail>Release one weight. Keep one useful spark.</small></div></div><div class="dual-choice"><fieldset><legend>Release</legend>${radioCards(choiceSets['close-the-day-release'], 'release')}</fieldset><fieldset><legend>Keep</legend>${radioCards(choiceSets['close-the-day-keep'], 'keep')}</fieldset></div><div class="micro-note">The four-act sequence moves from notice to sort, release, and keep.</div>`;
  if (id === 'light-game-arena') {
    const start = turn === 'A' ? 0 : 2;
    const end = turn === 'A' ? 2 : 3;
    return `<div class="game-header"><div class="turn-chip">Player ${turn}</div><strong>Scoreboard <output data-game-score>0 / 3</output></strong></div><div class="game-sequence" aria-label="Light sequence"><i></i><i></i><i></i><i></i></div><div class="game-feedback" data-game-feedback role="status">Choose an answer to lock a round.</div><div class="game-rounds">${roundCards(gameRounds, 'game', start, end)}</div>`;
  }
  if (id === 'luma') return `<div class="luma-preview" data-luma-preview><div class="luma-orb"><i></i><i></i><i></i></div><div><span class="preview-kicker">Light spirit</span><strong data-luma-name>Waiting for a temperament</strong><small data-luma-readout>Three choices become one character.</small></div></div><div class="trait-stack"><fieldset><legend>Energy</legend>${radioCards(choiceSets.lumaEnergy, 'energy')}</fieldset><fieldset><legend>Curiosity</legend>${radioCards(choiceSets.lumaCuriosity, 'curiosity')}</fieldset><fieldset><legend>Movement</legend>${radioCards(choiceSets.lumaMotion, 'movement')}</fieldset></div>`;
  if (id === 'memory-capsule') return `<div class="postcard-preview" data-memory-card><span class="preview-kicker">One-time light postcard</span><blockquote data-memory-preview>A small fragment becomes a light, not a record.</blockquote><div><span data-memory-tone>Steady tone</span><span><output data-memory-count>0</output> / 120</span></div></div><label>One small fragment, without names or contact details<textarea required name="fragment" maxlength="120" rows="3" placeholder="A rainy train window, a warm room, a familiar song"></textarea><small>Measured locally. Only its bounded shape leaves this screen.</small></label><label>Postcard tone<select name="mood"><option value="quiet">Quiet</option><option value="bright">Bright</option><option value="curious">Curious</option><option value="steady" selected>Steady</option></select></label>`;
  if (id === 'intention-garden') return `<div class="garden-preview" data-garden-preview><div class="garden-canopy" data-garden-sprouts><i></i><i></i><i></i><i></i></div><div><span class="preview-kicker">Shared garden</span><strong data-garden-label>Choose one seed</strong><small>Only the category count contributes to this shared installation.</small></div></div>${radioCards(choiceSets.intention, 'intention')}`;
  if (id === 'common-ground') return `<div class="ground-preview" data-ground-preview><div class="ground-compass"><i></i><i></i><i></i><i></i><b></b></div><div><span class="preview-kicker">Private alignment</span><strong data-ground-label>Keep your priority private</strong><small>After the handoff, the installation finds the overlap.</small></div></div><div class="turn-chip">Participant ${turn}</div><p>Choose privately. The other participant will not see this selection before their turn.</p>${radioCards(choiceSets.ground, 'groundChoice')}`;
  if (id === 'no-shared-prompt') return `<div class="state-handoff"><div class="state-lights"><i></i><i></i><i></i><i></i></div><div><strong>State handoff is server-side</strong><small>The second agent receives only a coarse brightness / color / online observation from the bound installation.</small></div></div><div class="inspection-log" data-inspection-log><span class="is-live">No prompt passed</span><span>State read waiting</span><span>Intent unchosen</span></div><p>Choose a bounded intent for the first composition. Do not enter a prompt.</p>${radioCards(['Invite warmth', 'Open focus', 'Make a bridge', 'Hold stillness'], 'stateIntent')}<label class="switch"><input type="checkbox" name="inspectState" checked><span>Allow the second agent to inspect current light state</span></label>`;
  if (id === 'impossible-light') return `<div class="impossible-preview" data-impossible-preview><div class="constraint-pair"><span data-constraint-one>Constraint one</span><b>×</b><span data-constraint-two>Constraint two</span></div><div class="resolution-dial"><i data-resolution-fill></i></div><div class="preview-readout"><span>Resolution bias</span><output data-resolution-readout>50%</output></div></div><div class="dual-choice"><fieldset><legend>Constraint one</legend>${radioCards(choiceSets.impossible, 'constraintOne')}</fieldset><fieldset><legend>Constraint two</legend>${radioCards(['More vivid', 'More quiet', 'More open', 'More precise'], 'constraintTwo')}</fieldset></div>${slider('Resolution bias', 'resolutionBias', 25, 75, 50, '%')}`;
  return radioCards(['Balanced', 'Brighter', 'Quieter', 'More motion'], 'choice');
}

export function collectInput(form, id, taps = [], context = {}) {
  const data = new FormData(form);
  if (id === 'fortune-light') return { date: data.get('birthDate'), city: data.get('birthplace') };
  if (id === 'light-dna') return { rounds: dnaRounds.map((_, index) => data.get(`dna-${index}`) || ''), intensity: dnaRounds.map((_, index) => Number(data.get(`dna-intensity-${index}`) || 52)) };
  if (id === 'shared-breath') {
    const cadence = cadenceBucket(taps);
    return { cadence };
  }
  if (id === 'sensory-translator') return { scene: data.get('scene'), choices: [data.get('translation')].filter(Boolean), comfortBrightness: Number(data.get('comfortBrightness') || 48), motionPace: Number(data.get('motionPace') || 1) };
  if (id === 'close-the-day') return { release: data.get('release'), keep: data.get('keep'), choices: [data.get('release'), data.get('keep')].filter(Boolean) };
  if (id === 'light-game-arena') {
    const answers = gameRounds.map((_, index) => {
      const answer = data.get(`game-${index}`);
      return answer ? { round: index, answer } : null;
    }).filter(Boolean);
    return { rounds: answers };
  }
  if (id === 'luma') return { choices: [data.get('energy'), data.get('curiosity'), data.get('movement')].filter(Boolean) };
  if (id === 'memory-capsule') return { text: String(data.get('fragment') || '').trim(), mood: data.get('mood') };
  if (id === 'intention-garden') return { intention: data.get('intention'), choices: [data.get('intention')].filter(Boolean) };
  if (id === 'common-ground') {
    const choice = data.get('groundChoice');
    return { choice };
  }
  if (id === 'no-shared-prompt') return { intent: data.get('stateIntent'), inspectState: data.get('inspectState') === 'on' };
  if (id === 'impossible-light') return { choices: [data.get('constraintOne'), data.get('constraintTwo')].filter(Boolean), resolutionBias: Number(data.get('resolutionBias') || 50) };
  return { choices: [data.get('choice')].filter(Boolean) };
}

function cadenceBucket(taps) {
  if (!Array.isArray(taps) || taps.length < 4) return 'medium-even';
  const intervals = taps.slice(1).map((stamp, index) => Math.max(80, Math.min(1200, Number(stamp) - Number(taps[index]))));
  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const spread = Math.max(...intervals) - Math.min(...intervals);
  const pace = average < 300 ? 'quick' : average > 700 ? 'slow' : 'medium';
  return `${pace}-${spread > 260 ? 'varied' : 'even'}`;
}

function arrow() { return '<span aria-hidden="true">→</span>'; }
