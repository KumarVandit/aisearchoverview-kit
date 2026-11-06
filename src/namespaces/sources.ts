import { parse } from 'acorn';
import { descendants, parseHtml } from '../google-search/html.js';
import type { OverviewSource, SourceResolutionResult } from '../types.js';
import { AiSearchError } from '../errors.js';

export interface ResolveSourcesOptions { signal?: AbortSignal; concurrency?: number; timeoutMs?: number; minIntervalMs?: number }
const REDIRECTS = [301,302,303,307,308];
function googleRedirect(url:URL):boolean {
  return url.protocol==='https:' && !url.username && !url.password && ['www.google.com','google.com'].includes(url.hostname) && ['/url','/goto'].includes(url.pathname);
}
function publisher(value:string,base?:URL):URL|undefined {
  try { const url=new URL(value,base);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&!/(^|\.)google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(url.hostname)?url:undefined; }catch{return undefined;}
}
async function smallBody(response:Response):Promise<string> {
  if(!response.body)return '';
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try {
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return '';}chunks.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(bytes);
}
function continueDelay(body:string,target:URL,base:URL):number|undefined {
  const candidates:number[]=[];
  for(const match of body.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
    if(match[1]!.length>32000)continue;
    let tree:unknown;try{tree=parse(match[1]!,{ecmaVersion:'latest'});}catch{continue;}
    const stack:unknown[]=[tree],delays:number[]=[],targets:string[]=[];let timer=false;
    while(stack.length){
      const value=stack.pop();if(!value||typeof value!=='object')continue;
      const node=value as Record<string,any>;
      if(node.type==='VariableDeclarator'&&node.init?.type==='Literal'){
        if(node.id?.name==='delayMillis'&&typeof node.init.value==='number')delays.push(node.init.value);
        if(node.id?.name==='redirectUrl'&&typeof node.init.value==='string')targets.push(node.init.value);
      }
      if(node.type==='CallExpression'&&node.callee?.type==='Identifier'&&node.callee.name==='setTimeout'&&node.arguments?.[1]?.type==='Identifier'&&node.arguments[1].name==='delayMillis')timer=true;
      for(const child of Object.values(node)){if(Array.isArray(child))stack.push(...child);else if(child&&typeof child==='object')stack.push(child);}
    }
    if(timer&&delays.length===1&&targets.length===1&&Number.isFinite(delays[0])&&delays[0]! >= 0){
      try{if(new URL(targets[0]!,base).toString()===target.toString())candidates.push(delays[0]!);}catch{}
    }
  }
  return candidates.length===1?candidates[0]:undefined;
}
function refresh(body:string,base:URL):{url:URL;delayMs:number}|undefined {
  // Only explicit refresh declarations are read; response scripts are never executed.
  const targets:Array<{url:URL;delayMs:number}>=[];
  for(const tag of body.match(/<meta\b[^>]*>/gi)??[]){
    const meta=descendants(parseHtml(tag)).find(node=>node.tag==='meta');
    if(meta?.attrs['http-equiv']?.toLowerCase()!=='refresh')continue;
    const match=/^\s*(\d+(?:\.\d+)?)\s*;\s*url\s*=\s*(.*?)\s*$/i.exec(meta.attrs.content??'');if(!match)continue;
    try{targets.push({url:new URL(match[2]!.replace(/^(["'])(.*)\1$/,'$2'),base),delayMs:Number(match[1])*1000});}catch{return undefined;}
  }
  if(targets.length!==1)return undefined;
  const result=targets[0]!;
  // The URL must independently match the refresh declaration; no script is executed.
  const delay=continueDelay(body,result.url,base);
  if(delay!==undefined)result.delayMs=delay;
  return result;
}
class GoogleCookieJar {
  private readonly cookies=new Map<string,{name:string;value:string;domain:string;path:string;hostOnly:boolean;secure:boolean;expires:number}>();
  copyFrom(other:GoogleCookieJar):void { this.cookies.clear();for(const [key,value] of other.cookies)this.cookies.set(key,{...value}); }
  receive(response:Response,url:URL):void {
    const headers=response.headers;
    const values=typeof headers.getSetCookie==='function'?headers.getSetCookie():(headers.get('Set-Cookie')??'').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
    for(const raw of values){
      const [pair,...attributes]=raw.split(';'),equal=pair!.indexOf('=');if(equal<1)continue;
      const name=pair!.slice(0,equal).trim(),value=pair!.slice(equal+1).trim();if(!/^[A-Za-z0-9_-]+$/.test(name)||/[;\r\n]/.test(value))continue;
      const attrs=new Map(attributes.map(part=>{const i=part.indexOf('=');return [part.slice(0,i<0?undefined:i).trim().toLowerCase(),i<0?'':part.slice(i+1).trim()];}));
      const domain=(attrs.get('domain')??url.hostname).replace(/^\./,'').toLowerCase();
      if(!['google.com','www.google.com'].includes(domain)||!(url.hostname===domain||url.hostname.endsWith('.'+domain)))continue;
      const path=attrs.get('path')??'/';if(!path.startsWith('/'))continue;
      let expires=Infinity;const maxAge=attrs.get('max-age');
      if(maxAge!==undefined&&/^-?\d+$/.test(maxAge))expires=Date.now()+Number(maxAge)*1000;
      else if(attrs.has('expires')){const parsed=Date.parse(attrs.get('expires')!);if(Number.isFinite(parsed))expires=parsed;}
      const key=name+'|'+domain+'|'+path;
      if(expires<=Date.now()){this.cookies.delete(key);continue;}
      this.cookies.set(key,{name,value,domain,path,hostOnly:!attrs.has('domain'),secure:attrs.has('secure'),expires});
    }
  }
  header(url:URL):string {
    return [...this.cookies.values()].filter(cookie=>cookie.expires>Date.now()&&(!cookie.secure||url.protocol==='https:')&&(cookie.hostOnly?url.hostname===cookie.domain:url.hostname===cookie.domain||url.hostname.endsWith('.'+cookie.domain))&&(url.pathname===cookie.path||url.pathname.startsWith(cookie.path.endsWith('/')?cookie.path:cookie.path+'/'))).map(cookie=>cookie.name+'='+cookie.value).join('; ');
  }
}
export class SourcesNamespace {
  constructor(private readonly fetcher: typeof globalThis.fetch, private readonly timeoutMs: number) {}

  /** Resolves bounded Google redirect chains; publisher pages are never requested. */
  async resolve(sources: readonly OverviewSource[], options: ResolveSourcesOptions = {}): Promise<SourceResolutionResult> {
    const concurrency=options.concurrency??4;
    const timeoutMs=options.timeoutMs??this.timeoutMs,minIntervalMs=options.minIntervalMs??500;
    if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>2147483647)throw new AiSearchError('timeoutMs must be a positive bounded number','validation');
    if(!Number.isFinite(minIntervalMs)||minIntervalMs<0||minIntervalMs>2147483647)throw new AiSearchError('minIntervalMs must be a bounded nonnegative number','validation');
    let nextStart=0;
    if(!Number.isInteger(concurrency)||concurrency<1||concurrency>8)throw new AiSearchError('concurrency must be an integer from 1 to 8','validation');
    const shared=new Map<string,Promise<string|undefined>>();
    let paused=false;
    let active=0,seeded=false;
    const seedJar=new GoogleCookieJar();
    const queued:Array<()=>void>=[];
    const acquire=(signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
      if(signal.aborted){reject(signal.reason);return;}
      const start=()=>{signal.removeEventListener('abort',abort);active++;resolve();};
      const abort=()=>{const index=queued.indexOf(start);if(index>=0)queued.splice(index,1);reject(signal.reason);};
      if(active<(seeded?concurrency:1))start();else{queued.push(start);signal.addEventListener('abort',abort,{once:true});}
    });
    const network=async(url:URL,signal:AbortSignal,session:{jar:GoogleCookieJar;initialized:boolean},referer?:URL)=>{
      if(paused)return undefined;
      await acquire(signal);
      try{
        if(paused)return undefined;
        const start=Math.max(Date.now(),nextStart);nextStart=start+minIntervalMs;
        if(start>Date.now())await wait(start-Date.now(),signal);
        if(paused)return undefined;
        if(!session.initialized){session.jar.copyFrom(seedJar);session.initialized=true;}
        const cookie=session.jar.header(url);
        const headers:Record<string,string>={...(cookie?{Cookie:cookie}:{}),...(referer?{Referer:referer.toString()}:{})};
        const response=await this.fetcher(url.toString(),{method:'GET',redirect:'manual',signal,...(Object.keys(headers).length?{headers}:{})});
        session.jar.receive(response,url);
        if(!seeded)seedJar.copyFrom(session.jar);
        const body=await smallBody(response);
        if(response.status===403||response.status===429||/Our systems have detected unusual traffic|id=["']captcha-form["']/i.test(body)){paused=true;return undefined;}
        return {response,body};
      }finally{seeded=true;active--;while(active<concurrency&&queued.length)queued.shift()!();}
    };
    const wait=(delayMs:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
      if(signal.aborted){reject(signal.reason);return;}
      const finish=()=>{signal.removeEventListener('abort',abort);resolve();};
      const timer=setTimeout(finish,delayMs);
      const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};
      signal.addEventListener('abort',abort,{once:true});
    });
    const resolveUrl=async(value:string):Promise<string|undefined>=>{
      let url:URL;try{url=new URL(value);}catch{return undefined;}
      if(!googleRedirect(url)||paused)return undefined;
      const controller=new AbortController(),abort=()=>controller.abort(options.signal?.reason);
      options.signal?.addEventListener('abort',abort,{once:true});
      if(options.signal?.aborted)controller.abort(options.signal.reason);
      const timer=setTimeout(()=>controller.abort(new Error('Citation resolution timed out')),timeoutMs);
      const seen=new Set<string>();
      const session={jar:new GoogleCookieJar(),initialized:false};
      let referer:URL|undefined;

      try{
        for(let hop=0;hop<3;hop++){
          if(controller.signal.aborted)throw controller.signal.reason;
          if(!googleRedirect(url)||seen.has(url.toString()))return undefined;seen.add(url.toString());
          const direct=publisher(url.searchParams.get('url')??url.searchParams.get('q')??'');
          if(direct)return direct.toString();
          const fetched=await network(url,controller.signal,session,referer);if(!fetched)return undefined;
          const {response,body}=fetched;

          const location=REDIRECTS.includes(response.status)?response.headers.get('Location'):undefined;
          const declared=location?{url:new URL(location,url),delayMs:0}:response.status===200?refresh(body,url):undefined;
          if(!declared)return undefined;
          const target=declared.url;
          const destination=publisher(target.toString());if(destination)return destination.toString();
          if(!googleRedirect(target)||seen.has(target.toString())||!Number.isFinite(declared.delayMs)||declared.delayMs>timeoutMs)return undefined;
          // Honor the server's declared navigation delay. Waiting does not occupy a network slot.
          if(declared.delayMs>0)await wait(declared.delayMs,controller.signal);
          referer=url;url=target;
        }
      }catch(error){if(options.signal?.aborted)throw options.signal.reason;}
      finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
      return undefined;
    };
    const output:OverviewSource[]=new Array(sources.length),messages:Array<string|undefined>=new Array(sources.length);let resolved=0;
    await Promise.all(sources.map(async(source,index)=>{
      if(options.signal?.aborted)throw options.signal.reason;
      output[index]={...source};
      let url:URL;try{url=new URL(source.url);}catch{messages[index]=`Invalid source URL at position ${source.position}`;return;}
      if(!googleRedirect(url))return;
      let pending=shared.get(source.url);if(!pending){pending=resolveUrl(source.url);shared.set(source.url,pending);}
      const destination=await pending;
      if(destination){output[index]={...source,url:destination,redirectUrl:source.redirectUrl??source.url};resolved++;}
      else messages[index]=`Source ${source.position} could not be resolved to a publisher URL`;
    }));
    return {sources:output,resolved,warnings:messages.filter((value):value is string=>value!==undefined)};
  }
}
