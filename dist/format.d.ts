/**
 * Response formatting with a context budget.
 *
 * Tools answer in compact markdown rather than pretty-printed JSON: the same facts cost
 * roughly a third of the tokens, and agents read tables well. Every response is capped, and
 * when something is cut the reader is told exactly which tool returns the rest — a
 * truncated answer must never look complete.
 */
/** Default cap per tool response, in characters (~1 token per 3-4 chars). */
export declare const DEFAULT_BUDGET = 6000;
/** Cap for the deliberately small responses: search hits and guidance. */
export declare const SMALL_BUDGET = 2500;
export type Detail = 'compact' | 'full';
/** Escape the characters that would break a markdown table cell. */
export declare function cell(value: string | undefined): string;
export declare function table(headers: string[], rows: (string | undefined)[][]): string;
export declare function section(title: string, body: string | undefined): string;
export declare function codeBlock(code: string, language?: string): string;
/** Join parts, dropping empties, with blank lines between them. */
export declare function join(...parts: (string | undefined)[]): string;
/**
 * Enforce the budget on a whole response. Cuts at a line boundary so a table never ends
 * mid-row, and appends a pointer to the tool that returns what was dropped.
 */
export declare function withinBudget(text: string, budget: number, moreHint: string): string;
/**
 * Trim a list to `limit` and say how many were withheld, so the agent knows the set is
 * larger rather than assuming it saw everything.
 */
export declare function limited<T>(items: T[], limit: number): {
    items: T[];
    omitted: number;
};
//# sourceMappingURL=format.d.ts.map