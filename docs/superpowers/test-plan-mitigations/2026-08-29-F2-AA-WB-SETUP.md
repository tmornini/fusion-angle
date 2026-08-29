# TEST-PLAN mitigation — F2

- Section: F2
- Cases: AA-WB-SETUP, WB1, WB3, WB4, WB4a, WB5,
  WB5a, WB6, WB7, WB8, WB9, WB10, WB10a, WB10b,
  WB11, WB16, WB12, WB13, WB13a, WB19, WB19a,
  WB19b, WB14, WB15, WB17, WB18, WB20, WB21
- Expected: F2 Admin signs in on f2.localhost
  and drives the Workbox inbox against the
  slice `WB Test Flow` (reveal `flow_id`).
- Observed: Shared 5/60s authentication
  throttle keyed on 127.0.0.1; authorize 201
  then token 429 (or authorize 429). No
  signed-in F2 session. WB2/WB5b/WB22 passed
  from source, not a live inbox.
- Suspected layer: API
