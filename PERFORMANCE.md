# Performance profiling and optimization — October 12, 2026

This follow-up compares against `fa2c771`, after the earlier beat/rendering pass below. The principal cost is rendering and presentation, especially the thousands of transformed tunnel glyph/halo draws. Ordinary simulation is small; audio scheduling and retained resources do not show an accumulating leak in the exercised workloads.

## Accepted changes

- Reuse one 128 × 128 film `ImageData`. Every channel and every random call is preserved. This retains 64 KiB and removes 64 KiB of allocation every third animated frame: 1.25 MiB/s at 60 FPS or 0.625 MiB/s at 30 FPS. Diagnostics record zero new film pixel-buffer allocations after startup, versus 50 during the baseline's 150-frame instrumented pass.
- Calculate the electric-surge front once per visible lane in cell updates and glyph rendering. It depends on lane position and effect age, so calculating it again for each cell repeats the same three sine evaluations. During the surge workload, desktop WebGL simulation median falls from 0.3 to 0.2 ms and p95 from 0.7 to 0.5 ms; desktop Canvas simulation median falls from 0.4 to 0.3 ms. Total-frame savings are about 0.1 ms.
- Convert tunnel breach coordinates once per glyph, reusing both coordinates from the same result.
- Skip beat-indicator style writes when energy is unchanged, and read the existing state object rather than cloning settings on every indicator tick. The twelve indicators previously received 24 style writes roughly 30 times per second even during silence. They now initialize once and update when their displayed energy changes. This is verified by operation counts; the rendering benchmark disables the independent UI animation clock, so its timing table does not measure this benefit.
- Automatically bypass CRT curvature in the tunnel, retaining scanlines and the saved rain setting. Pointer mapping follows the flat output, and the curvature control explains the behavior and becomes unavailable during tunnel flight. Returning to rain restores its curvature. Canvas presentation uses one source draw rather than 282 strips at 844 pixels high or 360 at 1080 pixels high. Rain with curvature set to zero also uses the direct draw. Presentation reads dimensions after any required resize.

The production changes retain the existing Canvas renderer, atlases, bounded tunnel cache, simulation ownership and audio synthesis. No runtime dependency is added.

## Controlled frame measurements

Host: Windows, Core i9-13950HX, Edge 155.0.4283.45, NVIDIA RTX 4080 Laptop GPU through ANGLE/D3D11. Each revision gets a fresh browser context, a fixed random seed, blocked optional fonts, 60 warmup frames and 180 measured frames. Each case is repeated three times, alternating reference/working order. Source uses defaults; stress uses Overdrive, density 1.65 and speed 2.4. A deterministic beat envelope drives visuals while actual audio is measured separately.

Desktop WebGL uses 1920 × 1080 with touch detection disabled. Touch emulation uses 390 × 844 and Canvas CRT. Desktop Canvas uses 1920 × 1080 with coarse input, covering the fallback selected by the live local-server smoke check. Simulation steps match the app's 60/30 FPS targets; one/two browser refresh callbacks separate samples. Those callbacks follow the host refresh rate, so recorded intervals are also included in the report.

The table reports milliseconds of main-thread simulation plus Canvas/CRT submission and any synchronous work those calls incur. Each entry is the median of three run medians or three run p95 values, respectively. Small differences near 0.1 ms should be treated as measurement variation. Full per-run median/p95/p99 and interval results, including flat-output controls, are in [comparison.json](tests/perf-results/comparison.json).

| Configuration | Scene | Median before | Median after | p95 before | p95 after |
| --- | --- | ---: | ---: | ---: | ---: |
| Desktop WebGL | Rain | 3.5 | 3.6 | 4.1 | 4.1 |
| Desktop WebGL | Rain stress | 4.9 | 5.0 | 5.5 | 5.6 |
| Desktop WebGL | Tunnel | 15.3 | 15.3 | 18.0 | 17.6 |
| Desktop WebGL | Tunnel stress | 11.4 | 11.5 | 13.7 | 13.3 |
| Touch emulation | Rain | 0.9 | 0.9 | 1.2 | 1.1 |
| Touch emulation | Rain stress | 1.4 | 1.4 | 1.6 | 1.7 |
| Touch emulation | Tunnel | 13.2 | 12.5 | 15.5 | 14.7 |
| Touch emulation | Tunnel stress | 9.4 | 9.1 | 10.7 | 10.3 |
| Desktop Canvas | Rain | 3.0 | 3.0 | 3.5 | 3.5 |
| Desktop Canvas | Rain stress | 5.9 | 5.9 | 6.6 | 6.6 |
| Desktop Canvas | Tunnel | 11.9 | 11.6 | 13.6 | 13.4 |
| Desktop Canvas | Tunnel stress | 9.3 | 8.7 | 10.6 | 9.9 |

Canvas tunnel medians improve approximately 2.5–6.5%. WebGL and ordinary rain timings remain near baseline. [surge-comparison.json](tests/perf-results/surge-comparison.json) separately covers complete recurring surge effects, with stable event identities between triggers, three repetitions and 120 measured frames after warmup.

## CPU, GPU and memory findings

Component timing and CPU sampling run in separate instrumented contexts, so their overhead is excluded from the comparison table. Timed components include film generation, cell updates, bloom, glyph drawing, tunnel rendering and CRT presentation. In the instrumented desktop stress pass, tunnel rendering averages about 11.6 ms per frame and submits about 6,400 glyph/halo draws. The hidden rain remains stationary during flight. This is still the main rendering cost.

Valid, non-disjoint WebGL timer queries report CRT command median/p95 of 0.130/0.177 ms for stress rain and 0.123/0.191 ms for stress tunnel. These queries cover the CRT WebGL command stream; Canvas rasterization, browser compositing and whole-device GPU utilization require separate tracing. CPU-side CRT calls can take longer while performing or waiting for source work. A 1080p CRT update covers a nominal 8,294,400-byte RGBA image; the browser may use GPU surface copies rather than a CPU transfer.

Logical canvas backing areas, including atlases, vignette, main/output canvases, halos and grain, total about 34.3 MiB for desktop WebGL, 29.7 MiB for desktop Canvas and 9.8 MiB for touch emulation. WebGL adds a nominal 7.9 MiB CRT texture. Actual driver allocations, extra buffers and format choices can differ. The retained film pixel buffer adds 64 KiB separately.

An accelerated ten-minute soak advances simulation at 30 steps per simulated second and presents once per simulated second. It checks retention rather than real-time FPS or every-frame allocation behavior. At the beginning, five minutes and ten minutes, tunnel storage remains 256 rows / 417,792 typed-array bytes, plus object overhead, with hidden rain counts unchanged. Stress rain counts fluctuate around 7,200–7,600 desktop WebGL cells, 2,200–2,400 touch cells and 12,600–12,900 desktop Canvas cells. Desktop coarse input deliberately keeps a wider pannable world. Resizing retains the largest encountered world to preserve stream identities; reset/reseed releases that history.

The report includes forced-GC heap readings. Their before/after difference includes warmup, JIT/instrumentation state and normal cache population; it is not a leak-rate estimate. The retained-object snapshots and bounded-cache checks provide the stronger evidence here.

## Audio and cold work

At the native 48 kHz rate, the 27.7-second mono noise buffer occupies 5,318,400 bytes. Production Foley controls permit 68 cached variants, approximately 2.01 MiB if every detent/type is used. Six exercised variants occupy 318,148 bytes.

Five seconds per score profile show scheduler p95 of 0.1–0.7 ms, with a peak of 60 transient sources across the sequential profile run. All tracked transient sources finish after muting and waiting for their tails. Existing cleanup tests verify the associated graph nodes also disconnect. Ten persistent ambience sources remain started after initialization, including during SFX-only/muted operation; their steady DSP cost was not established by this main-thread benchmark.

First audio activation measured 64 ms in the exploratory baseline and 283 ms in the later diagnostics, including context construction, noise generation and persistent graph setup. Cold Foley synthesis takes about 0.7–9 ms in the final pass; cached calls are below the timer's 0.1 ms resolution. The large variation in audio startup calls merits dedicated cold-start measurement before changing lifecycle behavior. Score compositions, sample rate, scheduling defaults and approved sound envelopes remain unchanged.

## Rejected experiments and verification

- Reusable CRT texture storage plus disabled drawing-buffer preservation produced no convincing frame-time gain in alternating runs. The original WebGL path was retained. Results: [texture-experiment.json](tests/perf-results/texture-experiment.json).
- Cached `Path2D` scanline batching saved at most about 0.1 ms in the exercised rain cases, but altered fallback brightness: the largest normalized RGB image difference was 0.00408. It was removed. Results: [scanline-experiment.json](tests/perf-results/scanline-experiment.json), [scanline-visual-experiment.json](tests/perf-results/scanline-visual-experiment.json). The original individual scanline rectangles remain.

The dependency-free regression suite passes, covering buffer refreshes, style-write suppression, curvature restoration and pointer mapping alongside the existing scheduling, ownership, pause, reset and audio checks. The browser verifier passes 240 seeded source images including animated grain, all profiles, three zooms and representative effects; 104 CRT screenshot comparisons; 192 exact paused-retention comparisons; shrink/regrow in both scenes; and 108 mapped pointer samples. All source images match exactly; the largest normalized CRT difference is below 0.000000452. Tunnel reference CRT uses its historical scan output to reflect the authorized curvature change. Results: [visual.json](tests/perf-results/visual.json). The live page at `http://127.0.0.1:5500/` was also checked for scene switching, pause and restoring the saved curvature.

These are local Edge measurements and touch emulation. Real phone hardware, Firefox, actual GPU presentation latency, external font rendering and audible/dropout-free playback remain outside the verified scope.

## Repeating this pass

Optional tooling needs Playwright, installed Edge and `pngjs` for image comparison, resolvable through Node or `NODE_PATH`. `PERF_BROWSER=chrome` selects installed Chrome. The application itself stays dependency-free.

```text
node tests/checks.js
node tests/profile.js --compare fa2c771 --desktop-canvas --runs 3 --frames 180 --diagnostics --output comparison.json
node tests/profile.js --compare fa2c771 --effects --desktop-canvas --case rain-surge --runs 3 --frames 120 --output surge-comparison.json
node tests/visual-perf.js --compare fa2c771 --output visual.json
```

`--case` filters configuration names. `--effects` profiles recurring surge, breach and ripple workloads. Run timings without other profiling/browser workloads in parallel. [baseline-profile.json](tests/perf-results/baseline-profile.json) records the exploratory component/allocation audit; its earlier surface-size estimate is superseded by `canvasSurfaceBytes`/`crtTextureBytes` in the final report.

---

# Earlier beat responsiveness and rendering pass — October 12, 2026

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
