/**
 * Rewrites <img> src attributes in HTML using a filename-to-URL map.
 * Only targets <img> tags — leaves other elements with src attributes untouched.
 */
export function rewriteImageSrcs(
  html: string,
  urlMap: Record<string, string>
): string {
  return html.replace(
    /<img(\s[^>]*)src=["']([^"']+)["']/gi,
    (match, before: string, filename: string) => {
      const url = urlMap[filename];
      return url ? `<img${before}src="${url}"` : match;
    }
  );
}
