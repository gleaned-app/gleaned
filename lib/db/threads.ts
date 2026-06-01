import type { Thread } from "@/types/thread";
import { requireAuth } from "./client";
import { encryptThreadToApi, decryptThreadFromRow, type ThreadApiRow } from "./thread-crypto";
import { apiFetch } from "../api-client";

export async function saveThread(text: string, dueDate?: string, color?: string): Promise<Thread> {
  requireAuth();
  const now = new Date();
  const thread: Omit<Thread, "_rev" | "encrypted" | "textEnc"> = {
    _id: crypto.randomUUID(),
    type: "thread",
    text,
    done: false,
    createdAt: now.toISOString(),
    ...(dueDate ? { dueDate } : {}),
    ...(color  ? { color  } : {}),
  };
  const body = await encryptThreadToApi(thread);
  await apiFetch("/api/threads", { method: "POST", body: JSON.stringify(body) });
  return { ...thread };
}

export async function getThreads(): Promise<Thread[]> {
  requireAuth();
  const res = await apiFetch("/api/threads");
  const rows = await res.json() as ThreadApiRow[];
  return Promise.all(rows.map(decryptThreadFromRow));
}

export async function updateThreadDoc(thread: Thread): Promise<Thread> {
  requireAuth();
  const updated = { ...thread, done: !thread.done };
  const body = await encryptThreadToApi(updated as Omit<Thread, "_rev" | "encrypted" | "textEnc">);
  await apiFetch(`/api/threads/${thread._id}`, { method: "PUT", body: JSON.stringify(body) });
  return updated;
}

export async function updateThreadDueDate(thread: Thread, dueDate: string | undefined): Promise<Thread> {
  requireAuth();
  const updated = { ...thread };
  if (dueDate) updated.dueDate = dueDate;
  else delete updated.dueDate;
  const body = await encryptThreadToApi(updated as Omit<Thread, "_rev" | "encrypted" | "textEnc">);
  await apiFetch(`/api/threads/${thread._id}`, { method: "PUT", body: JSON.stringify(body) });
  return updated;
}

export async function updateThreadColor(thread: Thread, color: string | undefined): Promise<Thread> {
  requireAuth();
  const updated = { ...thread };
  if (color) updated.color = color;
  else delete updated.color;
  const body = await encryptThreadToApi(updated as Omit<Thread, "_rev" | "encrypted" | "textEnc">);
  await apiFetch(`/api/threads/${thread._id}`, { method: "PUT", body: JSON.stringify(body) });
  return updated;
}

export async function updateThreadText(thread: Thread, text: string): Promise<Thread> {
  requireAuth();
  const updated = { ...thread, text };
  const body = await encryptThreadToApi(updated as Omit<Thread, "_rev" | "encrypted" | "textEnc">);
  await apiFetch(`/api/threads/${thread._id}`, { method: "PUT", body: JSON.stringify(body) });
  return updated;
}

export async function updateThreadNotes(thread: Thread, notes: string | undefined): Promise<Thread> {
  requireAuth();
  const updated = { ...thread };
  if (notes) updated.notes = notes;
  else delete updated.notes;
  const body = await encryptThreadToApi(updated as Omit<Thread, "_rev" | "encrypted" | "textEnc">);
  await apiFetch(`/api/threads/${thread._id}`, { method: "PUT", body: JSON.stringify(body) });
  return updated;
}

export async function deleteThread(id: string): Promise<void> {
  requireAuth();
  await apiFetch(`/api/threads/${id}`, { method: "DELETE" });
}

// No-op: encryption migration is handled at import time in Phase 5.
export async function migrateThreadsEncryption(): Promise<void> {}
