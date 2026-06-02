import { marked } from "marked";
import DOMPurify from "dompurify";

// Escapes characters that are unsafe in HTML attribute values.
// Applied to href and title before embedding them in template strings.
export function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Allowlist of URI schemes safe to use in href attributes.
// Relative URLs (/, ./, ../, #) are always allowed.
// Anything else — including javascript:, data:, vbscript: — becomes "#".
const SAFE_HREF_RE = /^(?:https?|mailto|tel):/i;

export function sanitizeHref(href: string): string {
  if (!href) return "#";
  const trimmed = href.trim();
  if (!trimmed) return "#";
  if (/^[./#]/.test(trimmed)) return href;
  return SAFE_HREF_RE.test(trimmed) ? href : "#";
}

marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    // Strip raw HTML blocks entirely — never pass through user-supplied HTML.
    html: () => "",

    link({ href, title, text }: { href: string; title?: string | null; text: string }): string {
      // sanitizeHref blocks dangerous schemes; escapeAttr prevents attribute injection.
      // text is rendered HTML produced by marked's own inline renderer — left as-is,
      // with DOMPurify as the final sanitization layer.
      const safe = escapeAttr(sanitizeHref(href));
      const t = title ? ` title="${escapeAttr(title)}"` : "";
      return `<a href="${safe}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

// Renders markdown to sanitized HTML. Must only be called in browser context
// (DOMPurify requires a DOM). All "use client" components qualify.
export function renderMarkdown(content: string): string {
  if (!content) return "";
  const raw = marked.parse(content) as string;
  return DOMPurify.sanitize(raw, { ADD_ATTR: ["target"] });
}

// Renders notes markdown to sanitized HTML.
// Checkboxes have `disabled` removed so click handlers can toggle them.
export function renderNotesMarkdown(content: string): string {
  if (!content) return "";
  const html = marked.parse(content, { async: false }) as string;
  // marked outputs <input disabled="" type="checkbox"> — strip disabled before sanitizing.
  const stripped = html.replace(/(<input\b[^>]*?)\s+disabled=""/g, "$1");
  return DOMPurify.sanitize(stripped, { ADD_ATTR: ["target"] });
}
