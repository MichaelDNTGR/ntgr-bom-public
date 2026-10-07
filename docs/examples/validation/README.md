# Uplink, optic and timing validation runs

Catalog 2026.10.01b: optic.ca 25G/100G optics and cables (NETGEAR KB 000066694), the M4500 series (DS-M4500-3Apr26) with its NETGEAR 40G/100G optics and DACs, PR460X without DAC, per-device `Timing` (PTP-BC / AVB) and `Min_Uplink_Gbps` = 1 with `Stream_Uplink_Headroom_Pct` = 50, and a collapsed core when the main-room switch can terminate every closet link. Optics and cables must be listed in the Compatibility sheet for both ends of a link. Each PDF is the standard design report for that scenario. Unless a scenario says otherwise, runs use a single core, line-rate, Americas, no redundant power, no gateway and 0% spare ports.

Regenerate after any catalog or engine change:

```
node tools/build.js                 # rebuild index.html
node tools/validation/run.js        # text summary of every scenario
npm i --no-save puppeteer-core && node tools/validation/pdfs.js   # PDFs (needs Google Chrome)
node tools/catalog_from_xlsx.js --check   # JSON still matches the workbook (needs xlsx@0.18.5)
```

Catalog 2026.10.01d, Design priority **Best design** (fewest switches and uplinks; cost is a 30% safety net). Third-party modules are used when no catalog optic reaches a distance. Costs use a relative **cost index** (Products and Accessories `Cost_Index`), derived internally from NETGEAR US list prices and estimates for third-party optics. Relative cost is the BoM total on that index, divided by 1,000 (support excluded). It only compares designs with each other and is not a price.

| Run | Scenario | Core | Room switches and uplinks | Relative cost | Verdict |
|---|---|---|---|---|---|
| V01 | Screenshot case, single core | M4350-32F8V | 1× M4350-24X4V 4×25G; 1× M4350-24X8F8V 4×25G; 1× M4250-8G2XF-PoE+ 1×10G | 334 | OK: Closet 3 moves to 4 × 25G with an M4350-32F8V core (cheaper than 8 × 10G with prices) |
| V02 | Screenshot case, redundant core | 2 × M4350-16V4C | 2 rooms: 1× M4350-24X8F8V 8×25G; 1× M4250-8G2XF-PoE+ 2×10G | 541 | OK |
| V03 | 25G over 150 m multimode | M4350-24F4V | 1× M4350-24X4V 4×25G; 1× M4350-8X8F 4×10G (+ third-party optics) | 126 | OK: 1 switch on 25G with a third-party eSR module instead of 2 switches on 10G |
| V04 | 25G over 600 m single mode | M4350-24F4V | 1× M4350-24X4V 4×25G; 1× M4350-8X8F 4×10G | 190 | OK |
| V05 | Big closet needs 100G, multimode | M4350-32F8V | 1× M4350-24X8F8V 8×25G; 1× M4250-8G2XF-PoE+ 1×10G | 192 | OK |
| V06 | Big closet needs 100G, 400 m single mode | M4350-40F4C | 1× M4350-40X4C 2×100G; 1× M4250-8G2XF-PoE+ 1×10G | 238 | OK: 2 × 100G LR4 instead of 48 × 10G optics |
| V07 | Main room access switches, in-rack | M4350-40F4C | 1× M4350-40X4C 4×100G; 1× M4250-26G4XF-PoE+ 4×10G | 222 | OK |
| V08 | ST 2110 25G fiber endpoints | M4350-40F4C | 1× M4350-16V4C 2×100G; 1× M4250-8G2XF-PoE+ 1×10G | 239 | OK |
| V09 | 2:1 oversubscription | M4350-24F4V | 1× M4350-24X4V 2×25G; 1× M4350-24X8F8V 2×25G | 267 | OK: 2 × 25G per closet at 2:1 |
| V10 | Stream bandwidth basis | M4250-16XF | 2× M4350-48G4XF 4×10G | 149 | OK: stream margin capped at line-rate, 2 larger switches |
| V11 | M4250 series only | M4250-16XF | 1× M4250-40G8XF-PoE+ 4×10G; 1× M4250-26G4XF-PoE+ 2×10G | 110 | OK |
| V12 | Many 10G closets, core port pressure | 2 × M4350-16C | 6 rooms: 1× M4350-40X4C 2×100G | 1,053 | OK by price: 100G closets on M4350-16C cores |
| V13 | Redundant power, TAA, Europe | M4350-32F8V | 1× M4350-24X4V 4×25G; 2× M4350-24M4X4V 2×25G | 348 | OK |
| V14 | Dante audio only | M4250-16XF | 1× M4350-48G4XF 4×10G; 1× M4250-26G4XF-PoE+ 2×10G | 116 | Check: one M4350-48G4XF beats two M4250s by price |
| V15 | AVB / Milan audio, big room | M4350-24F4V | 3× M4350-48G4XF 4×10G; 1× M4250-10G2XF-PoE+ 1×10G | 254 | OK: 3 × 48G4XF (fewer switches) |
| V16 | ST 2110 with PTP boundary clock | M4350-40F4C | 1× M4350-16V4C 2×100G; 1× M4250-8G2XF-PoE+ 1×10G; 1× M4250-26G4XF-PoE+ 2×10G | 274 | OK |
| V17 | Dante audio, stream basis | M4250-16XF | 2× M4350-48G4XF 2×1G | 102 | OK: 2 switches instead of 3 |
| V18 | M4500 spine and leaf, 10G fiber | 2 × M4500-32C | 6 rooms: 1× M4500-48XF8C 8×100G | 2,334 | OK: M4500-48XF8C leaves, as in the datasheet |
| V19 | Ten 200G closets, single core | M4500-32C | 10 rooms: 1× M4350-40X4C 2×100G | 1,671 | OK: 100G closets into an M4500-32C |
| V20 | PR460X gateway | M4350-32F8V | 1× M4350-24X4V 4×25G; 1× M4350-24X8F8V 4×25G | 332 | OK |
| V21 | PR460X gateway, M4500 core | 2 × M4500-48XF8C | 6 rooms: 1× M4350-24X8F8V 8×25G | 1,087 | OK |
| V22 | M4500 as room switch, 25G fiber | M4350-16C | 2 rooms: 1× M4500-48XF8C 8×100G | 808 | OK |
| V23 | Many 100G links plus a 10G closet (known gap) | none | 3× M4350-16V4C 4×100G; 1× M4250-8G2XF-PoE+ 1×10G | 594 | Known gap: needs QSFP28 breakout on the core |
| V24 | 100G closets with gateway, M4500-32C core | M4350-16C | 2× M4350-40X4C 4×100G; 2 rooms: 1× M4350-40X4C 4×100G | 813 | OK |
| V25 | Default demo design | M4350-24F4V | 2× M4350-24M4X4V 2×25G; 2× M4350-24M4X4V 4×10G; 1× M4350-24G4XF 2×10G; 1× M4350-24F4V 4×10G | 468 | OK: one switch model in the main room |
| V26 | 8 Dante, one switch, gateway, redundant power | standalone | 1× M4350-24G4XF | 43 | OK: M4350-24G4XF + PSU module is cheaper than the 8M2V |
| V27 | 8 Dante, one switch, gateway, no redundant power | standalone | 1× M4250-9G1F-PoE+ | 15 | OK |
| V28 | 8 Dante + 1 controller on an M4250-9G1F (fixed), gateway | standalone | 1× M4250-9G1F-PoE+ | 17 | OK |
| V29 | Dante in two rooms, stream basis, collapsed core | M4250-9G1F-PoE+ (main-room switch) | 1× M4250-9G1F-PoE+; 1× M4250-9G1F-PoE+ 1×1G | 24 | OK |
| V30 | Dante + 1G video, line-rate, collapsed core | M4250-8G2XF-PoE+ (main-room switch) | 1× M4250-8G2XF-PoE+; 1× M4250-8G2XF-PoE+ 1×10G | 42 | OK |
| V31 | Router link: best available in main room | M4350-24G4XF (main-room switch) | 1× M4350-24G4XF; 2 rooms: 1× M4350-24G4XF 1×10G | 113 | OK: main-room 24G4XF also core, router on its SFP+ |
| V32 | Router link: 10G required | M4350-24G4XF (main-room switch) | 1× M4350-24G4XF; 2 rooms: 1× M4350-24G4XF 1×10G | 113 | Same as V31: the 24G4XF already has a free 10G port |
| V33 | Overdrive 3 years on the demo design | M4350-24F4V | 2× M4350-24M4X4V 2×25G; 2× M4350-24M4X4V 4×10G; 1× M4350-24G4XF 2×10G; 1× M4350-24F4V 4×10G | 468 | OK: as V25 |
| V34 | Fastlane on an M4500 design | 2 × M4350-16C | 6 rooms: 1× M4350-40X4C 2×100G | 1,053 | OK |
| V35 | Neutrik stage rack, redundant power | M4350-8M2V (main-room switch) | 1× M4350-8M2V; 1× M4350-16M4V 1×25G; 1× M4350-24G4XF 1×10G | 159 | OK |
| V36 | 100G closets, single core | M4500-48XF8C | 4 rooms: 1× M4350-24X8F8V 8×25G | 657 | OK by price: 25G closets into an M4500-48XF8C |
| V37 | ST 2110-30 audio with Dante | standalone | 1× M4350-24M4X4V | 43 | OK |
| V38 | Neutrik stage rack, standard uplink card | M4350-8M2V (main-room switch) | 1× M4350-8M2V; 1× M4350-16M4V 1×25G; 1× M4350-24G4XF 1×10G | 145 | OK |
| V39 | Prefer 25G, one closet beyond multimode reach | M4350-8M2V | 2 rooms: 1× M4350-24M4X4V 1×25G (+ third-party optics) | 132 | OK |
| V40 | 16 x 10G copper encoders in one closet, priced | M4350-32F8V | 1× M4250-26G4XF-PoE+ 1×10G; 1× M4350-24X8F8V 8×25G | 203 | OK: 1 × 24X8F8V on 8 × 25G, not 2 × 8X8F with 32 optics |
| V41 | Long single-mode run, 500G closet | M4350-16C | 1× M4350-40X4C 2×100G; 2× M4350-40X4C 4×100G (+ third-party optics) | 547 | OK: 2 × M4350-40X4C on 100G LR4, not 5 half-empty 24X4V on 25G LR; Closet 1 at 150 m MMF gets a placeholder (use SMF) |
| V42 | 25 × ST 2110 at FOH, boundary clock | 2 × M4350-16C | 4× M4350-16V4C 4×100G | 859 | OK: 8 devices per switch (2 × 100G to each core) |
| V43 | 25 × ST 2110 at FOH, transparent clock allowed | 2 × M4350-16C | 2× M4500-48XF8C 8×100G | 841 | OK with warning: transparent clock, not advised by the datasheet |
| V44 | 12 WiFi 7 APs, full performance | standalone | 1× M4350-24X8F8V | 211 | OK: 10G PoE++ switch, PoE 572 W |
| V45 | 12 WiFi 7 APs on 2.5G and PoE+ | standalone | 1× M4350-24M4X4V | 185 | OK: 2.5G PoE switch, PoE 410 W, warnings for reduced radios and 2.5G backhaul |

V06, V12, V18, V34, V36 and V41 depend most on the estimated third-party optic costs.
