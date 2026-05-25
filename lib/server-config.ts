export interface ServerConfig {
  syncUrl?: string;
  syncUsername?: string;
}

let _cache: ServerConfig | null | undefined;

export async function fetchServerConfig(): Promise<ServerConfig | null> {
  if (_cache !== undefined) return _cache;
  try {
    const res = await fetch("/config.json", { signal: AbortSignal.timeout(2000) });
    if (!res.ok) { _cache = null; return null; }
    const json = await res.json() as Record<string, unknown>;
    if (typeof json.syncUsername !== "string" && typeof json.syncUrl !== "string") {
      _cache = null;
      return null;
    }
    _cache = {
      syncUrl: typeof json.syncUrl === "string" ? json.syncUrl : undefined,
      syncUsername: typeof json.syncUsername === "string" ? json.syncUsername : undefined,
    };
    return _cache;
  } catch {
    _cache = null;
    return null;
  }
}
