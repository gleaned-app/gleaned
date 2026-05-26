# gleaned — Native App Plan (Draft v1)

> **Status:** First draft — not final. Open questions collected at the end of each section.

---

## 1. Why Native?

The PWA is offline-first, installable, and works on iOS/Android through the browser. There are still real limitations:

- **No access to the native Keystore** — the AES key lives in the JS heap, not in the hardware-backed secure enclave
- **No widget** — no home screen widget for quick entries
- **Limited haptics / animations** — native platforms offer significantly more motion capability
- **Background sync** — PWA background sync is heavily restricted on iOS; native apps can sync reliably in the background
- **Distribution control** — direct APK distribution, no store dependency

The goal is not parity for its own sake. The goal is an app that feels like it was built specifically for each platform.

---

## 2. Platforms

| Platform | Technology | Status |
|---|---|---|
| Android | Kotlin + Jetpack Compose | First target |
| iOS | Swift + SwiftUI | Second target |
| Web (PWA) | Next.js (existing) | Continues to be maintained |

No cross-platform framework (no React Native, no Flutter, no KMP for UI). Each platform gets its own native UI. The shared denominator is the data format and the sync protocol — not the code.

---

## 3. The Critical Foundation: Crypto Compatibility

All three platforms must be able to read and write the same encrypted documents. This is the most technically demanding part and must come before the first feature.

### Current Schema (Web)

```
Password + Salt (32 bytes, random)
  → PBKDF2(SHA-256, 600,000 iterations)
  → AES-256-GCM key

Entry (JSON) → encryptText(key, JSON.stringify(payload))
  → 12-byte IV + ciphertext → Base64 → stored in entry.enc

Salt:         settings.encryptionSalt          (Base64)
Iterations:   settings.encryptionIterations    (number)
Verification: settings.encryptionVerification  ("gleaned-v1" encrypted, used to verify key on login)
```

### Android Implementation

```kotlin
// PBKDF2 — javax.crypto, available natively without external dependency
val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
val spec = PBEKeySpec(password.toCharArray(), salt, 600_000, 256)
val keyBytes = factory.generateSecret(spec).encoded
val key = SecretKeySpec(keyBytes, "AES")

// AES-GCM — javax.crypto
val cipher = Cipher.getInstance("AES/GCM/NoPadding")
val iv = combined.slice(0..11).toByteArray()
val gcmSpec = GCMParameterSpec(128, iv)
cipher.init(Cipher.DECRYPT_MODE, key, gcmSpec)
val plaintext = cipher.doFinal(combined.slice(12..combined.lastIndex).toByteArray())
```

### iOS Implementation

```swift
// PBKDF2 — CommonCrypto (no external framework needed)
var derivedKey = Data(count: 32)
derivedKey.withUnsafeMutableBytes { keyBytes in
    CCKeyDerivationPBKDF(
        CCPBKDFAlgorithm(kCCPBKDF2),
        password, password.utf8.count,
        salt.bytes, salt.count,
        CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
        600_000,
        keyBytes.baseAddress, 32
    )
}

// AES-GCM — CryptoKit (iOS 13+)
let key = SymmetricKey(data: derivedKey)
let sealedBox = try AES.GCM.SealedBox(combined: combined)
let plaintext = try AES.GCM.open(sealedBox, using: key)
```

### Compatibility Matrix

| What | Web | Android | iOS |
|---|---|---|---|
| PBKDF2-SHA256, 600k iter | WebCrypto API | javax.crypto | CommonCrypto |
| AES-256-GCM | WebCrypto API | javax.crypto | CryptoKit |
| Base64 encoding | btoa / custom | android.util.Base64 | Foundation |
| Salt format (32 bytes, Base64) | ✓ | ✓ | ✓ |
| IV format (first 12 bytes of blob) | ✓ | ✓ | ✓ |

> **Open question:** Should a cross-platform crypto test suite be built — a small CLI that encrypts the same plaintext on all three platforms and verifies the output is mutually decryptable? Recommendation: yes, as part of the e2e setup.

---

## 4. Argon2id — Upgrade Path

Argon2id is memory-hard (resistant to GPU brute-force) and the modern recommendation for password-based key derivation. PBKDF2 stays for existing accounts — Argon2id is introduced as an opt-in migration.

### Why Not Immediately?

- **Web**: WebCrypto has no native Argon2id. Requires `argon2-browser` (WASM, ~100 KB gzip). Feasible via dynamic import, but adds a dependency.
- **Android**: `argon2-jvm` or Bouncy Castle — no issue.
- **iOS**: libsodium Swift wrapper or `swift-crypto` extension — feasible.

All three platforms must upgrade simultaneously since the key decrypts all existing data.

### Schema Extension

```ts
// settings doc — new field
encryptionKdf?: "pbkdf2" | "argon2id"  // missing field = pbkdf2 (backwards compatible)

// Argon2id parameters (OWASP recommendation, Profile 2)
// Memory: 64 MB, Iterations: 3, Parallelism: 4
```

### Migration Flow (one-time, on-demand)

```
1. Log in with PBKDF2 (as before) → derive key_old
2. Derive Argon2id key from same password → key_new
3. Decrypt all entry.enc and thread.enc with key_old
4. Re-encrypt with key_new → write back to DB
5. Write settings.encryptionKdf = "argon2id"
6. Re-encrypt settings.encryptionVerification with key_new
```

Steps 3–4 run as a transaction (PouchDB bulk_docs / Room transaction). If interrupted (app kill), the old state is preserved — `encryptionKdf` is only written in step 5.

> **Open question:** Should migration be offered automatically on first launch of a new app version, or only manually via settings?

---

## 5. Database & Sync

### Local Database

**Android:** Room (SQLite)
```kotlin
@Entity data class EntryEntity(
    @PrimaryKey val id: String,
    val type: String,
    val date: String,
    val createdAt: String,
    val enc: String?,           // encrypted JSON blob
    val encrypted: Boolean,
    val rev: String,            // CouchDB _rev
    val entryType: String?,     // unencrypted metadata for scheduling
    val gapStatus: String?,
    val nextReview: Long?,
    val reviewInterval: Int?,
    val synced: Boolean = false // dirty flag for push queue
)
```

**iOS:** SwiftData (iOS 17+)
```swift
@Model class EntryModel {
    var id: String
    var rev: String
    var enc: String?
    var encrypted: Bool
    var date: String
    var createdAt: Date
    var synced: Bool
    // ...
}
```

### CouchDB Sync Engine (custom, ~400 LOC per platform)

No Couchbase Lite (commercial, 5 MB overhead). Own implementation against the CouchDB HTTP API.

**Pull (remote → local):**
```
GET /{db}/_changes?since={lastSeq}&include_docs=true&style=all_docs&limit=100
→ write documents into local DB
→ store lastSeq
```

**Push (local → remote):**
```
Dirty flag: synced=false in local DB
GET /{db}/_bulk_get with local IDs → fetch current _revs
POST /{db}/_bulk_docs with new/changed documents
Conflicts (409): re-fetch _rev, retry (max. 5×)
```

**Authentication:**
```
Authorization: Basic <base64(user:pass)>
No URL credentials (Chrome 130+ blocks those)
Encoding: btoa(unescape(encodeURIComponent(cred))) for non-ASCII
```

**Conflict detection:**
Identical to the web app: `_conflicts` array in CouchDB, conflict resolution UI ported to native.

**Background sync:**
- Android: WorkManager (periodic, e.g. every 15 min when online) + immediately after write
- iOS: BGAppRefreshTask + immediately after write

> **Open question:** Should sync frequency be configurable (e.g. "Wi-Fi only", "manual")? Recommendation: always-on with a Wi-Fi option in v1.

---

## 6. Android — Architecture & Design

### Tech Stack

```
Language        Kotlin 2.x
UI              Jetpack Compose + Material 3
Navigation      Navigation Compose
State           ViewModel + StateFlow + Kotlin Coroutines
DB              Room (+ SQLCipher optional for at-rest encryption)
Sync            Custom CouchDB engine (OkHttp + kotlinx.serialization)
Crypto          javax.crypto (PBKDF2/AES-GCM), argon2-jvm (Phase 5)
DI              Hilt
Network         OkHttp
Build           Gradle + Kotlin DSL
Min SDK         API 26 (Android 8.0) — covers ~95% of active devices
Target SDK      Latest stable
Distribution    Direct APK (sideload) — no Play Store in v1
```

### Design Philosophy: Android

Android offers headroom the PWA does not have.

**Material You / Dynamic Color (Android 12+)**
The app accent color follows the user's wallpaper. The `--accent` concept from the web app becomes `MaterialTheme.colorScheme.primary` — derived dynamically. On older devices: static warm-amber palette (identical to the web app).

**Motion**
- Shared element transition: EntryCard → EntryDetail (Compose Animation APIs)
- Predictive Back (Android 14+): swipe-to-go-back with live preview
- LockScreen: the wheat field canvas motif rebuilt with Compose Canvas + Skia, or as a Lottie animation

**Edge-to-Edge**
`WindowCompat.setDecorFitsSystemWindows(false)` + `Modifier.windowInsetsPadding()`. Bottom nav floats in the same glass style as the web app (blur via RenderEffect, Android 12+).

**Adaptive Layout**
On tablets and foldables: two-column layout identical to `md:flex-row` in the web app. `WindowSizeClass` determines the breakpoint.

### Project Structure (feature-based)

```
app/
├── core/
│   ├── crypto/         CryptoManager (PBKDF2, AES-GCM)
│   ├── db/             Room DAOs, Entities, Database
│   ├── sync/           CouchDBSyncEngine, SyncWorker
│   └── ui/             Theme, Typography, Color, SharedComposables
├── feature/
│   ├── auth/           LockScreen, SetupPassword, ConnectDevice
│   ├── journal/        JournalScreen, EntryForm, EntryCard
│   ├── calendar/       CalendarScreen, HeatmapGrid
│   ├── threads/        ThreadsScreen, ThreadItem
│   ├── review/         ReviewScreen, ReviewCard
│   └── settings/       SettingsScreen, SyncSettings, AppearanceSettings
└── navigation/         NavGraph, NavigationHost
```

---

## 7. iOS — Architecture & Design

### Tech Stack

```
Language        Swift 6
UI              SwiftUI + NavigationStack
State           @Observable (iOS 17+)
DB              SwiftData (iOS 17+)
Sync            Custom CouchDB engine (URLSession + async/await)
Crypto          CryptoKit (AES-GCM) + CommonCrypto (PBKDF2)
Min iOS         17.0 — enables SwiftData and @Observable without boilerplate
```

### Design Philosophy: iOS

- **SF Symbols** for all icons — system-consistent, scales automatically with Dynamic Type
- **LockScreen**: `Canvas` + `TimelineView` for the wheat field (equivalent to the web Canvas implementation)
- **Haptics**: `UIImpactFeedbackGenerator` on save, `UINotificationFeedbackGenerator` on sync success
- **Dynamic Island** (iPhone 14 Pro+): sync status as a Live Activity

> **Open question:** iOS first or parallel to Android? Recommendation: finish Android first, then iOS — the shared sync protocol and crypto spec will already be validated by then.

---

## 8. Phase Plan

### Phase 1 — Android MVP (Journal + Sync)

**Goal:** Existing web accounts can be read and written on Android.

- [ ] Project setup (Gradle, Hilt, Room, OkHttp)
- [ ] Crypto module: PBKDF2 + AES-GCM, compatibility test against web app
- [ ] Auth: LockScreen (wheat field, password setup, login, brute-force protection)
- [ ] Local DB: Room schema (Entry, Thread, Settings)
- [ ] CouchDB sync engine: pull + push + basic conflict handling
- [ ] Journal view: read and write entries, tag filter
- [ ] Sync status feedback (status bar icon or persistent notification)

### Phase 2 — Android Feature Parity

- [ ] Calendar view with heatmap (custom Canvas Composable)
- [ ] Threads view (due dates, color labels)
- [ ] Review view (port SM-2 scheduling logic)
- [ ] Settings (theme, language, sync, export/import)
- [ ] Full-text search (Room FTS5)
- [ ] Conflict resolution screen

### Phase 3 — Android APK Release

- [ ] Signed APK build (release keystore)
- [ ] R8 / ProGuard configuration
- [ ] Crash reporting (Sentry or Firebase Crashlytics)
- [ ] Direct APK distribution (GitHub Releases or self-hosted)

### Phase 4 — iOS MVP

- [ ] Same steps as Phase 1, Swift stack
- [ ] Crypto compatibility test against Android and web

### Phase 5 — Argon2id Migration (all platforms simultaneously)

- [ ] Web: integrate argon2-browser (WASM)
- [ ] Android: add argon2-jvm
- [ ] iOS: libsodium Swift wrapper
- [ ] Migration flow implemented on all three platforms
- [ ] Add `encryptionKdf` field to schema
- [ ] Coordinated release across all platforms

---

## 9. Open Questions (collected)

1. **Android v1 scope**: Journal + Sync only, or target all four views from the start?
2. **Argon2id migration**: Offered automatically on first launch of the new version, or only manually via settings?
3. **Crypto test suite**: Separate tool that verifies the same ciphertext is correctly decryptable on all three platforms?
4. **iOS timing**: After Android release, or developed in parallel?
5. **SQLCipher**: Encrypt local SQLite on Android as well (defense-in-depth), or is app-level content encryption sufficient?
6. **Sync configuration**: "Wi-Fi only" and "Manual" options in v1, or later?
7. **LockScreen wheat field on native**: Canvas/Skia on Android (feasible in Compose), Metal shader on iOS (more involved) — or a simplified version for v1?

---

*Draft — as of 2026-05-26*
