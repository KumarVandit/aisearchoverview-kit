import { AiSearchError } from '../errors.js';
import type { KitConfig } from '../types.js';
import { parseAiModeTurns } from '../ai-mode/parser.js';
import type { AiModeOptions, AiModeResult, ParseAiModeOptions } from '../ai-mode/types.js';
export class AiModeNamespace {
  constructor(private readonly fetcher:typeof fetch,private readonly config:KitConfig={},private readonly beforeGet?:()=>void) {}
  parse(html:string, options:ParseAiModeOptions):AiModeResult {
    let source:URL;
    try { source=new URL(options.sourceUrl); } catch { throw new AiSearchError('Invalid sourceUrl','validation'); }
    const query=options.query??source.searchParams.get('q')??'';
    const eligible=source.hostname==='www.google.com'&&source.pathname==='/search'&&source.searchParams.get('udm')==='50';
    const blocked=/\/sorry\//.test(source.pathname)||/Our systems have detected unusual traffic|g-recaptcha/.test(html);
    const turns=eligible&&!blocked?parseAiModeTurns(html,source.toString(),options.markdown??true):[];
    const last=turns.at(-1);
    return {query,status:last?'present':blocked?'blocked':'unverified',...(last??{sources:[]}),turns,reason:last?'Recognized AI Mode turn content in supplied HTML.':blocked?'Recognized access challenge.':'AI Mode answer presence was not established.',metadata:{country:options.country??this.config.locale?.country??'US',language:options.language??this.config.locale?.language??'en',transport:'snapshot',durationMs:0,sourceUrl:source.toString(),completeness:'unverified',warnings:['AI Mode HTTP delivery and generation completeness are unverified. No browser fallback or conversational HTTP protocol is implemented.']}};
  }
  async get(query:string,options:AiModeOptions={}):Promise<AiModeResult> {
    if (typeof query!=='string'||!query.trim())throw new AiSearchError('query must be a nonempty string','validation');
    this.beforeGet?.();
    const endpoint=new URL('https://www.google.com/search');endpoint.search=new URLSearchParams({q:query,udm:'50',hl:options.language??this.config.locale?.language??'en',gl:(options.country??this.config.locale?.country??'US').toLowerCase()}).toString();
    const controller=new AbortController();const caller=options.signal;const abort=()=>controller.abort(caller?.reason);
    if(caller?.aborted)throw caller.reason;
    caller?.addEventListener('abort',abort,{once:true});
    const started=performance.now();let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},this.config.timeoutMs??20_000);
    try {
      const response=await this.fetcher(endpoint,{signal:controller.signal});
      if(!response.ok&&![403,429].includes(response.status))throw new AiSearchError('AI Mode HTTP request failed','http',response.status);
      const html=await response.text(), result=this.parse(html,{...options,sourceUrl:endpoint.toString(),query});
      if([403,429].includes(response.status)){result.status='blocked';result.reason='AI Mode request was blocked.';delete result.text;delete result.markdown;delete result.images;delete result.places;result.sources=[];result.turns=[];}
      result.metadata={...result.metadata,transport:this.config.transport??'http',durationMs:Math.round(performance.now()-started),httpStatus:response.status};return result;
    }catch(error){if(caller?.aborted)throw caller.reason;if(timedOut)throw new AiSearchError('AI Mode request timed out','timeout');if(error instanceof AiSearchError)throw error;throw new AiSearchError('AI Mode request failed','network');}
    finally{clearTimeout(timer);caller?.removeEventListener('abort',abort);}
  }
}
