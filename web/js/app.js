(function () {
  'use strict';
  const L = window.LZW;
  const I = window.I18n;
  const t = I.t;
  const $ = id => document.getElementById(id);
  const MAX_LEN = 3000;

  const el = {
    text: $('text'), lang: $('lang'), message: $('message'),
    prev: $('prev'), next: $('next'), all: $('all'), undo: $('undo'), reveal: $('reveal'), auto: $('auto'), reset: $('reset'),
    codeBox: $('codeBox'), codeIn: $('codeIn'), textrow: $('textrow'), dict: $('dict'), log: $('log'),
    results: $('results'), binary: $('binary'), codes: $('codes'), stats: $('stats'),
    decForm: $('decForm'), decIn: $('decIn'), decOut: $('decOut'),
  };

  const EXAMPLES = [
    'TOBEORNOTTOBE',
    'TOBEORNOTTOBE'.repeat(5),
    'TOBEORNOTTOBE'.repeat(20),
    'ABABABABABABABAB',
    'AAAAAAAAAAAAAAAA',
    'ABRAKADABRA',
    'Fischers Fritz fischt frische Fische',
    'Zwölf Boxkämpfer jagen Viktor quer über den großen Sylter Deich. Falsches Üben von Xylophonmusik quält jeden größeren Zwerg. Franz jagt im komplett verwahrlosten Taxi quer durch Bayern.',
  ];

  const state = {
    mode: 'show',
    enc: null,      // Ergebnis von L.encode (Referenzloesung)
    k: 0,           // Anzahl abgeschlossener Schritte
    phase: 'prefix', // Bau-Modus: prefix -> code -> entry
    msg: null,      // {key, params, kind}
    revealed: false,
    decoded: null,  // {codes} nach Klick auf Decodieren
  };

  const lab = s => s.replace(/ /g, '␣').replace(/\t/g, '⇥').replace(/\n/g, '↵');
  const total = () => state.enc.steps.length;
  const complete = () => state.enc && state.k === total();
  const fmtPercent = p => (Math.round(p * 10) / 10).toString();

  function mk(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function setMsg(key, params, kind) { state.msg = { key, params, kind: kind || '' }; }

  function startMsg() { setMsg(state.mode === 'build' ? 'hintBuildStart' : 'hintShowStart'); }

  function reset() {
    state.k = 0;
    state.phase = 'prefix';
    state.revealed = false;
    state.decoded = null;
    el.decOut.replaceChildren();
    if (state.enc) startMsg();
  }

  function setText() {
    const text = el.text.value;
    if (!text) { state.enc = null; setMsg('hintEmpty'); }
    else if (Array.from(text).length > MAX_LEN) { state.enc = null; setMsg('errTooLong', { n: MAX_LEN }, 'error'); }
    else { state.enc = L.encode(text); }
    reset();
    render();
  }

  function stepMsg(i) {
    const s = state.enc.steps[i];
    const base = s.entry
      ? { key: 'stepInfo', params: { i: i + 1, prefix: lab(s.prefix), code: s.code, entry: lab(s.entry.str), ecode: s.entry.code } }
      : { key: 'stepInfoLast', params: { i: i + 1, prefix: lab(s.prefix), code: s.code } };
    setMsg(base.key, base.params, 'ok');
  }

  // ---- Anzeigen-Modus ----
  function showNext() { if (state.k < total()) { state.k++; stepMsg(state.k - 1); render(); } }
  function showPrev() {
    if (state.k === 0) return;
    state.k--; state.revealed = false; state.decoded = null;
    if (state.k > 0) stepMsg(state.k - 1); else startMsg();
    render();
  }
  function showAll() { state.k = total(); setMsg('allDone', { n: total() }, 'ok'); render(); }

  // ---- Bau-Modus ----
  function currentStep() { return state.enc.steps[state.k]; }

  function onPick(j) {
    if (state.mode !== 'build' || !state.enc || complete()) return;
    const step = currentStep();
    if (state.phase === 'prefix') {
      if (j < step.start) return;
      const cand = state.enc.arr.slice(step.start, j + 1).join('');
      const len = j + 1 - step.start;
      if (len > step.len || !L.dictAt(state.enc.alphabet, state.enc.steps, state.k).includes(cand)) {
        setMsg('errNotInDict', { s: lab(cand) }, 'error');
      } else if (len < step.len) {
        setMsg('errNotLongest', { s: lab(cand) }, 'error');
      } else {
        state.phase = 'code';
        setMsg('buildPrefixOk', { prefix: lab(step.prefix) }, 'ok');
      }
    } else if (state.phase === 'entry') {
      if (j === step.start + step.len) {
        state.k++; state.phase = 'prefix';
        setMsg('buildEntryOk', { entry: lab(step.entry.str), ecode: step.entry.code }, 'ok');
      } else {
        setMsg('errNext', null, 'error');
      }
    }
    render();
  }

  function onCodeSubmit(ev) {
    ev.preventDefault();
    if (state.mode !== 'build' || state.phase !== 'code' || !state.enc) return;
    const v = el.codeIn.value.trim();
    const step = currentStep();
    if (!/^\d+$/.test(v)) { setMsg('errCodeFormat', null, 'error'); }
    else if (Number(v) !== step.code) { setMsg('errCode', { prefix: lab(step.prefix) }, 'error'); }
    else if (step.entry) { state.phase = 'entry'; setMsg('buildCodeOk', { code: step.code }, 'ok'); }
    else { state.k++; state.phase = 'prefix'; setMsg('buildLast', { code: step.code }, 'ok'); }
    el.codeIn.value = '';
    render();
  }

  function autoComplete() {
    if (state.mode !== 'build' || !state.enc || complete()) return;
    state.k = total();
    state.phase = 'prefix';
    setMsg('allDone', { n: total() }, 'ok');
    render();
  }

  function undo() {
    if (state.mode !== 'build') return;
    if (state.phase === 'entry') state.phase = 'code';
    else if (state.phase === 'code') state.phase = 'prefix';
    else if (state.k > 0) { state.k--; state.revealed = false; state.decoded = null; }
    else return;
    startMsg();
    render();
  }

  // ---- Darstellung ----
  function cell(cls, chars, out) {
    const c = mk('span', 'cell ' + cls);
    c.appendChild(mk('span', 'chs', lab(chars)));
    if (out !== undefined) c.appendChild(mk('span', 'out', String(out)));
    return c;
  }

  function renderTextRow() {
    const row = el.textrow;
    row.replaceChildren();
    if (!state.enc) return;
    const { arr, steps } = state.enc;
    const build = state.mode === 'build';
    for (let i = 0; i < state.k; i++) {
      row.appendChild(cell('c' + (i % 2), steps[i].prefix, steps[i].code));
    }
    if (complete()) return;
    const step = steps[state.k];
    let j = step.start;
    if (build && state.phase !== 'prefix') {
      row.appendChild(cell('sel', step.prefix, state.phase === 'entry' ? step.code : '?'));
      j += step.len;
    }
    const spans = [];
    for (; j < arr.length; j++) {
      const c = cell('ch', arr[j]);
      c.dataset.j = j;
      if (j === step.start) c.classList.add('start');
      if (build && state.phase === 'prefix') c.classList.add('pick');
      if (build && state.phase === 'entry' && j === step.start + step.len) c.classList.add('nextch');
      if (build && state.phase !== 'code') { const idx = j; c.addEventListener('click', () => onPick(idx)); }
      spans.push(c);
      row.appendChild(c);
    }
    if (build && state.phase === 'prefix') {
      spans.forEach(c => {
        c.addEventListener('mouseenter', () => {
          const to = Number(c.dataset.j);
          spans.forEach(s => s.classList.toggle('hov', Number(s.dataset.j) <= to));
        });
      });
      row.onmouseleave = () => spans.forEach(s => s.classList.remove('hov'));
    }
  }

  function renderDict() {
    const { alphabet, steps } = state.enc || { alphabet: [], steps: [] };
    const d = L.dictAt(alphabet, steps, state.k);
    const table = document.createElement('table');
    const head = mk('tr');
    head.append(mk('th', '', t('dictNr')), mk('th', '', t('dictStr')));
    table.appendChild(head);
    const newest = state.k > 0 && steps[state.k - 1].entry ? d.length - 1 : -1;
    d.forEach((s, i) => {
      const tr = mk('tr', i === newest ? 'new' : '');
      tr.append(mk('td', 'mono', i), mk('td', 'mono', lab(s)));
      table.appendChild(tr);
    });
    el.dict.replaceChildren(table);
    if (state.k > 0) el.dict.scrollTop = el.dict.scrollHeight;
  }

  function renderLog() {
    if (!state.enc) { el.log.replaceChildren(); return; }
    const { steps } = state.enc;
    const table = document.createElement('table');
    const head = mk('tr');
    ['logStep', 'logPrefix', 'logOut', 'logEntry'].forEach(k => head.appendChild(mk('th', '', t(k))));
    table.appendChild(head);
    const addRow = (i, s, cls, partial) => {
      const tr = mk('tr', cls);
      const entry = s.entry ? `${s.entry.code} = ${lab(s.entry.str)}` : '–';
      tr.append(mk('td', '', i + 1), mk('td', 'mono', lab(s.prefix)),
        mk('td', 'mono', partial === 'prefix' ? '…' : s.code),
        mk('td', 'mono', partial ? '…' : entry));
      table.appendChild(tr);
    };
    for (let i = 0; i < state.k; i++) addRow(i, steps[i], i === state.k - 1 ? 'new' : '');
    if (state.mode === 'build' && !complete() && state.phase !== 'prefix') {
      addRow(state.k, steps[state.k], 'partial', state.phase === 'code' ? 'prefix' : 'entry');
    }
    el.log.replaceChildren(table);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function renderResults() {
    const show = complete() && state.revealed;
    el.results.hidden = !show;
    if (!show) return;
    const { enc } = state;
    const st = L.stats(enc, enc.arr.length);
    if (el.binary.checked) {
      el.codes.textContent = enc.codes.map((c, i) => c.toString(2).padStart(st.widths[i], '0')).join(' ');
    } else {
      el.codes.textContent = enc.codes.join(' ');
    }
    el.stats.replaceChildren(
      mk('li', '', t('statCodes', { n: st.count })),
      mk('li', '', t('statDict', { n: st.dictSize })),
      mk('li', '', t('statBits', { bits: st.bits, raw: st.raw })),
      mk('li', '', t('statSavings', { p: fmtPercent(st.savings) })),
    );
    renderDecode();
  }

  function renderDecode() {
    el.decOut.replaceChildren();
    if (!state.decoded) return;
    if (!state.decoded.codes) { el.decOut.appendChild(mk('p', '', t('decInvalid'))); return; }
    const res = L.decode(state.decoded.codes, state.enc.alphabet);
    const table = document.createElement('table');
    const head = mk('tr');
    ['logStep', 'decCode', 'decOut', 'decEntry', 'decNote'].forEach(k => head.appendChild(mk('th', '', t(k))));
    table.appendChild(head);
    for (const r of res.rows) {
      const tr = mk('tr');
      tr.append(mk('td', '', r.index), mk('td', 'mono', r.code), mk('td', 'mono', lab(r.str)),
        mk('td', 'mono', r.entry ? `${r.entry.code} = ${lab(r.entry.str)}` : '–'),
        mk('td', r.special ? 'special' : '', r.special ? t('decSpecial') : ''));
      table.appendChild(tr);
    }
    const wrap = mk('div', 'scroll');
    wrap.appendChild(table);
    el.decOut.appendChild(wrap);
    const out = mk('p', 'result');
    if (res.error) {
      out.textContent = t('decBadCode', { code: res.error.code, i: res.error.index });
    } else {
      const ok = res.text === el.text.value;
      out.textContent = `${t('decResult')} ${lab(res.text)} – ${t(ok ? 'decMatch' : 'decDiff')}`;
    }
    el.decOut.appendChild(out);
  }

  function render() {
    const has = !!state.enc;
    const build = state.mode === 'build';
    const done = complete();
    el.prev.hidden = el.next.hidden = el.all.hidden = build;
    el.undo.hidden = !build;
    el.auto.hidden = !build || done;
    el.prev.disabled = !has || state.k === 0;
    el.next.disabled = !has || done;
    el.all.disabled = !has || done;
    el.undo.disabled = !has || (state.k === 0 && state.phase === 'prefix');
    el.reset.disabled = !has;
    el.reveal.hidden = !(done && !state.revealed);
    el.codeBox.hidden = !(build && has && state.phase === 'code');

    let text = state.msg ? t(state.msg.key, state.msg.params) : '';
    if (done && !state.revealed && !build && state.msg && state.msg.key !== 'buildLast' && state.msg.key !== 'allDone') text += t('doneHint');
    el.message.textContent = text;
    el.message.className = 'message ' + (state.msg ? state.msg.kind : '');

    renderTextRow();
    renderDict();
    renderLog();
    renderResults();
    if (build && has && state.phase === 'code') el.codeIn.focus();
  }

  function fillExamples() {
    const sel = $('examples');
    sel.replaceChildren();
    const first = mk('option', '', t('examplePick'));
    first.value = '';
    sel.appendChild(first);
    EXAMPLES.forEach((ex, i) => {
      const o = mk('option', '', (i + 1) + ') ' + t('ex' + (i + 1)));
      o.value = String(i);
      sel.appendChild(o);
    });
  }

  function applyI18n() {
    fillExamples();
    document.documentElement.lang = I.getLang();
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(e => { e.placeholder = t(e.dataset.i18nPlaceholder); });
  }

  // ---- Ereignisse ----
  const fit = () => {
    const focused = document.activeElement === el.text;
    el.text.wrap = focused ? 'soft' : 'off';
    el.text.style.height = '';
    if (focused) el.text.style.height = el.text.scrollHeight + 2 + 'px';
  };
  el.text.addEventListener('input', () => {
    if (/[\r\n]/.test(el.text.value)) {
      const pos = el.text.selectionStart;
      el.text.value = el.text.value.replace(/[\r\n]/g, '');
      el.text.setSelectionRange(pos - 1, pos - 1);
    }
    fit();
    setText();
  });
  el.text.addEventListener('focus', fit);
  el.text.addEventListener('blur', () => { fit(); el.text.scrollTop = 0; el.text.scrollLeft = 0; });
  el.text.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });

  document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => {
    state.mode = r.value;
    reset();
    render();
  }));
  el.lang.addEventListener('change', () => { I.setLang(el.lang.value); applyI18n(); render(); });
  el.prev.addEventListener('click', showPrev);
  el.next.addEventListener('click', showNext);
  el.all.addEventListener('click', showAll);
  el.undo.addEventListener('click', undo);
  el.auto.addEventListener('click', autoComplete);
  el.reset.addEventListener('click', () => { reset(); render(); });
  el.reveal.addEventListener('click', () => {
    state.revealed = true;
    el.decIn.value = state.enc.codes.join(' ');
    state.decoded = null;
    render();
  });
  el.binary.addEventListener('change', render);
  el.codeBox.addEventListener('submit', onCodeSubmit);
  el.decForm.addEventListener('submit', ev => {
    ev.preventDefault();
    state.decoded = { codes: L.parseCodes(el.decIn.value) };
    renderDecode();
  });

  $('examples').addEventListener('change', ev => {
    const i = ev.target.value;
    if (i === '') return;
    el.text.value = EXAMPLES[Number(i)];
    ev.target.value = '';
    fit();
    setText();
  });

  applyI18n();
  setText();
})();
