# Diagrams for P2-17, P2-18, P2-21 (copy this whole folder to `docs/diagrams/` of the backend repo)

| Ticket | Image / PDF | Source (editable) | Check against the criteria |
| --- | --- | --- | --- |
| **P2-17** Use case diagram | `ScaleUp_UseCase.png`, `.pdf` | `usecase.dot` (+ `actor.png`) | see below |
| **P2-18** DFD Level 0 and Level 1 | `ScaleUp_DFD_Level0.png/.pdf`, `ScaleUp_DFD_Level1.png/.pdf` | `dfd_level0.dot`, `dfd_level1.dot` | see below |
| **P2-21** Sequence diagram | `ScaleUp_Sequence_Upload.png/.pdf/.svg` | `sequence_upload.mmd` | see below |

Re-draw after a change: `dot -Tpng -Gdpi=150 usecase.dot -o ScaleUp_UseCase.png` (Graphviz) and `mmdc -i sequence_upload.mmd -o ScaleUp_Sequence_Upload.png -w 1800 -s 2 -b white` (Mermaid CLI). The .mmd file also renders on GitHub and in https://mermaid.live.

## P2-17 Use case diagram: use case -> FR ID (taken from SRS section 7)
| Use case | Actor | FR IDs |
| --- | --- | --- |
| UC-01 Sign up and log in | Business user | FR-AUTH-01 to 04 |
| UC-02 Upload a data file (includes UC-03, UC-04) | Business user | FR-UP-01 to 04, FR-UP-07 |
| UC-03 Map file columns | Business user | FR-UP-05, FR-UP-06 |
| UC-04 Validate, clean and load a file | Background worker «system» | FR-ETL-01 to 07 |
| UC-05 Resolve a repeated file (extends UC-04) | Business user | FR-UP-08, FR-ETL-08 |
| UC-06 View import result and bad rows | Business user | FR-UP-09 |
| UC-07 View sales, inventory and expense dashboards | Business user | FR-DASH-01 to 07 |
| UC-08 Detect anomalies | Scheduler «time» | FR-ANOM-01, 02 |
| UC-09 Review anomalies and evidence | Business user | FR-ANOM-03 |
| UC-10 Analyse feedback | Background worker «system» | FR-NLP-01 to 03 |
| UC-11 Search feedback by meaning (includes UC-10 results) | Business user | FR-NLP-04 |
| UC-12 Ask the agent a question (includes UC-13) | Business user | FR-AGENT-01 to 06 |
| UC-13 Call Gemini with tools | Gemini API «external» | FR-AGENT-02, 03 |
| UC-14 View question history | Business user | FR-AGENT-05 |

Criteria: every use case has at least one FR (table above); non-human actors are marked «system», «time» and «external» in the picture; a legend is in the picture. Sir's notes: no Admin actor (none drawn), Gemini API kept as a secondary actor (right side).
Note: SRS section 7 says UC-11 "includes UC-10 results" and UC-04 "extended by UC-05"; the diagram follows that text. If the SRS changes, change the .dot file too.

## P2-18 DFD: how Level 1 balances with Level 0
Level 0 has one process and two external entities (Business user, Gemini API) and ten flows F1 to F10. Level 1 splits process 0 into 1.0 to 6.0 and draws **exactly the same ten flows** F1 to F10 between the same two external entities and the processes:

| Flow | Data | Level 0 | Level 1 (process that sends / receives it) |
| --- | --- | --- | --- |
| F1 | sign-up details, login credentials | user -> 0 | user -> 1.0 |
| F2 | CSV file, upload type, column mapping, as-of date, skip/replace choice | user -> 0 | user -> 2.0 |
| F3 | business question | user -> 0 | user -> 6.0 |
| F4 | view requests (dashboard, anomalies, import result, question history) | user -> 0 | user -> 4.0 (dashboard, anomalies; import result is read by 2.0 via F6; history via F8) |
| F5 | login token, account confirmation | 0 -> user | 1.0 -> user |
| F6 | job status, import result, bad-row report | 0 -> user | 2.0 -> user |
| F7 | dashboards, KPIs, alerts, anomalies with evidence | 0 -> user | 4.0 -> user |
| F8 | answer with evidence, question history | 0 -> user | 6.0 -> user |
| F9 | prompt and tool results | 0 -> Gemini | 6.0 -> Gemini |
| F10 | tool-call requests, answer text | Gemini -> 0 | Gemini -> 6.0 |

Data stores (numbered): D1 businesses, users; D2 ingestion_jobs, column_mappings; D3 uploaded CSV files; D4 sales, inventory, expenses, products, customers; D5 feedback (+ embeddings, planned M5); D6 summary tables and anomalies (planned M4); D7 question history (planned M6). D1, D2, D4 and the feedback table already exist in migrations 001 to 003; D3 is file storage; D6, D7 and embeddings are marked "planned" in the picture.
Known simplification: the scheduled anomaly job and the background worker are internal (processes 4.0 and 3.0), not external entities; the Scheduler of the use case diagram is therefore not drawn in the DFD.

## P2-21 Sequence diagram: what it shows
Only the 7 Nov scenario (sales CSV): preview and mapping, POST /uploads, the worker (validate -> clean -> load), polling with GET /uploads/{id}, result. Messages are numbered (autonumber) and named like the real endpoints and functions (`POST /uploads`, `check_mapping()`, `validate_rows()`, `bulk_load()` ...); replies are dashed arrows; there are two alt boxes (the upload step: wrong type or too big / mapping mismatch / same content / new file; the worker step: more than 20% bad rows fails with nothing loaded, else load) and a loop for the polling.
Three honest points: (1) `take_next_job()` is in `backend/app/worker.py` (P2-51). (2) "replace" for a repeated file is not wired yet (OI-9), so the diagram offers skip only. (3) Login is not repeated; every call carries the JWT from P2-08.
