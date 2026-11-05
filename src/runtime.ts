import { existsSync } from 'node:fs';
import { mkdir, cp, copyFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { AiSearchError } from './errors.js';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
export interface RuntimePaths { cacheDirectory: string; bootstrapExecutable: string; pythonExecutable: string }
export interface SetupOptions { cacheDirectory?: string; pythonCommand?: string; signal?: AbortSignal }

export function runtimePaths(cacheDirectory = process.env.AI_SEARCH_OVERVIEW_CACHE ?? join(homedir(), '.cache', 'aisearchoverview-kit')): RuntimePaths {
  cacheDirectory = resolve(cacheDirectory);
  return {
    cacheDirectory,
    bootstrapExecutable: process.env.AI_SEARCH_OVERVIEW_BOOTSTRAP ?? join(cacheDirectory, 'native', 'target', 'release', process.platform === 'win32' ? 'google-search-bootstrap.exe' : 'google-search-bootstrap'),
    pythonExecutable: process.env.AI_SEARCH_OVERVIEW_PYTHON ?? join(cacheDirectory, 'python', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
  };
}

function run(command: string, args: string[], signal?: AbortSignal, quiet = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: quiet ? 'ignore' : ['ignore', 2, 2], shell: false, signal });
    child.on('error', error => reject(signal?.aborted ? signal.reason : new AiSearchError(`${command} could not start: ${error.message}`, 'configuration', undefined, { cause: error })));
    child.on('exit', (code, termination) => signal?.aborted ? reject(signal.reason) : code === 0 ? resolve() : reject(new AiSearchError(`${command} failed (${termination ?? code})`, 'configuration')));
  });
}

/** Installs the pinned HTTP client and builds the optional embedded runtime in a caller-owned cache. */
export async function setupRuntime(options: SetupOptions = {}): Promise<RuntimePaths> {
  if (options.signal?.aborted) throw options.signal.reason;
  const paths = runtimePaths(options.cacheDirectory);
  await run('git', ['--version'], options.signal, true);
  await run('cargo', ['--version'], options.signal, true);
  let python: string | undefined;
  for (const candidate of options.pythonCommand ? [options.pythonCommand] : ['python3.11', 'python3.12', 'python3.13', 'python3.10', 'python3']) {
    if (options.signal?.aborted) throw options.signal.reason;
    try { await run(candidate, ['-c', 'import sys; assert sys.version_info >= (3,10)'], options.signal, true); python = candidate; break; } catch { if (options.signal?.aborted) throw options.signal.reason; }
  }
  if (!python) throw new AiSearchError('Python 3.10 or newer is required; pass pythonCommand to setupRuntime()', 'configuration');
  await mkdir(paths.cacheDirectory, { recursive: true });
  const native = join(paths.cacheDirectory, 'native');
  await mkdir(native, { recursive: true });
  for (const name of ['Cargo.toml', 'Cargo.lock', 'build.mjs']) await copyFile(join(root, 'tools/google-search-bootstrap', name), join(native, name));
  await cp(join(root, 'tools/google-search-bootstrap/src'), join(native, 'src'), { recursive: true });
  await run(python, ['-m', 'venv', join(paths.cacheDirectory, 'python')], options.signal);
  const installedPython = join(paths.cacheDirectory, 'python', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  await run(installedPython, ['-m', 'pip', 'install', '--only-binary=:all:', '-r', join(root, 'runtime/requirements.txt')], options.signal);
  await run(process.execPath, [join(native, 'build.mjs')], options.signal);
  const result = { ...paths, pythonExecutable: installedPython, bootstrapExecutable: join(native, 'target/release', process.platform === 'win32' ? 'google-search-bootstrap.exe' : 'google-search-bootstrap') };
  if (!existsSync(result.bootstrapExecutable)) throw new AiSearchError('The embedded runtime build did not produce an executable', 'configuration');
  return result;
}
