import { parseArgs } from 'node:util';
import { cases } from '../server/cases/index.mjs';
import { buildMessages } from '../server/interviews.mjs';

const USAGE = 'usage: node scripts/case-prompt.mjs <caseId> <characterId> [--question "…"]';
const die = msg => { console.error(`${USAGE}\n${msg}`); process.exit(2); };

let parsed;
try {
  parsed = parseArgs({ allowPositionals: true, options: { question: { type: 'string' } } });
} catch (e) { die(e.message); }
const { values, positionals: [caseId, characterId] } = parsed;

if (!caseId || !characterId) die('missing <caseId> or <characterId>');
const kase = cases.find(c => c.id === caseId);
if (!kase) die(`unknown case: ${caseId}`);
const character = kase.characters.find(c => c.id === characterId);
if (!character) die(`unknown character: ${characterId}`);
const session = { interviews: Object.fromEntries(kase.characters.map(c => [c.id, []])) };
const messages = buildMessages(kase, session, characterId, values.question ?? character.quickQuestion);
console.log(messages.map(m => `--- ${m.role}\n${m.content}`).join('\n'));
