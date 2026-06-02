import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const webauthnCredentials = sqliteTable("webauthn_credentials", {
  id:           text("id").primaryKey(),           // base64url credential ID
  public_key:   text("public_key").notNull(),       // base64url-encoded public key
  sign_count:   integer("sign_count").notNull().default(0),
  device_name:  text("device_name").notNull().default(""),
  key_blob:     text("key_blob").notNull(),          // AES-GCM(PRF_key, exported AES key JWK)
  created_at:   text("created_at").notNull(),
});

export const webauthnChallenges = sqliteTable("webauthn_challenges", {
  id:         text("id").primaryKey(),              // base64url challenge
  type:       text("type").notNull(),               // "register" | "authenticate"
  expires_at: text("expires_at").notNull(),
});

export type WebAuthnCredentialRow = typeof webauthnCredentials.$inferSelect;
