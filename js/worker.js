'use strict';
// Talmodellen i en egen tråd: text -> uttal (frontend.js, lexicon.js, patches.js, neural-phones.js) -> fonem-id ->
// Piper/VITS-modellen (onnxruntime-web, wasm) -> ljudsampel. Ingenting lämnar datorn.
//   in:  { load: base }                         hämta runtime och modell (base = sidans adress)
//        { id, text, mix: [40 vikter], length, noisew }
//   ut:  { progress: 0..1 } medan modellen hämtas, { ready, meta } när den är laddad, { error } om den inte kan laddas
//        { id, pcm: Float32Array, sr, ms } | { id, error }
importScripts('lexicon.js', 'patches.js', 'frontend.js', 'neural-phones.js');
let session = null, meta = null, loading = null;

async function fetchWithProgress(url, report) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const total = +r.headers.get('content-length') || 0, reader = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    if (total) report(got / total);
  }
  const out = new Uint8Array(got); let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

function load(base) {
  return loading || (loading = (async () => {
    const t = performance.now();
    importScripts(base + 'ort/ort.wasm.min.js');
    ort.env.wasm.wasmPaths = base + 'ort/';
    ort.env.wasm.numThreads = 1;   // trådar kräver en korsursprungsisolerad sida; en räcker gott
    meta = await (await fetch(base + 'modell/roster.json')).json();
    const bytes = await fetchWithProgress(base + 'modell/roster.onnx', p => postMessage({ progress: p }));
    session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    postMessage({ ready: true, meta: { voices: meta.voices, sr: meta.audio.sample_rate }, ms: performance.now() - t });
  })().catch(err => { postMessage({ error: String(err && err.message || err) }); throw err; }));
}

let queue = Promise.resolve();
onmessage = e => {
  const m = e.data;
  if (m.load) { load(m.load).catch(() => {}); return; }
  // en replik i taget: modellen är inte gjord för att köra två samtidigt
  queue = queue.then(async () => {
    try {
      await loading;
      const t = performance.now();
      const p = SkaneNeural.phones(m.text, { spoken: true, diph: !!meta.diph });
      const n = meta.num_speakers, w = new Float32Array(n);
      (m.mix || []).forEach((x, i) => { if (i < n) w[i] = x; });
      if (!w.some(x => x)) w[0] = 1;
      const feeds = {
        input: new ort.Tensor('int64', BigInt64Array.from(p.ids, BigInt), [1, p.ids.length]),
        input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(p.ids.length)]), [1]),
        // lite brus i själva ljudet: vid Pipers vanliga .667 mumlar rösterna
        scales: new ort.Tensor('float32', Float32Array.from([.2, m.length ?? 1, m.noisew ?? .8]), [3]),
        mix: new ort.Tensor('float32', w, [1, n]),
      };
      const out = (await session.run(feeds)).output, pcm = new Float32Array(out.data);
      let peak = 1e-6; for (const x of pcm) peak = Math.max(peak, Math.abs(x));
      for (let i = 0; i < pcm.length; i++) pcm[i] *= .9 / peak;
      postMessage({ id: m.id, pcm, sr: meta.audio.sample_rate, ms: performance.now() - t }, [pcm.buffer]);
    } catch (err) { postMessage({ id: m.id, error: String(err && err.message || err) }); }
  });
};
