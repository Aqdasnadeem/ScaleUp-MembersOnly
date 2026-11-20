-- 005: super admin (role, is_active, business status) + plans (free/pro) + payments + admin audit log.
-- Depends on 001 (businesses, users). Adds columns and two new tables; does not touch any existing column.
BEGIN;

ALTER TABLE users
    ADD COLUMN role TEXT NOT NULL DEFAULT 'business_user',
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- A super admin has no business; every existing row today is a business_user with a business_id, so this is safe.
ALTER TABLE users ALTER COLUMN business_id DROP NOT NULL;

ALTER TABLE users
    ADD CONSTRAINT chk_users_role CHECK (role IN ('business_user', 'super_admin')),
    ADD CONSTRAINT chk_users_role_business_id CHECK (
        (role = 'super_admin' AND business_id IS NULL) OR
        (role = 'business_user' AND business_id IS NOT NULL)
    );

ALTER TABLE businesses
    ADD COLUMN status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN plan TEXT NOT NULL DEFAULT 'free',
    ADD COLUMN plan_expires_at TIMESTAMPTZ NULL;

ALTER TABLE businesses
    ADD CONSTRAINT chk_businesses_status CHECK (status IN ('active', 'suspended')),
    ADD CONSTRAINT chk_businesses_plan CHECK (plan IN ('free', 'pro'));

-- One row per admin action (business/user/plan create-update-delete). target_id is TEXT because the
-- target can be a business, a user, or (for plan changes) a business again; no single FK fits all three.
CREATE TABLE admin_audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    admin_user_id UUID NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NULL,
    details JSONB NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT pk_admin_audit_log PRIMARY KEY (id),
    CONSTRAINT fk_admin_audit_log_admin_user_id FOREIGN KEY (admin_user_id) REFERENCES users(user_id)
);

-- One row per (mock, for now) checkout attempt. No real money moves; see MockProvider in app/billing.py.
CREATE TABLE payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    business_id UUID NOT NULL,
    plan TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PKR',
    provider TEXT NOT NULL,
    provider_ref TEXT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT pk_payments PRIMARY KEY (id),
    CONSTRAINT fk_payments_business_id FOREIGN KEY (business_id) REFERENCES businesses(business_id),
    CONSTRAINT chk_payments_status CHECK (status IN ('pending', 'paid', 'failed')),
    CONSTRAINT chk_payments_plan CHECK (plan IN ('free', 'pro'))
);

CREATE INDEX idx_admin_audit_log_admin_user ON admin_audit_log (admin_user_id);
CREATE INDEX idx_payments_business ON payments (business_id);

COMMIT;
