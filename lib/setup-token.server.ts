import { randomBytes } from "crypto";
import { getDb } from "@/lib/db/server";
import { settings } from "@/lib/db/schema/server/settings";

let _token: string | null = null;

export function initSetupToken(): void {
  const existing = getDb().select().from(settings).get();
  if (existing?.password_verifier) return;

  // SETUP_TOKEN env var lets CI/provisioning scripts supply a known token
  // instead of reading a random one from the logs.
  if (process.env.SETUP_TOKEN) {
    _token = process.env.SETUP_TOKEN;
    return;
  }

  _token = randomBytes(16).toString("hex");
  process.stdout.write(
    `\n[gleaned] ═══════════════════════════════════════════\n` +
    `[gleaned]  First-run setup token: ${_token}\n` +
    `[gleaned]  Enter this token in the setup form.\n` +
    `[gleaned] ═══════════════════════════════════════════\n\n`,
  );
}

export function getSetupToken(): string | null {
  return _token;
}

export function consumeSetupToken(): void {
  _token = null;
}
