/**
 * Where a `?next=` value may send someone: a path on THIS site, never another one.
 *
 * `startsWith('/') && !startsWith('//')` alone is not enough. Browsers read `\` as `/`,
 * so `/\evil.com` becomes `//evil.com` → https://evil.com/. URL parsers also strip tab
 * and newline, which can turn `/\t/evil.com` into the same thing. Anything like that
 * falls back to `/` (which sends the person on to their workspace).
 *
 * The one place every redirect-after-auth check goes through — do not re-implement it.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return '/'
  if (!next.startsWith('/') || next.startsWith('//')) return '/'
  if (/[\\\x00-\x1f\x7f]/.test(next)) return '/'
  return next
}
