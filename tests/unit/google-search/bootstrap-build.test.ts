import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBootstrap, ENGINE_COMMIT, ENGINE_REPOSITORY } from '../../../tools/google-search-bootstrap/build.mjs';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture({ dirty = false, repository = ENGINE_REPOSITORY, commit = ENGINE_COMMIT, checkoutWorks = true } = {}) {
  const toolDirectory = mkdtempSync(join(tmpdir(), 'search-bootstrap-build-'));
  directories.push(toolDirectory);
  const engine = join(toolDirectory, 'engine');
  mkdirSync(join(engine, '.git'), { recursive: true });
  const calls: Array<{ command: string; args: string[] }> = [];
  const run = (command: string, args: string[]) => {
    calls.push({ command, args });
    if (command === 'cargo') {
      const release = join(toolDirectory, 'target', 'release');
      mkdirSync(release, { recursive: true });
      writeFileSync(join(release, process.platform === 'win32' ? 'google-search-bootstrap.exe' : 'google-search-bootstrap'), 'fixture');
      return '';
    }
    const operation = args.slice(2);
    if (operation[0] === 'status') return dirty ? ' M source.rs' : '';
    if (operation[0] === 'remote') return repository;
    if (operation[0] === 'checkout' && checkoutWorks && operation[2]) commit = operation[2];
    if (operation[0] === 'rev-parse') return operation[1] === '--show-toplevel' ? engine : commit;
    return '';
  };
  return { toolDirectory, run, calls };
}

describe('native Search bootstrap build', () => {
  it('refuses modified tracked engine source before fetching or compiling', () => {
    const setup = fixture({ dirty: true });
    expect(() => buildBootstrap(setup)).toThrow('modified tracked source');
    expect(setup.calls.some(call => call.command === 'cargo' || call.args.includes('fetch'))).toBe(false);
  });

  it('refuses a different upstream repository', () => {
    const setup = fixture({ repository: 'https://example.test/other.git' });
    expect(() => buildBootstrap(setup)).toThrow('unexpected source repository');
    expect(setup.calls.some(call => call.command === 'cargo' || call.args.includes('fetch'))).toBe(false);
  });

  it('verifies the checked-out revision before compiling', () => {
    const setup = fixture({ commit: '0'.repeat(40), checkoutWorks: false });
    expect(() => buildBootstrap(setup)).toThrow('does not match the pinned revision');
    expect(setup.calls.some(call => call.command === 'cargo')).toBe(false);
  });

  it('fetches the exact pin and compiles with the supplied Cargo lockfile', () => {
    const setup = fixture({ commit: '0'.repeat(40) });
    expect(buildBootstrap(setup)).toContain('google-search-bootstrap');
    expect(setup.calls.some(call => call.args.join(' ').endsWith(`fetch --depth=1 origin ${ENGINE_COMMIT}`))).toBe(true);
    expect(setup.calls.find(call => call.command === 'cargo')?.args).toEqual(expect.arrayContaining(['--release', '--locked']));
  });

  it('refuses a symlinked engine cache without executing commands', () => {
    const setup = fixture();
    rmSync(join(setup.toolDirectory, 'engine'), { recursive: true });
    const outside = join(setup.toolDirectory, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(setup.toolDirectory, 'engine'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => buildBootstrap(setup)).toThrow('real directory');
    expect(setup.calls).toHaveLength(0);
  });
});
