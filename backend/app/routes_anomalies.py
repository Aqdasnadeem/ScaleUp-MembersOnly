"""P2-29: Business-scoped anomaly API."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import current_business_id
from .routes_uploads import get_conn
from .anomalies import run_detection

router = APIRouter(prefix="/anomalies", tags=["anomalies"])

VALID_TYPES = ("sales", "inventory", "expense")


def serialize_anomaly(row):
    anomaly_id, anomaly_type, severity, metric_date, observed, expected, evidence, detected_at = row

    size_pct = None
    if expected is not None and float(expected) != 0:
        size_pct = round(
            (float(observed) - float(expected)) / float(expected) * 100,
            2,
        )

    return {
        "anomaly_id": anomaly_id,
        "type": anomaly_type,
        "severity": severity,
        "metric_date": metric_date,
        "observed_value": observed,
        "expected_value": expected,
        "size_pct": size_pct,
        "evidence": evidence,
        "detected_at": detected_at,
    }


@router.get("")
def list_anomalies(
    anomaly_type: str | None = Query(default=None, alias="type"),
    conn=Depends(get_conn),
    biz: uuid.UUID = Depends(current_business_id),
):
    if anomaly_type is not None and anomaly_type not in VALID_TYPES:
        raise HTTPException(422, "Invalid anomaly type")

    biz = str(biz)
    cur = conn.cursor()

    # Counts always include all anomaly types, even when the list is filtered.
    counts = {item: 0 for item in VALID_TYPES}
    cur.execute(
        """
        SELECT anomaly_type, COUNT(*)
        FROM anomalies
        WHERE business_id = %s
        GROUP BY anomaly_type
        """,
        (biz,),
    )
    for item, count in cur.fetchall():
        counts[item] = count

    sql = """
        SELECT anomaly_id, anomaly_type, severity, metric_date,
               observed_value, expected_value, evidence, detected_at
        FROM anomalies
        WHERE business_id = %s
    """
    params = [biz]

    if anomaly_type:
        sql += " AND anomaly_type = %s"
        params.append(anomaly_type)

    sql += " ORDER BY detected_at DESC, anomaly_id DESC"

    cur.execute(sql, tuple(params))
    anomalies = [serialize_anomaly(row) for row in cur.fetchall()]

    return {"counts": counts, "anomalies": anomalies}


@router.get("/{anomaly_id}")
def get_anomaly(
    anomaly_id: int,
    conn=Depends(get_conn),
    biz: uuid.UUID = Depends(current_business_id),
):
    biz = str(biz)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT anomaly_id, anomaly_type, severity, metric_date,
               observed_value, expected_value, evidence, detected_at
        FROM anomalies
        WHERE anomaly_id = %s AND business_id = %s
        """,
        (anomaly_id, biz),
    )
    row = cur.fetchone()

    if row is None:
        raise HTTPException(404, "Anomaly not found")

    return serialize_anomaly(row)


@router.post("/run")
def run_anomaly_detection(
    conn=Depends(get_conn),
    biz: uuid.UUID = Depends(current_business_id),
):
    result = run_detection(conn, str(biz))
    return {"status": "completed", **result}
