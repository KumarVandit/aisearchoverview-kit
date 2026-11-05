import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { isCliEntry } from '../../src/cli.js';

describe('installed npm CLI entry point', () => {
  it('runs when npm invokes a bin symlink to the real entry file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'overview-cli-'));
    try {
      const entry = join(dir, 'cli.js'); const bin = join(dir, 'package-bin');
      writeFileSync(entry, ''); symlinkSync(entry, bin);
      expect(isCliEntry(pathToFileURL(entry).href, bin)).toBe(true);
      expect(isCliEntry(pathToFileURL(entry).href, entry)).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('does not run when imported by a different executable or absent path', () => {
    expect(isCliEntry(import.meta.url, undefined)).toBe(false);
    expect(isCliEntry(import.meta.url, '/missing/entry')).toBe(false);
    expect(isCliEntry(import.meta.url, process.execPath)).toBe(false);
  });
});
