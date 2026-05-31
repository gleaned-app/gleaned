# Local-First Sync Plan

## Idee

SQLite im Browser via WebAssembly kombiniert mit dem bestehenden Server-API. Einträge werden lokal gespeichert und im Hintergrund mit dem Server synchronisiert — die App funktioniert vollständig offline, Daten landen erst beim nächsten Online-Sein auf dem Server.

Die E2E-Verschlüsselung bleibt exakt gleich: der Browser verschlüsselt mit AES-GCM bevor er speichert, der Server sieht weiterhin nur `data_enc`.

---

## Stack

| Schicht | Technologie |
|---|---|
| Lokale DB im Browser | SQLite via `@sqlite.org/sqlite-wasm` |
| Persistenz im Browser | Origin Private File System (OPFS) |
| Sync-Protokoll | Timestamp-basiertes Pull/Push gegen bestehende API |
| Konfliktlösung | Last-write-wins via `updated_at` |
| Verschlüsselung | Unverändert — AES-GCM client-side |

---

## Architektur

```
Browser                          Server
────────────────────────────────────────────────────
wa-sqlite (OPFS)                 SQLite (better-sqlite3)
     │                                │
     │  ←── Pull (updated_since) ─── │
     │  ──── Push (local changes) ──→ │
     │                                │
  [AES-GCM encrypt]           [stores data_enc only]
```

Der Browser hat eine vollständige lokale Kopie aller Daten. Lesen und Schreiben geht immer gegen die lokale DB — kein Warten auf den Server. Sync läuft im Hintergrund, getriggert beim Start und beim Wiederherstellen einer Netzverbindung.

---

## Sync-Protokoll

### Pull (Server → Browser)

```
GET /api/entries?updated_since=<ISO-timestamp>
GET /api/threads?updated_since=<ISO-timestamp>
```

Der Server gibt alle Zeilen zurück deren `updated_at` neuer ist als der letzte bekannte Sync-Zeitpunkt. Der Browser schreibt diese in die lokale DB (last-write-wins).

### Push (Browser → Server)

Der Browser trackt lokal geänderte Einträge mit einem `dirty`-Flag. Beim Sync werden alle dirty Einträge gepusht:

```
POST /api/entries/sync   { entries: [...] }
POST /api/threads/sync   { threads: [...] }
```

Der Server macht einen Upsert basierend auf `id` + `updated_at`.

### Konfliktlösung

Last-write-wins via `updated_at`. Für ein persönliches Journal ist das ausreichend — es gibt nur einen Nutzer, Konflikte entstehen nur wenn derselbe Eintrag auf zwei Geräten gleichzeitig bearbeitet wird.

---

## Was sich ändert

### API (Server)

- Neue Query-Parameter: `?updated_since=` für Entries und Threads
- Neue Bulk-Sync-Endpunkte: `POST /api/entries/sync`, `POST /api/threads/sync`
- Sonst: keine Änderungen — bestehende Endpunkte bleiben kompatibel

### Client

- `lib/db/local.ts` — wa-sqlite initialisieren, Schema anlegen, OPFS-Verbindung
- `lib/db/sync.ts` — Pull/Push-Logik, dirty-Tracking, Konfliktlösung
- `lib/db/entries.ts`, `threads.ts` — lesen/schreiben gegen lokale DB statt API
- Service Worker — Sync beim Wiederherstellen der Verbindung triggern (`Background Sync API`)

### Schema lokal (Browser)

Identisch mit dem Server-Schema:

```sql
entries  (id, date, created_at, updated_at, next_review, review_interval, data_enc, dirty)
threads  (id, done, due_date, color, created_at, updated_at, data_enc, dirty)
settings (key, value)
sync_meta (last_pull_at)
```

Das `dirty`-Flag wird nach erfolgreichem Push auf `0` gesetzt.

---

## Vorteile gegenüber der alten PouchDB-Architektur

- **Gleiche DB-Technologie** auf Client und Server → kein Impedance Mismatch
- **Kein CouchDB** → kein separater Docker-Service, kein Sync-Protokoll-Overhead
- **Kein Konflikt-Modal** → last-write-wins ist für Solo-Nutzung ausreichend
- **Einfacheres Sync-Protokoll** → Timestamps statt CouchDB-Revision-Trees
- **E2E-Verschlüsselung unverändert** → server sieht nur `data_enc`
- **OPFS ist schneller als IndexedDB** → bessere Performance als PouchDB

---

## Native App

Derselbe Ansatz funktioniert für die geplante native App (Android/iOS):

- Lokale SQLite-Datei auf dem Gerät (kein WASM nötig — nativer SQLite-Support)
- Identisches Sync-Protokoll gegen den Server
- E2E-Verschlüsselung mit denselben Algorithmen (AES-GCM, PBKDF2)

Der Server wird zur Single Source of Truth — Browser und native App sind gleichwertige Clients.

---

## Implementierungsreihenfolge (wenn gewünscht)

1. `?updated_since=` Parameter zu den bestehenden API-Routen hinzufügen
2. `POST /api/entries/sync` und `/api/threads/sync` Bulk-Endpunkte bauen
3. `wa-sqlite` + OPFS im Browser initialisieren
4. Client-seitige Reads/Writes auf lokale DB umstellen
5. Sync-Loop implementieren (Start + Online-Event)
6. Background Sync API im Service Worker verdrahten
