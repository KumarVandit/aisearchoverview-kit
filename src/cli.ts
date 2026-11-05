#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sdk } from './client.js';
import { setupRuntime } from './runtime.js';
import { AiSearchError } from './errors.js';
import type { OverviewOptions, OverviewResult } from './types.js';

const help = `aisearchoverview-kit — actual Google AI Overview text and sources

Commands:
  setup [--python python3.11] [--cache DIRECTORY]
  get "why is the sky blue" [--country US] [--language en]
  parse saved.html --url "https://www.google.com/search?q=example"
  help

Options: --no-markdown, --resolve-sources, --http, --cache DIRECTORY,
         --bootstrap EXECUTABLE, --python EXECUTABLE
`;

export async function runCli(args: string[]): Promise<void> {
  const command = args.shift() ?? 'help';
  if (['help', '--help', '-h'].includes(command)) { process.stdout.write(help); return; }
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  const positionals: string[] = [];
  let literal = false;
  for (let index = 0; index < args.length; index++) {
    const value = args[index]!;
    if (literal) { positionals.push(value); continue; }
    if (value === '--') { literal = true; continue; }
    if (['--no-markdown', '--resolve-sources', '--http'].includes(value)) { flags.add(value); continue; }
    if (['--country', '--language', '--url', '--cache', '--bootstrap', '--python'].includes(value)) {
      const next = args[++index];
      if (!next || next.startsWith('--')) throw new AiSearchError(`Missing value for ${value}`, 'validation');
      values[value] = next; continue;
    }
    if (value.startsWith('-')) throw new AiSearchError(`Unknown option: ${value}`, 'validation');
    positionals.push(value);
  }
  if (command === 'setup') {
    if (positionals.length || flags.size || Object.keys(values).some(key => !['--cache', '--python'].includes(key))) throw new AiSearchError('setup accepts only --cache and --python', 'validation');
    const paths = await setupRuntime({ cacheDirectory: values['--cache'], pythonCommand: values['--python'] });
    process.stdout.write(JSON.stringify({ ready: true, ...paths }, null, 2) + '\n'); return;
  }
  if (!['get', 'parse'].includes(command)) throw new AiSearchError(`Unknown command: ${command}`, 'validation');
  const client = sdk({ transport: flags.has('--http') ? 'http' : 'embedded', cacheDirectory: values['--cache'], pythonExecutable: values['--python'], bootstrapExecutable: values['--bootstrap'] });
  const options: OverviewOptions = { country: values['--country'], language: values['--language'], markdown: !flags.has('--no-markdown') };
  let result: OverviewResult;
  if (command === 'parse') {
    if (positionals.length !== 1 || !values['--url']) throw new AiSearchError('parse requires a file and --url', 'validation');
    result = client.overview.parse(await readFile(positionals[0]!, 'utf8'), { ...options, sourceUrl: values['--url'] });
  } else {
    if (!positionals.length || values['--url']) throw new AiSearchError('get requires a query; --url is only for parse', 'validation');
    result = await client.overview.get(positionals.join(' '), options);
  }
  if (flags.has('--resolve-sources') && result.status === 'present') {
    const resolution = await client.sources.resolve(result.sources);
    result = { ...result, sources: resolution.sources, metadata: { ...result.metadata, warnings: [...result.metadata.warnings, ...resolution.warnings] } };
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status !== 'present') process.exitCode = 2;
}

export function isCliEntry(moduleUrl: string, executable: string | undefined): boolean {
  if (!executable) return false;
  try { return realpathSync(resolve(executable)) === realpathSync(fileURLToPath(moduleUrl)); } catch { return false; }
}

if (isCliEntry(import.meta.url, process.argv[1])) {
  runCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(JSON.stringify({ error: { kind: error instanceof AiSearchError ? error.kind : 'unknown', message: error instanceof Error ? error.message : String(error) } }) + '\n');
    process.exitCode = 1;
  });
}
