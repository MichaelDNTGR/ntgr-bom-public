# AV Network BoM Builder: how it works

*Proof of concept: design logic, bandwidth and PoE calculations*

The BoM builder turns a list of AV devices per room into a NETGEAR switch design: switches, uplinks, core, power supplies, optics, a bill of materials, a network diagram and a power plan. It is a budgetary estimate; **advised sending the design to the ProAV Design team for further validation**.

For the full decision logic with flowcharts, see [How the BoM builder reaches its design](docs/design-logic.md).

## What the user enters

- **Rooms:** one main equipment room (MDF, holds the core) and any number of closets (IDF), each with fiber distance and type (multimode or single mode).
- **Devices per room:** for example 1G/10G AV-over-IP encoders and decoders, Dante audio, PTZ cameras, touch panels and NETGEAR WiFi 7 access points.
- **Options:** region (SKUs), mains voltage, TAA, redundant power (all switches or main room only), redundant core, switch series (best fit, M4250 or M4350), gateway, support.
- **Design options:** line-rate or stream bandwidth, oversubscription, spare ports (10%), PoE headroom (20%), core-to-core link sizing.

## How switches are chosen

- **Each device needs the right port:** matching speed (1G, 2.5G, 10G, 25G), copper or fiber, and PoE type. A faster port can take a slower device; a 10G copper device without PoE can use an SFP+ port with a 10GBASE-T module (AXM765), but only as a fallback: switches with native copper ports are preferred. Spare ports (10%) are added to the port count, not to the PoE ports.
- **Every eligible switch is tested at 1, 2, 3... units** until it passes all checks: ports, PoE ports and class, PoE budget, and enough fiber ports left for uplinks. Eligible means active, in the chosen series, and TAA-compliant when TAA is on.
- **The best fit wins:** the lowest cost when list prices are in the catalog; otherwise the smallest design that passes, with penalties for extra PSU modules and optics not yet in the catalog. Close alternatives are shown as "Also fits".
- **Mixed rooms are split** when one model cannot serve every device, for example M4250 for 1G devices and M4350 for 10G PoE++ access points.
- **Devices are spread evenly** across a room's switches, and each switch shows its own devices and bandwidth.

## Bandwidth and uplinks

- **Line-rate (default):** every device counts at its full link speed, so the design is non-blocking. Stream mode uses each device's typical stream bandwidth instead.
- **Uplink groups use 1, 2, 4 or 8 links,** so link aggregation (LAG) hashing spreads traffic evenly. The lowest uplink speed that fits is used first (10G before 25G/100G).
- **Redundant core:** each switch has a full-capacity link group to each core switch, so either core can carry all traffic if the other fails. No stacking is used, which keeps AVB and PTP available.

```
Example: 16 × 1G encoders + 8 × Dante devices on one switch
  Switch total at line-rate   16 + 8 = 24 Gbps
  Uplink needed per core      24 Gbps / 10G = 2.4, rounded up to 4 × 10G
  Redundant core              4 × 10G to Core A + 4 × 10G to Core B = 8 SFP+ ports
```

- **Core-to-core link** is sized from total traffic: busiest switch (failover), half of all traffic (default) or all traffic. Example: four closets of 40 Gbps each need 100 Gbps between cores, so 4 × 25G.
