# Do the tests catch bugs? (mutation check)
I put 10 deliberate bugs into etl.py one at a time and ran the suite. All 10 were caught by at least one test.
(One was missed at first: a replace that commits before loading. A crash-during-load test was added and now catches it.)

| Deliberate bug | Tests that failed |
| --- | --- |
| bad-row limit 30% instead of 20% | 2 |
| no ON CONFLICT on sales | 1 |
| lenient number parser (strips letters) | 13 |
| expenses hash without occurrence number | 2 |
| returns accepted (no quantity > 0 check) | 7 |
| no advisory lock (duplicate-upload race) | 1 |
| no date range check | 2 |
| duplicate-file check ignores business | 1 |
| replace commits before load | 0, then 1 after adding the crash test |
| products: last row wins instead of first | 1 |
