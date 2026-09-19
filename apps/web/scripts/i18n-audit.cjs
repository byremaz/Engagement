/**
 * i18n audit — static verification that the localization layer is complete.
 *
 * Why this exists: `TranslatePipe.transform` accepts `string` (not just
 * `StringKey`) because several templates compose keys from snapshot enums
 * (`'state.' + s.state`). That is necessary, but it means a MISTYPED literal
 * key in a template no longer fails the build - it silently renders the key
 * text. This script restores that safety net outside the type system.
 *
 * It checks four things and exits non-zero on any failure:
 *   1. every literal `'key' | t` used in a template exists in the EN dictionary
 *   2. EN and AR have exactly the same key set (belt-and-braces; tsc also does this)
 *   3. every `{placeholder}` in an EN string is also present in the AR string,
 *      so a translated line cannot silently drop an interpolated value
 *   4. no EN key is entirely unused (dead copy) - reported as a warning only
 *
 * Usage: node apps/web/scripts/i18n-audit.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const appDir = path.join(__dirname, '..', 'src', 'app');
const i18nDir = path.join(appDir, 'i18n');

/** Collect every .ts file under src/app. */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/**
 * Parse `'key': 'value',` pairs out of a dictionary source file.
 * Handles single-quoted values with escaped quotes and multi-line strings.
 */
function parseDict(file) {
  const src = fs.readFileSync(file, 'utf8');
  const dict = new Map();
  // Match  'some.key': 'value'  /  "value"  possibly spanning lines.
  const re = /'([A-Za-z0-9_.\-]+)'\s*:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const key = m[1];
    const raw = m[2].slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
    dict.set(key, raw);
  }
  return dict;
}

const en = parseDict(path.join(i18nDir, 'strings.en.ts'));
const ar = new Map();
for (const part of ['strings.ar.part1.ts', 'strings.ar.part2.ts', 'strings.ar.part3.ts']) {
  for (const [k, v] of parseDict(path.join(i18nDir, part))) ar.set(k, v);
}

const errors = [];
const warnings = [];

// ---------------------------------------------------- 1. template keys exist
// Literal pipe uses:  'some.key' | t     (ignore composed `'a.' + x` forms)
const templateKeys = new Map(); // key -> [files]
for (const file of walk(appDir)) {
  if (file.startsWith(i18nDir)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.join(__dirname, '..', '..', '..'), file);

  const pipeRe = /'([A-Za-z][A-Za-z0-9_.\-]*)'\s*\|\s*t\b/g;
  let m;
  while ((m = pipeRe.exec(src)) !== null) {
    const key = m[1];
    if (!templateKeys.has(key)) templateKeys.set(key, []);
    templateKeys.get(key).push(rel);
  }
  // Direct service calls: locale.t('some.key')  /  this.locale.t('some.key')
  const callRe = /\.t\(\s*'([A-Za-z][A-Za-z0-9_.\-]*)'/g;
  while ((m = callRe.exec(src)) !== null) {
    const key = m[1];
    if (!templateKeys.has(key)) templateKeys.set(key, []);
    templateKeys.get(key).push(rel);
  }
}

for (const [key, files] of [...templateKeys].sort()) {
  if (!en.has(key)) {
    errors.push(`missing EN key '${key}' used in: ${[...new Set(files)].join(', ')}`);
  }
}

// --------------------------------------------------------- 2. EN/AR parity
for (const key of en.keys()) if (!ar.has(key)) errors.push(`AR missing key '${key}'`);
for (const key of ar.keys()) if (!en.has(key)) errors.push(`AR has extra key '${key}' (not in EN)`);

// ---------------------------------------------------- 3. placeholder parity
const ph = (s) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(',');
for (const [key, enVal] of en) {
  const arVal = ar.get(key);
  if (arVal === undefined) continue;
  if (ph(enVal) !== ph(arVal)) {
    errors.push(
      `placeholder mismatch '${key}': EN [${ph(enVal) || 'none'}] vs AR [${ph(arVal) || 'none'}]`,
    );
  }
}

// ------------------------------------- 3b. call sites must supply every param
// Plan §2: `t()` is now placeholder-safe, so an under-supplied param renders a
// blank or a dash instead of a literal `{total}`. That is a safe failure, not a
// correct one - a blank count is still a meaningless readout. This check flags
// any call site that cannot possibly supply the placeholders its key declares.
//
// Two shapes are checked:
//   `'key' | t`                      - pipe with no params object at all
//   `locale.t('key')`                - call with no second argument
// A pipe CAN receive params (`'k' | t : { n: x }`), so only the bare forms are
// reported, and only for keys that actually declare placeholders.
const declaredParams = (s) => [...new Set((s.match(/\{(\w+)\}/g) ?? []).map((t) => t.slice(1, -1)))];
for (const file of walk(appDir)) {
  if (file.startsWith(i18nDir)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.join(__dirname, '..', '..', '..'), file);

  // Bare pipe: `'key' | t` NOT followed by a `:` (which would pass params).
  const barePipeRe = /'([A-Za-z][A-Za-z0-9_.\-]*)'\s*\|\s*t\s*(?![:A-Za-z0-9_])/g;
  let m;
  while ((m = barePipeRe.exec(src)) !== null) {
    const key = m[1];
    const enVal = en.get(key);
    if (!enVal) continue; // already reported as a missing key
    const needs = declaredParams(enVal);
    if (needs.length) {
      errors.push(`'${key}' needs {${needs.join('}, {')}} but is used with no params in ${rel}`);
    }
  }

  // Bare call: `.t('key')` with no second argument.
  const bareCallRe = /\.t\(\s*'([A-Za-z][A-Za-z0-9_.\-]*)'\s*\)/g;
  while ((m = bareCallRe.exec(src)) !== null) {
    const key = m[1];
    const enVal = en.get(key);
    if (!enVal) continue;
    const needs = declaredParams(enVal);
    if (needs.length) {
      errors.push(`'${key}' needs {${needs.join('}, {')}} but is called with no params in ${rel}`);
    }
  }
}

// ----------------------------------------------------------- 4. unused keys
// Keys reached via composed prefixes must be whitelisted here, because the
// static scan cannot see `'state.' + s.state`.
const COMPOSED_PREFIXES = [
  'state.', 'game.', 'signal.', 'wait.title.', 'wait.body.', 'howto.',
  'host.progress.', 'result.outcome.', 'host.action.', 'geo.', 'order.',
  'action.', 'error.', 'rlgl.', 'host.socket.',
];
// A key can legitimately appear in a ternary (`(a ? 'k1' : 'k2') | t`) or be
// passed to a helper, which the `| t` regex above does not see. For DEAD-COPY
// detection only, treat any key whose literal occurs anywhere in the app
// sources as used - this check is advisory, so favour false negatives over
// noisy false positives.
const allSources = walk(appDir)
  .filter((f) => !f.startsWith(i18nDir))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');
for (const key of en.keys()) {
  if (templateKeys.has(key)) continue;
  if (COMPOSED_PREFIXES.some((p) => key.startsWith(p))) continue;
  if (allSources.includes(`'${key}'`)) continue;
  warnings.push(`unused EN key '${key}'`);
}

// -------------------------------------------------------------------- report
console.log(`EN keys: ${en.size}   AR keys: ${ar.size}   literal template keys: ${templateKeys.size}`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s) (dead copy, not fatal):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
if (errors.length) {
  console.error(`\n${errors.length} ERROR(S):`);
  for (const e of errors) console.error(`  x ${e}`);
  process.exit(1);
}
console.log('\ni18n audit passed: no missing keys, full EN/AR parity, placeholders aligned.');
