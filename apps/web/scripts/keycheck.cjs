/**
 * Dev helper: print the English dictionary entries for the keys passed as
 * arguments, or `MISSING <key>` when a key is absent. Used while wiring
 * templates so a template can never ship a key the dictionary lacks.
 *
 * Usage: node apps/web/scripts/keycheck.cjs host.roundOf display.joined
 */
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'src', 'app', 'i18n', 'strings.en.ts');
const src = fs.readFileSync(file, 'utf8');
const keys = process.argv.slice(2);

for (const key of keys) {
  const line = src
    .split(/\r?\n/)
    .find((l) => l.trimStart().startsWith(`'${key}':`));
  console.log(line ? line.trim() : `MISSING ${key}`);
}
