// ============================================================
// Servidor local — Sorteo Creadores Beauty
// Sin dependencias: sólo Node. Sirve la app y guarda los
// inscriptos en disco (carpeta data/) para no depender del navegador.
// ============================================================
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT     = 3602;
const ROOT     = __dirname;
const DATA     = path.join(ROOT, 'data');
const BACKUPS  = path.join(DATA, 'backups');
const F_JSON   = path.join(DATA, 'participantes.json');
const F_CSV    = path.join(DATA, 'participantes.csv');
const F_LOG    = path.join(DATA, 'registro.log.jsonl');   // append-only, nunca se reescribe
const F_DRAWS  = path.join(DATA, 'sorteos.json');
const PASSWORD = '3602';

fs.mkdirSync(BACKUPS, { recursive: true });

// ── Carga inicial ────────────────────────────────────────────
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
let participants = readJSON(F_JSON, []);
let draws        = readJSON(F_DRAWS, []);

// Si el JSON principal se perdió o corrompió, reconstruir desde el log
if (!participants.length && fs.existsSync(F_LOG)) {
  const byId = new Map();
  fs.readFileSync(F_LOG, 'utf8').split('\n').filter(Boolean).forEach(line => {
    try {
      const ev = JSON.parse(line);
      if (ev.type === 'add') byId.set(ev.data.id, ev.data);
      if (ev.type === 'del') byId.delete(ev.id);
      if (ev.type === 'archive') byId.clear();
    } catch {}
  });
  participants = [...byId.values()];
  if (participants.length) console.log(`Recuperados ${participants.length} inscriptos desde el log.`);
}

// ── Persistencia ─────────────────────────────────────────────
function writeAtomic(file, content) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCSV(list) {
  // Separador ";" para que Excel en español lo abra en columnas
  const head = ['Fecha', 'Nombre', 'Email', 'Instagram', 'Seguidores Instagram',
                'TikTok', 'Seguidores TikTok', 'Link Instagram', 'Link TikTok',
                'Acepta ByC y DDP', 'Fecha consentimiento', 'Fecha consentimiento (UTC)', 'Texto aceptado', 'Versión ByC', 'ID'];
  const rows = list.map(p => [
    p.fechaLocal, p.nombre, p.email,
    p.instagram ? '@' + p.instagram : '', p.instagram ? p.seguidoresInstagram : '',
    p.tiktok ? '@' + p.tiktok : '', p.tiktok ? p.seguidoresTiktok : '',
    p.instagram ? 'https://instagram.com/' + p.instagram : '',
    p.tiktok ? 'https://tiktok.com/@' + p.tiktok : '',
    p.acepta ? 'SI' : 'NO', p.consentimientoFechaLocal, p.consentimientoFecha, p.consentimientoTexto, p.consentimientoVersion,
    p.id
  ]);
  return '﻿' + [head, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n');
}

function persist() {
  const json = JSON.stringify(participants, null, 2);
  writeAtomic(F_JSON, json);
  try { writeAtomic(F_CSV, toCSV(participants)); }
  catch (e) { console.warn('No se pudo escribir el CSV (¿abierto en Excel?):', e.code); }
  // Una copia de seguridad por hora (se pisa dentro de la misma hora)
  const stamp = new Date().toISOString().slice(0, 13).replace('T', '_');
  fs.writeFileSync(path.join(BACKUPS, `participantes_${stamp}hs.json`), json);
}

function log(ev) {
  fs.appendFileSync(F_LOG, JSON.stringify({ ...ev, at: new Date().toISOString() }) + '\n');
}

// ── Validación ───────────────────────────────────────────────
const norm = s => String(s || '').trim().toLowerCase();

function findDuplicate(p) {
  for (const q of participants) {
    if (q.id === p.id) return 'id';
    if (p.email && norm(q.email) === norm(p.email)) return 'email';
    if (p.instagram && norm(q.instagram) === norm(p.instagram)) return 'instagram';
    if (p.tiktok && norm(q.tiktok) === norm(p.tiktok)) return 'tiktok';
  }
  return null;
}

function clean(p) {
  const handle = s => norm(s).replace(/^@/, '').replace(/[^a-z0-9._]/g, '').slice(0, 30);
  const num = v => Math.max(0, Math.min(1e10, parseInt(v, 10) || 0));
  const out = {
    id:                  String(p.id || '').slice(0, 64),
    fecha:               String(p.fecha || new Date().toISOString()),
    fechaLocal:          String(p.fechaLocal || new Date().toLocaleString('es-AR')),
    nombre:              String(p.nombre || '').trim().slice(0, 80),
    email:               norm(p.email).slice(0, 120),
    instagram:           handle(p.instagram),
    seguidoresInstagram: num(p.seguidoresInstagram),
    tiktok:              handle(p.tiktok),
    seguidoresTiktok:    num(p.seguidoresTiktok),
    acepta:              p.acepta === true,
    // Constancia del consentimiento a las Bases y Condiciones y la Declaración de Privacidad
    consentimientoFecha:      String(p.consentimientoFecha || p.fecha || '').slice(0, 40),
    consentimientoFechaLocal: String(p.consentimientoFechaLocal || p.fechaLocal || '').slice(0, 40),
    consentimientoTexto:      String(p.consentimientoTexto || '').slice(0, 500),
    consentimientoVersion:    String(p.consentimientoVersion || '').slice(0, 80)
  };
  // Sin aceptación de las ByC no se guarda la inscripción
  if (!out.acepta) return null;
  if (!out.id || out.nombre.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)
      || (!out.instagram && !out.tiktok)) return null;
  return out;
}

// ── HTTP ─────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',   '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json'
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT) || file.startsWith(DATA)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('No encontrado'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    // Soporte de Range para que el video se pueda reproducir/buscar bien
    if (range && /^bytes=/.test(range)) {
      const [s, e] = range.replace('bytes=', '').split('-');
      const start = parseInt(s, 10) || 0;
      const end = e ? parseInt(e, 10) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, count: participants.length, dataDir: DATA });

    if (url.pathname === '/api/participants' && req.method === 'GET')
      return send(res, 200, { participants, draws });

    if (url.pathname === '/api/participants' && req.method === 'POST') {
      const p = clean(await readBody(req));
      if (!p) return send(res, 400, { error: 'invalid' });
      const dup = findDuplicate(p);
      if (dup === 'id') return send(res, 200, { ok: true, participant: p });   // reintento del mismo registro
      if (dup) return send(res, 409, { error: 'duplicate', field: dup });
      participants.push(p);
      log({ type: 'add', data: p });
      persist();
      console.log(`+ ${p.nombre} (${participants.length} en total)`);
      return send(res, 201, { ok: true, participant: p });
    }

    // Sincroniza registros que quedaron sólo en el navegador
    if (url.pathname === '/api/sync' && req.method === 'POST') {
      const body = await readBody(req);
      let added = 0;
      for (const raw of body.participants || []) {
        const p = clean(raw);
        if (p && !findDuplicate(p)) { participants.push(p); log({ type: 'add', data: p }); added++; }
      }
      for (const d of body.draws || []) {
        if (d && d.id && !draws.some(x => x.id === d.id)) { draws.push(d); added++; }
      }
      if (added) { persist(); writeAtomic(F_DRAWS, JSON.stringify(draws, null, 2)); }
      return send(res, 200, { ok: true, added, participants, draws });
    }

    if (url.pathname === '/api/draws' && req.method === 'POST') {
      const d = await readBody(req);
      if (!d.id) return send(res, 400, { error: 'invalid' });
      if (!draws.some(x => x.id === d.id)) draws.push(d);
      writeAtomic(F_DRAWS, JSON.stringify(draws, null, 2));
      log({ type: 'draw', data: d });
      return send(res, 201, { ok: true });
    }

    if (url.pathname === '/api/delete' && req.method === 'POST') {
      const { id, password } = await readBody(req);
      if (password !== PASSWORD) return send(res, 403, { error: 'password' });
      const before = participants.length;
      participants = participants.filter(p => p.id !== id);
      if (participants.length !== before) { log({ type: 'del', id }); persist(); }
      return send(res, 200, { ok: true });
    }

    // "Borrar todo" nunca destruye datos: archiva los archivos actuales
    if (url.pathname === '/api/archive' && req.method === 'POST') {
      const { password } = await readBody(req);
      if (password !== PASSWORD) return send(res, 403, { error: 'password' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dir = path.join(DATA, 'archivado_' + stamp);
      fs.mkdirSync(dir, { recursive: true });
      for (const f of [F_JSON, F_CSV, F_DRAWS]) if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dir, path.basename(f)));
      participants = []; draws = [];
      log({ type: 'archive', dir });
      persist(); writeAtomic(F_DRAWS, '[]');
      return send(res, 200, { ok: true, dir });
    }

    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' });
    serveStatic(req, res);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  Sorteo Creadores Beauty — servidor activo');
  console.log(`  App:    http://localhost:${PORT}`);
  console.log(`  Datos:  ${DATA}`);
  console.log(`  Inscriptos cargados: ${participants.length}`);
  console.log('');
  console.log('  NO cierres esta ventana mientras dure el evento.');
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.log(`El servidor ya estaba corriendo en el puerto ${PORT}.`);
  else console.error(e);
});
