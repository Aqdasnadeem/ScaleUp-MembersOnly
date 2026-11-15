DO $$
BEGIN
  IF to_regclass('public.users') IS NULL
     AND to_regclass('public.app_users') IS NOT NULL THEN
    ALTER TABLE public.app_users RENAME TO users;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  business_name text NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name text NOT NULL DEFAULT 'Your business';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  CREATE TYPE business_date_format AS ENUM ('DMY', 'MDY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  currency text NOT NULL DEFAULT 'PKR' CHECK (currency = 'PKR'),
  date_format business_date_format NOT NULL DEFAULT 'DMY',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO businesses (owner_id, name, is_demo)
SELECT id, left(btrim(business_name), 80), is_demo
FROM users
WHERE char_length(btrim(business_name)) BETWEEN 2 AND 80
ON CONFLICT (owner_id) DO NOTHING;

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS businesses_account_isolation ON businesses;
CREATE POLICY businesses_account_isolation ON businesses
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry_idx
  ON password_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS assistant_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 500),
  answer text NOT NULL,
  records_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_history_user_created_idx
  ON assistant_history(user_id, created_at DESC);
ALTER TABLE assistant_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assistant_history_account_isolation ON assistant_history;
CREATE POLICY assistant_history_account_isolation ON assistant_history
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS upload_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('sales', 'inventory', 'expenses', 'feedback')),
  rows_saved integer NOT NULL DEFAULT 0 CHECK (rows_saved >= 0),
  rows_rejected integer NOT NULL DEFAULT 0 CHECK (rows_rejected >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upload_events_user_created_idx
  ON upload_events(user_id, created_at DESC);
ALTER TABLE upload_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upload_events_account_isolation ON upload_events;
CREATE POLICY upload_events_account_isolation ON upload_events
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Multiple accounts use the same normalized email; resolve duplicates before applying the account migration.';
  END IF;
  UPDATE users SET email = lower(btrim(email));
END
$$;

DROP INDEX IF EXISTS users_email_lower_idx;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_unique_idx ON users(lower(email));
