/* One-off codemod (CRLF-safe, idempotent): wire the host-controlled display
 * standings page through the API — schema column, SessionRow, snapshot field,
 * transition table, host action handler and the validated DTO.
 * Run:  node apps/web/scripts/api-standings-page.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
let applied = 0;

function patch(rel, edits) {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, 'utf8');
  const nl = s.includes('\r\n') ? '\r\n' : '\n';
  let touched = 0;
  for (const e of edits) {
    if (s.includes(e.guard)) continue; // already applied
    if (!s.includes(e.anchor)) throw new Error(rel + ': anchor not found -> ' + e.anchor);
    s = s.replace(e.anchor, [e.anchor, ...e.after].join(nl));
    touched++;
  }
  if (touched) {
    fs.writeFileSync(p, s);
    applied += touched;
  }
  console.log(rel + ': ' + touched + ' edit(s)');
}

// 1) Schema: additive, idempotent column (no destructive DDL) [secure-coding].
patch('apps/api/src/db/schema.sql', [
  {
    guard: 'standings_page',
    anchor: "ALTER TABLE round_attempts ADD COLUMN IF NOT EXISTS content            jsonb NOT NULL DEFAULT '{}'::jsonb; -- frozen round content incl. solution",
    after: ['ALTER TABLE sessions       ADD COLUMN IF NOT EXISTS standings_page     integer NOT NULL DEFAULT 0;        -- display leaderboard page (host-driven)'],
  },
]);

// 2) SessionRow gains the column.
patch('apps/api/src/sessions/sessions.service.ts', [
  { guard: 'standings_page', anchor: '  ceremony_step: number;', after: ['  standings_page: number;'] },
]);

// 3) Snapshot emits it (seq-ordered with the rest of the stage machine).
patch('apps/api/src/rounds/snapshot.ts', [
  {
    guard: 'standingsPage',
    anchor: '    ceremonyStep: session.ceremony_step,',
    after: ['    standingsPage: session.standings_page ?? 0,'],
  },
]);

// 4) Transition table: paging is only meaningful on results stages.
patch('apps/api/src/rounds/transitions.ts', [
  {
    guard: 'STANDINGS_PAGE',
    anchor: "  CEREMONY_STEP: ['TournamentResults'],",
    after: ["  STANDINGS_PAGE: ['Reveal', 'GameResults', 'TournamentResults'],"],
  },
]);

// 5) Host action handler + writable column on update().
patch('apps/api/src/rounds/rounds.service.ts', [
  {
    guard: "case 'STANDINGS_PAGE'",
    anchor: "        await this.update(s.id, { ceremony_step: Math.min(4, Math.max(0, Math.trunc(p.step ?? 0))) });",
    after: [
      '        return;',
      "      case 'STANDINGS_PAGE':",
      '        await this.update(s.id, { standings_page: Math.min(99, Math.max(0, Math.trunc(p.page ?? 0))) });',
    ],
  },
  {
    guard: "'ceremony_step' | 'standings_page'",
    anchor: "'game_index' | 'round_index' | 'ceremony_step'",
    after: [],
  },
]);

// 6) Controller allow-list + validated page field [secure-coding].
patch('apps/api/src/rounds/rounds.controller.ts', [
  {
    guard: "'STANDINGS_PAGE'",
    anchor: "  'START_TIEBREAK', 'CEREMONY_STEP', 'CLOSE_SESSION',",
    after: ["  'STANDINGS_PAGE',"],
  },
  {
    guard: 'page?: number;',
    anchor: '  @IsOptional() @IsInt() @Min(0) @Max(4) step?: number;',
    after: ['  @IsOptional() @IsInt() @Min(0) @Max(99) page?: number;'],
  },
]);

// 5b) Widen the update() Pick so standings_page is writable.
{
  const p = path.join(root, 'apps/api/src/rounds/rounds.service.ts');
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes("'ceremony_step' | 'standings_page'")) {
    s = s.replace("'ceremony_step'", "'ceremony_step' | 'standings_page'");
    fs.writeFileSync(p, s);
    applied++;
    console.log('rounds.service.ts: update() Pick widened');
  }
}

console.log('total edits:', applied);
