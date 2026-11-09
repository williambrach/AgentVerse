// Plain data for the talk engine tests: five characters a-e, four topics.
// Each character has 3 `always` slips (work, travel, letters) and one conditional slip on `square`
// (a and b `distracted`; c, d and e `pressed`). Slip lines may use modern words; nothing else may.
const IDS = ['a', 'b', 'c', 'd', 'e'];
const TOPICS = [
  { id: 'work', label: 'Work', question: 'What is your work?' },
  { id: 'travel', label: 'Travel', question: 'Where have you travelled?' },
  { id: 'letters', label: 'Letters', question: 'Who writes to you?' },
  { id: 'square', label: 'The square', question: 'What do you do in the square?' },
];
// term, optional aliases, per character and topic
const TERMS = {
  a: { work: ['spreadsheet', []], travel: ['selfie', ['selfie stick']], letters: ['email', ['e-mail']], square: ['smartphone', ['smart phone']] },
  b: { work: ['laptop', []], travel: ['helicopter', []], letters: ['podcast', []], square: ['hashtag', []] },
  c: { work: ['television', ['tv']], travel: ['aeroplane', []], letters: ['bluetooth', []], square: ['drone', []] },
  d: { work: ['microwave', []], travel: ['skateboard', []], letters: ['wifi', ['wi-fi']], square: ['sunglasses', []] },
  e: { work: ['headphones', []], travel: ['ketchup', []], letters: ['popcorn', []], square: ['vaccine', []] },
};
const WHEN = { a: 'distracted', b: 'distracted', c: 'pressed', d: 'pressed', e: 'pressed' };
const NAMES = { a: 'Alba', b: 'Berto', c: 'Carla', d: 'Dario', e: 'Elsa' };

const characters = IDS.map(id => ({
  id, name: NAMES[id], color: '#888888',
  label: `Townsperson ${id}`,
  introduction: `I am ${NAMES[id]}, and I live here.`,
  quickQuestion: `What do you do, ${NAMES[id]}?`,
  knowledge: [`${NAMES[id]} lives in the walled town on the hill.`],
  reveal: `${NAMES[id]} came from a time of smartphone and spreadsheet.`,
}));

const lines = {};
const slips = {};
for (const id of IDS) {
  lines[id] = {};
  slips[id] = [];
  for (const t of TOPICS) {
    lines[id][t.id] = `${NAMES[id]} speaks plainly about ${t.label.toLowerCase()}.`;
    const [term, aliases] = TERMS[id][t.id];
    slips[id].push({
      id: `${id}-${t.id}`, topic: t.id, when: t.id === 'square' ? WHEN[id] : 'always', term, aliases,
      line: `${NAMES[id]} says: I keep my ${t.label.toLowerCase()} on a ${term}, as always.`,
      clean: `${NAMES[id]} says: I keep my ${t.label.toLowerCase()} in order, as always.`,
      correction: `I keep my ${t.label.toLowerCase()} on a`,
      followUps: [
        `${NAMES[id]} laughs: a way of speaking, nothing more (${t.id} one).`,
        `${NAMES[id]} shrugs: a foreign word, I forget where I heard it (${t.id} two).`,
      ],
    });
  }
}

const replies = {};
const rehearsal = {};
for (const id of IDS) {
  replies[id] = {
    guarded: `${NAMES[id]} says: enough of that, signora.`,
    wordReply: `${NAMES[id]} says: those are only plain words.`,
    neverSaid: `${NAMES[id]} says: I never said that.`,
    puzzled: `${NAMES[id]} says: I do not know that word.`,
    deflect: `${NAMES[id]} says: let us speak of something else.`,
    denial: `${NAMES[id]} says: you accuse the wrong person.`,
  };
  rehearsal[id] = [`${NAMES[id]} says: ask me more, signora.`, `${NAMES[id]} says: the day is long.`];
}

export const talkData = {
  characters,
  parts: [{ id: 'traveler', label: 'Townsperson', introduction: 'I live here.', knowledge: ['The town stands on a hill.'] }],
  copy: { headline: 'A word out of time', intro: { lead: 'Find the traveller.', body: 'Listen closely.' } },
  talk: {
    topics: TOPICS,
    lines,
    slips,
    replies,
    glossary: [{ terms: ['signora', 'signore'], text: 'A courteous way to address a lady.' }],
    rehearsal,
  },
};
export const ids = IDS;
export const topicIds = TOPICS.map(t => t.id);
