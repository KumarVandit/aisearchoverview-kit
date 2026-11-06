import { ancestor, descendants, visibleText, type HtmlNode } from './html.js';
import type { GoogleAiOverviewVideo } from './types.js';

export function sourceDescription(card: HtmlNode, title: string): string | undefined {
  const normalized = title.replace(/, Video, watch on YouTube$/, '');
  for (const node of descendants(card)) {
    const children = node.children.filter((child): child is HtmlNode => typeof child === 'object');
    if (children.length !== 2 || visibleText(children[0]!) !== normalized) continue;
    const description = visibleText(children[1]!).trim();
    if (description && description !== normalized) return description;
  }
  return undefined;
}

function seconds(text: string): number | undefined {
  const parts = [...text.matchAll(/(\d+)\s*(hours?|minutes?|seconds?)/g)];
  if (!parts.length) return undefined;
  return parts.reduce((total, match) => total + Number(match[1]) * (match[2]!.startsWith('hour') ? 3600 : match[2]!.startsWith('minute') ? 60 : 1), 0);
}
function duration(value: number): string {
  return value >= 3600 ? Math.floor(value / 3600) + ':' + String(Math.floor(value / 60) % 60).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0') : Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
}

/** Observed inline media listitems are distinct from video links in the source rail. */
export function overviewVideos(content: HtmlNode, sourceUrl: string): GoogleAiOverviewVideo[] {
  const videos: GoogleAiOverviewVideo[] = [], seen = new Set<string>();
  for (const card of descendants(content).filter(node => node.attrs.role === 'listitem' && node.attrs['data-text-ad'] === undefined && node.attrs['data-ta-slot'] === undefined && !ancestor(node, parent => parent.attrs['data-text-ad'] !== undefined || parent.attrs['data-ta-slot'] !== undefined))) {
    const nodes = descendants(card);
    if (!nodes.some(node => node.attrs['data-ignore-copy'] !== undefined) && card.attrs['data-ignore-copy'] === undefined) continue;
    const player = nodes.find(node => node.attrs.role === 'button' && / on YouTube\. Play on Google\./.test(node.attrs['aria-label'] ?? ''));
    const match = /^(.*?) by (.*?) on YouTube\. Play on Google\.\s*-\s*(.*)$/.exec(player?.attrs['aria-label'] ?? '');
    if (!match) continue;
    const link = nodes.find(node => {
      if (node.tag !== 'a') return false;
      try { const url = new URL(node.attrs.href ?? '', sourceUrl); return url.protocol === 'https:' && !url.username && !url.password && ['www.youtube.com', 'youtube.com'].includes(url.hostname) && url.pathname === '/watch' && !!url.searchParams.get('v'); } catch { return false; }
    });
    if (!link) continue;
    const url = new URL(link.attrs.href!, sourceUrl).toString();
    if (seen.has(url)) continue;
    seen.add(url);
    const total = seconds(/Total Duration:\s*(.*)$/.exec(match[3]!)?.[1] ?? (/Segment Duration:/.test(match[3]!) ? '' : match[3]!));
    const segment = seconds(/Segment Duration:\s*(.*?)\s*-/.exec(match[3]!)?.[1] ?? '');
    const start = seconds(/Starts at:\s*(.*?)\s*-/.exec(match[3]!)?.[1] ?? '');
    const date = /\b(?:\d+\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?) ago|yesterday)\b/.exec(visibleText(card))?.[0];
    const thumbnail = descendants(player!).find(node => node.tag === 'img' && /^https?:\/\//.test(node.attrs.src ?? ''))?.attrs.src;
    let safeThumbnail: string | undefined;
    if (thumbnail) { try { const parsed = new URL(thumbnail); if (!parsed.username && !parsed.password) safeThumbnail = parsed.toString(); } catch { /* Omit malformed observed assets. */ } }
    videos.push({url,title:match[1]!,source:'YouTube',platform:'youtube',channel:match[2]!,...(total !== undefined ? {duration:duration(total)} : {}),...(segment !== undefined ? {segmentDurationSeconds:segment} : {}),...(start !== undefined ? {startTimeSeconds:start} : {}),...(date ? {date} : {}),...(safeThumbnail ? {thumbnail:safeThumbnail} : {})});
  }
  return videos;
}
