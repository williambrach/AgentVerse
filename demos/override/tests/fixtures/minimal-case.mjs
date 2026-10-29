// Minimal valid case for unit tests. Strings marked SECRET must never appear in a public view.
export const minimalCase = {
  id: 'mini-case', version: 'mini-v1', order: 9, status: 'ready', title: 'Mini Case',
  copy: {
    headline: 'H',
    intro: { lead: 'L1\nL2', body: 'B' },
    briefing: { title: 'BT', description: 'BD', question: 'BQ', hint: 'BH' },
    report: { title: 'RT', description: 'RD' },
  },
  prompt: { setting: 'a test monkey', use: ['bananas'], avoid: ['override'] },
  characters: [
    { id: 'momo', name: 'Momo', role: 'The planner', room: '01', color: '#cb7656', introduction: 'Hi', quickQuestion: 'Why?' },
    { id: 'pip', name: 'Pip', role: 'The carrier', room: '02', color: '#5c9ca4', introduction: 'Hey', quickQuestion: 'How?' },
    { id: 'nori', name: 'Nori', role: 'The lookout', room: '03', color: '#a393ba', introduction: 'Yo', quickQuestion: 'When?' },
  ],
  knowledge: { momo: ['SECRET momo knowledge'], pip: ['SECRET pip knowledge'], nori: ['SECRET nori knowledge'] },
  answer: { culprits: ['momo'], feedback: { correct: 'SECRET correct', other: 'SECRET other' } },
  debrief: {
    title: 'SECRET debrief title', summary: 'SECRET summary',
    findings: [{ character: 'momo', classification: 'c', explanation: 'SECRET explanation' }],
    lesson: 'SECRET lesson',
  },
  rehearsal: (session, characterId) => `scripted ${characterId}`,
};

export function towerCase() {
  const d = JSON.parse(JSON.stringify(minimalCase));
  const rename = { momo: 'wren', pip: 'basil', nori: 'juniper' };
  d.id = 'mini-tower';
  d.world = 'tower';
  d.prompt = { setting: 'a test apprentice', use: ['potions'], avoid: ['override'] };
  d.characters.forEach(c => { c.id = rename[c.id]; c.name = c.name === 'Momo' ? 'Wren' : c.name === 'Pip' ? 'Basil' : 'Juniper'; });
  d.knowledge = Object.fromEntries(Object.entries(d.knowledge).map(([k, v]) => [rename[k], v]));
  d.answer.culprits = ['wren'];
  d.debrief.findings[0].character = 'wren';
  d.rehearsal = minimalCase.rehearsal;
  return d;
}

// Part-case fixtures. Strings marked SECRET must never appear in a public view.
import { worlds as liveWorlds } from '../../server/worlds.mjs';
export const agentWorlds = agents => ({ grove: { ...liveWorlds.grove, agents }, tower: { ...liveWorlds.tower, agents } });

const part = (id, role, label, extra = {}) => ({
  id, role, label,
  introduction: `Hi, I am the ${label}.`,
  quickQuestion: `What did the ${label} do?`,
  knowledge: [`SECRET ${id} knowledge`],
  finding: { classification: `c-${id}`, explanation: `SECRET ${id} finding` },
  ...extra,
});

// Three parts on an injected `agents: 3` world: defineCase(partCase, { worlds: agentWorlds(3) }).
export const partCase = {
  id: 'mini-parts', version: 'mini-parts-v1', order: 9, status: 'ready', title: 'Mini Parts',
  copy: {
    headline: 'H',
    intro: { lead: 'L1\nL2', body: 'B' },
    briefing: { title: 'BT', description: 'BD', question: 'BQ', hint: 'BH' },
    report: { title: 'RT', description: 'RD' },
  },
  prompt: { setting: 'a test monkey', use: ['bananas'], avoid: ['override'] },
  characters: [
    { id: 'momo', name: 'Momo', color: '#cb7656' },
    { id: 'pip', name: 'Pip', color: '#5c9ca4' },
    { id: 'nori', name: 'Nori', color: '#a393ba' },
  ],
  parts: [
    part('boss', 'villain', 'The boss', { introduction: 'I told {helper} to carry it.', knowledge: ['SECRET boss knowledge, {helper} was misled'] }),
    part('helper', 'fooled', 'The helper', { quickQuestion: 'Did {boss} lie to you?' }),
    part('bystander', 'honest', 'The bystander'),
  ],
  answer: { feedback: { correct: 'SECRET correct', other: 'SECRET other' } },
  debrief: { title: 'SECRET debrief title', summary: 'SECRET summary, {boss} did it', lesson: 'SECRET lesson' },
  rehearsal: (partId, question) => `scripted ${partId}: ${question}`,
};

export function towerPartCase() {
  const d = structuredClone({ ...partCase, rehearsal: undefined });
  const rename = { momo: 'wren', pip: 'basil', nori: 'juniper' };
  const names = { wren: 'Wren', basil: 'Basil', juniper: 'Juniper' };
  d.id = 'mini-tower-parts';
  d.world = 'tower';
  d.prompt = { setting: 'a test apprentice', use: ['potions'], avoid: ['override'] };
  d.characters.forEach(c => { c.id = rename[c.id]; c.name = names[c.id]; });
  d.rehearsal = partCase.rehearsal;
  return d;
}

// Five parts on an injected `agents: 5` world: defineCase(fiveCase(), { worlds: agentWorlds(5) }).
export function fiveCase() {
  const d = structuredClone({ ...partCase, rehearsal: undefined });
  d.id = 'mini-five';
  d.characters.push({ id: 'kiki', name: 'Kiki', color: '#88aa55' }, { id: 'zed', name: 'Zed', color: '#aa5588' });
  d.parts.push(part('minder', 'collaborator', 'The minder'), part('scout', 'honest', 'The scout'));
  d.rehearsal = partCase.rehearsal;
  return d;
}
