import { overviewProductLinks, productViewerNotice, productViewerUrl, productViewerTitle } from './related-links.js';
import { overviewVideos, sourceDescription } from './assets.js';
import { GoogleSearchError } from './errors.js';
import { ancestor, descendants, parseHtml, visibleText, type HtmlNode } from './html.js';
import { overviewMarkdown } from './markdown.js';
import { analyzeHtmlTransfers } from './transfers.js';
import type {
  GoogleAiOverview, GoogleAutocompleteResponse, GoogleOrganicResult, GoogleSearchLink,
  GoogleSearchResponse, GoogleSearchStatus, ParseGoogleSearchOptions, GoogleAiOverviewCitationPill,
} from './types.js';

const EXPERIMENTAL = 'Organic and related-question extraction covers recognized structures only; the surrounding SERP feature set is incomplete.';

function externalUrl(value: string | undefined, sourceUrl: string, opaqueRedirect = false): string | undefined {
  if (!value) return undefined;
  let url: URL;
  try { url = new URL(value, sourceUrl); } catch { return undefined; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
  if (url.hostname==='googleadservices.com'||url.hostname.endsWith('.googleadservices.com')||(['www.google.com','google.com'].includes(url.hostname)&&/^\/(?:aclk|pagead)(?:\/|$)/.test(url.pathname))) return undefined;
  if (url.hostname === 'www.google.com' || url.hostname === 'google.com') {
    if (url.pathname === '/url') {
      const target = url.searchParams.get('q') ?? url.searchParams.get('url');
      if (!target) return undefined;
      if (opaqueRedirect && url.searchParams.get('uoh') === '3' && /^CAES[A-Za-z0-9_-]+$/.test(target)) return url.toString();
      try { url = new URL(target); } catch { return undefined; }
    }
    if ((url.hostname === 'www.google.com' || url.hostname === 'google.com') && (/^\/(?:search|url|imgres|preferences|setprefs|advanced_search)(?:\/|$)/.test(url.pathname) || url.pathname.startsWith('/sorry/'))) return undefined;
  }
  return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.toString() : undefined;
}

function label(node: HtmlNode, nodes: HtmlNode[]): string {
  const direct = node.attrs['aria-label'];
  if (direct) return visibleText(parseHtml(direct));
  const ids = node.attrs['aria-labelledby']?.split(/\s+/);
  return ids ? ids.map(id => nodes.find(item => item.attrs.id === id)).filter((item): item is HtmlNode => !!item).map(visibleText).join(' ') : '';
}

function region(nodes: HtmlNode[], name: string): HtmlNode | undefined {
  return nodes.find(node => (node.tag === 'section' || node.attrs.role === 'region') && label(node, nodes).toLowerCase() === name.toLowerCase());
}

function isAd(node: HtmlNode): boolean {
  return node.attrs['data-text-ad'] !== undefined || node.attrs['data-ta-slot'] !== undefined;
}

function insideAd(node: HtmlNode): boolean {
  return isAd(node) || ancestor(node, isAd) !== undefined;
}

function overviewHeading(node: HtmlNode): boolean {
  return (node.attrs.role === 'heading' && node.attrs['aria-level'] === '2' || node.tag === 'h2') && /^AI Overview$/i.test(visibleText(node).trim());
}

interface OverviewScope {
  container: HtmlNode;
  content: HtmlNode;
  rhs?: HtmlNode;
  observed: boolean;
  simplified?: boolean;
}

function hasClass(node: HtmlNode, name: string): boolean {
  return (node.attrs.class ?? '').split(/\s+/).includes(name);
}

function simplifiedOverviewRoot(node: HtmlNode): boolean {
  if (!['Gx5Zad', 'xpd', 'pkphOe'].every(name => hasClass(node, name)) || insideAd(node)) return false;
  const header = node.children.find((child): child is HtmlNode => typeof child === 'object' && hasClass(child, 'gqwIMe'));
  const footer = node.children.find((child): child is HtmlNode => typeof child === 'object' && hasClass(child, 'JKlLNc'));
  return !!header && descendants(header).some(child => child.tag === 'span' && visibleText(child).trim() === 'AI Overview') && !!footer && /^AI responses may include mistakes\./.test(visibleText(footer));
}

function mountOverviewTransfers(tree: HtmlNode): void {
  const nodes: HtmlNode[] = [];
  const stack = [tree];
  while (stack.length) {
    const current = stack.pop()!;
    nodes.push(current);
    for (const child of current.children) if (typeof child === 'object') stack.push(child);
  }
  const roots = descendants(tree).filter(simplifiedOverviewRoot);
  if (!roots.length) return;
  const targets = roots.flatMap(root => descendants(root).filter(node => hasClass(node, 'qxDOhb') && node.attrs.id?.startsWith('accdef_') && nodes.filter(other => other.attrs.id === node.attrs.id).length === 1 && node.children.every(child => typeof child === 'string' && !child.trim())));
  const analyses = nodes.filter(node => node.tag === 'script' && node.attrs.src === undefined && /^(?:text\/javascript|application\/javascript)?$/i.test(node.attrs.type ?? '') && !ancestor(node, parent => /^(?:template|noscript)$/.test(parent.tag))).map(node => analyzeHtmlTransfers(node.rawText ?? ''));
  if (analyses.some(analysis => analysis.unknownTarget)) return;
  const blocked = new Set(analyses.flatMap(analysis => analysis.blockedIds));
  const patches = analyses.flatMap(analysis => analysis.transfers);
  for (const target of targets) {
    if (blocked.has(target.attrs.id!)) continue;
    const matching = patches.filter(patch => patch.id === target.attrs.id);
    if (matching.length !== 1) continue;
    target.children = parseHtml(matching[0]!.html).children;
    for (const child of target.children) if (typeof child === 'object') child.parent = target;
  }
}

function overviewWrapper(node: HtmlNode): boolean {
  return node.attrs.jscontroller === 'pJyqm' && node.attrs.jsmodel?.split(/\s+/).includes('FRbqE') === true;
}

function overviewDocumentRoot(node: HtmlNode): boolean {
  return node.attrs.jscontroller === 'EYwa3d' && node.attrs['data-aquarium'] !== undefined;
}

function overviewScope(nodes: HtmlNode[]): OverviewScope | undefined {
  // Ozu assigns m-x-content during client truncation setup; the observed wrapper also identifies markup before that mutation.
  const containers = [...nodes.filter(overviewWrapper), ...nodes.filter(overviewDocumentRoot), ...nodes.filter(node => node.attrs.id === 'm-x-content')];
  for (const container of containers.filter(node => !insideAd(node))) {
    const children = descendants(container);
    const content = children.find(node => node.attrs['data-container-id'] === 'main-col' && !insideAd(node));
    const heading = children.find(node => overviewHeading(node) && !ancestor(node, parent => parent.attrs['data-container-id'] !== undefined, container));
    if (content && heading) return { container, content, rhs: children.find(node => node.attrs['data-container-id'] === 'rhs-col' && !insideAd(node)), observed: true };
  }
  for (const container of nodes.filter(simplifiedOverviewRoot)) {
    const children = descendants(container);
    const summaries = children.filter(node => hasClass(node, 'frRrnc') && !insideAd(node));
    const targets = children.filter(node => hasClass(node, 'qxDOhb') && node.attrs.id?.startsWith('accdef_') && !insideAd(node));
    if (summaries.length !== 1 || targets.length !== 1) continue;
    return { container, content: { tag: 'div', attrs: {}, children: [summaries[0]!, targets[0]!] }, rhs: targets[0], observed: true, simplified: true };
  }
  const container = nodes.find(node => !insideAd(node) && (node.tag === 'section' || node.attrs.role === 'region') && /^AI Overview$/i.test(label(node, nodes)));
  return container ? { container, content: container, observed: false } : undefined;
}

const OVERVIEW_PLACEHOLDER = /^(?:(?:(?:loading|generating|thinking|searching)(?:\s+(?:(?:an?\s+)?(?:ai\s+)?(?:overview|response|answer|results|summary)|for information|the web))?|please\s+wait|just\s+a\s+moment|\d+(?:\.\d+)?%)(?:[\s.…!,:;-]+|$))+$/i;
const OVERVIEW_NOTICE = /^(?:(?:AI (?:responses|Overviews?) (?:may include|can make) mistakes|AI can make mistakes|Generative AI is experimental|(?:An? )?AI Overview is not available for this search|Can't generate an AI overview right now|Error translating content)(?:[.!…:\s]*(?:Learn more|Please try again later|Try again later))*[.!…\s]*|AI Overview)$/i;

function overviewContent(scope: OverviewScope, sourceUrl?: string, includeCitations = true): HtmlNode {
  const content: HtmlNode = { tag: 'div', attrs: {}, children: [] };
  const stack = [{ source: scope.content, target: content }];
  while (stack.length > 0) {
    const { source, target } = stack.pop()!;
    for (const child of source.children) {
      if (typeof child === 'string') { target.children.push(child); continue; }
      if (insideAd(child) || child.attrs['data-ignore-copy'] !== undefined || (sourceUrl && productViewerNotice(child, sourceUrl))) continue;
      const productUrl = sourceUrl ? productViewerUrl(child, sourceUrl) : undefined;
      if (productUrl && sourceUrl) { target.children.push({tag:'a',attrs:{href:productUrl.toString()},children:[productViewerTitle(child, sourceUrl)]}); continue; }
      if (scope.simplified && (hasClass(child, 'RFbPWe') || hasClass(child, 'CGJcbf') || child.attrs.id === 'NwHcK')) continue;
      if (child.attrs['data-suuid'] !== undefined) {
        const seen = new Set<string>();
        if (sourceUrl && includeCitations) for (const link of descendants(child).filter(node => node.tag === 'a')) {
          const url = externalUrl(link.attrs.href, sourceUrl, true);
          const title = link.attrs['aria-label']?.trim() || visibleText(link);
          if (url && title && !seen.has(url)) { target.children.push(' ', { tag: 'a', attrs: { href: url }, children: [title] }); seen.add(url); }
        }
        continue;
      }
      if (/^(?:button|cite|nav|svg|input|aside|footer)$/.test(child.tag) || /^(?:button|status|progressbar|navigation)$/.test(child.attrs.role ?? '')) continue;
      if (overviewHeading(child) || /^AI Mode replied:$/i.test(visibleText(child).trim()) || OVERVIEW_NOTICE.test(visibleText(child))) continue;
      if (!scope.observed && child.tag === 'a' && !ancestor(child, node => node.tag === 'p' || node.tag === 'li', scope.content)) continue;
      const copy: HtmlNode = { ...child, children: [] };
      target.children.push(copy);
      stack.push({ source: child, target: copy });
    }
  }
  return content;
}

function overviewCitations(scope: OverviewScope, sourceUrl: string, sources: GoogleSearchLink[]): GoogleAiOverviewCitationPill[] {
  const pills: GoogleAiOverviewCitationPill[] = [];
  let id = 0;
  for (const widget of descendants(scope.content).filter(node => node.attrs['data-suuid'] !== undefined && !insideAd(node))) {
    id++;
    const seen = new Set<number>();
    for (const link of descendants(widget).filter(node => node.tag === 'a')) {
      const url = externalUrl(link.attrs.href, sourceUrl, true);
      const index = sources.findIndex(source => source.url === url);
      if (index < 0 || !url || seen.has(index)) continue;
      seen.add(index);
      pills.push({ ...(sources[index]!.description ? { description:sources[index]!.description } : {}), citationPillId: id, position: index + 1, label: link.attrs['aria-label']?.trim() || sources[index]!.title, url, domain: new URL(url).hostname });
    }
  }
  return pills;
}

function overviewLinks(scope: OverviewScope, sourceUrl: string): GoogleSearchLink[] {
  const links: HtmlNode[] = [];
  if (scope.simplified) {
    if (scope.rhs) links.push(...descendants(scope.rhs).filter(node => node.tag === 'a' && hasClass(node, 'CGJcbf') && hasClass(node, 'GzaHMe')));
  } else if (scope.observed) {
    if (scope.rhs) {
      for (const card of descendants(scope.rhs).filter(node => node.attrs['data-src-id'] !== undefined && !insideAd(node))) {
        links.push(...descendants(card).filter(node => node.tag === 'a' && node.attrs['data-link-behavior'] === 'cobrowse'));
      }
    }
    links.push(...descendants(scope.content).filter(node => node.tag === 'a' && !ancestor(node, parent => parent.attrs['data-ignore-copy'] !== undefined || isAd(parent), scope.content)));
  } else links.push(...descendants(scope.content).filter(node => node.tag === 'a'));
  const seen = new Set<string>();
  return links.flatMap(node => {
    const url = externalUrl(node.attrs.href, sourceUrl, scope.simplified);
    const titleNode = scope.simplified ? descendants(node).find(child => hasClass(child, 'UFvD1')) : undefined;
    if (scope.simplified && !titleNode) return [];
    const title = (titleNode ? visibleText(titleNode) : node.attrs['aria-label']?.trim() || visibleText(node)).trim();
    if (!url || !title || seen.has(url) || insideAd(node)) return [];
    seen.add(url);
    const card = ancestor(node, parent => parent.attrs['data-src-id'] !== undefined, scope.container);
    const description = card ? sourceDescription(card, title) : undefined;
    return [{ title, url, ...(description ? {description} : {}) }];
  });
}

function overview(nodes: HtmlNode[], source: URL, blocked: boolean): GoogleAiOverview {
  if (blocked) return { status: 'blocked', sources: [], reason: 'Google denied access to the result page.' };
  if (source.pathname !== '/search' || source.searchParams.get('udm') === '50') return {
    status: 'unverified', sources: [], reason: 'The supplied URL does not identify a standard Google Search overview response; AI Mode is a separate experience.',
  };
  const scope = overviewScope(nodes);
  if (!scope) return {
    status: 'unverified', sources: [],
    reason: 'No supported AI Overview structure was recognized; absence, deferred loading, and unsupported markup cannot be distinguished.',
  };
  const text = visibleText(overviewContent(scope, source.toString(), false)).trim();
  const busy = scope.container.attrs['aria-busy'] === 'true' || scope.content.attrs['aria-busy'] === 'true' || descendants(scope.content).some(node => node.attrs['aria-busy'] === 'true');
  if (busy || !/[\p{L}\p{N}]/u.test(text) || OVERVIEW_PLACEHOLDER.test(text) || OVERVIEW_NOTICE.test(text)) return {
    status: 'unverified', sources: [],
    reason: 'An AI Overview structure was recognized, but answer text was not established beyond notices, controls or loading placeholders.',
  };
  const sources = overviewLinks(scope, source.toString());
  const citationPills = overviewCitations(scope, source.toString(), sources);
  const productLinks = scope.observed && !scope.simplified ? overviewProductLinks(scope.content, source.toString()) : [];
  const videos = scope.observed && !scope.simplified ? overviewVideos(scope.content, source.toString()) : [];
  return {
    status: 'present', text, sources,
    markdown: overviewMarkdown(overviewContent(scope, source.toString()), source.toString()),
    ...(citationPills.length ? { citationPills } : {}),
    ...(videos.length ? {videos} : {}),
    ...(productLinks.length ? {productLinks} : {}),
    reason: scope.simplified
      ? 'Answer text and cited links were extracted from simplified Search HTML and literal inline HTML transfers without executing scripts; generation and expansion completeness are not established by the snapshot.'
      : scope.observed
      ? 'Answer text and citations were extracted from the observed Google AI Overview structure; generation and expansion completeness are not established by the snapshot.'
      : 'An explicitly labeled semantic overview contains answer text; this fallback has structural coverage rather than a matching live Google layout.',
  };
}

function parseInput(html: string, sourceUrl: string): { source: URL; nodes: HtmlNode[]; tree: HtmlNode } {
  if (typeof html !== 'string' || html.length > 10_000_000) throw new GoogleSearchError('Search HTML must be a string no longer than 10000000 characters', 'parse');
  let source: URL;
  try { source = new URL(sourceUrl); } catch { throw new GoogleSearchError('Invalid Search response URL', 'parse'); }
  const tree = parseHtml(html);
  mountOverviewTransfers(tree);
  return { source, tree, nodes: descendants(tree) };
}

function googleSource(source: URL): boolean {
  return source.protocol === 'https:' && ['www.google.com', 'google.com', 'consent.google.com'].includes(source.hostname);
}

function blockedPage(nodes: HtmlNode[], source: URL, text: string): boolean {
  return source.pathname.startsWith('/sorry/') || nodes.some(node => node.attrs.id === 'captcha-form') || /Our systems have detected unusual traffic from your computer network/i.test(text);
}

/** Reads an observed rendered overview or the semantic fallback without executing page scripts. */
export function parseGoogleAiOverviewHtml(html: string, sourceUrl = 'https://www.google.com/search'): GoogleAiOverview {
  const { source, nodes, tree } = parseInput(html, sourceUrl);
  const google = googleSource(source);
  return overview(google ? nodes : [], source, google && blockedPage(nodes, source, visibleText(tree)));
}

function organicResults(root: HtmlNode, nodes: HtmlNode[], sourceUrl: string): GoogleOrganicResult[] {
  const results: GoogleOrganicResult[] = [];
  const seen = new Set<string>();
  for (const heading of descendants(root).filter(node => node.tag === 'h3')) {
    const link = ancestor(heading, node => node.tag === 'a', root);
    if (!link || ancestor(link, node => isAd(node) || node.attrs.id === 'm-x-content' || overviewWrapper(node) || overviewDocumentRoot(node) || simplifiedOverviewRoot(node) || /^(?:AI Overview|People also ask|Related searches)$/i.test(label(node, nodes)), root)) continue;
    const url = externalUrl(link.attrs.href, sourceUrl, true);
    const title = visibleText(heading);
    if (!url || !title || seen.has(url)) continue;
    const container = ancestor(link, node => (hasClass(node,'Gx5Zad') && hasClass(node,'xpd')) || node.attrs['data-sokoban-container'] !== undefined || node.attrs['data-hveid'] !== undefined || /(?:^|\s)(?:MjjYud|g)(?:\s|$)/.test(node.attrs.class ?? ''), root) ?? link.parent;
    const children = container ? descendants(container) : [];
    const snippet = children.find(node => hasClass(node,'H66NU') || node.attrs['data-sncf'] !== undefined || /(?:^|\s)(?:VwiC3b|aCOpRe)(?:\s|$)/.test(node.attrs.class ?? ''));
    const cite = children.find(node => node.tag === 'cite' || hasClass(node,'BamJPe'));
    results.push({
      position: results.length + 1, title, url,
      ...(snippet && visibleText(snippet) ? { snippet: visibleText(snippet) } : {}),
      ...(cite && visibleText(cite) ? { displayUrl: visibleText(cite) } : {}),
    });
    seen.add(url);
  }
  return results;
}

/** Parses supplied Search HTML without executing scripts; unrecognized markup never implies an absent AI Overview. */
export function parseGoogleSearchHtml(html: string, options: ParseGoogleSearchOptions): GoogleSearchResponse {
  const { source, tree, nodes } = parseInput(html, options.sourceUrl);
  const text = visibleText(tree);
  const httpStatus = options.httpStatus ?? 200;
  const google = googleSource(source);
  const root = google && source.pathname === '/search' ? nodes.find(node => node.attrs.id === 'rso') ?? nodes.find(node => node.attrs.id === 'search') ?? nodes.find(node => node.attrs.id === 'main' && descendants(node).some(child => hasClass(child,'Gx5Zad') && descendants(child).some(heading=>heading.tag==='h3'))) : undefined;
  const candidates = root ? organicResults(root, nodes, source.toString()) : [];
  const renderedOverview = overview(google ? nodes : [], source, false);
  let status: GoogleSearchStatus = 'unrecognized';
  if (google && (httpStatus === 403 || httpStatus === 429 || blockedPage(nodes, source, text))) status = 'blocked';
  else if (google && (source.hostname === 'consent.google.com' || nodes.some(node => node.tag === 'form' && /consent\.google\.com/.test(node.attrs.action ?? '')))) status = 'consent-required';
  else if (google && candidates.length === 0 && renderedOverview.status !== 'present' && (nodes.some(node => node.tag === 'a' && /\/httpservice\/retry\/enablejs\b/.test(node.attrs.href ?? '')) || /\/httpservice\/retry\/enablejs\b/.test(html))) status = 'javascript-required';
  const readable = google && source.pathname === '/search' && status === 'unrecognized' && httpStatus >= 200 && httpStatus < 300;
  const aiOverview = readable ? renderedOverview : overview([], source, status === 'blocked');
  const eligible = readable && (root !== undefined || aiOverview.status === 'present');
  const organic = eligible ? candidates : [];
  if (eligible && (organic.length > 0 || aiOverview.status === 'present')) status = 'results';
  else if (eligible && /did not match any documents|No results found for/i.test(text)) status = 'empty';
  const questions = eligible ? region(nodes, 'People also ask') : undefined;
  const related = eligible ? region(nodes, 'Related searches') : undefined;
  const relatedQuestions = questions ? [...new Set(descendants(questions).filter(node => node.attrs['data-q'] !== undefined || node.attrs.role === 'button' || node.tag === 'summary').map(node => node.attrs['data-q'] || visibleText(node)).filter(Boolean))] : [];
  const relatedSearches = related ? descendants(related).filter(node => node.tag === 'a').flatMap(node => {
    let url: URL;
    try { url = new URL(node.attrs.href ?? '', source); } catch { return []; }
    const query = url.searchParams.get('q');
    return url.origin === source.origin && url.pathname === '/search' && query ? [{ query, url: url.toString() }] : [];
  }) : [];
  return {
    query: options.query ?? source.searchParams.get('q') ?? '', sourceUrl: source.toString(), httpStatus, status, organic,
    relatedQuestions, relatedSearches,
    aiOverview,
    warnings: [EXPERIMENTAL, ...(status === 'unrecognized' ? ['The response was not recognized as a supported Search result page.'] : [])],
    ...(options.includeRawHtml ? { rawHtml: html } : {}),
  };
}

/** Decodes the anonymous firefox-client autocomplete response, preserving unknown metadata. */
export function parseGoogleAutocomplete(raw: unknown): GoogleAutocompleteResponse {
  if (!Array.isArray(raw) || typeof raw[0] !== 'string' || !Array.isArray(raw[1]) || !raw[1].every(item => typeof item === 'string')) {
    throw new GoogleSearchError('Invalid Google autocomplete response', 'parse');
  }
  return { query: raw[0], suggestions: raw[1] as string[], raw };
}
