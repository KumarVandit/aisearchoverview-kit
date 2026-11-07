import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GoogleSearchError } from '../google-search/errors.js';
import { AiSearchError } from '../errors.js';
import type { IpFamily } from '../types.js';
import { coordinatedSearchFetch } from './coordinator.js';

const runtimeErrors:Record<string,{kind:'timeout'|'parse'|'network';message:string}>={
  RUNTIME_TIMEOUT:{kind:'timeout',message:'Embedded Search runtime exceeded its execution deadline.'},
  HOMEPAGE_UNAVAILABLE:{kind:'network',message:'Google anonymous session could not be initialized.'},
  BOOTSTRAP_FAILED:{kind:'parse',message:'Embedded Search bootstrap process failed; no automatic retry was attempted.'},
  BOOTSTRAP_INCOMPLETE:{kind:'parse',message:'Embedded Search bootstrap did not complete; no automatic retry was attempted.'},
  BOOTSTRAP_NO_NAVIGATION:{kind:'parse',message:'Embedded Search bootstrap returned no Search navigation.'},
  INVALID_RESPONSE:{kind:'parse',message:'Embedded Search returned invalid protocol data.'},
  NETWORK_ERROR:{kind:'network',message:'Embedded Search could not retrieve the Google response.'},
};

export interface EmbeddedSearchOptions {
  bootstrapExecutable: string;
  pythonExecutable?: string;
  /** Address family for this embedded HTTP client; defaults to auto. Fixed families never fall back. */
  ipFamily?: IpFamily;
  /** Retain this client's own anonymous cookies in memory. Reuse serializes requests. */
  session?: 'fresh' | 'reuse';
}

export function normalizeIpFamily(value: unknown): IpFamily {
  if (value === undefined) return 'auto';
  if (value !== 'auto' && value !== 'ipv4' && value !== 'ipv6') throw new AiSearchError('ipFamily must be auto, ipv4 or ipv6', 'configuration');
  return value;
}

/** Uses the separately built embedded DOM/JavaScript library; never imports browser state. */
export function embeddedSearchFetch(options: EmbeddedSearchOptions): typeof globalThis.fetch {
  const ipFamily = normalizeIpFamily(options.ipFamily);
  if (options.session !== undefined && !['fresh','reuse'].includes(options.session)) throw new AiSearchError('session must be fresh or reuse', 'configuration');
  const reuse = options.session === 'reuse';
  let cookies: unknown[] = [];
  const packaged = fileURLToPath(new URL('../runtime/fetch.py', import.meta.url));
  const driver = existsSync(packaged) ? packaged : fileURLToPath(new URL('../../runtime/fetch.py', import.meta.url));
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (url.username || url.password || url.origin !== 'https://www.google.com' || url.pathname !== '/search' || url.hash || method.toUpperCase() !== 'GET') {
      throw new TypeError('The embedded transport supports only Google Search GET requests');
    }
    if (signal?.aborted) throw signal.reason;
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = execFile(options.pythonExecutable ?? 'python3', [driver, url.toString(), options.bootstrapExecutable, ...(reuse ? ['--session'] : [])], {
        signal: signal ?? undefined, timeout: 20_000, maxBuffer: 28 * 1024 * 1024,
        env: { ...process.env, AI_SEARCH_OVERVIEW_IP_FAMILY: ipFamily },
      }, (error, stdout) => {
        if(signal?.aborted){reject(signal.reason);return;}
        if (reuse) {
          // Private IPC only: never attach the jar to a public Response, error or log.
          let state: unknown;
          try { state = (JSON.parse(stdout) as {sessionCookies?:unknown}).sessionCookies; } catch {}
          if (state !== undefined) {
            if (!Array.isArray(state) || state.length > 64 || JSON.stringify(state).length > 65536) {
              reject(new GoogleSearchError('Invalid anonymous session response','parse')); return;
            }
            cookies = state;
          } else if (!error) {
            reject(new GoogleSearchError('Embedded Search did not return anonymous session state','parse')); return;
          }
        }
        if(error){
          let code:unknown;try{code=(JSON.parse(stdout) as {error?:{code?:unknown}}).error?.code;}catch{}
          const known=typeof code==='string'&&Object.hasOwn(runtimeErrors,code)?runtimeErrors[code]:undefined;
          reject(known?new GoogleSearchError(known.message,known.kind):new GoogleSearchError('Embedded Search process failed','network'));
        }
        else resolve(stdout);
      });
      if (reuse) {
        child.stdin?.on('error', () => { /* Process failure is reported by the callback without disclosing IPC. */ });
        child.stdin?.end(JSON.stringify(cookies));
      }
    });
    const result = JSON.parse(stdout) as { status: number; body: string; url: string; headers: Record<string, string>; access?:{kind?:unknown;status?:unknown} };
    if (!Number.isInteger(result.status) || result.status < 200 || result.status > 599 || typeof result.body !== 'string') throw new Error('Invalid embedded Search response');
    if(result.access){
      const access=result.access.kind;
      if(!['blocked','regional-redirect','redirect'].includes(String(access))||result.access.status!==result.status)throw new GoogleSearchError('Invalid embedded Search access classification','parse');
      const messages={blocked:'Google returned an access challenge. Pause requests and respect the upstream restriction.','regional-redirect':'Google redirected this session to a regional Search service. Check the deployment region; no redirect was followed.',redirect:'Google returned an unsupported redirect. Overview presence is unverified; no redirect was followed.'};
      const kind=access as keyof typeof messages;
      const retry=new Headers(result.headers).get('Retry-After')??'';
      const delay=/^\d+$/.test(retry)?Number(retry)*1000:Date.parse(retry)-Date.now();
      throw new GoogleSearchError(messages[kind],'http',result.status,kind==='blocked'?Math.min(2_147_483_647,Math.max(60_000,Number.isFinite(delay)?delay:0)):undefined,{access:kind});
    }
    const finalUrl = new URL(result.url);
    if (finalUrl.origin !== url.origin || finalUrl.pathname !== '/search') throw new Error('Unexpected embedded Search response URL');
    const response = new Response(result.body, { status: result.status, headers: result.headers });
    Object.defineProperty(response, 'url', { value: url.toString() });
    return response;
  };
  // A single jar cannot safely be mutated by overlapping child processes. Keep it
  // after restrictions and pause queued work rather than reset/retry the identity.
  return reuse ? coordinatedSearchFetch(fetcher, {maxConcurrent:1, minIntervalMs:0}) : fetcher;
}
