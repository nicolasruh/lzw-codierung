const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/lzw.js');

test('Klassisches Beispiel TOBEORNOTTOBEORTOBEORNOT', () => {
  const enc = L.encode('TOBEORNOTTOBEORTOBEORNOT');
  assert.deepEqual(enc.alphabet, ['B', 'E', 'N', 'O', 'R', 'T']);
  assert.deepEqual(enc.codes.slice(0, 10), [5, 3, 0, 1, 3, 4, 2, 3, 5, 6]);
  assert.deepEqual(enc.steps[0].entry, { code: 6, str: 'TO' });
  assert.equal(enc.steps.at(-1).entry, null);
});

test('Encode/Decode ist verlustfrei, auch mit Sonderfall', () => {
  for (const text of ['ABABABABA', 'AAAAAAAA', 'A', 'Hallo Welt äöü 😀 Hallo Welt', 'ABRAKADABRA']) {
    const enc = L.encode(text);
    const dec = L.decode(enc.codes, enc.alphabet);
    assert.equal(dec.error, null);
    assert.equal(dec.text, text);
  }
  const enc = L.encode('AAAAAAAA');
  assert.ok(L.decode(enc.codes, enc.alphabet).rows.some(r => r.special));
});

test('Decode meldet ungueltige Codes', () => {
  assert.equal(L.decode([0, 9], ['A', 'B']).error.index, 2);
  assert.equal(L.decode([5], ['A', 'B']).error.index, 1);
});

test('Bitbreiten und Kennzahlen', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 8, 9].map(L.bitWidth), [1, 1, 2, 2, 3, 3, 4]);
  const enc = L.encode('ABABABAB');
  const st = L.stats(enc, 8);
  assert.equal(st.raw, 64);
  assert.equal(st.count, enc.codes.length);
  assert.equal(st.bits, st.widths.reduce((a, b) => a + b, 0));
});

test('parseCodes', () => {
  assert.deepEqual(L.parseCodes('1, 2  3;4'), [1, 2, 3, 4]);
  assert.equal(L.parseCodes('1 x'), null);
});
