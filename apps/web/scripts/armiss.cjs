// Reports EN keys missing from the AR dictionary parts.
const fs = require('fs');
const en = fs.readFileSync('apps/web/src/app/i18n/strings.en.ts', 'utf8');
const ar = ['part1', 'part2', 'part3']
  .map((p) => fs.readFileSync(`apps/web/src/app/i18n/strings.ar.${p}.ts`, 'utf8'))
  .join('\n');
const keys = (en.match(/^  '[a-zA-Z0-9._]+':/gm) || []).map((x) => x.trim().slice(1, -2));
const miss = keys.filter((k) => !ar.includes(`'${k}'`));
console.log('EN keys', keys.length, 'missing in AR:', miss.length);
console.log(miss.join('\n'));
