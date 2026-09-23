// ============================================================
// DB — doble guardado: disco (servidor local) + navegador
// Si el servidor no responde, guarda en el navegador y
// sincroniza solo cuando vuelve.
// ============================================================
const DB = (() => {
  const K_PARTS = 'mlb_participants';
  const K_DRAWS = 'mlb_draws';
  const K_PENDING = 'mlb_pending';   // ids que todavía no llegaron al disco

  let participants = load(K_PARTS, []);
  let draws        = load(K_DRAWS, []);
  let pending      = new Set(load(K_PENDING, []));
  let online       = false;
  let dataDir      = '';
  const listeners  = [];

  function load(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } }
  function save() {
    try {
      localStorage.setItem(K_PARTS, JSON.stringify(participants));
      localStorage.setItem(K_DRAWS, JSON.stringify(draws));
      localStorage.setItem(K_PENDING, JSON.stringify([...pending]));
    } catch (e) { console.warn('localStorage no disponible', e); }
  }
  function emit() { listeners.forEach(fn => fn()); }

  async function api(path, opts = {}, ms = 4000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(path, {
        ...opts,
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' }
      });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    } finally { clearTimeout(t); }
  }

  const norm = s => String(s || '').trim().toLowerCase();

  function findDuplicate(p) {
    for (const q of participants) {
      if (p.email && norm(q.email) === norm(p.email)) return 'email';
      if (p.instagram && norm(q.instagram) === norm(p.instagram)) return 'instagram';
      if (p.tiktok && norm(q.tiktok) === norm(p.tiktok)) return 'tiktok';
    }
    return null;
  }

  // Une lo del servidor con lo que quedó sólo en el navegador y lo sube
  async function sync() {
    if (location.protocol === 'file:') { online = false; emit(); return; }
    try {
      // Se manda todo lo del navegador: el servidor agrega lo que le falte
      // (así también se recupera si alguien borró la carpeta data/)
      const r = await api('/api/sync', { method: 'POST', body: JSON.stringify({ participants, draws }) }, 8000);
      if (r.status !== 200) throw new Error('sync ' + r.status);
      const srvIds = new Set(r.body.participants.map(p => p.id));
      // Lo que el servidor rechazó por duplicado se guarda aparte, nunca se pierde
      const rejected = participants.filter(p => !srvIds.has(p.id));
      if (rejected.length) {
        const prev = load('mlb_rejected', []);
        try { localStorage.setItem('mlb_rejected', JSON.stringify([...prev, ...rejected])); } catch {}
      }
      participants = r.body.participants;
      draws = r.body.draws;
      pending.clear();
      if (!online) {
        const h = await api('/api/health').catch(() => null);
        dataDir = h?.body?.dataDir || '';
      }
      online = true;
    } catch {
      online = false;
    }
    save();
    emit();
  }

  async function add(p) {
    const dup = findDuplicate(p);
    if (dup) return { ok: false, duplicate: dup };

    if (location.protocol !== 'file:') {
      try {
        const r = await api('/api/participants', { method: 'POST', body: JSON.stringify(p) });
        if (r.status === 409) { await sync(); return { ok: false, duplicate: r.body.field }; }
        if (r.status === 200 || r.status === 201) {
          online = true;
          participants.push(r.body.participant || p);
          save(); emit();
          return { ok: true, participant: r.body.participant || p };
        }
      } catch { /* sin servidor: se guarda en el navegador */ }
    }
    online = false;
    participants.push(p);
    pending.add(p.id);
    save(); emit();
    return { ok: true, participant: p, offline: true };
  }

  async function addDraw(d) {
    draws.push(d);
    pending.add(d.id);
    save(); emit();
    try {
      const r = await api('/api/draws', { method: 'POST', body: JSON.stringify(d) });
      if (r.status === 201) { pending.delete(d.id); save(); }
    } catch {}
  }

  async function remove(id, password) {
    if (location.protocol !== 'file:') try {
      const r = await api('/api/delete', { method: 'POST', body: JSON.stringify({ id, password }) });
      if (r.status !== 200) throw 0;
    } catch { if (location.protocol !== 'file:') return false; }
    participants = participants.filter(p => p.id !== id);
    pending.delete(id);
    save(); emit();
    return true;
  }

  async function archive(password) {
    if (online) {
      const r = await api('/api/archive', { method: 'POST', body: JSON.stringify({ password }) }).catch(() => null);
      if (!r || r.status !== 200) return null;
      participants = []; draws = []; pending.clear();
      save(); emit();
      return r.body.dir;
    }
    // Sin servidor: guardar copia en el navegador antes de vaciar
    try { localStorage.setItem('mlb_archive_' + Date.now(), JSON.stringify({ participants, draws })); } catch {}
    participants = []; draws = []; pending.clear();
    save(); emit();
    return 'navegador';
  }

  // Reintento automático cada 20 s
  setInterval(() => { if (!online || pending.size) sync(); }, 20000);

  return {
    sync, add, addDraw, remove, archive, findDuplicate,
    get participants() { return participants; },
    get draws() { return draws; },
    get online() { return online; },
    get dataDir() { return dataDir; },
    isPending: id => pending.has(id),
    onChange: fn => listeners.push(fn)
  };
})();
