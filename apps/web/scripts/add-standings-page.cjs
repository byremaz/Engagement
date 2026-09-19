/* One-off codemod (CRLF-safe): add STANDINGS_PAGE host action, its payload
 * field, and the standingsPage snapshot field to packages/shared/src/types.ts.
 * Idempotent: re-running it is a no-op. */
const fs = require('fs');
const path = require('path');

const p = path.resolve(__dirname, '../../../packages/shared/src/types.ts');
let s = fs.readFileSync(p, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';
let changed = 0;

// 1) Host action name
if (!s.includes("'STANDINGS_PAGE'")) {
  s = s.replace(
    "  | 'START_TIEBREAK';",
    [
      "  | 'START_TIEBREAK'",
      '  /** Host-driven leaderboard paging on the shared display (plan section 4). */',
      "  | 'STANDINGS_PAGE';",
    ].join(nl),
  );
  changed++;
}

// 2) Action payload field
if (!s.includes('  page?: number;')) {
  s = s.replace(
    '  participantIds?: string[];',
    [
      '  participantIds?: string[];',
      '  /** STANDINGS_PAGE: zero-based standings page to show on the display. */',
      '  page?: number;',
    ].join(nl),
  );
  changed++;
}

// 3) Snapshot field
if (!s.includes('standingsPage')) {
  s = s.replace(
    '  ceremonyStep: number;',
    [
      '  ceremonyStep: number;',
      '  /** Zero-based standings page for the shared display; host-set, seq-ordered. */',
      '  standingsPage: number;',
    ].join(nl),
  );
  changed++;
}

fs.writeFileSync(p, s);
console.log('edits applied:', changed);
console.log(
  'STANDINGS_PAGE:', s.includes('STANDINGS_PAGE'),
  '| page?:', s.includes('page?: number;'),
  '| standingsPage:', s.includes('standingsPage'),
);
