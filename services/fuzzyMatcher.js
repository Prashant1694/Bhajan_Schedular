/**
 * services/fuzzyMatcher.js
 *
 * Enhanced pure-JS fuzzy string similarity for the Missing Bhajan Catcher.
 * Handles:
 *  - Stripping repeat notations: (2), (3), (x2), [2]
 *  - Stripping scale/raga suffixes: "... G#m Darbari", "... D Bilawal", "... 2.5P"
 *  - Vowel/stem normalization: rama/ram, jaya/jai, ishwara/ishwar, bhajo/bhajomana, durge/durga, etc.
 *  - Multiset token overlap + Dice bigram coefficient
 */

function cleanAndStemBhajanTitle(title) {
  let str = String(title || "").trim();

  // 1. Remove parenthetical repetitions: (2), (3), (x2), [2], etc.
  str = str.replace(/[\(\[\{]\s*(?:x?\d+|\d+x?)\s*[\)\]\}]/gi, "");

  // 2. Remove trailing ellipsis and scale/raga metadata like "... G#m Darbari", "... D Bilawal"
  str = str.replace(/\s*\.{2,}.*$/gi, "");

  // 3. Lowercase & strip punctuation
  str = str
    .toLowerCase()
    .replace(/[''`".,;:!?()\[\]{}\/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const stemMap = {
    jaye: "jai",
    jaya: "jai",
    jay: "jai",
    rama: "ram",
    raam: "ram",
    ishwara: "ishwar",
    eeshwara: "ishwar",
    isvara: "ishwar",
    durge: "durga",
    naama: "naam",
    nam: "naam",
    bhajomana: "bhajo",
    bhajoman: "bhajo",
    bhajorey: "bhajo",
    bhajore: "bhajo",
    bhajare: "bhajo",
    bhajarey: "bhajo",
    gowri: "gauri",
    shankari: "shankar",
    shankara: "shankar",
    patey: "pati",
    pate: "pati",
    pahimam: "pahi",
    paahi: "pahi",
    sumbramnya: "subramanya",
    subramnya: "subramanya",
    subramanyam: "subramanya",
    swaroopini: "swarup",
    swarupini: "swarup",
    swaroopa: "swarup",
    swarupa: "swarup",
    shreeman: "shriman",
    shree: "shri",
    gajanana: "gajanan",
    sita: "seetha",
    sitha: "seetha"
  };

  const words = str
    .split(" ")
    .filter(Boolean)
    .map((w) => stemMap[w] || w);
  return words.join(" ");
}

function normalizeBhajanTitle(title) {
  return cleanAndStemBhajanTitle(title);
}

function getBigrams(str) {
  const bigrams = new Set();
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.slice(i, i + 2));
  }
  return bigrams;
}

function diceSimilarity(a, b) {
  const na = cleanAndStemBhajanTitle(a);
  const nb = cleanAndStemBhajanTitle(b);

  if (na === nb) return 1.0;
  if (na.length < 2 || nb.length < 2) return 0;

  const bigramsA = getBigrams(na);
  const bigramsB = getBigrams(nb);

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

function tokenMultisetScore(a, b) {
  const tokA = cleanAndStemBhajanTitle(a).split(" ").filter(Boolean);
  const tokB = cleanAndStemBhajanTitle(b).split(" ").filter(Boolean);
  if (!tokA.length || !tokB.length) return 0;

  const countsB = {};
  tokB.forEach((t) => (countsB[t] = (countsB[t] || 0) + 1));

  let matches = 0;
  tokA.forEach((t) => {
    if (countsB[t] && countsB[t] > 0) {
      matches++;
      countsB[t]--;
    }
  });

  return (2 * matches) / (tokA.length + tokB.length);
}

function combinedScore(a, b) {
  const sa = cleanAndStemBhajanTitle(a);
  const sb = cleanAndStemBhajanTitle(b);
  if (sa === sb) return 1.0;

  const dice = diceSimilarity(a, b);
  const token = tokenMultisetScore(a, b);
  return dice * 0.5 + token * 0.5;
}

function findSimilarBhajans(submittedTitle, masterBhajans, threshold = 0.5, topN = 4) {
  const stemSub = cleanAndStemBhajanTitle(submittedTitle);
  if (!stemSub || stemSub.length < 3) return [];

  const results = [];
  for (let i = 0; i < masterBhajans.length; i++) {
    const master = masterBhajans[i];
    const stemMas = cleanAndStemBhajanTitle(master.title);

    const lenRatio =
      Math.min(stemSub.length, stemMas.length) / Math.max(stemSub.length, stemMas.length);
    if (lenRatio < 0.35 && Math.abs(stemSub.length - stemMas.length) > 15) continue;

    const score = combinedScore(submittedTitle, master.title);
    if (score >= threshold) {
      results.push({ master, score });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topN);
}

function buildMasterIndex(masterBhajans) {
  return masterBhajans.map((m) => {
    const stem = cleanAndStemBhajanTitle(m.title);
    const tokens = stem.split(" ").filter(Boolean);
    const tokenCounts = {};
    tokens.forEach((t) => (tokenCounts[t] = (tokenCounts[t] || 0) + 1));
    const bigrams = new Set();
    for (let i = 0; i < stem.length - 1; i++) bigrams.add(stem.slice(i, i + 2));
    return { master: m, stem, tokens, tokenCounts, bigrams };
  });
}

function matchWithIndex(submittedTitle, masterIndex, threshold = 0.45, topN = 4) {
  const stemSub = cleanAndStemBhajanTitle(submittedTitle);
  if (!stemSub || stemSub.length < 3) return [];

  const tokSub = stemSub.split(" ").filter(Boolean);
  const bgSub = new Set();
  for (let i = 0; i < stemSub.length - 1; i++) bgSub.add(stemSub.slice(i, i + 2));

  const matches = [];
  for (let i = 0; i < masterIndex.length; i++) {
    const pm = masterIndex[i];
    if (Math.abs(stemSub.length - pm.stem.length) > 15) continue;
    if (stemSub === pm.stem) {
      matches.push({ master: pm.master, score: 1.0 });
      continue;
    }

    let intersection = 0;
    for (const bg of bgSub) {
      if (pm.bigrams.has(bg)) intersection++;
    }
    const dice =
      bgSub.size + pm.bigrams.size === 0 ? 0 : (2 * intersection) / (bgSub.size + pm.bigrams.size);

    let tokenMatches = 0;
    for (let k = 0; k < tokSub.length; k++) {
      if (pm.tokenCounts[tokSub[k]]) tokenMatches++;
    }
    const tokenScore =
      tokSub.length + pm.tokens.length === 0
        ? 0
        : (2 * tokenMatches) / (tokSub.length + pm.tokens.length);

    const score = dice * 0.5 + tokenScore * 0.5;
    if (score >= threshold) matches.push({ master: pm.master, score });
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, topN);
}

module.exports = {
  cleanAndStemBhajanTitle,
  normalizeBhajanTitle,
  diceSimilarity,
  combinedScore,
  findSimilarBhajans,
  buildMasterIndex,
  matchWithIndex
};
