# Digital Rain development TODO

## Implementation checkpoint — 2026-10-11

Implementation for tasks 1–8 and the accessibility portion of task 10 is present in the six target app files. The final integration review found and fixed repeated cell mutations when ripple fronts overlap: cells now remember each active pulse independently. Ten regression groups in `tests/checks.js` pass, including adapter startup through `DOMContentLoaded`, settings/reset/mute synchronization, frozen rendering, collision spacing over 1,800 updates, effect ownership and viewport culling, native gestures, shortcut exclusions/first audio activation, scheduled audio routing, and reduced-motion preference handling. All four app scripts and the test file pass Node syntax checks.

Live-server browser checks observed the Canvas adapter at a 1280×720 viewport, all four profiles, all three display modes, paused appearance changes, 65%/200% zoom, bloom/grain toggles, focused Space, mute/default controls, Escape panel closing with focus restoration, and manual surge/breach resuming animation. No warnings or errors were observed during these checks. These are component checks, not a matched runtime comparison or an audible evaluation.

Tasks 2 and 6 have acceptance evidence below. Other task checkboxes remain open where their full retained-behavior criteria include unperformed checks. Task 9 retains a provisional keep-both-runtimes recommendation in `RUNTIME_EVALUATION.md`. Desktop p5/direct-open/offline startup, live delayed-font arrival/resize, curved-edge visual alignment, real-device gestures, reduced-motion browser behavior, audible full-LFO-cycle silence/Foley calibration, and performance comparisons remain unverified. No runtime replacement, publication, deployment, or commit has occurred.

## Goal and authorized scope

Simplify Digital Rain and move it from one HTML file into a small set of maintainable files. The user explicitly wants to remove Story Director and all image/video export features. Preserve the remaining visual style, sound design, interactions, and mobile resilience.

This document is a plan for future implementation. Creating it does not implement or verify the changes below. Tasks 1–5 are the first priority; tasks 6–10 are subsequent cleanup. Task 9 is an evaluation, not authorization to replace the rendering runtime without considering its results.

The future coordinating agent may delegate these tasks to sub-agents. Assign explicit file ownership and acceptance checks, and integrate their work before considering a task complete.

## Starting context

- At review time, `index.html` is approximately 2,263 lines and contains HTML, CSS, the p5 loader/Canvas adapter, simulation, CRT processing, audio, and UI bindings.
- `README.md` describes the current behavior, important decisions from Git history, and a manual verification checklist. Read it before implementation. It was already untracked at review time; preserve its contents when updating it.
- No automated tests or package manifest were found during the review.
- Findings below come from source review and isolated logic/audio-routing checks. Browser appearance, audible output, and exports were not exercised. Reproduce retained-behavior issues in the browser when implementing fixes.
- Starting line numbers are navigation hints only; use symbol searches after edits.

## Constraints to preserve

- Keep streams collision-free: one depth per horizontal lane, shared stream velocity within each lane, and at least two dark rows between streams.
- Keep all four profiles, their existing internal keys (`cinema`, `abyss`, `voltage`, `anomaly`), and readable opaque controls.
- Keep flat, scanline, and curved CRT modes, including a Canvas fallback and brightness compensation.
- Keep camera zoom (65–200%) and mobile horizontal pan without reseeding the world. Resize and explicit reseed may rebuild it.
- Keep ripples anchored in viewport pixels and pointer coordinates consistent with CRT sampling.
- Keep manual surge and breach, fullscreen, pause, reseed, restore defaults, and the controls panel.
- Keep SFX Only, Code Hum, Score + SFX, mute restoration, and the established mechanical UI Foley and volume calibration.
- Pause freezes rain and score; ambient hum and interaction sounds may continue. Muted silences everything.
- Keep first-gesture audio activation, single ownership of keyboard shortcuts, mobile responsiveness, cached glyph/halo assets, and delayed font loading without reseeding.
- Avoid a framework, bundler, or excessive file fragmentation solely to perform this refactor.

## Target layout

Six app files, plus this TODO and the existing README:

| File | Responsibility |
| --- | --- |
| `index.html` | Page structure, controls, stylesheet and script references |
| `styles.css` | Themes, layout, responsive styling, reduced-motion presentation |
| `js/rain.js` | Startup/Canvas adapter, state, simulation, rendering, camera and native gestures |
| `js/crt.js` | CRT display, fallback processing, coordinate mapping |
| `js/audio.js` | Sound synthesis, audio routing, sequencing, UI Foley |
| `js/ui.js` | Control bindings, keyboard actions, fullscreen, state synchronization |

Use a small explicit interface between files. Keep related simulation classes together. Avoid splitting each class or helper into its own file. Conventional ordered scripts can preserve direct opening of `index.html`; if choosing ES modules instead, explicitly document the local-server requirement and startup sequence. Preserve the current direct-open workflow by default.

## Delegation and integration sequence

1. The coordinator should inspect current files and applicable repository instructions, then capture a baseline of retained behavior.
2. Complete tasks 1 and 2 before task 3. These tasks edit overlapping parts of `index.html`; use one owning agent, sequential delegation, or isolated worktrees with deliberate integration. Do not let agents edit the same monolith concurrently.
3. Give task 3 to one integration owner. Establish file boundaries and shared interfaces before parallel edits.
4. After the split, task 5 can be delegated to the audio owner and CRT work in task 8 to a display owner. Tasks 4, 6, and 7 share simulation/state code and should be coordinated or performed sequentially by the same owner. Task 8 also touches gestures in `rain.js`.
5. The UI owner should coordinate shortcut changes, setting names, and accessibility with those owners. Keep interface changes explicit rather than allowing incompatible independent rewrites.
6. Evaluate task 9 after retained behavior is stable. Finish task 10 documentation and checks against the integrated result.
7. For every completed task, report changed files, checks performed, remaining limitations, and any intentional behavior changes. Mark checkboxes only when acceptance criteria are met.

## Sub-agent reasoning effort

Use medium effort by default. The recommendations below reflect this app's task complexity, rather than a guarantee that a particular effort level will succeed. Clear file ownership, acceptance criteria, and browser verification matter more than raising every agent's effort.

| Tasks | Recommended effort | Reason |
| --- | --- | --- |
| 1–2: Remove Director and exports | Medium | Mostly removal, with careful checks for leftover references and retained behavior. |
| 3: Split files | Medium | Boundaries are clear; startup order and shared interfaces need care. |
| 4–6: Paused redraw, audio fix, settings | Medium | Problems and acceptance criteria are well defined. Coordinate shared state changes. |
| 7: Separate updates from drawing | High | Changes simulation semantics and risks altering effects, offscreen behavior, pause, and performance. |
| 8: Pointer handling | Medium | Existing coordinate mappings provide a foundation. Escalate to high if curved-edge alignment or gesture interactions prove difficult. |
| 9: Evaluate removing p5.js | High preferred | Requires architectural judgment and comparison across rendering paths. Medium is sufficient for an initial dependency inventory. |
| 10: Accessibility, checks, documentation | Medium | Bounded work once the implementation is stable. |

Use high effort for the coordinator's final integration review, especially where tasks 4, 6, and 7 interact. Review startup, shared state, frozen-time rendering, effect bookkeeping, and input/audio ownership across the integrated files.

Starting every sub-agent at medium is also reasonable. Escalate task 7 if necessary, and task 9 when moving beyond inventory to an architectural recommendation. Higher effort does not replace executing the acceptance checks. This guidance does not change task dependencies or authorize concurrent edits to overlapping files.

Official OpenAI guidance describes medium as balanced for agentic coding and high as suited to complex debugging and planning: [Reasoning effort guidance](https://developers.openai.com/api/docs/guides/reasoning#reasoning-effort). Consult current guidance if model capabilities or supported effort settings change.

## Tasks

### 1. Remove Story Director

- [ ] Complete
- **Owner:** Feature-removal owner, before splitting files.
- **Reason:** The user no longer wants automatic cinematic sequencing. Removal also eliminates its wall-clock pause issue and override/restoration complexity.
- **Scope:** Remove the Director toggle and copy, `director-hud` markup/styles, D shortcut, `DIRECTOR_SCENES`, `DIRECTOR_SECONDS`, `updateDirector`, timing/scene/saved-setting variables, `directorSettingGrade`, Director option/default, events (`rain-director`, `rain-director-toggle`), `getDirectorChapter`, and UI listeners. Remove Director-specific parameters and branches such as `fromDirector` in `addPulse` after checking their remaining callers. Remove manual-setting logic that exits or restores Director.
- **Starting locations:** State/scenes around lines 363–423; draw call around 605; `updateDirector` around 1076; option setter/reset around 1114–1181; shortcut around 1264; UI listeners around 2177–2188.
- **Acceptance:** No remaining runtime references, controls, shortcuts, or documentation for Director. Manual profile/density/speed changes work normally. Manual surge and breach retain their visual/audio behavior. Defaults and pause work without saved Director state.

### 2. Remove still-image and video export

- [x] Complete
- **Owner:** Feature-removal owner; coordinate with task 1.
- **Reason:** The user no longer needs either export feature.
- **Scope:** Remove Save Frame/Record buttons, S/V shortcuts and help, recording label/styles, `captureRain`, `recordRain`, recorder state/timers, Blob/download/object-URL code, `getVisibleRainCanvas` if unused, Canvas adapter `saveCanvas`, `SignalAudio.attachRecording`, and all export documentation. Search for callers before deleting shared helpers.
- **Starting locations:** Markup around 188–219; adapter helper around 266; shortcut cases around 1277–1283; visible canvas accessor around 1310; audio recording connection around 2035; export UI around 2216–2259.
- **Graphics follow-up:** Review `preserveDrawingBuffer: true` in `CRTDisplay`. It appears related to capture, but changing it requires checking retained display behavior. Remove only if unnecessary and verified.
- **Acceptance:** No export controls, S/V actions, capture resources, recording audio connections, or export documentation remain. S and V no longer consume key events. Remaining action buttons and CRT modes work normally.

### 3. Split the app into six files

- [ ] Complete
- **Owner:** Integration owner, after tasks 1–2.
- **Reason:** Reduce navigation and editing friction without creating a large project structure.
- **Scope:** Extract CSS and the existing functional sections into the target layout. Establish a clear startup sequence and a small shared API. Preserve `setRainOption`/state synchronization behavior while later tasks improve their implementation. Move keyboard dispatch into `ui.js` with one owner for key events. Keep the loader/adapter compatible with the selected script-loading approach.
- **Acceptance:** All six files load successfully through the supported opening workflow. Desktop p5 and Canvas fallback initialize once, with no dependency-order errors or duplicated listeners. No intentional visual/audio changes occur from extraction alone. README documents layout and how to run the app.

### 4. Redraw appearance changes while paused

- [ ] Complete
- **Owner:** Simulation/state owner; coordinate with tasks 6–7.
- **Reason:** `draw` returns when paused unless `cameraDirty` is set. Profile, bloom, grain, and other appearance changes do not consistently request redraws; zoom does, and CRT has separate handling.
- **Scope:** Introduce a general render-invalidation mechanism. Use it for relevant visual settings, asset/font changes, reseed, resize, and camera changes. Distinguish requesting a new frame from advancing simulation. Preserve pause and audio semantics.
- **Starting locations:** `draw` around 596; `setRainOption` around 1114; font-ready callback around 556.
- **Acceptance:** While paused, changes to profile, bloom/glow, grain/texture, persistence, density, zoom/pan, and CRT appearance are visible immediately where applicable. Simulation time and stream positions stay frozen except intentional reseed/resize/density operations. Speed and mutation controls affect future advancement. Font arrival also refreshes the frozen scene.

### 5. Silence ambient audio reliably in SFX Only

- [ ] Complete
- **Owner:** Audio owner; can run independently after the split.
- **Reason:** SFX Only sets drone/air base gains to zero, but active LFOs remain connected to those gain parameters. Their modulation can produce a nonzero signal despite the zero base value.
- **Scope:** Add a reliable ambient-group gain or equivalent routing control that silences ambient sources in SFX Only independently of modulation. Preserve drone/air movement in Code Hum and Score + SFX, separate score/UI/cinematic routing, first-gesture activation, and mute restoration. Avoid retuning the soundtrack or Foley as part of this fix.
- **Starting locations:** `SignalAudio.init` around 1489; LFO connections around 1545–1553; `setMode` around 1580.
- **Acceptance:** After first interaction, SFX Only produces no continuous hum between effects, including through a full LFO cycle. Code Hum and Score + SFX retain ambient layers. Muted is silent; M restores the previous audible mode. Pause stops score while allowed ambient/UI/cinematic sound still works. Verify routing and audible behavior.

### 6. Centralize settings and validation

- [x] Complete
- **Owner:** Simulation/state owner with UI coordination.
- **Reason:** Defaults, slider limits, accepted values, and formatting are repeated across HTML and JavaScript. Most numeric settings are not validated at the public setter boundary. `fontSize` actually means camera zoom.
- **Scope:** Define defaults, bounds/types, allowed choices, and useful display formatting in one compact structure within an existing JS file. Validate finite numeric values, clamp ranges consistently, and handle booleans/enums deliberately. Rename `fontSize` to `zoom` across state, controls, labels/output IDs, camera math, and documentation. Check whether public callers need a compatibility alias; do not retain obsolete editor compatibility without a reason.
- **Acceptance:** Existing valid control values behave as before. Invalid names, nonfinite numbers, out-of-range values, and invalid choices cannot corrupt state. Zoom remains 0.65–2 and never reseeds streams. Reset, mute restoration, keyboard adjustments, and UI synchronization agree with the setting definitions.

### 7. Separate updates from drawing

- [ ] Complete
- **Owner:** Simulation owner, coordinated with tasks 4 and 6.
- **Reason:** `CodePlane.drawGlyphs` changes glyphs, twinkles, and effect markers during rendering. This couples rendering frequency/visibility to simulation behavior and complicates paused redraws.
- **Scope:** Move mutation and effect bookkeeping into an explicit update phase. Keep drawing responsible for displaying current state. Preserve collision-free lane scheduling, once-per-effect-cell handling, viewport culling, and the existing appearance. Avoid a large unrelated engine rewrite.
- **Starting location:** `CodePlane.drawGlyphs` around 742, especially mutation, breach, pulse, and surge blocks.
- **Acceptance:** Repeated redraws at the same simulation time do not mutate cells or reapply effects. Paused zoom/pan reveals stable state. Glyph mutation, twinkle, ripple, surge, and breach work during advancement. Stream separation remains intact at maximum density. Check performance at representative desktop/mobile sizes before expanding updates to offscreen cells.

### 8. Unify native pointer behavior and CRT coordinates

- [ ] Complete
- **Owner:** Input/display owner; coordinate edits to `rain.js` with its owner.
- **Reason:** The Canvas adapter updates pointer coordinates but never calls `mouseMoved`, so its hover disturbance differs from p5. Hover also bypasses the CRT correction used by ripple clicks.
- **Scope:** Use a single native pointer path for relevant hover and gestures. Apply the proper visible-screen to source-canvas to world mapping for hover. Preserve viewport-space ripples, gesture thresholds, pointer capture/cancellation, and suppression of taps after pinch/pan. Restrict hover to the rain area rather than panel interactions. Share conversion helpers where appropriate.
- **Starting locations:** Adapter pointer listener around 270; `installRainGestures` around 446; `addPulse` around 1199; `mouseMoved` around 1224; `CRTDisplay.screenToSource` around 1419.
- **Acceptance:** Desktop and forced Canvas fallback have consistent hover behavior. Click/hover effects align with the pointer near curved edges at minimum/maximum zoom. Mobile taps ripple; pinch and pan do not emit false taps. Cancellation and lifting one finger do not leave stuck gestures. Panel interactions do not disturb the rain.

### 9. Evaluate removing p5.js

- [ ] Evaluation complete
- **Owner:** Runtime/performance reviewer, after the main refactor is stable.
- **Reason:** Rendering already uses Canvas extensively, and the fallback implements a small p5-style API. A single Canvas runtime could remove the CDN dependency, `document.write`, and duplicate runtime paths.
- **Scope:** Compare the retained app on desktop p5 and Canvas paths. Inventory all p5 functions/callbacks actually used after cleanup. Identify adapter gaps, including desktop 60 FPS versus mobile 30 FPS, font readiness, graphics disposal, resize, and input. Use an isolated prototype if needed; do not replace the main runtime merely because the adapter exists.
- **Acceptance:** Deliver a recommendation supported by appearance, timing, startup, resize, CPU/frame-time, and mobile checks. State remaining risks and whether direct-open/offline behavior improves. If replacement is subsequently chosen, implement and verify it as a separate change; otherwise retain the existing paths.

### 10. Improve accessibility, verification, and documentation

- [ ] Complete
- **Owner:** UI/verification owner with final integration review.
- **Reason:** Reduced-motion CSS stops transitions but not rain or flashes. The project needs focused regression checks and accurate documentation after feature removal.
- **Scope:** Consider starting paused when reduced-motion is requested, with an explicit way to start animation; define behavior for preference changes without unexpectedly overriding a user's choice. Check keyboard-only controls, labels, focus, and readable themes. Director live-region/countdown issues disappear with task 1 and must not be recreated. Add a small set of meaningful automated checks for settings validation, frozen-time rendering, collision-free spacing, coordinate conversions, and audio routing where practical. Use browser checks for appearance/audio/input. Avoid a large test/tooling framework solely for extraction.
- **Documentation:** Update README, on-screen notes, shortcuts, source comments, and metadata to match the final app. Remove outdated single-file/p5-editor claims if no longer accurate. Preserve useful architecture decisions and manual checks; remove Director/export cases. Record the supported opening workflow and any development commands actually added.
- **Acceptance:** Retained behavior passes the checklist below; meaningful new checks pass. Reduced-motion behavior is documented and manually verified if implemented. README and UI no longer advertise removed features. Report any unimplemented optional accessibility decisions explicitly.

## Integrated retained-behavior checklist

- [ ] Supported direct-open/local-server startup and optional font loading.
- [ ] Desktop renderer and forced Canvas fallback; mobile Canvas path.
- [ ] All four profiles, readable controls, bloom/grain settings, and all CRT modes.
- [ ] Maximum density without stream collisions or unacceptable performance.
- [ ] Zoom/pan preserve the world; resize/reseed rebuild intentionally.
- [ ] CRT edge clicks/hover align at minimum and maximum zoom.
- [ ] Tap, pinch, pan, pointer cancellation, and panel interactions.
- [ ] One action per shortcut, including when controls have focus; removed D/S/V shortcuts do nothing.
- [ ] Pause freezes simulation/score; visual controls redraw appropriately.
- [ ] First-gesture audio, SFX Only silence between effects, Code Hum, score, mute restoration, and UI Foley calibration.
- [ ] Manual ripple, surge, breach, fullscreen, defaults, and reseed.
- [ ] Reduced-motion and keyboard accessibility, according to the chosen behavior.
- [x] No Director/export remnants; README, help text, and metadata match the integrated app.

## Completion handoff

The coordinator should finish with a concise summary of completed task numbers, final file layout, checks actually performed, unresolved issues, and the task 9 recommendation. Do not claim browser/audio/performance checks passed unless they were performed. Keep unrelated user changes intact, and do not publish or deploy as part of this plan.
