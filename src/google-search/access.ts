/** Recognizes Google's own access-denial redirect without fetching its CAPTCHA page. */
export function googleChallengeRedirect(sourceUrl: string, status: number, location: string | null | undefined): boolean {
  if (![301,302,303,307,308].includes(status) || !location) return false;
  try {
    const source = new URL(sourceUrl), target = new URL(location, source);
    return source.protocol === 'https:' && ['www.google.com','google.com'].includes(source.hostname)
      && target.origin === source.origin && !target.username && !target.password
      && (target.pathname === '/sorry' || target.pathname.startsWith('/sorry/'));
  } catch { return false; }
}
