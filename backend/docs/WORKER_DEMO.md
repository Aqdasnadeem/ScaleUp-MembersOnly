# Real run: API + worker started separately (py -m uvicorn app.main:app  and  py -m app.worker)
```
$ curl -X POST /uploads   (10,000-row sales CSV)
{"job_id":"d5314a96-9b85-478e-addb-97b747a5bc71","status":"pending"}
$ curl /uploads/d5314a96-9b85-478e-addb-97b747a5bc71   -> processing loaded 0 rejected 0
$ curl /uploads/d5314a96-9b85-478e-addb-97b747a5bc71   -> completed loaded 10000 rejected 0
$ curl /uploads/d5314a96-9b85-478e-addb-97b747a5bc71   -> completed loaded 10000 rejected 0
$ curl /uploads/d5314a96-9b85-478e-addb-97b747a5bc71   -> completed loaded 10000 rejected 0
$ curl /uploads/d5314a96-9b85-478e-addb-97b747a5bc71   -> completed loaded 10000 rejected 0
$ curl /uploads/d5314a96-9b85-478e-addb-97b747a5bc71   -> completed loaded 10000 rejected 0

--- worker log ---
worker started; 0 interrupted job(s) put back to pending
job d5314a96-9b85-478e-addb-97b747a5bc71 -> completed (loaded 10000, bad rows 0, attempts 1)
```
