import {afterEach,describe,it,expect,vi} from 'vitest';
import {SourcesNamespace} from '../../src/namespaces/sources.js';
const google='https://www.google.com/url?q=CAESsynthetic&uoh=3';
const source=(url=google)=>({position:1,title:'Publisher',url});
afterEach(()=>vi.useRealTimers());
describe('publisher URL resolution',()=>{
  it('decodes explicit publisher destinations without making network requests',async()=>{
    const fetcher=vi.fn<typeof fetch>();const result=await new SourcesNamespace(fetcher,20000).resolve([source('https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Farticle')]);
    expect(result.sources[0]?.url).toBe('https://example.com/article');expect(result.resolved).toBe(1);expect(fetcher).not.toHaveBeenCalled();
  });
  it('drains small redirect bodies and stops before requesting a publisher',async()=>{
    const cancel=vi.fn();const response=new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('Moved'));controller.close();},cancel}),{status:302,headers:{Location:'https://example.com/article'}});
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response);const result=await new SourcesNamespace(fetcher,20000).resolve([source()]);
    expect(result.resolved).toBe(1);expect(response.bodyUsed).toBe(true);expect(cancel).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('honors delayed Google navigation while bounding active requests rather than sleeping jobs',async()=>{
    vi.useFakeTimers();let active=0,peak=0;const first:string[]=[];
    const fetcher=vi.fn<typeof fetch>(async input=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;const url=new URL(String(input));
      if(url.pathname==='/url'){first.push(url.searchParams.get('q')!);return new Response('<meta http-equiv="refresh" content="11;url=/goto?url='+url.searchParams.get('q')+'">');}
      return new Response('Moved',{status:302,headers:{Location:'https://example.com/'+url.searchParams.get('url')}});
    });
    const task=new SourcesNamespace(fetcher,20000).resolve(Array.from({length:10},(_,i)=>({...source(google.replace('synthetic','synthetic'+i)),position:i+1})),{concurrency:2,minIntervalMs:0});
    await vi.advanceTimersByTimeAsync(0);expect(first).toHaveLength(10);expect(fetcher).toHaveBeenCalledTimes(10);
    await vi.advanceTimersByTimeAsync(10999);expect(fetcher).toHaveBeenCalledTimes(10);
    await vi.advanceTimersByTimeAsync(1);const result=await task;
    expect(result.resolved).toBe(10);expect(fetcher).toHaveBeenCalledTimes(20);expect(peak).toBeLessThanOrEqual(2);
  });
  it('deduplicates identical redirects and preserves order and independent source records',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('Moved',{status:302,headers:{Location:'https://example.com/article'}}));
    const result=await new SourcesNamespace(fetcher,20000).resolve([source(),{...source(),position:2}]);
    expect(fetcher).toHaveBeenCalledTimes(1);expect(result.resolved).toBe(2);expect(result.sources.map(s=>s.position)).toEqual([1,2]);expect(result.sources[0]).not.toBe(result.sources[1]);
  });
  it('never follows unexpected origins, schemes, paths, or repeated Google hops',async()=>{
    for(const target of ['javascript:alert(1)','https://www.google.com/sorry/index','https://user:pass@example.com/','/url?q=CAESsynthetic&uoh=3']){
      const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('Moved',{status:302,headers:{Location:target}}));
      const result=await new SourcesNamespace(fetcher,20000).resolve([source()]);expect(result.resolved).toBe(0);expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('preserves cancellation during a declared wait without sending the next hop',async()=>{
    vi.useFakeTimers();const controller=new AbortController(),reason=new Error('stop');
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('<meta http-equiv="refresh" content="11;url=/goto?url=CAESnext">'));
    const task=new SourcesNamespace(fetcher,20000).resolve([source()],{signal:controller.signal});const rejected=expect(task).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);controller.abort(reason);await rejected;expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds response bytes and Google-hop counts',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(70000)));const result=await new SourcesNamespace(fetcher,20000).resolve([source()]);expect(result.resolved).toBe(0);expect(fetcher).toHaveBeenCalledTimes(1);
    let hop=0;const endless=vi.fn<typeof fetch>(async()=>new Response('Moved',{status:302,headers:{Location:'/goto?url=CAEShop'+(++hop)}}));expect((await new SourcesNamespace(endless,20000).resolve([source()])).resolved).toBe(0);expect(endless).toHaveBeenCalledTimes(3);
  });
  it('isolates cookies for delayed redirect chains instead of mixing concurrent verification sessions',async()=>{
    vi.useFakeTimers();
    const fetcher=vi.fn<typeof fetch>(async(input,init)=>{
      const url=new URL(String(input)),cookie=new Headers(init?.headers).get('Cookie')??'';
      if(url.pathname==='/url'){
        const id=url.searchParams.get('q')!;
        return new Response('<meta http-equiv="refresh" content="1;url=/goto?url='+id+'">',{headers:{'Set-Cookie':'FLOW='+id+'; Domain=.google.com; Path=/; Secure; HttpOnly'}});
      }
      const id=url.searchParams.get('url')!;
      return cookie.includes('FLOW='+id)?new Response('Moved',{status:302,headers:{Location:'https://example.com/'+id}}):new Response('Wrong session',{status:400});
    });
    const task=new SourcesNamespace(fetcher,20000).resolve(Array.from({length:10},(_,i)=>({...source(google.replace('synthetic','context'+i)),position:i+1})),{concurrency:4,minIntervalMs:0});
    await vi.advanceTimersByTimeAsync(1000);expect((await task).resolved).toBe(10);
    expect(fetcher).toHaveBeenCalledTimes(20);
    for(const [input,init] of fetcher.mock.calls)if(new URL(String(input)).pathname==='/goto')expect(new Headers(init?.headers).get('Referer')).toContain('/url?');
  });
  it('does not share Google cookies with another resolution call or accept foreign-domain cookies',async()=>{
    const seen:Array<string|null>=[];
    const fetcher=vi.fn<typeof fetch>(async(_input,init)=>{seen.push(new Headers(init?.headers).get('Cookie'));const headers=new Headers({Location:'https://example.com/article'});headers.append('Set-Cookie','FOREIGN=bad; Domain=evil.example; Path=/');headers.append('Set-Cookie','OWN=private; Domain=.google.com; Path=/; Secure');return new Response('Moved',{status:302,headers});});
    const resolver=new SourcesNamespace(fetcher,20000);
    await resolver.resolve([source(),{...source(google+'extra'),position:2}]);
    expect(seen[0]).toBeNull();expect(seen[1]).toBe('OWN=private');
    await resolver.resolve([source()]);expect(seen[2]).toBeNull();
  });

  it('paces lookup starts and supports a separate bounded resolution deadline',async()=>{
    vi.useFakeTimers();const starts:number[]=[];
    const fetcher=vi.fn<typeof fetch>(async()=>{starts.push(Date.now());return new Response('Moved',{status:302,headers:{Location:'https://example.com/article'}});});
    const task=new SourcesNamespace(fetcher,20000).resolve(Array.from({length:3},(_,i)=>({...source(google+i),position:i+1})),{timeoutMs:60000});
    await vi.advanceTimersByTimeAsync(1000);expect((await task).resolved).toBe(3);expect(starts[1]!-starts[0]!).toBeGreaterThanOrEqual(500);expect(starts[2]!-starts[1]!).toBeGreaterThanOrEqual(500);
  });
  it('reads a literal Continue timer only when it matches the declared refresh target',async()=>{
    vi.useFakeTimers();
    const html='<meta http-equiv="refresh" content="3;url=/goto?url=CAESnext"><script>var delayMillis=1000;var redirectUrl="/goto?url=CAESnext";setTimeout(function(){},delayMillis);</script>';
    const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(html)).mockResolvedValue(new Response('Moved',{status:302,headers:{Location:'https://example.com/article'}}));
    const task=new SourcesNamespace(fetcher,20000).resolve([source()],{minIntervalMs:0});
    await vi.advanceTimersByTimeAsync(999);expect(fetcher).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(1);expect((await task).resolved).toBe(1);
    const unrelated=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(html.replace('var redirectUrl="/goto?url=CAESnext"','var redirectUrl="https://evil.example/"'))).mockResolvedValue(new Response('Moved',{status:302,headers:{Location:'https://example.com/article'}}));
    const second=new SourcesNamespace(unrelated,20000).resolve([source()],{minIntervalMs:0});await vi.advanceTimersByTimeAsync(1000);expect(unrelated).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(2000);expect((await second).resolved).toBe(1);
  });

  it('maintains start spacing when initial session setup is slow',async()=>{
    vi.useFakeTimers();const starts:number[]=[];
    const fetcher=vi.fn<typeof fetch>(async()=>{starts.push(Date.now());if(starts.length===1)await new Promise(resolve=>setTimeout(resolve,1000));return new Response('Moved',{status:302,headers:{Location:'https://example.com/article'}});});
    const task=new SourcesNamespace(fetcher,20000).resolve(Array.from({length:3},(_,i)=>({...source(google+i),position:i+1})),{concurrency:4});
    await vi.advanceTimersByTimeAsync(2000);expect((await task).resolved).toBe(3);
    for(let i=1;i<starts.length;i++)expect(starts[i]!-starts[i-1]!).toBeGreaterThanOrEqual(500);
  });

});
