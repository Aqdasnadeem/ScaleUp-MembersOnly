-- P2-29: Business-scoped anomaly detection records.

BEGIN;

CREATE TABLE anomalies (
    anomaly_id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    business_id UUID NOT NULL,
    anomaly_type VARCHAR(20) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    metric_date DATE NOT NULL,
    subject_key VARCHAR(255) NOT NULL DEFAULT '',
    observed_value NUMERIC(16,2) NOT NULL,
    expected_value NUMERIC(16,2) NOT NULL,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_anomalies PRIMARY KEY (anomaly_id),
    CONSTRAINT fk_anomalies_business_id
        FOREIGN KEY (business_id) REFERENCES businesses(business_id),
    CONSTRAINT uq_anomalies_business_type_date
        UNIQUE (business_id, anomaly_type, metric_date, subject_key),
    CONSTRAINT chk_anomalies_type
        CHECK (anomaly_type IN ('sales', 'inventory', 'expense')),
    CONSTRAINT chk_anomalies_severity
        CHECK (severity IN ('warning', 'critical'))
);

CREATE INDEX idx_anomalies_business_detected
    ON anomalies (business_id, detected_at DESC);

CREATE INDEX idx_anomalies_business_type
    ON anomalies (business_id, anomaly_type, detected_at DESC);

COMMIT;
