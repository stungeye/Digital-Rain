# Digital Rain

Matrix-inspired rain app, currently **Signal Engine 16**. Open `index.html` in a modern browser or serve the directory with any static web server. No build step, backend, or saved settings.

## Current state

Three visual depths of stationary, mutating glyph cells create falling streams, with phosphor bloom, grain, and white-hot heads. Four profiles (**Source, Deep, Overdrive, Anomaly**) theme both rain and controls. Display modes are flat, scanlines, and curved CRT. Curved CRT fills the viewport through slight overscan/cropping, with pointer mapping following the same transform.

Interactions include ripples, electric surge, system breach, and fullscreen. Wheel/pinch zooms (65–200%); mobile horizontal dragging pans.

Audio is synthesized with Web Audio: SFX Only, Code Hum, or four distinct original profile scores with beat-reactive lighting. Deep plays orchestral trip-hop, Overdrive industrial metal / EBM, Anomaly dub / jungle, and Source plays the approved original 134-BPM breakbeat score. See [MUSIC.md](MUSIC.md) for research and audition notes. Defaults: Source, flat display, bloom/grain on, SFX Only armed until the first user gesture. Pause freezes rain and score and ignores rain hover/click/tap disturbances. Camera and appearance controls still work; hum and UI sounds can continue. Muted silences everything.

Touch/coarse-pointer devices request Web Audio's `playback` latency hint and queue music 350 ms ahead (200 ms on other devices). This gives rendering stalls more headroom, at the cost of potentially slower SFX response; browsers may ignore the hint. After longer stalls, missed ticks are skipped on the existing tempo grid instead of starting together. Completed sounds disconnect their full voice graph, instrument presets are reused, UI starts use the clock after sample generation, and ambient mode changes fade briefly to avoid hard cuts. Compositions and native sample rate are retained. Browser rendering and mock checks cannot prove dropout-free device playback.

The first buffering fix did not resolve the user's Pixel 8 Pro speaker crackling. Android now additionally requests `renderSizeHint: 'hardware'` (available in Chrome 153+) to address the documented mismatch between Web Audio processing blocks and Android hardware buffers. Older browsers may ignore it; rejected hints fall back while retaining playback latency. Synthesized voices ramp from and back to exact zero, and UI Foley components/buffer edges fade to avoid nonzero cuts. The panel-close buffer previously ended at about 0.062 amplitude at 48 kHz. These changes preserve arrangements, volume calibration and native sample rate, with small changes to sound edges. See [MUSIC.md](MUSIC.md) for research, and open [tests/audio-live.html](tests/audio-live.html) on the phone for Default/Hardware comparisons without rain. Updated Pixel playback remains unverified.

**Controls:** H panel; Space pause; M mute/restore; F fullscreen; E/B surge/breach; C profile; 1/2/3 CRT; T/G grain/bloom; R reseed; +/- density. Click/tap the running rain for ripples; Shift-click strengthens the wave. Phone controls hide keyboard help.

## Decisions from the Git history

- **Keep streams collision-free** (`a3129c4`, `9461c35`): each global horizontal lane belongs to one depth. Its streams share velocity and retain at least two dark rows between them. Density changes lane activation and future gaps. Effects modify existing cells; draw bloom before glyphs.
- **Preserve the world during zoom** (`4f401b1`, `d5e207b`, `a8ab1f0`): `zoom` controls the camera, not glyph size. Zoom, pan, and resize preserve existing streams; larger viewports add coverage around the fixed world centre. Reseed and Restore Defaults rebuild the world. Ripples propagate in viewport pixels, and pointer input follows CRT sampling transforms. Keep these coordinate systems consistent.
- **Maintain mobile resilience** (`dbded01`, `a8ab1f0`): all devices use the native Canvas 2D runtime. Touch/coarse-pointer devices target 30 FPS; other desktops target 60 FPS. CRT uses WebGL where available on desktop and retains its Canvas fallback; touch devices use Canvas CRT processing. Pixel density 1, cached atlases/halos, and tiled grain control cost. Optional Google Fonts arrival rebuilds atlases without reseeding.
- **Preserve CRT exposure and readable themes** (`d5e207b`, `ee44cba`): distortion processes the final raster; scanline darkness has brightness compensation. Panels stay opaque with near-white text. Profile keys remain `cinema`, `abyss`, `voltage`, `anomaly` despite renamed labels.
- **Keep input/audio ownership clear** (`dbc7bb7`, `afa8d4d`, `a8ab1f0`): one capture-phase shortcut dispatcher handles focused controls without double actions; native pointers distinguish taps from gestures. M restores the previous audible mode. Separate score/UI/cinematic audio routing supports pause behavior.
- **Retain mechanical UI Foley** (`2103b5b`, `e7f88f1`, `a8ab1f0`): worn hardware sounds replaced electronic beeps. Preserve ON/OFF switch timbres, weighted buttons with subtle pitch variation, and soft/throttled slider detents. UI level 50% matches the earlier 25% calibration without altering score/cinematic levels. No imported movie audio.

## Guidance for future changes

The app uses six files: `index.html` for structure, `styles.css` for presentation, `js/rain.js` for the Canvas runtime and simulation (`CodePlane`, `CodeLane`, `CodeStream`), `js/crt.js` for `CRTDisplay`, `js/audio.js` for `SignalAudio`, and `js/ui.js` for controls and keyboard dispatch.

Classic scripts load in that order. UI installs the Canvas runtime after the app dependencies are defined; the scene starts once at `DOMContentLoaded`. Open `index.html` directly or serve this directory; no module loader or build is required. Rendering requires no external library or network access. Google Fonts are optional, with system fonts available offline. Display/audio read the small `RainApp` interface, while controls use `setRainOption`, `getRainOptions`, action functions, and `rain-state` to synchronize state.

`RainApp.settings` defines defaults, numeric limits, accepted choices, and display formatting. The public setter rejects invalid values and clamps finite numbers. Updates advance streams, mutation, and effect bookkeeping separately from rendering; appearance changes can redraw a paused scene without advancing its clock. Native pointers share CRT coordinate correction for hover and taps.

Reduced-motion preference starts the app paused. Pause/Resume, Space, or a manual surge/breach establishes your animation choice, which later preference changes preserve. Restore Defaults follows the current preference again. Interface transitions also respect reduced motion.

Run `node tests/checks.js` for dependency-free regression groups using mocked DOM, Canvas, and Web Audio. These execute the app's Canvas startup, settings/reset/mute/shortcut behavior, frozen rendering, lane scheduling, overlapping ripple ownership, viewport culling, coordinate mapping, gestures, scheduled audio routing, and motion-preference logic. Audio checks also cover touch buffering, recovery from short/long stalls, complete voice cleanup, shared effect lifetime, and uncached UI sample timing. Startup checks reject external script injection and verify a single scene on desktop and mobile. Mocks do not establish browser appearance, audible output, GPU performance, or real-device behavior. Current component browser checks and outstanding acceptance checks are recorded in `TODO.md`.

After relevant changes, check desktop and mobile Canvas rendering, both CRT processing paths, maximum density, zoomed CRT edge clicks, tap/pinch/pan/cancellation, focused shortcuts, mute restoration, pause, and resize. See `RUNTIME_EVALUATION.md` for the Canvas runtime decision and remaining verification limits.
