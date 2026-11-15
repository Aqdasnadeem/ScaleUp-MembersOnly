# API examples (real output from this build)

Run on the test machine against `scaleup_backend_test`. The token is a JWT signed with the demo secret; in the real app it comes from login (P2-08-BE).

## 1. Preview: columns + suggested mapping (mapping screen)
```
$ curl -s -X POST localhost:8099/uploads/preview -H "Authorization: Bearer <token>" -F upload_type=sales -F file=@sample/bad_sales.csv
{
    "columns": [
        "Order No",
        "Date",
        "SKU",
        "Product",
        "Qty",
        "Unit Price",
        "Customer"
    ],
    "suggested_mapping": {
        "order_id": "Order No",
        "date": "Date",
        "product_code": "SKU",
        "product_name": "Product",
        "quantity": "Qty",
        "unit_price": "Unit Price",
        "customer": "Customer"
    },
    "saved_mapping": null,
    "fields": [
        "order_id",
        "date",
        "product_code",
        "product_name",
        "quantity",
        "unit_price",
        "total",
        "customer",
        "category",
        "cost_price"
    ],
    "required": [
        "order_id",
        "date",
        "quantity"
    ],
    "needs_snapshot_date": false
}
```

## 2. POST /uploads with 10,000 rows: 202 + job_id, time measured by curl
```
$ curl -s -w "\nHTTP %{http_code} in %{time_total}s\n" -X POST localhost:8099/uploads -H "Authorization: Bearer <token>" -F upload_type=sales -F file=@/tmp/sales_10000.csv
{"job_id":"e6c213d3-ec0b-4a28-b260-df754414b2d3","status":"pending"}
HTTP 202 in 0.031722s
```

## 3. GET /uploads/{id} before the worker has run
```
$ curl -s localhost:8099/uploads/e6c213d3-ec0b-4a28-b260-df754414b2d3 -H "Authorization: Bearer <token>"
{
    "job_id": "e6c213d3-ec0b-4a28-b260-df754414b2d3",
    "upload_type": "sales",
    "file_name": "sales_10000.csv",
    "status": "pending",
    "total_rows": 0,
    "loaded_rows": 0,
    "rejected_rows": 0,
    "message": null,
    "error_report": null,
    "created_at": "2026-11-04T19:08:01.207791+00:00",
    "completed_at": null
}
```

## 4. The worker step (P2-51 will do this automatically)
```
$ python -m app.pipeline e6c213d3-ec0b-4a28-b260-df754414b2d3
{'status': 'completed', 'job_id': 'e6c213d3-ec0b-4a28-b260-df754414b2d3', 'loaded': 10000, 'skipped': 0, 'message': ''} bad rows: 0
```

## 5. GET /uploads/{id} after the worker
```
{
    "job_id": "e6c213d3-ec0b-4a28-b260-df754414b2d3",
    "upload_type": "sales",
    "file_name": "sales_10000.csv",
    "status": "completed",
    "total_rows": 10000,
    "loaded_rows": 10000,
    "rejected_rows": 0,
    "message": null,
    "error_report": [],
    "created_at": "2026-11-04T19:08:01.207791+00:00",
    "completed_at": "2026-11-04T19:08:01.792545+00:00"
}
```

## 6. Same file again (different name): warning, nothing created
```
{"warning":"same_file_already_loaded","existing_job_id":"e6c213d3-ec0b-4a28-b260-df754414b2d3","choose":["skip","replace"]}
HTTP 409
```

## 7. No token, wrong type
```
{"detail":"missing token"}  -> HTTP 401
{"detail":"only .csv files are accepted"}  -> HTTP 415
```
