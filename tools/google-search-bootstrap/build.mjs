import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ENGINE_REPOSITORY = 'https://github.com/pierce403/mgbrowser.git';
export const ENGINE_COMMIT = 'fdf935c1a9a1446395cc61717b4a0d2047cd85b3';
export const TOOL_DIRECTORY = dirname(fileURLToPath(import.meta.url));

function runCommand(command, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.error || result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(result.error?.message ?? `${command} failed with status ${result.status}`);
  }
  return result.stdout ?? '';
}

export function buildBootstrap({ toolDirectory = TOOL_DIRECTORY, run = runCommand } = {}) {
  const engineDirectory = join(toolDirectory, 'engine');
  const git = (args, options) => run('git', ['-C', engineDirectory, ...args], options);
  const query = args => git(args, { capture: true }).trim();
  if (existsSync(engineDirectory) && lstatSync(engineDirectory).isSymbolicLink()) {
    throw new Error('The engine cache must be a real directory.');
  }
  if (!existsSync(join(engineDirectory, '.git'))) {
    if (existsSync(engineDirectory) && readdirSync(engineDirectory).length) {
      throw new Error('The engine cache is not an empty directory or Git checkout.');
    }
    mkdirSync(engineDirectory, { recursive: true });
    git(['init', '--quiet']);
    git(['remote', 'add', 'origin', ENGINE_REPOSITORY]);
  }
  if (realpathSync(query(['rev-parse', '--show-toplevel'])) !== realpathSync(engineDirectory)) {
    throw new Error('The engine cache belongs to another Git checkout.');
  }
  if (query(['remote', 'get-url', 'origin']) !== ENGINE_REPOSITORY) {
    throw new Error('The engine cache has an unexpected source repository.');
  }
  const assertClean = () => {
    if (query(['status', '--porcelain', '--untracked-files=no'])) {
      throw new Error('The engine cache contains modified tracked source.');
    }
  };
  assertClean();
  const currentCommit = git(['rev-parse', '--verify', 'HEAD'], { capture: true, allowFailure: true })?.trim();
  if (currentCommit !== ENGINE_COMMIT) {
    git(['fetch', '--depth=1', 'origin', ENGINE_COMMIT]);
    git(['checkout', '--detach', ENGINE_COMMIT]);
  }
  if (query(['rev-parse', 'HEAD']) !== ENGINE_COMMIT) {
    throw new Error('The engine checkout does not match the pinned revision.');
  }
  assertClean();
  run('cargo', [
    'build', '--release', '--locked',
    '--manifest-path', join(toolDirectory, 'Cargo.toml'),
    '--target-dir', join(toolDirectory, 'target'),
  ]);
  assertClean();
  const binary = join(toolDirectory, 'target', 'release', process.platform === 'win32' ? 'google-search-bootstrap.exe' : 'google-search-bootstrap');
  if (!existsSync(binary)) throw new Error('Cargo did not produce the bootstrap executable.');
  return binary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(buildBootstrap());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
