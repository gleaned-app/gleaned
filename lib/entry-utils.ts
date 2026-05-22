export interface ParsedSource {
  href?: string;   // set when source can be linked (URL, DOI)
  label: string;   // display text shown to the user
  kind: "url" | "doi" | "isbn" | "text";
}

/**
 * Detects the format of a free-text source field and returns display metadata.
 * Handles: HTTP(S) URLs, bare DOIs (10.xxxx/...), doi:-prefixed DOIs,
 * ISBN-10, ISBN-13. Everything else is returned as plain text.
 */
export function parseSource(raw: string): ParsedSource {
  const s = raw.trim();
  if (!s) return { label: "", kind: "text" };

  // DOI — bare (10.xxxx/...), doi:-prefixed, or https://doi.org/-prefixed.
  // Checked before the generic URL branch so doi.org links are classified as DOI.
  const doiBody = s
    .replace(/^https?:\/\/doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
  if (/^10\.\d{4,}\/.+/.test(doiBody)) {
    return {
      href: `https://doi.org/${doiBody}`,
      label: `DOI ${doiBody.split("/")[0]}`,
      kind: "doi",
    };
  }

  // HTTP(S) URL (after DOI check so doi.org links are not caught here)
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      const label = url.hostname.replace(/^www\./, "");
      return { href: s, label, kind: "url" };
    } catch {
      return { label: s, kind: "text" };
    }
  }

  // ISBN — strip hyphens and spaces, then validate length + checksum shape
  const digits = s.replace(/[-\s]/g, "");
  if (/^\d{9}[\dX]$/i.test(digits) || /^\d{13}$/.test(digits)) {
    return { label: `ISBN ${s}`, kind: "isbn" };
  }

  return { label: s, kind: "text" };
}
