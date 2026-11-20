import assert from "node:assert/strict";
import test from "node:test";
import { parseAnomalies } from "../anomalies";

test("anomaly response preserves change and evidence including zero", () => {
  const response = {
    start_date: "2026-03-01", end_date: "2026-03-04",
    anomalies: [{
      id: "inventory:1:2026-03-04", type: "inventory", date: "2026-03-04",
      metric: "Stock: Pen", value: 0, baseline: 10, change_percent: -100,
      unit: "units", explanation: "Previous snapshot",
      evidence: [{ date: "2026-03-01", value: 10 }, { date: "2026-03-04", value: 0 }],
    }],
  };
  assert.deepEqual(parseAnomalies(response), response);
  assert.deepEqual(parseAnomalies({ ...response, anomalies: [] }).anomalies, []);
});

test("malformed anomaly evidence and missing values are rejected", () => {
  const base = {
    id: "sales:revenue:2026-03-04", type: "sales", date: "2026-03-04", metric: "Sales",
    value: 150, baseline: 100, change_percent: 50, unit: "currency", explanation: "Previous days",
    evidence: [{ date: "2026-03-01", value: 100 }, { date: "2026-03-04", value: 150 }],
  };
  const wrap = (item: unknown) => ({ start_date: "2026-03-01", end_date: "2026-03-04", anomalies: [item] });
  assert.throws(() => parseAnomalies(wrap({ ...base, baseline: 0 })), /invalid anomalies/);
  assert.throws(() => parseAnomalies(wrap({ ...base, change_percent: null })), /invalid anomalies/);
  assert.throws(() => parseAnomalies(wrap({ ...base, evidence: [{ date: "2026-02-30", value: 100 }, base.evidence[1]] })), /invalid anomaly evidence/);
});
