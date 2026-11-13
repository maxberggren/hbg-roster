'use strict';
// How people here say things: the file to edit when a word sounds wrong. Three tables, looked at in this order:
//   WORDS   a dialect word instead of the written one. Off unless a voice has oldWords: the bubble would say something else.
//   SPOKEN  how a written word is said by anyone broad enough (voice dialect .5 and up). Same word, worn down.
//   PRON    the pronunciation itself, before the lexicon is asked. Stress goes in front of its syllable: " main, % secondary.
//           a a, A: long a, E ä, E: long ä, e: long e, I i, i: long i, O å, o: long å, U o, u: long o, u0 u, }: long u,
//           Y y, y: long y, 9 ö, 2: long ö, N ng, S sj, s' tj, r the throat r.
// Nothing here is known to be Helsingborg's alone: no source on that was found (README.md). The place names are said as
// they are thought to be said, unchecked, so correct them freely.
globalThis.SKANE_PATCHES = {
  WORDS: {
    pojke: 'påg', pojken: 'pågen', pojkar: 'pågar', flicka: 'tös', flickan: 'tösen', hund: 'hong', hunden: 'hongen', ficka: 'lomma', fickan: 'lomman', tråkig: 'tradig', tråkigt: 'tradigt',
    vatten: 'vann', vattnet: 'vannet', strumpor: 'hossor', potatis: 'pantoffla', åka: 'aga', vänta: 'bia', kasta: 'hutta', smuts: 'mög', skit: 'mög', tupp: 'tocke', orkar: 'giter', trevlig: 'lyn',
    idiot: 'fubbick', huvudvärk: 'skallebank', skolka: 'skubba', trasa: 'lase', krokben: 'fälleben', fult: 'räligt', äckligt: 'räligt', skottkärra: 'rullebör',
  },
  SPOKEN: {
    inte: 'ente', jag: 'ja', och: 'å', är: 'e', mig: 'mej', dig: 'dej', sig: 'sej', de: 'dom', dem: 'dom', vad: 'va', till: 'te', med: 'me', sedan: 'sen', säga: 'säja', säger: 'säjer',
    något: 'nåt', någon: 'nån', några: 'nåra', någonting: 'nåt', någonsin: 'nånsin', någonstans: 'nånstans', sådan: 'sån', sådant: 'sånt', sådana: 'såna',
    mycket: 'mycke', aldrig: 'aldri', alltid: 'allti', också: 'åxå', altså: 'asså', imorgon: 'imorrn', huvud: 'huvve', huvudet: 'huvvet', tillbaka: 'tebaks', kommer: 'kommer',
    // two words said as one, the way hörru and fattaru are
    'hör du': 'hörru', 'har du': 'harru', 'vet du': 'vettu', 'ser du': 'serru', 'fattar du': 'fattaru',
  },
  PRON: {
    // dialect spellings and the small words
    e: '"E:', ja: '"j A:', jag: '"j A:', dej: '"d a j', mej: '"m a j', sej: '"s a j', daj: '"d a j', dom: '"d O m', å: '"O', te: '"t e:', va: '"v A:', de: '"d e:', det: '"d e:', me: '"m e:', som: '"s O m',
    bra: '"b r A:', där: '"d E: r', nån: '"n o: n', nåt: '"n o: t', nåra: '"n o: r a', nånsin: '"n o: n %s I n', nånstans: '"n o: n %s t a n s', sen: '"s E n', sån: '"s O n', sånt: '"s O n t', såna: '"s O n a',
    mycke: '"m Y k e', aldri: '"a l d r I', allti: '"a l t I', åxå: '"O k s O', altså: '"a l t s O', asså: '"a s O', aså: '"a s O', säja: '"s E j a', säjer: '"s E j e r', lite: '"l i: t e', allt: '"a l t', ållt: '"O l t', mest: '"m E s t',
    hörru: '"h 9 r u0', harru: '"h a r u0', vettu: '"v E t u0', serru: '"s e: r u0', fattaru: '"f a t a r u0', såhär: '"s o: h E: r', typ: '"t y: p', sch: '"S', hick: '"h I k', hah: '"h a', hm: '"h m', mm: '"m m', ehm: '"E h m',
    // what the lexicon has as an abbreviation: to it vi is the number six (VI), oss is O-S-S, jo is JO and l is fifty
    vi: '"v i:', oss: '"O s', jo: '"j u:', ko: '"k u:', lo: '"l u:', so: '"s u:', ud: '"}: d', et: '"E t', fra: '"f r A:', re: '"r e:', l: '"E l', v: '"v e:', m: '"E m', c: '"s e:', hans: '"h a n s',
    // Skåne's own words, and from the word table of Swedish Wikipedia's Skånska
    påg: '"p o: g', pågen: '"p o: g e n', pågar: '"p o: g a r', pågarna: '"p o: g a n a', tös: '"t 2: s', tösen: '"t 2: s e n', tösa: '"t 2: s a', tösabid: '"t 2: s a %b i: d', pågatös: '"p o: g a %t 2: s', daur: '"d a U r', mög: '"m 2: g', möghong: '"m 2: g %h O N', mögtocke: '"m 2: g %t O k e',
    sicken: '"s I k e n', sicket: '"s I k e t', sicka: '"s I k a', ente: '"e n t e', hållor: '"h O l u r', ble: '"b l e:', pissa: '"p I s a', pissar: '"p I s a r', pissade: '"p I s a d e', pissat: '"p I s a t', pissnödig: '"p I s %n 2: d I g', int: '"I n t', fyrti: '"f 9 r t I', morrn: '"m O r n', imorrn: 'I "m O r n', vafan: '"v A: f a n', vaffan: '"v a f a n', bärs: '"b E r s', tebaks: 't e "b a k s', hallau: 'h a "l a U', spöt: '"s p 2: t',
    huvve: '"h u0 v e', huvvet: '"h u0 v e t', tusan: '"t }: s a n', jösses: '"j 9 s e s', dejt: '"d E j t', dejten: '"d E j t e n', dejter: '"d E j t e r', volvo: '"v O l v U',
    hong: '"h O N', hongen: '"h O N e n', lomma: '"l O m a', lomman: '"l O m a n', tradig: '"t r A: d I', tradigt: '"t r A: d I t', vann: '"v a n', vannet: '"v a n e t', hossor: '"h O s U r', pantoffla: 'p a n "t O f l a', aga: '"A: g a', bia: '"b i: a', hutta: '"h u0 t a',
    tocke: '"t O k e', giter: '"j i: t e r', lyn: '"l y: n', fubbick: '"f u0 b I k', fjåne: '"f j o: n e', ålarens: '"o: l a r e n s', skallebank: '"s k a l e %b a N k', skubba: '"s k u0 b a', lase: '"l A: s e', fälleben: '"f E l e %b e: n', räligt: '"r E: l I t', rullebör: '"r u0 l e %b 9 r',
    abbedonk: '"a b e %d O N k', bagetter: 'b a "g E t e r', ännaklämd: '"E n a %k l E m d', hialös: '"h i: a %l 2: s', schatte: '"S a t e', kasebana: '"k A: s e %b A: n a',
    // the town and round about
    tivoli: '"t i: v U l I', toast: '"t o: s t', dj: '"d i: "j E:', ållihop: '"O l I %h u: p',
    helsingborg: '"h E l s I N %b O r j', helsingborgs: '"h E l s I N %b O r j s', helsingborgare: '"h E l s I N %b O r j a r e', hif: '"h o: "i: "E f', kärnan: '"s\' E: r n a n', helsingör: 'h E l s I N "2: r', skåne: '"s k o: n e', skånska: '"s k o: n s k a', skånsk: '"s k o: n s k', öresund: '"2: r e %s u0 n d',
    pålsjö: '"p o: l %S 2:', väla: '"v E: l a', långeberga: '"l O N e %b E r j a', elineberg: '"e: l i: n e %b E r j', kullagatans: '"k u0 l a %g A: t a n s', kullaberg: '"k u0 l a %b E r j', kullen: '"k u0 l e n', ramlösan: '"r a m %l 2: s a n',
    mariastaden: 'm a "r i: a %s t A: d e n', drottninghög: '"d r O t n I N %h 2: g', dalhem: '"d A: l %h E m', tågaborg: '"t o: g a %b O r j', ringstorp: '"r I N s %t O r p', fredriksdal: '"f r e: d r I k s %d A: l', berga: '"b E r j a', eneborg: '"e: n e %b O r j', husensjö: '"h }: s e n %S 2:',
    laröd: '"l A: %r 2: d', hittarp: '"h I %t a r p', domsten: '"d u: m %s t e: n', viken: '"v i: k e n', bjuv: '"b j }: v', åstorp: '"o: %s t O r p', vikingsberg: '"v i: k I N s %b E r j', slottshagen: '"s l O t s %h A: g e n', parapeten: 'p a r a "p e: t e n', terrass: 't E "r a s', terrasstrapporna: 't E "r a s %t r a p U r n a',
  },
};
