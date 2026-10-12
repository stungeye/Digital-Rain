(()=>{
const rain = RainApp.state;
// ─── ORIGINAL GENERATIVE SCORE / SOUNDS ────────────────────────────────
// WebAudio only. No streamed tracks, samples from the films, or external
// assets. SFX Only is armed by default; audio starts on the first gesture.
// Arrangement: low minor drone; granular electrical rain; spacious, sparse
// industrial/trip-hop percussion and an original minor ostinato.
// ─── SIGNAL ENGINE AUDIO / ORIGINAL PROCEDURAL SCORE ─────────────────────
// Four original profile scores; Source uses the approved 134 BPM score,
// kept intact as legacyScoreStep.
const PROFILE_SCORES = Object.freeze({
  abyss: Object.freeze({id:'undertow', title:'Undertow', bpm:92, bars:48, style:'Orchestral trip-hop: felt piano, suspended strings and a slow, heavy backbeat.'}),
  voltage: Object.freeze({id:'iron-protocol', title:'Iron Protocol', bpm:126, bars:64, style:'Industrial metal / EBM: palm-muted power riffs, machine kicks and acid synth.'}),
  anomaly: Object.freeze({id:'fracture', title:'Fracture', bpm:164, bars:64, style:'Dub / jungle: sliced breaks, half-time sub bass and scattered tape echoes.'}),
  cinema: Object.freeze({id:'source-original', title:'Source / Original Score', bpm:134, bars:32, style:'Big beat / breakbeat: chopped kicks, swung hats, ghost snares and a minor bass ostinato.'})
});
// Reuse instrument definitions instead of allocating every preset per note.
const VOICE_PRESETS = {
  piano:{partials:[[1,1],[2,.31],[3,.12],[4.01,.055]],type:'sine',attack:.004,release:.42,hz:3600},
  strings:{partials:[[1,.48],[1.003,.3],[.998,.22]],type:'sawtooth',attack:.28,release:.65,hz:1350},
  organ:{partials:[[1,.56],[2,.27],[3,.12],[4,.05]],type:'sine',attack:.008,release:.045,hz:2200},
  brass:{partials:[[1,.65],[1.006,.35]],type:'sawtooth',attack:.025,release:.09,hz:1500},
  riff:{partials:[[1,.65],[2,.23],[3,.12]],type:'sawtooth',attack:.003,release:.035,hz:1700},
  acid:{partials:[[1,1]],type:'sawtooth',attack:.006,release:.09,hz:2400},
  sub:{partials:[[1,.85],[2,.15]],type:'sine',attack:.012,release:.2,hz:320},
  bell:{partials:[[1,.7],[2.76,.2],[4.13,.1]],type:'sine',attack:.003,release:.32,hz:4300}
};
const BUTTON_KINDS = new Set(['press','select','commit','reset',
  'pause','resume','panel-open','panel-close']);
window.SignalAudio = class SignalAudio {
  static scores = PROFILE_SCORES;
  constructor() {
    this.ctx = null; this.mode = 'off'; this.volume = rain.volume;
    this.humVolume = rain.humVolume ?? .5;
    this.scoreVolume = rain.scoreVolume ?? 1;
    this.step = 0; this.nextStep = 0; this.nextAmbient = 0;
    this.timer = null; this.nodes = []; this.recentHits = [];
    this.scorePaused = rain.paused;
    this.schedulingScore = false;
    this.schedulingAmbient = false;
    this.profile = rain.grade;
    this.lookAhead = .17;
    this.voiceLead = .012;
    this.startLead = .075;
  }
  get score() { return PROFILE_SCORES[this.profile] || PROFILE_SCORES.cinema; }
  setProfile(profile) {
    if (!PROFILE_SCORES[profile] || profile === this.profile) return;
    this.profile = profile;
    this.step = 0;
    this.recentHits.length = 0;
    if (!this.ctx) return;
    this.retireScoreBus();
    this.nextStep = this.ctx.currentTime + .12;
  }
  retireScoreBus() {
    // Retire the old score bus, including its already scheduled notes and
    // sustained chords. New voices start after its short fade, without
    // cross-key overlap. UI, hum and cinematic effects keep their own buses.
    const oldBus = this.scoreBus, t = this.ctx.currentTime;
    oldBus.gain.cancelScheduledValues(t);
    oldBus.gain.setTargetAtTime(0, t, .025);
    setTimeout(() => oldBus.disconnect(), 400);
    this.scoreBus = this.ctx.createGain();
    this.scoreBus.gain.value = this.scorePaused || this.mode !== 'score' ? 0 : this.scoreVolume;
    this.scoreBus.connect(this.master);
  }
  init() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return false;
    try { this.ctx = new Context(); } catch { return false; }
    const ac = this.ctx;
    this.compressor = ac.createDynamicsCompressor();
    this.compressor.threshold.value = -17;
    this.compressor.knee.value = 17;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = .009;
    this.compressor.release.value = .2;
    this.master = ac.createGain(); this.master.gain.value = 0;
    this.master.connect(this.compressor); this.compressor.connect(ac.destination);
    // All score instruments are routed separately from UI and cinematic SFX.
    // This lets pause mute the full beat instantly without muting the hum.
    this.scoreBus=ac.createGain();this.scoreBus.gain.value=this.scorePaused?0:this.scoreVolume;
    this.scoreBus.connect(this.master);
    // Gate the entire ambient group after modulation. Setting an LFO-driven
    // source gain to zero alone cannot silence its additive modulation.
    this.ambientBus=ac.createGain();this.ambientBus.gain.value=0;
    this.ambientBus.connect(this.master);
    // Shipboard UI Foley v13: no musical beeps and no parallel fake-grit
    // overlay. Short, physically-modelled mechanical samples supply the dirt.
    // Preserve the existing separate volume control and score/cinematic buses.
    this.uiBus=ac.createGain();this.uiBus.gain.value=.90;
    this.uiHP=ac.createBiquadFilter();this.uiHP.type='highpass';this.uiHP.frequency.value=43;
    this.uiLP=ac.createBiquadFilter();this.uiLP.type='lowpass';this.uiLP.frequency.value=2150;
    this.uiLP.Q.value=.5;
    this.uiLimiter=ac.createDynamicsCompressor();
    this.uiLimiter.threshold.value=-18;this.uiLimiter.knee.value=8;
    this.uiLimiter.ratio.value=3.2;this.uiLimiter.attack.value=.006;
    this.uiLimiter.release.value=.16;
    this.uiBus.connect(this.uiHP).connect(this.uiLP).connect(this.uiLimiter).connect(this.master);
    this.uiFoleyCache=new Map();
    this.noise = this.noiseBuffer(27.7);
    // Three slow, non-harmonic oscillator movements prevent a short, obvious loop.
    // Start silent until the selected mode has been applied. In SFX-only mode
    // the ambient beds must not leak through during the first activation.
    this.droneGain = ac.createGain(); this.droneGain.gain.value = 0;
    this.droneLP = ac.createBiquadFilter(); this.droneLP.type = 'lowpass';
    this.droneLP.frequency.value = 180;
    this.droneGain.connect(this.droneLP).connect(this.ambientBus);
    for (const [f, type, amp] of [[41.203, 'sine', .54], [82.407, 'triangle', .22],
                                 [123.47, 'sawtooth', .095], [83.1, 'sine', .075]]) {
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.type = type; osc.frequency.value = f; g.gain.value = amp;
      osc.connect(g).connect(this.droneGain); osc.start(); this.nodes.push(osc);
    }
    this.airGain = ac.createGain(); this.airGain.gain.value = 0;
    this.airLP = ac.createBiquadFilter(); this.airLP.type = 'bandpass';
    this.airLP.frequency.value = 760; this.airLP.Q.value = .37;
    const air = ac.createBufferSource(); air.buffer = this.noise; air.loop = true;
    air.connect(this.airLP).connect(this.airGain).connect(this.ambientBus);
    air.start(0, 3.71); this.nodes.push(air);
    this.underGain = ac.createGain(); this.underGain.gain.value = 0;
    const underFilter = ac.createBiquadFilter(); underFilter.type = 'lowpass';
    underFilter.frequency.value = 220;
    const under = ac.createBufferSource(); under.buffer = this.noise; under.loop = true;
    under.connect(underFilter).connect(this.underGain).connect(this.ambientBus);
    under.start(0, 13.17); this.nodes.push(under);
    const lfo = (rate, amount, target) => {
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.type = 'sine'; osc.frequency.value = rate; g.gain.value = amount;
      osc.connect(g).connect(target); osc.start(); this.nodes.push(osc);
    };
    lfo(.0173, 76, this.droneLP.frequency); // ~58 seconds
    lfo(.0119, 335, this.airLP.frequency); // ~84 seconds
    lfo(.0371, .011, this.airGain.gain); // ~27 seconds
    lfo(.0233, .026, this.droneGain.gain); // ~43 seconds
    this.setVolume(this.volume);
    return true;
  }
  noiseBuffer(seconds) {
    const ac = this.ctx, length = Math.floor(ac.sampleRate * seconds);
    const b = ac.createBuffer(1, length, ac.sampleRate);
    const samples = b.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < length; i++) {
      const v = Math.random() * 2 - 1;
      brown = (brown + .032 * v) / 1.032;
      samples[i] = v * .72 + brown * 1.18;
    }
    // Match both ends of the long air bed so the seam itself is inaudible.
    const fade = Math.min(8192, Math.floor(length * .03));
    for (let i = 0; i < fade; i++) {
      const a = i / fade, end = length - fade + i;
      samples[end] = samples[end] * (1 - a) + samples[0] * a;
    }
    return b;
  }
  setVolume(value) {
    this.volume = Number(value);
    if (this.ctx) this.master.gain.setTargetAtTime(this.mode === 'off' ? 0 : this.volume * .52,
      this.ctx.currentTime, .07);
  }
  setHumVolume(value) {
    this.humVolume = Number(value);
    if (this.ctx) this.ambientBus.gain.setTargetAtTime(
      this.mode==='ambience'||this.mode==='score'?this.humVolume:0,
      this.ctx.currentTime, .05);
  }
  setScoreVolume(value) {
    this.scoreVolume = Number(value);
    if (this.ctx) this.scoreBus.gain.setTargetAtTime(
      this.scorePaused||this.mode!=='score'?0:this.scoreVolume,
      this.ctx.currentTime, .05);
  }
  setMode(mode) {
    if (mode !== 'off' && !this.ctx && !this.init()) { this.mode = 'off'; return; }
    const previousMode=this.mode;
    this.mode = mode;
    if (!this.ctx) return;
    if(previousMode==='score' && mode!=='score')this.retireScoreBus();
    // Resume during the actual user gesture. Do not await a promise before
    // scheduling gain/voices, or the first click's sound can be lost.
    if (mode !== 'off') this.ctx.resume().then(() => {
      if (this.mode === 'off') return;
      // Prime as soon as autoplay unlocks, rather than waiting for a timer.
      // This also preserves tick zero when device startup takes longer.
      this.nextStep = Math.max(this.nextStep, this.ctx.currentTime + this.startLead);
      this.schedule();
    }).catch(()=>{});
    const ac = this.ctx, active = mode !== 'off';
    const ambientEnabled=mode==='ambience'||mode==='score';
    this.ambientBus.gain.cancelScheduledValues(ac.currentTime);
    if(ambientEnabled)this.ambientBus.gain.setTargetAtTime(this.humVolume,ac.currentTime,.05);
    else this.ambientBus.gain.setTargetAtTime(0,ac.currentTime,.02);
    if(mode==='score' && previousMode!=='score') {
      this.step=0;
      this.nextStep=ac.currentTime+this.startLead;
      this.recentHits=[];
    }
    this.setPaused(rain.paused);
    this.master.gain.setTargetAtTime(active ? this.volume * .52 : 0, ac.currentTime, active ? .018 : .12);
    // Both hum modes share the same bed levels; the hum slider owns its mix.
    this.droneGain.gain.setTargetAtTime(mode === 'effects' ? 0 : .135, ac.currentTime, .25);
    this.airGain.gain.setTargetAtTime(mode === 'effects' ? 0 : .043, ac.currentTime, .35);
    this.underGain.gain.setTargetAtTime(mode === 'effects' ? 0 : .019, ac.currentTime, .35);
    if (active && !this.timer) {
      this.nextStep = ac.currentTime + this.startLead;
      this.nextAmbient = ac.currentTime + 3;
      this.timer = setInterval(() => this.schedule(), 35);
    }
    if (!active && this.timer) { clearInterval(this.timer); this.timer = null; }
    if (active) this.schedule();
  }
  setPaused(paused) {
    this.scorePaused=Boolean(paused);
    this.recentHits.length=0;
    if(!this.ctx)return;
    const t=this.ctx.currentTime;
    this.scoreBus.gain.setTargetAtTime(this.scorePaused||this.mode!=='score'?0:this.scoreVolume,t,.012);
    // The sequencing position stays fixed while paused. The next note is
    // resynchronized to audio time on resume (no burst of skipped beats).
    this.nextStep=t+this.startLead;
  }
  schedule() {
    if (!this.ctx || this.mode === 'off' || this.ctx.state !== 'running') return;
    const ac = this.ctx, beat = 60 / this.score.bpm / 4;
    const earliest = ac.currentTime + this.voiceLead;
    const horizon = ac.currentTime + this.lookAhead;
    if(this.mode==='score' && this.scorePaused) {
      this.nextStep=ac.currentTime+this.startLead;
      return;
    }
    // A late start() plays immediately with an envelope already partway
    // through its attack. Skip missed ticks on the original tempo grid,
    // rather than compressing overdue notes into a click/burst after a stall.
    if (this.nextStep < earliest) {
      const missed = Math.ceil((earliest - this.nextStep) / beat);
      this.nextStep += missed * beat;
      this.step += missed;
    }
    let n = 0;
    while (this.nextStep < horizon && n++ < 10) {
      if (this.mode === 'score') {
        this.schedulingScore=true;
        try { this.scoreStep(this.nextStep, this.step); }
        finally { this.schedulingScore=false; }
      }
      this.nextStep += beat; this.step++;
    }
    // Incommensurate, randomized quiet events, not a repeating one-bar chirp.
    if (horizon >= this.nextAmbient) {
      this.nextAmbient = Math.max(this.nextAmbient, earliest);
      if (this.mode === 'ambience') {
        this.schedulingAmbient=true;
        try {
          this.filteredNoise(this.nextAmbient, .4 + Math.random() * .65,
            .010 + Math.random() * .012, 260 + Math.random() * 1400, .28,
            Math.random() * 1.4 - .7);
        } finally { this.schedulingAmbient=false; }
      }
      this.nextAmbient += 8 + Math.random() * 19;
    }
  }
  env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t + attack + decay);
    g.gain.linearRampToValueAtTime(0,t+attack+decay+.005);
  }
  connectVoice(node, gain, pan = 0) {
    node.connect(gain);
    const bus=this.schedulingScore?this.scoreBus:
      this.schedulingAmbient?this.ambientBus:this.master;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = pan;
      gain.connect(p).connect(bus);
      return [node, gain, p];
    }
    gain.connect(bus);
    return [node, gain];
  }
  releaseVoice(source, nodes) {
    // Stop alone does not dispose the rest of a connected voice graph.
    // Use the audio end event so cleanup also follows suspended contexts.
    source.onended = () => {
      for (const node of nodes) node.disconnect();
      source.onended = null;
    };
  }
  tone(t, freq, dur, type = 'sine', amp = .12, endFreq = null, lowpass = 0, pan = 0) {
    if (!this.ctx || this.mode === 'off') return;
    const ac = this.ctx, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(Math.max(1, freq), t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq),t+dur);
    this.env(g,t,amp,.006,Math.max(.035,dur-.006));
    let nodes;
    if (lowpass) {
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass;
      o.connect(f); nodes = [o, ...this.connectVoice(f,g,pan)];
    } else nodes = this.connectVoice(o,g,pan);
    this.releaseVoice(o, nodes);
    o.start(t); o.stop(t+dur+.06);
  }
  filteredNoise(t, dur, amp, hz = 1900, Q = .6, pan = 0, highpass = false) {
    if (!this.ctx || this.mode === 'off') return;
    const ac = this.ctx, s = ac.createBufferSource(), f = ac.createBiquadFilter(),
      g = ac.createGain();
    s.buffer = this.noise;
    f.type = highpass ? 'highpass' : 'bandpass';
    f.frequency.value = hz; f.Q.value = Q;
    this.env(g,t,amp,.008,Math.max(.025,dur-.008));
    s.connect(f); this.releaseVoice(s, [s, ...this.connectVoice(f,g,pan)]);
    s.start(t, Math.random() * (this.noise.duration - dur - .15));
    s.stop(t+dur+.04);
  }
  kick(t, velocity = 1) {
    this.recentHits.push({t, energy: .76*velocity});
    if(this.recentHits.length>20)this.recentHits.shift();
    this.tone(t, 165, .29, 'sine', .72 * velocity, 42, 0, 0);
    this.tone(t, 680, .042, 'triangle', .10*velocity, 72, 0, 0);
    this.filteredNoise(t, .052, .17 * velocity, 120, .68);
  }
  snare(t, velocity = 1) {
    this.recentHits.push({t, energy: .55*velocity});
    if(this.recentHits.length>20)this.recentHits.shift();
    this.filteredNoise(t, .205, .38 * velocity, 1650, .44, .08);
    this.filteredNoise(t+.014, .105, .20 * velocity, 480, .57, -.08);
    this.filteredNoise(t+.025,.082,.10*velocity,3900,.72,.16,true);
    this.tone(t, 205, .115, 'triangle', .115 * velocity, 112, 450);
  }
  hat(t, accent = 1, pan = 0) {
    this.filteredNoise(t,.040 + accent*.015,.105*accent,6600,.72,pan,true);
  }
  bass(t, root, step, strength = 1) {
    const note = root * Math.pow(2,step/12);
    this.tone(t,note,.235,'sawtooth',.145*strength,note*.992,310,-.06);
    this.tone(t,note/2,.28,'sine',.125*strength,null,0,-.06);
  }
  stab(t, root, emphasis = 1) {
    // Short, dissonant synthetic stabs: tension without copying a film cue.
    for (const [mult, strength] of [[2,.027],[2.378,.016],[3.565,.012]]) {
      this.tone(t,root*mult,.23,'sawtooth',strength*emphasis,null,720,.22);
    }
  }
  // Shared synthesis vocabulary, deliberately different envelopes/spectra.
  note(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  scoreVoice(t, midi, dur, instrument, amp=.1, pan=0) {
    const ac=this.ctx, freq=this.note(midi), g=ac.createGain();
    const p=VOICE_PRESETS[instrument], filter=ac.createBiquadFilter();
    filter.type='lowpass';filter.Q.value=instrument==='acid'?5:.6;
    filter.frequency.setValueAtTime(p.hz,t);
    if(instrument==='acid'||instrument==='brass'||instrument==='riff')
      filter.frequency.exponentialRampToValueAtTime(instrument==='acid'?180:420,t+dur);
    const attack=Math.min(dur*.45,p.attack);
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(amp,t+attack);
    g.gain.exponentialRampToValueAtTime(instrument==='strings'?amp*.75:amp*.26,t+dur);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur+p.release);
    g.gain.linearRampToValueAtTime(0,t+dur+p.release+.005);
    let input=filter;
    if(instrument==='riff') {
      if(!this.riffCurve) {
        this.riffCurve=new Float32Array(1024);
        for(let i=0;i<1024;i++)this.riffCurve[i]=Math.tanh((i/1023*2-1)*4);
      }
      const drive=ac.createWaveShaper();drive.curve=this.riffCurve;drive.oversample='2x';
      drive.connect(filter);input=drive;
    }
    const shared = this.connectVoice(filter,g,pan);
    if (input !== filter) shared.push(input);
    let remaining = p.partials.length;
    for(const [multiple,level] of p.partials) {
      const o=ac.createOscillator(), partial=ac.createGain();
      o.type=p.type;o.frequency.value=freq*multiple;partial.gain.value=level;
      o.connect(partial).connect(input);o.start(t);o.stop(t+dur+p.release+.02);
      o.onended=()=>{
        o.disconnect();partial.disconnect();o.onended=null;
        // All partials share these effects: retain them until the last ends.
        if (--remaining === 0) for (const node of shared) node.disconnect();
      };
    }
  }
  echoNote(t,midi,dur,instrument,amp,pan,delay) {
    this.scoreVoice(t,midi,dur,instrument,amp,pan);
    this.scoreVoice(t+delay,midi,dur*.7,instrument,amp*.28,-pan);
    this.scoreVoice(t+delay*2,midi,dur*.5,instrument,amp*.10,pan);
  }
  scoreStep(t,tick) {
    switch(this.score.id) {
      case 'undertow': this.undertowStep(t,tick);break;
      case 'iron-protocol': this.ironStep(t,tick);break;
      case 'fracture': this.fractureStep(t,tick);break;
      default: this.legacyScoreStep(t,tick);
    }
  }
  undertowStep(t,tick) {
    const s=tick%16,bar=Math.floor(tick/16)%48, beat=60/92;
    // D minor -> Bb major7 -> G minor9 -> A suspended/dominant.
    // A piano prologue, two long builds and an exposed middle-eight.
    const chords=[[50,57,65,69],[46,53,62,65],[43,50,58,65],[45,52,62,64]];
    const chord=chords[Math.floor(bar/4)%4], intro=bar<4;
    const bridge=bar>=24&&bar<32, full=bar>=12&&!bridge;
    const hit=t+(s%2?.024:0);
    if(s===0) {
      for(let i=1;i<4;i++)this.scoreVoice(t,chord[i],beat*3.4,'strings',full?.055:.032,(i-2)*.4);
      this.scoreVoice(t,chord[0]-12,beat*2.2,'sub',.14);
    }
    const melody=[0,7,12,10,5,3,7,2];
    if([0,6,10,14].includes(s)) {
      const index=(Math.floor(bar%2)*4+[0,6,10,14].indexOf(s));
      this.echoNote(hit,62+melody[index]+(bar>=32?12:0),.42,'piano',.11,-.3,beat*.75);
    }
    if(!intro&&!bridge) {
      if([0,7,10].includes(s))this.kick(hit,s===0?.82:.48);
      if(s===4||s===12)this.snare(hit,.65);
      if(s%2===0)this.hat(hit,.27,s%4?-.3:.25);
      if(bar%4===3&&s===15)this.snare(hit,.17);
    } else if(bridge&&s===8)this.kick(hit,.4);
    if(full&&s===8)this.scoreVoice(hit,chord[2]+12,beat*1.5,'strings',.05,.32);
  }
  ironStep(t,tick) {
    const s=tick%16,bar=Math.floor(tick/16)%64,beat=60/126;
    const bridge=bar>=32&&bar<40, intro=bar<4, lift=bar>=48;
    const root=[40,40,41,38][Math.floor(bar/4)%4];
    // Straight sixteenth-note chugs and rests, no swung breakbeat. A
    // Phrygian semitone and power fifths give this its mechanical identity.
    const riffs=[[0,0,null,0,7,null,0,0,null,1,0,null,7,0,null,0],
      [0,null,0,0,12,null,7,null,0,0,null,1,0,null,7,3]];
    const note=riffs[bar%2][s];
    if(note!==null&&!bridge) {
      this.scoreVoice(t,root+note,.07,'riff',.10,-.48);
      this.scoreVoice(t+.004,root+note+7,.085,'riff',.064,.48);
      if(s%4===0)this.scoreVoice(t,root-12,.18,'sub',.12);
    }
    if([0,4,8,12].includes(s)||(!intro&&!bridge&&[3,10].includes(s)))
      this.kick(t,bridge?.42:s%4===0?.9:.52);
    if(!intro&&(s===4||s===12))this.snare(t,bridge?.48:.88);
    if(s%2===0)this.hat(t,bridge?.19:.38,s%4?.28:-.25);
    if(!intro&&[2,6,10,14].includes(s))
      this.scoreVoice(t,root+24+[0,1,7,12][(s-2)/4],.12,'acid',lift?.065:.043,.15);
    if(bridge&&s===0)for(const offset of [0,7,13])
      this.scoreVoice(t,root+12+offset,beat*3,'strings',.035,(offset-6)/12);
    if(bar%8===7&&s>=13)this.snare(t,.2+(s-13)*.10);
    if(lift&&s===0)this.filteredNoise(t,.6,.075,5200,.5,.1,true);
  }
  fractureStep(t,tick) {
    const s=tick%16,bar=Math.floor(tick/16)%64,beat=60/164;
    const intro=bar<4, dub=bar>=24&&bar<32||bar>=56;
    const root=[36,39,34,37][Math.floor(bar/4)%4];
    const hit=t+((tick*7)%5)*.001;
    // Four unlike break edits; every eighth bar folds into a snare splice.
    const kicks=[[0,6,10],[0,3,8,14],[0,7,10,15],[0,2,8,11]];
    const snares=[[4,12],[4,11,14],[4,12],[4,10,12]];
    if((dub?[0,10]:kicks[bar%4]).includes(s))this.kick(hit,.73);
    if((dub?[8]:snares[bar%4]).includes(s)&&!intro)this.snare(hit,dub?.72:.68);
    if(!dub&&!intro&&[3,7,9,15].includes(s))this.snare(hit,.14);
    if(!dub&&!intro)this.hat(hit,s%2?.20:.32,s%2?.45:-.35);
    if([0,7,10].includes(s))this.scoreVoice(hit,root+(s===7?7:s===10?-2:0),beat*.9,'sub',.24);
    if(s===2&&bar%2===0)for(const offset of [12,15,22])
      this.echoNote(hit,root+offset,.095,'organ',.045,-.5,beat*.75);
    if(s===13&&bar%4===3)this.echoNote(hit,root+37,.07,'bell',.07,.6,beat*.75);
    if(!dub&&!intro&&bar%8===7&&s>=12) {
      this.snare(hit,.24);
      this.snare(hit+beat/8,.12);
      this.filteredNoise(hit,.026,.035,2300+(s-12)*900,.9,s%2?.65:-.65);
    }
    if(s===0&&bar%8===0)this.filteredNoise(hit,beat*1.8,.045,380,.9,-.4);
  }
  legacyScoreStep(t, tick) {
    const s=tick%16, bar=Math.floor(tick/16), phrase=bar%32;
    const section=Math.floor(phrase/8), root=[82.407,65.406,73.416,61.735][section];
    const fill=bar%8===7, dropout=phrase===15||phrase===31;
    const drive=dropout?.47:(section===2?1.12:1);
    // 90s-style chopped/funky break patterns: non-four-on-floor kick,
    // alternating two-bar backbeats, dragged offbeat ghosts and late hats.
    const kickPatterns=[[0,3,7,10,14],[0,6,8,11,14],[0,3,8,10,15],[0,5,7,10,12,15]];
    const groove=kickPatterns[bar%4];
    const swing=s%2===1?.019:0;
    const human=((tick*11)%7-3)*.0015;
    const hit=t+swing+human;
    if(groove.includes(s)&&!(dropout&&s>7)) {
      const force=s===0?1.12:(s===8?.88:.69);
      this.kick(hit,drive*force);
    }
    if(s===4||s===12)this.snare(hit,drive*(s===12?1.1:.99));
    if((s===11 && bar%2===0)||(s===15&&bar%2===1)||
       (fill&&[10,13,14,15].includes(s)))this.snare(hit,.19+(fill?.11:0));
    if(s%2===0)this.hat(hit,(s%4===2?.82:.44)*drive,s%4===2?.32:-.3);
    if([3,7,11,15].includes(s)&&!(bar%4===2&&s===11))
      this.hat(hit,.26+(s===15?.13:0),s===7?.5:-.22);
    if(fill&&s>=12)this.filteredNoise(hit,.035,.045,3200+(s-12)*230,.65,.3,true);
    if([2,6,10,14].includes(s)&&section>=1)
      this.filteredNoise(hit,.07,.032,760,.5,-.44);
    const bassSteps={0:0,3:0,6:7,8:0,10:-2,12:0,15:-5};
    if(s in bassSteps&&!(dropout&&s>=10))
      this.bass(hit,root,bassSteps[s],drive*(s===0?1.24:.91));
    if((s===2||s===10)&&bar%2===1)this.stab(hit,root,section===2?1.2:.77);
    if(s===0&&bar%8===0)this.tone(hit,root*2,.86,'triangle',.044,null,480);
    if(fill&&s===15)this.filteredNoise(hit,.30,.11,1800,.37,.5);
    if(dropout&&s===12)this.filteredNoise(hit,.48,.09,550,.31);
  }
  beatEnergy() {
    if(this.mode!=='score'||this.scorePaused||!this.ctx)return 0;
    const now=this.ctx.currentTime;
    let energy=0;
    for(const hit of this.recentHits) {
      const elapsed=now-hit.t;
      if(elapsed>=0 && elapsed<.29)energy+=hit.energy*Math.exp(-elapsed*14);
    }
    return Math.min(1,energy);
  }
  // A bespoke code-wave: a short, swelling pressure front, staggered
  // micro-fragments and dissonant harmonic tension. Inspired by the *method*
  // of the original film's sound design; no sampled film audio or exact cue.
  ripple(x, power = 1) {
    if (this.mode==='off'||!this.ctx) return;
    const ac=this.ctx, t=ac.currentTime+.012;
    const pan=Math.max(-.72,Math.min(.72,x*1.44-.72));
    const heavy=power>2, length=heavy?1.35:.94;
    const peak=heavy?.21:.125, rise=heavy?.265:.175;
    const noiseLayer=(offset, duration, freq, targetFreq, amp, position, attack)=>{
      const s=ac.createBufferSource();s.buffer=this.noise;
      const f=ac.createBiquadFilter();f.type='bandpass';f.Q.value=.62;
      const begin=t+offset, span=Math.max(.08,duration);
      f.frequency.setValueAtTime(freq,begin);
      f.frequency.exponentialRampToValueAtTime(targetFreq,begin+span*.75);
      const g=ac.createGain();g.gain.setValueAtTime(.0001,begin);
      g.gain.exponentialRampToValueAtTime(Math.max(.0002,amp),begin+attack);
      g.gain.exponentialRampToValueAtTime(.0001,begin+span);
      g.gain.linearRampToValueAtTime(0,begin+span+.005);
      s.connect(f);this.releaseVoice(s,[s,...this.connectVoice(f,g,position)]);
      s.start(begin,Math.random()*(this.noise.duration-span-.1));s.stop(begin+span+.025);
    };
    // The attack gathers energy rather than announcing itself as a click.
    noiseLayer(0,length,heavy?170:300,heavy?1550:2100,peak,pan,rise);
    noiseLayer(.045,length*.72,2600,490,peak*.49,-pan*.66,rise*.72);
    // Nearly-redundant tiny fragments, each slightly staggered and panned.
    for(let i=0;i<(heavy?8:6);i++) {
      const at=.05+i*(heavy?.078:.069),freq=650+((i*1277)%1700);
      noiseLayer(at,.16+(i%3)*.036,freq,freq*.69,
        peak*(heavy?.11:.095),pan*.6+(i%2?.23:-.23),.04);
    }
    // An original low cluster that swells beneath the noise. Dark and
    // dissonant, but without the cartoon pitch-slide of a laser effect.
    const base=heavy?73:110;
    for (const [multiple,level] of [[1,.66],[1.123,.31],[1.414,.19]]) {
      const o=ac.createOscillator(),f=ac.createBiquadFilter(),g=ac.createGain();
      o.type='triangle';o.frequency.value=base*multiple;
      f.type='lowpass';f.frequency.value=heavy?410:590;
      g.gain.setValueAtTime(.0001,t);
      g.gain.exponentialRampToValueAtTime(peak*level*.8,t+rise);
      g.gain.exponentialRampToValueAtTime(.0001,t+length*.82);
      g.gain.linearRampToValueAtTime(0,t+length*.82+.005);
      o.connect(f);this.releaseVoice(o,[o,...this.connectVoice(f,g,pan*.35)]);
      o.start(t);o.stop(t+length+.02);
    }
    // The visible echo is smaller and late: a narrow, soft second crest.
    noiseLayer(heavy?.34:.25,heavy?.48:.34,1250,620,peak*.28,-pan*.5,.095);
  }
  surge() {
    if (this.mode==='off'||!this.ctx) return;
    const ac=this.ctx, t=ac.currentTime+.015;
    // A broad electrical pressure wave, NOT a rising laser or arcade chirp.
    const source=ac.createBufferSource(); source.buffer=this.noise;
    const filter=ac.createBiquadFilter();filter.type='bandpass';
    filter.frequency.setValueAtTime(140,t);
    filter.frequency.exponentialRampToValueAtTime(2100,t+1.05);
    filter.frequency.exponentialRampToValueAtTime(280,t+1.75);
    filter.Q.value=.48;
    const g=ac.createGain();
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(.21,t+.09);
    g.gain.setValueAtTime(.21,t+.8);
    g.gain.exponentialRampToValueAtTime(.0001,t+1.78);
    g.gain.linearRampToValueAtTime(0,t+1.785);
    source.connect(filter).connect(g).connect(this.master);
    this.releaseVoice(source,[source,filter,g]);
    source.start(t,Math.random()*(this.noise.duration-2)); source.stop(t+1.81);
    this.tone(t,57,1.25,'sine',.24,43);
    for(let i=0;i<6;i++)
      this.filteredNoise(t+.18+i*.21,.07,.06,1300+i*340,.72, i%2?.45:-.45);
  }
  breach(slabPhases = Array.from({length:9},(_,slab)=>slab/8)) {
    if (this.mode==='off'||!this.ctx) return;
    const ac=this.ctx,t=ac.currentTime+.01;
    // Preserve the opening's failing power supply and broken contacts.
    this.tone(t,67,1.24,'sine',.53,26);
    this.filteredNoise(t+.13,.99,.24,290,.25);
    for(let i=0;i<7;i++)this.filteredNoise(t+.32+i*.15,.057,.038,430+i*135,.67,Math.random()-.5);
    // Filtered metal under tension: two rough layers pull outward with the
    // tear. The same soft exponential attacks/tails as the other film SFX.
    const strain=(at,dur,hz,endHz,amp,pan,endPan,attack)=>{
      const begin=t+at,source=ac.createBufferSource();source.buffer=this.noise;
      const filter=ac.createBiquadFilter();filter.type='bandpass';filter.Q.value=.85;
      filter.frequency.setValueAtTime(hz,begin);
      filter.frequency.exponentialRampToValueAtTime(endHz,begin+dur*.85);
      const gain=ac.createGain();gain.gain.setValueAtTime(.0001,begin);
      gain.gain.exponentialRampToValueAtTime(amp,begin+attack);
      gain.gain.exponentialRampToValueAtTime(.0001,begin+dur);
      gain.gain.linearRampToValueAtTime(0,begin+dur+.005);
      source.connect(filter);
      const graph=this.connectVoice(filter,gain,pan);
      const panner=ac.createStereoPanner ? graph[2] : null;
      if(panner){panner.pan.setValueAtTime(pan,begin);panner.pan.linearRampToValueAtTime(endPan,begin+dur*.8);}
      this.releaseVoice(source,[source,...graph]);
      source.start(begin,Math.random()*Math.max(0,this.noise.duration-dur-.1));
      source.stop(begin+dur+.025);
    };
    strain(.64,.76,360,1700,.15,-.12,-.78,.16);
    strain(.67,.88,1900,240,.12,.12,.78,.20);
    this.tone(t+.64,48,1.35,'triangle',.13,39,240,-.25);
    this.tone(t+.69,54,1.25,'triangle',.075,43,280,.25);
    this.filteredNoise(t+1.35,.83,.045,420,.45);
    // Each slab draws inward, then seats with a short damped metal latch
    // at its visual relock flash (2.42–2.88 s). No melodic success chime.
    for(let slab=0;slab<slabPhases.length;slab++) {
      const phase=slabPhases[slab],seat=2.42+phase*.46;
      const pan=(slab%2?1:-1)*(.22+phase*.35);
      strain(seat-.17,.19,280,900,.038,pan,pan*.15,.14);
      this.filteredNoise(t+seat,.045,.052,1150+phase*750,.9,pan);
      this.tone(t+seat,125+phase*65,.13,'triangle',.044,72,620,pan*.5);
    }
    this.tone(t+3.02,55,.28,'sine',.13,48,180);
    this.filteredNoise(t+3.02,.12,.035,240,.5);
  }
  // ─── SHIPBOARD INTERFACE FOLEY / v14 ──────────────────────────────────
  // Controls feel like physical shipboard hardware. v14 retains the v13
  // toggle timbres; slider detents are smaller and less frequent,
  // while buttons now have a slow, damped mass and a quieter seating contact.
  // The synthesis happens
  // OFF the live audio thread, once per type or slider detent. There are no
  // imported samples or copyrighted movie sounds. Only UI Foley uses this.
  uiFoleySample(kind='press',bucket=14) {
    const key=kind+':'+bucket;
    if(this.uiFoleyCache.has(key))return this.uiFoleyCache.get(key);
    const ac=this.ctx,sr=ac.sampleRate;
    const lengths={
      'panel-open':.42,'panel-close':.31,'toggle-on':.30,'toggle-off':.27,
      'select':.28,'slider':.075,'slider-end':.14,'commit':.33,
      'reset':.47,'pause':.28,'resume':.32,'press':.28
    };
    const len=lengths[kind]||.22;
    const n=Math.ceil((len+.022)*sr);
    const buffer=ac.createBuffer(1,n,sr),out=buffer.getChannelData(0);
    // Seeded local randomness: each control has a recognizable physical
    // identity, rather than generating a completely unrelated noise event.
    let seed=2166136261;
    for(const ch of key)seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;
    const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
      return (seed>>>0)/4294967296;};
    const twopi=Math.PI*2;
    const put=(at,duration,voice)=>{
      const start=Math.floor(at*sr),samples=Math.min(n-start,Math.floor(duration*sr));
      const fade=Math.min(samples,Math.max(2,Math.round(sr*.003)));
      for(let j=0;j<samples;j++){
        const t=j/sr, v=voice(t,j,samples);
        // Some mechanical bodies still have substantial energy at their
        // finite duration (or at the buffer cap). Soften each internal cut.
        const tail=Math.min(1,(samples-1-j)/Math.max(1,fade-1));
        if(Number.isFinite(v))out[start+j]+=v*tail;
      }
    };
    // Weighted switch/relay motion: a dense low note *without* a clean
    // oscillator envelope. Inharmonic undertones and contact vibration
    // produce recognizably physical weight; there is no bell-like resonance.
    const knock=(at,freq,amount=1,decay=.13)=>{
      let phase=0,rough=0;
      put(at,decay,(t)=>{
        const envelope=(1-Math.exp(-t*950))*Math.exp(-t*(5.1/decay));
        const f=freq*(1+.11*Math.exp(-t*48));
        phase+=twopi*f/sr;
        rough+=.12*((rnd()*2-1)-rough);
        const ring=Math.sin(phase)+.28*Math.sin(phase*2.18+.4)
          +.13*Math.sin(phase*3.57+1.7);
        // Sporadic sticky contacts; dull and short, not high pitched.
        const chatter=t<.041?(Math.sin(t*twopi*98)>-.6?1:.24):0;
        return amount*envelope*(.66*ring+.34*rough*(1+.8*chatter));
      });
    };
    // Unlubricated potentiometer/worn sliding latch: rolling, scratchy
    // pressure, with slightly different stops and starts for every control.
    const friction=(at,duration,amount=.28,weight=.5,reverse=false)=>{
      let low=0,slow=0,rotor=0,grit=0;
      put(at,duration,(t)=>{
        const x=t/duration;
        const envelope=Math.pow(Math.sin(Math.PI*x),.65)*
          (reverse?(1.1-.45*x):(.45+.65*x));
        const white=rnd()*2-1;
        low+=.17*(white-low);
        slow+=.019*(low-slow);
        grit+=.04*((rnd()>.86?1:-.10)-grit);
        rotor+=twopi*(55+weight*60+9*Math.sin(t*twopi*9))/sr;
        const stutter=(Math.sin(t*twopi*(45+weight*21))>-.82?1:.53);
        return amount*envelope*stutter*
          (1.3*(low-slow)+.40*slow+.27*grit+.16*Math.sin(rotor));
      });
    };
    // A low electrical winding / decaying mechanical load. Never a digital
    // glissando; its speed/torque moves, but the frequency remains sub-200Hz.
    const coil=(at,duration,freq=80,amount=.3,engage=true)=>{
      let phase=0,noise=0;
      put(at,duration,(t)=>{
        const x=t/duration;
        const envelope=engage?Math.sin(Math.PI*Math.pow(x,.64))**2:
          Math.pow(1-x,1.6)*(1-Math.exp(-t*180));
        phase+=twopi*(freq*(engage?(.96+.07*x):(1-.095*x)))/sr;
        noise+=.08*((rnd()*2-1)-noise);
        const mechanical=Math.sin(phase)+.29*Math.sin(phase*2.04+.3)
          +.17*Math.sin(phase*3.2+2);
        return amount*envelope*(.78*mechanical+.24*noise);
      });
    };
    // Weighted control actuator: a broad, downward-drifting low-mid body,
    // a dry damped contact and no ringing bell tones. On speakers that can't
    // reproduce the fundamental, its second/third harmonics carry the weight.
    // Unlike the old short knock, this body remains perceptible for ~160 ms.
    const actuator=(at,freq=76,amount=1,duration=.23)=>{
      let phase=0,contact=0,undertone=0;
      put(at,duration,t=>{
        const white=rnd()*2-1;
        contact+=.27*(white-contact);
        undertone+=.09*(white-undertone);
        const body=(1-Math.exp(-t*750))*Math.exp(-t*14.4);
        const hit=Math.exp(-t*170);
        const f=freq*(1+.22*Math.exp(-t*39));
        phase+=twopi*f/sr;
        const mass=.78*Math.sin(phase)+.41*Math.sin(phase*2+.17)
          +.15*Math.sin(phase*3.06+.8);
        const rough=.065*(contact+undertone);
        return amount*(body*(mass+rough)+hit*(.15*contact+.08*undertone));
      });
    };
    // The final seating contact is quieter and slightly delayed: a switch
    // bottoming out inside heavy plastic, not a sharp high-frequency click.
    const seat=(at,freq=108,amount=.28)=>actuator(at,freq,amount,.105);
    const p=Math.max(0,Math.min(1,bucket/28));
    // Each control expresses a *different physical mechanism*, not a
    // different envelope on a shared bright electronic note.
    switch(kind){
      case 'panel-open':
        friction(0,.27,.58,.66);coil(.025,.29,67,.33,true);
        actuator(.226,80,.76,.19);seat(.284,105,.18);
        friction(.27,.10,.16,.35);break;
      case 'panel-close':
        friction(0,.20,.43,.53,true);
        actuator(.137,76,.88,.20);seat(.205,100,.24);break;
      case 'select':
        actuator(0,91,.87,.19);seat(.058,107,.40);
        friction(.029,.074,.18,.45);break;
      case 'toggle-on':
        knock(0,91,.72,.13);friction(.022,.16,.35,.6);
        coil(.052,.19,81,.56,true);knock(.181,109,.65,.10);break;
      case 'toggle-off':
        coil(0,.125,83,.32,false);friction(.016,.10,.31,.48,true);
        knock(.088,76,1.0,.15);break;
      case 'slider': {
        // An almost-felt potentiometer track, not a sequence of clunks.
        // Keep the directional pitch contour but strongly reduce the body's
        // loudness and duration. The release is quieter than a button.
        const f=88+124*Math.pow(p,.82);
        knock(0,f,.25,.040);
        friction(0,.039,.12,.34+p*.28,p<.5);break;
      }
      case 'slider-end':
        friction(0,.048,.16,.37,true);
        knock(.020,94+104*p,.29,.069);break;
      case 'commit':
        actuator(0,78,1.22,.25);seat(.074,105,.38);
        friction(.035,.12,.29,.62);break;
      case 'reset':
        friction(0,.30,.62,.64,true);coil(.05,.30,63,.54,false);
        actuator(.224,71,1.05,.23);seat(.313,100,.34);break;
      case 'pause':
        actuator(0,76,1.0,.23);friction(.049,.11,.22,.32,true);break;
      case 'resume':
        actuator(0,82,.95,.21);coil(.025,.22,75,.48,true);
        seat(.169,108,.32);break;
      default:
        actuator(0,79,1.18,.25);seat(.076,112,.34);
        friction(.023,.094,.21,.54);break;
    }
    // Magnetic/tape-like overload in the sound itself. Stronger than the
    // former effect chain because the raw waveform *actually hits* it.
    // Gentle 1-pole damping prevents electronic sparkle and retains the
    // mid-bass harmonics required to hear weight on laptop speakers.
    let lp=0,high=0,peak=0;
    for(let i=0;i<n;i++){
      const driven=out[i]*2.55;
      const saturated=Math.tanh(driven+0.18*driven*Math.abs(driven));
      lp+=.34*(saturated-lp);
      high+=.028*(lp-high);
      out[i]=lp*.92+high*.08;
      peak=Math.max(peak,Math.abs(out[i]));
    }
    if(peak>.0001){
      const scale=Math.min(1.35,.74/peak);
      for(let i=0;i<n;i++)out[i]*=scale;
    }
    // Damping can leave a nonzero last sample, especially panel-close whose
    // body extends past its buffer. Window AFTER processing/normalization so
    // every buffer begins and ends at exact zero, at any playback rate.
    const attack=Math.max(2,Math.round(sr*.001)),release=Math.max(2,Math.round(sr*.005));
    for(let i=0;i<n;i++)out[i]*=Math.min(1,i/(attack-1),(n-1-i)/(release-1));
    this.uiFoleyCache.set(key,buffer);
    return buffer;
  }
  interfaceSound(kind='press',position=.5,control='') {
    if(this.mode==='off'||!this.ctx||!rain.interfaceSounds||rain.interfaceLevel<=0)return;
    if(this.ctx.state!=='running')this.ctx.resume().catch(()=>{});
    const p=Math.max(0,Math.min(1,Number(position)||0));
    const bucket=Math.round(p*28);
    const now=this.ctx.currentTime;
    if(kind==='slider'){
      if(control===this.lastSliderControl&&
        (now-(this.lastSliderAt??-Infinity)<.095||bucket===this.lastSliderBucket))return;
      this.lastSliderAt=now;this.lastSliderBucket=bucket;this.lastSliderControl=control;
    }
    const src=this.ctx.createBufferSource();
    src.buffer=this.uiFoleySample(kind,kind==='slider'||kind==='slider-end'?bucket:14);
    // Only buttons gain extra pitch diversity (~ +/-3.5%). Slider detents
    // and the approved checkbox ON/OFF timbres keep their v14 playback.
    src.playbackRate.value=BUTTON_KINDS.has(kind)
      ? .965+Math.random()*.07 : .985+Math.random()*.03;
    const gain=this.ctx.createGain();
    // Keep the established UI volume calibration: 50% has the amplitude
    // curve of the previous 25% setting. Score and cinematic SFX bypass it.
    const level=Math.pow(Math.max(.001,rain.interfaceLevel*.5),.73);
    // Sliders should recede behind the other controls; they sound often.
    // Button weight comes from its extended body, not a master volume boost.
    const foleyTrim=kind==='slider'?.39:kind==='slider-end'?.55:1;
    gain.gain.value=.79*level*foleyTrim;
    src.connect(gain).connect(this.uiBus);
    this.releaseVoice(src,[src,gain]);
    // Generating an uncached sample can take longer than the old 6 ms lead.
    // Read the audio clock again after synthesis, keeping its full attack.
    src.start(this.ctx.currentTime+.006);
  }
}


})();
