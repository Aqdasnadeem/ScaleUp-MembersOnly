# Real curl output (P2-08-BE)

Server: `py -m uvicorn app.main:app`. Email below is a throwaway test address.

```
$ curl -i -X POST /auth/signup  (new business + user)
HTTP/1.1 201 Created
date: Wed, 04 Nov 2026 19:36:52 GMT
server: uvicorn
content-length: 381
content-type: application/json
vary: Origin

{"access_token":"<token cut>","token_type":"bearer","business_id":"246c6a2c-4a26-46c9-b5a2-c54ea6d9e975","business_name":"Demo Shop"}
```

```
$ curl -i -X POST /auth/signup  (same email again)
HTTP/1.1 409 Conflict
date: Wed, 04 Nov 2026 19:36:52 GMT
server: uvicorn
content-length: 45
content-type: application/json
vary: Origin

{"detail":"this email is already registered"}
```

```
$ curl -i -X POST /auth/login  (WRONG password)
HTTP/1.1 401 Unauthorized
date: Wed, 04 Nov 2026 19:36:52 GMT
server: uvicorn
content-length: 40
content-type: application/json
vary: Origin

{"detail":"Incorrect email or password"}
```

```
$ curl -i -X POST /auth/login  (unknown email: same answer)
HTTP/1.1 401 Unauthorized
date: Wed, 04 Nov 2026 19:36:52 GMT
server: uvicorn
content-length: 40
content-type: application/json
vary: Origin

{"detail":"Incorrect email or password"}
```

```
$ curl -i -X POST /auth/login  (correct)
HTTP/1.1 200 OK
date: Wed, 04 Nov 2026 19:36:52 GMT
server: uvicorn
content-length: 381
content-type: application/json
vary: Origin

{"access_token":"<token cut>","token_type":"bearer","business_id":"246c6a2c-4a26-46c9-b5a2-c54ea6d9e975","business_name":"Demo Shop"}
```

```
$ curl -i /uploads/<id> without a token
HTTP/1.1 401 Unauthorized
date: Wed, 04 Nov 2026 19:36:52 GMT
server: uvicorn
content-length: 26
content-type: application/json
vary: Origin

{"detail":"missing token"}
```

