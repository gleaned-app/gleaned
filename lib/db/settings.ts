import { getDB } from "./client";
import type { AnyDoc } from "./client";
import { loadKey, encryptText, decryptText } from "../crypto";

export interface Settings {
  _id: "gleaned_settings";
  _rev?: string;
  type: "settings";
  encryptionSalt?: string;
  encryptionVerification?: string;
  encryptionIterations?: number; // PBKDF2 iteration count; absent = 200_000 (pre-v0.2 legacy)
  language?: "de" | "en";
  weekStart?: "monday" | "sunday";
  theme?: "system" | "light" | "dark" | "sepia";
  bodyFont?: "sans" | "serif" | "playfair" | "handwriting";
  couchdbUrl?: string;
  couchdbUsername?: string;
  couchdbPassword?: string;    // never stored — ephemeral, only returned by getSettings
  couchdbPasswordEnc?: string; // AES-GCM ciphertext stored in DB
  defaultView?: "journal" | "calendar" | "threads" | "review";
  migratedAttachmentsV2?: boolean; // set after one-shot native-attachment migration
  customEntryTypes?: string[];     // user-defined types beyond the built-in five
  contextSources?: string[];       // quick-fill source chips (Arbeit, Schule, …)
}

export async function getSettings(): Promise<Settings | null> {
  const db = await getDB();
  try {
    const raw = (await db.get("gleaned_settings")) as unknown as Settings;
    if (raw.couchdbPasswordEnc) {
      const key = await loadKey();
      if (key) {
        try {
          raw.couchdbPassword = await decryptText(key, raw.couchdbPasswordEnc);
        } catch { /* corrupted or wrong key — omit password */ }
      }
    }
    return raw;
  } catch {
    return null;
  }
}

export async function saveSettings(data: Partial<Settings>): Promise<void> {
  const db = await getDB();

  // Encrypt couchdbPassword before storing — never write plaintext to IndexedDB.
  const toStore: Partial<Settings> = { ...data };
  if ("couchdbPassword" in toStore) {
    const key = await loadKey();
    if (key && toStore.couchdbPassword) {
      toStore.couchdbPasswordEnc = await encryptText(key, toStore.couchdbPassword);
    }
    delete toStore.couchdbPassword;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Read the raw doc directly to avoid re-introducing the decrypted plaintext
      // password that getSettings() would surface. Destructure out any legacy
      // plaintext field before merging (one-time migration on next save).
      let rawExisting: Record<string, unknown> | undefined;
      try {
        rawExisting = (await db.get("gleaned_settings")) as unknown as Record<string, unknown>;
      } catch { /* not found — first save */ }

      const { couchdbPassword: _, ...safeExisting } = rawExisting ?? {};

      await db.put({
        _id: "gleaned_settings",
        type: "settings",
        ...safeExisting,
        ...toStore,
      } as unknown as AnyDoc);
      return;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
  throw new Error("gleaned: too many conflicts saving settings");
}
