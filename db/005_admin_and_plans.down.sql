-- 005 down: reverses 005_admin_and_plans.up.sql exactly.
-- Run only after any super_admin rows are removed/reassigned a business_id (SET NOT NULL below will
-- otherwise fail), and after any plan/payment data you need is exported.
BEGIN;

DROP INDEX IF EXISTS idx_payments_business;
DROP INDEX IF EXISTS idx_admin_audit_log_admin_user;

DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS admin_audit_log;

ALTER TABLE businesses DROP CONSTRAINT IF EXISTS chk_businesses_plan;
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS chk_businesses_status;
ALTER TABLE businesses DROP COLUMN IF EXISTS plan_expires_at;
ALTER TABLE businesses DROP COLUMN IF EXISTS plan;
ALTER TABLE businesses DROP COLUMN IF EXISTS status;

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role_business_id;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
ALTER TABLE users ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE users DROP COLUMN IF EXISTS is_active;
ALTER TABLE users DROP COLUMN IF EXISTS role;

COMMIT;
