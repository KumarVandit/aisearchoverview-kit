/** Identity of observed opaque Google redirects; callers retain the original signed URL. */
export function opaqueSourceIdentity(url: URL): string | undefined {
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['www.google.com', 'google.com'].includes(url.hostname) || url.pathname !== '/url') return undefined;
  const q = url.searchParams.getAll('q'), target = url.searchParams.getAll('url'), uoh = url.searchParams.getAll('uoh');
  if (uoh.length !== 1) return undefined;
  const key = uoh[0] === '2' && target.length === 1 && q.length === 0 ? 'url'
    : uoh[0] === '3' && q.length === 1 && target.length === 0 ? 'q' : undefined;
  if (!key) return undefined;
  const token = url.searchParams.get(key)!;
  return /^CAES[A-Za-z0-9_-]+$/.test(token) ? `${url.origin}/url?${key}=${token}&uoh=${uoh[0]}` : undefined;
}

export function sourceIdentity(value: string): string {
  return opaqueSourceIdentity(new URL(value)) ?? value;
}
