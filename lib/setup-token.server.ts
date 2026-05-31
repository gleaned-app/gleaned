import { randomBytes } from "crypto";
import { getDb } from "@/lib/db/server";
import { settings } from "@/lib/db/schema/server/settings";

// Use globalThis so the token survives across Next.js module evaluation
// contexts (instrumentation.ts uses a dynamic import; API routes use static
// imports — they resolve to different module instances but share globalThis).
const g = globalThis as { _gleaned_setup_token?: string | null };

export function initSetupToken(): void {
  const existing = getDb().select().from(settings).get();
  if (existing?.password_verifier) return;

  // SETUP_TOKEN env var lets CI/provisioning scripts supply a known token
  // instead of reading a random one from the logs.
  if (process.env.SETUP_TOKEN) {
    process.stderr.write(
      `[gleaned] WARNING: SETUP_TOKEN is set via environment variable.\n` +
      `[gleaned]          Only use this in CI/CD pipelines with encrypted secrets —\n` +
      `[gleaned]          never in a production .env file. Remove it after setup.\n`,
    );
    g._gleaned_setup_token = process.env.SETUP_TOKEN;
    return;
  }

  g._gleaned_setup_token = randomBytes(16).toString("hex");
  process.stdout.write(
    `\n[gleaned] ═══════════════════════════════════════════\n` +
    `[gleaned]  First-run setup token: ${g._gleaned_setup_token}\n` +
    `[gleaned]  Enter this token in the setup form.\n` +
    `[gleaned] ═══════════════════════════════════════════\n\n`,
  );
}

export function getSetupToken(): string | null {
  return g._gleaned_setup_token ?? null;
}

export function consumeSetupToken(): void {
  g._gleaned_setup_token = null;
}
