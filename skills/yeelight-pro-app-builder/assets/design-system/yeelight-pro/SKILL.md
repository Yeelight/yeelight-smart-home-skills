---
name: yeelight-pro-product-design
description: Use this skill to generate production or prototype Yeelight PRO smart-home interfaces with the bundled tokens, components, interaction contracts, and adaptive application shells.
user-invocable: true
---

Read `readme.md` and `theme-index.generated.json` before using the token, component, or starting-point files in this directory.

For production code:

- use primitive -> semantic -> component tokens instead of raw colors, shadows, radii, or theme IDs;
- compose the bundled components instead of exposing raw booleans, numeric color values, or CLI payload fields;
- render only capability-proven household or installer operations;
- keep Builder choices out of the generated application;
- preserve keyboard, focus, touch, reduced-motion, responsive, offline, read-only, and recovery contracts;
- treat a preset as production-ready only when its real generation and browser evidence passes the Builder task gates.
