import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runtimePaths, setupRuntime } from '../../src/runtime.js';
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
afterEach(() => { vi.mocked(spawn).mockReset(); vi.unstubAllEnvs(); });

describe('runtime setup contract', () => {
  it('resolves a custom cache to stable absolute paths', () => {
    vi.stubEnv('AI_SEARCH_OVERVIEW_BOOTSTRAP', undefined); vi.stubEnv('AI_SEARCH_OVERVIEW_PYTHON', undefined);
    const result = runtimePaths('/tmp/overview-runtime');
    expect(result.cacheDirectory).toBe('/tmp/overview-runtime');
    expect(result.bootstrapExecutable).toContain('/tmp/overview-runtime/native/target/release/');
    expect(result.pythonExecutable).toContain('/tmp/overview-runtime/python/');
  });
  it('cancels before starting dependency commands', async () => {
    const controller = new AbortController(); const reason = new Error('cancelled'); controller.abort(reason);
    await expect(setupRuntime({ signal: controller.signal })).rejects.toBe(reason);
    expect(spawn).not.toHaveBeenCalled();
  });
  it('reports missing dependency commands as typed configuration errors', async () => {
    vi.mocked(spawn).mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('error', new Error('missing command')));
      return child as ChildProcess;
    });
    await expect(setupRuntime()).rejects.toMatchObject({ name: 'AiSearchError', kind: 'configuration', message: expect.stringContaining('git') });
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
