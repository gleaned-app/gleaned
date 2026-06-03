"server-only";

import { getDb } from "@/lib/db/server";
import { auditLog } from "@/lib/db/schema/server/audit_log";

export function writeAudit(action: string, detail: Record<string, unknown>): void {
  try {
    getDb().insert(auditLog).values({
      ts:     new Date().toISOString(),
      action,
      detail: JSON.stringify(detail),
    }).run();
  } catch {
    // Never let audit failures surface to the caller.
  }
}
