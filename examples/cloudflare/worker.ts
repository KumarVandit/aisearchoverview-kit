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
    const mode = url.searchParams.get('mode') ?? 'direct';
    if (!['direct','session','native-session','desktop','mobile'].includes(mode)) return new Response('Invalid mode',{status:400});
    const headers = new Headers({Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','Accept-Language':'en-US,en;q=0.9'});
    if (mode === 'native-session') headers.set('User-Agent','Mozilla/5.0 (X11; Linux x86_64) mgbrowser/0.9.32');
    if(mode==='desktop') headers.set('User-Agent','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    if(mode==='mobile') headers.set('User-Agent','Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36');
    let diagnostic: Record<string,unknown> = {mode};
    if(mode === 'session' || mode === 'native-session') {
      const homepage = await fetch('https://www.google.com/',{headers,redirect:'manual',signal:request.signal});
      const cookies = homepage.headers.getSetCookie().map(value=>value.split(';',1)[0]!).filter(value=>/^[A-Za-z0-9_-]+=/.test(value));
      diagnostic.homepageStatus=homepage.status;
      const location=homepage.headers.get('Location');
      if(location){const target=new URL(location,'https://www.google.com/');diagnostic.homepageRedirect={origin:target.origin,path:target.pathname};}
      diagnostic.cookieCount=cookies.length;
      await homepage.body?.cancel();
      if(homepage.status!==200) return Response.json({query:queries[index],diagnostic,error:'Homepage initialization failed'},{status:502});
      if(cookies.length) headers.set('Cookie',cookies.join('; '));
    }
    const fetcher: typeof fetch = async (input,init) => {
      const response=await fetch(input,{...init,headers,redirect:'manual'});
      // Only small aggregate diagnostics are exposed; never return page/session data.
      const body=await response.text();
      diagnostic={...diagnostic,httpStatus:response.status,characters:body.length,sessionBootstrap:body.includes('knitsail')&&body.includes('var challenge_version='),javascriptRequired:/enable javascript|enablejs|\/httpservice\/retry\/enablejs/i.test(body),accessChallenge:/our systems have detected unusual traffic|g-recaptcha|\/sorry\/index/i.test(body)};
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
