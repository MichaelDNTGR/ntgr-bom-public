# Uplink, optic and timing validation runs

Catalog 2026.10.01 adds the optic.ca 25G/100G optics and cables (NETGEAR KB 000066694), per-device `Timing` (PTP-BC / AVB) and `Min_Uplink_Gbps` = 10. Each PDF is the standard design report for that scenario. Unless a scenario says otherwise, runs use a single core, line-rate, Americas, no redundant power, no gateway and 0% spare ports.

Regenerate after any catalog or engine change:

```
node tools/build.js                 # rebuild index.html
node tools/validation/run.js        # text summary of every scenario
npm i --no-save puppeteer-core && node tools/validation/pdfs.js   # PDFs (needs Google Chrome)
```

| Run | Scenario | Result | Verdict |
|---|---|---|---|
| V01 | Three closets (90G / 80G / 8G), single core | 4 × 25G SR, 8 × 10G, 1 × 10G; core M4350-24F4V | OK: Closet 3 stays on 10G because 25G there would force an M4350-16V4C core |
| V02 | Same, redundant core | 8 × 25G, 8 × 25G, 2 × 10G; 2 × M4350-16V4C, 2 × 100G DAC between cores | OK: 25G halves the optics for Closet 3 (16 instead of 32) on the same core |
| V03 | 90G closet at 150 m multimode | 2 × M4350-8X8F at 8 × 10G SR | OK: no placeholder (25G SR reaches 100 m) |
| V04 | 90G closet at 600 m single mode | 4 × 25G LR (`NGS25G-LR-OC`) | OK |
| V05 | 200G closet, multimode | 8 × 25G SR | OK |
| V06 | 200G closet, 400 m single mode | 8 × 25G LR | OK. PSM4 is now ranked last for 100G |
| V07 | Main-room access switches | 4 × 100G DAC 3 m and 4 × 10G DAC | OK |
| V08 | 25G ST 2110 fiber devices | 2110 devices on M4350-16V4C (boundary clock), 1G encoders on M4250 | OK |
| V09 | 2:1 oversubscription | 45G needed, 8 × 10G | Acceptable; would change with real prices |
| V10 | Stream bandwidth | 4 × M4250-26G4XF, 2 × 10G | OK |
| V11 | M4250 series only | 10G uplinks only | OK |
| V12 | Six 60G closets, redundant core | No core fits | Gap: needs the M4500 in the catalog |
| V13 | Europe, TAA, redundant power | 25G uplinks; Closet 3 on 2 × M4350-24M4X4V (redundant PSU PoE budget) | OK |
| V14 | Dante audio only | M4250 everywhere, 10G uplinks | OK: audio on 1G switches |
| V15 | AVB / Milan, 96 devices | M4350-48G4XF (AVB over LAG works); small room on M4250 with 1 uplink | OK |
| V16 | ST 2110 + 1G video | Boundary clock switch and core for 2110; M4250 for the rest | OK |
| V17 | Dante on stream basis | M4250 with 10G uplinks (was 2 × 1G before `Min_Uplink_Gbps`) | OK |

Without list prices, every comparison uses the estimated score in `docs/design-logic.md`. V01, V02 and V09 are the runs most likely to change once prices are in.
