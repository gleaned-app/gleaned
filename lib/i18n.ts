import { useSettings } from "./settings-context";

export interface Translations {
  // Entry form
  entryPlaceholder: string;
  tagsPlaceholder: string;
  attachFile: string;
  save: string;

  // Entry card
  edit: string;
  delete: string;
  cancel: string;
  tagPlaceholder: string;

  // Lock screen
  firstTimePrompt: string;
  register: string;
  signin: string;
  encryptionNotice: string;
  choosePassword: string;
  password: string;
  confirm: string;
  minChars: string;
  getStarted: string;
  unlock: string;
  back: string;
  passwordMismatch: string;
  passwordTooShort: string;
  pwWeak: string;
  pwFair: string;
  pwStrong: string;
  acceptShortPw: string;
  wrongPassword: string;
  noLocalAccount: string;
  tooManyAttempts(secs: number): string;

  // Connect-existing-account flow
  connectAccount: string;
  connectPrompt: string;
  connectCouchdbUrl: string;
  connectCouchdbUser: string;
  connectCouchdbPass: string;
  connectAction: string;
  connectSuccess: string;
  connectNotFound: string;
  connectAuthError: string;
  connectNetworkError: string;
  connectOverwriteWarning: string;

  // Journal
  filterBack: string;
  noEntriesTag(tag: string): string;
  whatsSticking: string;
  whatStuckToday: string;
  entry: string;
  entries: string;
  today: string;
  tomorrow: string;
  yesterday: string;
  nothingYetToday: string;

  // Calendar
  prevMonth: string;
  nextMonth: string;
  less: string;
  more: string;
  noEntriesOnDay: string;
  entryCount(n: number): string;

  // Threads
  threadsTitle: string;
  threadsPlaceholder: string;
  threadsEmpty: string;
  setDueDate: string;
  pickDate: string;
  remove: string;
  done: string;
  markOpen: string;
  markDone: string;
  overdue(d: number): string;
  color: string;

  // Review
  navReview: string;
  reviewTitle: string;
  reviewDaysAgo(n: number): string;
  reviewAgain: string;
  reviewGotIt: string;
  reviewUndo: string;
  reviewEmpty: string;
  reviewEmptyBody: string;
  reviewOf(done: number, total: number): string;
  reviewHistory: string;
  reviewHistoryEmpty: string;
  reviewSuperseded: string;
  calibrationLabel: string;
  calibrationNotEnoughData: string;

  // Type-specific review prompts
  reviewPromptInsight: string;
  reviewPromptTechnique: string;
  reviewPromptFramework: string;
  reviewPromptObservation: string;
  reviewReveal: string;

  // Gap review mode
  reviewGapPrompt: string;
  reviewGapResolved: string;
  reviewGapStillOpen: string;
  reviewGapArchive: string;
  filterRecent: string;
  filterOpenGaps: string;
  filterAllTags: string;
  filterByTag: string;
  reviewSupersededTooltip: string;
  reviewGapArchiveTooltip: string;
  thisWeek: string;
  lastWeek: string;
  weeksAgo(n: number): string;

  // Nav + profile + header
  navCalendar: string;
  navLearn: string;
  navJournal: string;
  settings: string;
  lock: string;
  install: string;
  syncConflicts(n: number): string;
  syncStatusSyncing: string;
  syncStatusSynced: string;
  syncStatusError: string;

  // Settings modal
  settingsTitle: string;
  catAppearance: string;
  catGeneral: string;
  catData: string;
  catAlerts: string;
  colorScheme: string;
  font: string;
  fontModern: string;
  fontClassic: string;
  fontElegant: string;
  fontHandwriting: string;
  themeAuto: string;
  themeLight: string;
  themeDark: string;
  language: string;
  weekStartLabel: string;
  monday: string;
  sunday: string;
  syncDesc: string;
  syncAutoDetected: string;
  syncTest: string;
  syncTestOk: string;
  syncTestFail: string;
  syncTestAuth: string;
  syncConnecting: string;
  username: string;
  dbPassword: string;
  exportImport: string;
  export: string;
  import: string;
  manageTags: string;
  close: string;
  noTags: string;
  importResult(imported: number, skipped: number): string;
  importError: string;
  fileTooLarge(name: string): string;
  notifDesc: string;
  reminderOn: string;
  reminderBlocked: string;
  reminderEnable: string;

  swUpdateAvailable: string;
  swUpdateReload: string;

  defaultViewLabel: string;
  customTypesLabel: string;
  customTypesPlaceholder: string;
  customTypesEmpty: string;
  contextSourcesLabel: string;
  contextSourcesPlaceholder: string;
  contextSourcesEmpty: string;
  contextLabel: string;
  genericError: string;

  // Entry context panel (source / stake / gap / type) — form labels
  contextToggle: string;
  sourcePlaceholder: string;
  stakePlaceholder: string;
  gapPlaceholder: string;
  typeInsight: string;
  typeTechnique: string;
  typeFramework: string;
  typeFact: string;
  typeObservation: string;
  // Entry card display labels
  sourceLabel: string;
  stakeLabel: string;
  gapLabel: string;

  // Search
  search: string;
  searchPlaceholder: string;
  searchNoResults: string;
  searchEmpty: string;

  // Conflict modal
  syncConflict: string;
  conflictDesc: string;
  noContent: string;
  keepThis: string;
  noConflicts: string;
}

const de: Translations = {
  entryPlaceholder: "Was hast du heute gelernt?",
  tagsPlaceholder: "Tags...",
  attachFile: "Datei anhängen",
  save: "Speichern",

  edit: "Bearbeiten",
  delete: "Löschen",
  cancel: "Abbrechen",
  tagPlaceholder: "Tag...",

  firstTimePrompt: "Zum ersten Mal auf diesem Gerät — oder möchtest du dich anmelden?",
  register: "Registrieren",
  signin: "Anmelden",
  encryptionNotice: "Alles was du schreibst wird verschlüsselt — nur du kannst es lesen.",
  choosePassword: "Passwort wählen",
  password: "Passwort",
  confirm: "Bestätigen",
  minChars: "mindestens 10 Zeichen",
  getStarted: "Loslegen",
  unlock: "Entsperren",
  back: "← Zurück",
  passwordMismatch: "Passwörter stimmen nicht überein.",
  passwordTooShort: "Mindestens 10 Zeichen.",
  pwWeak: "Schwach",
  pwFair: "Mittel",
  pwStrong: "Stark",
  acceptShortPw: "Kurzes Passwort akzeptieren — ich verstehe das erhöhte Risiko.",
  wrongPassword: "Falsches Passwort.",
  noLocalAccount: "Kein Konto in diesem Browser. CouchDB-Sync einrichten oder Registrieren.",
  tooManyAttempts: (secs) => `Zu viele Versuche — bitte ${secs}s warten.`,
  connectAccount: "Gerät verbinden",
  connectPrompt: "Server-URL und CouchDB-Zugangsdaten eingeben, um den bestehenden Account auf dieses Gerät zu holen.",
  connectCouchdbUrl: "Server-URL",
  connectCouchdbUser: "Benutzername",
  connectCouchdbPass: "CouchDB-Passwort",
  connectAction: "Verbinden",
  connectSuccess: "Account gefunden — bitte mit deinem App-Passwort einloggen.",
  connectNotFound: "Kein gleaned-Account auf diesem Server gefunden.",
  connectAuthError: "Zugangsdaten falsch.",
  connectNetworkError: "Server nicht erreichbar.",
  connectOverwriteWarning: "Lokale Einträge auf diesem Gerät, die noch nicht mit CouchDB synchronisiert wurden, werden unlesbar — der Verschlüsselungsschlüssel ändert sich auch bei gleichem Passwort. Exportiere jetzt deine Daten (Einstellungen → Exportieren), dann kannst du sie nach dem Verbinden wieder importieren.",

  filterBack: "zurück",
  noEntriesTag: (tag) => `Keine Einträge für #${tag}`,
  whatsSticking: "Was bleibt heute hängen?",
  whatStuckToday: "Was heute hängen bleibt",
  entry: "Eintrag",
  entries: "Einträge",
  today: "Heute",
  tomorrow: "Morgen",
  yesterday: "Gestern",
  nothingYetToday: "Noch nichts für heute.",

  prevMonth: "Vorheriger Monat",
  nextMonth: "Nächster Monat",
  less: "weniger",
  more: "mehr",
  noEntriesOnDay: "Keine Einträge an diesem Tag.",
  entryCount: (n) => `${n} Eintr${n === 1 ? "ag" : "äge"}`,

  threadsTitle: "Threads",
  threadsPlaceholder: "Was willst du verfolgen?",
  threadsEmpty: "Füge deinen ersten Thread hinzu.",
  setDueDate: "Fälligkeit setzen",
  pickDate: "Datum wählen…",
  remove: "Entfernen",
  done: "Erledigt",
  markOpen: "Als offen markieren",
  markDone: "Als erledigt markieren",
  overdue: (d) => `${d}d überfällig`,
  color: "Farbe",

  navReview: "Review",
  reviewTitle: "Wiederholen",
  reviewDaysAgo: (n) => n === 1 ? "vor 1 Tag" : `vor ${n} Tagen`,
  reviewAgain: "Nochmal",
  reviewGotIt: "Sitzt noch!",
  reviewUndo: "Rückgängig",
  reviewEmpty: "Alles wiederholt.",
  reviewEmptyBody: "Du investierst in dein Wissen. Das zeigt.",
  reviewOf: (done, total) => `${done} von ${total}`,
  reviewHistory: "Verlauf",
  reviewHistoryEmpty: "Noch nichts wiederholt.",
  reviewSuperseded: "Überholt",
  calibrationLabel: "Kalibrierung",
  calibrationNotEnoughData: "noch zu wenig Daten",

  reviewPromptInsight: "Gilt das noch für dich — heute, wer du bist?",
  reviewPromptTechnique: "Kannst du es durchgehen, ohne nachzuschauen?",
  reviewPromptFramework: "Kannst du die Struktur rekonstruieren?",
  reviewPromptObservation: "Hat sich das verändert? Hast du das Gegenteil gesehen?",
  reviewReveal: "Inhalt zeigen",

  reviewGapPrompt: "Du hast hier etwas Offenes notiert. Hat es sich geklärt?",
  reviewGapResolved: "Geklärt",
  reviewGapStillOpen: "Noch offen",
  reviewGapArchive: "Nicht mehr relevant",
  filterRecent: "Neueste",
  filterOpenGaps: "Offene Lücken",
  filterAllTags: "Alle",
  filterByTag: "tag filtern…",
  reviewSupersededTooltip: "Dieses Wissen wurde durch neueres Verständnis ersetzt — wird in 6 Monaten wieder gezeigt.",
  reviewGapArchiveTooltip: "Diese Lücke ist nicht mehr relevant — wird archiviert und nicht weiter verfolgt.",
  thisWeek: "Diese Woche",
  lastWeek: "Letzte Woche",
  weeksAgo: (n) => n === 1 ? "Vor 1 Woche" : `Vor ${n} Wochen`,

  navCalendar: "Kalender",
  navLearn: "Threads",
  navJournal: "Journal",

  settings: "Einstellungen",
  lock: "Sperren",
  install: "Installieren",
  syncConflicts: (n) => `${n} Sync-Konflikt${n !== 1 ? "e" : ""}`,
  syncStatusSyncing: "Synchronisiert gerade …",
  syncStatusSynced: "Synchronisiert",
  syncStatusError: "Synchronisierungsfehler — URL oder Zugangsdaten prüfen",

  settingsTitle: "Einstellungen",
  catAppearance: "Darstellung",
  catGeneral: "Allgemein",
  catData: "Daten",
  catAlerts: "Hinweise",
  colorScheme: "Farbschema",
  font: "Schriftart",
  fontModern: "Modern",
  fontClassic: "Klassisch",
  fontElegant: "Elegant",
  fontHandwriting: "Handschrift",
  themeAuto: "Auto",
  themeLight: "Hell",
  themeDark: "Dunkel",
  language: "Sprache",
  weekStartLabel: "Wochenanfang",
  monday: "Montag",
  sunday: "Sonntag",
  syncDesc: "Jeder Browser hat eine eigene lokale Datenbank. CouchDB synchronisiert sie geräteübergreifend. Bei Docker-Deployment ist die URL immer deine-domain.de/db/gleaned — CouchDB läuft intern, der /db/-Pfad ist der nginx-Proxy.",
  syncAutoDetected: "Automatisch",
  syncTest: "Testen",
  syncTestOk: "Verbunden ✓",
  syncTestFail: "Nicht erreichbar — CouchDB-CORS prüfen",
  syncTestAuth: "Zugangsdaten falsch",
  syncConnecting: "Verbinde…",
  username: "Benutzer",
  dbPassword: "Passwort",
  exportImport: "Export / Import",
  export: "Exportieren",
  import: "Importieren",
  manageTags: "Tags verwalten",
  close: "Schließen",
  noTags: "Keine Tags vorhanden",
  importResult: (imported, skipped) => `${imported} importiert, ${skipped} übersprungen`,
  importError: "Fehler beim Importieren",
  fileTooLarge: (name) => `„${name}" ist zu groß (max. 10 MB).`,
  notifDesc: "Erhalte täglich eine Erinnerung, deine Erkenntnisse einzutragen.",
  reminderOn: "Erinnerung aktiv — deaktivieren",
  reminderBlocked: "Blockiert — in Browsereinstellungen erlauben",
  reminderEnable: "Tägliche Erinnerung aktivieren",

  swUpdateAvailable: "Neue Version verfügbar",
  swUpdateReload: "Neu laden",

  defaultViewLabel: "Standard-Ansicht",
  customTypesLabel: "Eigene Typen",
  customTypesPlaceholder: "Neuer Typ…",
  customTypesEmpty: "Noch keine eigenen Typen.",
  contextSourcesLabel: "Lernorte",
  contextSourcesPlaceholder: "Neuer Ort…",
  contextSourcesEmpty: "Noch keine Lernorte.",
  contextLabel: "Lernort",
  genericError: "Fehler — Seite neu laden.",

  search: "Suchen",
  searchPlaceholder: "Einträge durchsuchen…",
  searchNoResults: "Nichts gefunden.",
  searchEmpty: "Schreib etwas um zu suchen",

  contextToggle: "Kontext",
  sourcePlaceholder: "Quelle — wo hast du das gelernt?",
  stakePlaceholder: "Einsatz — was ändert sich für dich jetzt?",
  gapPlaceholder: "Lücke — was ist noch unklar?",
  typeInsight: "Erkenntnis",
  typeTechnique: "Technik",
  typeFramework: "Framework",
  typeFact: "Fakt",
  typeObservation: "Beobachtung",
  sourceLabel: "Quelle",
  stakeLabel: "Einsatz",
  gapLabel: "Lücke",

  syncConflict: "Sync-Konflikt",
  conflictDesc: "Dieser Eintrag wurde auf zwei Geräten offline bearbeitet. Wähle die Version, die gespeichert werden soll.",
  noContent: "Kein Inhalt",
  keepThis: "Diese behalten",
  noConflicts: "Keine Konflikte mehr.",
};

const en: Translations = {
  entryPlaceholder: "What did you learn today?",
  tagsPlaceholder: "Tags...",
  attachFile: "Attach file",
  save: "Save",

  edit: "Edit",
  delete: "Delete",
  cancel: "Cancel",
  tagPlaceholder: "Tag...",

  firstTimePrompt: "First time on this device — or would you like to sign in?",
  register: "Register",
  signin: "Sign in",
  encryptionNotice: "Everything you write is encrypted — only you can read it.",
  choosePassword: "Choose a password",
  password: "Password",
  confirm: "Confirm",
  minChars: "at least 10 characters",
  getStarted: "Get started",
  unlock: "Unlock",
  back: "← Back",
  passwordMismatch: "Passwords don't match.",
  passwordTooShort: "At least 10 characters.",
  pwWeak: "Weak",
  pwFair: "Fair",
  pwStrong: "Strong",
  acceptShortPw: "Accept short password — I understand the increased risk.",
  wrongPassword: "Wrong password.",
  noLocalAccount: "No account in this browser. Set up CouchDB sync or register.",
  tooManyAttempts: (secs) => `Too many attempts — please wait ${secs}s.`,
  connectAccount: "Connect device",
  connectPrompt: "Enter your server URL and CouchDB credentials to bring your existing account to this device.",
  connectCouchdbUrl: "Server URL",
  connectCouchdbUser: "Username",
  connectCouchdbPass: "CouchDB password",
  connectAction: "Connect",
  connectSuccess: "Account found — please log in with your app password.",
  connectNotFound: "No gleaned account found on this server.",
  connectAuthError: "Wrong credentials.",
  connectNetworkError: "Server not reachable.",
  connectOverwriteWarning: "Local entries on this device that have not been synced to CouchDB will become unreadable — the encryption key changes even if the password is the same. Export your data first (Settings → Export), then import it again after connecting.",

  filterBack: "back",
  noEntriesTag: (tag) => `No entries for #${tag}`,
  whatsSticking: "What's sticking with you today?",
  whatStuckToday: "What stuck today",
  entry: "entry",
  entries: "entries",
  today: "Today",
  tomorrow: "Tomorrow",
  yesterday: "Yesterday",
  nothingYetToday: "Nothing yet today.",

  prevMonth: "Previous month",
  nextMonth: "Next month",
  less: "less",
  more: "more",
  noEntriesOnDay: "No entries on this day.",
  entryCount: (n) => `${n} entr${n === 1 ? "y" : "ies"}`,

  threadsTitle: "Threads",
  threadsPlaceholder: "What do you want to follow up on?",
  threadsEmpty: "Add your first thread.",
  setDueDate: "Set due date",
  pickDate: "Pick a date…",
  remove: "Remove",
  done: "Done",
  markOpen: "Mark as open",
  markDone: "Mark as done",
  overdue: (d) => `${d}d overdue`,
  color: "Color",

  navReview: "Review",
  reviewTitle: "Review",
  reviewDaysAgo: (n) => n === 1 ? "1 day ago" : `${n} days ago`,
  reviewAgain: "Again",
  reviewGotIt: "Got it!",
  reviewUndo: "Undo",
  reviewEmpty: "All caught up.",
  reviewEmptyBody: "You're investing in your knowledge. It shows.",
  reviewOf: (done, total) => `${done} of ${total}`,
  reviewHistory: "History",
  reviewHistoryEmpty: "Nothing reviewed yet.",
  reviewSuperseded: "Superseded",
  calibrationLabel: "Calibration",
  calibrationNotEnoughData: "not enough data yet",

  reviewPromptInsight: "Is this still true for who you are now?",
  reviewPromptTechnique: "Can you walk through it without looking?",
  reviewPromptFramework: "Can you reconstruct the structure?",
  reviewPromptObservation: "Has this changed? Have you seen the opposite?",
  reviewReveal: "Reveal",

  reviewGapPrompt: "You flagged something unresolved here. Has it resolved?",
  reviewGapResolved: "Resolved",
  reviewGapStillOpen: "Still open",
  reviewGapArchive: "No longer relevant",
  filterRecent: "Recent",
  filterOpenGaps: "Open gaps",
  filterAllTags: "All",
  filterByTag: "filter by tag…",
  reviewSupersededTooltip: "This knowledge has been superseded — pushed to 6 months from now.",
  reviewGapArchiveTooltip: "This gap is no longer worth resolving — it will be archived.",
  thisWeek: "This week",
  lastWeek: "Last week",
  weeksAgo: (n) => n === 1 ? "1 week ago" : `${n} weeks ago`,

  navCalendar: "Calendar",
  navLearn: "Threads",
  navJournal: "Journal",

  settings: "Settings",
  lock: "Lock",
  install: "Install",
  syncConflicts: (n) => `${n} sync conflict${n !== 1 ? "s" : ""}`,
  syncStatusSyncing: "Syncing …",
  syncStatusSynced: "Synced",
  syncStatusError: "Sync error — check URL and credentials",

  settingsTitle: "Settings",
  catAppearance: "Appearance",
  catGeneral: "General",
  catData: "Data",
  catAlerts: "Alerts",
  colorScheme: "Color scheme",
  font: "Font",
  fontModern: "Modern",
  fontClassic: "Classic",
  fontElegant: "Elegant",
  fontHandwriting: "Handwriting",
  themeAuto: "Auto",
  themeLight: "Light",
  themeDark: "Dark",
  language: "Language",
  weekStartLabel: "Week starts on",
  monday: "Monday",
  sunday: "Sunday",
  syncDesc: "Each browser has its own local database. CouchDB syncs them across devices. With Docker deployment the URL is always your-domain.com/db/gleaned — CouchDB runs internally, /db/ is the nginx proxy.",
  syncAutoDetected: "Auto-detected",
  syncTest: "Test",
  syncTestOk: "Connected ✓",
  syncTestFail: "Unreachable — check CouchDB CORS config",
  syncTestAuth: "Wrong credentials",
  syncConnecting: "Connecting…",
  username: "Username",
  dbPassword: "Password",
  exportImport: "Export / Import",
  export: "Export",
  import: "Import",
  manageTags: "Manage tags",
  close: "Close",
  noTags: "No tags yet",
  importResult: (imported, skipped) => `${imported} imported, ${skipped} skipped`,
  importError: "Import failed",
  fileTooLarge: (name) => `"${name}" is too large (max. 10 MB).`,
  notifDesc: "Receive a daily reminder to log what you learned.",
  reminderOn: "Reminder on — turn off",
  reminderBlocked: "Blocked — allow in browser settings",
  reminderEnable: "Enable daily reminder",

  swUpdateAvailable: "New version available",
  swUpdateReload: "Reload",

  defaultViewLabel: "Default view",
  customTypesLabel: "Custom types",
  customTypesPlaceholder: "New type…",
  customTypesEmpty: "No custom types yet.",
  contextSourcesLabel: "Learning contexts",
  contextSourcesPlaceholder: "New context…",
  contextSourcesEmpty: "No learning contexts yet.",
  contextLabel: "Context",
  genericError: "Error — reload the page.",

  search: "Search",
  searchPlaceholder: "Search your entries…",
  searchNoResults: "No results.",
  searchEmpty: "Type something to search",

  contextToggle: "Context",
  sourcePlaceholder: "Source — where did you learn this?",
  stakePlaceholder: "Stake — what changes for you now?",
  gapPlaceholder: "Gap — what is still unclear?",
  typeInsight: "Insight",
  typeTechnique: "Technique",
  typeFramework: "Framework",
  typeFact: "Fact",
  typeObservation: "Observation",
  sourceLabel: "Source",
  stakeLabel: "Stake",
  gapLabel: "Gap",

  syncConflict: "Sync conflict",
  conflictDesc: "This entry was edited on two devices while offline. Choose the version to keep.",
  noContent: "No content",
  keepThis: "Keep this",
  noConflicts: "No more conflicts.",
};

export const T: Record<"de" | "en", Translations> = { de, en };

export function useT(): Translations {
  const { settings } = useSettings();
  return T[settings.language];
}
