import { googleChallengeRedirect } from '../google-search/access.js';
import { AiSearchError } from '../errors.js';

export interface TrafficOptions {
  /** Per-client limit; defaults to one when traffic controls are enabled. */
  maxConcurrent?: number;
  /** Minimum time between request starts; defaults to 1000ms. */
  minIntervalMs?: number;
  /** Minimum pause after access denial; defaults to 60000ms. Retry-After can extend it. */
  cooldownMs?: number;
}

interface Job {
  input: Parameters<typeof fetch>[0];
  init: Parameters<typeof fetch>[1];
  signal?: AbortSignal | null;
  resolve: (response:Response) => void;
  reject: (error:unknown) => void;
  abort: () => void;
  running: boolean;
  settled: boolean;
}

const MAX_DELAY = 2_147_483_647;

function searchRequest(input:Parameters<typeof fetch>[0], init:Parameters<typeof fetch>[1]): boolean {
  try {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    return method.toUpperCase() === 'GET' && url.protocol === 'https:' && !url.username && !url.password && ['google.com','www.google.com'].includes(url.hostname) && url.pathname === '/search';
  } catch { return false; }
}

function retryAfter(headers:Headers, now:number): number {
  const value = headers.get('retry-after')?.trim();
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Math.min(MAX_DELAY, Number(value) * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(MAX_DELAY, Math.max(0,date - now)) : 0;
}

/** One local client's queue; no retries, proxy rotation or coordination across machines. */
export function coordinatedSearchFetch(fetcher:typeof fetch, options?:TrafficOptions): typeof fetch {
  if (options === undefined) return fetcher;
  if (!options || typeof options !== 'object') throw new AiSearchError('traffic must be an object','configuration');
  for (const key of Object.keys(options)) if (!['maxConcurrent','minIntervalMs','cooldownMs'].includes(key)) throw new AiSearchError('Unsupported traffic option: ' + key,'configuration');
  const maximum = options.maxConcurrent ?? 1, interval = options.minIntervalMs ?? 1000, cooldown = options.cooldownMs ?? 60_000;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 8) throw new AiSearchError('traffic.maxConcurrent must be an integer from 1 to 8','configuration');
  for (const [name,value] of [['minIntervalMs',interval],['cooldownMs',cooldown]] as const) if (!Number.isFinite(value) || value < 0 || value > MAX_DELAY) throw new AiSearchError('traffic.' + name + ' must be a bounded nonnegative number','configuration');
  const queue:Job[] = [];
  let active = 0, nextStart = 0, blockedUntil = 0, denialStatus = 429, timer:ReturnType<typeof setTimeout> | undefined;
  const pauseError = () => new AiSearchError('This client is paused after a Google access denial until ' + new Date(blockedUntil).toISOString() + '; no upstream request was sent.','http',denialStatus);
  const finish = (job:Job, response?:Response, error?:unknown) => {
    if (job.settled) return;
    job.settled = true;
    job.signal?.removeEventListener('abort',job.abort);
    if (response) job.resolve(response); else job.reject(error);
  };
  const pump = () => {
    if (timer) { clearTimeout(timer); timer = undefined; }
    if (Date.now() < blockedUntil) { for (const job of queue.splice(0)) finish(job,undefined,pauseError()); return; }
    while (queue.length && active < maximum) {
      const delay = nextStart - Date.now();
      if (delay > 0) { timer = setTimeout(pump,delay); return; }
      const job = queue.shift()!;
      if (job.signal?.aborted) { finish(job,undefined,job.signal.reason); continue; }
      job.running = true; active++; nextStart = Date.now() + interval;
      void (async () => {
        try {
          const response = await fetcher(job.input,job.init);
          // Keep the slot until the response body arrives while preserving the original Response URL and body.
          const body = await response.clone().text();
          const challengeRedirect = googleChallengeRedirect(job.input instanceof Request ? job.input.url : String(job.input),response.status,response.headers.get('Location'));
          const denied = challengeRedirect || response.status === 403 || response.status === 429 || (response.status === 200 && /(?:Our systems have detected unusual traffic from your computer network|id=["']captcha-form["'])/i.test(body));
          if (denied) {
            denialStatus = response.status === 200 ? 403 : response.status;
            blockedUntil = Math.max(blockedUntil,Date.now() + Math.max(cooldown,retryAfter(response.headers,Date.now())));
          }
          finish(job,response);
        } catch (error) { finish(job,undefined,error); }
        finally { active--; pump(); }
      })();
    }
  };
  return (input,init) => {
    if (!searchRequest(input,init)) return fetcher(input,init);
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (Date.now() < blockedUntil) return Promise.reject(pauseError());
    return new Promise<Response>((resolve,reject) => {
      const job:Job = {input,init,signal,resolve,reject,running:false,settled:false,abort:() => {
        if (!job.running) { const index = queue.indexOf(job); if (index >= 0) queue.splice(index,1); }
        finish(job,undefined,signal?.reason);
        pump();
      }};
      signal?.addEventListener('abort',job.abort,{once:true});
      queue.push(job); pump();
    });
  };
}
