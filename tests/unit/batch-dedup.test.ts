import { describe, expect, it, vi } from 'vitest';
import { sdk } from '../../src/index.js';
import { loadNestedFixture } from '../helpers/fixtures.js';

const html = loadNestedFixture('google-search','aio-sky-expanded.html');

describe('opt-in batch-only query deduplication', () => {
  it('turns 100 entries containing four exact queries into four bounded requests and independent ordered results', async () => {
    let active=0, peak=0;
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async () => {
      active++;peak=Math.max(peak,active);
      await new Promise(resolve=>setTimeout(resolve,2));active--;
      return new Response(html);
    });
    const queries=Array.from({length:100},(_, index)=>['alpha','beta','gamma','delta'][index % 4]!);
    const results=await sdk({fetch:fetcher}).overview.batch(queries,{deduplicate:true,concurrency:3,country:'GB',language:'de'});
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(peak).toBeGreaterThan(1);expect(peak).toBeLessThanOrEqual(3);
    expect(results.map(item=>item.query)).toEqual(queries);
    expect(results.every(item=>item.ok)).toBe(true);
    for(const [input] of fetcher.mock.calls){const url=new URL(String(input));expect(url.searchParams.get('gl')).toBe('gb');expect(url.searchParams.get('hl')).toBe('de');}
    const first=results[0]!, duplicate=results[4]!;
    if(!first.ok||!duplicate.ok)throw new Error('Expected captured answers');
    expect(first.overview).toEqual(duplicate.overview);
    expect(first.overview).not.toBe(duplicate.overview);
    const originalTitle=duplicate.overview.sources[0]!.title;
    first.overview.sources[0]!.title='Changed locally';
    first.overview.metadata.warnings.push('Local warning');
    expect(duplicate.overview.sources[0]!.title).toBe(originalTitle);
    expect(duplicate.overview.metadata.warnings).not.toContain('Local warning');
    if(first.overview.status==='present'&&duplicate.overview.status==='present'){
      expect(first.overview.citationPills?.length).toBeGreaterThan(0);
      const title=duplicate.overview.citationPills![0]!.label;
      first.overview.citationPills![0]!.label='Changed citation';
      expect(duplicate.overview.citationPills![0]!.label).toBe(title);
    }
  });

  it('shares failures within the batch without retries and preserves every error position', async () => {
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async input=>{
      if(new URL(String(input)).searchParams.get('q')==='bad')throw new Error('network unavailable');
      return new Response(html);
    });
    const results=await sdk({fetch:fetcher}).overview.batch(['bad','good','bad','good','bad'],{deduplicate:true,concurrency:2});
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(results.map(item=>item.ok)).toEqual([false,true,false,true,false]);
    const failures=results.filter(item=>!item.ok);
    expect(failures.map(item=>item.error)).toEqual(Array(3).fill({kind:'network',message:'Google Search network request failed'}));
    expect(failures[0]!.error).not.toBe(failures[1]!.error);
  });

  it('preserves default request counts and does not retain observations between batches or normalize query text', async () => {
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async ()=>new Response(html));
    const overview=sdk({fetch:fetcher}).overview;
    await overview.batch(['same','same']);expect(fetcher).toHaveBeenCalledTimes(2);
    await overview.batch(['same','same'],{deduplicate:true});expect(fetcher).toHaveBeenCalledTimes(3);
    await overview.batch(['same','same'],{deduplicate:true});expect(fetcher).toHaveBeenCalledTimes(4);
    await overview.batch(['same','Same'],{deduplicate:true});expect(fetcher).toHaveBeenCalledTimes(6);
    await expect(overview.batch(['same'],{deduplicate:'yes' as unknown as boolean})).rejects.toMatchObject({kind:'validation'});
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it('retains cancellation reasons and stops the one shared request without starting repeated work', async () => {
    const controller=new AbortController(), reason=new Error('Stop this batch');
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async (_input,init)=>new Promise<Response>((_resolve,reject)=>{
      init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true});
    }));
    const result=sdk({fetch:fetcher}).overview.batch(Array(100).fill('same'),{deduplicate:true,concurrency:8,signal:controller.signal});
    const rejected=expect(result).rejects.toBe(reason);
    await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
    controller.abort(reason);await rejected;
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(sdk({fetch:fetcher}).overview.batch(['same'],{deduplicate:true,signal:controller.signal})).rejects.toBe(reason);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
