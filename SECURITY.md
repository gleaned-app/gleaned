# Security Policy

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report them privately by emailing **gleaned.security@proton.me** with the subject line `[gleaned] Security`.

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof of concept
- Any suggested fix, if you have one

You will receive a response within 7 days. Once the issue is confirmed and fixed, it will be disclosed publicly in the changelog.

## Scope

The following are in scope:

- Vulnerabilities in the encryption implementation (`lib/crypto.ts`) — key derivation, AES-GCM usage, key storage
- Authentication bypass (lock screen, session handling in `lib/auth.ts`, server-side session validation in `app/api/_auth.ts`)
- Data leakage — entry content reaching the server or network in plaintext
- XSS in entry rendering (Markdown via `marked` + `highlight.js` + DOMPurify)
- SQL injection in API routes

The following are **out of scope**:

- Issues that require physical access to an unlocked device
- The security of the user's own server or Docker deployment
- Browser or OS vulnerabilities not specific to gleaned

## Encryption model

gleaned uses PBKDF2-HMAC-SHA-256 (600,000 iterations, 256-bit random salt) to derive an AES-GCM-256 key from the user's password. All entry content, tags, and attachments are encrypted in the browser before being sent to the server. The server stores only ciphertext and never receives the plaintext or the key.

The derived key is held only in the JavaScript module cache for the lifetime of the page — it is never written to `sessionStorage`, `localStorage`, or any other persistent store. A page reload requires re-authentication; this is intentional.

The login verification token stored in the server database is an AES-GCM ciphertext of a known plaintext, encrypted under the derived key. Successful decryption proves knowledge of the password without storing anything reversible.

### Metadata trade-off

The following fields are stored in plaintext in SQLite to allow server-side scheduling and filtering:

| Field | Why unencrypted |
|---|---|
| `date`, `created_at` | Required for calendar view and entry ordering |
| `next_review`, `review_interval` | Scheduling without full table scan |

Someone with access to the SQLite file can see *when* entries were made and when they are due for review — without knowing your password. The actual content, tags, and all personal fields remain encrypted.

### Brute-force protection

Server-side: Argon2id is used to verify the password hash, making each verification attempt slow.

Client-side: each failed login attempt increases the lockout delay exponentially (1 s, 2 s, 4 s … up to 30 s cap), persisted across page reloads.
