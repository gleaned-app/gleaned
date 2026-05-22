# Security Policy

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report them privately by emailing **bruno.deanoz1@gmail.com** with the subject line `[gleaned] Security`.

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof of concept
- Any suggested fix, if you have one

You will receive a response within 7 days. Once the issue is confirmed and fixed, it will be disclosed publicly in the changelog.

## Scope

The following are in scope:

- Vulnerabilities in the encryption implementation (`lib/crypto.ts`) — key derivation, AES-GCM usage, key storage
- Authentication bypass (lock screen, session handling in `lib/auth.ts`)
- Data leakage — entry content reaching IndexedDB or network in plaintext
- XSS in entry rendering (Markdown via `marked` + `highlight.js`)
- CouchDB sync security issues (credential exposure, unauthorized access)

The following are **out of scope**:

- Issues that require physical access to an unlocked device
- The security of the user's own CouchDB deployment
- Browser or OS vulnerabilities not specific to gleaned

## Encryption model

gleaned uses PBKDF2 (600,000 iterations, SHA-256) to derive an AES-GCM-256 key from the user's password. Entry content, tags, and the CouchDB sync password are encrypted before being written to IndexedDB. The derived key is held only in the JavaScript module cache for the lifetime of the page — it is never written to `sessionStorage`, `localStorage`, or any other persistent store. A page reload requires re-authentication; this is intentional.

The login verification token stored in the database is an AES-GCM ciphertext of a known plaintext, encrypted under the derived key. Successful decryption proves knowledge of the password without storing anything reversible.

Brute-force protection is applied on the lock screen: each failed login attempt increases the lockout delay exponentially (1 s, 2 s, 4 s … up to 30 s).
