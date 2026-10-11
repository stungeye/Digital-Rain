(()=>{
const rain = RainApp.state;
// ─── ORIGINAL GENERATIVE SCORE / SOUNDS ────────────────────────────────
// WebAudio only. No streamed tracks, samples from the films, or external
// assets. SFX Only is armed by default; audio starts on the first gesture.
// Arrangement: low minor drone; granular electrical rain; spacious, sparse
// industrial/trip-hop percussion and an original minor ostinato.
// ─── SIGNAL ENGINE AUDIO / ORIGINAL PROCEDURAL SCORE ─────────────────────
// No recordings, samples or third-party sound libraries. A 134 BPM breakbeat
// with 32-bar arrangement, continuously varying drones, and restrained Foley.
window.SignalAudio = class SignalAudio {
  constructor() {
    this.ctx = null; this.mode = 'off'; this.volume = rain.volume;
    this.step = 0; this.nextStep = 0; this.nextAmbient = 0;
    this.timer = null; this.nodes = []; this.recentHits = [];
    this.scorePaused = rain.paused;
    this.schedulingScore = false;
    this.schedulingAmbient = false;
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
    this.scoreBus=ac.createGain();this.scoreBus.gain.value=this.scorePaused?0:1;
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
  setMode(mode) {
    if (mode !== 'off' && !this.ctx && !this.init()) { this.mode = 'off'; return; }
    const previousMode=this.mode;
    this.mode = mode;
    if (!this.ctx) return;
    // Resume during the actual user gesture. Do not await a promise before
    // scheduling gain/voices, or the first click's sound can be lost.
    if (mode !== 'off') this.ctx.resume().catch(()=>{});
    const ac = this.ctx, active = mode !== 'off';
    const ambientEnabled=mode==='ambience'||mode==='score';
    this.ambientBus.gain.cancelScheduledValues(ac.currentTime);
    if(ambientEnabled)this.ambientBus.gain.setTargetAtTime(1,ac.currentTime,.05);
    else this.ambientBus.gain.setValueAtTime(0,ac.currentTime);
    if(mode==='score' && previousMode!=='score') {
      this.step=0;
      this.nextStep=ac.currentTime+.07;
      this.recentHits=[];
    }
    this.setPaused(rain.paused);
    this.master.gain.setTargetAtTime(active ? this.volume * .52 : 0, ac.currentTime, active ? .018 : .12);
    this.droneGain.gain.setTargetAtTime(mode === 'effects' ? 0 : mode === 'score' ? .072 : .135, ac.currentTime, .25);
    this.airGain.gain.setTargetAtTime(mode === 'effects' ? 0 : mode === 'score' ? .019 : .043, ac.currentTime, .35);
    this.underGain.gain.setTargetAtTime(mode === 'effects' ? 0 : .019, ac.currentTime, .35);
    if (active && !this.timer) {
      this.nextStep = ac.currentTime + .07;
      this.nextAmbient = ac.currentTime + 3;
      this.timer = setInterval(() => this.schedule(), 35);
    }
    if (!active && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  setPaused(paused) {
    this.scorePaused=Boolean(paused);
    this.recentHits.length=0;
    if(!this.ctx)return;
    const t=this.ctx.currentTime;
    this.scoreBus.gain.setTargetAtTime(this.scorePaused?0:1,t,.012);
    // The sequencing position stays fixed while paused. The next note is
    // resynchronized to audio time on resume (no burst of skipped beats).
    this.nextStep=t+.075;
  }
  schedule() {
    if (!this.ctx || this.mode === 'off' || this.ctx.state !== 'running') return;
    const ac = this.ctx, beat = 60 / 134 / 4;
    if(this.mode==='score' && this.scorePaused) {
      this.nextStep=ac.currentTime+.075;
      return;
    }
    if (this.nextStep < ac.currentTime - .35) this.nextStep = ac.currentTime + .02;
    let n = 0;
    while (this.nextStep < ac.currentTime + .17 && n++ < 10) {
      if (this.mode === 'score') {
        this.schedulingScore=true;
        try { this.scoreStep(this.nextStep, this.step); }
        finally { this.schedulingScore=false; }
      }
      this.nextStep += beat; this.step++;
    }
    // Incommensurate, randomized quiet events, not a repeating one-bar chirp.
    if (ac.currentTime + .17 >= this.nextAmbient) {
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
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t + attack + decay);
  }
  connectVoice(node, gain, pan = 0) {
    node.connect(gain);
    const bus=this.schedulingScore?this.scoreBus:
      this.schedulingAmbient?this.ambientBus:this.master;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = pan;
      gain.connect(p).connect(bus);
    } else gain.connect(bus);
  }
  tone(t, freq, dur, type = 'sine', amp = .12, endFreq = null, lowpass = 0, pan = 0) {
    if (!this.ctx || this.mode === 'off') return;
    const ac = this.ctx, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(Math.max(1, freq), t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq),t+dur);
    this.env(g,t,amp,.006,Math.max(.035,dur-.006));
    if (lowpass) {
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass;
      o.connect(f); this.connectVoice(f,g,pan);
    } else this.connectVoice(o,g,pan);
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
    s.connect(f); this.connectVoice(f,g,pan);
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
  scoreStep(t, tick) {
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
      s.connect(f);this.connectVoice(f,g,position);
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
      o.connect(f);this.connectVoice(f,g,pan*.35);
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
    source.connect(filter).connect(g).connect(this.master);
    source.start(t,Math.random()*(this.noise.duration-2)); source.stop(t+1.81);
    this.tone(t,57,1.25,'sine',.24,43);
    for(let i=0;i<6;i++)
      this.filteredNoise(t+.18+i*.21,.07,.06,1300+i*340,.72, i%2?.45:-.45);
  }
  breach() {
    if (this.mode==='off'||!this.ctx) return;
    const t=this.ctx.currentTime+.01;
    this.tone(t,67,1.24,'sine',.53,26);
    this.filteredNoise(t+.13,.99,.24,290,.25);
    for(let i=0;i<7;i++)this.filteredNoise(t+.32+i*.15,.057,.038,430+i*135,.67,Math.random()-.5);
    this.filteredNoise(t+1.52,.64,.095,580,.27);
  }
  // ─── SHIPBOARD INTERFACE FOLEY / v14 ──────────────────────────────────
  // Controls feel like physical shipboard hardware. v14 retains the v13
  // toggle samples byte-for-byte; slider detents are smaller and less frequent,
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
      for(let j=0;j<samples;j++){
        const t=j/sr, v=voice(t,j,samples);
        if(Number.isFinite(v))out[start+j]+=v;
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
    const buttonKinds=new Set(['press','select','commit','reset',
      'pause','resume','panel-open','panel-close']);
    src.playbackRate.value=buttonKinds.has(kind)
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
    src.onended=()=>{src.disconnect();gain.disconnect();};
    src.start(now+.006);
  }
}


})();
