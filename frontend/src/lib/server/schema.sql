CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  business_name text NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('sales', 'inventory', 'expenses', 'feedback')),
  file_name text NOT NULL,
  row_count integer NOT NULL CHECK (row_count > 0),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS datasets_user_uploaded_idx ON datasets(user_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 1),
  data jsonb NOT NULL,
  CONSTRAINT records_dataset_owner_fk
    FOREIGN KEY (dataset_id, user_id)
    REFERENCES datasets(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS records_user_dataset_idx ON records(user_id, dataset_id);
CREATE INDEX IF NOT EXISTS records_data_gin_idx ON records USING gin(data);

ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE datasets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS datasets_account_isolation ON datasets;
CREATE POLICY datasets_account_isolation ON datasets
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS records_account_isolation ON records;
CREATE POLICY records_account_isolation ON records
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key text PRIMARY KEY,
  request_count integer NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limits_expiry_idx ON rate_limits(expires_at);
