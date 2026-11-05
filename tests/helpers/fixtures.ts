/**
 * Shared fixture loading for tests.
 *
 * Fixtures are captured wire payloads (trimmed where noted) that keep parser
 * and builder tests deterministic and offline. Live-surface regression runs
 * live in `tests/live/` instead.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** Read a fixture as UTF-8 text (JSON or raw payload). */
export function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

/** Read a fixture as a subdirectory-scoped text file, e.g. `batch-rpc/...`. */
export function loadNestedFixture(...segments: string[]): string {
  return readFileSync(join(FIXTURES_DIR, ...segments), 'utf8');
}

/** Read and parse a JSON fixture. */
export function loadJsonFixture<T = unknown>(name: string): T {
  return JSON.parse(loadFixture(name)) as T;
}

/** Read and parse a JSON fixture from a subdirectory of `fixtures/`. */
export function loadNestedJsonFixture<T = unknown>(...segments: string[]): T {
  return JSON.parse(loadNestedFixture(...segments)) as T;
}

/** Read a binary fixture (PNG/JPEG/protobuf captures). */
export function loadBinaryFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name)));
}
