import { getDB } from "./client";
import type { AnyDoc } from "./client";
import { loadKey, encryptText, decryptText, encryptBytes } from "../crypto";
import { encryptEntry, decryptEntry } from "./entry-crypto";
import type { EncPayload, AttachmentMeta, PouchAttachments } from "./entry-crypto";
import { encryptTodo } from "./todo-crypto";
import { getSettings, saveSettings } from "./settings";
import { invalidateSearchCache } from "./entries";
import type { Entry } from "@/types/entry";
import type { Todo } from "@/types/todo";

// One-shot migration: base64-in-enc → PouchDB native attachments.
// Runs fire-and-forget after every login but exits immediately once the settings
// flag is set, so the only cost after first run is one getSettings() call.
export async function migrateAttachmentsToNative(): Promise<void> {
  const settings = await getSettings();
  if (settings?.migratedAttachmentsV2) return;

  const key = await loadKey();
  if (!key) return;
  const db = await getDB();

  const result = await db.find({ selector: { type: "entry" } });
  for (const raw of result.docs as Entry[]) {
    if (!raw.encrypted || !raw.enc) continue;

    let payload: EncPayload;
    try {
      payload = JSON.parse(await decryptText(key, raw.enc)) as EncPayload;
    } catch { continue; }

    // An attachment in the old format has a `data` field in the enc payload.
    const legacyAtts = (payload.attachments ?? []).filter(
      (a) => typeof (a as unknown as { data?: string }).data === "string",
    );
    if (legacyAtts.length === 0) continue;

    const newMeta: AttachmentMeta[] = [];
    const pouchAtts: PouchAttachments = {};

    for (const att of payload.attachments ?? []) {
      const legacyData = (att as unknown as { data?: string }).data;
      if (legacyData) {
        const id = (att as unknown as { id?: string }).id ?? Math.random().toString(36).slice(2, 10);
        const comma = legacyData.indexOf(",");
        const rawBase64 = comma !== -1 ? legacyData.slice(comma + 1) : legacyData;
        const bytes = Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0));
        pouchAtts[id] = {
          content_type: "application/octet-stream",
          data: await encryptBytes(key, bytes.buffer as ArrayBuffer),
        };
        newMeta.push({ id, name: att.name, mimeType: att.mimeType, size: att.size });
      } else {
        const { id: existingId, name, mimeType, size } = att as AttachmentMeta;
        newMeta.push({ id: existingId, name, mimeType, size });
      }
    }

    const newPayload: EncPayload = { ...payload, attachments: newMeta.length ? newMeta : undefined };
    const newEnc = await encryptText(key, JSON.stringify(newPayload));

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const latest = (await db.get(raw._id)) as unknown as Entry & {
          _rev?: string;
          _attachments?: Record<string, unknown>;
        };
        await db.put({
          ...latest,
          enc: newEnc,
          _attachments: { ...(latest._attachments ?? {}), ...pouchAtts },
        } as unknown as AnyDoc);
        break;
      } catch (err) {
        if ((err as { status?: number }).status !== 409) break;
      }
    }
  }

  invalidateSearchCache();
  await saveSettings({ migratedAttachmentsV2: true });
}
