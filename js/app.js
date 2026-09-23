// ============================================================
// Sorteo Creadores Beauty — flujo principal
// Frase ⇄ Video (loop) → Formulario → Frasco → (Sorteo con clave)
// ============================================================
const PASSWORD = '3602';
const VIDEO_SRC = 'video/video.mp4';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Config ──────────────────────────────────────────────────
const CFG_DEFAULTS = { phraseSecs: 15, formIdleSecs: 90, jarSecs: 30, videoSound: true, jarLabel: 'corto' };
let cfg = { ...CFG_DEFAULTS };
try { cfg = { ...CFG_DEFAULTS, ...JSON.parse(localStorage.getItem('mlb_cfg') || '{}') }; } catch {}

// ── Utilidades ──────────────────────────────────────────────
let current = 's-attract';
function goTo(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  current = id;
  document.body.dataset.screen = id;
}

function uid() {
  if (crypto.randomUUID) try { return crypto.randomUUID(); } catch {}
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function secureRandomInt(n) {
  // sin sesgo de módulo
  const max = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= max);
  return buf[0] % n;
}

let toastT;
function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}

const fmtNum = n => Number(n || 0).toLocaleString('es-AR');
const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';

function labelFor(p) {
  if (cfg.jarLabel === 'usuario') return '@' + (p.instagram || p.tiktok);
  if (cfg.jarLabel === 'completo') return p.nombre;
  const parts = p.nombre.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

function jarItems() {
  return [...DB.participants]
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .map(p => ({ id: p.id, label: labelFor(p), p }));
}

const fontsReady = Promise.all([
  document.fonts.load('800 20px Montserrat'),
  document.fonts.load('900 20px Montserrat'),
  document.fonts.load('700 20px Montserrat'),
]).catch(() => {});

// ── Timers globales ─────────────────────────────────────────
let attractT, videoWatchdog, formIdleT, adminIdleT, jarCdI;
function clearTimers() {
  clearTimeout(attractT); clearTimeout(videoWatchdog);
  clearTimeout(formIdleT); clearTimeout(adminIdleT); clearInterval(jarCdI);
}

// ============================================================
// FRASE ⇄ VIDEO
// ============================================================
const video = $('#attract-video');
let videoOk = true;

function showAttract() {
  clearTimers();
  Jar.stop();
  video.pause();
  Keyboard.hide();
  if (document.activeElement) document.activeElement.blur();
  hideWinner();
  resetForm();
  updateAttractCount();
  $('#btn-draw-link').style.display = '';
  goTo('s-attract');
  const s = $('#s-attract');
  s.classList.remove('play'); void s.offsetWidth; s.classList.add('play');
  attractT = setTimeout(playVideo, cfg.phraseSecs * 1000);
}

function updateAttractCount() {
  const n = DB.participants.length;
  $('#at-count').textContent = n === 0 ? '' :
    n === 1 ? 'Ya hay 1 creador participando' : `Ya hay ${fmtNum(n)} creadores participando`;
}

function playVideo() {
  if (!videoOk) return showAttract();  // sin video: la frase se reanima y sigue el ciclo
  clearTimeout(videoWatchdog);
  try { video.currentTime = 0; } catch {}
  video.muted = !cfg.videoSound;
  goTo('s-video');
  const p = video.play();
  if (p) p.catch(() => {
    // Si el navegador no deja reproducir con sonido, se intenta sin sonido
    video.muted = true;
    video.play().catch(() => { videoOk = false; showAttract(); });
  });
  // Por si el video se traba: vuelve a la frase igual
  const d = isFinite(video.duration) && video.duration > 0 ? video.duration : 600;
  videoWatchdog = setTimeout(() => { if (current === 's-video') showAttract(); }, (d + 5) * 1000);
}

video.addEventListener('ended', () => { if (current === 's-video') showAttract(); });
video.addEventListener('error', () => { videoOk = false; if (current === 's-video') showAttract(); });
video.src = VIDEO_SRC;

$('#s-attract').addEventListener('click', startForm);
$('#s-video').addEventListener('click', startForm);

// ============================================================
// FORMULARIO
// ============================================================
const F = {
  nombre: $('#f-nombre'), email: $('#f-email'),
  instagram: $('#f-ig'), seguidoresInstagram: $('#f-ig-seg'),
  tiktok: $('#f-tt'), seguidoresTiktok: $('#f-tt-seg'),
};
const ORDER = ['nombre', 'email', 'instagram', 'seguidoresInstagram', 'tiktok', 'seguidoresTiktok'];
let consent = false;

const fieldOf = key => F[key].closest('.field');

function startForm() {
  clearTimers();
  video.pause();
  resetForm();
  goTo('s-form');
  bumpFormIdle();
  setTimeout(() => { if (current === 's-form') focusField(F.nombre); }, 380);
}

function resetForm() {
  Object.values(F).forEach(i => { i.value = ''; });
  $$('#form .field').forEach(f => f.classList.remove('invalid', 'valid', 'filled'));
  fieldOf('seguidoresInstagram').classList.add('disabled');
  fieldOf('seguidoresTiktok').classList.add('disabled');
  consent = false;
  $('#consent').classList.remove('checked', 'invalid');
  $('#form-error').textContent = '';
  $('#btn-submit').classList.remove('enabled', 'busy');
  $('#btn-submit').textContent = '¡Quiero participar!';
  $('#form-scroll').scrollTop = 0;
}

function bumpFormIdle() {
  clearTimeout(formIdleT);
  formIdleT = setTimeout(() => { if (current === 's-form') showAttract(); }, cfg.formIdleSecs * 1000);
}

// Limpieza de lo que se escribe
function cleanHandle(v) {
  v = v.trim().toLowerCase();
  const m = v.match(/(?:instagram\.com|tiktok\.com)\/@?([a-z0-9._]+)/);
  if (m) v = m[1];
  return v.replace(/^@+/, '').replace(/[^a-z0-9._]/g, '').slice(0, 30);
}
const SANITIZE = {
  nombre: v => v.replace(/[^\p{L}\s'.\-]/gu, '').replace(/^\s+/, '').replace(/\s{2,}/g, ' '),
  email: v => v.toLowerCase().replace(/\s/g, ''),
  instagram: cleanHandle,
  tiktok: cleanHandle,
  seguidoresInstagram: v => { const d = v.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 10); return d ? fmtNum(+d) : ''; },
};
SANITIZE.seguidoresTiktok = SANITIZE.seguidoresInstagram;

const digits = v => parseInt(String(v).replace(/\D/g, ''), 10);

function values() {
  return {
    nombre: F.nombre.value.trim(),
    email: F.email.value.trim(),
    instagram: F.instagram.value,
    seguidoresInstagram: F.seguidoresInstagram.value,
    tiktok: F.tiktok.value,
    seguidoresTiktok: F.seguidoresTiktok.value,
  };
}

// Devuelve el mensaje de error del campo o '' si está bien
function check(key, v = values()) {
  switch (key) {
    case 'nombre':
      return (v.nombre.replace(/[^\p{L}]/gu, '').length >= 2) ? '' : 'Escribí tu nombre';
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(v.email)) return 'Revisá el mail';
      return DB.findDuplicate({ email: v.email }) ? 'Este mail ya está participando' : '';
    case 'instagram':
      if (!v.instagram) return (!v.tiktok) ? 'Completá Instagram o TikTok' : '';
      if (/^\.|\.$/.test(v.instagram)) return 'Revisá el usuario';
      return DB.findDuplicate({ instagram: v.instagram }) ? 'Este Instagram ya está participando' : '';
    case 'tiktok':
      if (!v.tiktok) return (!v.instagram) ? 'Completá Instagram o TikTok' : '';
      if (v.tiktok.length < 2) return 'Revisá el usuario';
      return DB.findDuplicate({ tiktok: v.tiktok }) ? 'Este TikTok ya está participando' : '';
    case 'seguidoresInstagram':
      return (!v.instagram || v.seguidoresInstagram !== '') ? '' : '¿Cuántos seguidores tenés?';
    case 'seguidoresTiktok':
      return (!v.tiktok || v.seguidoresTiktok !== '') ? '' : '¿Cuántos seguidores tenés?';
  }
  return '';
}

function setFieldState(key, msg, show) {
  const f = fieldOf(key);
  f.querySelector('.field-msg').textContent = msg;
  if (msg && show) f.classList.add('invalid');
  if (!msg) f.classList.remove('invalid');
}

function refreshSubmit() {
  const v = values();
  const ok = ORDER.every(k => !check(k, v)) && consent;
  $('#btn-submit').classList.toggle('enabled', ok);
  return ok;
}

Object.entries(F).forEach(([key, input]) => {
  input.addEventListener('input', () => {
    const clean = SANITIZE[key](input.value);
    if (clean !== input.value) {
      input.value = clean;
      input.setSelectionRange(clean.length, clean.length);
    }
    const f = fieldOf(key);
    f.classList.toggle('filled', !!input.value);
    // Los seguidores se habilitan cuando hay usuario
    if (key === 'instagram' || key === 'tiktok') {
      const seg = key === 'instagram' ? 'seguidoresInstagram' : 'seguidoresTiktok';
      fieldOf(seg).classList.toggle('disabled', !input.value);
      if (!input.value) { F[seg].value = ''; setFieldState(seg, '', false); }
      // completar una red limpia el aviso de "completá una" en la otra
      const other = key === 'instagram' ? 'tiktok' : 'instagram';
      if (fieldOf(other).classList.contains('invalid')) setFieldState(other, check(other), true);
      Keyboard.refreshNext();
    }
    const msg = check(key);
    // mientras escribe sólo se muestran duplicados; el resto al salir del campo
    setFieldState(key, msg, /ya está participando/.test(msg));
    $('#form-error').textContent = '';
    refreshSubmit();
  });
  input.addEventListener('blur', () => {
    if (current !== 's-form') return;
    const empty = !input.value;
    const msg = check(key);
    // No marcar en rojo campos vacíos que todavía no tocó
    setFieldState(key, msg, !empty || key.startsWith('seguidores'));
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); nextField(input); }
  });
});

function focusField(inp) {
  inp.focus();
  Keyboard.attach(inp);
}

function enabledOrder() {
  return ORDER.filter(k => !fieldOf(k).classList.contains('disabled'));
}
function nextField(input) {
  const keys = enabledOrder();
  const i = keys.findIndex(k => F[k] === input);
  const next = keys[i + 1];
  if (next) focusField(F[next]);
  else {
    input.blur();
    setTimeout(() => $('#consent').scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
  }
}

$('#consent').addEventListener('click', () => {
  consent = !consent;
  $('#consent').classList.toggle('checked', consent);
  $('#consent').classList.remove('invalid');
  $('#consent').setAttribute('aria-pressed', consent);
  refreshSubmit();
});

// Tocar fuera de un campo oculta el teclado
$('#form-scroll').addEventListener('pointerdown', e => {
  if (!e.target.closest('.field')) {
    const a = document.activeElement;
    if (a && a.matches('input[data-kb]')) a.blur();
  }
});

$('#btn-cancel').addEventListener('click', showAttract);

Keyboard.init($('#kb'), {
  onNext: nextField,
  isLast: inp => { const k = enabledOrder(); return F[k[k.length - 1]] === inp; },
  onToggle: (open, h) => {
    $('#s-form').classList.toggle('kb-open', open);
    if (open) {
      $('#s-form').style.setProperty('--kb-h', h + 'px');
      centerFocused(0);
    }
  }
});
// Centra el campo activo en el espacio que deja libre el teclado
function centerFocused(delay) {
  setTimeout(() => {
    const f = document.activeElement && document.activeElement.closest && document.activeElement.closest('.field');
    if (!f) return;
    const sc = $('#form-scroll');
    const free = sc.clientHeight - $('#kb').offsetHeight;
    const r = f.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    sc.scrollTo({ top: sc.scrollTop + (r.top - sr.top) - (free - r.height) / 2, behavior: 'smooth' });
  }, delay);
}
// Al cambiar de campo con el teclado abierto, también centrar
document.addEventListener('focusin', e => {
  if (current === 's-form' && Keyboard.isOpen && e.target.closest('.field')) {
    centerFocused(40);
  }
});

$('#btn-submit').addEventListener('click', submit);

async function submit() {
  const v = values();
  const bad = ORDER.filter(k => check(k, v));
  if (bad.length || !consent) {
    bad.forEach(k => {
      setFieldState(k, check(k, v), true);
      const f = fieldOf(k);
      f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
    });
    if (!consent) {
      const c = $('#consent');
      c.classList.add('invalid');
      c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
    }
    $('#form-error').textContent = bad.length ? fieldOf(bad[0]).querySelector('.field-msg').textContent
                                              : 'Falta aceptar las condiciones del sorteo';
    return;
  }

  const btn = $('#btn-submit');
  btn.classList.add('busy');
  btn.textContent = 'Guardando…';
  Keyboard.hide();

  const now = new Date();
  const p = {
    id: uid(),
    fecha: now.toISOString(),
    fechaLocal: now.toLocaleString('es-AR'),
    nombre: v.nombre.replace(/\s+/g, ' '),
    email: v.email,
    instagram: v.instagram,
    seguidoresInstagram: v.instagram ? digits(v.seguidoresInstagram) || 0 : 0,
    tiktok: v.tiktok,
    seguidoresTiktok: v.tiktok ? digits(v.seguidoresTiktok) || 0 : 0,
    acepta: true,
  };

  const r = await DB.add(p);
  if (!r.ok) {
    btn.classList.remove('busy');
    btn.textContent = '¡Quiero participar!';
    const key = r.duplicate;
    const msg = { email: 'Este mail ya está participando', instagram: 'Este Instagram ya está participando', tiktok: 'Este TikTok ya está participando' }[key] || 'No se pudo guardar';
    if (F[key]) setFieldState(key, msg, true);
    $('#form-error').textContent = msg;
    refreshSubmit();
    return;
  }
  showJarConfirm(r.participant);
}

// Espacio libre para el frasco: entre el texto de arriba y los botones de abajo
function jarArea() {
  const panel = jarMode === 'draw' ? $('#jar-draw') : $('#jar-confirm');
  const spacer = panel.querySelector('.jar-spacer');
  const r = spacer.getBoundingClientRect();
  if (r.height > 0) return { top: r.top, bottom: r.bottom };
  return { top: $('#topbar').getBoundingClientRect().bottom, bottom: innerHeight };
}

// ============================================================
// FRASCO — confirmación
// ============================================================
let jarMode = null;   // 'confirm' | 'draw'
let jarRemain = 0;

async function showJarConfirm(p) {
  clearTimers();
  jarMode = 'confirm';
  hideWinner();
  $('#jar-confirm').style.display = '';
  $('#jar-draw').style.display = 'none';
  $('#btn-draw-link').style.display = '';
  $('#jar-title').textContent = `${firstName(p.nombre)}, ya estás participando`;
  const n = DB.participants.length;
  $('#jar-count-n').textContent = fmtNum(n);
  $('#jar-count-lbl').textContent = n === 1 ? 'creador en el frasco' : 'creadores en el frasco';
  goTo('s-jar');
  await fontsReady;
  Jar.open({ items: jarItems(), newId: p.id, area: jarArea });
  startJarCountdown();
}

function startJarCountdown() {
  jarRemain = cfg.jarSecs;
  const fill = $('#jar-cd-fill'), lbl = $('#jar-cd-lbl');
  const tick = () => {
    fill.style.width = (jarRemain / cfg.jarSecs * 100) + '%';
    lbl.textContent = `Volviendo al inicio en ${Math.ceil(jarRemain)} s`;
  };
  tick();
  clearInterval(jarCdI);
  jarCdI = setInterval(() => {
    jarRemain -= 0.25;
    tick();
    if (jarRemain <= 0) { clearInterval(jarCdI); showAttract(); }
  }, 250);
}

$('#btn-shake').addEventListener('click', () => Jar.shake(1300));
$('#btn-done').addEventListener('click', showAttract);
$('#btn-draw-link').addEventListener('click', () => askPin('Clave para sortear', enterDraw));

// ============================================================
// SORTEO
// ============================================================
let excludeWinners = true;
let drawing = false;

function winnerIds() { return new Set(DB.draws.map(d => d.participanteId)); }
function drawPool() {
  const w = winnerIds();
  return DB.participants.filter(p => !excludeWinners || !w.has(p.id));
}
function updateDrawCount() {
  const n = drawPool().length;
  $('#draw-count-n').textContent = fmtNum(n);
  $('#draw-count-lbl').textContent = n === 1 ? 'participante en el sorteo' : 'participantes en el sorteo';
  $('#draw-exclude').style.display = DB.draws.length ? '' : 'none';
}

async function enterDraw() {
  clearTimers();
  video.pause();
  Keyboard.hide();
  jarMode = 'draw';
  hideWinner();
  $('#jar-confirm').style.display = 'none';
  $('#jar-draw').style.display = '';
  $('#btn-draw-link').style.display = 'none';
  setDrawBusy(false);
  updateDrawCount();
  goTo('s-jar');
  await fontsReady;
  Jar.open({ items: jarItems(), area: jarArea });
}

$('#draw-exclude').addEventListener('click', () => {
  excludeWinners = !excludeWinners;
  $('#draw-exclude').classList.toggle('on', excludeWinners);
  updateDrawCount();
});

function setDrawBusy(b) {
  const btn = $('#btn-run-draw');
  btn.disabled = b;
  btn.textContent = b ? 'Sorteando…' : '¡Sortear!';
  btn.classList.toggle('pulsing', !b);
  $('#btn-exit-draw').disabled = b;
}

async function runDraw(isSub) {
  if (drawing) return;
  const pool = drawPool();
  if (!pool.length) { toast('No hay participantes para sortear'); return; }
  drawing = true;
  setDrawBusy(true);
  Jar.shake(3000, 1.25);
  await sleep(3500);
  const w = pool[secureRandomInt(pool.length)];
  await Jar.extract({ id: w.id, label: labelFor(w), p: w });
  await sleep(250);
  const now = new Date();
  const d = {
    id: uid(),
    fecha: now.toISOString(),
    fechaLocal: now.toLocaleString('es-AR'),
    participanteId: w.id,
    nombre: w.nombre, email: w.email,
    instagram: w.instagram, tiktok: w.tiktok,
    participantes: pool.length,
    tipo: isSub ? 'Suplente' : 'Ganador/a',
  };
  DB.addDraw(d);
  showWinner(w, d);
  drawing = false;
  setDrawBusy(false);
  updateDrawCount();
}

$('#btn-run-draw').addEventListener('click', () => runDraw(false));
$('#btn-exit-draw').addEventListener('click', showAttract);
$('#btn-redraw').addEventListener('click', async () => {
  hideWinner();
  Jar.returnFloating();
  await sleep(900);
  runDraw(true);
});
$('#btn-winner-close').addEventListener('click', () => { hideWinner(); Jar.returnFloating(); });

function showWinner(w, d) {
  $('#winner-eyebrow').textContent = d.tipo === 'Suplente' ? 'Suplente' : '¡Felicitaciones!';
  const nameEl = $('#winner-name');
  nameEl.textContent = '';
  nameEl.setAttribute('aria-label', w.nombre);
  // letras animadas, agrupadas por palabra para que no se corten al saltar de línea
  let i = 0;
  w.nombre.trim().split(/\s+/).forEach((word, wi) => {
    if (wi) nameEl.appendChild(document.createTextNode(' '));
    const wEl = document.createElement('span');
    wEl.style.whiteSpace = 'nowrap';
    [...word].forEach(ch => {
      const s = document.createElement('span');
      s.className = 'pop-char';
      s.textContent = ch;
      s.style.animationDelay = (300 + i++ * 35) + 'ms';
      wEl.appendChild(s);
    });
    nameEl.appendChild(wEl);
  });
  // nombres largos: achicar para que la palabra más larga entre en la tarjeta
  const longest = Math.max(...w.nombre.trim().split(/\s+/).map(s => s.length));
  nameEl.style.fontSize = longest > 9 ? `min(${(78 / (longest * 0.62)).toFixed(2)}vw, 10vh)` : '';
  const hs = $('#winner-handles');
  hs.innerHTML = '';
  [[w.instagram, 'IG'], [w.tiktok, 'TikTok']].forEach(([h, net]) => {
    if (!h) return;
    const s = document.createElement('span');
    s.textContent = `${net} @${h}`;
    hs.appendChild(s);
  });
  $('#winner-meta').textContent = `Sorteado entre ${fmtNum(d.participantes)} participantes · ${d.fechaLocal}`;
  $('#winner-layer').classList.add('show');
  sparks();
}
function hideWinner() { $('#winner-layer').classList.remove('show'); $('#prize-fx').innerHTML = ''; }

function sparks() {
  const fx = $('#prize-fx');
  fx.innerHTML = '';
  const colors = ['var(--navy)', 'var(--yellow)', 'var(--rose)', 'var(--lilac)'];
  for (let i = 0; i < 28; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.style.setProperty('--r', (360 / 28 * i + Math.random() * 10 - 5) + 'deg');
    s.style.setProperty('--dist', -(260 + Math.random() * 220) + 'px');
    s.style.setProperty('--d', (Math.random() * 180) + 'ms');
    s.style.setProperty('--c', colors[i % colors.length]);
    if (Math.random() < 0.35) { s.style.setProperty('--w', '12px'); s.style.setProperty('--h', '12px'); s.style.borderRadius = '50%'; }
    fx.appendChild(s);
  }
}

// ============================================================
// CLAVE
// ============================================================
let pinCb = null, pinVal = '';
function askPin(title, cb) {
  pinCb = cb; pinVal = '';
  $('#pin-title').textContent = title;
  renderPin();
  $('#pin-layer').classList.add('show');
}
function renderPin() { $$('#pin-dots i').forEach((d, i) => d.classList.toggle('on', i < pinVal.length)); }
function closePin() { $('#pin-layer').classList.remove('show'); pinVal = ''; }
$('#pin-pad').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset.d;
  if (d === 'cancel') return closePin();
  if (d === 'back') pinVal = pinVal.slice(0, -1);
  else if (pinVal.length < 4) pinVal += d;
  renderPin();
  if (pinVal.length === 4) {
    if (pinVal === PASSWORD) {
      const cb = pinCb;
      setTimeout(() => { closePin(); cb && cb(); }, 150);
    } else {
      const c = $('#pin-card');
      c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
      setTimeout(() => { pinVal = ''; renderPin(); }, 350);
    }
  }
});
$('#pin-layer').addEventListener('click', e => { if (e.target.id === 'pin-layer') closePin(); });
document.addEventListener('keydown', e => {
  if (!$('#pin-layer').classList.contains('show')) return;
  if (/^\d$/.test(e.key)) $(`#pin-pad [data-d="${e.key}"]`).click();
  if (e.key === 'Backspace') $('#pin-pad [data-d="back"]').click();
  if (e.key === 'Escape') closePin();
});

// ============================================================
// ADMIN
// ============================================================
let adminTaps = 0, adminTapT;
$('#admin-trigger').addEventListener('click', e => {
  e.stopPropagation();
  adminTaps++;
  clearTimeout(adminTapT);
  adminTapT = setTimeout(() => { adminTaps = 0; }, 900);
  if (adminTaps >= 3) { adminTaps = 0; askPin('Panel de control', openAdmin); }
});
// Atajo con teclado físico: Ctrl + Shift + A
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); askPin('Panel de control', openAdmin); }
});

function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function bumpAdminIdle() {
  clearTimeout(adminIdleT);
  adminIdleT = setTimeout(() => { if (current === 's-admin') showAttract(); }, 5 * 60 * 1000);
}

async function openAdmin() {
  clearTimers();
  Jar.stop();
  video.pause();
  Keyboard.hide();
  goTo('s-admin');
  renderAdmin();
  fillCfg();
  bumpAdminIdle();
  await DB.sync();
  renderAdmin();
}

function renderAdmin() {
  const list = [...DB.participants].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  $('#admin-count').textContent = `Inscriptos: ${fmtNum(list.length)}`;

  const st = $('#admin-status');
  const pend = list.filter(p => DB.isPending(p.id)).length;
  if (DB.online) {
    st.className = 'admin-status ok';
    st.innerHTML = `✓ Guardando en disco. Carpeta: <code>${esc(DB.dataDir || 'data/')}</code><br>
      Ahí están <b>participantes.csv</b> (abre en Excel), <b>participantes.json</b> y copias por hora en <b>backups/</b>. También queda copia en este navegador.`;
  } else {
    st.className = 'admin-status warn';
    st.innerHTML = `⚠ No se detectó el servidor local: los datos se están guardando <b>sólo en este navegador</b>` +
      (pend ? ` (${pend} sin pasar a disco)` : '') +
      `.<br>Abrí la app con <b>INICIAR.bat</b> para que se guarden en disco, y mientras tanto descargá el Excel seguido.`;
  }

  $('#admin-tbody').innerHTML = list.length ? list.map(p => `
    <tr>
      <td>${esc(p.fechaLocal)}</td>
      <td>${esc(p.nombre)}${DB.isPending(p.id) ? ' <span class="pending">• sin disco</span>' : ''}</td>
      <td>${esc(p.email)}</td>
      <td>${p.instagram ? '@' + esc(p.instagram) : '—'}</td>
      <td class="num">${p.instagram ? fmtNum(p.seguidoresInstagram) : '—'}</td>
      <td>${p.tiktok ? '@' + esc(p.tiktok) : '—'}</td>
      <td class="num">${p.tiktok ? fmtNum(p.seguidoresTiktok) : '—'}</td>
      <td><button class="row-del" data-id="${esc(p.id)}" title="Eliminar">✕</button></td>
    </tr>`).join('') : '<tr><td colspan="8" class="admin-empty">Todavía no hay inscriptos</td></tr>';

  const draws = [...DB.draws].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  $('#draws-tbody').innerHTML = draws.length ? draws.map(d => `
    <tr>
      <td>${esc(d.fechaLocal)}</td><td><b>${esc(d.nombre)}</b></td><td>${esc(d.email)}</td>
      <td>${d.instagram ? '@' + esc(d.instagram) : '—'}</td><td>${d.tiktok ? '@' + esc(d.tiktok) : '—'}</td>
      <td>${esc(d.tipo)}</td><td class="num">${fmtNum(d.participantes)}</td>
    </tr>`).join('') : '<tr><td colspan="7" class="admin-empty">Todavía no se hizo ningún sorteo</td></tr>';

}

// Se llena sólo al abrir, para no pisar lo que se está editando
function fillCfg() {
  $('#cfg-phrase').value = cfg.phraseSecs;
  $('#cfg-form-idle').value = cfg.formIdleSecs;
  $('#cfg-jar').value = cfg.jarSecs;
  $('#cfg-sound').checked = cfg.videoSound;
  $('#cfg-label').value = cfg.jarLabel;
}

$('#admin-tbody').addEventListener('click', async e => {
  const b = e.target.closest('.row-del'); if (!b) return;
  const p = DB.participants.find(x => x.id === b.dataset.id);
  if (!p || !confirm(`¿Eliminar a ${p.nombre} (${p.email})?\nQueda registrado en el historial del disco.`)) return;
  const ok = await DB.remove(p.id, PASSWORD);
  if (!ok) toast('No se pudo eliminar: el servidor no responde');
  renderAdmin();
});

$$('.admin-tab').forEach(t => t.addEventListener('click', () => {
  $$('.admin-tab').forEach(x => x.classList.toggle('active', x === t));
  $$('.tab-section').forEach(s => s.classList.toggle('active', s.id === 'tab-' + t.dataset.tab));
  $('#btn-save-cfg').style.display = t.dataset.tab === 'config' ? '' : 'none';
}));

$('#btn-save-cfg').addEventListener('click', () => {
  const n = (id, min, max, def) => Math.min(max, Math.max(min, parseInt($(id).value, 10) || def));
  cfg.phraseSecs = n('#cfg-phrase', 3, 600, CFG_DEFAULTS.phraseSecs);
  cfg.formIdleSecs = n('#cfg-form-idle', 20, 900, CFG_DEFAULTS.formIdleSecs);
  cfg.jarSecs = n('#cfg-jar', 5, 600, CFG_DEFAULTS.jarSecs);
  cfg.videoSound = $('#cfg-sound').checked;
  cfg.jarLabel = $('#cfg-label').value;
  try { localStorage.setItem('mlb_cfg', JSON.stringify(cfg)); } catch {}
  fillCfg();
  toast('Configuración guardada');
});

function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');

function csvCell(v) { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

$('#btn-export-csv').addEventListener('click', () => {
  const list = [...DB.participants].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  if (!list.length) return toast('No hay inscriptos para descargar');
  const head = ['Fecha', 'Nombre', 'Email', 'Instagram', 'Seguidores Instagram', 'TikTok', 'Seguidores TikTok', 'Link Instagram', 'Link TikTok', 'ID'];
  const rows = list.map(p => [
    p.fechaLocal, p.nombre, p.email,
    p.instagram ? '@' + p.instagram : '', p.instagram ? p.seguidoresInstagram : '',
    p.tiktok ? '@' + p.tiktok : '', p.tiktok ? p.seguidoresTiktok : '',
    p.instagram ? 'https://instagram.com/' + p.instagram : '',
    p.tiktok ? 'https://tiktok.com/@' + p.tiktok : '', p.id
  ]);
  download(`inscriptos_${stamp()}.csv`, '﻿' + [head, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
});

$('#btn-export-json').addEventListener('click', () => {
  download(`respaldo_${stamp()}.json`, JSON.stringify({ exportado: new Date().toISOString(), participantes: DB.participants, sorteos: DB.draws }, null, 2), 'application/json');
});

$('#btn-archive').addEventListener('click', async () => {
  if (!confirm('Se va a guardar una copia y vaciar la lista de inscriptos para empezar un evento nuevo.\n¿Continuar?')) return;
  const pw = prompt('Escribí la clave para confirmar');
  if (pw !== PASSWORD) return toast('Clave incorrecta');
  const dir = await DB.archive(pw);
  toast(dir ? 'Listo: la lista anterior quedó archivada' : 'No se pudo archivar: el servidor no responde', 4500);
  renderAdmin();
});

$('#btn-admin-draw').addEventListener('click', enterDraw);
$('#btn-close-admin').addEventListener('click', showAttract);

// ============================================================
// ACTIVIDAD / KIOSCO
// ============================================================
document.addEventListener('pointerdown', () => {
  if (current === 's-form') bumpFormIdle();
  if (current === 's-admin') bumpAdminIdle();
}, true);
document.addEventListener('keydown', () => { if (current === 's-form') bumpFormIdle(); }, true);
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('dragstart', e => e.preventDefault());

DB.onChange(() => {
  if (current === 's-attract') updateAttractCount();
  if (current === 's-admin') renderAdmin();
});

// ============================================================
// INICIO
// ============================================================
// Alto de la barra superior (logo + QR) para dejarle lugar en cada pantalla
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--top-h', $('#topbar').offsetHeight + 'px');
}).observe($('#topbar'));

Jar.init($('#jar-canvas'));
showAttract();
DB.sync().then(() => {
  updateAttractCount();
  // Para probar pantallas: ?pantalla=formulario | frasco | sorteo
  const q = new URLSearchParams(location.search).get('pantalla');
  const lastP = [...DB.participants].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).pop();
  if (q === 'formulario') startForm();
  if (q === 'frasco' && lastP) showJarConfirm(lastP);
  if (q === 'sorteo') enterDraw();
});
