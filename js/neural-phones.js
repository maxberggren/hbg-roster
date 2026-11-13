'use strict';
// Text to the neural voice's input: the words and pronunciations of frontend.js (lexicon.js, patches.js and the
// spelling rules), written the way the neural model was taught to read. That model is a Piper/VITS voice grown from a
// standard Swedish one whose sounds were written in espeak-ng's symbols, so each sound here is given the symbol espeak
// would use for it, and the model, taught on Helsingborgers with exactly this input, does the Skånska itself: the dialect
// rules of frontend.js (skanify) are not applied, only its choice of words and its lexicon. No espeak is needed anywhere.
// The same file made the model's training input, so what it reads here is what it was taught on.
(() => {
  // the ids are Piper's fixed table for espeak symbols (piper/phoneme_ids.py); only what Swedish needs
  const ID = { '_': 0, '^': 1, '$': 2, ' ': 3, ',': 8, '.': 10, '!': 4, '?': 13, 'ˈ': 120, 'ˌ': 121, 'ː': 122, a: 14, b: 15, d: 17, e: 18, f: 19, h: 20, i: 21, j: 22, k: 23, l: 24, m: 25, n: 26, o: 27, p: 28, r: 30, s: 31, t: 32, u: 33, v: 34, y: 37, 'ø': 42, 'ŋ': 44, 'œ': 45, 'ɑ': 51, 'ɔ': 54, 'ə': 59, 'ɛ': 61, 'ɡ': 66, 'ɪ': 74, 'ɧ': 72, 'ɕ': 55, 'ʂ': 95, 'ʈ': 98, 'ɖ': 56, 'ɳ': 83, 'ɭ': 77, 'ɵ': 85, 'ʉ': 99, 'ʊ': 100 };
  // the lexicon's sounds (SAMPA as OpenSLR SLR29 writes Swedish) in espeak's symbols
  const VOWEL = { 'A:': 'ɑː', a: 'a', 'e:': 'eː', 'E:': 'ɛː', E: 'ɛ', e: 'ɛ', 'i:': 'iː', I: 'ɪ', 'o:': 'oː', O: 'ɔ', 'u:': 'uː', U: 'ʊ', '}:': 'ʉː', u0: 'ɵ', 'y:': 'yː', Y: 'y', '2:': 'øː', '9': 'œ', 'a*U': 'aʊ', 'E*U': 'ɛʊ', '@': 'ə', '{': 'ɛ', '{:': 'ɛː', '9:': 'øː', '8': 'ɵ' };
  const CONS = { p: 'p', b: 'b', t: 't', d: 'd', k: 'k', g: 'ɡ', f: 'f', v: 'v', s: 's', h: 'h', m: 'm', n: 'n', l: 'l', r: 'r', j: 'j', N: 'ŋ', S: 'ɧ', "s'": 'ɕ', 's`': 'ʂ', 't`': 'ʈ', 'd`': 'ɖ', 'n`': 'ɳ', 'l`': 'ɭ', 'x\\': 'ɧ', C: 'ɕ', w: 'v', z: 's', Z: 'ɧ', T: 't', D: 'd' };
  // these carry no stress of their own in running speech (frontend.js has the same list for its timing)
  const WEAK = new Set('ja jag det de e är en ett i på du han hon å och den dom va att som te till så för med mej dej sej men om ska man har av vi ni kan vill sa från ha'.split(' '));

  // small words the lexicon has in a citation form nobody says (or wrong: its kan is the khan, its du has y), as they are said;
  // patches.js still wins where it has the word
  const SAID = { har: 'h a r', kan: 'k a n', han: 'h a n', hon: 'h U n', ska: 's k a', ju: 'j }:', du: 'd }:', den: 'd E n', min: 'm I n', din: 'd I n', sin: 's I n', de: 'd O m', dem: 'd O m', va: 'v a', sa: 's a', av: 'A: v', liksom: '"l I k s O m', kanske: '"k a n S e', ibland: 'I "b l a n d', ute: '"}: t e', person: 'p E "s` u: n', personer: 'p E "s` u: n e r', nån: 'n O n', nåt: 'n O t', sån: 's O n', sånt: 's O n t', mej: 'm E j', dej: 'd E j', sej: 's E j' };

  // Skåne's stressed long vowels written as the two sounds they glide between (Bruce 1970, as README.md's table), for
  // opt.diph: the model then starts from a glide instead of having to find it in the recordings by itself
  const DIPH = { 'i:': 'eiː', 'e:': 'ɛeː', 'E:': 'aɛː', 'y:': 'øyː', '}:': 'øʉː', '2:': 'œøː', 'u:': 'ɛuː', 'o:': 'ɛoː', 'A:': 'aɑː' };

  // one word's pronunciation ("h E l s I N \"2: r") as espeak-style symbols; an unstressed e is espeak's ə
  function word(pron, weak, diph) {
    let out = '', pending = '';
    for (let tok of pron.split(/\s+/)) {
      if (!tok) continue;
      if (tok[0] === '"') { pending = 'ˈ'; tok = tok.replace(/^"+/, ''); } else if (tok[0] === '%') { pending = 'ˌ'; tok = tok.slice(1); }
      if (VOWEL[tok]) { out += (weak ? '' : pending) + (tok === 'e' && !pending ? 'ə' : diph && !weak && pending === 'ˈ' && DIPH[tok] || VOWEL[tok]); pending = ''; }
      else if (CONS[tok]) out += CONS[tok];
    }
    // a word the lexicon gave no stress has it on its first vowel, as frontend.js does
    if (!weak && !/[ˈˌ]/.test(out)) out = out.replace(/[aeiouyøœɑɔəɛɪɵʉʊ]/, 'ˈ$&');
    return out;
  }

  // text -> { symbols, ids }: ids as Piper wants them (^ first, $ last, _ between every two). opt goes to analyse():
  // spoken: false keeps written words as written (training on transcripts), the default wears them down as people speak.
  function phones(text, opt = {}) {
    const phrases = globalThis.SkaneText.analyse(text, opt); let symbols = '';
    phrases.forEach((ph, k) => {
      const only = ph.words.length === 1;
      symbols += ph.words.map(w => word((w.src !== 'skånska' || opt.spoken === false) && SAID[w.said] || w.pron, WEAK.has(w.said) && !only, opt.diph)).filter(Boolean).join(' ');
      symbols += ph.kind === 'question' ? '?' : ph.kind === 'exclaim' ? '!' : ph.pause > .2 ? '.' : k < phrases.length - 1 && ph.pause > .05 ? ',' : k === phrases.length - 1 ? '.' : '';
      if (k < phrases.length - 1) symbols += ' ';
    });
    const ids = [ID['^'], 0];
    for (const c of symbols) if (ID[c] !== undefined) ids.push(ID[c], 0);
    ids.push(ID['$']);
    return { symbols, ids };
  }

  globalThis.SkaneNeural = { phones, word, ID };
})();
