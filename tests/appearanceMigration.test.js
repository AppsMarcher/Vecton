/* Migration snapshot: resolving theme fallbacks must recover the original Dark source.
   Refresh this baseline deliberately when merging subsequent functional changes from main. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const baseline = require('./fixtures/appearanceDarkBaseline.json');
const root = path.resolve(__dirname, '..');
const palette = fs.readFileSync(path.join(root,'src/styles/appearance.css'), 'utf8');
function resolveDark(source) {
  let result = '', cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('var(--theme-', cursor);
    if (start < 0) return result + source.slice(cursor);
    result += source.slice(cursor, start);
    const comma = source.indexOf(',', start);
    const token = source.slice(start + 4, comma);
    assert.ok(palette.includes(token + ':'), 'Missing Clear token: ' + token);
    let depth = 1, end = comma + 1;
    for (; end < source.length; end++) {
      if (source[end] === '(') depth++;
      if (source[end] === ')' && --depth === 0) break;
    }
    assert.equal(depth, 0, 'Unbalanced token');
    result += source.slice(comma + 1, end).trimStart();
    cursor = end + 1;
  }
  return result;
}
for (const [file, hash] of Object.entries(baseline.hashes)) {
  const source = fs.readFileSync(path.join(root,file), 'utf8');
  const restored = resolveDark(source).replaceAll('\r\n','\n');
  assert.equal(crypto.createHash('sha256').update(restored).digest('hex'), hash, file + ': changed beyond theme tokens');
}
console.log('Dark baseline: all ' + Object.keys(baseline.hashes).length + ' source files preserve original colors, markup and logic.');
