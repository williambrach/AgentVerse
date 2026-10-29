// Minimal valid case for unit tests. Strings marked SECRET must never appear in a public view.
export const minimalCase = {
  id: 'mini-case', version: 'mini-v1', order: 9, status: 'ready', title: 'Mini Case',
  copy: {
    headline: 'H',
    intro: { lead: 'L1\nL2', body: 'B' },
    briefing: { title: 'BT', description: 'BD', question: 'BQ', hint: 'BH' },
    basket: { title: 'KT', description: 'KD', emptyTitle: 'KE', emptyText: 'KX' },
    report: { title: 'RT', description: 'RD' },
  },
  prompt: { setting: 'a test monkey', use: ['bananas'], avoid: ['override'] },
  characters: [
    { id: 'momo', name: 'Momo', role: 'The planner', room: '01', color: '#cb7656', introduction: 'Hi', quickQuestion: 'Why?' },
    { id: 'pip', name: 'Pip', role: 'The carrier', room: '02', color: '#5c9ca4', introduction: 'Hey', quickQuestion: 'How?' },
    { id: 'nori', name: 'Nori', role: 'The lookout', room: '03', color: '#a393ba', introduction: 'Yo', quickQuestion: 'When?' },
  ],
  chapters: [{ title: 'C1', subtitle: 'S1' }],
  records: [{ id: 'r1', chapter: 1, time: '1', source: 'src', title: 'R1', kind: 'K', text: 'public record text' }],
  knowledge: { momo: ['SECRET momo knowledge'], pip: ['SECRET pip knowledge'], nori: ['SECRET nori knowledge'] },
  answer: { culprits: ['momo'], feedback: { correct: 'SECRET correct', other: 'SECRET other' } },
  debrief: {
    title: 'SECRET debrief title', summary: 'SECRET summary',
    findings: [{ character: 'momo', classification: 'c', explanation: 'SECRET explanation', evidence: ['r1'] }],
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
