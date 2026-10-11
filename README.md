# Digital Rain

Single-file Matrix-inspired rain app, currently **Signal Engine 16**. Open `index.html` in a modern browser or serve the directory with any static web server. No build step, backend, or saved settings.

## Current state

Three visual depths of stationary, mutating glyph cells create falling streams, with phosphor bloom, grain, and white-hot heads. Four profiles (**Source, Deep, Overdrive, Anomaly**) theme both rain and controls. Display modes are flat, scanlines, and curved CRT.

Interactions include ripples, electric surge, system breach, fullscreen, and an optional looping five-chapter, 90-second Story Director. Wheel/pinch zooms (65–200%); mobile horizontal dragging pans. PNG and eight-second WebM exports capture the visible canvas, including CRT; recording includes initialized, enabled audio when supported.

Audio is synthesized with Web Audio: SFX Only, Code Hum, or an original 134-BPM breakbeat with beat-reactive lighting. Defaults: Source, flat display, bloom/grain on, Director off, SFX Only armed until the first user gesture. Pause freezes rain and score; hum and interaction sounds can continue. Muted silences everything.

**Controls:** H panel; Space pause; M mute/restore; F fullscreen; E/B surge/breach; D Director; C profile; 1/2/3 CRT; T/G grain/bloom; R reseed; S/V image/video; +/- density. Click/tap ripples; Shift-click strengthens the wave.

## Decisions from the Git history

- **Keep streams collision-free** (`a3129c4`, `9461c35`): each global horizontal lane belongs to one depth. Its streams share velocity and retain at least two dark rows between them. Density changes lane activation and future gaps. Effects modify existing cells; draw bloom before glyphs.
- **Preserve the world during zoom** (`4f401b1`, `d5e207b`, `a8ab1f0`): `fontSize` means camera zoom, not glyph size. Zoom/pan preserve streams; resize/reseed rebuild them. Ripples propagate in viewport pixels, and pointer input follows CRT sampling transforms. Keep these coordinate systems consistent.
- **Maintain mobile resilience** (`dbded01`, `a8ab1f0`): touch/coarse-pointer devices bypass p5/WebGL for a small Canvas 2D adapter at 30 FPS. Desktop uses CDN p5.js 2.3.0 at 60 FPS, with an adapter fallback. CRT also has a Canvas fallback. Pixel density 1, cached atlases/halos, and tiled grain control cost. Optional Google Fonts arrival rebuilds atlases without reseeding.
- **Preserve CRT exposure and readable themes** (`d5e207b`, `ee44cba`): distortion processes the final raster; scanline darkness has brightness compensation. Panels stay opaque with near-white text. Profile keys remain `cinema`, `abyss`, `voltage`, `anomaly` despite renamed labels.
- **Keep input/audio ownership clear** (`dbc7bb7`, `afa8d4d`, `a8ab1f0`): one capture-phase shortcut dispatcher handles focused controls without double actions; native pointers distinguish taps from gestures. M restores the previous audible mode. Separate score/UI/cinematic audio routing supports pause behavior.
- **Retain mechanical UI Foley** (`2103b5b`, `e7f88f1`, `a8ab1f0`): worn hardware sounds replaced electronic beeps. Preserve ON/OFF switch timbres, weighted buttons with subtle pitch variation, and soft/throttled slider detents. UI level 50% matches the earlier 25% calibration without altering score/cinematic levels. No imported movie audio.

## Guidance for future changes

The file contains HTML/CSS, loader/Canvas adapter, simulation (`CodePlane`, `CodeLane`, `CodeStream`), `CRTDisplay`, `SignalAudio`, and UI bindings. Use `setRainOption` and `rain-state` to synchronize controls. Director saves/restores density, speed, and grade; manual changes to those exit it.

No automated tests exist. After relevant changes, check desktop and Canvas paths, maximum density, zoomed CRT edge clicks, tap/pinch/pan, focused shortcuts, mute restoration, pause, Director overrides, resize, and exports. Current improvement opportunities: Director uses wall-clock chapter timing and can jump ahead after pause; reduced-motion CSS stops interface transitions but leaves rain running.
