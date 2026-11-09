// Anachronism lexicon: modern words that must never be spoken by a townsperson in June 1489.
// Curated by hand. It never lists period words (press, printer, spectacles, clock, lathe, mirror,
// skittles, ninepins, camera on its own, engineer, tablet, battery, virus, train, plane).
// Matching is case-insensitive, unicode-normalised, on word boundaries; spaces and hyphens in a
// term are interchangeable, and a plural "s"/"es" is allowed.

export const LEXICON = [
  // devices and screens
  'smartphone', 'smart phone', 'iphone', 'android', 'cellphone', 'cell phone', 'mobile phone', 'telephone', 'phone',
  'computer', 'laptop', 'keyboard', 'touchscreen', 'touch screen', 'television', 'tv', 'radio', 'microphone', 'headphones',
  'earphones', 'bluetooth', 'wifi', 'wi-fi', 'usb', 'charger', 'remote control', 'robot', 'artificial intelligence', 'time machine', 'drone', 'hologram', 'gps',
  'satellite', 'microchip', 'selfie stick',
  // media and internet
  'selfie', 'internet', 'online', 'website', 'web page', 'webpage', 'email', 'e-mail', 'spreadsheet', 'software', 'app',
  'download', 'upload', 'password', 'hashtag', 'emoji', 'meme', 'blog', 'podcast', 'text message', 'sms', 'wireless',
  'google', 'facebook', 'instagram', 'youtube', 'twitter', 'tiktok', 'netflix', 'amazon prime', 'photograph', 'photo',
  'video', 'movie', 'cinema', 'film star', 'celebrity',
  // transport
  'car', 'taxi', 'bus', 'motorcycle', 'motorbike', 'bicycle', 'scooter', 'skateboard', 'airplane', 'aeroplane', 'airport',
  'helicopter', 'rocket', 'jet', 'subway', 'metro', 'highway', 'motorway', 'traffic light', 'petrol', 'gasoline', 'diesel',
  'astronaut', 'spaceship', 'space station',
  // power, materials, household
  'electricity', 'electric', 'lightbulb', 'light bulb', 'plastic', 'nylon', 'aluminium', 'aluminum', 'refrigerator', 'fridge',
  'microwave', 'toaster', 'dishwasher', 'washing machine', 'vacuum cleaner', 'zipper', 'jeans', 't-shirt', 'sneakers',
  'sunglasses', 'deodorant', 'shampoo',
  // units and speech
  'kilometre', 'kilometer', 'kilogram', 'centimetre', 'centimeter', 'celsius', 'fahrenheit', 'percent', 'okay', 'ok',
  // foods and plants that reached Italy after 1489
  'potato', 'tomato', 'chocolate', 'tobacco', 'hamburger', 'ketchup', 'popcorn', 'pineapple', 'vanilla', 'cola',
  'coca-cola', 'sandwich',
  // science and medicine
  'nuclear', 'atom bomb', 'antibiotic', 'penicillin', 'vaccine', 'x-ray', 'dna', 'scientist',
];

const SEP = '[\\s\\-\\u2010-\\u2015]+';
const L = '\\p{L}\\p{N}';

// Fold text so look-alike characters compare equal: NFKC, drop invisible characters, curly quotes.
export function fold(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[\p{Cf}\u034f\u180e]/gu, '')
    .replace(/[\u0430\u0435\u043e\u0440\u0441\u0445\u0443\u0456\u0458\u03bf]/gu, c => ({ '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c', '\u0445': 'x', '\u0443': 'y', '\u0456': 'i', '\u0458': 'j', '\u03bf': 'o' })[c])
    .replace(/[‘’]/g, "'");
}

const cache = new Map();
function regexFor(term) {
  const key = fold(term).trim().toLowerCase();
  let re = cache.get(key);
  if (!re) {
    const body = key.split(/[\s\-‐-―]+/).filter(Boolean)
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(SEP);
    re = body ? new RegExp(`(?<![${L}])${body}(?:e?s)?(?![${L}])`, 'giu') : null;
    cache.set(key, re);
  }
  return re;
}

// True when `text` contains `term` as a whole word or phrase.
export function hasTerm(text, term) {
  const re = regexFor(term);
  if (!re) return false;
  re.lastIndex = 0;
  return re.test(fold(text));
}

function termList(extra) {
  const out = [];
  const seen = new Set();
  for (const t of [...LEXICON, ...(Array.isArray(extra) ? extra : [])]) {
    const k = fold(t).trim().toLowerCase();
    if (k && !seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out;
}

// Modern terms found in `text`, lower-case, each once, in lexicon order then extras.
export function modernWords(text, extra = []) {
  const s = fold(text);
  return termList(extra).filter(t => hasTerm(s, t));
}

// Replace every modern term with "that word".
export function maskModern(text, extra = []) {
  let s = fold(text);
  for (const t of termList(extra)) {
    const re = regexFor(t);
    if (re) { re.lastIndex = 0; s = s.replace(re, 'that word'); }
  }
  return s;
}

// Guard-only words: used on model answers and on typed questions, never on authored text.
export const GUARD_ONLY = ['time travel', 'time traveller', 'time traveler', 'time machine', 'artificial intelligence', 'robot'];
const AI_TOKEN = /(?<![\p{L}\p{N}])AI(?![\p{L}\p{N}])/gu;
export function guardHits(text, extra = []) {
  const hits = modernWords(text, [...GUARD_ONLY, ...extra]);
  if (fold(text).match(AI_TOKEN)) hits.push('AI');
  return hits;
}
export function maskGuard(text, extra = []) {
  return maskModern(text, [...GUARD_ONLY, ...extra]).replace(AI_TOKEN, 'that word');
}
// A question about time travel itself.
const TIME_Q = /\btime[\s-]+(?:travel(?:l?er|l?ers|l?ing|led|s)?|machines?)\b|\bfrom the future\b|\banother time\b/iu;
export const asksTimeTravel = text => TIME_Q.test(fold(text));
