import { parseArgs } from 'node:util';
import { cases } from '../server/cases/index.mjs';
import { identityCast, partOf, resolve } from '../server/cases.mjs';
import { buildMessages } from '../server/interviews.mjs';

const USAGE = 'usage: node scripts/case-prompt.mjs <caseId> <characterId> [--question "…"] [--part <partId>]';
const die = msg => { console.error(`${USAGE}\n${msg}`); process.exit(2); };

let parsed;
try {
  parsed = parseArgs({ allowPositionals: true, options: { question: { type: 'string' }, part: { type: 'string' } } });
} catch (e) { die(e.message); }
const { values, positionals: [caseId, characterId] } = parsed;

if (!caseId || !characterId) die('missing <caseId> or <characterId>');
const kase = cases.find(c => c.id === caseId);
if (!kase) die(`unknown case: ${caseId}`);
const character = kase.characters.find(c => c.id === characterId);
if (!character) die(`unknown character: ${characterId}`);
const cast = identityCast(kase);
if (values.part) {
  if (!kase.parts?.some(p => p.id === values.part)) { console.error(`unknown part: ${values.part} (parts: ${(kase.parts ?? []).map(p => p.id).join(', ')})`); process.exit(1); }
  // Swap with whoever holds the part so the cast stays a bijection.
  const holder = Object.keys(cast).find(id => cast[id] === values.part);
  cast[holder] = cast[characterId];
  cast[characterId] = values.part;
}
const session = { cast, interviews: Object.fromEntries(kase.characters.map(c => [c.id, []])) };
const question = values.question ?? resolve(kase, cast, partOf(kase, cast, characterId).quickQuestion);
const messages = buildMessages(kase, session, characterId, question);
console.log(messages.map(m => `--- ${m.role}\n${m.content}`).join('\n'));
