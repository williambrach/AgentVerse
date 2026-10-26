import { parseArgs } from 'node:util';
import { cases } from '../server/cases/index.mjs';
import { buildMessages } from '../server/interviews.mjs';

const USAGE = 'usage: node scripts/case-prompt.mjs <caseId> <characterId> [--chapter N] [--evidence <recordId>] [--question "…"]';
const die = msg => { console.error(`${USAGE}\n${msg}`); process.exit(2); };

let parsed;
try {
  parsed = parseArgs({ allowPositionals: true, options: { chapter: { type: 'string' }, evidence: { type: 'string' }, question: { type: 'string' } } });
} catch (e) { die(e.message); }
const { values, positionals: [caseId, characterId] } = parsed;

if (!caseId || !characterId) die('missing <caseId> or <characterId>');
const kase = cases.find(c => c.id === caseId);
if (!kase) die(`unknown case: ${caseId}`);
const character = kase.characters.find(c => c.id === characterId);
if (!character) die(`unknown character: ${characterId}`);
const chapter = values.chapter === undefined ? 1 : Number(values.chapter);
if (!Number.isInteger(chapter) || chapter < 1 || chapter > kase.chapters.length) die(`chapter must be 1..${kase.chapters.length}`);
const evidence = values.evidence ?? null;
if (evidence && !kase.records.some(r => r.id === evidence && r.chapter <= chapter)) die(`evidence not revealed at chapter ${chapter}: ${evidence}`);

const session = { revealedPosition: chapter, selectedEvidence: evidence, interviews: { momo: [], pip: [], nori: [] } };
const messages = buildMessages(kase, session, characterId, values.question ?? character.quickQuestion);
console.log(messages.map(m => `--- ${m.role}\n${m.content}`).join('\n'));
