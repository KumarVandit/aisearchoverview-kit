import {afterEach,describe,expect,it,vi} from 'vitest';
import {coordinatedSearchFetch} from '../../src/transport/coordinator.js';
const target='https://www.google.com/search?q=synthetic';
afterEach(()=>vi.useRealTimers());
const response=(status=200,body='synthetic',headers:Record<string,string>={})=>({status,headers:new Headers(headers),clone:()=>({text:async()=>body})}) as Response;

describe('per-client Search traffic coordinator, synthetic upstream only',()=>{
  it('bounds active requests and start spacing independently',async()=>{
    vi.useFakeTimers();const starts:number[]=[];let active=0,peak=0;
    const upstream=vi.fn<typeof fetch>(async()=>{starts.push(Date.now());peak=Math.max(peak,++active);await new Promise(resolve=>setTimeout(resolve,1200));active--;return response();});
    const fetcher=coordinatedSearchFetch(upstream,{maxConcurrent:3,minIntervalMs:500});
    const settled=Promise.all(Array.from({length:30},()=>fetcher(target)));
    await vi.runAllTimersAsync();expect(await settled).toHaveLength(30);expect(peak).toBe(3);
    for(let i=1;i<starts.length;i++)expect(starts[i]!-starts[i-1]!).toBeGreaterThanOrEqual(500);
  });
  it('holds its slot until the cloned response body is available and preserves the original response',async()=>{
    let finishBody!:()=>void;
    const original=response();original.clone=(()=>({text:()=>new Promise<string>(resolve=>{finishBody=()=>resolve('body');})})) as typeof original.clone;
    const upstream=vi.fn<typeof fetch>().mockResolvedValueOnce(original).mockResolvedValue(response());
    const fetcher=coordinatedSearchFetch(upstream,{maxConcurrent:1,minIntervalMs:0});
    const first=fetcher(target),second=fetcher(target);await Promise.resolve();await Promise.resolve();
    expect(upstream).toHaveBeenCalledTimes(1);finishBody();expect(await first).toBe(original);await second;expect(upstream).toHaveBeenCalledTimes(2);
  });
  it('removes queued cancellations without sending them upstream and preserves the abort reason',async()=>{
    let finish!:()=>void;
    const upstream=vi.fn<typeof fetch>(async()=>{await new Promise<void>(resolve=>{finish=resolve;});return response();});
    const fetcher=coordinatedSearchFetch(upstream,{maxConcurrent:1,minIntervalMs:0});
    const first=fetcher(target),controller=new AbortController(),reason=new Error('stop');
    const queued=fetcher(target,{signal:controller.signal});const rejected=expect(queued).rejects.toBe(reason);controller.abort(reason);await rejected;
    expect(upstream).toHaveBeenCalledTimes(1);finish();await first;
  });
  it('preserves active cancellation while retaining the slot until an ignoring upstream settles',async()=>{
    let finish!:()=>void;
    const upstream=vi.fn<typeof fetch>().mockImplementationOnce(async()=>{await new Promise<void>(resolve=>{finish=resolve;});return response();}).mockResolvedValue(response());
    const fetcher=coordinatedSearchFetch(upstream,{maxConcurrent:1,minIntervalMs:0});
    const controller=new AbortController(),reason=new Error('cancel active');
    const first=fetcher(target,{signal:controller.signal}),second=fetcher(target);
    const rejected=expect(first).rejects.toBe(reason);controller.abort(reason);await rejected;
    expect(upstream).toHaveBeenCalledTimes(1);finish();await second;expect(upstream).toHaveBeenCalledTimes(2);
  });
  it.each([403,429,200])('rejects pending work after a recognized denial (%s), drains in-flight, and honors cooldown',async status=>{
    vi.useFakeTimers();const upstream=vi.fn<typeof fetch>().mockResolvedValueOnce(response(status,status===200?'Our systems have detected unusual traffic from your computer network':'denied',{'retry-after':'120'})).mockResolvedValue(response());
    const fetcher=coordinatedSearchFetch(upstream,{maxConcurrent:1,minIntervalMs:0,cooldownMs:1000});
    const pending=Promise.allSettled([fetcher(target),fetcher(target),fetcher(target)]);
    const results=await pending;expect(upstream).toHaveBeenCalledTimes(1);expect(results.map(result=>result.status)).toEqual(['fulfilled','rejected','rejected']);
    await expect(fetcher(target)).rejects.toMatchObject({kind:'http',status:status===200?403:status});
    await vi.advanceTimersByTimeAsync(119999);await expect(fetcher(target)).rejects.toMatchObject({kind:'http'});
    await vi.advanceTimersByTimeAsync(1);await fetcher(target);expect(upstream).toHaveBeenCalledTimes(2);
  });
  it('passes non-Search calls through and leaves disabled clients unchanged',async()=>{
    const upstream=vi.fn<typeof fetch>().mockResolvedValue(response());expect(coordinatedSearchFetch(upstream)).toBe(upstream);
    const fetcher=coordinatedSearchFetch(upstream,{maxConcurrent:1,minIntervalMs:60000});
    await Promise.all([fetcher('https://example.com/'),fetcher('https://example.com/')]);expect(upstream).toHaveBeenCalledTimes(2);
  });
});
