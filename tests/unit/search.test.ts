import { describe, expect, it, vi } from 'vitest';
import { SearchNamespace, type SearchResult } from '../../src/namespaces/search.js';
import { GoogleSearchClient } from '../../src/google-search/client.js';
import { loadNestedFixture } from '../helpers/fixtures.js';
const url='https://www.google.com/search?q=why+is+the+sky+blue&hl=en&gl=us';
const real=loadNestedFixture('google-search','aio-sky-simplified-http.html');
const make=(fetcher:typeof fetch)=>new SearchNamespace(new GoogleSearchClient({fetch:fetcher}),{transport:'http'});

describe('purpose-based Search namespace',()=>{
  it('returns the actual captured Overview inside the full supported envelope with one request',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(real));
    const result:SearchResult=await make(fetcher).get('why is the sky blue');
    expect(result.success).toBe(true);
    if(!result.success)throw new Error('Expected fixture result');
    expect(result.result.aioverview?.text).toContain('Rayleigh Scattering');
    expect(result.result.aioverview?.sources).toHaveLength(7);
    expect(result.result.organicResults).toEqual([]);
    expect(result.metadata).not.toHaveProperty('rawHtml');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('preserves organic results, PAA and related searches alongside the synthetic semantic AIO',()=>{
    const fetcher=vi.fn<typeof fetch>();
    const result=make(fetcher).parse(loadNestedFixture('google-search','structural-search.html'),{sourceUrl:'https://www.google.com/search?q=typescript',rawHtml:true,markdown:false});
    expect(result.success).toBe(true);
    if(!result.success)throw new Error('Expected synthetic semantic result');
    expect(result.result.organicResults).toHaveLength(2);
    expect(result.result.peopleAlsoAsk).toHaveLength(2);
    expect(result.result.relatedSearches?.[0]?.query).toBe('typescript tutorial');
    expect(result.result.aioverview).not.toHaveProperty('markdown');
    expect(result.metadata.rawHtml).toContain('synthetic Search parser contract');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps readable results without an Overview distinct from access denial',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('<div id="search"><div id="rso"><a href="https://example.com/"><h3>A result</h3></a></div></div>')).mockResolvedValueOnce(new Response('',{status:429}));
    const search=make(fetcher),readable=await search.get('query'),blocked=await search.get('query');
    expect(readable.success).toBe(true);
    if(!readable.success)throw new Error('Expected readable result');
    expect(readable.result).not.toHaveProperty('aioverview');
    expect(readable.metadata.aiOverview.status).toBe('unverified');
    expect(blocked).toMatchObject({success:false,error:{code:'BLOCKED'},metadata:{aiOverview:{status:'blocked'}}});
  });
  it('passes locale and cancellation, and throws typed argument/network failures',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    const search=make(fetcher);
    await expect(search.get('query',{country:'GB',language:'fr'})).rejects.toMatchObject({kind:'network'});
    const requested=new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requested.searchParams.get('gl')).toBe('gb');expect(requested.searchParams.get('hl')).toBe('fr');
    await expect(search.get('')).rejects.toMatchObject({kind:'validation'});
    expect(()=>search.parse(real,{sourceUrl:'invalid'})).toThrow('Invalid sourceUrl');
    const controller=new AbortController(),reason=new Error('stop');controller.abort(reason);
    await expect(search.get('query',{signal:controller.signal})).rejects.toBe(reason);
  });
});
