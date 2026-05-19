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
  wrongPassword: string;
  noLocalAccount: string;

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

  // Todos
  toLearn: string;
  whatToLearn: string;
  setDueDate: string;
  pickDate: string;
  remove: string;
  addFirstGoal: string;
  done: string;
  markOpen: string;
  markDone: string;
  overdue(d: number): string;

  // Nav + profile + header
  navCalendar: string;
  navLearn: string;
  navJournal: string;
  settings: string;
  lock: string;
  install: string;
  syncConflicts(n: number): string;

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
  notifDesc: string;
  reminderOn: string;
  reminderBlocked: string;
  reminderEnable: string;

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
  minChars: "mindestens 4 Zeichen",
  getStarted: "Loslegen",
  unlock: "Entsperren",
  back: "← Zurück",
  passwordMismatch: "Passwörter stimmen nicht überein.",
  passwordTooShort: "Mindestens 4 Zeichen.",
  wrongPassword: "Falsches Passwort.",
  noLocalAccount: "Kein Konto in diesem Browser. CouchDB-Sync einrichten oder Registrieren.",

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

  toLearn: "Noch zu lernen",
  whatToLearn: "Was willst du noch lernen?",
  setDueDate: "Fälligkeit setzen",
  pickDate: "Datum wählen…",
  remove: "Entfernen",
  addFirstGoal: "Füge dein erstes Lernziel hinzu.",
  done: "Erledigt",
  markOpen: "Als offen markieren",
  markDone: "Als erledigt markieren",
  overdue: (d) => `${d}d überfällig`,

  navCalendar: "Kalender",
  navLearn: "Lernen",
  navJournal: "Journal",

  settings: "Einstellungen",
  lock: "Sperren",
  install: "Installieren",
  syncConflicts: (n) => `${n} Sync-Konflikt${n !== 1 ? "e" : ""}`,

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
  syncDesc: "Jeder Browser hat eine eigene lokale Datenbank. CouchDB synchronisiert sie — so teilst du Einträge und Passwort-Hash zwischen Chrome, Safari und deinem Handy.",
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
  notifDesc: "Erhalte täglich eine Erinnerung, deine Erkenntnisse einzutragen.",
  reminderOn: "Erinnerung aktiv — deaktivieren",
  reminderBlocked: "Blockiert — in Browsereinstellungen erlauben",
  reminderEnable: "Tägliche Erinnerung aktivieren",

  search: "Suchen",
  searchPlaceholder: "Einträge durchsuchen…",
  searchNoResults: "Nichts gefunden.",
  searchEmpty: "Schreib etwas um zu suchen",

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
  minChars: "at least 4 characters",
  getStarted: "Get started",
  unlock: "Unlock",
  back: "← Back",
  passwordMismatch: "Passwords don't match.",
  passwordTooShort: "At least 4 characters.",
  wrongPassword: "Wrong password.",
  noLocalAccount: "No account in this browser. Set up CouchDB sync or register.",

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

  toLearn: "Still to learn",
  whatToLearn: "What do you want to learn?",
  setDueDate: "Set due date",
  pickDate: "Pick a date…",
  remove: "Remove",
  addFirstGoal: "Add your first learning goal.",
  done: "Done",
  markOpen: "Mark as open",
  markDone: "Mark as done",
  overdue: (d) => `${d}d overdue`,

  navCalendar: "Calendar",
  navLearn: "Learn",
  navJournal: "Journal",

  settings: "Settings",
  lock: "Lock",
  install: "Install",
  syncConflicts: (n) => `${n} sync conflict${n !== 1 ? "s" : ""}`,

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
  syncDesc: "Each browser has its own local database. CouchDB syncs them — sharing entries and your password hash across Chrome, Safari and your phone.",
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
  notifDesc: "Receive a daily reminder to log what you learned.",
  reminderOn: "Reminder on — turn off",
  reminderBlocked: "Blocked — allow in browser settings",
  reminderEnable: "Enable daily reminder",

  search: "Search",
  searchPlaceholder: "Search your entries…",
  searchNoResults: "No results.",
  searchEmpty: "Type something to search",

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
