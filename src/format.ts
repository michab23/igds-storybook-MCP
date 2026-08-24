/**
 * Response formatting with a context budget.
 *
 * Tools answer in compact markdown rather than pretty-printed JSON: the same facts cost
 * roughly a third of the tokens, and agents read tables well. Every response is capped, and
 * when something is cut the reader is told exactly which tool returns the rest — a
 * truncated answer must never look complete.
 */

/** Default cap per tool response, in characters (~1 token per 3-4 chars). */
export const DEFAULT_BUDGET = 6000;

/** Cap for the deliberately small responses: search hits and guidance. */
export const SMALL_BUDGET = 2500;

export type Detail = 'compact' | 'full';

/** Escape the characters that would break a markdown table cell. */
export function cell(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

export function table(headers: string[], rows: (string | undefined)[][]): string {
  if (!rows.length) return '';

  const lines = [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ];

  return lines.join('\n');
}

export function section(title: string, body: string | undefined): string {
  if (!body?.trim()) return '';
  return `## ${title}\n${body.trim()}`;
}

export function codeBlock(code: string, language = 'html'): string {
  return `\`\`\`${language}\n${code.trim()}\n\`\`\``;
}

/** Join parts, dropping empties, with blank lines between them. */
export function join(...parts: (string | undefined)[]): string {
  return parts.filter((part) => part?.trim()).join('\n\n');
}

/**
 * Enforce the budget on a whole response. Cuts at a line boundary so a table never ends
 * mid-row, and appends a pointer to the tool that returns what was dropped.
 */
export function withinBudget(text: string, budget: number, moreHint: string): string {
  if (text.length <= budget) return text;

  const cut = text.slice(0, budget);
  const boundary = cut.lastIndexOf('\n');
  const kept = boundary > budget * 0.6 ? cut.slice(0, boundary) : cut;

  return `${kept}\n\n_Truncated to stay within the context budget. ${moreHint}_`;
}

/**
 * Trim a list to `limit` and say how many were withheld, so the agent knows the set is
 * larger rather than assuming it saw everything.
 */
export function limited<T>(items: T[], limit: number): { items: T[]; omitted: number } {
  if (items.length <= limit) return { items, omitted: 0 };
  return { items: items.slice(0, limit), omitted: items.length - limit };
}
