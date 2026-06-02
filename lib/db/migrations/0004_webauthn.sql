CREATE TABLE IF NOT EXISTS `webauthn_credentials` (
  `id`          text PRIMARY KEY NOT NULL,
  `public_key`  text NOT NULL,
  `sign_count`  integer NOT NULL DEFAULT 0,
  `device_name` text NOT NULL DEFAULT '',
  `key_blob`    text NOT NULL,
  `created_at`  text NOT NULL
);

CREATE TABLE IF NOT EXISTS `webauthn_challenges` (
  `id`         text PRIMARY KEY NOT NULL,
  `type`       text NOT NULL,
  `expires_at` text NOT NULL
);
