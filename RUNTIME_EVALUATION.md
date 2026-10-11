# Rendering runtime evaluation

**Decision — 2026-10-11:** use the native Canvas runtime on every device and remove p5.js. The user reported that desktop browser testing consistently selected Canvas and explicitly authorized removal. This supersedes the provisional recommendation to retain both runtimes; it does not claim a matched performance or pixel comparison.

## Implementation

The CDN loader, `document.write`, p5 availability branch, and fallback-only naming are removed. `js/ui.js` installs the Canvas runtime after the ordered app scripts define their dependencies. The scene starts once at `DOMContentLoaded`, or immediately if the document is already ready. Repeated installation cannot create another scene or animation loop.

The existing native Canvas helpers remain together in `js/rain.js`:

| Helper | Retained use |
| --- | --- |
| `createCanvas`, `pixelDensity(1)` | Main Canvas creation, fixed raster density |
| `createGraphics` | Glyph atlases, cached halos, vignette; disposal releases raster dimensions |
| `frameRate` | Target 60 FPS on desktop; 30 FPS for touch/coarse-pointer devices |
| `millis` | Elapsed timing, simulation step clock, click debounce |
| `background`, `resizeCanvas` | Clear frame and resize main raster |
| `width`, `height`, `windowWidth`, `windowHeight`, `drawingContext` | Canvas dimensions and native drawing context |
| `setup`, `draw`, `windowResized` | Runtime lifecycle callbacks |

Glyph drawing, transforms, compositing, gradients, patterns, and randomness already use native Canvas and `Math.random`. Native pointers share CRT coordinate mapping. Simulation advancement remains separate from rendering; pause, font arrival, and resize preserve that behavior. Resize repaints both outputs synchronously without advancing simulation.

The CRT WebGL implementation is independent of the removed library. Desktop still attempts WebGL CRT processing with a Canvas fallback, while touch devices use Canvas CRT processing. The retained `preserveDrawingBuffer` setting is unchanged.

Direct opening and local serving require no rendering-library download. Optional Google Fonts still require network access, with system fonts available offline.

## Verification and limits

- All twelve dependency-free regression groups pass after removal, including desktop/mobile startup, settings, paused rendering, lane spacing, overlapping pulses, resize identity and immediate repaint, CRT sampling/coverage, gestures, shortcuts, audio routing, and reduced-motion logic.
- Startup checks reject `document.write` and confirm repeated installation/readiness does not reseed the scene or create duplicate canvases. All app scripts and the regression file pass Node syntax checks.
- Earlier live Canvas checks exercised all four profiles, all CRT modes, paused appearance and zoom, bloom/grain, focused shortcuts, defaults, and manual surge/breach without observed warnings or errors.
- User testing selected Canvas online and offline in desktop Firefox and Chrome. User audio, actual-phone gestures, maximum-density performance, font loading, and Slow 3G paused-font-arrival checks passed on Canvas.
- No matched p5/Canvas timing, CPU, resource-growth, or pixel comparison was performed. This removal follows the user's decision based on the exercised Canvas path. Actual frame cadence remains subject to the existing animation-frame scheduler and display refresh rate.
- Updated resize appearance, curved-edge visual pointer alignment, reduced-motion browser behavior, and a fresh post-removal browser pass remain pending. Automated Canvas and audio mocks do not establish appearance, GPU performance, or audible output.
