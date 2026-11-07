import {execFile, type ChildProcess} from 'node:child_process';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {embeddedSearchFetch} from '../../../src/transport/embedded.js';
import {sdk, type IpFamily} from '../../../src/index.js';
vi.mock('node:child_process', () => ({execFile: vi.fn()}));
const execute = vi.mocked(execFile);
const url = 'https://www.google.com/search?q=example&hl=en&gl=us';
function output(value: unknown, error: Error | null = null): void {
  execute.mockImplementation((...args: unknown[]) => {
    const done = args[3] as (error: Error | null, stdout: string, stderr: string) => void;
    done(error, JSON.stringify(value), '');
    return {} as ChildProcess;
  });
}
beforeEach(() => { execute.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); });
describe('embedded Search fetch bridge', () => {
  it.each([undefined, 'auto', 'ipv4', 'ipv6'] as const)('passes IP family %s through a fixed child environment without changing the request', async ipFamily => {
    vi.stubEnv('AI_SEARCH_OVERVIEW_IP_FAMILY', 'untrusted-host-setting');
    output({status:200,body:'<html>actual response</html>',url,headers:{}});
    const response = await embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap', ipFamily})(url);
    expect(await response.text()).toBe('<html>actual response</html>');
    expect(execute.mock.calls[0]?.[1]).toEqual([expect.stringContaining('runtime/fetch.py'),url,'/trusted/bootstrap']);
    expect(execute.mock.calls[0]?.[2]).toMatchObject({env:{AI_SEARCH_OVERVIEW_IP_FAMILY:ipFamily ?? 'auto'}});
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('wires the public built-in embedded configuration to the driver', async () => {
    output({status:200,body:'<html>unknown layout</html>',url,headers:{}});
    const result = await sdk({ipFamily:'ipv4',bootstrapExecutable:process.execPath,pythonExecutable:process.execPath}).overview.get('example');
    expect(result.status).toBe('unverified');
    expect(execute.mock.calls[0]?.[2]).toMatchObject({env:{AI_SEARCH_OVERVIEW_IP_FAMILY:'ipv4'}});
  });
  it.each(['ipv5', 'IPv4', '', null, 4, {}])('rejects invalid IP family %s before creating a child', ipFamily => {
    expect(() => embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap',ipFamily:ipFamily as IpFamily})).toThrow('ipFamily must be auto, ipv4 or ipv6');
    expect(() => sdk({ipFamily:ipFamily as IpFamily})).toThrow('ipFamily must be auto, ipv4 or ipv6');
    expect(execute).not.toHaveBeenCalled();
  });
  it('rejects IP-family configuration for plain HTTP or caller-owned fetch instead of silently ignoring it', () => {
    for (const ipFamily of ['auto','ipv4','ipv6'] as const) {
      for (const config of [{transport:'http' as const}, {fetch:vi.fn<typeof fetch>()}, {transport:'embedded' as const,fetch:vi.fn<typeof fetch>()}]) {
        expect(() => sdk({...config,ipFamily})).toThrow('supported only by the built-in embedded transport');
      }
    }
    expect(execute).not.toHaveBeenCalled();
  });
  it('reports challenge redirects as blocked and preserves upstream status without exposing tokens',async()=>{
    output({status:302,body:'',url:'https://www.google.com/',headers:{'Retry-After':'120'},access:{kind:'blocked',status:302}});
    const fetch=embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap'});
    const client=sdk({fetch,traffic:{minIntervalMs:0,cooldownMs:1000}});
    const first=await client.overview.get('example');
    expect(first).toMatchObject({status:'blocked',sources:[],metadata:{httpStatus:302,retryAfterMs:120000}});
    const second=await client.overview.get('example');
    expect(second.status).toBe('blocked');expect(second.reason).toContain('no upstream request was sent');
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('keeps a regional redirect unverified rather than a network failure or access denial',async()=>{
    output({status:302,body:'',url,headers:{},access:{kind:'regional-redirect',status:302}});
    const response=await sdk({fetch:embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap'})}).overview.get('example');
    expect(response.status).toBe('unverified');expect(response.reason).toContain('regional Search');
    expect(response.metadata.httpStatus).toBe(302);expect(execute).toHaveBeenCalledTimes(1);
  });
  it.each([['RUNTIME_TIMEOUT','timeout'],['BOOTSTRAP_FAILED','parse'],['BOOTSTRAP_INCOMPLETE','parse'],['NETWORK_ERROR','network']])('preserves the safe runtime failure %s through the SDK',async(code,kind)=>{
    output({error:{code,message:'private-cookie-do-not-expose'}},new Error('raw process details do-not-expose'));
    await expect(sdk({fetch:embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap'})}).overview.get('example')).rejects.toMatchObject({kind});
    try{await embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap'})(url);}catch(error){expect(String(error)).not.toContain('do-not-expose');}
  });
  it('passes the fixed driver and caller-owned executable as separate arguments and preserves the response', async () => {
    output({status:200,body:'<html>actual response</html>',url:url+'&sei=private',headers:{'Content-Type':'text/html'}});
    const fetcher=embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap',pythonExecutable:'/trusted/python'});
    const response=await fetcher(url);
    expect(await response.text()).toBe('<html>actual response</html>');
    expect(response.url).toBe(url);
    expect(response.status).toBe(200);
    expect(execute.mock.calls[0]?.[0]).toBe('/trusted/python');
    expect(execute.mock.calls[0]?.[1]).toEqual([expect.stringContaining('runtime/fetch.py'),url,'/trusted/bootstrap']);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('rejects foreign origins, credentials, other routes, fragments and POST Requests before starting a process', async () => {
    const fetcher=embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap'});
    for(const input of ['https://example.com/search?q=example','https://user:password@www.google.com/search?q=example','https://www.google.com/','https://www.google.com/search?q=example#fragment',new Request(url,{method:'POST'})])await expect(fetcher(input)).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
  it('preserves pre-aborted signals without invoking a process', async () => {
    const controller=new AbortController();const reason=new Error('cancelled');controller.abort(reason);
    await expect(embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap'})(url,{signal:controller.signal})).rejects.toBe(reason);
    expect(execute).not.toHaveBeenCalled();
  });
  it('forwards deadlines and cancellation to the process', async () => {
    output({status:429,body:'blocked',url,headers:{'Retry-After':'60'}});
    const controller=new AbortController();
    const response=await embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap'})(url,{signal:controller.signal});
    expect(execute.mock.calls[0]?.[2]).toMatchObject({signal:controller.signal,timeout:20_000});
    expect(response.status).toBe(429);expect(response.headers.get('Retry-After')).toBe('60');
  });
  it('rejects malformed protocol data and foreign response locations', async () => {
    const fetcher=embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap'});
    output({status:200,body:42,url,headers:{}});await expect(fetcher(url)).rejects.toThrow('Invalid embedded Search response');
    output({status:200,body:'',url:'https://example.com/',headers:{}});await expect(fetcher(url)).rejects.toThrow('Unexpected embedded Search response URL');
    output({},new Error('process failure'));await expect(fetcher(url)).rejects.toThrow('Embedded Search process failed');
  });
  it('retains private session IPC between serialized calls and preserves it through a denial', async () => {
    const sent: unknown[] = [];
    const pending: (() => void)[] = [];
    execute.mockImplementation((...args: unknown[]) => {
      const index = sent.length;
      const done = args[3] as (error: Error | null, stdout: string, stderr: string) => void;
      const stdin = {on: vi.fn(), end: (input:string) => {
        sent.push(JSON.parse(input));
        pending.push(() => done(null, JSON.stringify({status:index === 1 ? 302 : 200, body:'<html>ordinary</html>', url, headers:{},
          ...(index === 1 ? {access:{kind:'blocked',status:302}} : {}), sessionCookies:[{name:'SG_SS',value:'private-own-session',domain:'www.google.com',domainSpecified:false,path:'/',secure:true,expires:null,httpOnly:false}]}), ''));
      }};
      return {stdin} as unknown as ChildProcess;
    });
    const fetcher = embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap',session:'reuse'});
    const first = fetcher(url);
    const second = fetcher(url);
    expect(execute).toHaveBeenCalledTimes(1);
    pending.shift()!();
    const response = await first;
    expect(await response.text()).not.toContain('private-own-session');
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(sent[0]).toEqual([]);
    expect(sent[1]).toEqual([expect.objectContaining({value:'private-own-session'})]);
    expect(execute.mock.calls[0]?.[1]).toEqual([expect.stringContaining('runtime/fetch.py'),url,'/trusted/bootstrap','--session']);
    expect(JSON.stringify(execute.mock.calls[1]?.slice(0,3))).not.toContain('private-own-session');
    const denial = expect(second).rejects.toMatchObject({access:'blocked',status:302});
    pending.shift()!();
    await denial;
    await expect(fetcher(url)).rejects.toMatchObject({access:'blocked'});
    expect(execute).toHaveBeenCalledTimes(2);
    const other = embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap',session:'reuse'})(url);
    expect(sent[2]).toEqual([]);
    pending.shift()!();
    await other;
  });
  it('does not launch a cancelled waiting session request', async () => {
    let finish: (() => void) | undefined;
    execute.mockImplementation((...args:unknown[]) => {
      const done = args[3] as (error: Error | null, stdout: string, stderr: string) => void;
      finish = () => done(null,JSON.stringify({status:200,body:'ordinary',url,headers:{},sessionCookies:[]}),'');
      return {stdin:{on:vi.fn(),end:vi.fn()}} as unknown as ChildProcess;
    });
    const fetcher=embeddedSearchFetch({bootstrapExecutable:'/trusted/bootstrap',session:'reuse'});
    const first=fetcher(url);
    const controller=new AbortController(); const reason=new Error('cancel waiting');
    const cancelled=fetcher(url,{signal:controller.signal});
    controller.abort(reason);
    await expect(cancelled).rejects.toBe(reason);
    finish!(); await first;
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('rejects unsupported session configurations before retrieving anything', () => {
    for (const session of ['',null,'rotate',true] as const) {
      expect(() => sdk({session:session as 'reuse'})).toThrow('session must be fresh or reuse');
    }
    expect(() => sdk({session:'reuse',transport:'http'})).toThrow('only by the built-in embedded');
    expect(() => sdk({session:'reuse',fetch:vi.fn()})).toThrow('only by the built-in embedded');
    expect(() => sdk({session:'reuse',traffic:{maxConcurrent:2}})).toThrow('requires traffic.maxConcurrent to be 1');
    expect(execute).not.toHaveBeenCalled();
  });
});
