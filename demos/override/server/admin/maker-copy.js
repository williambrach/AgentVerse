// Plain-language labels and hints for the editor. Text only; no markup.
const NP = 'Not shown to players yet. ';
const LIST = ' One per line.';

export const COPY = {
  'copy.headline': ['Headline', 'The case title in the top bar while a session is open.'],
  'copy.intro.lead': ['Intro lead', 'The first line on the start screen when this case is chosen. A new line starts a new row.'],
  'copy.intro.body': ['Intro text', 'The paragraph under the lead on the start screen, shown once the case is loaded.'],
  'copy.briefing.title': ['Briefing title', 'The heading of the case briefing page the player sees first.'],
  'copy.briefing.description': ['Briefing text', 'The paragraph under the briefing heading.'],
  'copy.briefing.question': ['Briefing question', 'The question the player must answer. It sits in the "Your question" box of the briefing.'],
  'copy.briefing.hint': ['Briefing hint', 'Small print under the question in the briefing.'],
  'copy.report.title': ['Report title', NP + 'Heading for the report page.'],
  'copy.report.description': ['Report text', NP + 'Text under the report heading.'],
  'parts.*.label': ['Part name', 'What this character is called in the story, for example "The planner". Also used in the character\'s instructions.'],
  'parts.*.introduction': ['Opening line', 'The first thing the character says when the player opens the chat.'],
  'parts.*.quickQuestion': ['Suggested question', 'The one-click question offered before the player has asked anything.'],
  'parts.*.knowledge': ['What this character knows', 'The facts the character may use when it answers. It is told to use only these.' + LIST],
  'parts.*.finding.classification': ['Debrief verdict', 'The short verdict shown for this character in the debrief.'],
  'parts.*.finding.explanation': ['Debrief explanation', 'The reason given for the verdict in the debrief.'],
  'rules': ['Rules for all actors', 'The instructions every character of this game gets, in a one-to-one chat and in the forum thread alike. Slots in [[double brackets]] are filled in per character; [[knowledge]] must appear exactly once.'],
  'prompt.thread': ['Thread line', 'Sent with the posts when a character writes in the forum thread: it says what to do with them. [[others]] becomes the names of the other characters.'],
  'worlds.*.frame': ['World frame', 'The line that frames the character in this world, put near the top of the interview prompt.'],
  'worlds.*.persona': ['World persona', 'The personality word dropped into the prompt for characters of this world.'],
  'worlds.*.memory': ['World memory rule', 'The sentence about what the character remembers, put after the knowledge rule.'],
  'worlds.*.cast.one': ['Cast noun, singular', 'How one cast member is named in server messages, for example "Pick a role for each monkey."'],
  'worlds.*.cast.many': ['Cast noun, plural', 'How several cast members are named in server messages, for example "Choose one of the 4 monkeys."'],
  'debrief.title': ['Debrief title', 'The heading of the debrief page.'],
  'debrief.summary': ['Debrief summary', NP + 'A short recap of what happened.'],
  'debrief.lesson': ['Lesson', 'The closing lesson at the bottom of the debrief.'],
  'answer.feedback.correct': ['Feedback when all right', 'Shown under the score when every role was picked correctly.'],
  'answer.feedback.other': ['Feedback otherwise', 'Shown under the score when at least one role was wrong.'],
};

const generic = path => path.replace(/^(parts|worlds|characters)\.[^.]+\./, '$1.*.');
const words = s => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase();
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// A label never holds a dot: the readable form of the last meaningful path segments.
function autoLabel(path) {
  const seg = String(path).split('.');
  if (seg[0] === 'ui' && seg.length > 2) return cap(words(seg.slice(2).join(' ')));
  if (seg[0] === 'worlds' && seg.length > 3) return cap(words(seg.slice(2).join(' ')));
  let last = seg.pop();
  if (/^\d+$/.test(last) && seg.length) last = `${seg.pop()} ${Number(last) + 1}`;
  return cap(words(last)) || cap(words(String(path)));
}

export function fieldCopy(path) {
  const hit = COPY[path] ?? COPY[generic(String(path))];
  if (hit) return { label: hit[0], hint: hit[1] };
  return { label: autoLabel(path), hint: '' };
}

const idOf = c => (typeof c === 'string' ? c : c?.id);
const nameOf = c => (typeof c === 'string' ? cap(c) : cap(c?.name || c?.id || ''));
const find = (list, id) => (list ?? []).find(x => idOf(x) === id);

const AREA_LABELS = {
  hud: 'HUD', tools: 'Arbiter tools', main: 'Screens', dialogue: 'Conversation', talk: 'Talk case',
  accuse: 'Accusations', debrief: 'Debrief', lineup: 'Verdict', notebook: 'Notebook', team: 'Team check-in',
  board: 'Leaderboard', splash: 'Intro', worlds: 'Worlds', station: 'Map labels', roundtable: 'Roundtable',
};
const areaLabel = a => AREA_LABELS[a] ?? a;

/** Section of a path as {key, title}. Keys are stable ids, titles use current names and labels. */
export function routeOf(path, structure = {}) {
  const seg = String(path).split('.');
  const [a, b, c] = seg;
  if (a === 'ui' && seg.length >= 3) return { key: `ui:${b}`, title: `UI · ${areaLabel(b)}` };
  if (a === 'prompt' && (b === 'interview' || b === 'thread')) return { key: 'prompt-rules', title: 'Prompt rules' };
  if (a === 'worlds' && seg.length >= 3) return { key: `world:${b}`, title: `World: ${b}` };
  if (a === 'copy' || a === 'title') return { key: 'story', title: 'Story' };
  if (a === 'partsKnowledge') return { key: 'prompt', title: 'Prompt' };
  if (a === 'prompt') return { key: 'prompt', title: 'Prompt' };
  if (a === 'rules' && seg.length === 1) return { key: 'prompt', title: 'Prompt' };
  if (a === 'roles') return { key: 'roles', title: 'Roles' };
  if (a === 'characters' && b) return { key: `character:${b}`, title: `Character: ${nameOf(find(structure.characters, b) ?? b)}` };
  if (a === 'talk' && b !== 'topics' && b !== 'glossary' && find(structure.characters, c)) {
    return { key: `character:${c}`, title: `Character: ${nameOf(find(structure.characters, c))}` };
  }
  if (a === 'parts' && b) {
    const p = find(structure.parts, b);
    return { key: `part:${b}`, title: `Part: ${p?.label || b}` };
  }
  if (a === 'evidence') return { key: 'evidence', title: 'Evidence' };
  if (a === 'talk' && (b === 'topics' || b === 'glossary')) return { key: 'topics', title: 'Topics' };
  if (a === 'debrief' || a === 'answer') return { key: 'debrief', title: 'Debrief' };
  return { key: 'other', title: 'Other' };
}

export const sectionOf = (path, structure) => routeOf(path, structure).title;

/** Section keys in display order for a document's structure. Keys with no fields are the caller's to skip. */
export function sectionKeys(structure = {}) {
  return [
    'story', 'prompt', 'roles',
    ...(structure.characters ?? []).map(c => `character:${idOf(c)}`),
    ...(structure.parts ?? []).map(p => `part:${idOf(p)}`),
    'evidence', 'topics', 'debrief',
    ...(structure.areas ?? []).map(x => `ui:${x}`),
    'prompt-rules',
    ...(structure.worlds ?? []).map(w => `world:${idOf(w)}`),
  ];
}
