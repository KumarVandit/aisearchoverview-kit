import { describe, it, expect, vi } from 'vitest';
import { build } from 'esbuild';
import { sdk, type WorkerKitConfig } from '../../src/workers.js';
import { loadNestedFixture } from '../helpers/fixtures.js';

const html = loadNestedFixture('google-search', 'aio-sky-simplified-http.html');
describe('fetch-only Workers entry point', () => {
  it('bundles for the browser without external modules, Node APIs or runtime setup', async () => {
    const bundle = await build({entryPoints:['src/workers.ts'],bundle:true,platform:'browser',format:'esm',write:false,metafile:true});
    const inputs = Object.keys(bundle.metafile!.inputs);
    expect(inputs.some(path => /(?:^|\/)(?:runtime|embedded)\.ts$/.test(path))).toBe(false);
    expect(bundle.metafile!.outputs[Object.keys(bundle.metafile!.outputs)[0]!]!.imports).toEqual([]);
    expect(bundle.outputFiles[0]!.text).not.toMatch(/["']node:|child_process|require\(["']fs["']\)/);
  });
  it('uses fetch and preserves actual parsed text and citations from a supplied fixture', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(html));
    const result = await sdk({fetch:fetcher}).overview.get('why is the sky blue');
    expect(result.status).toBe('present');
    if(result.status!=='present') throw Error('Fixture answer missing');
    expect(result.text).toContain('Rayleigh Scattering');
    expect(result.sources).toHaveLength(7);
    expect(result.metadata.transport).toBe('http');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not treat a successful HTTP status or a challenge as a verified answer', async () => {
    expect((await sdk({fetch:vi.fn<typeof fetch>().mockResolvedValue(new Response('Enable JavaScript'))}).overview.get('property query')).status).toBe('unverified');
    expect((await sdk({fetch:vi.fn<typeof fetch>().mockResolvedValue(new Response('',{status:429}))}).overview.get('property query')).status).toBe('blocked');
  });
  it('rejects native transport and invalid timeouts', () => {
    expect(()=>sdk({transport:'embedded'} as unknown as WorkerKitConfig)).toThrow('only HTTP');
    expect(()=>sdk({timeoutMs:0})).toThrow('timeoutMs');
  });
});
