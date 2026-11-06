import { decodeEntities, descendants, visibleText, type HtmlNode } from './html.js';

function escapeText(text: string): string {
  return decodeEntities(text).replace(/\s+/g, ' ').replace(/[\\`*_\[\]<>]/g, '\\$&');
}

function hidden(node: HtmlNode): boolean {
  return /^(?:script|style|template|noscript)$/.test(node.tag) || node.attrs.hidden !== undefined || node.attrs['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(node.attrs.style ?? '');
}

function contentText(root: HtmlNode): string {
  const output: string[] = [], stack: Array<HtmlNode | string> = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (typeof node === 'string') { output.push(decodeEntities(node)); continue; }
    if (hidden(node)) continue;
    if (node.tag === 'br') output.push('\n');
    for (let index = node.children.length - 1; index >= 0; index--) stack.push(node.children[index]!);
  }
  return output.join('');
}

function backticks(text: string, minimum: number): string {
  let length = minimum;
  for (const match of text.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
  return '`'.repeat(length);
}

function codeSpan(text: string): string {
  const value = text.replace(/\r\n?|\n/g, ' '), delimiter = backticks(value, 1);
  const pad = /^(?:`| )|(?:`| )$/.test(value) && /[^ ]/.test(value) ? ' ' : '';
  return delimiter + pad + value + pad + delimiter;
}

function codeBlock(node: HtmlNode): string {
  const code = contentText(node).replace(/\r\n?/g, '\n'), delimiter = backticks(code, 3);
  const languageNode = descendants(node).find(child => child.tag === 'code') ?? node;
  const language = /(?:^|\s)language-([A-Za-z0-9_+-]{1,40})(?:\s|$)/.exec(languageNode.attrs.class ?? '')?.[1] ?? '';
  return delimiter + language + '\n' + code + (code.endsWith('\n') ? '' : '\n') + delimiter;
}

function safeUrl(value: string | undefined, sourceUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, sourceUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.toString().replace(/[()]/g, char => char === '(' ? '%28' : '%29').replace(/[<>\\\s]/g, char => encodeURIComponent(char));
  } catch { return undefined; }
}

function integer(value: string | undefined): number | undefined {
  if (value === undefined || !/^[+-]?\d+$/.test(value.trim())) return undefined;
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : undefined;
}

function tableMarkdown(table: HtmlNode, sourceUrl: string): string {
  const rows: Array<{ header: boolean; cells: HtmlNode[] }> = [];
  const stack = table.children.filter((child): child is HtmlNode => typeof child === 'object').reverse().map(node => ({ node, header: false }));
  while (stack.length) {
    const { node, header } = stack.pop()!;
    if (hidden(node) || node.tag === 'table') continue;
    const head = header || node.tag === 'thead';
    if (node.tag === 'tr') {
      const cells = node.children.filter((child): child is HtmlNode => typeof child === 'object' && /^(?:td|th)$/.test(child.tag) && !hidden(child));
      if (cells.length) rows.push({ header: head, cells });
    }
    for (let index = node.children.length - 1; index >= 0; index--) { const child = node.children[index]!; if (typeof child === 'object') stack.push({ node: child, header: head }); }
  }
  if (!rows.length) return escapeText(visibleText(table));
  const cellText = (cell: HtmlNode) => {
    if (descendants(cell).some(child => child.tag === 'table')) return escapeText(visibleText(cell)).replace(/\|/g, '\\|');
    return overviewMarkdown(cell, sourceUrl).replace(/\|/g, '\\|').replace(/\n+/g, '<br>');
  };
  const content = rows.map(row => row.cells.map(cellText)), width = content.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  const header = rows[0]!.header || rows[0]!.cells.some(cell => cell.tag === 'th') ? content.shift()! : Array<string>(width).fill('');
  const line = (cells: string[]) => '| ' + Array.from({ length: width }, (_, index) => cells[index] ?? '').join(' | ') + ' |';
  const caption = table.children.find((child): child is HtmlNode => typeof child === 'object' && child.tag === 'caption' && !hidden(child));
  const rendered = [line(header), line(Array<string>(width).fill('---')), ...content.map(line)].join('\n');
  return caption ? overviewMarkdown(caption, sourceUrl) + '\n\n' + rendered : rendered;
}

function listMarkdown(list: HtmlNode, sourceUrl: string): string {
  const items: HtmlNode[] = [], pending = [...list.children].reverse();
  while (pending.length) {
    const node = pending.pop()!;
    if (typeof node === 'string' || hidden(node)) continue;
    if (node.tag === 'li') { items.push(node); continue; }
    if (node.tag === 'ul' || node.tag === 'ol') continue;
    pending.push(...[...node.children].reverse());
  }
  const ordered = list.tag === 'ol', reversed = ordered && list.attrs.reversed !== undefined;
  let next = integer(list.attrs.start) ?? (reversed ? items.length : 1);
  return items.map(item => {
    const value = integer(item.attrs.value) ?? next;
    const marker = ordered ? value + '. ' : '- ';
    if (ordered) next = value + (reversed ? -1 : 1);
    const body = overviewMarkdown({tag:'div',attrs:{},children:item.children}, sourceUrl);
    const continuation = ' '.repeat(marker.length);
    return marker + body.split('\n').map((line,index) => index && line ? continuation + line : line).join('\n');
  }).join('\n\n');
}

interface Frame { node: HtmlNode | string; close?: string; inline?: boolean }

export function overviewMarkdown(root: HtmlNode, sourceUrl: string): string {
  const output: Array<string | { literal: string }> = [], stack: Frame[] = [{ node: root }];
  while (stack.length) {
    const frame = stack.pop()!;
    if (frame.close !== undefined) { output.push(frame.close); continue; }
    if (typeof frame.node === 'string') { output.push(escapeText(frame.node)); continue; }
    const node = frame.node;
    if (hidden(node)) continue;
    if (node.tag === 'pre') { output.push('\n\n', { literal: codeBlock(node) }, '\n\n'); continue; }
    if (node.tag === 'code') { output.push({ literal: codeSpan(contentText(node)) }); continue; }
    if (node.tag === 'blockquote') { const quote = overviewMarkdown({tag:'div',attrs:{},children:node.children}, sourceUrl); output.push('\n\n', {literal:quote.split('\n').map(line => '> ' + line).join('\n')}, '\n\n'); continue; }
    if (node.tag === 'ul' || node.tag === 'ol') { output.push('\n\n', {literal:listMarkdown(node, sourceUrl)}, '\n\n'); continue; }
    if (node.tag === 'table') { output.push('\n\n', { literal: tableMarkdown(node, sourceUrl) }, '\n\n'); continue; }
    if (node.tag === 'img') {
      const url = safeUrl(node.attrs.src, sourceUrl), alt = escapeText(node.attrs.alt ?? '');
      output.push(url ? '![' + alt + '](' + url + ')' : alt);
      continue;
    }
    let before = '', after = '';
    const inline = frame.inline || /^(?:a|strong|b|em|i)$/.test(node.tag);
    const heading = /^h([1-6])$/.exec(node.tag)?.[1] ?? (node.attrs.role === 'heading' ? node.attrs['aria-level'] : undefined);
    if (heading && /^[1-6]$/.test(heading)) { before = '\n\n' + '#'.repeat(Number(heading)) + ' '; after = '\n\n'; }
    else if (node.tag === 'br') before = '\n';
    else if (node.tag === 'strong' || node.tag === 'b') before = after = '**';
    else if (node.tag === 'em' || node.tag === 'i') before = after = '*';
    else if (node.tag === 'li') { before = '\n- '; after = '\n';
    } else if (node.tag === 'p' || node.tag === 'div' || node.tag === 'section' || node.tag === 'figure' || node.tag === 'figcaption') before = after = frame.inline ? '' : '\n\n';
    else if (node.tag === 'a') {
      const url = safeUrl(node.attrs.href, sourceUrl);
      if (url) { before = '['; after = '](' + url + ')'; }
    }
    output.push(before);
    stack.push({ node: '', close: after, inline });
    for (let index = node.children.length - 1; index >= 0; index--) stack.push({ node: node.children[index]!, inline });
  }
  const clean = (value: string) => value.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+(?=[^ \t-\d])/g, '\n').replace(/\n{3,}/g, '\n\n');
  let result = '', regular = '';
  for (const part of output) {
    if (typeof part === 'string') regular += part;
    else { result += clean(regular) + part.literal; regular = ''; }
  }
  return (result + clean(regular)).trim();
}
