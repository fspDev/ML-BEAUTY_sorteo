// ============================================================
// Teclado en pantalla — pensado para la TV táctil
// Los inputs usan inputmode="none" para que no aparezca el de Windows.
// El teclado físico de la notebook sigue funcionando normalmente.
// ============================================================
const Keyboard = (() => {
  const ICON_BACK  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-7 7 7 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M17 9l-6 6M11 9l6 6"/></svg>';
  const ICON_SHIFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3l9 9h-5v8H8v-8H3z"/></svg>';

  const DIGITS = '1234567890'.split('');
  const Q = 'qwertyuiop'.split('');
  const A = 'asdfghjklñ'.split('');
  const Z = 'zxcvbnm'.split('');

  const LAYOUTS = {
    text: [
      DIGITS, Q, A,
      [{ t: 'shift', cls: 'dark w15' }, ...Z, { t: 'back', cls: 'dark w15' }],
      [{ t: 'accent', label: '´ tilde', cls: 'dark w2 small' }, { t: 'space', label: 'espacio', cls: 'w6' }, '-', { t: 'next', cls: 'go w3' }]
    ],
    email: [
      DIGITS, Q, A,
      [...Z, '_', '-', { t: 'back', cls: 'dark w15' }],
      ['@', '.', { t: 'str', v: '@gmail.com', cls: 'w2 small' }, { t: 'str', v: '@hotmail.com', cls: 'w2 small' }, { t: 'str', v: '.com', cls: 'w15 small' }, { t: 'next', cls: 'go w3' }]
    ],
    handle: [
      DIGITS, Q, A,
      [...Z, { t: 'back', cls: 'dark w15' }],
      ['.', '_', { t: 'next', cls: 'go w3' }]
    ],
    number: [
      ['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'],
      [{ t: 'back', cls: 'dark' }, '0', { t: 'next', cls: 'go' }]
    ]
  };
  const ACCENTS = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' };

  let el, input = null, layout = null, shift = false, accent = false, repeatT, repeatI;
  let onNext = () => {}, onToggle = () => {}, isLast = () => false;

  function init(container, opts = {}) {
    el = container;
    onNext = opts.onNext || onNext;
    onToggle = opts.onToggle || onToggle;
    isLast = opts.isLast || isLast;
    // Nunca robar el foco del input
    el.addEventListener('mousedown', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      const key = e.target.closest('.kb-key, .kb-hide');
      if (!key) return;
      if (key.classList.contains('kb-hide')) { input && input.blur(); return; }
      key.classList.add('pressed');
      setTimeout(() => key.classList.remove('pressed'), 110);
      press(key.dataset);
      if (key.dataset.t === 'back') {
        clearTimeout(repeatT); clearInterval(repeatI);
        repeatT = setTimeout(() => { repeatI = setInterval(() => press(key.dataset), 65); }, 420);
      }
    });
    const stop = () => { clearTimeout(repeatT); clearInterval(repeatI); };
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, stop));

    document.addEventListener('focusin', e => {
      const t = e.target;
      if (t.matches && t.matches('input[data-kb]')) attach(t);
    });
    document.addEventListener('focusout', () => {
      setTimeout(() => {
        const a = document.activeElement;
        if (!a || !a.matches || !a.matches('input[data-kb]')) hide();
      }, 60);
    });
  }

  function attach(inp) {
    if (input === inp && el.classList.contains('open')) return;
    mark(inp);
    input = inp;
    const name = inp.dataset.kb;
    accent = false;
    shift = name === 'text' && autoShift();
    if (layout !== name) { layout = name; render(); } else refreshCase();
    el.classList.toggle('numeric', name === 'number');
    refreshNext();
    if (!el.classList.contains('open')) {
      el.classList.add('open');
      onToggle(true, el.offsetHeight);
    }
  }

  // Marca visual del campo activo (no depende del foco de la ventana)
  function mark(inp) {
    document.querySelectorAll('.field.is-focused').forEach(f => f.classList.remove('is-focused'));
    const f = inp && inp.closest('.field');
    if (f) f.classList.add('is-focused');
  }

  function refreshNext() {
    const nextKey = el.querySelector('[data-t="next"]');
    if (nextKey && input) nextKey.textContent = isLast(input) ? 'Listo' : 'Siguiente';
  }

  function hide() {
    if (!el.classList.contains('open')) return;
    el.classList.remove('open');
    mark(null);
    input = null;
    onToggle(false, 0);
  }

  function render() {
    const rows = LAYOUTS[layout];
    el.innerHTML = '<button class="kb-hide" tabindex="-1">Ocultar teclado ▾</button>' + rows.map(row =>
      '<div class="kb-row">' + row.map(k => {
        if (typeof k === 'string') return `<button class="kb-key" tabindex="-1" data-t="char" data-v="${k}">${k}</button>`;
        let label = k.label || k.v || '';
        if (k.t === 'back') label = ICON_BACK;
        if (k.t === 'shift') label = ICON_SHIFT;
        if (k.t === 'next') label = 'Siguiente';
        return `<button class="kb-key ${k.cls || ''}" tabindex="-1" data-t="${k.t}" data-v="${k.v || ''}">${label}</button>`;
      }).join('') + '</div>'
    ).join('');
    refreshCase();
  }

  function refreshCase() {
    el.querySelectorAll('[data-t="char"]').forEach(b => {
      const v = b.dataset.v;
      b.textContent = shift && layout === 'text' ? v.toUpperCase() : v;
    });
    const s = el.querySelector('[data-t="shift"]');
    if (s) s.classList.toggle('on', shift);
    const a = el.querySelector('[data-t="accent"]');
    if (a) a.classList.toggle('on', accent);
  }

  // Mayúscula automática al empezar cada palabra del nombre
  function autoShift() {
    if (!input) return false;
    const pos = input.selectionStart ?? input.value.length;
    return pos === 0 || /\s$/.test(input.value.slice(0, pos));
  }

  function insert(text) {
    const s = input.selectionStart ?? input.value.length;
    const e = input.selectionEnd ?? input.value.length;
    const max = parseInt(input.getAttribute('maxlength'), 10) || 999;
    if (input.value.length - (e - s) + text.length > max) return;
    input.setRangeText(text, s, e, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function backspace() {
    const s = input.selectionStart ?? input.value.length;
    const e = input.selectionEnd ?? input.value.length;
    if (s !== e) input.setRangeText('', s, e, 'end');
    else if (s > 0) input.setRangeText('', s - 1, s, 'end');
    else return;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function press(d) {
    if (!input) return;
    switch (d.t) {
      case 'char': {
        let c = shift && layout === 'text' ? d.v.toUpperCase() : d.v;
        if (accent && ACCENTS[c]) c = ACCENTS[c];
        accent = false;
        insert(c);
        break;
      }
      case 'str':   insert(d.v); break;
      case 'space': insert(' '); break;
      case 'back':  backspace(); break;
      case 'shift': shift = !shift; refreshCase(); return;
      case 'accent': accent = !accent; refreshCase(); return;
      case 'next':  onNext(input); return;
    }
    if (layout === 'text') { shift = autoShift(); }
    refreshCase();
  }

  return { init, hide, attach, refreshNext, get isOpen() { return el && el.classList.contains('open'); } };
})();
