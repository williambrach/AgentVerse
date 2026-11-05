// Plain-language labels and hints for the editor. Text only; no markup.
const NP = 'Not shown to players yet. ';
const LIST = ' One per line.';

const COPY = {
  'copy.headline': ['Headline', 'The case title in the top bar while a session is open.'],
  'copy.intro.lead': ['Intro lead', 'The first line on the start screen when this case is chosen. A new line starts a new row.'],
  'copy.intro.body': ['Intro text', 'The paragraph under the lead on the start screen, shown once the case is loaded.'],
  'copy.briefing.title': ['Briefing title', 'The heading of the case briefing page the player sees first.'],
  'copy.briefing.description': ['Briefing text', 'The paragraph under the briefing heading.'],
  'copy.briefing.question': ['Briefing question', 'The question the player must answer. It sits in the "Your question" box of the briefing.'],
  'copy.briefing.hint': ['Briefing hint', 'Small print under the question in the briefing.'],
  'copy.report.title': ['Report title', NP + 'Heading for the report page.'],
  'copy.report.description': ['Report text', NP + 'Text under the report heading.'],
  'prompt.setting': ['Setting', 'Who the characters are, in one phrase. It opens every character\'s instructions, after their name and part name.'],
  'prompt.use': ['Words to use', 'Simple words the characters are told to talk in.' + LIST],
  'prompt.avoid': ['Words to avoid', 'Technical terms the characters are told not to use.' + LIST],
  'parts.*.label': ['Part name', 'What this character is called in the story, for example "The planner". Also used in the character\'s instructions.'],
  'parts.*.introduction': ['Opening line', 'The first thing the character says when the player opens the chat.'],
  'parts.*.quickQuestion': ['Suggested question', 'The one-click question offered before the player has asked anything.'],
  'parts.*.knowledge': ['What this character knows', 'The facts the character may use when it answers. It is told to use only these.' + LIST],
  'parts.*.finding.classification': ['Debrief verdict', 'The short verdict shown for this character in the debrief.'],
  'parts.*.finding.explanation': ['Debrief explanation', 'The reason given for the verdict in the debrief.'],
  'debrief.title': ['Debrief title', 'The heading of the debrief page.'],
  'debrief.summary': ['Debrief summary', NP + 'A short recap of what happened.'],
  'debrief.lesson': ['Lesson', 'The closing lesson at the bottom of the debrief.'],
  'answer.feedback.correct': ['Feedback when all right', 'Shown under the score when every role was picked correctly.'],
  'answer.feedback.other': ['Feedback otherwise', 'Shown under the score when at least one role was wrong.'],
};

const generic = path => path.replace(/^parts\.[^.]+\./, 'parts.*.');

export function fieldCopy(path) {
  const hit = COPY[path] ?? COPY[generic(String(path))];
  if (hit) return { label: hit[0], hint: hit[1] };
  return { label: String(path).split('.').pop(), hint: '' };
}

export function sectionOf(path) {
  const p = String(path);
  const m = /^parts\.([^.]+)\./.exec(p);
  if (m) return `part:${m[1]}`;
  if (p.startsWith('copy.')) return 'story';
  if (p.startsWith('prompt.')) return 'prompt';
  if (p.startsWith('debrief.') || p.startsWith('answer.')) return 'debrief';
  return 'story';
}
