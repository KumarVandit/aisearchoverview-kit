import { sdk } from '../../src/workers.js';

// Fixed query set keeps this verification endpoint from becoming an open search proxy.
export const queries = [
  'The Catherine',
  'apartments in Austin Texas',
  'apartments in austin texas for rent',
  'apartments in austin texas near the university',
  'apartments in austin texas downtown',
  'apartments in austin texas under $1000',
  'apartments in austin texas cheap',
];
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return Response.json({runtime:'fetch-only',queries,googleRetrievalVerified:false});
    if (request.method !== 'POST' || url.pathname !== '/test') return new Response('Not found',{status:404});
    const value = url.searchParams.get('index');
    const index = value === null ? -1 : Number(value);
    if(!Number.isInteger(index) || index<0 || index>=queries.length) return new Response('Invalid index',{status:400});
    let diagnostic: Record<string,unknown> = {};
    const fetcher: typeof fetch = async (input,init) => {
      const response=await fetch(input,{...init,redirect:'manual'});
      // Only small aggregate diagnostics are exposed; never return page/session data.
      const body=await response.text();
      diagnostic={httpStatus:response.status,characters:body.length,javascriptRequired:/enable javascript|enablejs|\/httpservice\/retry\/enablejs/i.test(body),accessChallenge:/our systems have detected unusual traffic|g-recaptcha|\/sorry\/index/i.test(body)};
      return new Response(body,{status:response.status,headers:{'Content-Type':response.headers.get('Content-Type')??'text/html'}});
    };
    const start=Date.now();
    try {
      const result=await sdk({fetch:fetcher,timeoutMs:15000}).overview.get(queries[index]!,{country:'US',language:'en',signal:request.signal});
      return Response.json({elapsedMs:Date.now()-start,diagnostic,result},{headers:{'Cache-Control':'no-store'}});
    } catch(error) {
      return Response.json({query:queries[index],elapsedMs:Date.now()-start,diagnostic,error:error instanceof Error?error.message:'Request failed'},{status:502,headers:{'Cache-Control':'no-store'}});
    }
  },
};
