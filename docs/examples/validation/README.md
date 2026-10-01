# Uplink, optic and timing validation runs

Catalog 2026.10.01b: optic.ca 25G/100G optics and cables (NETGEAR KB 000066694), the M4500 series (DS-M4500-3Apr26) with its NETGEAR 40G/100G optics and DACs, PR460X without DAC, per-device `Timing` (PTP-BC / AVB) and `Min_Uplink_Gbps` = 10. Optics and cables must be listed in the Compatibility sheet for both ends of a link. Each PDF is the standard design report for that scenario. Unless a scenario says otherwise, runs use a single core, line-rate, Americas, no redundant power, no gateway and 0% spare ports.

Regenerate after any catalog or engine change:

```
node tools/build.js                 # rebuild index.html
node tools/validation/run.js        # text summary of every scenario
npm i --no-save puppeteer-core && node tools/validation/pdfs.js   # PDFs (needs Google Chrome)
node tools/catalog_from_xlsx.js --check   # JSON still matches the workbook (needs xlsx@0.18.5)
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
| V12 | Six 60G closets, redundant core | 8 × 25G SR (optic.ca); 2 × M4500-48XF8C core, 100G DAC between cores | OK: was "no core fits" before the M4500 |
| V13 | Europe, TAA, redundant power | 25G uplinks; Closet 3 on 2 × M4350-24M4X4V (redundant PSU PoE budget) | OK |
| V14 | Dante audio only | M4250 everywhere, 10G uplinks | OK: audio on 1G switches |
| V15 | AVB / Milan, 96 devices | M4350-48G4XF (AVB over LAG works); small room on M4250 with 1 uplink | OK |
| V16 | ST 2110 + 1G video | Boundary clock switch and core for 2110; M4250 for the rest | OK |
| V17 | Dante on stream basis | M4250 with 10G uplinks (was 2 × 1G before `Min_Uplink_Gbps`) | OK |
| V18 | Six rooms of 40 × 10G fiber, redundant core | M4500-48XF8C leaves, 8 × 100G (ACM761); 2 × M4500-32C, 4 × 100G DAC between cores | OK: spine and leaf as in the datasheet |
| V19 | Ten 200G closets, single core | M4350-40X4C, 2 × 100G (optic.ca SR4, since ACM761 is M4500 only); M4500-32C core | OK |
| V20 | PR460X gateway, M4350 core | Router link: 2 × AXM761 + LC patch cord note, no DAC | OK |
| V21 | PR460X gateway, M4500 core | Same AXM761 link; 2 × M4500-48XF8C core | OK |
| V22 | Two rooms of 20 × 25G fiber | M4500-48XF8C, 8 × 100G (ACM761); M4500-32C core | OK |
| V23 | 12 × 100G plus a 10G closet | No core fits | Known gap: needs QSFP28 breakout on the core |
| V24 | 100G closets with gateway | M4350-40X4C, 4 × 100G; M4500-32C core. PR460X on a free 10G copper port of the Closet 1 switch (Cat6a, 100 m) | OK: the core has no 10G port, so the router goes on a closet switch |
| V25 | Default demo design, gateway on | Core M4350-24F4V: 23 of 28 ports (8 × 10G DAC main room, 8 × 10G Closet 1, 6 × 10G Closet 2, 1 × 10G router). Core-end optics booked in the core location | OK |

Without list prices, every comparison uses the estimated score in `docs/design-logic.md`. V01, V02 and V09 are the runs most likely to change once prices are in.
