import { SourcesNamespace } from './sources.js';
import { AiSearchError, type AiSearchErrorKind } from '../errors.js';
import { GoogleSearchClient } from '../google-search/client.js';
import { parseGoogleSearchMonitorHtml } from '../google-search/monitor.js';
import type { GoogleSearchMonitorResponse } from '../google-search/types.js';
import type { KitConfig, OverviewOptions, ParseOverviewOptions } from '../types.js';

export interface SearchOptions extends OverviewOptions {
  /** Resolve both citation and organic Google redirects without fetching publisher pages. */
  resolveSources?: boolean;
  resolutionConcurrency?: number;
  resolutionTimeoutMs?: number;
  resolutionMinIntervalMs?: number;
  /** Includes original response HTML for diagnosis only when explicitly requested. */
  rawHtml?: boolean;
}
export interface ParseSearchOptions extends ParseOverviewOptions { rawHtml?: boolean; httpStatus?: number }
export type SearchResult = GoogleSearchMonitorResponse;

function checked(report: SearchResult): SearchResult {
  if (!report.success && /^(?:VALIDATION|CONFIGURATION|NETWORK|HTTP|PARSE|TIMEOUT)_ERROR$/.test(report.error.code)) {
    throw new AiSearchError(report.error.message,report.error.code.replace('_ERROR','').toLowerCase() as AiSearchErrorKind,report.metadata.httpStatus);
  }
  return report;
}

/** Supported surrounding Search fields plus the Overview in one HTTP response. */
export class SearchNamespace {
  constructor(private readonly client: GoogleSearchClient, private readonly config: KitConfig, private readonly beforeGet?:()=>void, private readonly sources = new SourcesNamespace(config.fetch??globalThis.fetch,config.timeoutMs??60_000)) {}
  private request(query:string,options:SearchOptions) {
    if(typeof query!=='string'||!query.trim())throw new AiSearchError('query must be a nonempty string','validation');
    return {query,location:options.location,device:options.device,country:options.country??this.config.locale?.country??'US',hl:options.language??this.config.locale?.language??'en',include:{rawHtml:options.rawHtml??false,aioverview:{markdown:options.markdown??true}}};
  }
  async get(query:string,options:SearchOptions={}):Promise<SearchResult> {
    const started=performance.now();
    if(options.resolveSources!==undefined&&typeof options.resolveSources!=='boolean')throw new AiSearchError('resolveSources must be a boolean','validation');
    for(const [name,value] of [['resolutionConcurrency',options.resolutionConcurrency],['resolutionTimeoutMs',options.resolutionTimeoutMs],['resolutionMinIntervalMs',options.resolutionMinIntervalMs]] as const){if(value!==undefined&&(!Number.isFinite(value)||(name==='resolutionMinIntervalMs'?value<0:value<=0)||value>2147483647||(name==='resolutionConcurrency'&&(!Number.isInteger(value)||value>8))))throw new AiSearchError(name+' is invalid','validation');}
    const request=this.request(query,options);
    this.beforeGet?.();
    const report=checked(await this.client.monitor(request,{signal:options.signal}));
    if(!report.success||!options.resolveSources)return report;
    const overview=report.result.aioverview,organic=report.result.organicResults??[];
    const urls=[...(overview?.sources.map(source=>({url:source.url,title:source.label}))??[]),...organic.map(item=>({url:item.link,title:item.title})),...(overview?.citationPills?.map(pill=>({url:pill.url,title:pill.label}))??[])];
    const unique=[...new Map(urls.map(source=>[source.url,source])).values()].map((source,index)=>({...source,position:index+1}));
    const startResolution=performance.now();
    const resolution=await this.sources.resolve(unique,{signal:options.signal,concurrency:options.resolutionConcurrency,timeoutMs:options.resolutionTimeoutMs,minIntervalMs:options.resolutionMinIntervalMs});
    const destinations=new Map(resolution.sources.map(source=>[source.redirectUrl??source.url,source.url]));
    if(overview){
      overview.sources=overview.sources.map(source=>{const url=destinations.get(source.url)??source.url;return {...source,url,...(url!==source.url?{redirectLink:source.redirectLink??source.url}:{})};});
      if(overview.citationPills)overview.citationPills=overview.citationPills.map(pill=>{const url=destinations.get(pill.url)??pill.url;return {...pill,url,domain:new URL(url).hostname};});
    }
    report.result.organicResults=organic.map(item=>{const link=destinations.get(item.link)??item.link;return {...item,link,...(link!==item.link?{redirectLink:item.redirectLink??item.link}:{})};});
    const attempted=unique.filter(source=>{try{const url=new URL(source.url);return ['www.google.com','google.com'].includes(url.hostname)&&['/url','/goto'].includes(url.pathname);}catch{return false;}}).length;
    report.metadata.resolution={attempted,resolved:resolution.resolved,unresolved:attempted-resolution.resolved,durationMs:performance.now()-startResolution};
    if(attempted>0&&resolution.resolved===attempted)report.metadata.warnings=report.metadata.warnings.map(warning=>warning==='Unextracted fields are omitted; source redirect destinations and answer completeness are not verified.'?'Unextracted fields are omitted; publisher pages were not fetched and answer completeness remains unverified.':warning);
    report.metadata.warnings.push(...resolution.warnings);
    if(report.metadata.timing)report.metadata.timing.totalMs=performance.now()-started;
    return report;
  }
  parse(html:string,options:ParseSearchOptions):SearchResult {
    let source:URL;try{source=new URL(options.sourceUrl);}catch{throw new AiSearchError('Invalid sourceUrl','validation');}
    const query=options.query??source.searchParams.get('q')??'';
    return checked(parseGoogleSearchMonitorHtml(html,this.request(query,options),{sourceUrl:source.toString(),query,httpStatus:options.httpStatus}));
  }
}
