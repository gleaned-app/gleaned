import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/server", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db/server";
import { createTestDb } from "../../app/api/_test-db";
import { auditLog } from "@/lib/db/schema/server/audit_log";
import { writeAudit } from "./audit";

const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  mockGetDb.mockReturnValue(createTestDb() as ReturnType<typeof getDb>);
});

describe("writeAudit", () => {
  it("inserts a row with the correct action and detail", () => {
    writeAudit("test.event", { foo: "bar" });
    const rows = getDb().select().from(auditLog).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("test.event");
    expect(JSON.parse(rows[0].detail)).toEqual({ foo: "bar" });
  });

  it("sets ts to a valid ISO timestamp", () => {
    const before = new Date().toISOString();
    writeAudit("test.event", {});
    const after = new Date().toISOString();
    const rows = getDb().select().from(auditLog).all();
    expect(rows[0].ts >= before).toBe(true);
    expect(rows[0].ts <= after).toBe(true);
  });

  it("writes multiple rows independently", () => {
    writeAudit("event.one", { n: 1 });
    writeAudit("event.two", { n: 2 });
    const rows = getDb().select().from(auditLog).all();
    expect(rows).toHaveLength(2);
    expect(rows[0].action).toBe("event.one");
    expect(rows[1].action).toBe("event.two");
  });

  it("does not throw when the DB write fails", () => {
    mockGetDb.mockReturnValueOnce({
      insert: () => { throw new Error("DB exploded"); },
    } as unknown as ReturnType<typeof getDb>);
    expect(() => writeAudit("failing.event", {})).not.toThrow();
  });
});
