/* CRLF-safe, idempotent: add the new globe-control i18n keys to EN + AR. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');

const EN = {
  'geo.zoomIn': 'Zoom in',
  'geo.zoomOut': 'Zoom out',
  'geo.globeView': 'Globe view',
  'geo.flatView': 'Flat map',
  'geo.aria.noPin': 'World globe. No pin placed yet.',
  'geo.aria.pinned': 'World globe. Your pin is placed.',
};
const AR = {
  'geo.zoomIn': 'تكبير',
  'geo.zoomOut': 'تصغير',
  'geo.globeView': 'عرض الكرة',
  'geo.flatView': 'خريطة مسطحة',
  'geo.aria.noPin': 'كرة أرضية. لم تضع علامة بعد.',
  'geo.aria.pinned': 'كرة أرضية. تم وضع علامتك.',
};

function addKeys(rel, anchorKey, pairs) {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, 'utf8');
  const nl = s.includes('\r\n') ? '\r\n' : '\n';
  const lines = s.split(/\r?\n/);
  const at = lines.findIndex((l) => l.includes("'" + anchorKey + "'"));
  if (at < 0) throw new Error(rel + ': anchor key not found ' + anchorKey);
  const indent = (lines[at].match(/^\s*/) || [''])[0];
  const added = [];
  for (const [k, v] of Object.entries(pairs)) {
    if (s.includes("'" + k + "'")) continue;
    added.push(indent + "'" + k + "': '" + v + "',");
  }
  if (!added.length) {
    console.log(rel + ': already up to date');
    return;
  }
  lines.splice(at + 1, 0, ...added);
  fs.writeFileSync(p, lines.join(nl));
  console.log(rel + ': +' + added.length + ' key(s)');
}

addKeys('apps/web/src/app/i18n/strings.en.ts', 'geo.rotateHint', EN);
addKeys('apps/web/src/app/i18n/strings.ar.part3.ts', 'geo.rotateHint', AR);
