export interface HtmlNode {
  tag: string;
  attrs: Record<string, string>;
  parent?: HtmlNode;
  children: Array<HtmlNode | string>;
  rawText?: string;
}

const entities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', bull: '•', middot: '·', copy: '©', reg: '®',
  AMP: '&', LT: '<', GT: '>', QUOT: '"',
  le: '≤', ge: '≥', ne: '≠', times: '×', divide: '÷', plusmn: '±', minus: '−',
  rarr: '→', larr: '←', harr: '↔', frac12: '½', frac14: '¼', frac34: '¾',
  radic: '√', infin: '∞', sum: '∑', prod: '∏', pi: 'π', alpha: 'α', beta: 'β',
  gamma: 'γ', theta: 'θ', lambda: 'λ', mu: 'μ', sigma: 'σ', phi: 'φ', omega: 'ω',
  Delta: 'Δ', delta: 'δ', asymp: '≈', equiv: '≡', notin: '∉', deg: '°', sup2: '²', sup3: '³',
};

const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const ignoredTags = new Set(['script', 'style', 'template', 'noscript']);

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]*);/gi, (match, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity] ?? match;
    const code = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '�';
  });
}

function tagEnd(html: string, start: number): number {
  let quote: string | undefined;
  for (let i = start; i < html.length; i++) {
    const character = html[i];
    if (quote) { if (character === quote) quote = undefined; }
    else if (character === '"' || character === "'") quote = character;
    else if (character === '>') return i;
  }
  return -1;
}

export function parseHtml(html: string): HtmlNode {
  const root: HtmlNode = { tag: '#document', attrs: {}, children: [] };
  const stack = [root];
  const lower = html.toLowerCase();
  let cursor = 0;
  while (cursor < html.length) {
    const open = html.indexOf('<', cursor);
    const parent = stack[stack.length - 1]!;
    if (open === -1) { parent.children.push(html.slice(cursor)); break; }
    if (open > cursor) parent.children.push(html.slice(cursor, open));
    if (html.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4);
      cursor = end === -1 ? html.length : end + 3;
      continue;
    }
    const end = tagEnd(html, open + 1);
    if (end === -1) { parent.children.push(html.slice(open)); break; }
    const token = html.slice(open + 1, end);
    const match = /^(\/?)\s*([a-z][a-z\d:-]*)\b/i.exec(token);
    cursor = end + 1;
    if (!match) continue;
    const tag = match[2]!.toLowerCase();
    if (match[1]) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i]!.tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    const attrs: Record<string, string> = Object.create(null) as Record<string, string>;
    const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    pattern.lastIndex = match[0].length;
    let attribute: RegExpExecArray | null;
    while ((attribute = pattern.exec(token))) {
      const name = attribute[1]!.toLowerCase();
      if (!(name in attrs)) attrs[name] = decodeEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
    }
    const node: HtmlNode = { tag, attrs, children: [], parent };
    parent.children.push(node);
    if (ignoredTags.has(tag)) {
      const close = lower.indexOf(`</${tag}`, cursor);
      if (tag === 'script' || tag === 'style') node.rawText = html.slice(cursor, close === -1 ? html.length : close);
      if (close !== -1) {
        const closeEnd = tagEnd(html, close + 2);
        cursor = closeEnd === -1 ? html.length : closeEnd + 1;
      } else cursor = html.length;
    } else if (!voidTags.has(tag) && !token.endsWith('/')) stack.push(node);
  }
  return root;
}

export function descendants(node: HtmlNode): HtmlNode[] {
  const found: HtmlNode[] = [];
  const stack = [...node.children].reverse();
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value !== 'object' || ignoredTags.has(value.tag) || value.attrs.hidden !== undefined || value.attrs['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(value.attrs.style ?? '')) continue;
    found.push(value);
    for (let i = value.children.length - 1; i >= 0; i--) stack.push(value.children[i]!);
  }
  return found;
}

export function visibleText(node: HtmlNode): string {
  const text: string[] = [];
  const stack: Array<HtmlNode | string> = [node];
  while (stack.length > 0) {
    const value = stack.pop()!;
    if (typeof value === 'string') { text.push(value); continue; }
    if (ignoredTags.has(value.tag) || value.attrs.hidden !== undefined || value.attrs['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(value.attrs.style ?? '')) continue;
    if (value.tag === 'img' && value.attrs.alt) text.push(' ', value.attrs.alt, ' ');
    if (/^(?:br|div|p|li|section|h[1-6]|pre|table|thead|tbody|tfoot|tr|th|td|caption|figure|figcaption|blockquote|article|dl|dt|dd|details|summary)$/.test(value.tag)) { text.push(' '); stack.push(' '); }
    for (let i = value.children.length - 1; i >= 0; i--) stack.push(value.children[i]!);
  }
  return decodeEntities(text.join('')).replace(/\s+/g, ' ').trim();
}

export function ancestor(node: HtmlNode, predicate: (candidate: HtmlNode) => boolean, boundary?: HtmlNode): HtmlNode | undefined {
  let current: HtmlNode | undefined = node;
  while (current && current !== boundary) {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return undefined;
}
