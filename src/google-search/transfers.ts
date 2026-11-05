import { parse } from 'acorn';

interface SyntaxNode {
  type: string;
  [key: string]: unknown;
}

function node(value: unknown): SyntaxNode | undefined {
  return typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string' ? value as SyntaxNode : undefined;
}

function property(value: unknown, object: string, name: string): boolean {
  const member = node(value);
  return member?.type === 'MemberExpression' && member.computed === false && node(member.object)?.type === 'Identifier' && node(member.object)?.name === object && node(member.property)?.name === name;
}

function transfer(statement: unknown): { id: string; html: string; call: SyntaxNode } | undefined {
  const expression = node(statement);
  if (expression?.type !== 'ExpressionStatement') return undefined;
  const call = node(expression.expression);
  if (call?.type !== 'CallExpression' || !Array.isArray(call.arguments) || call.arguments.length !== 2) return undefined;
  const callee = node(call.callee);
  if (callee?.type !== 'MemberExpression' || callee.computed !== false || node(callee.property)?.name !== 'dh' || !property(callee.object, 'window', 'jsl')) return undefined;
  const [id, html] = call.arguments.map(node);
  return id?.type === 'Literal' && typeof id.value === 'string' && html?.type === 'Literal' && typeof html.value === 'string' ? { id: id.value, html: html.value, call } : undefined;
}

export interface HtmlTransferAnalysis {
  transfers: Array<{ id: string; html: string }>;
  blockedIds: string[];
  unknownTarget: boolean;
}

/** Reads unconditional literal transfers and identifies ambiguous writes without executing scripts. */
export function analyzeHtmlTransfers(script: string): HtmlTransferAnalysis {
  const empty = (): HtmlTransferAnalysis => ({ transfers: [], blockedIds: [], unknownTarget: false });
  if (script.length > 2_000_000) return empty();
  let program: unknown;
  try { program = parse(script, { ecmaVersion: 'latest', sourceType: 'script' }); } catch { return empty(); }
  const statements = node(program)?.body;
  if (!Array.isArray(statements)) return empty();
  const found: Array<{ id: string; html: string; call: SyntaxNode }> = [];
  for (const statement of statements) {
    let candidate = transfer(statement);
    const expression = node(node(statement)?.expression);
    const callee = node(expression?.callee);
    const body = node(callee?.body)?.body;
    if (!candidate && expression?.type === 'CallExpression' && Array.isArray(expression.arguments) && expression.arguments.length === 0 && callee?.type === 'FunctionExpression' && callee.async === false && callee.generator === false && Array.isArray(callee.params) && callee.params.length === 0 && Array.isArray(body) && body.length === 1) candidate = transfer(body[0]);
    if (candidate && candidate.id.length <= 200 && candidate.html.length <= 2_000_000) found.push(candidate);
    if (found.length >= 100) break;
    if (node(statement)?.type === 'ThrowStatement') break;
  }
  const accepted = new Set(found.map(candidate => candidate.call));
  const blocked = new Set<string>();
  const stack = [node(program)!];
  while (stack.length) {
    const current = stack.pop()!;
    const callee = node(current.callee);
    if (current.type === 'CallExpression' && callee?.type === 'MemberExpression' && callee.computed === false && node(callee.property)?.name === 'dh' && property(callee.object, 'window', 'jsl') && !accepted.has(current)) {
      const id = Array.isArray(current.arguments) ? node(current.arguments[0]) : undefined;
      if (id?.type !== 'Literal' || typeof id.value !== 'string') return { transfers: [], blockedIds: [...blocked], unknownTarget: true };
      blocked.add(id.value);
    }
    for (const value of Object.values(current)) {
      if (Array.isArray(value)) for (const item of value) { const child = node(item); if (child) stack.push(child); }
      else { const child = node(value); if (child) stack.push(child); }
    }
  }
  return { transfers: found.filter(candidate => !blocked.has(candidate.id)).map(({ id, html }) => ({ id, html })), blockedIds: [...blocked], unknownTarget: false };
}

export function literalHtmlTransfers(script: string): Array<{ id: string; html: string }> {
  return analyzeHtmlTransfers(script).transfers;
}
