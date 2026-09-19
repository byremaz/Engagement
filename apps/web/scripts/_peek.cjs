const fs = require('node:fs');
const p = process.argv[2];
const a = Number(process.argv[3] || 1);
const b = Number(process.argv[4] || 40);
const src = fs.readFileSync(p, 'utf8');
console.log('CRLF:', src.includes('\r\n'));
const lines = src.split(/\r?\n/);
for (let i = a - 1; i < Math.min(b, lines.length); i++) console.log(i + 1 + '| ' + lines[i]);
