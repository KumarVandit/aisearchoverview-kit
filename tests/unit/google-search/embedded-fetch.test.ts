import {execFile, type ChildProcess} from 'node:child_process';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {embeddedSearchFetch} from '../../../src/transport/embedded.js';
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
describe('embedded Search fetch bridge', () => {
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
});
