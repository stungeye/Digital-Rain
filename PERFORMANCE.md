# Beat responsiveness and rendering pass — October 12, 2026

The tunnel repeated lane seeds, stream periods, head positions and lengths for every depth row. It also continued advancing and mutating the hidden rain world. Per-glyph Canvas save/translate/rotate/restore calls added more submission work. The shared beat envelope used the audio graph's rendering clock and lifted tunnel decay with a fractional power, which could put lighting ahead of audible hits and reduce contrast between successive attacks.

The pass makes these changes:

- Beat sampling prefers `AudioContext.getOutputTimestamp()` and extrapolates to the current performance clock. Invalid, startup or stale timestamps fall back to finite reported processing/output latencies. The master compressor's 6 ms pre-delay is included. Suspended/interrupted audio returns no beat.
- Attacks hold for 35 ms, then decay at 22 per second with a 220 ms lifetime. Tunnel impact scales the envelope linearly so the release stays distinct. Beat disable and zero impact still gate the response.
- Tunnel lane constants are cached; head/length are calculated once per lane per frame. Camera origin/bank and row twist trigonometry are shared. Glyphs use a direct Canvas transform with one surrounding save/restore for the tunnel.
- Wall seeds and the latest glyph lookup per cell use a 256-row cache (about 408 KiB of typed-array data plus object/map overhead). Caching by wall row avoids exploding the working set as mutation offsets diverge during long sessions. Reseed/reset clears it.
- Rain updates rest during tunnel flight, retaining stream/cell identities. Rain reuses stream arrays when retiring trails, culls offscreen bloom lanes before traversing streams, and calculates the trail falloff exponent once per plane draw.

The output clock and compressor delay follow the [Web Audio specification](https://www.w3.org/TR/webaudio/#dom-audiocontext-getoutputtimestamp) and its [compressor processing definition](https://www.w3.org/TR/webaudio/#DynamicsCompressorNode). Audio synthesis, score compositions, context construction and note look-ahead remain as before.

## Local browser measurements

Compared against `176a343` using headless Microsoft Edge on this Windows host. Desktop uses a 1920 × 1080 viewport with WebGL CRT; touch emulation uses 390 × 844 with Canvas CRT. Optional fonts are blocked for consistent offline glyphs. Each case starts with a fixed random seed, warms up 30 frames and measures 120 frames, yielding to browser refreshes. Score beat input is injected consistently; the real audio scheduler is verified separately. Stress uses Overdrive, maximum density and maximum speed.

Values are milliseconds of main-thread simulation plus rendering submission per frame. They do **not** measure complete GPU presentation latency or establish real-device FPS. Small rain differences are within run-to-run variation.

| Case | Median before | Median after | p95 before | p95 after |
| --- | ---: | ---: | ---: | ---: |
| Desktop rain | 4.1 | 3.9 | 5.7 | 5.0 |
| Desktop rain, stress | 5.7 | 5.4 | 7.3 | 6.3 |
| Desktop tunnel | 24.1 | 18.5 | 28.9 | 21.9 |
| Desktop tunnel, stress | 18.2 | 14.6 | 21.8 | 17.2 |
| Touch rain | 1.3 | 1.3 | 1.8 | 1.7 |
| Touch rain, stress | 1.6 | 1.7 | 2.2 | 2.1 |
| Touch tunnel | 19.2 | 16.2 | 23.7 | 19.1 |
| Touch tunnel, stress | 14.0 | 12.3 | 16.3 | 15.3 |

Tunnel median frame work decreased about 12–23% across these cases. Its hidden-rain update cost dropped from roughly 0.1–0.3 ms to below the timer's median resolution. Rain's principal improvement is audio/visual timing and pulse contrast, rather than a substantial rendering speedup. Remaining tunnel cost is dominated by the many projected Canvas glyph/halo draws.

## Verification

- `node tests/checks.js`: full regression suite, including output-time/fallback envelope checks, bounded long-session cache behavior, hidden-rain preservation, pause and mode switching.
- `node tests/perf.js --verify-ref 176a343`: browser comparisons cover all profiles, 100%/200% zoom, zero/active beat, normal/stress settings and one-hour mutation offsets. At identical geometry/beat inputs the largest normalized pixel difference was below 0.00003, consistent with small transform rasterization differences. Canvas transforms are restored after rendering.
- Browser captures were visually inspected for desktop and touch layouts. Browser verification includes actual Web Audio beat-envelope sampling and pause/mute handling, with desktop WebGL CRT and touch Canvas CRT.
- Browser playback is headless and muted. Audible synchrony, perceived pulse strength, Bluetooth routing, Firefox behavior and dropout-free playback still require listening on the user's devices. These checks do not resolve the earlier Android Firefox audio fault.

## Repeating the checks

`tests/perf.js` is optional tooling and requires Playwright and installed Edge (`PERF_BROWSER=chrome` selects installed Chrome). Use `NODE_PATH` if Playwright is supplied outside the repository. No app dependency or build step is introduced.

```text
node tests/checks.js
node tests/perf.js --ref 176a343 --output before.json
node tests/perf.js --output after.json
node tests/perf.js --verify-ref 176a343 --screenshots captures
```

`--verify-ref` intentionally holds beat input and geometry identical to isolate renderer changes; it does not compare the old and new envelope tuning. The dependency-free clock tests cover that tuning. Touch emulation is still this host's browser, not phone hardware.
