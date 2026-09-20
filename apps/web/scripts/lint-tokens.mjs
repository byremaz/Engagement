/**
 * Fails when a component references a CSS custom property that styles.css
 * never defines (with or without a fallback), so the design system stays the
 * single source of truth (plan v2, BUG-M). Run: `npm run lint:tokens -w apps/web`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const styles = readFileSync(join(root, 'src', 'styles.css'), 'utf8');
const defined = new Set([...styles.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.ts') || name.endsWith('.css') || name.endsWith('.html')) out.push(p);
  }
  return out;
}

const problems = [];
for (const file of walk(join(root, 'src'))) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
    const token = m[1];
    if (!defined.has(token) && !token.startsWith('--runner') && !token.startsWith('--role-')) {
      problems.push(`${file.replace(root, '')}: ${token}`);
    }
  }
}

if (problems.length) {
  console.error('Undefined design tokens:\n' + [...new Set(problems)].join('\n'));
  process.exit(1);
}
console.log(`design tokens OK (${defined.size} defined)`);
