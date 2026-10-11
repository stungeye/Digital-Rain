# Rendering runtime evaluation

**Status: provisional source inventory of the split app, with limited component checks. TODO task 9 remains pending matched runtime appearance, timing, startup, resize, CPU/frame-time, and mobile comparisons.** No runtime replacement is authorized by this report.

**Provisional recommendation:** retain desktop p5 and the Canvas adapter through the refactor. Evaluate a Canvas-only prototype separately after settings, paused rendering, simulation updates, and native input stabilize. The small dependency surface makes removal plausible, but does not establish equivalent behavior or performance.

## Source inventory

This inventory was reconfirmed against the split `js/rain.js`, `js/crt.js`, and `js/audio.js`. The final integration review added component evidence below; the matched runtime evaluation is still pending.

| Dependency | Retained use |
| --- | --- |
| `createCanvas`, `pixelDensity(1)` | Main Canvas creation, fixed raster density |
| `createGraphics` | Glyph atlases, cached halos, vignette; objects expose `canvas`, `drawingContext`, `pixelDensity`, `clear`, `remove` |
| `frameRate` | Desktop 60 FPS; touch/coarse-pointer devices 30 FPS |
| `millis` | Elapsed timing, simulation step clock, click debounce |
| `background`, `resizeCanvas` | Clear frame and resize main raster |
| `width`, `height`, `windowWidth`, `windowHeight`, `drawingContext` | Canvas dimensions and native drawing context |
| `setup`, `draw`, `windowResized` | Runtime lifecycle callbacks |

Actual glyph drawing, transforms, compositing, gradients, patterns, and randomness use native Canvas and `Math.random`. Native pointer handlers now share the CRT mapping through `visibleToSource`; p5 mouse/touch callbacks and coordinate globals are no longer retained. Export-only `saveCanvas` has been removed.

## Gaps and risks to verify

- Desktop blocks on CDN p5 loading through `document.write`; mobile skips p5 and desktop falls back if it is unavailable. A Canvas-only runtime could remove this dependency; optional Google Fonts would still require network access.
- Adapter startup is at `DOMContentLoaded`; p5 owns its own startup. Ordered extracted scripts must finish defining shared state and classes before either path initializes, exactly once.
- The adapter uses a strict elapsed-time frame skip and resets its last-frame timestamp. Refresh jitter may lower actual cadence; measure rather than assume 60/30 FPS.
- Simulation uses elapsed time capped at 55 ms and refreshes the real clock while paused. `updateSimulation` now owns advancement and effect/mutation updates; drawing uses current state. Grain refresh remains frame-count based, so actual cadence still matters.
- Main adapter Canvas requests `alpha:false`; p5 owns its context settings. Compare final compositing and pixels, particularly CRT presentation.
- Adapter graphics disposal zeros Canvas dimensions; p5 provides its own disposal. Repeated atlas rebuilds, reseeds, and resizes need resource-growth checks.
- Font readiness rebuilds atlases without reseeding and now invalidates rendering. User confirmed the optional font loaded and the Slow 3G paused-arrival test passed on Canvas. Equivalent p5 behavior remains unverified.
- Resize uses actual viewport dimensions, ignores differences below two pixels, preserves existing world objects, adds coverage when needed, and resizes CRT output/vignette. Check orientation and changing mobile browser chrome.
- Native hover and ripple input share CRT correction; Canvas glass conversion now follows the actual three-pixel strip destinations and source dimensions. Verify visual alignment, panel exclusion, and gesture lifecycle in both runtime paths and near curved edges.
- The app's CRT WebGL implementation is separate from p5. Desktop adapter can still use it, while mobile chooses CRT Canvas processing. Keep runtime and CRT comparisons distinct.

## Comparison procedure after integration

1. Record browser, platform, viewport, display refresh rate, font availability, and actual selected runtime/CRT path. Compare desktop p5 and forced adapter at identical settings. Use the same deterministic random sequence in an isolated harness where possible; do not alter production randomness for this evaluation.
2. Inspect all four profiles, bloom/grain, zoom extremes, frozen redraws, delayed-font refresh, ripple/surge/breach, and all CRT modes. Capture matched frozen frames for appearance comparison and inspect animated motion separately.
3. Measure navigation-to-first-frame and actual draw cadence. Collect frame-duration median/p95 and simulation elapsed time over matched default and maximum-density scenes; exclude loading/warmup from steady-state measurements. Measure CPU/task time separately from inter-frame spacing.
4. Repeat resize, reseed, profile switches, and font/atlas rebuilds; check resource growth and retained graphics. Verify startup once, no duplicated listeners, and no console errors.
5. Exercise direct-open and local-server startup, blocked CDN, offline, delayed font, and unavailable WebGL. Record whether offline startup improves and what remains dependent on network access.
6. Test mobile/coarse-pointer 30 FPS, orientation, pan/pinch cancellation, taps, and curved-edge pointer alignment at zoom limits. Identify emulation results separately from real-device evidence.
7. Deliver measured results, appearance findings, remaining risks, and a final retain/remove recommendation. Only then mark TODO task 9 evaluated. If removal is chosen, implement and verify it as a separate authorized change.

## Checks and handoff limits

- Coordinator observed successful split-app startup without browser errors and a paused Deep profile component check. These are limited observations, not a matched p5/adapter comparison.
- The final integration review observed the Canvas adapter at 1280×720 through the live server. All four profiles, flat/scan/glass modes, paused profile/zoom/bloom/grain changes, 65%/200% zoom, focused Space, mute/default controls, Escape focus restoration, and manual surge/breach resuming animation were exercised without observed warnings/errors. Desktop p5 was not exercised; the adapter selection was observed rather than deliberately forced.
- Automated checks passed ordered desktop/mobile adapter startup, repeated maximum-density lane scheduling, and Canvas CRT inverse coordinates against actual strip destinations at top/middle/bottom rows. Audio and CRT scripts passed syntax checks.
- Twelve regression groups now pass. Startup dispatches `DOMContentLoaded` and checks one main Canvas with no audio activation. Additional checks cover persistent resize, paused-pointer suppression, CRT full-viewport coverage, overlapping pulses without repeated mutation or twinkle extension, bounded pulse ownership, retained offscreen update culling, first shortcut audio activation, shortcut exclusions, removed D/S/V keys, reset/UI synchronization, and mute restoration. The integration review fixed a single last-pulse marker that previously let overlapping fronts reapply their cell effects every update.
- Audio routing checks passed continuous-source gating through `ambientBus`, no ambient master bypass, isolation from LFO gain modulation, retained source modulation, ambient/score enablement, score pause, exact zero gate in effects/off, and mute restoration. Scheduled Code Hum voices also use the group; score, UI Foley, and cinematic voices bypass it. Original volume calibration remains unchanged.
- `preserveDrawingBuffer` remains enabled because retained display behavior after changing it has not been verified.
- The user subsequently reported audio verification, actual-device phone gesture tests, and maximum-density performance checks passed. Comprehensive updated browser input/appearance checks, performance traces and matched runtime comparisons remain pending. The automated graph checks establish routing behavior, not audible output.

Keep both runtime paths for this change. The integration checks support the refactor, but do not support replacing p5 or marking TODO task 9 complete. Complete the matched comparison procedure before making that separate architectural change.
