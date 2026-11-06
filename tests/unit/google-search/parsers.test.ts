import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GoogleSearchError, parseGoogleAutocomplete, parseGoogleSearchHtml } from '../../../src/google-search.js';
import { parseGoogleAiOverviewHtml } from '../../../src/google-search/parsers.js';

function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/google-search/${name}`, import.meta.url), 'utf8');
}

const SOURCE = 'https://www.google.com/search?q=typescript&hl=en&gl=us';

describe('Google Search captured response classification', () => {
  it('recognizes the sanitized live JavaScript interstitial without reporting empty results or an absent overview', () => {
    const response = parseGoogleSearchHtml(fixture('javascript-required.html'), { sourceUrl: SOURCE });

    expect(response).toMatchObject({ status: 'javascript-required', organic: [], aiOverview: { status: 'unverified', sources: [] } });
  });

  it('recognizes the sanitized live unusual-traffic response even with HTTP 200', () => {
    const response = parseGoogleSearchHtml(fixture('blocked.html'), { sourceUrl: SOURCE });

    expect(response).toMatchObject({ httpStatus: 200, status: 'blocked', organic: [], aiOverview: { status: 'blocked', sources: [] } });
  });

  it('recognizes a challenge redirect from its destination URL without requiring English body text', () => {
    const response = parseGoogleSearchHtml('<html><body>Accès refusé</body></html>', { sourceUrl: 'https://www.google.com/sorry/index' });
    expect(response.status).toBe('blocked');
  });

  it.each([403, 429])('reports HTTP %s as blocked', (httpStatus) => {
    const response = parseGoogleSearchHtml('', { sourceUrl: SOURCE, httpStatus });
    expect(response.status).toBe('blocked');
    expect(response.aiOverview.status).toBe('blocked');
  });

  it('does not mistake changed or incomplete markup for an empty result page', () => {
    const response = parseGoogleSearchHtml('<main><p>A future Google result layout.</p></main>', { sourceUrl: SOURCE });
    expect(response.status).toBe('unrecognized');
    expect(response.aiOverview.status).toBe('unverified');
    expect(response.warnings.some(item => item.includes('not recognized'))).toBe(true);
  });

  it('keeps a consent page distinct from both denial and results', () => {
    const response = parseGoogleSearchHtml('<html><body>Before you continue</body></html>', { sourceUrl: 'https://consent.google.com/m' });
    expect(response.status).toBe('consent-required');
    expect(response.aiOverview.status).toBe('unverified');
  });

  it('decodes the captured public autocomplete tuple with unknown metadata intact', () => {
    const raw: unknown = JSON.parse(fixture('autocomplete.json'));
    const response = parseGoogleAutocomplete(raw);
    expect(response.query).toBe('typescript');
    expect(response.suggestions).toContain('typescript documentation');
    expect(response.raw).toBe(raw);
  });

  it.each([null, {}, ['query'], ['query', [null]], [null, []]])('rejects malformed autocomplete payloads (%j)', (raw) => {
    expect(() => parseGoogleAutocomplete(raw)).toThrow(GoogleSearchError);
  });
});

describe('Google Search experimental structural extraction', () => {
  it('extracts titles, URLs, snippets and related content from the synthetic semantic contract', () => {
    const response = parseGoogleSearchHtml(fixture('structural-search.html'), { sourceUrl: SOURCE });

    expect(response.status).toBe('results');
    expect(response.organic).toEqual([
      { position: 1, title: 'TypeScript & JavaScript', url: 'https://www.typescriptlang.org/', snippet: 'A synthetic snippet with typed JavaScript & tools.', displayUrl: 'typescriptlang.org' },
      { position: 2, title: 'Web documentation', url: 'https://developer.mozilla.org/en-US/docs/Web?topic=types&lang=en', snippet: 'Second synthetic snippet.' },
    ]);
    expect(response.relatedQuestions).toEqual(['What is TypeScript?', 'Is TypeScript JavaScript?']);
    expect(response.relatedSearches).toEqual([{ query: 'typescript tutorial', url: 'https://www.google.com/search?q=typescript+tutorial&hl=en' }]);
    expect(response.warnings.some(item => item.includes('surrounding SERP feature set is incomplete'))).toBe(true);
  });

  it('extracts the synthetic explicitly labeled overview without generating or substituting text', () => {
    const response = parseGoogleSearchHtml(fixture('structural-search.html'), { sourceUrl: SOURCE });
    expect(response.aiOverview).toMatchObject({
      status: 'present', text: 'Synthetic overview text for structural parser testing.',
      sources: [{ title: 'TypeScript documentation', url: 'https://www.typescriptlang.org/docs/' }],
    });
  });

  it.each([
    '<h2>AI Overview</h2>',
    '<h2>AI Overview</h2><p>Loading...</p>',
    '<h2>AI Overview</h2><div>Generating an AI Overview… Please wait...</div>',
    '<h2>AI Overview</h2><div role="status">Searching for information</div><div role="progressbar">30%</div>',
    '<h2>AI Overview</h2><a href="https://example.com/">Supporting source</a><button>Show more</button>',
    '<h2>AI Overview</h2><div hidden>A hidden answer.</div><p>Thinking...</p>',
    '<h2>AI Overview</h2><p>AI responses may include mistakes.</p><a href="https://support.google.com/websearch/">Learn more</a><button>Generate</button>',
    '<h2>AI Overview</h2><p>AI responses may include mistakes.</p><p>Generating an AI Overview… Please wait...</p>',
    '<h2>AI Overview</h2><p>An AI Overview is not available for this search</p>',
    "<h2>AI Overview</h2><p>Can't generate an AI overview right now. Try again later.</p>",
  ])('keeps synthetic heading/loading-only overview markup unverified: %s', (body) => {
    const html = `<div id="search"><section aria-label="AI Overview">${body}</section></div>`;
    const response = parseGoogleSearchHtml(html, { sourceUrl: SOURCE });
    expect(response.aiOverview).toMatchObject({ status: 'unverified', sources: [] });
    expect(response.aiOverview.text).toBeUndefined();
    expect(response.status).toBe('unrecognized');
  });

  it('keeps a synthetic busy overview unverified even when text is partially available', () => {
    const html = '<div id="search"><section aria-label="AI Overview" aria-busy="true"><p>An answer is still being assembled.</p></section></div>';
    expect(parseGoogleSearchHtml(html, { sourceUrl: SOURCE }).aiOverview.status).toBe('unverified');
  });

  it.each(['Paris.', 'Loading a module runs its initialization.'])('accepts substantive text in the synthetic overview contract: %s', (text) => {
    const html = `<div id="search"><section aria-label="AI Overview"><h2>AI Overview</h2><p>${text}</p></section></div>`;
    const response = parseGoogleSearchHtml(html, { sourceUrl: SOURCE });
    expect(response.status).toBe('results');
    expect(response.aiOverview.status).toBe('present');
  });

  it('does not infer an overview from a result title, an unsupported marker or missing markup', () => {
    const html = '<div id="search"><div id="rso"><div class="g"><a href="https://example.com/"><h3>AI Overview</h3></a></div><div data-aio="1">Unknown layout</div></div></div>';
    const response = parseGoogleSearchHtml(html, { sourceUrl: SOURCE });
    expect(response.status).toBe('results');
    expect(response.aiOverview.status).toBe('unverified');
    expect(response.aiOverview.text).toBeUndefined();
  });

  it('does not let a disabled-JavaScript fallback hide otherwise recognized results', () => {
    const html = fixture('structural-search.html') + '<noscript><a href="/httpservice/retry/enablejs">Enable JavaScript</a></noscript>';
    expect(parseGoogleSearchHtml(html, { sourceUrl: SOURCE }).status).toBe('results');
  });

  it('recognizes an explicit no-results message only within a Search result page', () => {
    const html = '<div id="search">Your search did not match any documents.</div>';
    const response = parseGoogleSearchHtml(html, { sourceUrl: SOURCE });
    expect(response.status).toBe('empty');
    expect(response.aiOverview.status).toBe('unverified');
    expect(parseGoogleSearchHtml(html, { sourceUrl: 'https://example.com/search' }).status).toBe('unrecognized');
  });

  it('ignores executable, hidden, non-HTTP, credentialed and internal Google links', () => {
    const html = '<div id="search"><div id="rso">' +
      '<script><a href="https://script.example/"><h3>script</h3></a></script>' +
      '<div hidden><a href="https://hidden.example/"><h3>hidden</h3></a></div>' +
      '<a href="javascript:alert(1)"><h3>unsafe</h3></a>' +
      '<a href="https://name:password@example.com/"><h3>credentials</h3></a>' +
      '<a href="/search?q=other"><h3>internal</h3></a>' +
      '<a href="https://visible.example/"><h3>Visible &#x1F5FA;</h3></a>' +
      '</div></div>';
    expect(parseGoogleSearchHtml(html, { sourceUrl: SOURCE }).organic).toEqual([{ position: 1, title: 'Visible 🗺', url: 'https://visible.example/' }]);
  });

  it('retains raw HTML only on request', () => {
    const html = '<main>Unrecognized</main>';
    expect(parseGoogleSearchHtml(html, { sourceUrl: SOURCE }).rawHtml).toBeUndefined();
    expect(parseGoogleSearchHtml(html, { sourceUrl: SOURCE, includeRawHtml: true }).rawHtml).toBe(html);
  });
});


describe('Google AI Overview captured rendered markup', () => {
  const SKY = 'https://www.google.com/search?q=why+is+the+sky+blue&hl=en';
  const observed = (body: string, rhs = '') => `<div id="m-x-content"><div jscontroller="pJyqm" jsmodel="FRbqE"><div role="heading" aria-level="2">AI Overview</div><div data-container-id="main-col">${body}</div><div data-container-id="rhs-col">${rhs}</div></div></div>`;

  it('reads a scoped real collapsed overview without fabricating Search wrappers', () => {
    const html = fixture('aio-sky-collapsed.html');
    expect(html).not.toContain('id="search"');
    expect(html).not.toContain('id="rso"');
    const response = parseGoogleSearchHtml(html, { sourceUrl: SKY });
    expect(response.status).toBe('results');
    expect(response.organic).toEqual([]);
    expect(response.aiOverview.status).toBe('present');
    expect(response.aiOverview.text).toBe("The sky is blue because of a phenomenon called Rayleigh scattering, which happens when sunlight reaches Earth's atmosphere. How It Works Sunlight is a mix of colors: Light from the sun looks white, but it is actually made up of all the colors of the rainbow combined.");
    expect(response.aiOverview.sources).toHaveLength(7);
    expect(response.warnings.some(value => value.startsWith('Organic and related-question'))).toBe(true);
    expect(parseGoogleAiOverviewHtml(html, SKY)).toEqual(response.aiOverview);
  });

  it('retains expanded prose, section headings and ordinary text links while removing widget and media labels', () => {
    const result = parseGoogleAiOverviewHtml(fixture('aio-sky-expanded.html'), SKY);
    expect(result.status).toBe('present');
    expect(result.text).toContain('Different wavelengths:');
    expect(result.text).toContain('Scattering in the air:');
    expect(result.text).toContain('NASA Space Place Guide');
    expect(result.text).toContain('NOAA NESDIS');
    expect(result.text).toContain('Would you like to know why sunsets and sunrises turn red and orange');
    expect(result.text).not.toMatch(/AI Overview|AI Mode replied|learning junction|Streaming Service|3\.4K views|Show all|Learn more/);
    expect(result.sources).toHaveLength(7);
    expect(result.reason).toContain('completeness are not established');
  });

  it.each(['aio-sky-collapsed.html', 'aio-sky-expanded.html', 'aio-leaves-collapsed.html'])('parses a derived pre-mount-id version of rendered fixture %s without claiming an original HTTP capture', name => {
    const rendered = fixture(name);
    expect(rendered).toContain('id="m-x-content"');
    const derived = rendered.replace('id="m-x-content"', '');
    expect(derived).not.toContain('id="m-x-content"');
    expect(parseGoogleAiOverviewHtml(derived, SKY)).toEqual(parseGoogleAiOverviewHtml(rendered, SKY));
    expect(parseGoogleSearchHtml(derived, { sourceUrl: SKY })).toMatchObject({ status: 'results', aiOverview: { status: 'present' } });
    expect(parseGoogleAiOverviewHtml(derived, 'https://www.google.com/search?q=sky&udm=50').status).toBe('unverified');
    expect(parseGoogleAiOverviewHtml(`<div data-text-ad="1">${derived}</div>`, SKY).status).toBe('unverified');
  });

  it.each([
    '<div><h2>AI Overview</h2><div data-container-id="main-col">Unsupported generic markup.</div></div>',
    '<div jscontroller="pJyqm"><h2>AI Overview</h2><div data-container-id="main-col">Missing model.</div></div>',
    '<div jsmodel="FRbqE"><h2>AI Overview</h2><div data-container-id="main-col">Missing controller.</div></div>',
    '<div jscontroller="pJyqm" jsmodel="FRbqE"><div data-container-id="main-col"><h2>AI Overview</h2>A prose heading.</div></div>',
    '<div jscontroller="pJyqm" jsmodel="FRbqE"><h2>AI Overview</h2><div data-container-id="main-col">Loading...</div></div>',
  ])('keeps unsupported or incomplete id-free structures unverified: %s', html => {
    expect(parseGoogleAiOverviewHtml(html, SKY)).toMatchObject({ status: 'unverified', sources: [] });
  });

  it('does not count an id-free overview citation as an organic Search result', () => {
    const idFree = observed('<p>An answer.</p>', '<div data-src-id="1"><a data-link-behavior="cobrowse" href="https://source.example/"><h3>A citation title</h3></a></div>').replace('id="m-x-content"', '');
    const html = `<div id="search">${idFree}<a href="https://organic.example/"><h3>An organic title</h3></a></div>`;
    const response = parseGoogleSearchHtml(html, { sourceUrl: SKY });
    expect(response.aiOverview).toMatchObject({ status: 'present', sources: [{ title: 'A citation title', url: 'https://source.example/' }] });
    expect(response.organic.map(result => result.title)).toEqual(['An organic title']);
  });

  it('parses a second real query with independent citations and no account chrome', () => {
    const result = parseGoogleAiOverviewHtml(fixture('aio-leaves-collapsed.html'), 'https://www.google.com/search?q=why+do+leaves+change+color+in+autumn&hl=en');
    expect(result.status).toBe('present');
    expect(result.text).toContain('breaking down chlorophyll');
    expect(result.text).toContain('The Main Triggers');
    expect(result.text).toContain('Cooler Temperatures:');
    expect(result.text).not.toContain('Smithsonian');
    expect(result.sources).toHaveLength(11);
    expect(result.sources[0]).toMatchObject({ title: 'Why Do Leaves Change Color in the Fall? | Smithsonian Institution', url: 'https://www.si.edu/stories/why-do-leaves-change-color-fall' });
    expect(new Set(result.sources.map(source => source.url)).size).toBe(11);
  });

  it('uses empty-anchor ARIA titles, keeps meaningful video parameters and prefers source-card titles', () => {
    const result = parseGoogleAiOverviewHtml(fixture('aio-sky-expanded.html'), SKY);
    expect(result.sources[0]).toMatchObject({ title: 'Why Is the Sky Blue? | NASA Space Place – NASA Science for Kids', url: 'https://spaceplace.nasa.gov/blue-sky/' });
    expect(result.sources).toContainEqual({ title: 'Why Is the Sky Blue? - Learning Junction - Video for Kids, video, watch on YouTube', url: 'https://www.youtube.com/watch?v=p4YxN9rwu8U&t=7' });
    const minimal = observed('A supported answer.<span data-suuid="group-1"><a href="https://example.com/source" aria-label="Inline publisher"></a><button data-amic="true">Inline publisher +1</button></span>', '<div data-src-id="1"><a data-link-behavior="cobrowse" href="https://example.com/source" aria-label="Full source title"></a></div>');
    expect(parseGoogleAiOverviewHtml(minimal)).toMatchObject({ status: 'present', text: 'A supported answer.', sources: [{ title: 'Full source title', url: 'https://example.com/source' }] });
  });

  it('ignores hidden error templates that coexist with a genuine rendered answer', () => {
    const html = fixture('aio-sky-collapsed.html');
    expect(html).toContain('An AI Overview is not available for this search');
    expect(html).toContain("Can't generate an AI overview right now.");
    const result = parseGoogleAiOverviewHtml(html, SKY);
    expect(result.status).toBe('present');
    expect(result.text).not.toMatch(/not available|Try again later|Error translating/);
  });

  it.each([
    '<p>AI responses may include mistakes.</p><button>Generate</button>',
    '<p>AI responses may include mistakes.</p><p>Loading...</p>',
    '<p>Generating an AI Overview… Please wait...</p>',
    '<p>Can\'t generate an AI overview right now. Try again later.</p>',
    '<div role="status">Searching for information</div>',
    '<span data-suuid="group-1"><a href="https://example.com/" aria-label="Source"></a><button>Source</button></span>',
  ])('does not promote notices, loading controls or citations into an answer: %s', body => {
    expect(parseGoogleAiOverviewHtml(observed(body))).toMatchObject({ status: 'unverified', sources: [] });
  });

  it('does not infer completion or answer presence from controllers or busy nested containers', () => {
    expect(parseGoogleAiOverviewHtml('<div id="m-x-content"><div jscontroller="pJyqm" jsmodel="FRbqE">A controller exists.</div></div>').status).toBe('unverified');
    expect(parseGoogleAiOverviewHtml(observed('<div aria-busy="true">A partially generated answer.</div>')).status).toBe('unverified');
    expect(parseGoogleAiOverviewHtml('<div id="m-x-content"><div data-container-id="main-col"><h2>AI Overview</h2>A heading inside prose.</div></div>').status).toBe('unverified');
  });

  it('ignores hidden busy/loading templates and preserves an AIO-only page with a disabled-JavaScript fallback', () => {
    const html = observed('<div hidden aria-busy="true">Generating an AI Overview</div><div style="display:none" aria-busy="true">Loading...</div><p>A visible answer.</p>');
    expect(parseGoogleAiOverviewHtml(html, SKY)).toMatchObject({ status: 'present', text: 'A visible answer.' });
    const response = parseGoogleSearchHtml(html + '<noscript><a href="/httpservice/retry/enablejs">Enable JavaScript</a></noscript>', { sourceUrl: SKY });
    expect(response.status).toBe('results');
    expect(response.aiOverview.text).toBe('A visible answer.');
  });

  it('does not relabel AI Mode as an AI Overview and does not reject the observed internal AI Mode accessibility string', () => {
    const html = fixture('aio-sky-expanded.html');
    expect(html).toContain('AI Mode replied:');
    expect(parseGoogleAiOverviewHtml(html, SKY).status).toBe('present');
    expect(parseGoogleAiOverviewHtml(html, 'https://www.google.com/search?q=sky&udm=50').status).toBe('unverified');
    expect(parseGoogleAiOverviewHtml(html, 'https://www.google.com/ai').status).toBe('unverified');
    const modeHeading = observed('<p>An AI Mode answer.</p>').replace('>AI Overview</div>', '>AI Mode</div>');
    expect(parseGoogleAiOverviewHtml(modeHeading, SKY).status).toBe('unverified');
  });

  it('excludes advertised lookalikes, embedded ad prose and ad citation cards', () => {
    const html = fixture('aio-sky-collapsed.html');
    expect(parseGoogleAiOverviewHtml(`<div data-text-ad="1">${html}</div>`, SKY).status).toBe('unverified');
    const result = parseGoogleAiOverviewHtml(observed('<p>A factual answer.</p><div data-ta-slot="1">Sponsored text.</div>', '<div data-text-ad="1"><div data-src-id="ad"><a data-link-behavior="cobrowse" href="https://ads.example/" aria-label="Advertisement"></a></div></div>'), SKY);
    expect(result).toMatchObject({ status: 'present', text: 'A factual answer.', sources: [] });
    const response = parseGoogleSearchHtml(`<div id="search">${observed('<p>A factual answer.</p>', '<div data-src-id="1"><a data-link-behavior="cobrowse" href="https://source.example/"><h3>A citation title</h3></a></div>')}<a href="https://organic.example/"><h3>An organic title</h3></a></div>`, { sourceUrl: SKY });
    expect(response.organic.map(item => item.title)).toEqual(['An organic title']);
  });

  it('keeps HTTP failures, foreign pages and traffic challenges outside positive extraction', () => {
    const html = fixture('aio-sky-collapsed.html');
    expect(parseGoogleSearchHtml(html, { sourceUrl: SKY, httpStatus: 503 }).aiOverview.status).toBe('unverified');
    expect(parseGoogleAiOverviewHtml(html, 'https://example.com/search').status).toBe('unverified');
    expect(parseGoogleAiOverviewHtml(fixture('blocked.html'), SKY).status).toBe('blocked');
    expect(() => parseGoogleAiOverviewHtml(html, 'invalid-url')).toThrow(GoogleSearchError);
  });
});

describe('Google AI Overview captured initial HTTP markup', () => {
  const SKY = 'https://www.google.com/search?q=why+is+the+sky+blue&hl=en&gl=us';
  const initial = (body: string) => `<div jscontroller="EYwa3d" data-aquarium><h2>AI Overview</h2><div data-container-id="main-col">${body}</div></div>`;

  it('reads the actual signed-out document subtree without a browser-generated mount ID or translation wrapper', () => {
    const html = fixture('aio-sky-http.html');
    expect(html).toContain('jscontroller="EYwa3d"');
    expect(html).toContain('data-aquarium=""');
    expect(html).not.toMatch(/m-x-content|pJyqm|<script|nonce=|data-ved/);
    const response = parseGoogleSearchHtml(html, { sourceUrl: SKY });
    expect(response).toMatchObject({ status: 'results', organic: [], aiOverview: { status: 'present' } });
    expect(response.aiOverview.text).toContain("The sky is blue because Earth's atmosphere scatters sunlight in all directions");
    expect(response.aiOverview.text).toContain('Rayleigh Scattering:');
    expect(response.aiOverview.text).not.toMatch(/AI Overview|Related results|NASA Space Place|Streaming Service|Show more/);
    expect(response.aiOverview.sources.map(({description: _description,...source})=>source)).toEqual([
      { title: 'Why Is the Sky Blue? | NASA Space Place – NASA Science for Kids', url: 'https://www.google.com/goto?url=redacted-destination-1' },
      { title: 'Why Is the Sky Blue? | NESDIS | National Environmental Satellite, Data, and Information Service', url: 'https://www.google.com/goto?url=redacted-destination-2' },
      { title: 'NASA+ · NASA+ Streaming Service', url: 'https://www.google.com/goto?url=redacted-destination-3' },
      { title: 'Royal Museums Greenwich', url: 'https://www.google.com/goto?url=redacted-destination-4' },
    ]);
    expect(parseGoogleAiOverviewHtml(html, SKY)).toEqual(response.aiOverview);
  });

  it.each([
    '<div jscontroller="EYwa3d"><h2>AI Overview</h2><div data-container-id="main-col">Missing Aquarium marker.</div></div>',
    '<div data-aquarium><h2>AI Overview</h2><div data-container-id="main-col">Missing controller.</div></div>',
    '<div jscontroller="EYwa3d" data-aquarium><div data-container-id="main-col">Missing outer heading.</div></div>',
    '<div jscontroller="EYwa3d" data-aquarium><div data-container-id="main-col"><h2>AI Overview</h2>Heading within answer prose.</div></div>',
    initial('<p>Loading...</p>'),
    initial('<div aria-busy="true">An incomplete answer.</div>'),
    initial('<p>AI responses may include mistakes.</p><button>Generate</button>'),
  ])('keeps incomplete or unsupported initial document structures unverified: %s', html => {
    expect(parseGoogleAiOverviewHtml(html, SKY)).toMatchObject({ status: 'unverified', sources: [] });
  });

  it('keeps real HTTP markup outside ads, AI Mode, challenges, foreign pages and HTTP failures', () => {
    const html = fixture('aio-sky-http.html');
    expect(parseGoogleAiOverviewHtml(`<div data-ta-slot="1">${html}</div>`, SKY).status).toBe('unverified');
    expect(parseGoogleAiOverviewHtml(html, `${SKY}&udm=50`).status).toBe('unverified');
    expect(parseGoogleAiOverviewHtml(html.replace('>AI Overview</', '>AI Mode</'), SKY).status).toBe('unverified');
    expect(parseGoogleAiOverviewHtml(html, 'https://example.com/search').status).toBe('unverified');
    expect(parseGoogleAiOverviewHtml(html, 'https://www.google.com/sorry/index').status).toBe('blocked');
    expect(parseGoogleSearchHtml(html, { sourceUrl: SKY, httpStatus: 503 }).aiOverview.status).toBe('unverified');
  });

  it('excludes an initial document Overview citation title from organic results', () => {
    const overview = initial('<p>An answer.</p><a href="https://source.example/"><h3>A cited page</h3></a>');
    const html = `<div id="rso">${overview}<a href="https://organic.example/"><h3>An organic page</h3></a></div>`;
    const response = parseGoogleSearchHtml(html, { sourceUrl: SKY });
    expect(response.aiOverview.status).toBe('present');
    expect(response.organic.map(result => result.title)).toEqual(['An organic page']);
  });
});

describe('Google AI Overview simplified HTTP markup and inert transfers', () => {
  const SKY = 'https://www.google.com/search?q=why+is+the+sky+blue&hl=en&gl=us';
  const target = 'accdef_fixture_test_1';
  const fragment = '<div><h3>Full explanation</h3><p>A literal expanded answer.</p><div class="RFbPWe"><a class="CGJcbf GzaHMe" href="/url?q=CAESopaque_source_1&amp;uoh=3"><div class="UFvD1">A cited page</div><div class="BamJPe">Publisher label</div></a></div></div>';
  const call = `window.jsl.dh(${JSON.stringify(target)},${JSON.stringify(fragment)})`;
  const simplified = (scripts = '', extra = '') => `<div class="Gx5Zad xpd pkphOe EtOod"><div class="gqwIMe"><span>AI Overview</span></div><div><div class="ijO2Ed" id="NwHcK">Can't generate an AI overview right now. Try again later.</div><div class="frRrnc P8A8hc">A real summary.</div><div class="qxDOhb" id="${target}"></div></div><div class="JKlLNc">AI responses may include mistakes. <a href="https://support.google.com/websearch/">Learn more</a></div></div>${extra}${scripts}`;

  it.each([
    ['aio-sky-simplified-http.html', 7, 'Rayleigh Scattering:', 'why sunsets turn red and orange'],
    ['aio-leaves-simplified-http.html', 8, 'Chlorophyll breakdown:', 'which specific tree species create bright red'],
  ])('extracts complete supplied prose and source cards from actual HTTP fixture %s without evaluating scripts', (name, count, phrase, ending) => {
    const html = fixture(name as string);
    expect(html).not.toMatch(/m-x-content|pJyqm|data-container-id="main-col"/);
    expect(html).toContain('window.jsl.dh(');
    expect(html).toContain('.ijO2Ed{display:none');
    const response = parseGoogleSearchHtml(html, { sourceUrl: SKY });
    expect(response.status).toBe('results');
    expect(response.aiOverview.status).toBe('present');
    expect(response.aiOverview.text).toContain(phrase);
    expect(response.aiOverview.text).toContain(ending);
    expect(response.aiOverview.text).not.toMatch(/Can't generate|AI Overview|AI responses may include mistakes|Learn more|Show more|Show less/);
    expect(response.aiOverview.sources).toHaveLength(count as number);
    expect(response.aiOverview.sources.every(source => source.url.startsWith('https://www.google.com/url?q=CAESredacted_source_') && source.url.endsWith('&uoh=3'))).toBe(true);
    expect(response.aiOverview.sources.every(source => !source.title.includes('Learn more') && !source.title.includes('Publisher label'))).toBe(true);
    expect(response.aiOverview.markdown).toContain(phrase);
    expect(response.aiOverview.reason).toContain('without executing scripts');
    expect(response.aiOverview.reason).toContain('completeness are not established');
    expect(parseGoogleAiOverviewHtml(html, SKY)).toEqual(response.aiOverview);
  });

  it('reads both observed IIFE and direct literal transfer statements while excluding citation-card text from prose', () => {
    for (const code of [`(function(){${call};})();`, `${call};`]) {
      const result = parseGoogleAiOverviewHtml(simplified(`<script>${code}</script>`), SKY);
      expect(result.text).toBe('A real summary. Full explanation A literal expanded answer.');
      expect(result.sources).toEqual([{ title: 'A cited page', url: 'https://www.google.com/url?q=CAESopaque_source_1&uoh=3' }]);
      expect(result.markdown).not.toMatch(/Publisher label|A cited page|Learn more/);
    }
  });

  it('keeps only the observed teaser when no literal expansion is supplied', () => {
    expect(parseGoogleAiOverviewHtml(simplified(), SKY)).toMatchObject({ status: 'present', text: 'A real summary.', sources: [] });
  });

  it('reads literal data while leaving surrounding JavaScript and payload scripts unexecuted', () => {
    const host = globalThis as Record<string, unknown>;
    const key = '__google_search_inert_transfer_test';
    delete host[key];
    const payload = fragment + `<script>globalThis.${key}=true;</script>`;
    const code = `<script>globalThis.${key}=true;window.jsl.dh(${JSON.stringify(target)},${JSON.stringify(payload).replace(/</g, '\\x3c')});</script>`;
    const result = parseGoogleAiOverviewHtml(simplified(code), SKY);
    expect(result.text).toContain('A literal expanded answer.');
    expect(host[key]).toBeUndefined();
  });

  it('does not read transfers from inert HTML nodes or script-looking attribute text', () => {
    const script = `<script>(function(){${call};})();</script>`;
    for (const inert of [`<template>${script}</template>`, `<noscript>${script}</noscript>`, `<div data-decoy="${script.replace(/"/g, '&quot;')}"></div>`]) {
      expect(parseGoogleAiOverviewHtml(simplified(inert), SKY)).toMatchObject({ status: 'present', text: 'A real summary.', sources: [] });
    }
  });

  it.each([
    `const decoy = ${JSON.stringify(call)};`,
    `// ${call}\n`,
    `/* ${call} */`,
    `function unused(){${call};}`,
    `if (ready) ${call};`,
    `if (ready) (function(){${call};})();`,
    `ready ? ${call} : null;`,
    `(function(){if (ready) ${call};})();`,
    `(function(){const ready=true;${call};})();`,
    `(function(value){${call};})(true);`,
    `items.forEach(()=>${call});`,
    `window.jsl.dh(targetId,${JSON.stringify(fragment)});`,
    `window.jsl.dh(${JSON.stringify(target)},fragmentHtml);`,
    `window.jsl.dh(${JSON.stringify(target)},"<p>" + "A dynamic answer.</p>");`,
    `window.jsl.dh(${JSON.stringify(target)},\`A template answer.\`);`,
    `window["jsl"].dh(${JSON.stringify(target)},${JSON.stringify(fragment)});`,
    `throw new Error('stop');(function(){${call};})();`,
  ])('does not interpret decoys, conditionals, callbacks or dynamic transfers as a supplied answer: %s', code => {
    const result = parseGoogleAiOverviewHtml(simplified(`<script>${code}</script>`), SKY);
    expect(result).toMatchObject({ status: 'present', text: 'A real summary.', sources: [] });
  });

  it('rejects duplicate writes, ambiguous target IDs, inert script types and unknown writes to the same target', () => {
    const script = `<script>(function(){${call};})();</script>`;
    const cases = [
      simplified(script + script),
      simplified(script, `<div hidden id="${target}"></div>`),
      simplified(`<script type="application/json">${call}</script>`),
      simplified(script + `<script>if(ready) ${call};</script>`),
      simplified(script + `<script>window.jsl.dh(targetId,fragmentHtml);</script>`),
      simplified(`<script>window.jsl.dh("accdef_unknown",${JSON.stringify(fragment)});</script>`),
    ];
    for (const html of cases) expect(parseGoogleAiOverviewHtml(html, SKY)).toMatchObject({ status: 'present', text: 'A real summary.', sources: [] });
  });

  it('does not turn generic cards, missing headings, placeholders, ads, AI Mode or challenged pages into Overviews', () => {
    const html = simplified(`<script>(function(){${call};})();</script>`);
    const cases = [
      html.replace('Gx5Zad xpd pkphOe EtOod', 'Gx5Zad xpd'),
      html.replace('>AI Overview</span>', '>AI Mode</span>'),
      html.replace('class="JKlLNc"', 'class="unknown-footer"'),
      html.replace('class="gqwIMe"', 'class="unknown-header"'),
      `<div data-text-ad="1">${html}</div>`,
      simplified().replace('A real summary.', 'Loading...'),
    ];
    for (const value of cases) expect(parseGoogleAiOverviewHtml(value, SKY).status).toBe('unverified');
    expect(parseGoogleAiOverviewHtml(html, SKY + '&udm=50').status).toBe('unverified');
    expect(parseGoogleAiOverviewHtml(html, 'https://example.com/search').status).toBe('unverified');
    expect(parseGoogleAiOverviewHtml(html, 'https://www.google.com/sorry/index').status).toBe('blocked');
    expect(parseGoogleSearchHtml(html, { sourceUrl: SKY, httpStatus: 429 }).aiOverview.status).toBe('blocked');
  });

  it('keeps disclosure and organic links out of AIO citations and requires the observed opaque redirect shape', () => {
    const script = `<script>(function(){${call};})();</script>`;
    const html = simplified(script, '<div id="rso"><a href="https://organic.example/"><h3>An organic result</h3></a></div>');
    const response = parseGoogleSearchHtml(html, { sourceUrl: SKY });
    expect(response.organic.map(result => result.url)).toEqual(['https://organic.example/']);
    expect(response.aiOverview.sources).toEqual([{ title: 'A cited page', url: 'https://www.google.com/url?q=CAESopaque_source_1&uoh=3' }]);
    for (const invalid of ['javascript://www.google.com/url?q=CAESopaque_source_1&uoh=3', 'https://user:password@www.google.com/url?q=CAESopaque_source_1&uoh=3', '/url?q=not-a-url&uoh=3', '/url?q=CAESopaque_source_1&uoh=2', '/url?q=javascript%3Aalert(1)&uoh=3']) {
      const payload = fragment.replace('/url?q=CAESopaque_source_1&amp;uoh=3', invalid);
      const code = `<script>(function(){window.jsl.dh(${JSON.stringify(target)},${JSON.stringify(payload)});})();</script>`;
      expect(parseGoogleAiOverviewHtml(simplified(code), SKY).sources).toEqual([]);
    }
    const missingTitle = fragment.replace('class="UFvD1"', 'class="unknown-title"');
    const code = `<script>(function(){window.jsl.dh(${JSON.stringify(target)},${JSON.stringify(missingTitle)});})();</script>`;
    expect(parseGoogleAiOverviewHtml(simplified(code), SKY).sources).toEqual([]);
  });
});
