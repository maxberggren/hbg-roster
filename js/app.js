'use strict';
// Röstkartan: fyrtio röster utlagda som byar (modell/roster.json: namn, kön, x, y). Var nålen står bestämmer blandningen:
// varje röst väger exp(-d²/2σ²) efter avståndet till nålen, de sex tyngsta normeras till 1 och blir modellens mix-vikter.
// Terrängen är samma fält: höjden är summan av alla rösters vikter, färgen den viktade blandningen av deras färger.
(() => {
  const $ = id => document.getElementById(id);
  const base = new URL('.', location.href).href;
  const map = $('map'), terrain = $('terrain'), overlay = $('overlay'), tctx = terrain.getContext('2d'), octx = overlay.getContext('2d');
  let voices = [], ready = false, W = 0, H = 0, dpr = 1, S = 1;   // S: kartans skala (det kortaste av bredd och höjd)
  let pin = { x: .5, y: .5 }, sigma = .07, hover = -1, dragging = false, lastPcm = null;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- färger: kvinnorösterna i varma toner, mansrösterna i kalla, olika efter höjd på kartan ---------- */
  const dark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  function hsl(h, s, l) {
    s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }
  function colorOf(v) {
    const t = v.y;   // 0 överst
    return v.sex === 'f' ? hsl(352 + 48 * t, 62, dark() ? 60 : 52) : hsl(168 + 52 * t, 48, dark() ? 56 : 42);
  }
  const css = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

  /* ---------- blandningen ---------- */
  function weights(p, sg = sigma) {
    const w = voices.map(v => { const dx = (v.x - p.x) * W / S, dy = (v.y - p.y) * H / S; return Math.exp(-(dx * dx + dy * dy) / (2 * sg * sg)); });
    const top = w.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, 6), sum = top.reduce((s, [x]) => s + x, 0) || 1;
    const out = new Array(voices.length).fill(0);
    for (const [x, i] of top) out[i] = x / sum;
    return out;
  }

  /* ---------- terrängen: ritas om bara när storleken, temat eller räckvidden ändras ---------- */
  function drawTerrain() {
    const step = 3, gw = Math.ceil(W / step) + 1, gh = Math.ceil(H / step) + 1;
    const field = new Float32Array(gw * gh), img = tctx.createImageData(gw, gh), paper = dark() ? [21, 24, 29] : [243, 237, 224];
    const cols = voices.map(colorOf), sg = sigma, inv = 1 / (2 * sg * sg);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const px = i * step / W, py = j * step / H;
      let sum = 0, r = 0, g = 0, b = 0;
      for (let k = 0; k < voices.length; k++) {
        const dx = (voices[k].x - px) * W / S, dy = (voices[k].y - py) * H / S, w = Math.exp(-(dx * dx + dy * dy) * inv);
        sum += w; r += w * cols[k][0]; g += w * cols[k][1]; b += w * cols[k][2];
      }
      field[j * gw + i] = sum;
      const tint = (1 - Math.exp(-sum * 1.6)) * (dark() ? .55 : .42), o = (j * gw + i) * 4;
      // en svag papperstextur så att kartan inte blir plastig
      const grain = ((Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1) * 5;
      img.data[o] = paper[0] + (r / (sum || 1) - paper[0]) * tint + grain;
      img.data[o + 1] = paper[1] + (g / (sum || 1) - paper[1]) * tint + grain;
      img.data[o + 2] = paper[2] + (b / (sum || 1) - paper[2]) * tint + grain;
      img.data[o + 3] = 255;
    }
    // den lilla bilden skalas upp mjukt till kartans storlek
    const small = document.createElement('canvas'); small.width = gw; small.height = gh; small.getContext('2d').putImageData(img, 0, 0);
    tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, terrain.width, terrain.height);
    tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(small, 0, 0, gw, gh, 0, 0, gw * step * dpr, gh * step * dpr);
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // höjdkurvor (marching squares), var femte lite kraftigare
    const levels = [];
    for (let k = 1; k <= 14; k++) levels.push(.08 * Math.pow(1.32, k));
    levels.forEach((lv, li) => {
      tctx.beginPath();
      for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
        const a = field[j * gw + i], b = field[j * gw + i + 1], c = field[(j + 1) * gw + i + 1], d = field[(j + 1) * gw + i];
        const idx = (a > lv) | (b > lv) << 1 | (c > lv) << 2 | (d > lv) << 3;
        if (idx === 0 || idx === 15) continue;
        const x = i * step, y = j * step, lerp = (p, q) => (lv - p) / (q - p) * step;
        const top = [x + lerp(a, b), y], right = [x + step, y + lerp(b, c)], bottom = [x + lerp(d, c), y + step], left = [x, y + lerp(a, d)];
        const seg = (p, q) => { tctx.moveTo(p[0], p[1]); tctx.lineTo(q[0], q[1]); };
        switch (idx) {
          case 1: case 14: seg(left, top); break;
          case 2: case 13: seg(top, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(right, bottom); break;
          case 5: seg(left, top); seg(right, bottom); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(left, bottom); break;
          case 10: seg(top, right); seg(left, bottom); break;
        }
      }
      const strong = li % 5 === 4;
      tctx.strokeStyle = dark() ? `rgba(236,229,214,${strong ? .22 : .1})` : `rgba(70,50,30,${strong ? .26 : .12})`;
      tctx.lineWidth = strong ? 1.1 : .7; tctx.stroke();
    });
    // rutnät och kompass, som på en gammal karta
    tctx.strokeStyle = dark() ? 'rgba(236,229,214,.05)' : 'rgba(70,50,30,.06)'; tctx.lineWidth = 1; tctx.beginPath();
    for (let k = 1; k < 10; k++) { tctx.moveTo(k * W / 10, 0); tctx.lineTo(k * W / 10, H); tctx.moveTo(0, k * H / 10); tctx.lineTo(W, k * H / 10); }
    tctx.stroke();
    compass(W - 40, 44, 20);
    tctx.font = `italic 13px Fraunces, Georgia, serif`; tctx.fillStyle = dark() ? 'rgba(236,229,214,.45)' : 'rgba(70,50,30,.5)';
    tctx.textAlign = 'left'; tctx.fillText('← ljusare röster', 14, H - 16);
    tctx.textAlign = 'right'; tctx.fillText('mörkare röster →', W - 86, H - 16);
  }
  function compass(x, y, r) {
    const ink = dark() ? 'rgba(236,229,214,.5)' : 'rgba(70,50,30,.55)';
    tctx.save(); tctx.translate(x, y); tctx.strokeStyle = ink; tctx.fillStyle = ink; tctx.lineWidth = 1;
    tctx.beginPath(); tctx.arc(0, 0, r, 0, Math.PI * 2); tctx.stroke();
    for (let k = 0; k < 4; k++) {
      tctx.rotate(Math.PI / 2); tctx.beginPath(); tctx.moveTo(0, -r + 3); tctx.lineTo(4, 0); tctx.lineTo(-4, 0); tctx.closePath();
      k === 3 ? tctx.fill() : tctx.stroke();
    }
    tctx.font = '600 11px "IBM Plex Sans", sans-serif'; tctx.textAlign = 'center'; tctx.fillText('N', 0, -r - 5);
    tctx.restore();
  }

  /* ---------- det som rör sig: byarna, nålen, trådarna till rösterna och ljudringarna ---------- */
  const rings = [];
  let level = 0;
  function drawOverlay() {
    octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);
    if (!voices.length) return;
    const w = weights(pin), px = pin.x * W, py = pin.y * H, ink = dark() ? '#ece5d6' : '#2a2520';
    // trådar från nålen till de röster som hörs, tjockare ju mer de väger
    w.forEach((x, i) => {
      if (x < .03) return;
      const v = voices[i]; octx.strokeStyle = css(colorOf(v)); octx.globalAlpha = .25 + .6 * x; octx.lineWidth = 1 + 5 * x;
      octx.setLineDash(x > .3 ? [] : [3, 4]); octx.beginPath(); octx.moveTo(px, py); octx.lineTo(v.x * W, v.y * H); octx.stroke();
    });
    octx.setLineDash([]); octx.globalAlpha = 1;
    // ljudringar medan rösten talar
    for (let k = rings.length - 1; k >= 0; k--) {
      const r = rings[k]; r.t += 1 / 60; if (r.t > 1.6) { rings.splice(k, 1); continue; }
      octx.strokeStyle = dark() ? '#f0bd3a' : '#b8202f'; octx.globalAlpha = Math.max(0, (1 - r.t / 1.6)) * .55 * r.a; octx.lineWidth = 2;
      octx.beginPath(); octx.arc(r.x, r.y, 10 + r.t * 70, 0, Math.PI * 2); octx.stroke();
    }
    octx.globalAlpha = 1;
    // byarna: prickarna först, sedan namnen där de får plats (de som hörs och den under muspekaren väljer först)
    octx.textBaseline = 'middle';
    voices.forEach((v, i) => {
      const x = v.x * W, y = v.y * H, on = w[i], c = css(colorOf(v)), big = i === hover || on > .25;
      octx.fillStyle = c; octx.strokeStyle = dark() ? '#15181d' : '#faf6ee'; octx.lineWidth = 2;
      octx.beginPath(); octx.arc(x, y, big ? 6 : 4.5, 0, Math.PI * 2); octx.fill(); octx.stroke();
      if (on > .05) { octx.strokeStyle = c; octx.lineWidth = 1.5; octx.beginPath(); octx.arc(x, y, 9 + 6 * on, 0, Math.PI * 2); octx.stroke(); }
    });
    const placed = [[W - 72, 8, W - 8, 72]], dots = voices.map(v => [v.x * W - 7, v.y * H - 7, v.x * W + 7, v.y * H + 7]);
    const hit = (b, list) => list.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const order = voices.map((v, i) => i).sort((a, b) => (b === hover) - (a === hover) || w[b] - w[a]);
    for (const i of order) {
      const v = voices[i], x = v.x * W, y = v.y * H, big = i === hover || w[i] > .25;
      octx.font = `${big ? '600 ' : 'italic '}${big ? 14 : 13}px Fraunces, Georgia, serif`;
      const tw = octx.measureText(v.name).width, th = 15;
      // höger, vänster, ovanför, under och snett: den första lediga platsen
      const spots = [[x + 10, y - th / 2], [x - 10 - tw, y - th / 2], [x - tw / 2, y - 9 - th], [x - tw / 2, y + 9], [x + 7, y - 6 - th], [x + 7, y + 6], [x - 7 - tw, y - 6 - th], [x - 7 - tw, y + 6]];
      const others = dots.filter((_, k) => k !== i);
      let at = spots.find(([sx, sy]) => { const b = [sx - 2, sy, sx + tw + 2, sy + th]; return sx > 4 && sx + tw < W - 4 && sy > 4 && sy + th < H - 4 && !hit(b, placed) && !hit(b, others); });
      if (!at) { if (!big) continue; at = spots[x < W - 90 ? 0 : 1]; }
      placed.push([at[0] - 2, at[1], at[0] + tw + 2, at[1] + th]);
      octx.textAlign = 'left'; const tx = at[0], ty = at[1] + th / 2;
      octx.lineWidth = 3.5; octx.strokeStyle = dark() ? 'rgba(21,24,29,.85)' : 'rgba(250,246,238,.85)'; octx.strokeText(v.name, tx, ty);
      octx.fillStyle = ink; octx.globalAlpha = big ? 1 : .78; octx.fillText(v.name, tx, ty); octx.globalAlpha = 1;
    }
    // nålen
    const bob = dragging ? -4 : 0, s = 1 + level * .5;
    octx.save(); octx.translate(px, py);
    octx.fillStyle = 'rgba(0,0,0,.18)'; octx.beginPath(); octx.ellipse(0, 2, 9, 3.5, 0, 0, Math.PI * 2); octx.fill();
    octx.translate(0, bob);
    octx.fillStyle = dark() ? '#e0485a' : '#b8202f';
    octx.beginPath(); octx.moveTo(0, 0); octx.bezierCurveTo(-11 * s, -14 * s, -10 * s, -30 * s, 0, -30 * s); octx.bezierCurveTo(10 * s, -30 * s, 11 * s, -14 * s, 0, 0); octx.fill();
    octx.fillStyle = dark() ? '#f0bd3a' : '#e8ad13'; octx.beginPath(); octx.arc(0, -19 * s, 4.5 * s, 0, Math.PI * 2); octx.fill();
    octx.restore();
  }
  function loop() {
    if (analyser) {
      const buf = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(buf);
      let e = 0; for (const x of buf) e += x * x; const rms = Math.sqrt(e / buf.length);
      level += (Math.min(1, rms * 4) - level) * .3;
      if (speaking && !reduceMotion && Math.random() < level * .5) rings.push({ x: pin.x * W, y: pin.y * H - 19, t: 0, a: Math.min(1, level * 2) });
    }
    drawOverlay(); requestAnimationFrame(loop);
  }

  /* ---------- storlek ---------- */
  function resize() {
    const r = map.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; S = Math.min(W, H);
    for (const c of [terrain, overlay]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    if (voices.length) drawTerrain();
  }

  /* ---------- panelen: vem som hörs ---------- */
  function showMix() {
    const w = weights(pin), order = w.map((x, i) => [x, i]).filter(([x]) => x > .02).sort((a, b) => b[0] - a[0]);
    const top = order[0];
    $('who').innerHTML = !top ? '–' : top[0] > .85 ? esc(voices[top[1]].name)
      : `${esc(voices[top[1]].name)} <em>med inslag av ${order.slice(1, 3).map(([, i]) => esc(voices[i].name)).join(' och ')}</em>`;
    $('mix').innerHTML = order.slice(0, 5).map(([x, i]) => `<li><span class="nm">${esc(voices[i].name)}</span><span class="track"><i style="width:${(x * 100).toFixed(1)}%;background:${css(colorOf(voices[i]))}"></i></span><span class="pc">${Math.round(x * 100)} %</span></li>`).join('');
    try { history.replaceState(null, '', `#x=${pin.x.toFixed(3)}&y=${pin.y.toFixed(3)}`); } catch { }
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- talet ---------- */
  const worker = new Worker('js/worker.js');
  let nextId = 1, ac = null, analyser = null, speaking = null, busy = false;
  const waiting = new Map(), cache = new Map();
  worker.onmessage = ({ data: m }) => {
    if (m.progress !== undefined) { $('loadBar').style.width = (m.progress * 100).toFixed(1) + '%'; return; }
    if (m.ready) {
      ready = true; $('loading').classList.add('done'); $('play').disabled = false;
      $('status').textContent = 'Klart. Dra nålen eller tryck på Läs upp.'; return;
    }
    if (m.error && m.id === undefined) { $('loadText').textContent = 'Rösterna kunde inte laddas.'; $('loadSmall').textContent = m.error; return; }
    const w = waiting.get(m.id); if (!w) return; waiting.delete(m.id);
    m.error ? w.reject(new Error(m.error)) : w.resolve(m);
  };
  function synth(text, mix) {
    const length = +$('tempo').value, noisew = +$('life').value;
    const key = text + '|' + mix.map(x => x.toFixed(3)).join(',') + '|' + length + '|' + noisew;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    const id = nextId++;
    return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); worker.postMessage({ id, text, mix, length, noisew }); })
      .then(m => { cache.set(key, m); if (cache.size > 40) cache.delete(cache.keys().next().value); return m; });
  }
  function audio() {
    if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); analyser = ac.createAnalyser(); analyser.fftSize = 1024; analyser.connect(ac.destination); }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function play(m) {
    const a = audio(); if (speaking) try { speaking.stop(); } catch { }
    const buf = a.createBuffer(1, m.pcm.length, m.sr); buf.copyToChannel(m.pcm, 0);
    const src = a.createBufferSource(); src.buffer = buf; src.connect(analyser); src.start();
    speaking = src; src.onended = () => { if (speaking === src) speaking = null; };
  }
  async function say(text = $('text').value.trim(), quiet = false) {
    if (!ready || !text) return;
    audio(); busy = true; if (!quiet) $('status').textContent = 'Rösten tar sats …';
    const t = performance.now();
    try {
      const m = await synth(text.slice(0, 600), weights(pin));
      play(m);
      if (!quiet) { lastPcm = m; $('save').disabled = false; $('status').textContent = `${(m.pcm.length / m.sr).toFixed(1).replace('.', ',')} s tal, gjort på ${Math.round(performance.now() - t)} ms`; }
    } catch (e) { $('status').textContent = 'Det gick inte: ' + e.message; }
    busy = false;
  }
  // en kort försmak medan nålen dras: bara när rösten inte redan arbetar, och högst ett par gånger i sekunden
  let lastPreview = 0;
  function preview() {
    if (!ready || !$('preview').checked || busy || performance.now() - lastPreview < 550) return;
    lastPreview = performance.now(); say('Hörru!', true);
  }

  /* ---------- nålen ---------- */
  const at = e => { const r = map.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  function nearVoice(p) {
    let best = -1, bd = 1e9;
    voices.forEach((v, i) => { const d = Math.hypot((v.x - p.x) * W, (v.y - p.y) * H); if (d < bd) { bd = d; best = i; } });
    return bd < 14 ? best : -1;
  }
  map.addEventListener('pointerdown', e => {
    if (!voices.length) return;
    audio(); map.focus(); dragging = true; map.setPointerCapture(e.pointerId);
    const p = at(e), v = nearVoice(p);
    pin = v >= 0 ? { x: voices[v].x, y: voices[v].y } : p; showMix(); preview();
  });
  map.addEventListener('pointermove', e => {
    const p = at(e);
    if (dragging) { pin = p; showMix(); preview(); }
    else { hover = nearVoice(p); map.style.cursor = hover >= 0 ? 'pointer' : 'crosshair'; }
  });
  const release = () => { if (!dragging) return; dragging = false; say(); };
  map.addEventListener('pointerup', release); map.addEventListener('pointercancel', release);
  map.addEventListener('keydown', e => {
    const d = e.shiftKey ? .05 : .015, k = e.key;
    const moves = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
    if (moves[k]) { e.preventDefault(); pin = { x: Math.min(1, Math.max(0, pin.x + moves[k][0])), y: Math.min(1, Math.max(0, pin.y + moves[k][1])) }; showMix(); clearTimeout(map.t); map.t = setTimeout(() => say(), 350); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); say(); }
    else if (k === 's' || k === 'S') { randomSpot(); }
  });
  function randomSpot() {
    // någonstans mellan två eller tre byar, inte mitt i en
    const a = voices[Math.random() * voices.length | 0], b = voices[Math.random() * voices.length | 0], t = .25 + Math.random() * .5;
    pin = { x: a.x + (b.x - a.x) * t + (Math.random() - .5) * .05, y: a.y + (b.y - a.y) * t + (Math.random() - .5) * .05 };
    showMix(); say();
  }

  /* ---------- reglage och knappar ---------- */
  const num = x => (+x).toFixed(2).replace('.', ',');
  $('tempo').oninput = () => { $('tempoV').textContent = num($('tempo').value); };
  $('life').oninput = () => { $('lifeV').textContent = num($('life').value); };
  $('spread').oninput = () => { sigma = +$('spread').value; $('spreadV').textContent = num(sigma); showMix(); clearTimeout(drawTerrain.t); drawTerrain.t = setTimeout(drawTerrain, 60); };
  $('play').onclick = () => say();
  $('random').onclick = () => { audio(); randomSpot(); };
  $('save').onclick = () => {
    if (!lastPcm) return;
    const pcm = lastPcm.pcm, sr = lastPcm.sr, b = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(b), s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    pcm.forEach((x, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32767, true));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
    a.download = `skansk-rost-${pin.x.toFixed(2)}-${pin.y.toFixed(2)}.wav`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const SENTENCES = [
    'Hörru, ska vi ta färjan över till Helsingör i morgon?',
    'Jag är född och uppvuxen på Söder, alldeles nära hamnen.',
    'Det blir nog regn i eftermiddag, så ta med dig en jacka.',
    'Kärnan syns ända ut på Sundet när solen går ner.',
    'Vill du ha en kopp kaffe och en bit kaka?',
    'Nu får du allt ta det lite lugnt, påg.',
  ];
  $('chips').innerHTML = SENTENCES.map((s, i) => `<button class="chip" data-i="${i}">${esc(s.split(' ').slice(0, 3).join(' '))} …</button>`).join('');
  $('chips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; $('text').value = SENTENCES[b.dataset.i]; say(); };
  $('text').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); say(); } });
  const themeIcon = () => { $('theme').textContent = dark() ? '☀' : '☾'; };
  $('theme').onclick = () => {
    const now = dark(); document.documentElement.dataset.theme = now ? 'light' : 'dark'; themeIcon();
    try { localStorage.setItem('roster-tema', document.documentElement.dataset.theme); } catch { }
    drawTerrain();
  };
  try { const t = localStorage.getItem('roster-tema'); if (t) document.documentElement.dataset.theme = t; } catch { }
  themeIcon();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => voices.length && drawTerrain());

  /* ---------- start ---------- */
  fetch('modell/roster.json').then(r => r.json()).then(meta => {
    voices = meta.voices;
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.has('x') && h.has('y')) pin = { x: +h.get('x'), y: +h.get('y') };
    else { const a = voices[0], b = voices[1]; pin = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    resize(); showMix(); requestAnimationFrame(loop);
  });
  worker.postMessage({ load: base });
  new ResizeObserver(() => resize()).observe(map);
})();
