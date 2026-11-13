'use strict';
// Röstkartan: fyrtio röster utlagda som byar (modell/roster.json: namn, kön, x, y). Var nålen står bestämmer blandningen:
// varje röst väger exp(-d²/2σ²) efter avståndet till nålen, de sex tyngsta normeras till 1 och blir modellens mix-vikter.
// Terrängen är samma fält: höjden är summan av alla rösters vikter, färgen den viktade blandningen av deras färger.
(() => {
  const $ = id => document.getElementById(id);
  const base = new URL('.', location.href).href;
  const map = $('map'), terrain = $('terrain'), overlay = $('overlay'), tctx = terrain.getContext('2d'), octx = overlay.getContext('2d');
  let voices = [], ready = false, W = 0, H = 0, dpr = 1, S = 1;   // S: kartans skala (det kortaste av bredd och höjd)
  let moved = false, pin = { x: .5, y: .5 }, sigma = .06, dragging = false, lastPcm = null;
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
    return v.sex === 'f' ? hsl(352 + 48 * t, dark() ? 68 : 62, dark() ? 58 : 52) : hsl(168 + 52 * t, dark() ? 56 : 48, dark() ? 52 : 42);
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
    const cols = voices.map(colorOf), fem = voices.map(v => v.sex === 'f' ? 1 : 0), gold = dark() ? hsl(42, 76, 54) : hsl(40, 78, 52), sg = sigma, inv = 1 / (2 * sg * sg), cinv = 1 / (2 * .11 * .11);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const px = i * step / W, py = j * step / H;
      // höjden (kurvorna) följer rösternas räckvidd; färgen är blandningen själv, lika stark ända in i dalarna mellan
      // byarna, och bleknar först där inga röster finns
      let sum = 0, cs = 0, f = 0, r = 0, g = 0, b = 0;
      for (let k = 0; k < voices.length; k++) {
        const dx = (voices[k].x - px) * W / S, dy = (voices[k].y - py) * H / S, d2 = dx * dx + dy * dy, w = Math.exp(-d2 * cinv);
        sum += Math.exp(-d2 * inv); cs += w; f += w * fem[k]; r += w * cols[k][0]; g += w * cols[k][1]; b += w * cols[k][2];
      }
      field[j * gw + i] = sum; r /= cs || 1; g /= cs || 1; b /= cs || 1; f /= cs || 1;
      // där kvinno- och mansrösterna möts blir det inte grått utan guld: mellanrummet får en egen färg
      const between = Math.pow(4 * f * (1 - f), 1.5);
      r += (gold[0] - r) * between; g += (gold[1] - g) * between; b += (gold[2] - b) * between;
      const tint = (dark() ? .25 + .75 * Math.min(1, cs * 1.6) : Math.min(1, cs * 1.4)) * (dark() ? .55 : .4), o = (j * gw + i) * 4;
      // en svag papperstextur så att kartan inte blir plastig
      const grain = ((Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1) * 5;
      img.data[o] = paper[0] + (r - paper[0]) * tint + grain;
      img.data[o + 1] = paper[1] + (g - paper[1]) * tint + grain;
      img.data[o + 2] = paper[2] + (b - paper[2]) * tint + grain;
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
    // färgnyckeln längs kartans nederkant: kvinnoröster till vänster, mansröster till höger
    const keyCol = v => css(v ? colorOf(v) : dark() ? hsl(42, 76, 54) : hsl(40, 78, 52));
    tctx.font = `italic ${W < 420 ? 11 : 12.5}px Fraunces, Georgia, serif`; tctx.textBaseline = 'middle';
    const key = [['kvinnoröster', voices.find(v => v.sex === 'f'), 'left'], ['mansröster', voices.find(v => v.sex === 'm'), 'right']];
    legendBox = [];
    key.forEach(([t, v, side]) => {
      const tw = tctx.measureText(t).width, y = H - 17, x0 = side === 'left' ? 14 : side === 'right' ? W - 14 - tw - 12 : W / 2 - (tw + 12) / 2;
      tctx.fillStyle = keyCol(v); tctx.beginPath(); tctx.arc(x0 + 4, y, 4, 0, Math.PI * 2); tctx.fill();
      tctx.fillStyle = dark() ? 'rgba(236,229,214,.62)' : 'rgba(70,50,30,.62)'; tctx.textAlign = 'left'; tctx.fillText(t, x0 + 12, y);
      legendBox.push([x0 - 4, y - 11, x0 + tw + 16, y + 11]);
    });
    tctx.textBaseline = 'alphabetic';
  }
  /* ---------- det som rör sig: byarna, nålen, trådarna till rösterna och ljudringarna ---------- */
  const rings = [];
  let level = 0;
  function drawOverlay() {
    octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);
    if (!voices.length) return;
    const w = weights(pin), px = pin.x * W, py = pin.y * H, ink = dark() ? '#ece5d6' : '#2a2520';
    // trådar från nålen till de röster som hörs, tjockare ju mer de väger
    octx.lineCap = 'round';
    w.forEach((x, i) => {
      if (x < .03) return;
      const v = voices[i], line = () => { octx.beginPath(); octx.moveTo(px, py); octx.lineTo(v.x * W, v.y * H); octx.stroke(); };
      octx.globalAlpha = .7; octx.strokeStyle = dark() ? '#15181d' : '#faf6ee'; octx.lineWidth = 1.5 + 7 * x + 2; line();
      octx.globalAlpha = .45 + .5 * x; octx.strokeStyle = css(colorOf(v)); octx.lineWidth = 1.5 + 7 * x; line();
    });
    octx.globalAlpha = 1;
    // ljudringar medan rösten talar
    for (let k = rings.length - 1; k >= 0; k--) {
      const r = rings[k]; r.t += 1 / 60; if (r.t > 1.6) { rings.splice(k, 1); continue; }
      octx.strokeStyle = dark() ? '#f0bd3a' : '#b8202f'; octx.globalAlpha = Math.max(0, (1 - r.t / 1.6)) * .55 * r.a; octx.lineWidth = 2;
      octx.beginPath(); octx.arc(r.x, r.y, 10 + r.t * 70, 0, Math.PI * 2); octx.stroke();
    }
    octx.globalAlpha = 1;
    // byarna, och namnen på sina fasta platser
    octx.textBaseline = 'middle';
    voices.forEach((v, i) => {
      const x = v.x * W, y = v.y * H, on = w[i], c = css(colorOf(v)), big = on > .25;
      octx.fillStyle = c; octx.strokeStyle = dark() ? 'rgba(21,24,29,.6)' : '#faf6ee'; octx.lineWidth = 2;
      octx.beginPath(); octx.arc(x, y, big ? 6 : 4.5, 0, Math.PI * 2); octx.fill(); octx.stroke();
      if (on > .05) { octx.strokeStyle = c; octx.lineWidth = 1.5; octx.beginPath(); octx.arc(x, y, 9 + 6 * on, 0, Math.PI * 2); octx.stroke(); }
    });
    // de röster som inte hörs först, under nålen; de som hörs efter nålen, så att de alltid går att läsa
    const label = i => {
      let at = labels[i]; if (!at) return;
      const v = voices[i], strong = w[i] > .25, heard = w[i] > .05;
      octx.font = `${strong ? '600' : 'italic 400'} ${at[2]}px Fraunces, Georgia, serif`; octx.textAlign = 'left';
      if (heard) {
        const hs = 1.2 + level * .5, head = [px - 12 * hs, py - 32 * hs, px + 12 * hs, py + 2];
        const box = a => a[0] < head[2] && a[0] + a[3] > head[0] && a[1] - 8 < head[3] && a[1] + 8 > head[1];
        if (box(at)) { const vx = voices[i].x * W, mx = at[0] > vx ? vx - 10 - at[3] : vx + 10; at = [mx, voices[i].y * H, at[2], at[3]]; }
      }
      const under = !heard && Math.abs(at[0] + at[3] / 2 - px) < at[3] / 2 + 14 && at[1] > py - 42 && at[1] < py + 4;
      octx.lineJoin = 'round'; octx.miterLimit = 2;
      octx.lineWidth = dark() ? (strong ? 3 : 2.5) : (strong ? 4.5 : 3.5); octx.strokeStyle = dark() ? 'rgba(21,24,29,.55)' : 'rgba(250,246,238,.9)';
      if (dark()) { octx.shadowColor = 'rgba(0,0,0,.55)'; octx.shadowBlur = 4; } octx.globalAlpha = under ? .35 : 1; octx.strokeText(v.name, at[0], at[1]);
      octx.fillStyle = ink; octx.globalAlpha = under ? .35 : strong ? 1 : .72; octx.fillText(v.name, at[0], at[1]); octx.globalAlpha = 1; octx.shadowBlur = 0; octx.shadowColor = 'transparent';
    };
    for (let i = 0; i < voices.length; i++) if (w[i] <= .05) label(i);
    // nålen
    const bob = dragging ? -4 : 0, s = 1.2 + level * .5;
    octx.save(); octx.translate(px, py);
    octx.fillStyle = 'rgba(0,0,0,.18)'; octx.beginPath(); octx.ellipse(0, 2, 9, 3.5, 0, 0, Math.PI * 2); octx.fill();
    octx.translate(0, bob);
    octx.fillStyle = dark() ? '#e0485a' : '#b8202f';
    octx.beginPath(); octx.moveTo(0, 0); octx.bezierCurveTo(-11 * s, -14 * s, -10 * s, -30 * s, 0, -30 * s); octx.bezierCurveTo(10 * s, -30 * s, 11 * s, -14 * s, 0, 0); octx.fill();
    octx.strokeStyle = dark() ? '#ece5d6' : '#faf6ee'; octx.lineWidth = 1.5; octx.stroke();
    octx.fillStyle = dark() ? '#f0bd3a' : '#e8ad13'; octx.beginPath(); octx.arc(0, -19 * s, 4.5 * s, 0, Math.PI * 2); octx.fill();
    octx.restore();
    for (let i = 0; i < voices.length; i++) if (w[i] > .05) label(i);
  }
  // nålen glider till en ny plats (Slumpa, piltangenterna) i stället för att hoppa; talet räknas på målet
  let glide = null;
  const aim = () => glide ? glide.to : pin;
  function goTo(p) {
    moved = true;
    if (reduceMotion) { pin = p; glide = null; return; }
    glide = { from: { ...pin }, to: p, t0: performance.now() };
  }
  function loop() {
    if (glide) {
      const t = Math.min(1, (performance.now() - glide.t0) / 450), e = 1 - Math.pow(1 - t, 3);
      pin = { x: glide.from.x + (glide.to.x - glide.from.x) * e, y: glide.from.y + (glide.to.y - glide.from.y) * e };
      if (t >= 1) { pin = glide.to; glide = null; showMix(); }
    }
    if (analyser) {
      const buf = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(buf);
      let e = 0; for (const x of buf) e += x * x; const rms = Math.sqrt(e / buf.length);
      level += (Math.min(1, rms * 4) - level) * .3;
      if (speaking && !reduceMotion && Math.random() < level * .5) rings.push({ x: pin.x * W, y: pin.y * H - 23, t: 0, a: Math.min(1, level * 2) });
    }
    drawOverlay(); requestAnimationFrame(loop);
  }

  /* ---------- namnens platser: räknas en gång per storlek, så att de aldrig flyttar sig medan nålen rör sig ---------- */
  let labels = [], legendBox = [];
  // ett namn hör till den prick som ligger närmast det: ingen annan by får ligga närmare namnet än den egna
  const boxDist = (v, b) => Math.hypot(Math.max(b[0] - v.x * W, 0, v.x * W - b[2]), Math.max(b[1] - v.y * H, 0, v.y * H - b[3]));
  const ownNearest = (i, b) => { const d = boxDist(voices[i], b); return voices.every((v, k) => k === i || boxDist(v, b) > d + 7); };
  function placeLabels() {
    const placed = [...legendBox];   // färgnyckeln längs nederkanten
    const dots = voices.map(v => [v.x * W - 7, v.y * H - 7, v.x * W + 7, v.y * H + 7]);
    const hit = (b, list) => list.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    labels = voices.map((v, i) => {
      const x = v.x * W, y = v.y * H, others = dots.filter((_, k) => k !== i);
      // 13 punkter om det går, annars 11, och först därefter inget namn
      for (const size of W < 420 ? [12, 11] : [13, 11]) {
        octx.font = `600 ${size}px Fraunces, Georgia, serif`;
        const tw = octx.measureText(v.name).width, th = size + 2;
        // höger, vänster, ovanför, under och snett: den första lediga platsen
        const spots = [[x + 10, y - th / 2], [x + 7, y - 6 - th], [x + 7, y + 6], [x - 10 - tw, y - th / 2], [x - 7 - tw, y - 6 - th], [x - 7 - tw, y + 6], [x - tw / 2, y - 9 - th], [x - tw / 2, y + 9]];
        const at = spots.find(([sx, sy]) => { const b = [sx - 2, sy, sx + tw + 2, sy + th]; return sx > 4 && sx + tw < W - 4 && sy > 4 && sy + th < H - 4 && !hit(b, placed) && !hit(b, others) && ownNearest(i, b); });
        if (at) { placed.push([at[0] - 2, at[1], at[0] + tw + 2, at[1] + th]); return [at[0], at[1] + th / 2, size, tw]; }
      }
      return null;
    });
  }

  /* ---------- storlek ---------- */
  function resize() {
    const r = map.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; S = Math.min(W, H);
    for (const c of [terrain, overlay]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    if (voices.length) { drawTerrain(); placeLabels(); }
  }

  // nålens plats sparas i adressen, så att en länk tar en till samma röst
  function showMix() {
    const p = aim(); try { history.replaceState(null, '', `#x=${p.x.toFixed(3)}&y=${p.y.toFixed(3)}`); } catch { }
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
      $('status').textContent = ''; return;
    }
    if (m.error && m.id === undefined) { console.error(m.error); $('loadText').textContent = 'Rösterna kunde inte laddas.'; $('loadSmall').textContent = 'Ladda om sidan och försök igen.'; return; }
    const w = waiting.get(m.id); if (!w) return; waiting.delete(m.id);
    m.error ? w.reject(new Error(m.error)) : w.resolve(m);
  };
  function synth(text, mix) {
    const length = +(2.1 - $('tempo').value).toFixed(2), noisew = +$('life').value;
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
    try {
      const m = await synth(text.slice(0, 600), weights(aim()));
      play(m);
      if (!quiet) { lastPcm = m; $('save').hidden = false; $('status').textContent = ''; }
    } catch (e) { console.error(e); $('status').textContent = 'Det gick inte att läsa upp. Försök igen.'; }
    busy = false;
  }
  /* ---------- nålen ---------- */
  const at = e => { const r = map.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  map.addEventListener('pointerdown', e => {
    if (!voices.length) return;
    moved = true; audio(); map.focus({ preventScroll: true, focusVisible: false }); dragging = true; map.setPointerCapture(e.pointerId);
    glide = null; pin = at(e); showMix();
  });
  map.addEventListener('pointermove', e => {
    const p = at(e);
    if (dragging) { pin = p; showMix(); }
  });
  const release = () => { if (!dragging) return; dragging = false; say(); };
  map.addEventListener('pointerup', release); map.addEventListener('pointercancel', release);
  map.addEventListener('keydown', e => {
    const d = e.shiftKey ? .05 : .015, k = e.key;
    const moves = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
    if (moves[k]) { e.preventDefault(); const p = aim(); goTo({ x: Math.min(1, Math.max(0, p.x + moves[k][0])), y: Math.min(1, Math.max(0, p.y + moves[k][1])) }); showMix(); clearTimeout(map.t); map.t = setTimeout(() => say(), 350); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); say(); }
    else if (k === 's' || k === 'S') { randomSpot(); }
  });
  function randomSpot() {
    // mellan en röst och en av dess närmaste grannar, aldrig ovanpå en by: ingen röst får väga mer än 60 %
    for (let tries = 0; tries < 30; tries++) {
      const a = voices[Math.random() * voices.length | 0];
      const near = voices.filter(v => v !== a).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y)).slice(0, 4);
      const b = near[Math.random() * near.length | 0], t = .4 + Math.random() * .2, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (Math.max(...weights(p)) <= .6 || tries === 29) { goTo(p); break; }
    }
    showMix(); say();
  }

  /* ---------- reglage och knappar ---------- */
  const fill = el => el.style.setProperty('--p', (el.value - el.min) / (el.max - el.min) * 100 + '%');
  document.querySelectorAll('.knob input').forEach(el => { fill(el); el.addEventListener('input', () => fill(el)); });
  $('spread').oninput = () => { sigma = +$('spread').value; showMix(); clearTimeout(drawTerrain.t); drawTerrain.t = setTimeout(drawTerrain, 60); };
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
    ['Färjan till Helsingör', 'Hörru, ska vi ta färjan över till Helsingör i morgon?'],
    ['Regn i eftermiddag', 'Det blir nog regn i eftermiddag, så ta med dig en jacka.'],
    ['Kaffe och kaka', 'Vill du ha en kopp kaffe och en bit kaka?'],
    ['Ta det lugnt', 'Nu får du allt ta det lite lugnt, påg.'],
  ];
  $('chips').innerHTML = SENTENCES.map(([label], i) => `<button class="chip" data-i="${i}">${esc(label)}</button>`).join('');
  $('chips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; $('text').value = SENTENCES[b.dataset.i][1]; say(); };
  $('text').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); say(); } });
  const themeIcon = () => { $('theme').innerHTML = dark() ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.05 3.05l1.13 1.13M11.82 11.82l1.13 1.13M3.05 12.95l1.13-1.13M11.82 4.18l1.13-1.13"/></svg>' : '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z"/></svg>'; $('theme').setAttribute('aria-label', dark() ? 'Byt till ljust läge' : 'Byt till mörkt läge'); };
  $('theme').onclick = () => {
    const now = dark(); document.documentElement.dataset.theme = now ? 'light' : 'dark'; themeIcon();
    try { localStorage.setItem('roster-tema', document.documentElement.dataset.theme); } catch { }
    drawTerrain();
  };
  try { const t = localStorage.getItem('roster-tema'); if (t) document.documentElement.dataset.theme = t; } catch { }
  themeIcon();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => voices.length && drawTerrain());

  function valley() {
    let best = { x: .5, y: .5 }, score = 9;
    for (let j = 2; j < 38; j++) for (let i = 2; i < 38; i++) {
      const p = { x: i / 40, y: j / 40 }, w = weights(p), top = w.map((x, k) => [x, k]).sort((a, b) => b[0] - a[0]).slice(0, 3);
      const both = top.some(([x, k]) => x > .15 && voices[k].sex === 'f') && top.some(([x, k]) => x > .15 && voices[k].sex === 'm');
      const near = Math.min(...voices.map(v => Math.hypot(v.x - p.x, v.y - p.y)));
      // nålens huvud får inte täcka något namn
      const hx = p.x * W, hy = p.y * H, free = labels.every(l => !l || l[0] > hx + 16 || l[0] + l[3] < hx - 16 || l[1] - 8 > hy + 4 || l[1] + 8 < hy - 42);
      if (both && free && near < .12 && top[0][0] < score) { score = top[0][0]; best = p; }
    }
    return best;
  }

  /* ---------- start ---------- */
  fetch('modell/roster.json').then(r => r.json()).then(meta => {
    voices = meta.voices;
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.has('x') && h.has('y')) pin = { x: +h.get('x'), y: +h.get('y') };
    resize(); if (!(h.has('x') && h.has('y'))) pin = valley(); showMix(); requestAnimationFrame(loop);
    document.fonts.ready.then(() => { resize(); if (!(h.has('x') && h.has('y')) && !moved) { pin = valley(); showMix(); } });   // namnens platser mäts med sidans eget typsnitt
  });
  worker.postMessage({ load: base });
  new ResizeObserver(() => resize()).observe(map);
})();
