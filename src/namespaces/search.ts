import { AiSearchError, type AiSearchErrorKind } from '../errors.js';
import { GoogleSearchClient } from '../google-search/client.js';
import { parseGoogleSearchMonitorHtml } from '../google-search/monitor.js';
import type { GoogleSearchMonitorResponse } from '../google-search/types.js';
import type { KitConfig, OverviewOptions, ParseOverviewOptions } from '../types.js';

export interface SearchOptions extends OverviewOptions {
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
  constructor(private readonly client: GoogleSearchClient, private readonly config: KitConfig, private readonly beforeGet?:()=>void) {}
  private request(query:string,options:SearchOptions) {
    if(typeof query!=='string'||!query.trim())throw new AiSearchError('query must be a nonempty string','validation');
    return {query,country:options.country??this.config.locale?.country??'US',hl:options.language??this.config.locale?.language??'en',include:{rawHtml:options.rawHtml??false,aioverview:{markdown:options.markdown??true}}};
  }
  async get(query:string,options:SearchOptions={}):Promise<SearchResult> {
    const request=this.request(query,options);
    this.beforeGet?.();
    return checked(await this.client.monitor(request,{signal:options.signal}));
  }
  parse(html:string,options:ParseSearchOptions):SearchResult {
    let source:URL;try{source=new URL(options.sourceUrl);}catch{throw new AiSearchError('Invalid sourceUrl','validation');}
    const query=options.query??source.searchParams.get('q')??'';
    return checked(parseGoogleSearchMonitorHtml(html,this.request(query,options),{sourceUrl:source.toString(),query,httpStatus:options.httpStatus}));
  }
}
