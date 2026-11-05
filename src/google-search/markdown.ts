import { decodeEntities, type HtmlNode } from './html.js';

function escapeText(text: string): string {
  return decodeEntities(text).replace(/\s+/g, ' ').replace(/[\\`*_\[\]<>]/g, '\\$&');
}

export function overviewMarkdown(root: HtmlNode, sourceUrl: string): string {
  const output: string[] = [];
  const stack: Array<{ node: HtmlNode | string; close?: string; depth: number; ordered: boolean }> = [{ node: root, depth: 0, ordered: false }];
  while (stack.length) {
    const frame = stack.pop()!;
    if (frame.close !== undefined) { output.push(frame.close); continue; }
    if (typeof frame.node === 'string') { output.push(escapeText(frame.node)); continue; }
    const node = frame.node;
    if (/^(?:script|style|template|noscript)$/.test(node.tag) || node.attrs.hidden !== undefined || node.attrs['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(node.attrs.style ?? '')) continue;
    let before = '', after = '', depth = frame.depth, ordered = frame.ordered;
    const heading = /^h([1-6])$/.exec(node.tag)?.[1] ?? (node.attrs.role === 'heading' ? node.attrs['aria-level'] : undefined);
    if (heading && /^[1-6]$/.test(heading)) { before = '\n\n' + '#'.repeat(Number(heading)) + ' '; after = '\n\n'; }
    else if (node.tag === 'br') before = '\n';
    else if (node.tag === 'strong' || node.tag === 'b') before = after = '**';
    else if (node.tag === 'em' || node.tag === 'i') before = after = '*';
    else if (node.tag === 'ul' || node.tag === 'ol') { before = '\n'; after = '\n'; depth++; ordered = node.tag === 'ol'; }
    else if (node.tag === 'li') { before = '\n' + '  '.repeat(Math.min(20, Math.max(0, depth - 1))) + (ordered ? '1. ' : '- '); after = '\n'; }
    else if (node.tag === 'p' || node.tag === 'div' || node.tag === 'section') before = after = '\n\n';
    else if (node.tag === 'a' && node.attrs.href) {
      try {
        const url = new URL(node.attrs.href, sourceUrl);
        if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
          before = '[';
          after = '](' + url.toString().replace(/[()]/g, char => char === '(' ? '%28' : '%29').replace(/[<>\\\s]/g, char => encodeURIComponent(char)) + ')';
        }
      } catch {}
    }
    output.push(before);
    stack.push({ node: '', close: after, depth, ordered });
    for (let i = node.children.length - 1; i >= 0; i--) stack.push({ node: node.children[i]!, depth, ordered });
  }
  return output.join('').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+(?=[^ \t-\d])/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
