import {describe,it,expect,vi,afterEach} from 'vitest';
import worker from '../../examples/cloudflare/worker.js';
import {loadNestedFixture} from '../helpers/fixtures.js';
afterEach(()=>vi.restoreAllMocks());
const endpoint='https://worker.example/test?index=2';
describe('Worker HTTP session comparison',()=>{
  it('keeps server-issued cookies within one request and does not expose them',async()=>{
    const network=vi.spyOn(globalThis,'fetch')
      .mockResolvedValueOnce(new Response('home',{headers:{'Set-Cookie':'NID=private-test-value; Path=/; HttpOnly; Secure'}}))
      .mockResolvedValueOnce(new Response(loadNestedFixture('google-search','aio-sky-simplified-http.html')));
    const response=await worker.fetch(new Request(endpoint+'&mode=session',{method:'POST'}));
    const body=await response.text();
    expect(network).toHaveBeenCalledTimes(2);
    expect(new Headers(network.mock.calls[1]![1]!.headers).get('Cookie')).toBe('NID=private-test-value');
    expect(body).not.toContain('private-test-value');
    expect(JSON.parse(body).result.status).toBe('present');
  });
  it('does not request Search or follow a challenge after homepage denial',async()=>{
    const network=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('redirect',{status:302,headers:{Location:'https://www.google.com/sorry/index?private=excluded'}}));
    const response=await worker.fetch(new Request(endpoint+'&mode=session',{method:'POST'}));
    const body=await response.json();
    expect(network).toHaveBeenCalledTimes(1);
    expect(body.diagnostic.homepageRedirect).toEqual({origin:'https://www.google.com',path:'/sorry/index'});
    expect(JSON.stringify(body)).not.toContain('excluded');
    expect(response.status).toBe(502);
  });
  it('rejects arbitrary comparison modes without upstream requests',async()=>{
    const network=vi.spyOn(globalThis,'fetch');
    expect((await worker.fetch(new Request(endpoint+'&mode=unknown',{method:'POST'}))).status).toBe(400);
    expect(network).not.toHaveBeenCalled();
  });
});
