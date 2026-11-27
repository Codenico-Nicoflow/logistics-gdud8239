import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Every query in this app goes through Prisma, which binds values as parameters, so user text can
 * never become SQL. That only stays true while nobody reaches for the escape hatches. This fails the
 * build if one appears — add an exemption here, with a reason, only if a raw query is truly needed.
 */
const SRC = join(__dirname);
const BANNED: { pattern: RegExp; why: string }[] = [
  { pattern: /\$queryRawUnsafe|\$executeRawUnsafe/, why: 'runs a string as SQL' },
  { pattern: /Prisma\.raw\s*\(/, why: 'inserts text into a query unescaped' },
  { pattern: /\$(?:queryRaw|executeRaw)\s*\(/, why: 'function-call form takes a plain string; use the tagged template' },
  { pattern: /\$(?:queryRaw|executeRaw)`[^`]*\$\{/, why: 'interpolation inside a raw query' },
  { pattern: /child_process['"]\s*\)?[\s\S]{0,40}\bexec\s*\(/, why: 'shell execution (use spawn with an argument array)' },
];
/** File and a substring of the line that is allowed to differ, with the reason. */
const ALLOWED: { file: string; contains: string; reason: string }[] = [];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('no raw SQL or shell escape hatches in src/', () => {
  it('finds none of the banned constructs', () => {
    const hits: string[] = [];
    for (const file of files(SRC)) {
      const text = readFileSync(file, 'utf8');
      const rel = relative(SRC, file);
      for (const { pattern, why } of BANNED) {
        const m = pattern.exec(text);
        if (!m) continue;
        const line = text.slice(0, m.index).split('\n').length;
        const lineText = text.split('\n')[line - 1] ?? '';
        if (ALLOWED.some((a) => a.file === rel && lineText.includes(a.contains))) continue;
        hits.push(`${rel}:${line}  ${lineText.trim()}  (${why})`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('knows about the one static raw query that exists and keeps it free of interpolation', () => {
    const text = readFileSync(join(SRC, 'reports/reports.service.ts'), 'utf8');
    // The tag may carry a type argument — `$queryRaw<Row[]>` — which a bare `$queryRaw`` would not match.
    const m = /\$queryRaw(?:<[^`]*?>)?`([^`]*)`/.exec(text);
    expect(m).not.toBeNull();
    expect(m?.[1]).not.toContain('${');
  });
});
