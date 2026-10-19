// LZW-Logik (ohne DOM). Funktioniert im Browser (global `LZW`) und in Node (module.exports).
(function (root) {
  'use strict';

  const chars = s => Array.from(s);

  // Anfangswoerterbuch: alle vorkommenden Zeichen, nach Codepoint sortiert.
  function alphabetOf(text) {
    return [...new Set(chars(text))].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  }

  // Schritte: {start, len, prefix, code, next, entry: {code, str} | null}
  function encode(text) {
    const arr = chars(text);
    const alphabet = alphabetOf(text);
    const dict = new Map(alphabet.map((c, i) => [c, i]));
    const steps = [];
    let pos = 0;
    while (pos < arr.length) {
      let len = 1;
      let w = arr[pos];
      while (pos + len < arr.length && dict.has(w + arr[pos + len])) { w += arr[pos + len]; len++; }
      const step = { start: pos, len, prefix: w, code: dict.get(w), next: null, entry: null };
      if (pos + len < arr.length) {
        step.next = arr[pos + len];
        step.entry = { code: dict.size, str: w + step.next };
        dict.set(step.entry.str, step.entry.code);
      }
      steps.push(step);
      pos += len;
    }
    return { arr, alphabet, steps, codes: steps.map(s => s.code) };
  }

  // Woerterbuch (Liste von Zeichenfolgen) nach k abgeschlossenen Schritten.
  function dictAt(alphabet, steps, k) {
    const d = alphabet.slice();
    for (let i = 0; i < k; i++) if (steps[i].entry) d.push(steps[i].entry.str);
    return d;
  }

  function decode(codes, alphabet) {
    const dict = alphabet.slice();
    const rows = [];
    let out = '';
    let prev = null;
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      let str;
      let special = false;
      if (code < dict.length) str = dict[code];
      else if (code === dict.length && prev !== null) { str = prev + chars(prev)[0]; special = true; }
      else return { text: out, rows, error: { index: i + 1, code } };
      let entry = null;
      if (prev !== null) {
        entry = { code: dict.length, str: prev + chars(str)[0] };
        dict.push(entry.str);
      }
      rows.push({ index: i + 1, code, str, entry, special });
      out += str;
      prev = str;
    }
    return { text: out, rows, error: null };
  }

  // Bits fuer einen Code, wenn das Woerterbuch vor dem Schritt `size` Eintraege hat.
  function bitWidth(size) { return size <= 2 ? 1 : 32 - Math.clz32(size - 1); }

  function widths(alphabetSize, count) {
    return Array.from({ length: count }, (_, k) => bitWidth(alphabetSize + k));
  }

  function stats(enc, textLength) {
    const w = widths(enc.alphabet.length, enc.codes.length);
    const bits = w.reduce((a, b) => a + b, 0);
    const raw = 8 * textLength;
    return {
      count: enc.codes.length,
      dictSize: enc.alphabet.length + enc.steps.filter(s => s.entry).length,
      bits, raw, widths: w,
      savings: raw ? (1 - bits / raw) * 100 : 0,
    };
  }

  function parseCodes(s) {
    const parts = s.split(/[\s,;]+/).filter(Boolean);
    if (!parts.every(p => /^\d+$/.test(p))) return null;
    return parts.map(Number);
  }

  const api = { alphabetOf, encode, dictAt, decode, bitWidth, widths, stats, parseCodes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LZW = api;
})(typeof self !== 'undefined' ? self : this);
