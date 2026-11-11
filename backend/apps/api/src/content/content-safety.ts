import { BadRequestException } from '@nestjs/common';

/**
 * Server-side safety check for authored content (article bodies, summaries, titles and every
 * string inside structured sections). Content is Markdown that clients render without raw
 * HTML; this check refuses it at write time so nothing unsafe is ever stored or published,
 * whatever a future client does.
 *
 * Refused:
 * - raw HTML: any tag, comment, CDATA or processing instruction (`<b>`, `</p>`, `<!-- -->`,
 *   `<?x?>`), and numeric character references, which can spell markup or schemes
 *   (`&#106;avascript:`). Markdown autolinks to https (`<https://example.org>`) are allowed.
 * - link targets (inline, image or reference-style) other than https:// URLs or site-relative
 *   paths (`/weeks/12`, `#section`). `javascript:`, `data:`, `vbscript:`, `file:`, `http:`
 *   and protocol-relative `//host` are refused, including obfuscated forms (mixed case,
 *   embedded whitespace or control characters).
 */
const HTML = /<(?:[a-z][\w:-]*|\/[a-z][\w:-]*|!|\?)/i;
const HTTPS_AUTOLINK = /<https:\/\/[^\s<>]+>/gi;
const NUMERIC_REF = /&#x?[0-9a-f]+;?/i;
/** Inline and image links: ](target "title"). Reference definitions: [label]: target */
const INLINE_TARGET = /\]\(\s*<?([^)\s>]*)/g;
const REFERENCE_TARGET = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm;
const DANGEROUS_SCHEME = /^(?:javascript|data|vbscript|file|blob|http):/i;

function normalise(target: string): string {
  // Strip characters browsers ignore inside URLs before checking the scheme.
  // eslint-disable-next-line no-control-regex
  return target.replace(/[\s\u0000-\u001f\u007f]+/g, '');
}

function safeTarget(raw: string): boolean {
  const target = normalise(raw);
  if (target === '') return true;
  if (target.startsWith('//')) return false;
  if (target.startsWith('/') || target.startsWith('#')) return true;
  if (DANGEROUS_SCHEME.test(target)) return false;
  return /^https:\/\/[^\s]+$/i.test(target);
}

/** The first problem with this text, or null when it is safe. */
export function unsafeContentReason(text: string): string | null {
  const withoutAutolinks = text.replace(HTTPS_AUTOLINK, '');
  if (HTML.test(withoutAutolinks)) return 'must not contain HTML';
  if (NUMERIC_REF.test(text))
    return 'must not contain numeric character references';
  for (const re of [INLINE_TARGET, REFERENCE_TARGET]) {
    for (const m of text.matchAll(re)) {
      if (!safeTarget(m[1])) return 'links must be https:// or site-relative';
    }
  }
  return null;
}

/** Every string inside a value, with its dotted path (for validation details). */
function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) yield* strings(v, `${path}.${i}`);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value))
      yield* strings(v, path ? `${path}.${k}` : k);
  }
}

/** Throws 400 with per-field details when any string in `fields` is unsafe. */
export function assertSafeContent(fields: Record<string, unknown>): void {
  const problems: string[] = [];
  for (const [path, text] of strings(fields, '')) {
    const reason = unsafeContentReason(text);
    if (reason) problems.push(`${path} ${reason}`);
  }
  if (problems.length > 0) throw new BadRequestException(problems);
}
