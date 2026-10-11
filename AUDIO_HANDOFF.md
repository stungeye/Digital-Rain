# Android audio investigation hand-off

Checkpoint: **2026-10-11, America/Winnipeg**. Resume after the user reports manual mobile results. The latest changes are a candidate mitigation, not a verified Pixel fix.

## Returned device results — 2026-10-11

- **Next-step prototype:** `tests/audio-media.html` with `tests/media-score.js` now prepares one score at a time through the production instruments/default score compressor and plays a WAV directly in an HTML audio element. Production engine/app routing remain unchanged. Explicit preparation followed by a Play gesture avoids relying on autoplay after an asynchronous render. Controls cover selection, pause/resume, music level, global mute, Stop/release and an indicator using percussion onsets plus the media clock. Optional live score-level hum (score sequencing held paused) and SFX use a separate context; selecting Off closes it. Compare **48,000 Hz** and **22,050 Hz**, music alone first, then hum/SFX. Listen through a full loop or seek near its end. A four-second preceding passage carries sustained voices/compressor history into a one-arrangement loop; 3 ms zero-ended tapers address the seam. Rendered noise/timing repeat each loop, rather than generating fresh noise. This is a listening prototype, not a shipped fix or full-app acceptance.
- Preparation suspends/resumes the offline renderer between two-bar batches so the complete arrangement's idle filters/waveshapers are not connected at once. An initial full-graph 48 kHz Overdrive experiment was too slow; the batched version completed the browser checks. Only one render runs at a time; cancelled work stops adding notes at the next batch boundary and finishes before replacement work starts. Stop releases player/object-URL resources immediately. Music level is relative to an isolated score rendered at the app's default 50% volume, rather than reproducing the app's full volume/compressor response. Live hum/SFX and media music do not share a final compressor, so combined mix calibration remains an integration concern.
- **Prototype validation:** all 19 existing regression groups still pass; both listening pages' inline scripts and `tests/media-score.js` pass syntax checks; `git diff --check` passes. Headless Chrome **154.0.8037.99 / Windows** rendered all four complete profiles at **48,000 and 22,050 Hz**: no invalid/clipped samples, exact-zero first/last PCM samples, peaks **0.187–0.302** in the final run. Checks passed for advancing playback clocks, actual media-loop wrap by seeking near the end, pause/resume, percussion/loop-boundary beat metadata, relative volume, mute with continuing playback, live hum without score notes, UI/ripple calls, context closure when comparisons turn Off, choosing live sounds while muted then unmuting, rejected-play retry, selection reset, cancelled/superseded preparations, page-hide cleanup and matching object-URL creation/revocation. Phone-sized layout was visually inspected. These are functional/signal checks, not an audible loop-seam or Firefox/Pixel pass. Helper: `C:\Users\kgeske\.codex\visualizations\2026\10\11\01a12cec-8e2f-7592-9217-0e0e89b7ffe6\media-browser-check.cjs`. No commit or deployment was made.
- **Rendered-score follow-up:** the user reports that rendered audio plays clean in the continuing Firefox 157.0.1 / Pixel 8 Pro / Android 17 test. This supports normal-player playback of the existing compositions, beyond the clean normal-player tone. The report does not specify individual profiles or listening duration. The audition page uses 22,050 Hz and omits hum/SFX; full-app playback, native-rate music, looping, transitions, pause/resume and beat synchronization remain unverified. The next implementation direction is a bounded media-playback prototype preserving those semantics, rather than further score-envelope tuning. No production audio changes have been made.
- **Latest Hardware comparison:** music + hum has occasional pauses and crackling; the Web Audio oscillator and generated steady tone both crackle; the normal audio-player tone has **no crackling**; SFX can crackle when the UI click button is pressed rapidly. This supersedes the earlier impression that test-page UI sounds were clean. The user confirmed this test used mobile **Firefox 157.0.1** on the **Pixel 8 Pro**; Android **17**, security update **September 5, 2026**. Do not treat this as a new Chrome result or as a Default/Hardware A/B comparison.
- The clean normal-player tone alongside two crackling Web Audio tones supports investigating the tested browser's Web Audio output path. It does not identify a specific implementation bug, establish that rapid SFX clicks have the same cause, or by itself validate media playback of the scores (the subsequent rendered-score test provides preliminary evidence). Hardware did not eliminate the reported fault. Keep the production engine unchanged; the subsequent playback experiment used the existing `tests/audio-render.html` normal players for offline-rendered scores on the same phone/browser, in comparison with the live scores. Those players omit hum and SFX, so clean playback still leaves combined playback, transitions, looping, pause/resume and beat synchronization unverified.
- For that experiment, wait until all four score players appear before listening, so background score rendering does not compete with playback. The existing audition page renders at **22,050 Hz**, whereas the normal-player tone file is **48,000 Hz** and live Web Audio uses the native rate. Treat it as a preliminary music feasibility check, not a matched sample-rate comparison.
- The affected browser is **mobile Firefox** on the Pixel. Both Default and Hardware still pause, pop and crackle with music + hum, the continuous oscillator, and the generated looping buffer tone. UI sounds seem clean in the listening test. This reproduces the fault without rain animation, score timers, the score graph, or the production compressor.
- The user then tried **mobile Chrome** and reported that the issues go away. They clarified that they do not know whether Chrome ever had the issues before the fixes. Record this as current clean Chrome playback, **not evidence that these commits fixed Chrome**. Exact tested Chrome workloads/settings, full-app coverage, duration, browser versions, Android version and screen/visibility conditions are not yet specified.
- This is evidence of a browser-dependent fault on this device, not proof of a specific Firefox bug or an Android-wide fault. Hardware sizing was motivated by Chrome support; an unexposed render size in Firefox does not establish that its graph changed between the two options.
- Leave the production engine unchanged. Chrome is a currently working playback option. Do not keep tuning score envelopes or rewriting the score graph solely to address a fault also present with both simple tones.
- `tests/audio-live.html` now adds a 90-second, nonlooping generated WAV played directly by an HTML audio player, with **no AudioContext**. It also logs context state, media interruption/error events and page visibility. Processing options do not apply to this player. These logs cannot count all audible glitches.
- The normal-player tone comparison has now been reported clean under the latest Hardware test. Retain the report/browser versions and confirm screen/visibility conditions. Explore media playback for sustained music with the existing offline score players before considering a production rewrite. Compare current full-app Chrome playback as a separate acceptance check.

Follow-up validation: all 19 existing regression groups pass. Headless Chrome 154/Windows passed the 14 existing live listening-page combinations, the new media tone with an advancing player clock and no AudioContext, stop/object-URL cleanup, and rejected-playback recovery, with no JavaScript exceptions. This is a functional smoke test, not audible Firefox/Pixel validation. `git diff --check` passed. No production audio changes, commit or deployment were made in this follow-up.

The sections below preserve the earlier checkpoint and its validation history; the returned results above supersede its awaiting-test status.

## User report and current state

- Desktop music and SFX sound clean. Android music crackles intermittently; SFX crackles much less frequently.
- Device: **Pixel 8 Pro**. Only the built-in speakers have been tested. The latest test used **Firefox 157.0.1**; Android **17**, security update **September 5, 2026**.
- The user says the previous agent's fixes did not work and authorized retaining or reverting them while trying another approach. They explicitly requested research and suggested generated sounds might stop away from a zero crossing.
- Previous fix: **`40dc9df` — “Attempt to reduce glitches and pops on mobile audio.”** Its description in the initial user prompt said uncommitted, but it was already committed when inspected.
- This agent retained that commit and made further changes. While this hand-off was being written, those six files were committed externally as **`0fd35cc` — “attempting to fix audio crackling on mobile.”**, which is now HEAD. At the final status check, only this new hand-off and its link in `TODO.md` remained uncommitted. Inspect current status before editing and preserve subsequent changes. No commit, deployment or publication was performed by this agent.
- The user now wants work wrapped up until they return with mobile listening results. Do not keep changing the audio speculatively during the wait.

Repository: `C:\Users\kgeske\source\repos\DigitalRain`. This is a static app with no package manifest/build step. Open directly or use the user's existing static server. No applicable `AGENTS.md` was found in this workspace or ancestor directories during this session.

## Changes ready for mobile testing

| File | Change |
| --- | --- |
| `js/audio.js` | Android hardware render-size request with constructor fallbacks; silent starts/stops for synthesized voice envelopes; fades at UI component and processed buffer boundaries. |
| `tests/checks.js` | Two additional regression groups for Android settings/fallbacks and sample/envelope boundaries. Total: 19 groups. |
| `tests/audio-live.html` | Phone listening page to compare Default/Hardware processing with isolated music, tones and SFX. |
| `MUSIC.md` | Research sources, interpretation, reproduction instructions and exact validation scope. |
| `README.md` | Current audio behavior and link to the listening page. |
| `TODO.md` | Latest investigation status, leaving Pixel acceptance open. |

### Android processing option

`SignalAudio` requests `renderSizeHint: 'hardware'` only when `navigator.userAgent` contains Android. Desktop—including touch-capable desktop—and iOS retain the previous processing option. Unknown dictionary members can be silently ignored. If a constructor rejects the hint, retry with the previous latency option, then with no options. Native sample rate is retained.

The previous commit's playback latency hint, 350 ms touch look-ahead (200 ms elsewhere), skipped overdue ticks, delayed-unlock priming, finished-graph cleanup, preset reuse and ambient transition fades are all retained. Scheduling note commands further ahead does **not** itself change Web Audio's render quantum or eliminate audio-thread deadline misses.

### Waveform boundary fixes

The user's suggestion revealed an actual discontinuity: at 48 kHz, the generated **panel-close buffer ended at approximately `0.061903` amplitude**, then dropped straight to silence. Several button buffers also began above zero, for example press at about `-0.024995`. Some mechanical components stopped while still ringing inside their containing buffer.

- Each finite UI component tapers over its last **3 ms**, including when cut short by the buffer cap.
- After damping and normalization, each complete UI buffer fades in over **1 ms** and out over **5 ms**, with exact-zero first/last samples.
- Tone/noise, score instruments, ripple layers and surge envelopes now begin at zero and reach zero before their scheduled source stop. Existing exponential decays end at their positive `0.0001` floor, followed by a **5 ms linear fade to zero**.
- `beginEnvelope(g,t,attack,peak)` bridges from zero over at most 1 ms to the **original exponential curve's value at that time**. Preserve this calculation. An initial implementation bridged merely to the floor, which steepened the remaining attack; browser comparisons caught it and it was corrected.

Music previously stopped at only `0.0001` gain, far smaller than the panel-close cut. Boundary fixes plausibly address some SFX clicks; they do not establish the cause of intermittent music crackling. Arrangements, pitches, instrument palette and volume calibration remain unchanged. Edge samples intentionally change. Do not claim the toggle buffers are still byte-for-byte identical.

## Research and what it establishes

- [Web Audio working-group render-size explainer](https://github.com/WebAudio/web-audio-api/blob/main/explainer/user-selectable-render-size.md): traditional 128-frame Web Audio processing can mismatch Android hardware buffers, for example 192 frames. Uneven rendering batches raise peak CPU demand and restrict viable graph complexity. This establishes a known mechanism, not this Pixel's actual buffer size or root cause.
- [Chrome 153 release notes](https://developer.chrome.com/release-notes/153): configurable render quantum, including `renderSizeHint: 'hardware'`, shipped in September 2026. Chrome 145 had an origin trial; do not describe 145 as generally supporting it.
- [Current Web Audio specification](https://webaudio.github.io/web-audio-api/#dom-audiocontextoptions-rendersizehint): `renderQuantumSize` reports actual size when supported. Hardware sizing can return zero until the context starts, so inspect it after playback begins.
- [Google issue 471865281](https://issuetracker.google.com/issues/471865281?hl=ar): a Pixel 8 Pro/Android 16 beta user reported sporadic pops across apps. That report is a possible OS-level alternative, not proof of the same fault. Some direct tracker views require sign-in; indexed text was available during research.

An AudioWorklet rewrite, forced low sample rate, prerendered music cache and rendering-quality reductions were **not implemented**. The app currently uses native oscillator/filter/buffer nodes, not a custom AudioWorklet. Avoid treating AudioWorklet-specific anecdotes as a diagnosis of this engine.

## Validation already completed

- `node tests/checks.js`: **all 19 groups pass**, including delayed unlock, pause/mute/profile routing, scheduling/cleanup, Android constructor fallbacks and the new boundary checks.
- Syntax checks for `js/audio.js` and `tests/checks.js`, plus `git diff --check`, passed. Git reported normal LF-to-CRLF warnings, not diff errors.
- UI sample endpoints are zero at **22,050, 44,100 and 48,000 Hz**, across all UI sound types and representative slider buckets. Samples remain finite, audible and below 0.75 absolute peak. Envelope graph checks establish that every tested synthesized source reaches zero before stop, with positive exponential ramp targets.
- **Headless Chrome 154 on Windows:** 14 live-context smoke tests covered Default/Hardware for oscillator tone, looping buffer tone, SFX Only and all four scores. Audio clocks advanced; score ticks advanced; effects and start/stop cycles produced no JavaScript exceptions. This was not an audible listening assessment or a sustained load measurement. Windows reported 48 kHz and 128-frame render quantum for both Default and Hardware; that is not an Android result.
- Deterministic offline comparisons against `40dc9df`: all four profiles, one-bar excerpts at bars **0, 12, 24 and the penultimate bar**, 48 kHz, requesting **128/192/512-frame** processing. All 12 profile/size comparisons had no invalid/clipped samples, peaks **0.147–0.239**, maximum absolute old/new difference **below 0.000101**. These quantify representative music output, not audible dropouts or UI Foley equivalence.
- The previous commit's own offline comparisons are documented separately in `MUSIC.md`; do not conflate them with these new checks.

Temporary browser helpers live outside the repository at:

`C:\Users\kgeske\.codex\visualizations\2026\10\11\01a12cca-b88e-7da1-8ab0-6dc3613dd518\audio-browser-check.cjs`

`C:\Users\kgeske\.codex\visualizations\2026\10\11\01a12cca-b88e-7da1-8ab0-6dc3613dd518\audio-boundaries.cjs`

The browser helper uses an isolated headless Chrome profile and local DevTools connection. Its baseline is dynamically read with `git show HEAD:js/audio.js`. HEAD was `40dc9df` during the reported validation but is now `0fd35cc`: **change that helper's baseline to `40dc9df` explicitly before reproducing the old/new comparison**, or it will compare against the new engine itself. Chrome initially failed to launch its crash service inside the restricted shell sandbox; the same isolated test succeeded through approved elevated execution. No browser flags/settings were changed in the user's normal profile. These helpers are session aids, not required app dependencies or a checked-in test framework.

## Manual test awaiting the user

Use **`tests/audio-live.html` through the same server used to open the app on the Pixel**. A desktop local-file link does not transfer the page to the phone.

1. With the same speaker output/volume, compare **Default** and **Hardware** for at least a minute each; Stop before changing options.
2. Try music for the affected profiles. The page uses the production score/hum graph, starts at bar 12 and omits the rain animation.
3. Try **Steady tone** (one continuous oscillator) and **Recorded steady tone** (one looping generated buffer). These avoid musical note timers; the buffer also avoids continuous oscillator synthesis.
4. Try **SFX only**, select **Panel close**, and press UI click. Other UI types and a Ripple button are available. The test page does not expose surge/breach; use the full app for those.
5. Compare isolated music with the full app. Note CRT mode, density, bloom/grain, whether interactions trigger glitches and whether problems appear only after sustained playback.

Useful return information: browser/version, Android version, which workload/profile crackles under each processing option, whether the new full app improves, and the page's `renderQuantumFrames`/latency readings after starting. Speaker-only testing is sufficient for the initial comparison; Bluetooth is currently untested.

**A/B limitation:** both options use the new boundary fades. Default reproduces the previous processing choice, **not the complete previous engine**. A reported 128 frames under Hardware can mean the browser selected 128; it does not prove the hint was ignored. Reported latencies/settings cannot count audible glitches.

## Resume based on the results

| Mobile result | Interpretation and next investigation |
| --- | --- |
| New app is clean | Verify sustained playback, all four profiles, effects, pause/resume, mode/profile switches, mute and control response. Record user's evidence, then update acceptance status without claiming broader devices passed. |
| Hardware helps compared with Default | Supports a processing-size/load hypothesis. Record actual quantum and browser version. Keep the option and investigate any residual dropouts under the full render workload. |
| Isolated music is clean, full app crackles | Investigate contention with Canvas/CRT rendering. Compare flat versus curved CRT, density, bloom/grain and sustained workload. Profile the actual device before reducing visual quality. |
| Tones are clean, isolated music crackles | Investigate live graph cost, dense polyphony, waveshaper oversampling, graph churn and actual scheduling lateness. Consider a bounded/prerendered voice or music experiment, preserving sound and volume, rather than simply increasing command look-ahead again. |
| Oscillator and looping buffer both crackle | Fault can occur without score synthesis/timers. Compare browser engines or playback outside this app, output routes if useful, and OS/browser versions. Do not keep retuning score envelopes as the sole response. |
| Only UI/SFX still clicks at consistent boundaries | Audit remaining internal cuts and audible output after filters, not just full-buffer endpoints. The Foley intentionally contains physical contact/noise transients; distinguish intended texture from unintended discontinuities. |
| Old browser does not expose render size | Determine actual browser version/support. The option may be ignored. Explain that updating to a supporting version tests the hypothesis; do not promise it solves the fault. |

If further code changes are needed, keep the scope on audio stability and preserve compositions, UI Foley character/calibration, native rate, separate score/UI/cinematic/ambient routing, first-gesture activation and pause/mute semantics. Do not revert the latest commit wholesale without evidence: its graph cleanup and stall recovery remain useful even though they did not solve the reported device issue. Preserve any user changes made after this checkpoint.

The next agent should read the user's new test report, inspect current Git state and this document, and then choose the smallest evidence-supported next step. **Pixel listening and sustained device performance are the outstanding acceptance checks.**
