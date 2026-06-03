export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/app/api/_auth";
import { readJsonWithLimit, SMALL_BODY_LIMIT } from "@/app/api/_body";
import { getDb } from "@/lib/db/server";
import { settings } from "@/lib/db/schema/server/settings";

// Maps DB row to the client-facing shape.
// password_verifier, encryption_salt, and encryption_iterations never leave the server.
function toClient(row: typeof settings.$inferSelect) {
  return {
    language: row.language,
    weekStart: row.week_start,
    theme: row.theme,
    bodyFont: row.body_font,
    defaultView: row.default_view,
    autoLockAfter: row.auto_lock_after_minutes,
    customEntryTypes: JSON.parse(row.custom_entry_types) as string[],
    contextSources: JSON.parse(row.context_sources) as string[],
  };
}

type ClientSettings = ReturnType<typeof toClient>;

const VALID_LANGUAGES  = new Set(["de", "en"]);
const VALID_THEMES     = new Set(["system", "light", "dark", "sepia"]);
const VALID_FONTS      = new Set(["sans", "serif", "playfair", "handwriting"]);
const VALID_VIEWS      = new Set(["journal", "calendar", "threads", "review"]);
const VALID_WEEK_START = new Set(["monday", "sunday"]);
const VALID_AUTO_LOCK  = new Set([0, 5, 15, 30]);
const MAX_LIST_ITEMS   = 20;
const MAX_ITEM_LEN     = 100;

function validateSettingsUpdate(data: Partial<ClientSettings>): string | null {
  if (data.language    !== undefined && !VALID_LANGUAGES.has(data.language))   return "Invalid language";
  if (data.theme       !== undefined && !VALID_THEMES.has(data.theme))         return "Invalid theme";
  if (data.bodyFont    !== undefined && !VALID_FONTS.has(data.bodyFont))       return "Invalid bodyFont";
  if (data.defaultView !== undefined && !VALID_VIEWS.has(data.defaultView))    return "Invalid defaultView";
  if (data.weekStart   !== undefined && !VALID_WEEK_START.has(data.weekStart)) return "Invalid weekStart";
  if (data.autoLockAfter !== undefined && !VALID_AUTO_LOCK.has(data.autoLockAfter)) return "Invalid autoLockAfter";
  for (const field of ["customEntryTypes", "contextSources"] as const) {
    const list = data[field];
    if (list === undefined) continue;
    if (!Array.isArray(list))              return `Invalid ${field}`;
    if (list.length > MAX_LIST_ITEMS)      return `Too many ${field}`;
    if (list.some(s => typeof s !== "string" || s.length > MAX_ITEM_LEN)) return `Invalid ${field} item`;
  }
  return null;
}

// Maps a partial client update to DB columns.
function toDb(data: Partial<ClientSettings>): Partial<typeof settings.$inferInsert> {
  const result: Partial<typeof settings.$inferInsert> = {};
  if (data.language !== undefined) result.language = data.language as string;
  if (data.weekStart !== undefined) result.week_start = data.weekStart;
  if (data.theme !== undefined) result.theme = data.theme;
  if (data.bodyFont !== undefined) result.body_font = data.bodyFont;
  if (data.defaultView !== undefined) result.default_view = data.defaultView;
  if (data.autoLockAfter !== undefined) result.auto_lock_after_minutes = data.autoLockAfter;
  if (data.customEntryTypes !== undefined) result.custom_entry_types = JSON.stringify(data.customEntryTypes);
  if (data.contextSources !== undefined) result.context_sources = JSON.stringify(data.contextSources);
  return result;
}

export function GET(request: NextRequest): NextResponse {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const row = getDb().select().from(settings).get();
  if (!row) return NextResponse.json({}, { status: 200 });
  return NextResponse.json(toClient(row));
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await readJsonWithLimit(request, SMALL_BODY_LIMIT);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const validationError = validateSettingsUpdate(body as Partial<ClientSettings>);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 422 });

  const db = getDb();
  const updates = toDb(body as Partial<ClientSettings>);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  db.insert(settings)
    .values({ id: "gleaned_settings", ...updates })
    .onConflictDoUpdate({ target: settings.id, set: updates })
    .run();

  const row = db.select().from(settings).get()!;
  return NextResponse.json(toClient(row));
}
