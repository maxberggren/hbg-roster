'use strict';
// Skånsk text to sound, the language half: text -> words -> phones -> what a Malmöhus speaker does with them.
// The stages follow Chimera's (github.com/jamesondh/chimera-vocal-synth, MIT): lexicon with a letter-to-sound fallback,
// IPA segments with stress and word ends, Klatt-style durations. The dialect is in skanify() and accentOf(); README.md
// says where each rule comes from and which of them rest on no source. No DOM, no audio: runs in the worker and in node.
(() => {
  /* ---------- the lexicon: the words (lexicon.js, standard Swedish), read on first use ---------- */
  let lexicon = null;
  function lex() {
    if (lexicon) return lexicon;
    lexicon = new Map();
    for (const e of (globalThis.SKANE_LEXICON || '').split('|')) { const k = e.indexOf('='); if (k > 0) lexicon.set(e.slice(0, k), e.slice(k + 1)); }
    return lexicon;
  }

  // what the lexicon cannot know lives in patches.js, the file to edit
  const { PRON: SKANSKA, SPOKEN, WORDS } = globalThis.SKANE_PATCHES;
  const PLAIN = { dej: '"d E j', mej: '"m E j', sej: '"s E j' };   // for hearing the voice as it was before daj (tune.html)
  const JOINED = Object.keys(SPOKEN).filter(k => k.includes(' ')).map(k => [new RegExp('(^|[^\\p{L}])' + k + '(?![\\p{L}])', 'giu'), k]);

  // these lean on the next stressed word: no accent of their own, and the long vowel goes with it
  const WEAK = new Set('ja jag det de e är en ett i på du han hon å och den dom va att som te till så för med mej dej sej men om ska man har av vi ni kan vill sa från ha'.split(' '));

  /* ---------- letter to sound: Swedish spelling rules, for what the lexicon does not have ---------- */
  const FRONT = 'eiyäö', VOW = 'aeiouyåäöé';
  const LONG = { a: 'A:', e: 'e:', é: 'e:', i: 'i:', o: 'u:', u: '}:', y: 'y:', å: 'o:', ä: 'E:', ö: '2:' };
  const SHORT = { a: 'a', e: 'E', é: 'E', i: 'I', o: 'O', u: 'u0', y: 'Y', å: 'O', ä: 'E', ö: '9' };
  const WEAKV = { a: 'a', e: 'e', é: 'e', i: 'I', o: 'U', u: 'u0', y: 'Y', å: 'O', ä: 'E', ö: '9' };
  const LATE = /(tion|sion|era|erar|erad|erade|ist|ism|eri|ik|ant|ent|ör)$/;

  function stressAt(w, vowels) {
    if (vowels.length < 2) return 0;
    if (LATE.test(w)) { const m = w.match(LATE); const at = w.length - m[0].length; let k = vowels.findIndex(v => v >= at); return k < 0 ? 0 : k; }
    if (/^(be|ge|för|er)[^aeiouyåäö]/.test(w) && vowels.length > 2 || /^(be|ge|för)[^aeiouyåäö]/.test(w)) return 1;
    return 0;
  }
  function rules(word) {
    const w = word.toLowerCase().replace(/[^a-zåäöé]/g, '');
    if (!w) return '';
    const vowels = []; for (let i = 0; i < w.length; i++) if (VOW.includes(w[i])) vowels.push(i);
    const sAt = vowels.length ? vowels[stressAt(w, vowels)] : -1;
    const out = [];
    const c = k => w[k] || '';
    let i = 0;
    while (i < w.length) {
      const a = c(i), b = c(i + 1), d = c(i + 2), first = i === 0;
      if (VOW.includes(a)) {
        const stressed = i === sAt;
        let run = 0; for (let k = i + 1; k < w.length && !VOW.includes(c(k)); k++) run++;
        const rest = w.slice(i + 1);
        const long = stressed && (run === 0 || run === 1 && !/^(x|m$|ng|j$)/.test(rest));
        const v = stressed ? (long ? LONG[a] : SHORT[a]) : WEAKV[a];
        out.push((stressed ? '"' : '') + v);
        i++; continue;
      }
      if (w.startsWith('tion', i)) { out.push('S', '}:', 'n'); i += 4; continue; }
      if (w.startsWith('sion', i)) { out.push('S', '}:', 'n'); i += 4; continue; }
      if (w.startsWith('sch', i) || w.startsWith('skj', i) || w.startsWith('stj', i)) { out.push('S'); i += 3; continue; }
      if (a === 's' && b === 'j') { out.push('S'); i += 2; continue; }
      if (a === 's' && b === 'k' && FRONT.includes(d) && d) { out.push('S'); i += 2; continue; }
      if ((a === 't' || a === 'k') && b === 'j') { out.push("s'"); i += 2; continue; }
      if (a === 'k' && FRONT.includes(b) && b && (first || i <= 1)) { out.push("s'"); i++; continue; }
      if (a === 'g' && FRONT.includes(b) && b && first) { out.push('j'); i++; continue; }
      if (first && 'dghl'.includes(a) && b === 'j') { out.push('j'); i += 2; continue; }
      if (a === 'c' && b === 'k') { out.push('k'); i += 2; continue; }
      if (a === 'n' && b === 'g') { out.push('N'); i += 2; if (c(i) === 'g') i++; continue; }
      if (a === 'n' && b === 'k') { out.push('N', 'k'); i += 2; continue; }
      if (a === 'g' && b === 'n' && !first) { out.push('N', 'n'); i += 2; continue; }
      if ((a === 'r' || a === 'l') && b === 'g' && (!d || !VOW.includes(d) || FRONT.includes(d))) { out.push(a, 'j'); i += 2; continue; }
      if (a === 'i' && b === 'g' && !d) { out.push('I'); i += 2; continue; }
      if (a === 'p' && b === 'h') { out.push('f'); i += 2; continue; }
      if (a === 'q') { out.push('k'); i += b === 'u' ? 2 : 1; if (b === 'u') out.push('v'); continue; }
      if (a === 'x') { out.push('k', 's'); i++; continue; }
      if (a === 'c') { out.push(FRONT.includes(b) && b ? 's' : 'k'); i++; continue; }
      if (a === 'z') { out.push('s'); i++; continue; }
      if (a === 'w') { out.push('v'); i++; continue; }
      if (a === b) { out.push(a); i += 2; continue; }
      out.push(a); i++;
    }
    return out.join(' ');
  }

  // Swedish makes words by gluing them (borgmästar+bil): known parts, the first with the stress, the rest with a secondary
  const known = w => SKANSKA[w] || lex().get(w);
  function compound(w, depth = 0) {
    if (depth > 3) return null;
    for (let k = w.length - 3; k >= 3; k--) {
      const head = known(w.slice(0, k));
      if (!head) continue;
      for (const at of w[k] === 's' && k + 4 < w.length ? [k + 1, k] : [k]) {
        const part = w.slice(at), tail = known(part) || compound(part, depth + 1);
        if (tail) return (head + (at > k ? ' s ' : ' ') + tail.replace(/"/g, '%')).trim();
      }
    }
    return null;
  }

  /* ---------- from the lexicon's notation to Skåne ---------- */
  const VOWELS = { 'i:': 'iː', I: 'ɪ', 'e:': 'eː', e: 'e', E: 'ɛ', 'E:': 'ɛː', '{:': 'ɛː', '{': 'ɛ', 'y:': 'yː', Y: 'ʏ', '}:': 'ʉː', u0: 'ɵ', '2:': 'øː', '9:': 'øː', 9: 'œ', 'u:': 'uː', U: 'ʊ', 'o:': 'oː', O: 'ɔ', 'A:': 'ɑː', a: 'a', '@': 'ə' };
  const LOANS = { 'a*U': ['a', 'U'], 'E*U': ['E', 'U'], 'E*': ['E'], 'a*': ['a'] };
  const CONS = { p: 'p', b: 'b', t: 't', d: 'd', k: 'k', g: 'g', f: 'f', v: 'v', s: 's', h: 'h', m: 'm', n: 'n', N: 'ŋ', l: 'l', j: 'j', r: 'ʁ', S: 'ɧ', "s'": 'ɕ', 'x\\': 'ɧ', 'C': 'ɕ', z: 's' };
  // the retroflexes of the standard language do not exist here: r stays an r in the throat, and what follows stays itself
  // But only where there is an r to bring back: kanske, usch and matchen are written the same way, and there s` is the sj.
  const UNRETRO = { 'n`': 'n', 't`': 't', 'd`': 'd', 's`': 's', 'l`': 'l' };
  // Bruce 1970, Diphthongization in the Malmö dialect, p. 9: long vowels start open and fairly neutral and close towards
  // their target. Frid, Schötz & Löfqvist 2012 measure /uː/ starting at an [e]-like front vowel and moving far back.
  // /ɑː/ starts at [a] as in Wikipedia, not Bruce's fronter [æ]: a long vowel that far forward is what Danish does.
  const DIPHTHONG = { 'iː': ['e', 'i'], 'eː': ['ɛ', 'e'], 'ɛː': ['æ', 'ɛ'], 'yː': ['ø', 'y'], 'ʉː': ['ɛ', 'ʉ'], 'øː': ['œ', 'ø'], 'uː': ['ɛ', 'u'], 'oː': ['ɛ', 'o', 'ɔ'], 'ɑː': ['a', 'ɔ', 'ɑ'] };
  // and the third value, where there is one, is a stop on the way: å as eåo and a as ao, auo, the way the dialect is described in writing
  const VOICELESS = new Set(['p', 't', 'k', 's', 'f', 'ɕ', 'ɧ', 'h']);
  const STOPS = { p: 'b', t: 'd', k: 'g' };

  function parse(pron, word = '') {
    const ph = [], hasR = word.includes('r');
    let pending = 0, inRun = false;
    for (let tok of pron.split(/\s+/)) {
      if (!tok) continue;
      if (tok.startsWith('"')) { pending = 1; tok = tok.replace(/^"+/, ''); } else if (tok.startsWith('%')) { pending = 2; tok = tok.slice(1); }
      for (const t of LOANS[tok] || [tok]) {
        const retro = UNRETRO[t];
        if (VOWELS[t]) { ph.push({ v: VOWELS[t], stress: pending }); pending = 0; }
        else if (retro) {
          // one r colours the whole run of consonants after it (barstol: r s t), and only the first brings it back
          if (hasR && ph.length && !inRun) ph.push({ c: CONS.r });
          ph.push({ c: t === 's`' && (!hasR || !ph.length) ? CONS.S : CONS[retro] });
        }
        else if (CONS[t]) ph.push({ c: CONS[t] });
        inRun = !!retro;
      }
    }
    return ph;
  }

  // Skånes word accents, by the spelling and the syllables: the lexicon does not tell 1 from 2 (it writes both alike).
  // Stress with something after it is accent 2, but for a syllable before the stress (a loanword) and the endings that
  // come with accent 1 on a two-syllable word: bil-en, cyk-el, vatt-en, läs-er.
  function accentOf(word, ph) {
    const vs = ph.filter(p => p.v);
    const at = vs.findIndex(p => p.stress === 1);
    if (at < 0 || at === vs.length - 1 && !vs.some(p => p.stress === 2)) return 1;
    if (vs.some(p => p.stress === 2)) return 2;
    if (at > 0) return 1;
    if (vs.length === 2 && /(en|et|el|er)$/.test(word)) return 1;
    return 2;
  }

  // what comes out is what the synth sings: a list of consonants and vowels, each vowel with where it starts and ends
  function skanify(word, ph, o) {
    const weak = WEAK.has(word) && !o.strong;
    const segs = [];
    ph.forEach((p, i) => {
      if (p.v) {
        const stress = weak ? 0 : p.stress;
        let base = p.v;
        // Bruce p. 4: short /e/ and /ɛ/ are one vowel here
        // ... and an unstressed one keeps that colour: -en and -er as [ɛn] [ɛʁ]. A schwa there is half of sounding Danish
        if (base === 'e') base = 'ɛ';
        const long = base.endsWith('ː');
        const plain = long ? base.slice(0, -1) : base;
        // Frid et al. 2012: only stressed vowels diphthongise. A weakened long /ɑː/ turns into plain short [a].
        if (long && stress) { const d = DIPHTHONG[base]; segs.push({ ipa: d[2] ? d[0] + '͡' + d[2] + '͡' + d[1] : d[0] + '͡' + d[1], a: d[0], b: d[1], m: d[2], long: true, stress, vowel: true }); }
        else segs.push({ ipa: plain === 'ɑ' && !stress ? 'a' : plain, a: plain === 'ɑ' && !stress ? 'a' : plain, b: plain === 'ɑ' && !stress ? 'a' : plain, long: false, stress, vowel: true });
        return;
      }
      let c = p.c;
      const prev = ph[i - 1], next = ph[i + 1];
      // Wikipedia, Scanian dialect (and Bruce p. 1): the r is always in the throat, voiceless next to voiceless sounds
      if (c === 'ʁ' && (prev && VOICELESS.has(prev.c) || next && VOICELESS.has(next.c))) c = 'χ';
      const seg = { ipa: c, c };
      // köpa -> köba, gata -> gada: after a long vowel. Common knowledge of the dialect, but the sources read do not cover
      // it (README.md), so it is a setting of its own, not a fixed rule.
      if (STOPS[c] && prev && prev.v && prev.v.endsWith('ː') && !weak && (!next || next.v)) { seg.lenis = o.lenition; if (o.lenition >= .5) seg.ipa = STOPS[c]; }
      segs.push(seg);
    });
    return segs;
  }

  /* ---------- the text ---------- */
  const ONES = ['noll', 'ett', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva', 'tolv', 'tretton', 'fjorton', 'femton', 'sexton', 'sjutton', 'arton', 'nitton'];
  const TENS = ['', '', 'tjugo', 'trettio', 'fyrtio', 'femtio', 'sextio', 'sjuttio', 'åttio', 'nittio'];
  function number(n) {
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[n / 10 | 0] + (n % 10 ? ' ' + ONES[n % 10] : '');
    if (n < 1000) return (n / 100 | 0 === 1 ? 'hundra' : ONES[n / 100 | 0] + ' hundra') + (n % 100 ? ' ' + number(n % 100) : '');
    if (n < 1e6) return (n / 1000 | 0) === 1 ? 'tusen' + (n % 1000 ? ' ' + number(n % 1000) : '') : number(n / 1000 | 0) + ' tusen' + (n % 1000 ? ' ' + number(n % 1000) : '');
    return String(n).split('').map(d => ONES[+d]).join(' ');
  }
  function clean(text) {
    return String(text)
      .replace(/\*(hick|hik)\*/gi, ' hick! ').replace(/\*(flås|pust)\*/gi, ' hah, ')   // what is acted is done, not read out
      .replace(/\*[^*]*\*/g, ' ').replace(/♪/g, ' ')
      .replace(/\d+/g, m => ' ' + number(+m) + ' ')
      .replace(/(\p{L})\1{2,}/gu, '$1$1')                             // Tjuuuv, Buäää
      .replace(/[“”"«»()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // the text's phrases: { words: [{ text, src, segs, accent, emph }], kind, pause }
  function analyse(text, opt = {}) {
    const o = { lenition: opt.lenition === undefined ? .25 : opt.lenition };
    const spoken = opt.spoken !== false;
    const phrases = [];
    const parts = clean(text).match(/[^.,;:!?…–—]+[.,;:!?…–—]*/g) || [];
    for (const part of parts) {
      const tail = (part.match(/[.,;:!?…–—]+$/) || [''])[0];
      const said = spoken ? JOINED.reduce((t, [re, k]) => t.replace(re, (m, lead) => lead + (m.slice(lead.length) === m.slice(lead.length).toUpperCase() ? SPOKEN[k].toUpperCase() : SPOKEN[k])), part) : part;
      const raw = said.match(/[\p{L}'’-]+/gu) || [];
      if (!raw.length) continue;
      // the written word, then the word that is said
      const patched = raw.map(w => {
        const lower = w.toLowerCase().replace(/['’-]/g, '');
        if (opt.plainWords && lower === 'inte') return lower;
        return (opt.oldWords && WORDS[lower]) || (spoken && !lower.includes(' ') && SPOKEN[lower]) || lower;
      });
      const allWeak = patched.every(w => WEAK.has(w));
      const words = raw.map((w, k) => {
        const lower = patched[k];
        let pron = (opt.plainWords && PLAIN[lower]) || SKANSKA[lower], src = 'skånska';
        if (!pron) { pron = lex().get(lower); src = 'lexikon'; }
        if (!pron) { pron = compound(lower); src = 'sammansatt'; }
        if (!pron) { pron = rules(lower); src = 'regler'; }
        // -ig and -igt lose their g in speech (rolig, roligt): after a syllable of its own, so never mig or stig
        if (spoken && src !== 'skånska') pron = pron.replace(/(\S.*\s)I g$/, '$1I').replace(/(\S.*\s)I k t$/, '$1I t');
        const ph = parse(pron, lower);
        const strong = allWeak && k === raw.length - 1;
        if (strong && !ph.some(p => p.stress)) { const v = ph.find(p => p.v); if (v) v.stress = 1; }
        // a word without a stress mark gets one on its first vowel (never a word of the WEAK list in a sentence)
        if (!ph.some(p => p.stress)) { const v = ph.find(p => p.v); if (v) v.stress = 1; }
        const segs = skanify(lower, ph, { lenition: o.lenition, strong });
        return { text: w, said: lower, patched: lower !== w.toLowerCase().replace(/['’-]/g, ''), src, pron, segs, accent: accentOf(lower, ph), emph: w.length > 1 && w === w.toUpperCase() && /\p{Lu}/u.test(w), ipa: segs.map(s => s.ipa).join('') };
      });
      const kind = tail.includes('?') ? 'question' : tail.includes('!') ? 'exclaim' : 'statement';
      // a comma is hardly a pause in speech (a breath of a stop, often none): the Helsingborgers run on through theirs
      phrases.push({ words, kind, pause: /[.!?…]/.test(tail) ? .24 : tail ? .07 : .04 });
    }
    return phrases;
  }

  /* ---------- timing and melody ---------- */
  // what a sound is called in the learned profile (voice_learn.mjs)
  // the classes whose lengths are learned: a vowel by its length and stress, and apart from those in the small words that are
  // squeezed (WEAK) and the phrase's last, which is drawn out. Real rhythm is uneven mostly by these two
  const durKey = s => {
    if (!s.vowel) return s.c;
    const w = typeof s.word === 'string' ? s.word : s.word && s.word.text, base = s.long ? 'long' : s.stress ? 'short' : 'weak';
    return base + (s.last ? '.end' : w && WEAK.has(w.toLowerCase()) ? '.small' : '');
  };
  const DUR = { p: .085, t: .08, k: .085, b: .065, d: .055, g: .065, f: .095, v: .055, s: .105, ɧ: .115, ɕ: .11, h: .07, m: .07, n: .06, ŋ: .08, l: .06, j: .055, ʁ: .065, χ: .075 };
  const st = n => Math.pow(2, n / 12);

  // Durations in the shape of Klatt's rules (Chimera's durations.rs), with the lengths of a language where length means
  // something. Melody: South Swedish accent 1 starts high and falls within the stressed vowel (H*L), accent 2 starts low
  // and peaks on the syllable after (L*H), and the last accent of a phrase is the big one.
  function schedule(phrases, v) {
    const segs = [], pitch = [], breaths = [], nat = v.natural === undefined ? 1 : v.natural, tune = { ...globalThis.SKANE_TUNE, ...v.tune }, P = tune.learned >= .5 ? globalThis.SKANE_PROFILE : null;
    // nobody says two words alike, but the same person saying the same line does the same: seeded by the voice and the line
    let h = (v.seed >>> 0) ^ 2166136261;
    for (const ph of phrases) for (const w of ph.words) for (const ch of w.text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    const r = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
    let t = .03;
    phrases.forEach((ph, phi) => {
      const start = t, flat = ph.words.flatMap(w => w.segs.map(s => ({ ...s, word: w })));
      const lastV = flat.map(s => !!s.vowel).lastIndexOf(true);
      const stressedWords = ph.words.filter(w => w.segs.some(s => s.stress === 1));
      const nuclear = stressedWords[stressedWords.length - 1];
      // the word that carries the phrase's focus: here mostly early, the first content words, seldom the last (where the
      // Helsingborgers' highest pitch fell in 191 podcast lines: first 35 %, between 50 %, last 15 %)
      const content = stressedWords.filter(w => !WEAK.has(w.said)), focusWord = content.length ? content[Math.round(tune.focusAt * (content.length - 1))] : nuclear;
      const startIdx = segs.length;
      const pace = 1 + (r() - .5) * .1 * nat;     // a phrase has its own tempo, and each word its own within it
      let wordNow = null, wordPace = 1, wordGain = 1, contentNo = 0;
      flat.forEach((s, i) => {
        let d;
        if (s.word !== wordNow) {
          wordNow = s.word; wordPace = 1 + (r() - .5) * .16 * nat;
          // and its own loudness (wordLoud): the Helsingborgers' words differ by 2.9 dB in a line, the synth's by 2.1. The focus
          // stands out, the content words step down as their pitch does, the small words lean back, and no two are quite alike
          if (tune.wordLoud) { const small = WEAK.has(s.word.said), db = small ? -.4 : (s.word === focusWord ? 2 : 0) - .5 * contentNo++; wordGain = Math.pow(10, tune.wordLoud * (db + 1.6 * (r() - .5) * nat) / 20); }
        }
        if (s.vowel) {
          d = s.long ? tune.longVowel : s.stress ? tune.shortVowel : .06;   // long is long: Swedish leans on it, more than Danish does
          if (i === lastV) d *= 1.35;
          else if (s.stress && i > lastV - 5 && nat) d *= 1 + .12 * nat;   // slowing down starts a syllable before the end
          if (s.word.emph) d *= 1.2;
        } else {
          d = DUR[s.c] || .07;
          // the throat r has room for its roll in front of a vowel, less at the end of a word
          if (s.c === 'ʁ') d = flat[i + 1] && flat[i + 1].vowel ? tune.rLength : tune.rLength * .75;
          const pv = flat[i - 1], nx = flat[i + 1];
          if (pv && !pv.vowel && nx && !nx.vowel) d *= .6; else if (pv && !pv.vowel || nx && !nx.vowel) d *= .8;
          // a stop at the end of a word is hardly held in running speech: the word joins (att | jag, snitt | kan) run on
          if ('ptkbdg'.includes(s.c) && (!nx || nx.word !== s.word) && i < lastV) d = Math.min(d, tune.looseStop);
          if (i > lastV) d *= 1.2;
          // the breath after a p, t or k before a stressed vowel (none after s, none on the softened ones)
          if ('ptk'.includes(s.c) && nx && nx.vowel && nx.stress && !(pv && pv.c === 's') && !(s.lenis >= .5)) s.asp = .04 * tune.aspiration * (1 - (s.lenis || 0));
          if (s.asp) d += s.asp;
        }
        if (P && P.dur) { const k = durKey({ ...s, last: i === lastV }), base = k.split('.')[0]; d *= P.dur[k] || P.dur[base] || 1; }
        d = d / v.rate * wordPace * pace;
        segs.push({ ...s, word: s.word.text, emph: s.word.emph, ...(wordGain !== 1 ? { wg: wordGain } : {}), t0: t, t1: t + d, asp: s.asp ? s.asp / v.rate : 0, last: i === lastV, ...(i >= lastV ? { fin: ph.pause } : {}), at: flat.length > 1 ? i / (flat.length - 1) : 0 });
        t += d;
      });
      // melody
      const total = Math.max(.2, t - start), range = v.range * (ph.kind === 'exclaim' ? 1.35 : 1);
      const lift = ph.kind === 'exclaim' ? 1.12 : 1;
      // each word on its own level (wordLevel, downstep): the Helsingborgers' content words step down one after the other,
      // 0.4 semitones each, and sit a couple of semitones apart, where the synth's had all been on one line and swung
      // within themselves instead (word levels' spread in a clip 1.9 st real, 1.45 synth; swing within a word 4.8 real, 5.7)
      let level = 0, ck = 0;
      // endLift: the line's late part held up, by that many semitones at its end (the Helsingborgers end level, about a semitone
      // under their middle, where declination, downstep and the learned fall took the synth three to four down)
      const up = ph.kind === 'question' ? 0 : tune.endLift || 0;
      const at = (tt, semis) => pitch.push([tt, v.f0 * lift * st(semis + level - 1.5 * (tt - start) / total * v.declination + up * ((tt - start) / total) ** 4)]);
      at(start, .4);
      let wi = startIdx;
      for (const w of ph.words) {
        const n = w.segs.length, here = segs.slice(wi, wi + n);
        wi += n;
        const k = here.findIndex(s => s.stress === 1);
        if (k < 0) continue;
        if (!WEAK.has(w.said)) { level = (tune.wordLevel ? tune.wordLevel * 1.7 * (r() - .5 + r() - .5) * nat : 0) - (tune.downstep || 0) * ck; ck++; }
        // the speaker's own shape of this kind of word, from the stressed vowel to the word's end, in this voice's range
        const shape = P && P.melody && P.melody[w.accent + (w === nuclear ? 'n' : 'p')];
        if (shape) {
          // one word of the phrase carries its focus and swings far; the others lean on it with small bumps
          const focal = (w === focusWord ? tune.focus : 1 / Math.sqrt(tune.focus)) * (w.emph ? 1.3 : 1);
          const size = v.range / P.melody.ref * focal * (ph.kind === 'exclaim' ? 1.15 : 1) * (1 + (r() - .5) * .3 * nat), end = here[n - 1].t1;
          // the line's last word hardly falls (lastSwing): the Helsingborgers end level, about a semitone under their middle, where
          // the learned shape took the synth three semitones down
          const mean = shape.reduce((a, x) => a + x, 0) / shape.length, swing = (tune.wordSwing ?? 1) * (w === ph.words[ph.words.length - 1] && ph.pause > .2 ? tune.lastSwing ?? 1 : 1);
          // accent 2 rises into its peak (a2Late): the Helsingborgers' two-syllable accent-2 words hold high over the first half and
          // peak a quarter of the way in, where the learned shape (a median, its peak smeared to the start) falls from the first moment
          const late = w.accent === 2 && n > 2 ? tune.a2Late || 0 : 0, t0 = here[k].t0 + (end - here[k].t0) * late;
          if (late) at(here[k].t0, (mean + (shape[0] - mean) * swing) * size - 2.5 * late * size);
          shape.forEach((x, i) => at(t0 + (end - t0) * i / (shape.length - 1), (mean + (x - mean) * swing) * size));
          level = 0;
          continue;
        }
        const main = here[k], big = (w === nuclear ? 1 : .6) * (w.emph ? 1.45 : 1) * range * (1 + (r() - .5) * .45 * nat);
        if (w.accent === 1) {
          at(main.t0, .6 * big);
          at(main.t0 + .75 * (main.t1 - main.t0), -.12 * big);
        } else {
          at(main.t0, -.1 * big);
          const after = here.slice(k + 1).find(s => s.vowel);
          if (after) { at(after.t0 + tune.accentPeak * (after.t1 - after.t0), .7 * big); at(after.t1, .05 * big); } else at(main.t1, .6 * big);
        }
        level = 0;
      }
      if (P && P.melody && P.melody.end && P.melody.end[ph.kind] !== undefined) at(t, P.melody.end[ph.kind] * v.range / P.melody.ref);
      else if (ph.kind === 'question') at(t, .55 * v.range + 1.5);
      else at(t, (-.65 * range - .5) * (1 - tune.finalRise));   // Skåne's melody is told to be like Bergen's, not to fall away at the end the Stockholm way
      if (ph.kind !== 'question' && ph.pause > .2) pitch.push([t + .001, v.f0 * st(-1.5)]);
      t += ph.pause / v.rate * (1 + (r() - .5) * .5 * nat);
      // a breath before going on, after a long stretch or now and then: out loud, as people do
      if (phi < phrases.length - 1 && ph.pause > .2 && nat > .2 && (t - start > 1.1 || r() < .3)) { const b = .2 + r() * .12; breaths.push([t - .06, t - .06 + b]); t += b; }
    });
    return { segs, pitch, breaths, dur: t + .06 };
  }

  globalThis.SkaneText = { durKey, analyse, schedule, rules, compound, parse, accentOf, clean, SKANSKA };
})();
