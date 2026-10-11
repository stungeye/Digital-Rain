# Digital Rain

Matrix-inspired rain app, currently **Signal Engine 16**. Open `index.html` in a modern browser or serve the directory with any static web server. No build step, backend, or saved settings.

## Current state

Three visual depths of stationary, mutating glyph cells create falling streams, with phosphor bloom, grain, and white-hot heads. Four profiles (**Source, Deep, Overdrive, Anomaly**) theme both rain and controls. Display modes are flat, scanlines, and curved CRT.

Interactions include ripples, electric surge, system breach, and fullscreen. Wheel/pinch zooms (65–200%); mobile horizontal dragging pans.

Audio is synthesized with Web Audio: SFX Only, Code Hum, or an original 134-BPM breakbeat with beat-reactive lighting. Defaults: Source, flat display, bloom/grain on, SFX Only armed until the first user gesture. Pause freezes rain and score; hum and interaction sounds can continue. Muted silences everything.

**Controls:** H panel; Space pause; M mute/restore; F fullscreen; E/B surge/breach; C profile; 1/2/3 CRT; T/G grain/bloom; R reseed; +/- density. Click/tap ripples; Shift-click strengthens the wave.

## Decisions from the Git history

- **Keep streams collision-free** (`a3129c4`, `9461c35`): each global horizontal lane belongs to one depth. Its streams share velocity and retain at least two dark rows between them. Density changes lane activation and future gaps. Effects modify existing cells; draw bloom before glyphs.
- **Preserve the world during zoom** (`4f401b1`, `d5e207b`, `a8ab1f0`): `zoom` controls the camera, not glyph size. Zoom/pan preserve streams; resize/reseed rebuild them. Ripples propagate in viewport pixels, and pointer input follows CRT sampling transforms. Keep these coordinate systems consistent.
- **Maintain mobile resilience** (`dbded01`, `a8ab1f0`): touch/coarse-pointer devices bypass p5/WebGL for a small Canvas 2D adapter at 30 FPS. Desktop uses CDN p5.js 2.3.0 at 60 FPS, with an adapter fallback. CRT also has a Canvas fallback. Pixel density 1, cached atlases/halos, and tiled grain control cost. Optional Google Fonts arrival rebuilds atlases without reseeding.
- **Preserve CRT exposure and readable themes** (`d5e207b`, `ee44cba`): distortion processes the final raster; scanline darkness has brightness compensation. Panels stay opaque with near-white text. Profile keys remain `cinema`, `abyss`, `voltage`, `anomaly` despite renamed labels.
- **Keep input/audio ownership clear** (`dbc7bb7`, `afa8d4d`, `a8ab1f0`): one capture-phase shortcut dispatcher handles focused controls without double actions; native pointers distinguish taps from gestures. M restores the previous audible mode. Separate score/UI/cinematic audio routing supports pause behavior.
- **Retain mechanical UI Foley** (`2103b5b`, `e7f88f1`, `a8ab1f0`): worn hardware sounds replaced electronic beeps. Preserve ON/OFF switch timbres, weighted buttons with subtle pitch variation, and soft/throttled slider detents. UI level 50% matches the earlier 25% calibration without altering score/cinematic levels. No imported movie audio.

## Guidance for future changes

The app uses six files: `index.html` for structure, `styles.css` for presentation, `js/rain.js` for the loader/Canvas adapter and simulation (`CodePlane`, `CodeLane`, `CodeStream`), `js/crt.js` for `CRTDisplay`, `js/audio.js` for `SignalAudio`, and `js/ui.js` for controls and keyboard dispatch.

Classic scripts load in that order. The optional desktop p5 dependency is inserted before display/audio/UI finish loading; UI then selects the Canvas adapter if p5 is unavailable. Open `index.html` directly or serve this directory; no module loader or build is required. Display/audio read the small `RainApp` interface, while controls use `setRainOption`, `getRainOptions`, action functions, and `rain-state` to synchronize state.

`RainApp.settings` defines defaults, numeric limits, accepted choices, and display formatting. The public setter rejects invalid values and clamps finite numbers. Updates advance streams, mutation, and effect bookkeeping separately from rendering; appearance changes can redraw a paused scene without advancing its clock. Native pointers share CRT coordinate correction for hover and taps.

Reduced-motion preference starts the app paused. Pause/Resume, Space, or a manual surge/breach establishes your animation choice, which later preference changes preserve. Restore Defaults follows the current preference again. Interface transitions also respect reduced motion.

Run `node tests/checks.js` for ten dependency-free regression groups using mocked DOM, Canvas, and Web Audio. These execute the app's adapter startup, settings/reset/mute/shortcut behavior, frozen rendering, lane scheduling, overlapping ripple ownership, viewport culling, coordinate mapping, gestures, scheduled audio routing, and motion-preference logic. Mocks do not establish p5/browser appearance, audible output, GPU performance, or real-device behavior. Current component browser checks and outstanding acceptance checks are recorded in `TODO.md`.

After relevant changes, check desktop and Canvas paths, maximum density, zoomed CRT edge clicks, tap/pinch/pan/cancellation, focused shortcuts, mute restoration, pause, and resize. See `RUNTIME_EVALUATION.md` for the provisional runtime inventory and pending browser/performance comparison. Both p5 and Canvas paths remain supported.
