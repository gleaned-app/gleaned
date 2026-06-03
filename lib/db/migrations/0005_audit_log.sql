CREATE TABLE IF NOT EXISTS `audit_log` (
  `id`     integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `ts`     text NOT NULL,
  `action` text NOT NULL,
  `detail` text NOT NULL DEFAULT '{}'
);
