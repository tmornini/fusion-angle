# TEST-PLAN mitigation — F2

- Section: F2
- Cases: AA-WB-SETUP, WB5, WB5a, WB6–WB19b
- Expected: WB Test Flow READY (Capture named, attrs,
  Archive wired); Create Work Order READY row; work-order
  action screen, claim, transition, archive, 412.
- Observed: Flow created NOT READY (“1 node needs
  attention”). Pointer-capture reconnect did not stick.
  Empty inbox paths (WB1–WB4a, WB20–WB22) passed.
- Suspected layer: MCP
