import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { parseGoogleAiOverviewHtml } from '../../../src/google-search/parsers.js';
import { parseGoogleSearchMonitorHtml } from '../../../src/google-search/monitor.js';
import { opaqueSourceIdentity } from '../../../src/google-search/source-redirect.js';
import { loadNestedFixture } from '../../helpers/fixtures.js';

const expectedAnswers: Record<string, string> = {
  "under-1000": "You can find thousands of rental apartments under $1000 in Austin, TX, due to recent market drops and a large supply of new construction. Current Price & Market Overview Price Range: Studios, 1-bedrooms, and select 2-bedroom units typically range from $650 to $1,000 per month. Market Trends: Austin leads the U.S. in annual rent price declines, with many complexes offering rent specials (such as 4 to 8 weeks free).",
  "cheap": "Finding affordable housing in Austin is more realistic now due to broader market cool-downs and active rent specials across the metro area. Affordable Apartment Examples & Ranges Under $700–$800/mo options: Properties like Town Lake Apartments, The Hedge Apartments, Wildwood Apartments, and Chevy Chase Apartments offer lower-tier or room-shared floor plans starting roughly from $575 to $700+ per month."
};

const sourceUrl = 'https://www.google.com/search?q=apartments+in+Austin';
const fixture = (name: string) => loadNestedFixture('google-search', `aio-austin-${name}-opaque-rendered.html`);
const turn = (card: string, pill: string) => `<div data-scope-id="turn"><h2>AI Overview</h2><div data-subtree="aimc"><div data-container-id="main-col"><p>A captured answer.<span data-suuid="pill"><a href="${pill}" aria-label="Cited site"></a></span></p></div><div data-container-id="rhs-col"><div data-src-id="1"><a href="${card}" aria-label="Source title" data-link-behavior="cobrowse"></a></div></div></div></div>`;

// Provenance and non-live opaque-token redaction are recorded in aio-opaque-rendered-provenance.json.
describe('observed rendered Overview opaque source redirects', () => {
  it.each([
    ['under-1000', 417, 6, [['Zillow', 1], ['RentCafe', 5]]],
    ['cheap', 405, 8, [['YouTube · Reventure Consulting', 3], ['Apartments.com', 1]]],
  ] as const)('extracts visible sources and maps linked pills in the %s capture', (name, length, count, pills) => {
    const html = fixture(name);
    const result = parseGoogleAiOverviewHtml(html, sourceUrl);
    expect(result.status).toBe('present');
    expect(result.text).toBe(expectedAnswers[name]);
    expect(result.text).toHaveLength(length);
    expect(result.sources).toHaveLength(count);
    expect(result.citationPills?.map(pill => [pill.label, pill.position])).toEqual(pills);
    expect(result.sources.map(source => source.title)).not.toContain(name === 'under-1000' ? 'Apartments For Rent Under $1,000 in Austin, TX | Realtor.com®' : 'Affordable Housing Online Search Tool (AHOST) | Austin Housing | AustinTexas.gov');
    const dom = new JSDOM(html);
    const cardLinks = [...dom.window.document.querySelectorAll('[data-src-id] a[href]')].map(node => {
      const url = new URL(node.getAttribute('href')!, sourceUrl);
      const target = url.searchParams.get('url');
      return target?.startsWith('https://') ? target : url.toString();
    });
    for (const source of result.sources) expect(cardLinks).toContain(source.url);
    for (const pill of result.citationPills ?? []) expect(pill.url).toBe(result.sources[pill.position - 1]!.url);
    const monitor = parseGoogleSearchMonitorHtml(html, { query: 'apartments in Austin', country: 'US', include: { aioverview: true } }, { sourceUrl });
    if (!monitor.success) throw new Error(monitor.error.message);
    for (const source of monitor.result.aioverview!.sources) {
      expect(source.redirectLink).toBe(opaqueSourceIdentity(new URL(source.url)) ? source.url : undefined);
    }
    dom.window.close();
  });

  it('preserves the exact source-card URL while deduplicating and mapping differing signed tracking URLs', () => {
    const card = 'https://www.google.com/url?url=CAESfixture&uoh=2&sa=t&ved=card&psig=fixture-signature&ust=123';
    const pill = 'https://www.google.com/url?sa=i&url=CAESfixture&uoh=2&ved=pill&psig=other-fixture-signature&ust=456';
    const result = parseGoogleAiOverviewHtml(turn(card, pill), sourceUrl);
    expect(result.sources).toEqual([{ title: 'Source title', url: card }]);
    expect(result.citationPills?.[0]).toMatchObject({ position: 1, url: card });
    expect(result.markdown).toContain(pill);
  });

  it.each([
    'http://www.google.com/url?url=CAESfixture&uoh=2',
    'https://www.google.com:444/url?url=CAESfixture&uoh=2',
    'https://www.google.com/url?q=CAESfixture&uoh=2',
    'https://www.google.com/url?url=CAESfixture&uoh=3',
    'https://www.google.com/url?url=CAESfixture&uoh=4',
    'https://www.google.com/url?url=opaque&uoh=2',
    'https://www.google.com/url?url=CAESfixture&url=CAESother&uoh=2',
    'https://www.google.com/url?url=CAESfixture&q=CAESother&uoh=2',
    'https://www.google.com/url?url=CAESfixture&uoh=2&uoh=3',
    'https://www.google.com/aclk?url=CAESfixture&uoh=2',
  ])('rejects unsupported or ambiguous redirect %s', url => {
    expect(opaqueSourceIdentity(new URL(url))).toBeUndefined();
    const result = parseGoogleAiOverviewHtml(turn(url, url), sourceUrl);
    expect(result.sources).toEqual([]);
    expect(result.citationPills).toBeUndefined();
  });

  it('keeps both observed redirect families distinct and rejects host lookalikes as opaque identities', () => {
    expect(opaqueSourceIdentity(new URL('https://www.google.com/url?q=CAESfixture&uoh=3'))).toBeDefined();
    expect(opaqueSourceIdentity(new URL('https://www.google.com.evil.example/url?url=CAESfixture&uoh=2'))).toBeUndefined();
    expect(opaqueSourceIdentity(new URL('https://user:pass@www.google.com/url?url=CAESfixture&uoh=2'))).toBeUndefined();
  });

  it('retains distinct opaque targets and also maps legacy q/uoh=3 links by identity', () => {
    const card = 'https://www.google.com/url?q=CAESfixture&uoh=3&ved=card';
    const pill = 'https://www.google.com/url?q=CAESfixture&uoh=3&ved=pill';
    const html = turn(card, pill).replace('</p>', '<a href="https://www.google.com/url?url=CAESother&uoh=2">Another source</a></p>');
    const result = parseGoogleAiOverviewHtml(html, sourceUrl);
    expect(result.sources).toHaveLength(2);
    expect(result.citationPills?.[0]).toMatchObject({ url: card, position: 1 });
  });

  it('does not extend url/uoh=2 recognition to semantic fallback regions', () => {
    const url = 'https://www.google.com/url?url=CAESfixture&uoh=2';
    expect(parseGoogleAiOverviewHtml(`<section aria-label="AI Overview"><p>A semantic answer <a href="${url}">Cited site</a>.</p></section>`, sourceUrl).sources).toEqual([]);
  });

  it('does not promote opaque links from ads or unlabeled AI Mode content', () => {
    const url = 'https://www.google.com/url?url=CAESfixture&uoh=2';
    const html = turn(url, url);
    expect(parseGoogleAiOverviewHtml(html.replace('<div data-scope-id', '<div data-text-ad="" data-scope-id'), sourceUrl).sources).toEqual([]);
    expect(parseGoogleAiOverviewHtml(html.replace('AI Overview', 'AI Mode'), sourceUrl).status).toBe('unverified');
    const adCard = html.replace('<div data-src-id', '<div data-text-ad="" data-src-id').replace('<span data-suuid', '<span data-text-ad="" data-suuid');
    expect(parseGoogleAiOverviewHtml(adCard, sourceUrl).sources).toEqual([]);
  });
});
