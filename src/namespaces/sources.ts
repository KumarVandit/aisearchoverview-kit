import type { OverviewSource, SourceResolutionResult } from '../types.js';

export class SourcesNamespace {
  constructor(private readonly fetcher: typeof globalThis.fetch, private readonly timeoutMs: number) {}

  /** Resolves only Google's citation redirects; publisher pages are never fetched. */
  async resolve(sources: readonly OverviewSource[], options: { signal?: AbortSignal } = {}): Promise<SourceResolutionResult> {
    const output: OverviewSource[] = [];
    const warnings: string[] = [];
    let resolved = 0;
    for (const source of sources) {
      if (options.signal?.aborted) throw options.signal.reason;
      let url: URL;
      try { url = new URL(source.url); } catch { output.push({ ...source }); warnings.push(`Invalid source URL at position ${source.position}`); continue; }
      if (url.origin !== 'https://www.google.com' || !['/url', '/goto'].includes(url.pathname) || url.username || url.password) { output.push({ ...source }); continue; }
      const controller = new AbortController();
      const abort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => controller.abort(new Error('Citation resolution timed out')), this.timeoutMs);
      try {
        const response = await this.fetcher(url.toString(), { method: 'GET', redirect: 'manual', signal: controller.signal });
        const location = response.headers.get('location');
        await response.body?.cancel();
        const destination = location ? new URL(location, url) : undefined;
        if ([301, 302, 303, 307, 308].includes(response.status) && destination && ['https:', 'http:'].includes(destination.protocol) && !destination.username && !destination.password && destination.hostname !== 'google.com' && !destination.hostname.endsWith('.google.com')) {
          output.push({ ...source, url: destination.toString(), redirectUrl: source.redirectUrl ?? source.url }); resolved++;
        } else { output.push({ ...source }); warnings.push(`Source ${source.position} did not return a publisher redirect`); }
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason;
        output.push({ ...source }); warnings.push(`Source ${source.position} could not be resolved`);
      } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
    }
    return { sources: output, resolved, warnings };
  }
}
