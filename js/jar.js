// ============================================================
// Frasco con física (matter.js) — nombres como "pastillas"
// que caen, se apilan y se pueden arrastrar con el dedo.
// ============================================================
const Jar = (() => {
  const { Engine, Bodies, Body, Composite, Mouse, MouseConstraint, Events } = Matter;

  const NAVY = '#2D3277', YELLOW = '#FFE600';
  const COLORS = [
    { bg: NAVY,      fg: '#FFFFFF' },
    { bg: '#FFFFFF', fg: NAVY },
    { bg: '#F6B6CB', fg: NAVY },
    { bg: '#CFC8F5', fg: NAVY },
  ];
  const NEW_COLOR = { bg: YELLOW, fg: NAVY };

  let canvas, ctx, W = 0, H = 0, dpr = 1;
  let engine, mouse, mc, raf = 0;
  const STEP = 1000 / 60;     // paso fijo de física
  let lastT = 0, acc = 0;
  let geo = null;
  let pills = [];
  let floating = null;
  let fs = 24;
  let hiddenCount = 0;
  let last = null;           // últimos parámetros de open() para reconstruir al redimensionar
  let timers = [];
  let running = false;
  let jarWalls = [];         // paredes del frasco con su posición base (se mueven al sacudir)
  let off = { x: 0, y: 0 };  // desplazamiento actual del frasco
  let wobble = null;         // sacudida en curso

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    // Tocar el vidrio (no un nombre) le da un golpecito al frasco
    canvas.addEventListener('pointerdown', e => {
      if (!running || !geo || wobble) return;
      const r = canvas.getBoundingClientRect();
      const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
      const onName = Matter.Query.point(pills.map(p => p.body), pt).length > 0;
      const onJar = pt.x > geo.L + off.x && pt.x < geo.R + off.x && pt.y > geo.yTop + off.y && pt.y < geo.by + off.y;
      if (!onName && onJar) shake(650, 0.55);
    });
    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (running && last) open({ ...last, dropNew: false }); }, 250);
    });
  }

  // ── Geometría del frasco según pantalla ─────────────────────
  // area: { top, bottom } espacio libre que deja la interfaz (en px de pantalla)
  function computeGeo(area) {
    const landscape = W > H * 1.1;
    const a = area || { top: 0, bottom: H };
    let Hj, Wj, cx, by;
    if (landscape) {
      by = H * 0.94;
      Hj = Math.min(H * 0.76, by - a.top - H * 0.05); Wj = Hj * 0.74;
      const maxW = W * 0.42;
      if (Wj > maxW) { Wj = maxW; Hj = Wj / 0.74; }
      cx = W * 0.71;
    } else {
      // vertical: texto arriba, botones abajo; se deja lugar arriba para que caiga el nombre nuevo
      by = a.bottom - H * 0.012;
      Hj = Math.max(H * 0.25, by - a.top - H * 0.03); Wj = Hj * 0.95;
      const maxW = W * 0.86;
      if (Wj > maxW) { Wj = maxW; Hj = Wj / 0.95; }
      cx = W / 2;
    }
    const bodyH = Hj * 0.76, shoulderH = Hj * 0.12;
    return {
      cx, by, Wj, Hj,
      Wn: Wj * 0.64,
      L: cx - Wj / 2, R: cx + Wj / 2,
      yShoulder: by - bodyH,
      yNeck: by - bodyH - shoulderH,
      yTop: by - Hj,
    };
  }

  function segment(x1, y1, x2, y2, t, opts) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    let nx = -dy / len, ny = dx / len;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    // normal hacia afuera del frasco
    if (nx * (mx - geo.cx) + ny * (my - (geo.by - geo.Hj / 2)) < 0) { nx = -nx; ny = -ny; }
    return Bodies.rectangle(mx + nx * t / 2, my + ny * t / 2, len + t * 0.6, t, { ...opts, angle: Math.atan2(dy, dx) });
  }

  function buildWalls() {
    const g = geo, t = 90;
    const o = { isStatic: true, friction: 0.25, restitution: 0.1, label: 'wall' };
    const nL = g.cx - g.Wn / 2, nR = g.cx + g.Wn / 2;
    const hWall = g.by - g.yShoulder;
    const neckH = g.yNeck - g.yTop;
    const jar = [
      Bodies.rectangle(g.cx, g.by + t / 2, g.Wj + 2 * t, t, o),
      Bodies.rectangle(g.L - t / 2, g.yShoulder + hWall / 2, t, hWall + t, o),
      Bodies.rectangle(g.R + t / 2, g.yShoulder + hWall / 2, t, hWall + t, o),
      segment(g.L, g.yShoulder, nL, g.yNeck, t, o),
      segment(g.R, g.yShoulder, nR, g.yNeck, t, o),
      Bodies.rectangle(nL - t / 2, g.yTop + neckH / 2, t, neckH + 10, o),
      Bodies.rectangle(nR + t / 2, g.yTop + neckH / 2, t, neckH + 10, o),
    ];
    jarWalls = jar.map(body => ({ body, x: body.position.x, y: body.position.y }));
    return [
      ...jar,
      // bordes de la pantalla
      Bodies.rectangle(W / 2, H + 60, W * 3, 120, o),
      Bodies.rectangle(-60, 0, 120, H * 4, o),
      Bodies.rectangle(W + 60, 0, 120, H * 4, o),
      Bodies.rectangle(W / 2, -H * 1.2, W * 3, 120, o),
    ];
  }

  // ── Pastillas ───────────────────────────────────────────────
  function fitLabel(text, size, maxW) {
    ctx.font = `800 ${size}px Montserrat`;
    const pad = size * 0.95;
    let label = text, tw = ctx.measureText(label).width;
    while (tw + pad * 2 > maxW && label.length > 3) {
      label = label.slice(0, -2).trimEnd() + '…';
      tw = ctx.measureText(label).width;
    }
    return { label, w: Math.max(size * 3.2, tw + pad * 2), h: size * 1.9 };
  }

  function makePill(item, x, y, colorIdx, isNew) {
    const m = fitLabel(item.label, fs, geo.Wn * 0.88);
    const body = Bodies.rectangle(x, y, m.w, m.h, {
      chamfer: { radius: m.h / 2 - 0.5 },
      restitution: 0.28, friction: 0.3, frictionAir: 0.012, density: 0.0016,
      angle: (Math.random() - 0.5) * 0.25, label: 'pill'
    });
    const pill = { id: item.id, item, body, label: m.label, w: m.w, h: m.h, fs,
                   color: isNew ? NEW_COLOR : COLORS[colorIdx % COLORS.length], isNew: !!isNew, born: performance.now() };
    Composite.add(engine.world, body);
    pills.push(pill);
    return pill;
  }

  // Tamaño de letra según cuántos nombres hay que meter
  function chooseSize(items) {
    const base = Math.max(14, Math.min(40, geo.Wj * 0.056));
    const budget = geo.Wj * (geo.by - geo.yShoulder) * 0.62;
    const areaAt = (size, list) => list.reduce((a, it) => { const m = fitLabel(it.label, size, geo.Wn * 0.88); return a + m.w * m.h; }, 0);
    let size = base;
    const a = areaAt(size, items);
    if (a > budget) size = Math.max(12, base * Math.sqrt(budget / a) * 0.98);
    let list = items;
    // Si aún así no entran, se muestran los más nuevos
    while (list.length > 1 && areaAt(size, list) > budget) list = list.slice(Math.ceil(list.length * 0.08));
    return { size, list };
  }

  // ── Ciclo ───────────────────────────────────────────────────
  function stop() {
    running = false;
    wobble = null; off = { x: 0, y: 0 };
    timers.forEach(clearTimeout); timers = [];
    cancelAnimationFrame(raf);
    if (engine) { Composite.clear(engine.world, false); Engine.clear(engine); }
    pills = []; floating = null;
  }

  /**
   * items: [{id, label}] ordenados del más viejo al más nuevo
   * newId: id a destacar (cae al final desde arriba)
   */
  function open({ items, newId = null, dropNew = true, area = null }) {
    stop();
    last = { items, newId, area };
    running = true;

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    geo = computeGeo(typeof area === 'function' ? area() : area);

    engine = Engine.create({ gravity: { x: 0, y: 1 } });
    engine.positionIterations = 8;
    engine.velocityIterations = 6;
    Composite.add(engine.world, buildWalls());

    if (!mouse) {
      canvas.setAttribute('data-pixel-ratio', dpr);
      mouse = Mouse.create(canvas);
    } else {
      mouse.pixelRatio = dpr;
    }
    mc = MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.18, damping: 0.12, render: { visible: false } } });
    Composite.add(engine.world, mc);

    // límite de velocidad para que nada atraviese las paredes
    Events.on(engine, 'beforeUpdate', () => {
      stepWobble();
      for (const p of pills) {
        const v = p.body.velocity, s = Math.hypot(v.x, v.y);
        if (s > 38) Body.setVelocity(p.body, { x: v.x / s * 38, y: v.y / s * 38 });
      }
    });
    // red de seguridad: si algo igual se cuela por las paredes (nombres
    // superpuestos, choques fuertes al sacudir), se lo corrige cada cuadro
    // para que ningún nombre quede visible fuera del frasco.
    Events.on(engine, 'afterUpdate', () => {
      for (const p of pills) clampInsideJar(p);
    });

    const newItem = newId ? items.find(i => i.id === newId) : null;
    const rest = items.filter(i => i !== newItem);
    const chosen = chooseSize(newItem ? [...rest, newItem] : rest);
    fs = chosen.size;
    const visible = chosen.list.filter(i => i !== newItem);
    hiddenCount = items.length - chosen.list.length;

    // Se apilan desde el fondo, mezclados
    const order = visible.map((it, i) => ({ it, i })).sort(() => Math.random() - 0.5);
    let x = geo.L + 6, y = geo.by - fs * 1.9 / 2 - 2, rowH = fs * 1.9 + 4;
    for (const { it, i } of order) {
      const m = fitLabel(it.label, fs, geo.Wn * 0.88);
      if (x + m.w > geo.R - 6) { x = geo.L + 6 + Math.random() * 20; y -= rowH; }
      const inNeck = y < geo.yNeck;
      const px = inNeck ? geo.cx + (Math.random() - 0.5) * (geo.Wn - m.w) * 0.8 : x + m.w / 2;
      makePill(it, px, y, i, false).entered = true;
      x += m.w + 4;
    }

    if (newItem) {
      const drop = () => {
        const p = makePill(newItem, geo.cx + (Math.random() - 0.5) * geo.Wn * 0.2, geo.yTop - fs * 3, 0, true);
        Body.setAngularVelocity(p.body, (Math.random() - 0.5) * 0.08);
      };
      if (dropNew) timers.push(setTimeout(drop, 900)); else drop();
    }

    // La física la avanza loop() con el tiempo real (ver stepPhysics)
    lastT = performance.now(); acc = 0;
    loop();
  }

  // Ancho útil del frasco a una altura y dada (cuerpo ancho, cuello angosto)
  function halfWidthAt(y) {
    const g = geo;
    if (y >= g.yShoulder) return g.Wj / 2;
    if (y >= g.yNeck) {
      const t = (g.yShoulder - y) / (g.yShoulder - g.yNeck);
      return g.Wj / 2 + (g.Wn / 2 - g.Wj / 2) * t;
    }
    return g.Wn / 2;
  }

  // Devuelve una pastilla adentro del frasco si por algún choque quedó afuera
  // (sigue al frasco cuando se está moviendo por una sacudida)
  function clampInsideJar(p) {
    const g = geo, b = p.body;
    const halfW = p.w / 2 - 2, halfH = p.h / 2 - 2;
    let { x, y } = b.position;
    let { x: vx, y: vy } = b.velocity;
    let fixed = false;

    const maxY = g.by + off.y - halfH;
    if (y > maxY) { y = maxY; if (vy > 0) vy = 0; fixed = true; }

    // Tope arriba sólo para los que ya están adentro (el nombre nuevo cae desde afuera)
    const minYCap = g.yTop + off.y + p.h * 0.6;
    if (!p.entered && y > minYCap + p.h) p.entered = true;
    if (p.entered && y < minYCap) { y = minYCap; if (vy < 0) vy = 0; fixed = true; }
    if (!p.entered) return;   // todavía cayendo: la física de las paredes alcanza

    const hw = Math.max(halfWidthAt(y - off.y) - 3, halfW + 2);
    const cx = g.cx + off.x;
    const minX = cx - hw + halfW, maxX = cx + hw - halfW;
    if (x < minX) { x = minX; if (vx < 0) vx = 0; fixed = true; }
    if (x > maxX) { x = maxX; if (vx > 0) vx = 0; fixed = true; }

    if (fixed) { Body.setPosition(b, { x, y }); Body.setVelocity(b, { x: vx, y: vy }); }
  }

  // ── Sacudir ─────────────────────────────────────────────────
  // El frasco se mueve de lado a lado (y rebota un poco): las paredes empujan
  // los nombres, como cuando sacudís un frasco de verdad. Además, cada tanto,
  // un empujón suave hacia arriba los hace dar vueltas y mezclarse.
  function shake(ms = 1100, strength = 1) {
    if (!running) return;
    wobble = { t0: engine.timing.timestamp, dur: ms, amp: geo.Wj * 0.065 * strength, strength, nextKick: 0 };
  }

  function kickNames(strength) {
    const g = engine.gravity.y * 0.001 * (1000 / 60) ** 2; // px/paso² aprox
    for (const p of pills) {
      const { x, y } = p.body.position;
      if (x < geo.L + off.x || x > geo.R + off.x || y < geo.yTop + off.y) continue;
      // que suban como máximo hasta el cuello: no se escapan
      const rise = Math.max(0, (y - geo.yNeck - off.y) * (0.2 + Math.random() * 0.35) * strength);
      Body.setVelocity(p.body, { x: p.body.velocity.x + (Math.random() - 0.5) * 5, y: -Math.sqrt(2 * g * rise) });
      Body.setAngularVelocity(p.body, (Math.random() - 0.5) * 0.2);
    }
  }

  function moveJar(nx, ny) {
    for (const w of jarWalls) {
      Body.setPosition(w.body, { x: w.x + nx, y: w.y + ny });
      // velocidad de la pared = cuánto se movió en este paso (así "empuja" al chocar)
      Body.setVelocity(w.body, { x: nx - off.x, y: ny - off.y });
    }
    off = { x: nx, y: ny };
  }

  function stepWobble() {
    if (!wobble) return;
    const el = engine.timing.timestamp - wobble.t0;
    if (el >= wobble.dur) {
      wobble = null;
      moveJar(0, 0);
      for (const w of jarWalls) Body.setVelocity(w.body, { x: 0, y: 0 });
      return;
    }
    // entra rápido, se sostiene y se apaga al final
    const env = Math.min(1, el / 120) * Math.min(1, (wobble.dur - el) / Math.min(450, wobble.dur * 0.45));
    const ph = (el / 1000) * 4.2 * Math.PI * 2;     // ~4 vaivenes por segundo
    moveJar(wobble.amp * env * Math.sin(ph), -wobble.amp * 0.3 * env * Math.abs(Math.sin(ph)));
    if (el >= wobble.nextKick) {
      kickNames(wobble.strength);
      wobble.nextKick = el + 420;
    }
  }

  // ── Sacar un nombre (sorteo) ────────────────────────────────
  function extract(item) {
    return new Promise(resolve => {
      let p = pills.find(x => x.id === item.id);
      if (!p) p = makePill(item, geo.cx, geo.yShoulder + 20, 0, false);
      Composite.remove(engine.world, p.body);
      pills = pills.filter(x => x !== p);
      p.color = NEW_COLOR;
      const from = { x: p.body.position.x, y: p.body.position.y, a: p.body.angle, s: 1 };
      const landscape = W > H * 1.1;
      const to = { x: geo.cx, y: landscape ? H * 0.2 : H * 0.5, a: 0, s: Math.min(2.6, (landscape ? W * 0.4 : W * 0.8) / p.w) };
      floating = { p, ...from };
      const t0 = performance.now(), dur = 1400;
      const easeBack = t => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
      const step = now => {
        if (!floating) return resolve();
        const t = Math.min(1, (now - t0) / dur), e = easeBack(t);
        floating.x = from.x + (to.x - from.x) * e;
        floating.y = from.y + (to.y - from.y) * e;
        floating.a = from.a + (to.a - from.a) * Math.min(1, t * 1.4);
        floating.s = from.s + (to.s - from.s) * e;
        if (t < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // Devuelve el nombre sorteado al frasco (para sortear suplente)
  function returnFloating() {
    if (!floating) return;
    const { p } = floating;
    floating = null;
    p.color = COLORS[1];
    const np = makePill(p.item, geo.cx, geo.yTop - fs * 3, 1, false);
    np.color = COLORS[1];
  }

  // ── Render ──────────────────────────────────────────────────
  function jarPath(closed) {
    const g = geo, nL = g.cx - g.Wn / 2, nR = g.cx + g.Wn / 2;
    const r1 = g.Wj * 0.06, r2 = g.Wj * 0.05;
    ctx.beginPath();
    ctx.moveTo(nL, g.yTop);
    ctx.arcTo(nL, g.yNeck, g.L, g.yShoulder, r1);
    ctx.arcTo(g.L, g.yShoulder, g.L, g.by, r1);
    ctx.arcTo(g.L, g.by, g.R, g.by, r2);
    ctx.arcTo(g.R, g.by, g.R, g.yShoulder, r2);
    ctx.arcTo(g.R, g.yShoulder, nR, g.yNeck, r1);
    ctx.arcTo(nR, g.yNeck, nR, g.yTop, r1);
    ctx.lineTo(nR, g.yTop);
    if (closed) ctx.closePath();
  }

  function drawJarBack() {
    jarPath(true);
    const grad = ctx.createLinearGradient(geo.L, 0, geo.R, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.42)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0.38)');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function drawJarFront() {
    const g = geo, lw = Math.max(4, g.Wj * 0.014);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    jarPath(false);
    ctx.strokeStyle = NAVY; ctx.lineWidth = lw * 2.2; ctx.stroke();
    jarPath(false);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = lw; ctx.stroke();

    // brillos del vidrio
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = g.Wj * 0.035;
    ctx.beginPath();
    ctx.moveTo(g.L + g.Wj * 0.085, g.yShoulder + g.Hj * 0.06);
    ctx.lineTo(g.L + g.Wj * 0.085, g.by - g.Hj * 0.16);
    ctx.stroke();
    ctx.lineWidth = g.Wj * 0.018;
    ctx.beginPath();
    ctx.moveTo(g.L + g.Wj * 0.15, g.yShoulder + g.Hj * 0.06);
    ctx.lineTo(g.L + g.Wj * 0.15, g.yShoulder + g.Hj * 0.2);
    ctx.stroke();

    // aro de la boca
    const rimW = g.Wn + lw * 5, rimH = Math.max(14, g.Hj * 0.035);
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.roundRect(g.cx - rimW / 2, g.yTop - rimH * 0.7, rimW, rimH, rimH / 2);
    ctx.fill();

    // etiqueta
    const lblW = g.Wj * 0.44, lblH = g.Hj * 0.09, ly = g.by - g.Hj * 0.085;
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(g.cx - lblW / 2, ly - lblH / 2, lblW, lblH, lblH * 0.25);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = NAVY;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${lblH * 0.42}px Montserrat`;
    ctx.fillText('$200.000', g.cx, ly - lblH * 0.12);
    ctx.font = `700 ${lblH * 0.2}px Montserrat`;
    ctx.fillText(hiddenCount > 0 ? `+ ${hiddenCount} nombres más` : 'EN BELLEZA', g.cx, ly + lblH * 0.27);
    ctx.restore();
  }

  function drawPill(p, x, y, a, s, now) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
    const { w, h } = p;
    const glow = p.isNew || p === floating?.p;
    if (glow) {
      // halo que late (dos rectángulos translúcidos: mucho más barato que shadowBlur)
      const k = (Math.sin(now / 260) + 1) / 2;
      for (const [pad, a] of [[h * (0.34 + 0.12 * k), 0.10 + 0.06 * k], [h * (0.16 + 0.06 * k), 0.16 + 0.08 * k]]) {
        ctx.beginPath();
        ctx.roundRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2, h / 2 + pad);
        ctx.fillStyle = `rgba(45,50,119,${a})`;
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fillStyle = p.color.bg;
    ctx.fill();
    if (glow) {
      ctx.lineWidth = Math.max(3, h * 0.08); ctx.strokeStyle = NAVY; ctx.stroke();
    } else if (p.color.bg === '#FFFFFF') {
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(45,50,119,0.18)'; ctx.stroke();
    }
    ctx.fillStyle = p.color.fg;
    ctx.font = `800 ${p.fs}px Montserrat`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.label, 0, p.fs * 0.07);
    ctx.restore();
  }

  // Avanza la física según el tiempo real transcurrido, en pasos fijos de 1/60 s.
  // Si la pantalla va lenta se hacen varios pasos por cuadro: el frasco nunca
  // queda en cámara lenta (el Runner de matter.js sí lo hacía bajo 30 fps).
  function stepPhysics(now) {
    acc += Math.min(now - lastT, 250);
    lastT = now;
    let n = 0;
    while (acc >= STEP && n < 15) { Engine.update(engine, STEP); acc -= STEP; n++; }
    if (n === 15) acc = 0;
  }

  let renderMs = 0, renderFrames = 0;   // para medir rendimiento (Jar._debug)
  function loop() {
    const now = performance.now();
    renderFrames++;
    stepPhysics(now);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.translate(off.x, off.y); drawJarBack(); ctx.restore();
    for (const p of pills) if (!p.isNew) drawPill(p, p.body.position.x, p.body.position.y, p.body.angle, 1, now);
    for (const p of pills) if (p.isNew) drawPill(p, p.body.position.x, p.body.position.y, p.body.angle, 1, now);
    ctx.save(); ctx.translate(off.x, off.y); drawJarFront(); ctx.restore();
    if (floating) drawPill(floating.p, floating.x, floating.y, floating.a, floating.s, now);
    renderMs += performance.now() - now;
    if (running) raf = requestAnimationFrame(loop);
  }

  return { init, open, stop, shake, extract, returnFloating, get hiddenCount() { return hiddenCount; }, get _debug() { return { pills, geo, engine, renderMs, renderFrames }; }, resetStats() { renderMs = 0; renderFrames = 0; } };
})();
