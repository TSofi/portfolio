// Small, dependency-free behaviours. Everything degrades gracefully without JS.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Run a callback only while an element is on screen.
  function whileVisible(el, start, stop) {
    if (!el) return;
    new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop && stop())).observe(el);
  }

  function fitCanvas(c) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  /* ---------- hero: live spectrogram strip (five EEG bands, sharp cells) ---------- */
  (function spectrogram() {
    const c = $('.hero-spec'); if (!c) return;
    // colours come from the theme and are re-read when it changes
    let r, g, b, labelColor;
    const readColors = () => {
      const st = getComputedStyle(document.documentElement);
      [r, g, b] = (st.getPropertyValue('--accent').trim() || '#e8006f').match(/\w\w/g).map(h => parseInt(h, 16));
      labelColor = st.getPropertyValue('--ink-3').trim() || '#64625d';
    };
    readColors();
    const BANDS = ['γ', 'β', 'α', 'θ', 'δ'], SUB = 2, ROWS = BANDS.length * SUB;
    let s, cell, cols, grid = [], raf, last = 0, t = 0;
    // each band has its own slow rhythm; alpha gets occasional bursts
    const level = (row, x) => {
      const band = (row / SUB) | 0, k = row % SUB;
      let v = .18 + .12 * Math.sin(x * .21 + row * 1.7) + .1 * Math.sin(x * .053 + band * 2.1 + k);
      v += [.05, .12, .3, .2, .34][band];
      if (band === 2) v += .35 * Math.max(0, Math.sin(x * .07)) ** 3;
      if (band === 0) v += Math.random() < .04 ? .4 : 0;
      return Math.max(0, Math.min(1, v + (Math.random() - .5) * .16));
    };
    function layout() {
      s = fitCanvas(c);
      cell = Math.max(8, Math.min(16, Math.floor(s.h / ROWS)));
      cols = Math.ceil((s.w - 28) / cell);
      grid = Array.from({ length: cols }, (_, x) => Array.from({ length: ROWS }, (_, y) => level(y, x)));
      t = cols;
    }
    function paint() {
      const { ctx, w, h } = s;
      ctx.clearRect(0, 0, w, h);
      const top = (h - ROWS * cell) / 2;
      ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.fillStyle = labelColor;
      BANDS.forEach((n, i) => ctx.fillText(n, 4, top + (i * SUB + SUB / 2) * cell + 4));
      for (let x = 0; x < cols; x++) {
        const fade = Math.min(1, x / 12); // fade in from the left edge
        for (let y = 0; y < ROWS; y++) {
          const v = grid[x][y] ** 1.6 * fade;
          if (v < .03) continue;
          ctx.fillStyle = `rgba(${r},${g},${b},${v.toFixed(3)})`;
          ctx.fillRect(28 + x * cell, top + y * cell, cell - 3, cell - 3);
        }
      }
    }
    function frame(now) {
      if (now - last > 140) { // step like a real scrolling display
        last = now; t++;
        grid.shift(); grid.push(Array.from({ length: ROWS }, (_, y) => level(y, t)));
        paint();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    layout(); paint();
    addEventListener('resize', () => { layout(); paint(); });
    addEventListener('themechange', () => { readColors(); paint(); });
    whileVisible(c, () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }, () => cancelAnimationFrame(raf));
  })();

  /* ---------- buckwheat field: drifting grains, nudged by the pointer ---------- */
  (function buckwheat() {
    const c = $('.bw-field'); if (!c) return;
    const block = c.parentElement;
    let s = fitCanvas(c), grains = [], raf, mouse = { x: -999, y: -999 };
    const COLORS = ['#9a6118', '#b07828', '#8a5515', '#7a4a12', '#c08a3a'];
    function seed() {
      const n = Math.round((s.w * s.h) / 9000);
      grains = Array.from({ length: n }, () => ({
        x: Math.random() * s.w, y: Math.random() * s.h,
        r: 5 + Math.random() * 6, a: Math.random() * Math.PI * 2,
        va: (Math.random() - .5) * .006, vy: .08 + Math.random() * .22,
        dx: 0, dy: 0,
        c: COLORS[(Math.random() * COLORS.length) | 0],
        bad: Math.random() < .12,
      }));
    }
    function grain(ctx, g) {
      ctx.save(); ctx.translate(g.x + g.dx, g.y + g.dy); ctx.rotate(g.a);
      const r = g.r;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(r * .95, r * .2, r * .62, r * .72);
      ctx.quadraticCurveTo(0, r * 1.05, -r * .62, r * .72);
      ctx.quadraticCurveTo(-r * .95, r * .2, 0, -r);
      ctx.fillStyle = g.bad ? '#2b1b0c' : g.c; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -r * .7); ctx.lineTo(0, r * .5);
      ctx.strokeStyle = 'rgba(255,220,150,.22)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    function frame() {
      const { ctx, w, h } = s;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = .55;
      for (const g of grains) {
        g.y += g.vy; g.a += g.va;
        if (g.y - g.r > h) { g.y = -g.r; g.x = Math.random() * w; }
        const ddx = g.x - mouse.x, ddy = g.y - mouse.y, d = Math.hypot(ddx, ddy);
        const push = d < 120 ? (120 - d) / 120 : 0;
        g.dx += ((ddx / (d || 1)) * push * 40 - g.dx) * .08;
        g.dy += ((ddy / (d || 1)) * push * 40 - g.dy) * .08;
        grain(ctx, g);
      }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    block.addEventListener('pointermove', e => { const b = c.getBoundingClientRect(); mouse = { x: e.clientX - b.left, y: e.clientY - b.top }; });
    block.addEventListener('pointerleave', () => (mouse = { x: -999, y: -999 }));
    addEventListener('resize', () => { s = fitCanvas(c); seed(); });
    seed();
    whileVisible(block, () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }, () => cancelAnimationFrame(raf));
  })();

  /* ---------- buckwheat: load the live game on demand ---------- */
  $('#bw-play')?.addEventListener('click', () => {
    const screen = $('#bw-screen');
    const f = document.createElement('iframe');
    f.src = 'https://buckwheat-sort.vercel.app/?lang=en';
    f.title = 'Buckwheat Sort — playable game';
    f.allow = 'autoplay';
    screen.replaceChildren(f);
    screen.classList.add('live');
  });

  /* ---------- hackathon: 24h countdown, loops while visible ---------- */
  (function clock() {
    const el = $('#hk-clock'); if (!el) return;
    let left = 24 * 3600, id;
    const fmt = n => String(n).padStart(2, '0');
    const tick = () => {
      left = left <= 0 ? 24 * 3600 : left - 37; // runs fast on purpose
      el.textContent = `${fmt((left / 3600) | 0)}:${fmt(((left % 3600) / 60) | 0)}:${fmt(left % 60)}`;
    };
    whileVisible(el, () => { if (!reduce) id = setInterval(tick, 100); }, () => clearInterval(id));
  })();

  /* ---------- lab fig 1: EEG traces ---------- */
  (function eeg() {
    const svg = $('#eeg'); if (!svg) return;
    const NS = 'http://www.w3.org/2000/svg';
    const W = 600, H = +svg.getAttribute('viewBox').split(' ')[3], chans = ['Fp1', 'Fp2', 'C3', 'C4', 'O1', 'O2'];
    const rowH = H / chans.length, left = 44;
    const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    // highlight band: alpha burst over occipital channels
    const band = mk('rect', { x: 360, y: rowH * 4 + 2, width: 150, height: rowH * 2 - 4, class: 'eeg-band' });
    svg.append(band);
    const bl = mk('text', { x: 364, y: rowH * 4 - 4, class: 'eeg-band-label' }); bl.textContent = 'α 8–12 Hz';
    svg.append(bl);
    const paths = chans.map((name, i) => {
      const t = mk('text', { x: 0, y: rowH * i + rowH / 2 + 4, class: 'eeg-label' }); t.textContent = name; svg.append(t);
      const p = mk('path', { class: 'eeg-trace', opacity: (0.55 + i * 0.08).toFixed(2) }); svg.append(p);
      return p;
    });
    // deterministic pseudo-noise so traces look organic but stable
    const phases = chans.map((_, i) => [Math.random() * 6, Math.random() * 6, Math.random() * 6, i]);
    let raf, t = 0;
    const draw = () => {
      t += .016;
      paths.forEach((p, i) => {
        const [a, b, c] = phases[i], y0 = rowH * i + rowH / 2;
        let d = '';
        for (let x = left; x <= W; x += 3) {
          const u = (x + t * 60) / 22;
          let v = Math.sin(u * .9 + a) * 3 + Math.sin(u * 2.3 + b) * 2.2 + Math.sin(u * 5.1 + c) * 1.4;
          if (i >= 4 && x > 360 && x < 510) v += Math.sin(u * 3.2 + a) * 7 * Math.sin(((x - 360) / 150) * Math.PI);
          if (i < 2 && Math.abs(((x + t * 60) % 520) - 200) < 10) v -= 10 * Math.cos((((x + t * 60) % 520) - 200) / 10 * Math.PI / 2); // eye blink artefact
          d += (d ? 'L' : 'M') + x + ' ' + (y0 + v).toFixed(1);
        }
        p.setAttribute('d', d);
      });
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    whileVisible(svg, () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }, () => cancelAnimationFrame(raf));
  })();

  /* ---------- lab fig 2: two-branch pipeline diagram ---------- */
  (function nn() {
    const g = $('#nn'); if (!g) return;
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; g.append(e); return e; };
    // input frame
    mk('rect', { x: 4, y: 90, width: 70, height: 80 });
    mk('text', { x: 10, y: 84, class: 'hd' }, 'frame');
    for (let i = 0; i < 4; i++) mk('line', { x1: 12, x2: 66, y1: 104 + i * 16, y2: 104 + i * 16 });
    // branch A: ResNet18 → 7 emotions
    const layers = [[150, 5], [215, 7], [280, 5]];
    const emo = ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral'];
    const nodes = layers.map(([x, n]) => Array.from({ length: n }, (_, i) => [x, 30 + (i + .5) * (130 / n)]));
    const out = emo.map((_, i) => [380, 24 + i * 19]);
    const allLayers = [...nodes, out];
    const lines = [];
    nodes[0].forEach(([x, y]) => lines.push(mk('line', { x1: 74, y1: 130, x2: x, y2: y })));
    for (let l = 0; l < allLayers.length - 1; l++)
      allLayers[l].forEach(([x1, y1]) => allLayers[l + 1].forEach(([x2, y2]) => lines.push(mk('line', { x1, y1, x2, y2 }))));
    const circles = allLayers.flat().map(([x, y]) => mk('circle', { cx: x, cy: y, r: 5 }));
    mk('text', { x: 150, y: 18, class: 'hd' }, 'ResNet18');
    emo.forEach((e, i) => mk('text', { x: 392, y: out[i][1] + 4 }, e));
    // branch B: landmarks → EAR / MAR
    mk('line', { x1: 74, y1: 150, x2: 150, y2: 215 });
    mk('rect', { x: 150, y: 196, width: 150, height: 38 });
    mk('text', { x: 160, y: 219 }, '468 landmarks');
    mk('line', { x1: 300, y1: 215, x2: 380, y2: 215 });
    mk('text', { x: 386, y: 210, class: 'hd' }, 'EAR · blink rate');
    mk('text', { x: 386, y: 228, class: 'hd' }, 'MAR · yawning');
    mk('text', { x: 486, y: 106, class: 'hd' }, '→ ~65% acc.');
    mk('text', { x: 486, y: 122 }, 'FER-2013 test');
    // pulse a random activation path while visible
    let id;
    const pulse = () => {
      lines.forEach(l => l.classList.remove('hot'));
      circles.forEach(c => c.classList.remove('on'));
      const pick = allLayers.map(L => (Math.random() * L.length) | 0);
      let idx = 0;
      allLayers.forEach((L, li) => L.forEach((_, ni) => { if (pick[li] === ni) circles[idx].classList.add('on'); idx++; }));
      lines.forEach(l => {
        const x1 = +l.getAttribute('x1'), y1 = +l.getAttribute('y1'), x2 = +l.getAttribute('x2'), y2 = +l.getAttribute('y2');
        const li = allLayers.findIndex(L => L[0][0] === x2);
        if (li < 0) return;
        const to = allLayers[li][pick[li]];
        const from = li === 0 ? [74, 130] : allLayers[li - 1][pick[li - 1]];
        if (x1 === from[0] && y1 === from[1] && x2 === to[0] && y2 === to[1]) l.classList.add('hot');
      });
    };
    pulse();
    whileVisible(g.ownerSVGElement, () => { if (!reduce) id = setInterval(pulse, 1100); }, () => clearInterval(id));
  })();

  /* ---------- theme toggle (dark default, choice remembered) ---------- */
  (function theme() {
    const btn = $('.theme-toggle'); if (!btn) return;
    const meta = $('meta[name="theme-color"]');
    const sync = () => {
      const light = document.documentElement.dataset.theme === 'light';
      $('.tt-text', btn).textContent = light ? 'dark' : 'light';
      btn.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
      if (meta) meta.content = light ? '#f3f1ec' : '#0d0d0c';
    };
    btn.addEventListener('click', () => {
      const light = document.documentElement.dataset.theme !== 'light';
      if (light) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
      try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (e) {}
      sync();
      dispatchEvent(new Event('themechange'));
    });
    sync();
  })();

  /* ---------- copy email ---------- */
  $$('.contact-mail').forEach(b => b.addEventListener('click', async () => {
    const hint = $('.cm-hint', b);
    try { await navigator.clipboard.writeText(b.dataset.email); hint.textContent = 'copied ✓'; }
    catch { location.href = 'mailto:' + b.dataset.email; return; }
    b.classList.add('copied');
    setTimeout(() => { hint.textContent = 'click to copy'; b.classList.remove('copied'); }, 1800);
  }));

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15 });
  $$('.section-title, .rs-grid, .rs-title, .bw-text, .bw-device, .hk-grid, .ph-head, .ph-col, .lab-head, .lab-fig, .mu-grid, .wip-grid, .xp-list li, .contact-title').forEach(el => { el.classList.add('reveal'); io.observe(el); });
  $$('.sk-row, .rs-chart').forEach(el => io.observe(el));

  const y = $('#year'); if (y) y.textContent = new Date().getFullYear();
})();
