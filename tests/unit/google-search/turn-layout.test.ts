import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { parseGoogleAiOverviewHtml, parseGoogleSearchHtml } from '../../../src/google-search/parsers.js';
import { loadNestedFixture } from '../../helpers/fixtures.js';

const sourceUrl = 'https://www.google.com/search?q=apartments+in+Austin+Texas';
const capture = (state = 'expanded') => loadNestedFixture('google-search', `aio-austin-turn-${state}.html`);
const expectedText = "You can browse live availability and compare listings using the Apartments.com Austin Guide or search thousands of options on Zillow Austin Rentals. Austin Apartment Market Overview Average Rent: Around $1,413 to $1,560 per month, depending on the platform and neighborhood, which sits slightly below the national average. Studio Prices: Typically start around $856 to $1,222+ per month. 1-Bedroom Prices: Generally average $1,250 to $1,491+ per month. 2-Bedroom Prices: Range around $1,695 to $3,385+ per month. Popular Neighborhoods & Communities Downtown / Central: High-rise and luxury living options like Gables Republic Square, The Catherine, and Northshore Apartments. East Austin: Vibrant, walkable communities such as Windsor Commons, Trailhead, and Avenir Apartments. South Austin: Popular spots near SoCo and major corridors like The Bennett and SOFI at 6311. If you'd like to narrow down your search, tell me: What is your target monthly budget? Which neighborhood or side of town do you prefer? What number of bedrooms do you need?";

// Genuine rendered turn captures and sanitization details are recorded in aio-provenance.json.
describe('rendered Search turn with explicit Overview heading', () => {
  it('extracts the expanded answer without source-rail or feedback UI text', () => {
    const result = parseGoogleAiOverviewHtml(capture(), sourceUrl);
    expect(result.status).toBe('present');
    expect(result.text).toBe(expectedText);
    expect(result.sources.map(({ title, url }) => [title, url])).toEqual([
      ['Apartments For Rent in Austin TX - 22160 Rentals | Zillow', 'https://www.zillow.com/austin-tx/apartments/'],
      ['Apartments for Rent in Austin TX - 28473 Rentals', 'https://www.apartments.com/austin-tx/'],
      ['Apartments For Rent in Austin, TX - 24,101 Rentals | Trulia', 'https://www.trulia.com/for_rent/Austin,TX/'],
      ['Average Rent in Austin, TX - Latest Rent Prices by Neighborhood', 'https://www.apartments.com/rent-market-trends/austin-tx/'],
      ['The Bennett', 'https://www.google.com/searchviewer/10?svid=redacted-content-id'],
    ]);
    // Only one of three visible citation widgets exposes an anchor; buttons alone establish no mapping.
    expect(result.citationPills).toEqual([{ citationPillId: 2, position: 1, label: 'Zillow', url: 'https://www.zillow.com/austin-tx/apartments/', domain: 'www.zillow.com' }]);
    expect(result.markdown).toContain('*Gables Republic Square*');
    expect(result.markdown).toContain('*The Catherine*, and *Northshore Apartments*');
    expect(result.markdown).not.toMatch(/Copied|Share public link|Rental Inventory|AI Mode replied/);
  });

  it('respects the collapsed capture visibility and extracts only its visible answer and inline links', () => {
    const result = parseGoogleAiOverviewHtml(capture('collapsed'), sourceUrl);
    expect(result.status).toBe('present');
    expect(result.text).toBe(expectedText.slice(0, expectedText.indexOf(' 2-Bedroom Prices:')));
    expect(result.text).toHaveLength(452);
    expect(result.sources).toEqual([
      { title: 'Apartments.com Austin Guide', url: 'https://www.apartments.com/austin-tx/' },
      { title: 'Zillow Austin Rentals', url: 'https://www.zillow.com/austin-tx/apartments/' },
    ]);
    expect(result.citationPills).toBeUndefined();
  });

  it('keeps the captured Overview on AI Mode URLs unverified', () => {
    expect(parseGoogleAiOverviewHtml(capture(), `${sourceUrl}&udm=50`).status).toBe('unverified');
  });

  it.each(['heading', 'main', 'aimc', 'prose', 'advertisement', 'nested-heading'])('rejects unsupported or misleading %s mutations', mutation => {
    const dom = new JSDOM(capture());
    const document = dom.window.document;
    const heading = document.querySelector('[role=heading][aria-level="2"]')!;
    if (mutation === 'heading') heading.textContent = 'AI Mode';
    if (mutation === 'main') document.querySelector('[data-container-id=main-col]')!.remove();
    if (mutation === 'aimc') document.querySelector('[data-subtree=aimc]')!.removeAttribute('data-subtree');
    if (mutation === 'advertisement') document.querySelector('[data-scope-id=turn]')!.setAttribute('data-text-ad', '');
    if (mutation === 'nested-heading') {
      const nested = document.createElement('div');
      nested.setAttribute('data-scope-id', 'turn');
      heading.replaceWith(nested);
      nested.append(heading);
    }
    if (mutation === 'prose') {
      const main = document.querySelector('[data-container-id=main-col]')!;
      const rail = main.querySelector('[data-src-id]')!.parentElement!;
      main.replaceChildren(rail);
      rail.setAttribute('data-ignore-copy', '');
    }
    expect(parseGoogleAiOverviewHtml(dom.serialize(), sourceUrl).status).toBe('unverified');
    dom.window.close();
  });

  it('excludes rendered Overview sources from organic results', () => {
    const html = `<main id="rso">${capture()}<div class="g"><a href="https://example.com/"><h3>Organic result</h3></a></div></main>`;
    expect(parseGoogleSearchHtml(html, { sourceUrl }).organic.map(item => item.title)).toEqual(['Organic result']);
  });
});
