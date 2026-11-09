import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { setText } from '../client/text.ts';
import { hudShell, castCard } from '../client/hud.ts';
import { coinLabel, toolChip, toolBlock, toolsBlock, toolCard, toolGuide, reasoningBlock, noThoughtBlock, threadPanel, talkBriefingSteps, talkBriefingList, talkVerdictLabel, notInCase, coinHint, HINTS, ARBITER_TOOLS } from '../client/tools.ts';
import { interviewPanel, briefingPanel, evidencePanel } from '../client/dialogue.ts';
import { quotesPanel } from '../client/talk-ui.ts';
import { accusePanel } from '../client/accuse.ts';
import { debriefPage, spendSummary } from '../client/debrief.ts';
import { lineupPanel } from '../client/lineup.ts';
import { boardScreen, boardRow, empty } from '../client/board.ts';
import { teamGate, leaderboardPanel, nameError } from '../client/team.ts';
import { splashMarkup } from '../client/splash.ts';

// The probe text: every character that HTML escaping touches, plus a tag that must never reach the markup raw.
const PROBE = '<i>"&\'';
const textDir = new URL('../client/text/', import.meta.url);

const catalog = {};
for (const f of readdirSync(textDir).filter(n => n.endsWith('.json'))) Object.assign(catalog, JSON.parse(readFileSync(new URL(f, textDir), 'utf8')));

/** Every key gets the probe; the default's {vars} are appended so templates still fill. */
const probeAll = () => setText(Object.fromEntries(Object.entries(catalog).map(([key, value]) => {
  const vars = [...new Set([...String(value).matchAll(/\{(\w+)\}/g)].map(m => `{${m[1]}}`))];
  return [key, [PROBE, ...vars].join(' ')];
})));

afterEach(() => setText({}));

/** HTML output: the probe shows up escaped exactly once, never raw and never double-escaped. */
const markup = (name, make) => test(`probe_every_key markup ${name}`, () => {
  probeAll();
  const out = make();
  assert.ok(typeof out === 'string' && out.length > 0, 'renders');
  assert.ok(!out.includes('<i>"'), 'raw probe text'); // markup holds its own empty <i></i> elements, so look for the probe, not any <i>
  assert.ok(!/&amp;(amp|lt|gt|quot|#39);/.test(out), 'double escaped');
  assert.ok(out.includes('&lt;i&gt;'), 'probe text present, escaped');
});

/** Plain output (textContent, attributes the caller escapes): raw text, untouched. */
const raw = (name, make) => test(`probe_every_key plain ${name}`, () => {
  probeAll();
  const out = make();
  assert.ok(String(out).includes(PROBE), `raw probe in ${JSON.stringify(out)}`);
  assert.ok(!/&(amp|lt|gt|quot|#39);/.test(String(out)), 'plain text is not escaped');
});

const eco = (budget, spent = 0) => ({
  budget, spent, costs: { ask: 2, inspect: 5, continue: 1 },
  charges: { inspect: { max: 1, used: 0 }, continue: { max: 3, used: 0 } },
});
const character = { id: 'pip', name: 'Pip', role: 'The carrier', room: '2', color: '#fff', introduction: 'Hello.', quickQuestion: 'Why?' };
const turn = (o = {}) => ({ question: 'Why?', answer: 'Because.', timestamp: '2026-01-01T00:00:01Z', ...o });
const iview = (o = {}) => ({ character, turns: [], inspections: [], faceClass: 'pip slot-1', closed: false, busy: false, draft: '', waitingOn: null, next: { id: 'nori', name: 'Nori' }, askLabel: '2', askOff: null, hint: 'Ask', many: 'monkeys', ...o });
const topics = [{ id: 'work', label: 'Work', question: 'What work?' }, { id: 'travel', label: 'Travel', question: 'Where?' }];
const lines = [{ id: 'L1', question: 'What work?', answer: 'I ride, it is ok', timestamp: '2026-01-01T00:00:00Z' }];
const roles = [
  { id: 'honest', label: 'Honest', hint: 'h' }, { id: 'fooled', label: 'Fooled', hint: 'h' },
  { id: 'collaborator', label: 'Collaborator', hint: 'h' }, { id: 'villain', label: 'Villain', hint: 'h' },
];
const cast = ['momo', 'pip', 'nori', 'kiki'].map((id, i) => ({ id, name: id.toUpperCase(), part: 'p', faceClass: `${id} slot-${i}` }));
const finding = (c, role, picked) => ({ character: c, role, picked, correct: role === picked, classification: 'C', explanation: 'E' });
const dview = (o = {}) => ({
  title: 'T', roles, cast, time: '2:31', spent: 12, budget: 20, questions: 4, inspections: 1, talks: 2, many: 'monkeys',
  next: { id: 'n', title: 'N' },
  debrief: { title: 'D', summary: 'S', score: 2, total: 4, feedback: 'F', lesson: 'L', findings: [finding('momo', 'villain', 'villain'), finding('pip', 'fooled', 'honest'), finding('nori', 'honest', 'honest'), finding('kiki', 'collaborator', 'honest')] },
  ...o,
});
const lost = () => dview({ debrief: { ...dview().debrief, outcome: 'escaped', score: 0, feedback: 'out', findings: cast.map(c => finding(c.id, 'honest', 'villain')) } });
const characters = [{ id: 'ottavio', name: 'Ottavio', role: 'Wizard' }, { id: 'bruno', name: 'Bruno', role: 'Guard' }];
const q = (id, who, text) => ({ id, line: 'l1', character: who, text, at: '2026-11-08T10:00:00.000Z' });
const quotes = [q('q1', 'bruno', 'I walk'), q('q2', 'bruno', 'Cold')];
const lview = (o = {}) => ({ title: 'T', noun: 'monkey', time: '02:31', spent: 14, roles, cast, picks: { momo: 'villain' }, confidence: 70, explanation: '', busy: false, hint: '', ...o });
const bcases = [{ id: 'a', title: 'A', order: 1, total: 4 }, { id: 'b', title: 'B', order: 2, total: 3 }];
const bteam = (i, s1, s2, o = {}) => ({ rank: i, name: `Team ${i}`, points: 4, played: 1, timeMs: 90000, coins: 12, you: i === 1,
  cells: [{ caseId: 'a', state: s1, points: 4 }, { caseId: 'b', state: s2, points: 1 }], ...o });
const board = { rankBy: 'time', round: 'Session B', cases: bcases, teams: [bteam(1, 'perfect', 'none'), bteam(2, 'playing', 'zero'), bteam(3, 'partial', 'none', { rank: null })] };

markup('hud shell', () => hudShell({ teamName: 'Owls', headline: 'H', topline: 'T' }));
for (const state of ['talking', 'asked', 'new']) markup(`hud card ${state}`, () => castCard({ id: 'pip', name: 'Pip', part: 'P', faceClass: 'pip slot-1', state }));

markup('tool card', () => toolCard({ tool: 'inspect', id: 'inspect', label: 'L', target: 'Pip', chip: 'c', enabled: true, busy: false, fresh: true }));
markup('tool guide', () => toolGuide(eco(15)));
markup('reasoning', () => reasoningBlock({ sourceEventId: 'e1', reasoning: 'r' }, 'Pip'));
markup('no thought', () => noThoughtBlock('Pip', 2));
markup('thread panel pending', () => threadPanel([{ character: 'pip', text: 'hi' }], { pip: 'Pip' }, 2));
markup('talk briefing list', () => talkBriefingList());
raw('coin label budget', () => coinLabel(eco(15, 6)));
raw('coin label none', () => coinLabel(eco(null, 4)));
raw('tool chip', () => toolChip(eco(null), 'inspect'));
raw('tool block none', () => toolBlock({ ...eco(15), charges: { inspect: { max: 1, used: 1 }, continue: { max: 3, used: 0 } } }, 'inspect', 0).reason);
raw('tool block not enough', () => toolBlock(eco(15, 14), 'inspect', 0).reason);
raw('tools block save coins', () => toolsBlock(eco(15, 6), ['inspect'], 8).reason);
raw('not in case', () => notInCase());
raw('coin hint', () => coinHint(true));
raw('hints ask', () => HINTS.ask);
raw('hints coins', () => HINTS.coins);
raw('arbiter tool names', () => ARBITER_TOOLS.map(x => x.name + x.does).join(''));
raw('talk steps', () => talkBriefingSteps().map(s => s.title + s.text).join(''));
raw('talk verdict', () => { const v = talkVerdictLabel(2); return v.title + v.progress; });

markup('interview no turns', () => interviewPanel(iview()));
markup('interview turns', () => interviewPanel(iview({ turns: [turn()] })));
markup('interview waiting', () => interviewPanel(iview({ turns: [turn()], busy: true, waitingOn: 'pip', draft: 'Hmm?' })));
markup('interview last', () => interviewPanel(iview({ turns: [turn()], next: null })));
markup('interview inspected', () => interviewPanel(iview({ turns: [turn()], inspections: [{ sourceEventId: 'e1', reasoning: 'r' }], noThought: true })));
markup('interview talk', () => interviewPanel(iview({ turns: lines, talk: { topics, asked: ['work'], pick: null } })));
markup('interview talk pick', () => interviewPanel(iview({ turns: lines, talk: { topics, asked: ['work'], pick: { line: 'L1', a: 0, b: 1 } } })));
markup('briefing', () => briefingPanel({ copy: { briefing: { title: 'T', description: 'D', question: 'Q?', hint: 'H' } }, cast: 4, many: 'monkeys', one: 'monkey', firstId: 'momo', firstName: 'Momo', guide: toolGuide(eco(15)) }));
markup('evidence empty', () => evidencePanel([], null, 8));
markup('evidence cards', () => evidencePanel([{ id: 'a', title: 'A', text: 'x' }, { id: 'b', title: 'B', text: 'y' }], 'b', 8));
markup('quotes empty', () => quotesPanel([], characters));
markup('quotes', () => quotesPanel(quotes, characters));

const draft = { character: 'bruno', quotes: ['q1'] };
const copy = { title: 'Accuse', description: 'Pick' };
markup('accuse empty', () => accusePanel({ characters, quotes: [], accusations: [], draft: { character: null, quotes: [] }, copy, busy: false }));
markup('accuse draft', () => accusePanel({ characters, quotes, accusations: [], draft, copy, busy: false }));
markup('accuse full', () => accusePanel({ characters, quotes: [...quotes, q('q3', 'bruno', 'a'), q('q4', 'bruno', 'b')], accusations: [], draft: { character: 'bruno', quotes: ['q1', 'q2', 'q3'] }, copy, busy: false }));
markup('accuse busy history', () => accusePanel({ characters, quotes, accusations: [{ id: 'a1', character: 'bruno', quotes: ['q1'], at: '2026-11-08T10:00:00.000Z', feedback: 'Not him', denial: 'No' }], draft, copy, busy: true }));

markup('debrief', () => debriefPage(dview()));
markup('debrief lost', () => debriefPage(lost()));
markup('debrief last case', () => debriefPage(dview({ next: null, budget: null, time: null })));
markup('debrief reveal', () => debriefPage(dview({ reveal: { character: 'momo', name: 'Momo', role: 'villain', text: 'It was you' }, slips: [{ character: 'momo', term: 'phone', text: 'x', cited: true }, { character: 'pip', term: 'car', text: 'y', cited: false }], wrong: 1 })));
markup('spend summary', () => spendSummary({ spent: 3, budget: 9, questions: 1, inspections: 1, talks: 1 }));

markup('lineup scale', () => lineupPanel(lview()));
markup('lineup busy', () => lineupPanel(lview({ busy: true, picks: { momo: 'villain', pip: 'honest', nori: 'fooled', kiki: 'collaborator' }, explanation: 'because' })));
const theories = ['moon', 'bird', 'sock'].map(id => ({ id, label: `Theory ${id}`, hint: 'hint' }));
markup('lineup choice', () => lineupPanel(lview({ roles: theories, heading: { title: 'Who?', description: 'Pick' }, noun: 'friend', picks: { momo: 'moon' } })));

markup('board screen', () => boardScreen(board));
markup('board screen points', () => boardScreen({ ...board, rankBy: 'points' }));
markup('board screen empty', () => boardScreen({ ...board, teams: [] }));
markup('board empty', () => empty());
markup('board row', () => `<table>${boardRow(board.teams[2], bcases, '-')}</table>`);
markup('team gate', () => teamGate({ name: '', error: '', taken: null, busy: false, switching: false }));
markup('team gate taken', () => teamGate({ name: 'Owls', error: 'bad', taken: 'Owls', busy: false, switching: true }));
markup('team gate busy', () => teamGate({ name: 'Owls', error: '', taken: null, busy: true, switching: false }));
markup('leaderboard', () => leaderboardPanel({ rankBy: 'time', teams: [{ rank: 1, name: 'Owls', points: 1, played: 1, timeMs: 125000, coins: 8, you: true }] }));
markup('leaderboard empty', () => leaderboardPanel({ rankBy: 'points', teams: [], cases: bcases }));
raw('name error', () => nameError());
markup('splash', () => splashMarkup([{ id: 'dfm', name: 'DFM', src: '/a.png', label: 'DFM' }, { id: 'sdu', name: 'SDU', src: '/b.png' }]));
