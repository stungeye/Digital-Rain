# Signal profile scores

Four original instrumental scores using the app's Web Audio engine. Select **Score + SFX**, then change the signal profile to audition. Each profile starts its score from the beginning. Pause holds the sequencing position. Each arrangement has an introduction, development, breakdown and return, then repeats with fresh percussion noise.

| Profile | Track | Tempo | Musical identity | Arrangement |
| --- | --- | --- | --- | --- |
| Deep | Undertow | 92 BPM | D-minor orchestral trip-hop: additive piano, slow strings, sparse backbeat, long sub notes | 48 bars / 125 seconds |
| Overdrive | Iron Protocol | 126 BPM | E-Phrygian industrial metal / EBM: saturated stereo power riffs, straight machine kicks, resonant acid answers | 64 bars / 122 seconds |
| Anomaly | Fracture | 164 BPM | Chromatic dub / jungle: sliced breaks, snare splices, half-time passages, sub bass, stereo echoes | 64 bars / 94 seconds |
| Source | Original Score | 134 BPM | Big beat / breakbeat: chopped kicks, swung hats, ghost snares, minor bass ostinato | 32 bars / 57 seconds |

Source now plays the approved original 134-BPM, 32-bar score, preserved verbatim as `legacyScoreStep` in `js/audio.js`. The user approved Undertow, Iron Protocol and Fracture after listening and selected Blind Entry for removal. The three approved new compositions remain unchanged.

## Research and compositional interpretation

“Matrix music” describes a soundtrack family rather than one genre: big beat, trip-hop, industrial rock/metal and electronic dance music. The [1999 album listing](https://theprodigy.info/discography/soundtracks/matrix/) includes **Spybreak!**, **Clubbed to Death**, **Prime Audio Soup**, **Mindfields** and **Du Hast**. Our interpretation of their common ground is physical rhythm, dark timbre, repetition with tension, and human playing colliding with machines.

- **Propellerheads:** the contemporary [Fresh Air review](https://freshairarchive.org/segments/propellerheads-make-good-use-musicians-who-have-come) describes electronic collage plus human drums, with turntables, Hammond organ and bass in the live setup. [DJ Mag's interview/history](https://djmag.com/content/game-changers-history-repeating) traces the partnership between Alex Gifford and drummer Will White. The discarded Blind Entry candidate explored funk bass, swing, organ chops and brass punctuation; Source retains the original score with its syncopated drums and bass.
- **Rob Dougan:** in a [2003 interview](https://www.theguardian.com/music/2003/aug/29/1), Dougan describes his affinity for classical composition. Undertow uses piano and orchestral voices over slower drums.
- **Meat Beat Manifesto:** [Jack Dangers' account in DJ Mag](https://djmag.com/features/how-meat-beat-manifestos-radio-babylon-became-breakbeat-hardcores-accidental-anthem) connects huge breaks, dub bass and cut-and-paste collage to the emerging hardcore/jungle scene; Radio Babylon was not conceived as a rave track. Fracture uses shifting break placements, snare slices, spacious bass and echoes. Its faster jungle direction interprets that lineage; it does not claim Prime Audio Soup is a 164-BPM jungle track.
- **The Prodigy:** [Liam Howlett's interview in Metal Hammer](https://www.loudersound.com/bands-artists/the-prodigy-fat-of-the-land-story-behind-album) describes noisy hip-hop, east London breakbeat, Public Enemy and rock aggression while retaining the attack of beats and bass. That informs Iron Protocol's abrasive rhythmic force and Fracture's breaks.
- **Rammstein:** a [1998 band interview](https://lollipopmagazine.com/1998/04/rammstein-sehnsecht-interview/) identifies interests in techno, big beat, pop and harder music. Iron Protocol uses the dance/metal intersection: rigid pulse, power fifths, distorted chugs and electronic counterlines.

All melodies, rhythms and synthesized sounds are original. No soundtrack recordings, vocal samples or external audio assets are used. Piano, strings, brass and guitar-like riffs are synthetic approximations. The four scores differ in tempo, harmony, phrasing, groove, instrument palette and arrangement, rather than just changing a shared preset.

## Validation and audition

`node tests/checks.js` passes all thirteen regression groups. Score checks exercise full arrangements, finite parameters, tempo changes, replacement of old score buses, selection before activation, pause, SFX-only isolation, mute restoration and defaults. Mocks establish control flow, not musical quality.

Open `tests/audio-render.html` in a browser to render each full track through the production Web Audio graph and compressor. It reports peak/RMS levels, invalid samples and clipping, and supplies players for the complete scores without ambient hum. Use the app to judge the mix with rain and effects. The final selection is the original Source score plus the three approved new tracks.

Automated browser rendering was not completed in this session: the headless renderer returned before audio completion, and the browser tool blocks local file URLs. The user subsequently verified all four candidates by listening and approved the three new tracks retained here.
