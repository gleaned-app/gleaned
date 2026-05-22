"use client";

import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import type { Attachment } from "@/types/entry";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const EXT_LANG: Record<string, string> = {
  js: "javascript", ts: "typescript", jsx: "javascript", tsx: "typescript",
  mjs: "javascript", cjs: "javascript",
  py: "python", rs: "rust", go: "go", php: "php", rb: "ruby",
  java: "java", c: "c", cpp: "cpp", cs: "csharp",
  swift: "swift", kt: "kotlin", dart: "dart",
  html: "html", htm: "html", css: "css", json: "json",
  md: "markdown", sh: "bash", yaml: "yaml", yml: "yaml",
  toml: "toml", sql: "sql", vue: "xml", svelte: "xml",
  r: "r", m: "objectivec",
};

export function fileCategory(a: Attachment): "image" | "audio" | "video" | "pdf" | "code" | "other" {
  if (a.mimeType.startsWith("image/")) return "image";
  if (a.mimeType.startsWith("audio/")) return "audio";
  if (a.mimeType.startsWith("video/")) return "video";
  if (a.mimeType === "application/pdf") return "pdf";
  const ext = a.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext in EXT_LANG) return "code";
  return "other";
}

export function dataUrlToText(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return "";
  try { return atob(dataUrl.slice(comma + 1)); } catch { return ""; }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Components ───────────────────────────────────────────────────────────────

export function CodeBlock({ att }: { att: Attachment }) {
  const [html, setHtml] = useState<string | null>(null);
  const ext = att.name.split(".").pop()?.toLowerCase() ?? "";
  const lang = EXT_LANG[ext];

  useEffect(() => {
    if (!att.data) return;
    const text = dataUrlToText(att.data);
    import("highlight.js").then((mod) => {
      const hljs = mod.default;
      const result =
        lang && hljs.getLanguage(lang)
          ? hljs.highlight(text, { language: lang })
          : hljs.highlightAuto(text);
      setHtml(DOMPurify.sanitize(result.value));
    });
  }, [att.data, lang]);

  return (
    <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}
      >
        <span className="font-sans text-[11px] font-medium" style={{ color: "var(--fg-muted)" }}>
          {att.name}
        </span>
        {att.data && (
          <a
            href={att.data}
            download={att.name}
            className="font-sans text-[10px] transition-opacity hover:opacity-70"
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            Download
          </a>
        )}
      </div>
      <pre
        className="overflow-x-auto p-3 text-xs leading-relaxed"
        style={{ background: "var(--bg)", margin: 0, maxHeight: "280px" }}
      >
        {html !== null ? (
          <code dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code style={{ color: "var(--fg)" }}>{dataUrlToText(att.data ?? "")}</code>
        )}
      </pre>
    </div>
  );
}

export function AttachmentView({ att }: { att: Attachment }) {
  const cat = fileCategory(att);

  if (!att.data) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2"
        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
      >
        <span className="font-sans text-xs" style={{ color: "var(--fg-muted)" }}>{att.name}</span>
        <span className="font-sans text-[10px]" style={{ color: "var(--fg-muted)" }}>{formatSize(att.size)}</span>
      </div>
    );
  }

  if (cat === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={att.data}
        alt={att.name}
        className="w-full rounded-xl object-contain"
        style={{ maxHeight: "300px", border: "1px solid var(--border)" }}
      />
    );
  }

  if (cat === "audio") {
    return (
      <div className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
        <p className="mb-2 font-sans text-[11px]" style={{ color: "var(--fg-muted)" }}>{att.name}</p>
        <audio controls src={att.data} className="w-full" />
      </div>
    );
  }

  if (cat === "video") {
    return (
      <video
        controls
        src={att.data}
        className="w-full rounded-xl"
        style={{ maxHeight: "300px", border: "1px solid var(--border)" }}
      />
    );
  }

  if (cat === "code") return <CodeBlock att={att} />;

  return (
    <a
      href={att.data}
      download={att.name}
      className="flex items-center gap-2 rounded-xl px-3 py-2 transition-opacity hover:opacity-70"
      style={{ background: "var(--bg)", border: "1px solid var(--border)", textDecoration: "none" }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-muted)", flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      </svg>
      <span className="flex-1 truncate font-sans text-xs" style={{ color: "var(--fg)" }}>{att.name}</span>
      <span className="font-sans text-[10px]" style={{ color: "var(--fg-muted)" }}>{formatSize(att.size)}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)", flexShrink: 0 }}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    </a>
  );
}
