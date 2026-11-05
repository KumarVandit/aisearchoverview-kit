import { ancestor, descendants, visibleText, type HtmlNode } from './html.js';
import type { GoogleAiOverviewProductLink } from './types.js';

export function productViewerUrl(node: HtmlNode, sourceUrl: string): URL | undefined {
  if (node.tag !== 'a' || node.attrs['data-link-behavior'] !== 'nocobrowse' || !/^\d+$/.test(node.attrs['data-cid'] ?? '')) return undefined;
  try {
    const url = new URL(node.attrs.href ?? '', sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password || !['google.com', 'www.google.com'].includes(url.hostname) || url.pathname !== '/search' || url.searchParams.get('ibp') !== 'oshop') return undefined;
    const docid = /(?:^|,)productDocid:(\d+)(?:,|$)/.exec(url.searchParams.get('prds') ?? '')?.[1];
    return docid === node.attrs['data-cid'] ? url : undefined;
  } catch { return undefined; }
}

/** Observed accessibility helper inside a product-viewer anchor, not answer prose. */
export function productViewerNotice(node: HtmlNode, sourceUrl: string): boolean {
  return node.tag === 'span' && visibleText(node) === 'Go to product viewer dialog for this item.' && !!ancestor(node, parent => !!productViewerUrl(parent, sourceUrl));
}

export function productViewerTitle(node: HtmlNode, sourceUrl: string): string {
  const clean = (current: HtmlNode): HtmlNode => ({ ...current, children:current.children.flatMap<HtmlNode | string>(child => typeof child === 'string' ? [child] : productViewerNotice(child, sourceUrl) ? [] : [clean(child)]) });
  return visibleText(clean(node));
}

/** Extra product references observed in AIO prose; these are neither citations nor merchant offers. */
export function overviewProductLinks(content: HtmlNode, sourceUrl: string): GoogleAiOverviewProductLink[] {
  const links: GoogleAiOverviewProductLink[] = [], seen = new Set<string>();
  for (const node of descendants(content)) {
    if (node.attrs['data-ignore-copy'] !== undefined || node.attrs['data-text-ad'] !== undefined || node.attrs['data-ta-slot'] !== undefined || ancestor(node, parent => parent.attrs['data-ignore-copy'] !== undefined || parent.attrs['data-text-ad'] !== undefined || parent.attrs['data-ta-slot'] !== undefined, content)) continue;
    const url = productViewerUrl(node, sourceUrl), title = url ? productViewerTitle(node, sourceUrl) : '';
    if (!url || !title || seen.has(url.toString())) continue;
    seen.add(url.toString());
    links.push({ position:links.length + 1, title, url:url.toString(), productDocid:node.attrs['data-cid']! });
  }
  return links;
}
