import { and, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/server";
import { entries } from "@/lib/db/schema/shared/entries";
import { threads } from "@/lib/db/schema/shared/threads";
import { broadcast } from "./send";

function localDateStr(): string {
  const tz = process.env.PUSH_TZ ?? "UTC";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

const MSG = {
  de: {
    dailyTitle: "gleaned",
    dailyBody:  "Was hast du heute gelernt?",
    dueTitle:   "gleaned · Lernziele",
    dueToday1:  (n: number) => `${n} Lernziel heute fällig`,
    dueTodayN:  (n: number) => `${n} Lernziele heute fällig`,
    overdue1:   (n: number) => `${n} Lernziel überfällig`,
    mixed:      (today: number, over: number) =>
      [today && `${today} heute fällig`, over && `${over} überfällig`].filter(Boolean).join(", "),
  },
  en: {
    dailyTitle: "gleaned",
    dailyBody:  "What did you learn today?",
    dueTitle:   "gleaned · Learning goals",
    dueToday1:  (n: number) => `${n} learning goal due today`,
    dueTodayN:  (n: number) => `${n} learning goals due today`,
    overdue1:   (n: number) => `${n} learning goal overdue`,
    mixed:      (today: number, over: number) =>
      [today && `${today} due today`, over && `${over} overdue`].filter(Boolean).join(", "),
  },
} as const;

export async function sendDailyReminder(): Promise<void> {
  const today = localDateStr();
  const db    = getDb();

  const [{ count }] = db
    .select({ count: sql<number>`count(*)` })
    .from(entries)
    .where(eq(entries.date, today))
    .all();

  if (count > 0) {
    console.log(`[push] daily reminder skipped — ${count} entries written today`);
    return;
  }

  console.log("[push] sending daily reminder...");
  const result = await broadcast((lang) => {
    const m = lang === "en" ? MSG.en : MSG.de;
    return { title: m.dailyTitle, body: m.dailyBody, url: "/" };
  });
  console.log(`[push] daily reminder: ${result.sent} sent, ${result.failed} failed`);
}

export async function sendDueReminders(): Promise<void> {
  const today   = localDateStr();
  const db      = getDb();

  const due = db
    .select({ due_date: threads.due_date })
    .from(threads)
    .where(and(eq(threads.done, 0), lte(threads.due_date, today)))
    .all();

  if (!due.length) return;

  const overdue  = due.filter((r) => r.due_date != null && r.due_date < today).length;
  const dueToday = due.filter((r) => r.due_date === today).length;

  console.log(`[push] due reminder: ${dueToday} today, ${overdue} overdue`);
  const result = await broadcast((lang) => {
    const m = lang === "en" ? MSG.en : MSG.de;
    const body = m.mixed(dueToday, overdue);
    return { title: m.dueTitle, body, url: "/" };
  });
  console.log(`[push] due reminder: ${result.sent} sent, ${result.failed} failed`);
}
