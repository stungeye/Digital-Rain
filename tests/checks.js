/* Dependency-free logic/routing regression checks: node tests/checks.js.
 * Canvas is a recording mock, WebAudio is a connection/parameter mock.
 * These checks do not establish browser appearance, GPU behavior or sound.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function harness({coarse = false, reduced = false, ready = 'loading', userAgent = '', omittedIds = []} = {}) {
  let now = 1000, seed = 123456, renders = 0, randomCalls = 0, fontReady;
  const listeners = new Map(), elements = new Map(), canvasCalls = [], animationFrames = [];
  const markup=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const markupIds=new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  for(const id of omittedIds)markupIds.delete(id);
  const math = Object.create(Math);
  math.random = () => { randomCalls++; return ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); };
  function eventTarget(target = {}) {
    target.addEventListener = (type, fn) => {
      const key = [target, type];
      let entry = [...listeners].find(([k]) => k[0] === target && k[1] === type);
      if (!entry) { listeners.set(key, []); entry = [key, listeners.get(key)]; }
      entry[1].push(fn);
    };
    target.dispatchEvent = event => {
      for (const [key, fns] of listeners) if (key[0] === target && key[1] === event.type)
        for (const fn of fns) fn(event);
      return true;
    };
    return target;
  }
  function element(tag = 'div') {
    const el = eventTarget({tagName: tag.toUpperCase(), style: {}, dataset: {}, value: '1',
      children: [], attributes: {}, checked: false, classList: (()=>{const classes=new Set();return {add(name){classes.add(name);},remove(name){classes.delete(name);},toggle(name){if(classes.has(name)){classes.delete(name);return false;}classes.add(name);return true;},contains(name){return classes.has(name);}};})(),
      appendChild(child){child.parentElement = this;this.children.push(child);},
      setAttribute(k,v){this.attributes[k] = String(v);},getAttribute(k){return this.attributes[k];},
      closest(){return null;},contains(other){return other===this;},focus(){},
      getBoundingClientRect(){return {left:0,top:0,width:640,height:360};},
      setPointerCapture(){},releasePointerCapture(){},hasPointerCapture(){return false;},remove(){},
    });
    if (tag === 'canvas') {
      const ctx = {canvas: el, globalAlpha: 1,
        createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),
        createPattern:()=>({}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
        drawImage(...args){canvasCalls.push({canvas:el,args});},
        fillRect(){if(el.id==='defaultCanvas0')renders++;},
        save(){},restore(){},translate(){},scale(){},fillText(){},clearRect(){},putImageData(){},
      };
      el.getContext = type => type==='2d' ? ctx : null;
      el.width=640;el.height=360;
    }
    return el;
  }
  const document = eventTarget({readyState:ready,hidden:false,
    createElement:element,getElementById(id){if(!markupIds.has(id))return null;if(!elements.has(id))elements.set(id,element());return elements.get(id);},
    querySelector(){return null;},querySelectorAll(selector){
      const key=selector.match(/^\[data-(grade|crt|audio)\]$/)?.[1];
      if(!key)return [];
      return [...markup.matchAll(new RegExp(`data-${key}="([^"]+)"`,'g'))].map(match=>{
        const id=`data-${key}-${match[1]}`;
        if(!elements.has(id)){
          const button=element('button');button.dataset[key]=match[1];elements.set(id,button);
        }
        return elements.get(id);
      });
    },
    write(){throw Error('startup must not inject external scripts');},
    documentElement:element(),body:element(),fonts:{ready:{then(fn){fontReady=fn;}}},
  });
  const media = new Map();
  class Param {
    constructor(value=0){this.value=value;this.calls=[];}
    setTargetAtTime(v,t,c){this.value=v;this.calls.push(['target',v,t,c]);}
    setValueAtTime(v,t){this.value=v;this.calls.push(['set',v,t]);}
    linearRampToValueAtTime(v,t){this.value=v;this.calls.push(['linear',v,t]);}
    exponentialRampToValueAtTime(v,t){this.value=v;this.calls.push(['exp',v,t]);}
    cancelScheduledValues(){}
  }
  class AudioNode {
    constructor(kind){this.kind=kind;this.edges=[];for(const key of ['gain','frequency','Q','threshold','knee','ratio','attack','release','detune','playbackRate','pan'])this[key]=new Param();}
    connect(node){this.edges.push(node);return node;} disconnect(){this.edges=[];}
    start(...args){this.startArgs=args;} stop(...args){this.stopArgs=args;}
  }
  class AudioContext {
    constructor(options){this.options=options;this.currentTime=0;this.sampleRate=1000;this.state='running';this.destination=new AudioNode('destination');this.createdNodes=[];}
    node(kind){const node=new AudioNode(kind);this.createdNodes.push(node);return node;}
    createGain(){return this.node('gain');}createDynamicsCompressor(){return this.node('compressor');}
    createBiquadFilter(){return this.node('filter');}createOscillator(){return this.node('oscillator');}
    createBufferSource(){return this.node('buffer');}createStereoPanner(){return this.node('panner');}
    createWaveShaper(){return this.node('waveshaper');}
    createBuffer(channels,length,sampleRate=this.sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return {duration:length/sampleRate,getChannelData:i=>data[i]};}
    resume(){return Promise.resolve();}
  }
  const sandbox = eventTarget({console,Math:math,document,navigator:{maxTouchPoints:coarse?1:0,userAgent},
    performance:{now:()=>now},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
    requestAnimationFrame(fn){animationFrames.push(fn);return animationFrames.length;},
    AudioContext,URLSearchParams,location:{search:'',href:'file:///index.html'},innerWidth:640,innerHeight:360,
    matchMedia(query){if(!media.has(query))media.set(query,eventTarget({matches:query.includes('reduced-motion')?reduced:query.includes('coarse')?coarse:false}));return media.get(query);},
    width:640,height:360,windowWidth:640,windowHeight:360,millis:()=>now,pixelDensity(){},frameRate(){},
    background(){renders++;},
  });
  sandbox.window=sandbox;
  sandbox.createCanvas=(w,h)=>{const canvas=element('canvas');canvas.id='defaultCanvas0';canvas.width=w;canvas.height=h;sandbox.drawingContext=canvas.getContext('2d');return {elt:canvas,parent:node=>node.appendChild(canvas)};};
  sandbox.createGraphics=(w,h)=>{const canvas=element('canvas');canvas.width=w;canvas.height=h;return {canvas,drawingContext:canvas.getContext('2d'),pixelDensity(){},clear(){},remove(){}};};
  sandbox.resizeCanvas=(w,h)=>{sandbox.width=w;sandbox.height=h;sandbox.drawingContext.canvas.width=w;sandbox.drawingContext.canvas.height=h;};
  const context=vm.createContext(sandbox);
  const run=source=>vm.runInContext(source,context);
  for(const file of ['rain','crt','audio','ui'])vm.runInContext(fs.readFileSync(path.join(root,'js',file+'.js'),'utf8'),context,{filename:file+'.js'});
  return {run,sandbox,canvasCalls,animationFrames,media,elements,advance(ms=17){now+=ms;},get renders(){return renders;},
    get randomCalls(){return randomCalls;},resolveFonts(){fontReady?.();},
    snapshot:()=>run(`JSON.stringify({simulationTime,frameNumber,pulseSeq,pulses,signalAt,breachAt,hover,
      planes:planes.map(p=>p.lanes.map(l=>({x:l.x,active:l.active,nextGap:l.nextGap,
        streams:l.streams.map(s=>({head:s.head,length:s.length,speed:s.speed,progress:s.progress,cells:[...s.cells]}))})))})`)};
}

function check(name, body){body();console.log('PASS '+name);}

check('music toggle and panel modes synchronize through clicks, mute and reset', () => {
  const h=harness();h.run('setup()');
  const button=h.elements.get('music-toggle');
  const click=()=>button.dispatchEvent({type:'click'});
  const selected=mode=>h.elements.get(`data-audio-${mode}`).getAttribute('aria-pressed');
  assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.equal(h.elements.get('humVolume').disabled,true);
  assert.equal(h.elements.get('scoreVolume').disabled,true);
  assert.equal(h.run('soundEngine.ctx'),null,'music starts off without autoplay');
  click();assert.equal(h.run('rain.audio'),'score');
  assert.equal(button.getAttribute('aria-pressed'),'true');
  assert.equal(selected('score'),'true');assert.equal(selected('effects'),'false');
  assert.equal(h.elements.get('humVolume').disabled,false);
  assert.equal(h.elements.get('scoreVolume').disabled,false);
  click();assert.equal(h.run('rain.audio'),'effects');
  assert.equal(button.getAttribute('aria-pressed'),'false');assert.equal(selected('effects'),'true');
  assert.equal(h.elements.get('humVolume').disabled,true);
  assert.equal(h.elements.get('scoreVolume').disabled,true);
  h.elements.get('data-audio-score').dispatchEvent({type:'click'});
  assert.equal(button.getAttribute('aria-pressed'),'true');
  h.run('RainApp.toggleMute()');assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.equal(h.elements.get('humVolume').disabled,true);
  assert.equal(h.elements.get('scoreVolume').disabled,true);
  h.run('RainApp.toggleMute()');assert.equal(button.getAttribute('aria-pressed'),'true');
  h.elements.get('data-audio-ambience').dispatchEvent({type:'click'});
  assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.equal(h.elements.get('humVolume').disabled,false);
  assert.equal(h.elements.get('scoreVolume').disabled,true);
  click();assert.equal(h.run('rain.audio'),'score');
  h.run('resetRain()');assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.equal(h.elements.get('humVolume').disabled,true);
  assert.equal(h.elements.get('scoreVolume').disabled,true);
});

check('hum and score sliders independently retain levels across pause, profiles and modes', () => {
  const h=harness();h.run('setup()');
  for(const [id,value] of [['humVolume',.3],['scoreVolume',.6]]){
    const slider=h.elements.get(id);slider.value=String(value);slider.dispatchEvent({type:'input'});
  }
  assert.equal(h.run('soundEngine.ctx'),null,'volume changes do not activate audio');
  h.run('setRainOption("audio","score")');
  const engine=h.run('soundEngine');
  const levels=()=>{
    assert.equal(engine.ambientBus.gain.value,.3);assert.equal(engine.scoreBus.gain.value,.6);
  };
  levels();const master=engine.master.gain.value,ui=engine.uiBus.gain.value;
  const humBed=()=>[engine.droneGain.gain.value,engine.airGain.gain.value,engine.underGain.gain.value];
  const scoreHumBed=humBed();
  h.elements.get('data-audio-ambience').dispatchEvent({type:'click'});
  assert.deepEqual(humBed(),scoreHumBed,'Code Hum preserves the same source levels as Score + Hum');
  assert.equal(engine.ambientBus.gain.value,.3);
  h.elements.get('data-audio-score').dispatchEvent({type:'click'});
  assert.deepEqual(humBed(),scoreHumBed,'enabling score does not lower the hum behind its slider');
  assert.equal(h.elements.get('humVolume').value,.3);levels();
  h.run('setRainOption("humVolume",0)');assert.equal(engine.ambientBus.gain.value,0);
  assert.equal(engine.scoreBus.gain.value,.6);assert.equal(engine.master.gain.value,master);
  assert.equal(engine.uiBus.gain.value,ui);
  h.run('setRainOption("humVolume",.3);setRainOption("paused",true);setRainOption("scoreVolume",.4)');
  assert.equal(engine.scoreBus.gain.value,0);assert.equal(engine.ambientBus.gain.value,.3);
  h.run('setRainOption("paused",false)');assert.equal(engine.scoreBus.gain.value,.4);
  h.run('setRainOption("scoreVolume",.6);setRainOption("grade","abyss")');levels();
  h.run('setRainOption("audio","effects")');
  assert.equal(engine.scoreBus.gain.value,0);assert.equal(engine.ambientBus.gain.value,0);
  h.run('setRainOption("audio","score")');levels();
  h.run('resetRain();setRainOption("audio","score")');
  assert.equal(engine.scoreBus.gain.value,1);assert.equal(engine.ambientBus.gain.value,.5);
  assert.equal(h.elements.get('humVolume').value,.5);
  assert.equal(h.elements.get('humVolume-value').textContent,'50%');
});

check('panel text can be removed while controls keep synchronizing', () => {
  const h=harness({omittedIds:['grade-help','crt-help','audio-help','density-value','notify','status','audio-status']});
  h.sandbox.document.dispatchEvent({type:'DOMContentLoaded'});
  h.run('setRainOption("crt","glass");setRainOption("audio","score");setRainOption("grade","abyss");setRainOption("density",1.5);setRainOption("paused",true)');
  assert.equal(h.elements.get('density').value,1.5);
  assert.equal(h.elements.get('density').attributes['aria-valuetext'],h.run('RainApp.settings.density.format(1.5)'));
  assert.equal(h.elements.get('curvature').disabled,false);
  assert.equal(h.elements.get('beatReactive').disabled,false);
  assert.equal(h.elements.get('pause-btn').textContent,'RESUME SIGNAL');
  h.elements.get('reseed-btn').dispatchEvent({type:'click'});
});

// Test cases below exercise production source through its public setters and
// actual simulation/display/audio methods rather than copied implementations.
check('ordered scripts initialize exactly once with desktop and mobile Canvas runtime', () => {
  for (const coarse of [false,true]) for (const ready of ['loading','complete']) {
    const h=harness({coarse,ready});
    if(ready==='loading')assert.equal(h.run('planes.length'),0,'no premature setup while scripts load');
    h.sandbox.document.dispatchEvent({type:'DOMContentLoaded'});h.advance();h.run('draw()');
    assert.ok(h.run('planes.length === 3 && planes.every(p=>p.lanes.length>0)'));
    assert.ok(h.renders>0);
    assert.equal(h.run('displayEngine.mode'),'glass','curved CRT is active from startup');
    assert.equal(h.run('displayEngine.output.style.display'),'block');
    assert.equal(h.run('displayEngine.source.style.opacity'),'0');
    assert.equal(h.sandbox.__rainCanvasRuntime,true);
    const state=h.snapshot();
    const frameRequests=h.animationFrames.length;
    h.run('installRainCanvasRuntime()');
    h.sandbox.document.dispatchEvent({type:'DOMContentLoaded'});
    assert.equal(h.snapshot(),state,'reinstallation and repeated readiness do not reset the scene');
    assert.equal(h.animationFrames.length,frameRequests,'startup cannot schedule duplicate animation loops');
    assert.equal(h.elements.get('rain').children.filter(el=>el.id==='defaultCanvas0').length,1);
    assert.equal(h.run('soundEngine.ctx'),null,'startup does not activate audio');
  }
});

check('frame pacing retains refresh cadence through timestamp rounding, jitter and stalls', () => {
  for(const coarse of [false,true])for(const hz of [60,120,144]) {
    const h=harness();
    h.sandbox.document.dispatchEvent({type:'DOMContentLoaded'});
    h.run(`frameRate(${coarse?30:60});globalThis.pacedFrames=0;window.draw=()=>pacedFrames++`);
    let timestamp=1000;
    const tick=time=>h.animationFrames.splice(0).forEach(callback=>callback(time));
    tick(timestamp);
    const before=h.run('pacedFrames');
    for(let i=1;i<=hz*2;i++) {
      // Quantized refresh timestamps plus small alternating delivery jitter.
      tick(Math.round((timestamp+i*1000/hz+(i%2?.12:-.12))*10)/10);
    }
    assert.ok(Math.abs(h.run('pacedFrames')-before-(coarse?60:120))<=1,
      `${coarse?30:60} FPS stays stable on ${hz} Hz: ${h.run('pacedFrames')-before}`);
    timestamp+=2500;
    const stalled=h.run('pacedFrames');tick(timestamp);
    assert.equal(h.run('pacedFrames'),stalled+1,'a stall draws once without a catch-up burst');
    tick(timestamp+.1);
    assert.equal(h.run('pacedFrames'),stalled+1,'no immediate duplicate after a stall');
  }
});

check('all profiles keep lane ownership and two dark rows at maximum density and speed', () => {
  const h=harness();h.run('setup(); setRainOption("density", 1.65); setRainOption("speed", 2.5)');
  const verify=()=>h.run(`(()=>{
    const xs=new Set();
    for(const p of planes)for(const lane of p.lanes){
      if(xs.has(lane.x))throw Error('horizontal lane shared across depths');xs.add(lane.x);
      const occupied=new Set();
      for(let i=0;i<lane.streams.length;i++){
        const s=lane.streams[i];
        if(i){const below=lane.streams[i-1];if(below.head-below.length-s.head<2)throw Error('less than two dark rows');}
        for(const row of s.cells.keys()){if(occupied.has(row))throw Error('overlapping occupied cells');occupied.add(row);}
      }
    }
    return true;
  })()`);
  assert.ok(verify());
  for(const profile of ['cinema','abyss','voltage','anomaly']){
    h.run(`setRainOption('grade','${profile}')`);
    h.run('setRainOption("density",1.65);setRainOption("speed",2.4)');
    for(let i=0;i<1800;i++){
      h.run('updateSimulation(.055)');
      assert.ok(verify());
    }
  }
});

check('independent stream speeds stay in range and faster followers wait for lifetime clearance', () => {
  const h=harness();h.run(`setup();setRainOption('density',1.65);
    const lane=planes[1].lanes[0], cfg=lane.plane.config;
    lane.active=true;lane.phase=0;lane.rhythm=1;
    lane.streams=[];lane.nextGap=2;
    const slow=new CodeStream(lane.plane,0);
    slow.speed=cfg.advanceMin;slow.progress=0;slow.length=20;slow.place(0);
    const fast=new CodeStream(lane.plane,lane.plane.minRow-1);
    fast.speed=cfg.advanceMax;fast.progress=.9;lane.pending=fast;
    lane.streams.push(slow);`);
  h.run('lane.update(.001,0)');
  assert.ok(h.run('lane.pending===fast && lane.streams.length===1'),'fast follower waits');
  const births=h.run(`(()=>{
    const speeds=new Map([[slow,slow.speed]]);let births=0;
    for(let tick=0;tick<5000;tick++){
      if(tick===80){innerHeight=1200;windowResized();}
      if(tick===160){innerHeight=1800;windowResized();}
      if(tick%200===0){setRainOption('speed',tick%400===0?.2:2.4);signalAt=simulationTime;}
      updateSimulation(.055);
      for(const plane of planes)for(const lane of plane.lanes){
        const occupied=new Set();
        for(let i=0;i<lane.streams.length;i++){
          const s=lane.streams[i],cfg=plane.config;
          if(s.speed<cfg.advanceMin||s.speed>cfg.advanceMax)throw Error('speed out of range');
          if(speeds.has(s)&&speeds.get(s)!==s.speed)throw Error('base speed drifted');
          if(!speeds.has(s)){speeds.set(s,s.speed);births++;}
          if(i){const below=lane.streams[i-1];if(below.head-below.length-s.head<2)throw Error('follower caught trail');}
          for(const row of s.cells.keys()){if(occupied.has(row))throw Error('overlapping cells');occupied.add(row);}
        }
      }
      if(lane.pending && lane.pending===fast && fast.speed!==cfg.advanceMax)throw Error('waiting speed rerolled');
    }
    return births;
  })()`);
  assert.ok(births>100,'repeated births exercise the scheduler');
  assert.ok(h.run('new Set(lane.streams.map(s=>s.speed)).size>1 || lane.pending.speed!==lane.streams[0].speed'),
    'one column has independently sampled speeds');
});

check('profile presets synchronize editable code sliders and preserve existing streams', () => {
  const h=harness();h.run('setup()');
  h.run('globalThis.originalLane=planes[1].lanes[0];globalThis.originalStream=originalLane.streams[0]');
  const travel={};
  const presets={
    cinema:{density:1.05,persistence:1.25,speed:1,mutation:1,glow:1},
    abyss:{density:.75,persistence:1.25,speed:.64,mutation:.55,glow:.42},
    voltage:{density:1.4,persistence:.85,speed:1.42,mutation:1.6,glow:1.75},
    anomaly:{density:1.2,persistence:.65,speed:1.05,mutation:1.85,glow:.85},
  };
  h.run('setRainOption("zoom",1.5)');
  for(const profile of ['cinema','abyss','voltage','anomaly']){
    h.elements.get(`data-grade-${profile}`).dispatchEvent({type:'click'});
    assert.ok(h.run('planes[1].lanes[0]===originalLane && originalLane.streams[0]===originalStream'));
    assert.equal(h.run('rain.zoom'),1.5,'camera framing survives profile changes');
    for(const [name,value] of Object.entries(presets[profile])){
      assert.equal(h.run(`rain.${name}`),value);
      if(name==='mutation')continue; // No mutation slider in this panel.
      assert.equal(Number(h.elements.get(name).value),value);
      assert.equal(h.elements.get(name+'-value').textContent,Math.round(value*100)+'%');
      assert.equal(h.elements.get(name).getAttribute('aria-valuetext'),Math.round(value*100)+'%');
    }
    assert.ok(h.run('planes.every(p=>p.lanes.every(l=>l.active===(l.lottery<laneDensity())))'));
    travel[profile]=h.run(`(()=>{
      const lane=originalLane;lane.active=true;originalStream.progress=0;lane.phase=0;lane.rhythm=1;
      lane.update(.001,0);const a=originalStream.progress;
      originalStream.progress=0;lane.update(.001,770);return [a,originalStream.progress/a];
    })()`);
  }
  assert.ok(travel.abyss[0]<travel.cinema[0]*.7,'Deep drifts slower');
  assert.ok(travel.voltage[0]>travel.cinema[0]*1.3,'Overdrive falls faster');
  assert.ok(travel.anomaly[1]>1.4,'Anomaly has a strong uneven cadence');
  assert.ok(travel.abyss[1]<1.04,'Deep has a gentle cadence');
  for(const [name,value] of [['density',.9],['persistence',1.1],['speed',.8],['glow',.6]]){
    const slider=h.elements.get(name);slider.value=String(value);slider.dispatchEvent({type:'input'});
    assert.equal(h.run(`rain.${name}`),value,'slider edits the actual setting');
  }
  h.elements.get('data-grade-anomaly').dispatchEvent({type:'click'});
  assert.equal(h.run('rain.speed'),.8,'reselecting the active profile retains edits');
  const motion=()=>h.run(`(()=>{
    originalLane.active=true;originalStream.progress=0;originalLane.phase=0;originalLane.rhythm=1;
    originalLane.update(.001,0);return originalStream.progress/originalStream.speed/.001;
  })()`);
  assert.ok(Math.abs(motion()-.8)<1e-9,'velocity slider has no hidden profile multiplier');
  h.run('handleRainShortcut({key:"c",preventDefault(){},stopImmediatePropagation(){}})');
  assert.equal(h.run('rain.grade'),'voltage');
  assert.equal(Number(h.elements.get('speed').value),1.42,'keyboard profile selection also syncs sliders');
  h.run('resetRain()');
  assert.equal(Number(h.elements.get('density').value),1.05);
  assert.equal(Number(h.elements.get('speed').value),1);
  assert.equal(Number(h.elements.get('persistence').value),1.25);
  assert.equal(Number(h.elements.get('glow').value),1);
  assert.equal(h.elements.get('grade-help').textContent,'Classic emerald trails with bright heads.');
});

check('Canvas CRT pointer conversion agrees with actual strip draw destinations', () => {
  const h=harness();h.run('setup(); displayEngine.setMode("glass"); displayEngine.present(drawingContext.canvas)');
  const strips=h.canvasCalls.filter(c=>c.args.length===9 && c.args[0]===h.sandbox.drawingContext.canvas);
  assert.ok(strips.length>10);
  let coveredY=0;
  for(const strip of strips) {
    const [source,sx,sy,sw,sh,dx,dy,dw,dh]=strip.args;
    assert.equal(dy,coveredY,'strips leave no vertical gaps');
    assert.ok(dx<=0&&dx+dw>=640,'curved strip covers both viewport edges');
    coveredY+=dh;
  }
  assert.equal(coveredY,360,'curved image reaches bottom corners');
  // A source lane right of centre must bow outward at the vertical midpoint,
  // not at the corners. Coverage alone missed the previous concave regression.
  const laneOutputX=strip=>strip.args[5]+strip.args[7]*.75;
  assert.ok(laneOutputX(strips[Math.floor(strips.length/2)])>laneOutputX(strips[0]),
    'Canvas glass bows vertical source lanes outward at the middle');
  for(const strip of [strips[0],strips[Math.floor(strips.length/2)],strips.at(-1)]){
    const [source,sx,sy,sw,sh,dx,dy,dw]=strip.args;
    for(const fraction of [0,.1,.5,.9,1]){
      const x=dx+dw*fraction;
      const result=h.run(`displayEngine.screenToSource(${x},${dy})`);
      assert.ok(Math.abs(result.x-(sx+sw*fraction))<1e-7);
      assert.equal(result.y,sy);
    }
  }
  for(const webgl of [false,true]) {
    h.run(`displayEngine.gl=${webgl?'{}':'null'}; displayEngine.setMode("glass")`);
    const middle=h.run('displayEngine.screenToSource(width*.75,height*.5)');
    const top=h.run('displayEngine.screenToSource(width*.75,0)');
    assert.ok(middle.x<top.x,'convex inverse mapping samples nearer centre at mid-height');
    for(let y=0;y<=360;y+=18)for(let x=0;x<=640;x+=32) {
      const source=h.run(`displayEngine.screenToSource(${x},${y})`);
      assert.ok(source.x>=-1e-7&&source.x<=640+1e-7&&source.y>=-1e-7&&source.y<=360+1e-7,
        'every output edge/corner samples inside the source image');
    }
  }
  const center=h.run('displayEngine.screenToSource(width/2,height/2)');
  assert.equal(center.x,320);assert.equal(center.y,180);
  // Shader path symmetry/finite checks; this is not a GPU-rendered alignment test.
  for(const [x,y] of [[0,0],[640,360],[64,36]]){
    const a=h.run(`displayEngine.screenToSource(${x},${y})`);
    const b=h.run(`displayEngine.screenToSource(${640-x},${360-y})`);
    assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y));
    assert.ok(Math.abs(a.x+b.x-640)<1e-7&&Math.abs(a.y+b.y-360)<1e-7);
  }
});

check('curvature preserves coverage and pointer alignment across its range', () => {
  const h=harness();h.run('setup();setRainOption("crt","glass")');
  for(const curvature of [0,.5,1,2]) {
    h.run(`displayEngine.gl=null;setRainOption("curvature",${curvature})`);
    h.canvasCalls.length=0;h.run('displayEngine.present(drawingContext.canvas)');
    const strips=h.canvasCalls.filter(c=>c.args.length===9&&c.args[0]===h.sandbox.drawingContext.canvas);
    assert.ok(strips.length>10);
    for(const strip of strips) {
      const [source,sx,sy,sw,sh,dx,dy,dw]=strip.args;
      assert.ok(dx<=0&&dx+dw>=640);
      for(const fraction of [0,.5,1]) {
        const point=h.run(`displayEngine.screenToSource(${dx+dw*fraction},${dy})`);
        assert.ok(Math.abs(point.x-(sx+sw*fraction))<1e-7);
        assert.equal(point.y,sy);
      }
    }
    for(const gl of ['null','{}']) {
      h.run(`displayEngine.gl=${gl}`);
      for(const [x,y] of [[0,0],[640,360],[0,180],[480,180],[64,36]]) {
        const point=h.run(`displayEngine.screenToSource(${x},${y})`);
        assert.ok(point.x>=-1e-7&&point.x<=640+1e-7&&point.y>=-1e-7&&point.y<=360+1e-7);
        if(curvature===0){assert.ok(Math.abs(point.x-x)<1e-7);assert.ok(Math.abs(point.y-y)<1e-7);}
      }
    }
  }
});

check('scanline spacing and thickness grow visibly above normal zoom in both CRT modes', () => {
  const h=harness();h.run(`setup();setRainOption('paused',true);
    const scanMasks=[];
    displayEngine.ctx.fillRect=function(x,y,w,height){
      if(String(this.fillStyle).startsWith('rgba(0,0,0,'))scanMasks.push({y,height});
    };`);
  for(const mode of ['scan','glass']) {
    let baseline;
    for(const zoom of [.65,1,1.5,2]) {
      h.run(`setRainOption('crt','${mode}');setRainOption('zoom',${zoom});scanMasks.length=0;displayEngine.present(drawingContext.canvas)`);
      const masks=h.run('scanMasks'),thickness=masks[0].height,spacing=masks[1].y-masks[0].y;
      assert.ok(Math.abs(spacing/thickness-2.7/1.25)<1e-9,'spacing and thickness keep the same proportion at every zoom');
      assert.equal(thickness,1.25*Math.max(1,zoom),'scanline thickness follows glyph height above 100%');
      if(zoom===2){assert.equal(thickness,2.5,'full zoom doubles the dark-band width');assert.equal(spacing,5.4,'full zoom doubles the spacing');}
      if(zoom===.65)baseline=JSON.stringify(masks);
      if(zoom===1)assert.equal(JSON.stringify(masks),baseline,'normal and smaller zoom retain original scanlines');
      if(zoom>1){assert.ok(thickness>1);assert.ok(thickness<=2.5);assert.ok(masks.length<JSON.parse(baseline).length);}
      // Exercise the shader presentation path to verify it receives the same scale.
      h.run(`{const savedGL=displayEngine.gl,savedUniforms=displayEngine.uniforms;
        window.scanUniforms={};displayEngine.uniforms={u_scanScale:'scale'};
        displayEngine.gl={activeTexture(){},bindTexture(){},texImage2D(){},uniform2f(){},
          uniform1f(name,value){scanUniforms[name]=value;},drawArrays(){}};
        displayEngine.present(drawingContext.canvas);
        displayEngine.gl=savedGL;displayEngine.uniforms=savedUniforms;}`);
      assert.ok(Math.abs(h.run('scanUniforms.scale')-spacing/2.7)<1e-9);
      assert.equal(1.25*h.run('scanUniforms.scale'),thickness);
      if(zoom===2)assert.equal(h.run('scanUniforms.scale'),2,'desktop raster doubles with glyph height at full zoom');
    }
  }
});

check('polished defaults reset and canvas interaction closes the panel', () => {
  const h=harness();h.run('setup()');
  for(const [name,value] of [['grain',.35],['crt','glass'],['scanStrength',.85],['interfaceLevel',.4],['mutation',1],['curvature',1]])
    assert.equal(h.run(`getRainOptions().${name}`),value);
  const panel=h.elements.get('panel'),toggle=h.elements.get('toggle');
  toggle.dispatchEvent({type:'click'});
  assert.equal(panel.classList.contains('open'),true);
  assert.equal(toggle.attributes['aria-expanded'],'true');
  assert.equal(toggle.attributes['aria-label'],'Close system panel');
  h.run('setRainOption("paused",true)');
  h.elements.get('rain').dispatchEvent({type:'pointerdown',pointerType:'mouse',button:0,clientX:10,clientY:10});
  assert.equal(panel.classList.contains('open'),false);
  assert.equal(toggle.attributes['aria-expanded'],'false');
  assert.equal(toggle.attributes['aria-label'],'Open system panel');
  h.run('setRainOption("curvature",2);setRainOption("grain",1);resetRain()');
  assert.equal(h.run('rain.curvature'),1);assert.equal(h.run('rain.grain'),.35);
});

check('zero film strength disables grain and slider and shortcut restore it', () => {
  const h=harness();h.run(`setup();setRainOption('audio','off');
    let grainDraws=0;
    const originalFill=drawingContext.fillRect;
    drawingContext.fillRect=function(...args){if(this.fillStyle===filmPattern)grainDraws++;originalFill.apply(this,args);};
    setRainOption('grain',0);renderScene();`);
  assert.equal(h.run('grainDraws'),0);
  const slider=h.elements.get('grain');
  assert.notEqual(slider.disabled,true,'slider remains available at zero');
  slider.value='0.5';slider.dispatchEvent({type:'input'});
  h.run('renderScene()');assert.equal(h.run('grainDraws'),1);
  const key=()=>h.sandbox.dispatchEvent({type:'keydown',key:'t',target:slider,preventDefault(){},stopImmediatePropagation(){}});
  key();assert.equal(h.run('rain.grain'),0);
  key();assert.equal(h.run('rain.grain'),.35);
  assert.equal(h.sandbox.document.getElementById('texture'),null);
});

check('SFX Only gates every ambient source independently of LFO modulation', () => {
  const h=harness();h.run('setup(); soundEngine.setMode("effects")');
  const engine=h.run('soundEngine');
  assert.ok(engine.ambientBus,'dedicated ambient gate exists');
  function reaches(start,target,blocked=new Set(),seen=new Set()){
    if(blocked.has(start)||seen.has(start))return false;
    if(start===target)return true;
    seen.add(start);return start.edges?.some(n=>reaches(n,target,blocked,seen))||false;
  }
  for(const source of [engine.droneGain,engine.airGain,engine.underGain]){
    assert.ok(reaches(source,engine.ambientBus));
    assert.equal(reaches(source,engine.master,new Set([engine.ambientBus])),false,'ambient cannot bypass gate');
  }
  assert.ok(reaches(engine.uiBus,engine.master,new Set([engine.ambientBus])));
  assert.ok(reaches(engine.scoreBus,engine.master,new Set([engine.ambientBus])));
  for(const osc of engine.nodes)assert.equal(reaches(osc,engine.ambientBus.gain),false,'LFO cannot modulate group gate');
  assert.ok(engine.nodes.some(n=>reaches(n,engine.droneGain.gain)),'drone modulation still connected');
  assert.ok(engine.nodes.some(n=>reaches(n,engine.airGain.gain)),'air modulation still connected');
  assert.equal(engine.ambientBus.gain.value,0);
  assert.ok(engine.master.gain.value>0,'effects remain audible');
  for(const mode of ['ambience','score']){
    engine.setMode(mode);assert.ok(engine.ambientBus.gain.value>0);
  }
  engine.setPaused(true);
  assert.equal(engine.scoreBus.gain.value,0);assert.ok(engine.ambientBus.gain.value>0);
  const step=engine.step;engine.ctx.currentTime+=100;engine.schedule();assert.equal(engine.step,step,'pause freezes score scheduling');
  engine.setMode('effects');assert.equal(engine.ambientBus.gain.value,0);
  const voices=action=>{
    const before=engine.ctx.createdNodes.length;action();
    return engine.ctx.createdNodes.slice(before).filter(n=>['oscillator','buffer'].includes(n.kind));
  };
  engine.setMode('ambience');engine.nextAmbient=engine.ctx.currentTime;
  const ambientVoices=voices(()=>engine.schedule());assert.ok(ambientVoices.length>0);
  for(const voice of ambientVoices)assert.ok(reaches(voice,engine.ambientBus),'scheduled Code Hum voice uses gate');
  engine.setMode('score');engine.setPaused(false);engine.nextStep=engine.ctx.currentTime+.02;
  const scoreVoices=voices(()=>engine.schedule());assert.ok(scoreVoices.length>0);
  for(const voice of scoreVoices)assert.ok(reaches(voice,engine.scoreBus),'scheduled score voice uses pause bus');
  engine.setPaused(true);
  const cinematicVoices=voices(()=>{engine.ripple(.5);engine.surge();engine.breach();});assert.ok(cinematicVoices.length>0);
  for(const voice of cinematicVoices)assert.ok(reaches(voice,engine.master,new Set([engine.scoreBus,engine.ambientBus])),'cinematic voices bypass paused score and ambient gate');
  const uiVoices=voices(()=>engine.interfaceSound('press'));assert.ok(uiVoices.length>0);
  for(const voice of uiVoices)assert.ok(reaches(voice,engine.uiBus),'UI Foley uses its own bus');
  engine.setMode('off');assert.equal(engine.master.gain.value,0);assert.equal(engine.ambientBus.gain.value,0);
  h.run('setRainOption("audio","ambience"); RainApp.toggleMute()');
  assert.equal(h.run('rain.audio'),'off');h.run('RainApp.toggleMute()');assert.equal(h.run('rain.audio'),'ambience');
});

check('profile scores change tempo, retire old voices and preserve mode/pause/reset behavior', () => {
  const h=harness();h.run('setup();setRainOption("grade","abyss")');
  const engine=h.run('soundEngine');
  assert.equal(engine.ctx,null,'profile selection does not activate audio');
  assert.equal(engine.score.id,'undertow');
  h.run('setRainOption("audio","score")');
  const context=engine.ctx, titles=new Set(), tempos=new Set();
  for(const profile of ['abyss','voltage','anomaly','cinema']) {
    const oldBus=engine.scoreBus, previous=engine.profile;
    h.run(`setRainOption('grade','${profile}')`);
    assert.equal(engine.ctx,context,'profile switches reuse the audio context');
    if(previous!==profile) {
      assert.notEqual(engine.scoreBus,oldBus);
      assert.equal(oldBus.gain.value,0,'scheduled notes from the old track fade away');
      assert.equal(engine.step,0);
    }
    titles.add(engine.score.title);tempos.add(engine.score.bpm);
    const first=engine.nextStep, firstTick=engine.step;
    engine.schedule();
    assert.ok(Math.abs(engine.nextStep-first-(engine.step-firstTick)*60/engine.score.bpm/4)<1e-8,'scheduler follows selected tempo');
    // Exercise every section and the wraparound of each actual arrangement.
    engine.schedulingScore=true;
    for(let tick=0;tick<=engine.score.bars*16;tick++)engine.scoreStep(1+tick*60/engine.score.bpm/4,tick);
    engine.schedulingScore=false;
    for(const node of context.createdNodes)for(const key of ['gain','frequency','Q','pan'])
      for(const call of node[key].calls)assert.ok(call.slice(1).every(Number.isFinite),'all scheduled parameters are finite');
    context.createdNodes=[];
  }
  assert.equal(titles.size,4);assert.equal(tempos.size,4);
  h.run('setRainOption("paused",true);setRainOption("grade","voltage")');
  assert.equal(engine.scoreBus.gain.value,0);
  const step=engine.step;context.currentTime+=10;engine.schedule();assert.equal(engine.step,step);
  h.run('setRainOption("paused",false)');assert.equal(engine.scoreBus.gain.value,1);
  const outgoing=engine.scoreBus;
  h.run('setRainOption("audio","effects")');
  assert.equal(outgoing.gain.value,0);assert.equal(engine.scoreBus.gain.value,0,'SFX Only cannot replay sustained score voices');
  h.run('setRainOption("audio","score");RainApp.toggleMute();setRainOption("grade","anomaly");RainApp.toggleMute()');
  assert.equal(engine.mode,'score');assert.equal(engine.score.id,'fracture');
  h.run('resetRain()');assert.equal(engine.profile,'cinema');assert.equal(engine.mode,'effects');
  assert.equal(typeof engine.legacyScoreStep,'function','approved original remains available');
});

check('audio scheduler skips overdue ticks without bunching notes on desktop and touch devices', () => {
  for(const coarse of [false,true]) {
    const h=harness({coarse});h.run('setup();soundEngine.setMode("score")');
    const engine=h.run('soundEngine'),ctx=engine.ctx,beat=60/engine.score.bpm/4;
    assert.ok(engine.step>0,'first scheduling happens during activation');
    const scheduled=[];
    engine.scoreStep=(t,tick)=>scheduled.push({t,tick});
    for(const delay of [.08,.3,8]) {
      const first=engine.nextStep, tick=engine.step;
      ctx.currentTime=first+delay;
      scheduled.length=0;engine.schedule();
      assert.ok(scheduled.length>0&&scheduled.length<=10);
      assert.ok(scheduled[0].t>=ctx.currentTime+engine.voiceLead);
      assert.ok(scheduled[0].tick>tick,'overdue ticks are skipped');
      for(let i=0;i<scheduled.length;i++) {
        assert.ok(Math.abs(scheduled[i].t-first-(scheduled[i].tick-tick)*beat)<1e-8,'retain tempo grid');
        if(i)assert.ok(Math.abs(scheduled[i].t-scheduled[i-1].t-beat)<1e-8,'never bunch overdue starts');
      }
    }
    engine.setMode('ambience');ctx.currentTime+=30;engine.nextAmbient=ctx.currentTime-20;
    const before=ctx.createdNodes.length;engine.schedule();
    const sources=ctx.createdNodes.slice(before).filter(n=>n.kind==='buffer');
    assert.ok(sources.length>0);
    for(const source of sources)assert.ok(source.startArgs[0]>=ctx.currentTime+engine.voiceLead,'ambient events also recover');
    h.run('setRainOption("paused",true)');engine.setMode('score');
    const pausedStep=engine.step;ctx.currentTime+=20;engine.schedule();assert.equal(engine.step,pausedStep);
  }
});

check('audio uses common scheduling defaults and the native context configuration', () => {
  for (const [userAgent,coarse] of [
    ['Mozilla/5.0 (Linux; Android 16; Pixel 8 Pro)',true],
    ['Mozilla/5.0 (Linux; Android 16)',false],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)',true],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',true],
    ['',false]
  ]) {
    const h=harness({coarse,userAgent}),attempts=[];
    const Context=h.sandbox.AudioContext;
    h.sandbox.AudioContext=function(...args) {
      attempts.push(args);
      const context=new Context(...args);context.sampleRate=48000;return context;
    };
    h.run('setup();soundEngine.setMode("effects")');
    const engine=h.run('soundEngine');
    assert.deepEqual(attempts,[[]],'context receives no configuration overrides');
    assert.equal(engine.ctx.sampleRate,48000,'retain native sample rate');
    assert.equal(engine.lookAhead,.17);
    assert.equal(engine.voiceLead,.012);
    assert.equal(engine.startLead,.075);
    for(const [action,lead] of [[()=>engine.ripple(.5),.012],[()=>engine.surge(),.015],
      [()=>engine.breach(),.01],[()=>engine.interfaceSound('press'),.006]]) {
      const before=engine.ctx.createdNodes.length;action();
      const sources=engine.ctx.createdNodes.slice(before).filter(n=>['oscillator','buffer'].includes(n.kind));
      assert.ok(sources.length>0);
      assert.ok(Math.abs(Math.min(...sources.map(source=>source.startArgs[0]))-engine.ctx.currentTime-lead)<1e-9,
        'effects retain their short start delays on every device');
    }
  }
  const h=harness({coarse:true,userAgent:'Android'}),attempts=[];
  h.sandbox.AudioContext=function(...args) {attempts.push(args);throw new Error('Audio unavailable');};
  h.run('setup();soundEngine.setMode("effects")');
  const engine=h.run('soundEngine');
  assert.deepEqual(attempts,[[]],'a constructor failure is handled without redundant retries');
  assert.equal(engine.mode,'off','failure stays silent');
  assert.equal(engine.ctx,null);
});

check('breach audio pulls outward and seats each slab at its visual relock', () => {
  const h=harness();h.run('setup(); soundEngine.setMode("effects")');
  const engine=h.run('soundEngine'),ctx=engine.ctx,before=ctx.createdNodes.length;
  const phases=h.run('Array.from({length:9},(_,slab)=>breachSlabPhase(slab))');
  engine.breach(phases);
  const nodes=ctx.createdNodes.slice(before),sources=nodes.filter(n=>n.startArgs);
  const origin=ctx.currentTime+.01;
  for(const phase of phases) {
    const seat=origin+2.42+phase*.46;
    assert.equal(sources.filter(n=>Math.abs(n.startArgs[0]-seat)<1e-9).length,2,
      'noise contact and damped tone align with each slab flash');
  }
  const pulls=nodes.filter(n=>n.kind==='panner'&&n.pan.calls.some(c=>c[0]==='linear'&&Math.abs(c[1])===.78));
  assert.equal(pulls.length,2,'tear has two moving stereo layers');
  assert.ok(pulls.some(n=>n.pan.calls.at(-1)[1]<0));
  assert.ok(pulls.some(n=>n.pan.calls.at(-1)[1]>0));
  assert.ok(sources.some(n=>Math.abs(n.startArgs[0]-origin-3.02)<1e-9),'final low seating impact');
  engine.setMode('off');const silent=ctx.createdNodes.length;engine.breach(phases);
  assert.equal(ctx.createdNodes.length,silent,'mute gates the entire sequence');
});

check('finished voices disconnect their whole graph and score partials retain shared effects until all end', () => {
  const h=harness();h.run('setup();soundEngine.setMode("effects")');
  const engine=h.run('soundEngine'),ctx=engine.ctx;
  const actions=[()=>engine.tone(1,220,.2),()=>engine.tone(1,220,.2,'sine',.1,null,800,.3),
    ()=>engine.filteredNoise(1,.2,.1),()=>engine.ripple(.5,3),()=>engine.surge(),()=>engine.breach(),
    ()=>engine.interfaceSound('press')];
  for(const action of actions) {
    const before=ctx.createdNodes.length;action();const nodes=ctx.createdNodes.slice(before);
    const sources=nodes.filter(n=>['oscillator','buffer'].includes(n.kind));
    assert.ok(sources.length>0);
    for(const source of sources){assert.equal(typeof source.onended,'function');source.onended();assert.equal(source.onended,null);}
    for(const node of nodes)assert.equal(node.edges.length,0,'no connected voice nodes after completion');
  }
  for(const instrument of ['piano','strings','organ','brass','riff','acid','sub','bell']) {
    const before=ctx.createdNodes.length;
    engine.scoreVoice(1,60,.3,instrument,.1,.3);
    const nodes=ctx.createdNodes.slice(before),sources=nodes.filter(n=>n.kind==='oscillator');
    const effects=nodes.filter(n=>['filter','panner','waveshaper'].includes(n.kind));
    for(let i=0;i<sources.length;i++) {
      sources[i].onended();
      if(i<sources.length-1)for(const effect of effects)assert.ok(effect.edges.length>0,'later partials still need shared effects');
    }
    for(const node of nodes)assert.equal(node.edges.length,0);
  }
});

check('uncached UI Foley starts after sample generation and repeats reuse the cached buffer', () => {
  const h=harness({coarse:true});h.run('setup();soundEngine.setMode("effects")');
  const engine=h.run('soundEngine'),ctx=engine.ctx;
  const synthesize=engine.uiFoleySample.bind(engine);
  engine.uiFoleySample=(...args)=>{const buffer=synthesize(...args);ctx.currentTime+=.12;return buffer;};
  engine.interfaceSound('press');
  const source=ctx.createdNodes.filter(n=>n.kind==='buffer').at(-1);
  assert.ok(Math.abs(source.startArgs[0]-ctx.currentTime-.006)<1e-9,'UI lead is measured after sample generation');
  assert.equal(synthesize('press'),source.buffer,'repeat uses the existing sample');
  assert.ok(source.buffer.getChannelData(0).some(v=>v!==0),'sample has signal');
  engine.uiFoleySample=synthesize;
  engine.interfaceSound('slider',.5,'density');
  const count=ctx.createdNodes.length;ctx.currentTime+=.02;
  engine.interfaceSound('slider',.6,'density');assert.equal(ctx.createdNodes.length,count,'slider throttle retained');
});

check('UI sample boundaries and synthesized voice envelopes reach true silence', () => {
  const h=harness();h.run('setup();soundEngine.setMode("effects")');
  const engine=h.run('soundEngine'),ctx=engine.ctx;
  const kinds=['panel-open','panel-close','toggle-on','toggle-off','select',
    'slider','slider-end','commit','reset','pause','resume','press'];
  for(const sampleRate of [22050,44100,48000]) {
    ctx.sampleRate=sampleRate;engine.uiFoleyCache.clear();
    for(const kind of kinds)for(const bucket of kind.startsWith('slider')?[0,14,28]:[14]) {
      const data=engine.uiFoleySample(kind,bucket).getChannelData(0);
      assert.equal(Math.abs(data[0]),0,`${kind} starts silent at ${sampleRate}`);
      assert.equal(Math.abs(data.at(-1)),0,`${kind} ends silent at ${sampleRate}`);
      assert.ok(data.some(value=>Math.abs(value)>.01),'retain audible sound');
      for(const value of data)assert.ok(Number.isFinite(value)&&Math.abs(value)<.75);
    }
  }
  const actions=[()=>engine.tone(1,220,.2),()=>engine.filteredNoise(1,.2,.1),
    ()=>engine.ripple(.5),()=>engine.ripple(.5,3),()=>engine.surge(),()=>engine.breach(),
    ...['piano','strings','organ','brass','riff','acid','sub','bell'].map(
      instrument=>()=>engine.scoreVoice(1,60,.3,instrument))];
  for(const action of actions) {
    const before=ctx.createdNodes.length;action();
    const nodes=new Set(ctx.createdNodes.slice(before));
    for(const source of nodes)if(['oscillator','buffer'].includes(source.kind)) {
      const envelopes=[],seen=new Set();
      const visit=node=>{
        if(!nodes.has(node)||seen.has(node))return;
        seen.add(node);
        if(node.kind==='gain'&&node.gain.calls.length)envelopes.push(node.gain.calls);
        node.edges.forEach(visit);
      };
      visit(source);assert.ok(envelopes.length,'source has an envelope');
      for(const calls of envelopes) {
        assert.equal(calls[0][1],.0001,'source starts at the positive exponential envelope floor');
        assert.equal(calls.at(-1)[1],0,'tail reaches exact zero');
        assert.ok(calls.at(-1)[2]<source.stopArgs[0],'fade completes before stop');
        for(const [type,value] of calls)if(type==='exp')assert.ok(value>0,'valid exponential target');
      }
    }
  }
});

check('public settings reject invalid values and clamp every numeric boundary', () => {
  const h=harness();h.run('setup()');
  const schema=h.run('RainApp.settings');
  for(const [name,spec] of Object.entries(schema)){
    const set=value=>{h.sandbox.testValue=value;h.run(`setRainOption(${JSON.stringify(name)},testValue)`);};
    const get=()=>h.run(`rain[${JSON.stringify(name)}]`);
    set(spec.default);assert.equal(get(),spec.default);
    if(spec.type==='number'){
      for(const value of [NaN,Infinity,-Infinity,{},[],null,undefined,'garbage']){
        set(value);assert.equal(get(),spec.default,`${name} rejects ${String(value)}`);
      }
      set(spec.min-100);assert.equal(get(),spec.min,`${name} lower clamp`);
      set(spec.max+100);assert.equal(get(),spec.max,`${name} upper clamp`);
    }else if(spec.type==='boolean'){
      for(const value of ['false',0,1,null,{}]){set(value);assert.equal(get(),spec.default,`${name} rejects nonboolean`);}
      set(!spec.default);assert.equal(get(),!spec.default);
    }else{
      set('invalid-choice');assert.equal(get(),spec.default);
      for(const value of spec.choices){set(value);assert.equal(get(),value);}
    }
    set(spec.default);
  }
  const before=h.run('JSON.stringify(rain)');
  for(const name of ['bogus','fontSize','__proto__','constructor','toString'])h.run(`setRainOption(${JSON.stringify(name)},-99)`);
  assert.equal(h.run('JSON.stringify(rain)'),before);
  assert.equal(h.run('Object.prototype.hasOwnProperty.call(rain,"zoom")'),true);
});

check('paused visual changes redraw without advancing positions or effect bookkeeping', () => {
  const h=harness();h.run('setup()');h.advance();h.run('draw(); setRainOption("paused",true); draw()');
  // Pending work makes accidental mutation inside render visible.
  h.run(`breachAt=simulationTime-300;signalAt=simulationTime;
    pulses=[{x:width/2,y:height/2,at:simulationTime,id:++pulseSeq,power:2}];
    for(const p of planes)for(const l of p.lanes)for(const s of l.streams)for(const c of s.cells.values()){
      c.nextChange=-1;c.nextTwinkle=-1;c.lastBreach=-1;c.pulseIds=[];c.lastSurge=-1;
    }`);
  let frozen=h.snapshot();
  for(const [name,value] of [['grade','abyss'],['bloom',false],['glow',.4],['grain',0],['grain',.2],
    ['persistence',.8],['zoom',.65],['zoom',2],['crt','scan'],['crt','glass'],['scanStrength',1],['scanBrightness',1.2],['curvature',0],['curvature',2]]){
    const renders=h.renders;h.sandbox.testValue=value;
    h.run(`setRainOption(${JSON.stringify(name)},testValue)`);h.advance(1000);h.run('draw()');
    assert.ok(h.renders>renders,`${name} invalidates paused frame`);
    if(name==='grade'){
      // Profile density can change visibility; all retained simulation data stays frozen.
      const expected=JSON.parse(frozen),current=JSON.parse(h.snapshot());
      expected.planes.forEach((lanes,p)=>lanes.forEach((lane,l)=>{lane.active=current.planes[p][l].active;}));
      frozen=JSON.stringify(expected);
    }
    assert.equal(h.snapshot(),frozen,`${name} keeps simulation frozen`);
  }
  h.run('setRainOption("density",1.65)');h.advance();h.run('draw()');
  const time=h.run('simulationTime');h.run('setRainOption("speed",2); setRainOption("mutation",2)');h.advance(5000);h.run('draw()');
  assert.equal(h.run('simulationTime'),time);
  const before=h.snapshot();h.run('renderScene(); renderScene()');assert.equal(h.snapshot(),before,'direct rendering is pure');
  const rendered=h.renders;h.resolveFonts();h.advance();h.run('draw()');
  assert.ok(h.renders>rendered,'font arrival redraws paused scene');assert.equal(h.snapshot(),before);
  h.run('setRainOption("paused",false)');h.advance(17);h.run('draw()');
  assert.notEqual(h.snapshot(),before,'advancing frame applies pending cell/effect updates');
  assert.ok(h.run('simulationTime')-time<100,'resume has no accumulated pause backlog');
});

check('breach tears occupied code apart, relocks by slab and renders without mutation', () => {
  const h=harness();h.run('setup(); breachAt=simulationTime');
  assert.equal(h.run('breachRupture(simulationTime+639)'),null,'opening stays intact');
  for(const zoom of [.65,1,2]) {
    h.sandbox.testZoom=zoom;
    h.run('setRainOption("zoom",testZoom)');
    const fragments=JSON.parse(h.run(`JSON.stringify(Array.from({length:9},(_,i)=>{
      const r=breachRupture(breachAt+1500),y=r.top+(i+.5)*r.band;
      return [breachFragment(r.center-r.span*.1,y,r),breachFragment(r.center+r.span*.1,y,r)];
    }))`));
    for(const [left,right] of fragments) {
      assert.ok(left.dx*zoom < -25 && right.dx*zoom > 25,'visible split at every zoom');
      assert.equal(left.amount,1,'rupture holds open');
    }
    h.run('simulationTime=breachAt+1500');
    const snapshot=h.snapshot(),random=h.randomCalls;
    h.run('renderScene(); renderScene()');
    assert.equal(h.snapshot(),snapshot,'draw preserves cell and stream ownership');
    assert.equal(h.randomCalls,random,'fracture rendering is deterministic');
  }
  const recovery=JSON.parse(h.run(`JSON.stringify(Array.from({length:9},(_,i)=>{
    const r=breachRupture(breachAt+2600);
    return breachFragment(r.center,r.top+(i+.5)*r.band,r).amount;
  }))`));
  assert.ok(Math.max(...recovery)-Math.min(...recovery)>.3,'slabs recover independently');
  assert.equal(h.run('breachRupture(breachAt+BREACH_DURATION)'),null,'displacement fully ends');
});

check('overlapping ripples handle each cell once and bound ownership to active pulses', () => {
  const h=harness();h.run(`setup();
    const testPlane=planes[0],testRow=Math.floor(worldHeight/2/testPlane.lineHeight);
    const testCell={glyph:0,energy:1,blank:false,nextChange:Infinity,nextTwinkle:Infinity,
      twinkleUntil:-Infinity,pulseIds:[],lastBreach:-1,lastSurge:-1};
    const testLane={active:true,x:worldWidth/2,streams:[{head:testRow,length:10,cells:new Map([[testRow,testCell]])}]};
    testPlane.lanes=[testLane];
    const testOrigin=worldToScreen(testLane.x,(testRow+.5)*testPlane.lineHeight);
    pulses=[1,2].map(id=>({...testOrigin,id,at:simulationTime,power:1}));
    testPlane.updateCells(simulationTime);`);
  assert.equal(h.run('testCell.pulseIds.length'),2);
  const before=h.run('JSON.stringify(testCell)'),randomCalls=h.randomCalls;
  h.run('testPlane.updateCells(simulationTime+17)');
  assert.equal(h.run('JSON.stringify(testCell)'),before,'overlap does not repeat mutations or extend twinkle');
  assert.equal(h.randomCalls,randomCalls,'both fronts have already consumed their effect lottery');
  for(let id=3;id<50;id++){
    h.run(`pulses=[{...testOrigin,id:${id},at:simulationTime,power:1}];testPlane.updateCells(simulationTime)`);
    assert.equal(h.run('testCell.pulseIds.length'),1,'expired ownership is discarded on the next hit');
  }
  h.run('testLane.x=worldWidth*2;testCell.nextChange=-1;testCell.nextTwinkle=-1');
  const hidden=h.run('JSON.stringify(testCell)');h.run('testPlane.updateCells(simulationTime+100)');
  assert.equal(h.run('JSON.stringify(testCell)'),hidden,'offscreen cells retain viewport update culling');
});

check('resize retains camera centre, simulation and existing lane/stream/cell identities', () => {
  for(const coarse of [false,true]) {
    const h=harness({coarse});h.run(`setup();updateSimulation(.055);setRainOption('zoom',2);setCameraPan(80);
      setRainOption('paused',true);addPulse(width/2,height/2);
      const retainedPlanes=[...planes],retainedAtlases=planes.map(p=>p.atlas);
      const retainedLanes=planes.flatMap(p=>p.lanes);
      const retainedStreams=retainedLanes.flatMap(l=>l.streams);
      const retainedCells=retainedStreams.flatMap(s=>[...s.cells].map(([row,cell])=>({s,row,cell,state:JSON.stringify(cell)})));
      const laneState=retainedLanes.map(l=>JSON.stringify([l.x,l.phase,l.rhythm,l.nextGap,l.active]));
      const streamState=retainedStreams.map(s=>JSON.stringify([s.head,s.length,s.speed,s.progress,s.whiteHead,s.glow]));
      const origin=screenToWorld(width/2,height/2),clock=simulationTime,frame=frameNumber;
      const beforeVignette=vignette;`);
    const verify=()=>assert.ok(h.run(`planes.every((p,i)=>p===retainedPlanes[i]&&p.atlas===retainedAtlases[i]) &&
      retainedLanes.every((l,i)=>planes.includes(l.plane)&&l.plane.lanes.includes(l)&&
        JSON.stringify([l.x,l.phase,l.rhythm,l.nextGap,l.active])===laneState[i]) &&
      retainedStreams.every((s,i)=>s.plane.lanes.some(l=>l.streams.includes(s))&&
        JSON.stringify([s.head,s.length,s.speed,s.progress,s.whiteHead,s.glow])===streamState[i]) &&
      retainedCells.every(({s,row,cell,state})=>s.cells.get(row)===cell&&JSON.stringify(cell)===state) &&
      simulationTime===clock&&frameNumber===frame&&cameraPanX===80 &&
      Math.abs(screenToWorld(width/2,height/2).x-origin.x)<1e-7&&
      Math.abs(screenToWorld(width/2,height/2).y-origin.y)<1e-7 &&
      planes.every(p=>p.lanes.every(l=>l.streams.every((s,i)=>!i||l.streams[i-1].head-l.streams[i-1].length-s.head>=2)))`));
    for(const [w,y] of [[1200,800],[480,240],[1600,1000],[640,360],[1600,1000]]) {
      if(w===1600)h.run('setRainOption("zoom",.65)');
      h.sandbox.innerWidth=w;h.sandbox.innerHeight=y;
      const previousRenders=h.renders;
      h.run('windowResized()');
      assert.ok(h.renders>previousRenders,'resize repaints before returning, without waiting for draw');
      verify();
      h.run('draw()');verify();
      assert.ok(h.run(`(()=>{const view=worldViewport();return view.minX>=worldMinX&&view.maxX<=worldMinX+worldWidth&&
        view.minY>=worldMinY&&view.maxY<=worldMinY+worldHeight;})()`),'resized camera stays covered');
      assert.ok(h.run('new Set(planes.flatMap(p=>p.lanes.map(l=>l.x))).size===planes.reduce((n,p)=>n+p.lanes.length,0)'), 'new columns retain exclusive ownership');
    }
    assert.ok(h.run('vignette!==beforeVignette'),'viewport lighting is resized');
    const calls=h.randomCalls;
    h.sandbox.innerWidth=800;h.sandbox.innerHeight=600;h.run('windowResized()');
    h.sandbox.innerWidth=1600;h.sandbox.innerHeight=1000;h.run('windowResized()');
    assert.equal(h.randomCalls,calls,'revisited viewport sizes never reseed');
    verify();
    h.run('setRainOption("density",1.65);setRainOption("paused",false)');
    for(let i=0;i<240;i++)h.run('updateSimulation(.055)');
    assert.ok(h.run(`planes.every(p=>p.lanes.every(l=>l.streams.every((s,i)=>!i||l.streams[i-1].head-l.streams[i-1].length-s.head>=2)))`),'grown schedulers preserve dark gaps');
  }
});

check('paused pointers cannot disturb rain or emit ripple audio, while camera gestures still work', () => {
  const silent=harness({reduced:true});silent.run('setup();addPulse(100,100)');
  assert.equal(silent.run('soundEngine.ctx'),null,'ignored ripple does not activate audio');
  const h=harness();h.run(`setup();soundEngine.setMode('effects');hover={x:12,y:34,at:simulationTime};
    setRainOption('paused',true);draw();`);
  const mount=h.elements.get('rain');
  const fire=(type,id,x,y,pointerType='mouse',extra={})=>mount.dispatchEvent({type,pointerId:id,clientX:x,clientY:y,pointerType,
    target:h.sandbox.drawingContext.canvas,button:0,preventDefault(){},...extra});
  const before=h.snapshot(),renders=h.renders,engine=h.run('soundEngine'),voices=engine.ctx.createdNodes.length;
  fire('pointermove',99,200,100);fire('pointerleave',99,200,100);
  fire('pointerdown',99,200,100);fire('pointerdown',99,200,100,'mouse',{shiftKey:true});
  fire('pointerdown',1,100,100,'touch');fire('pointerup',1,100,100,'touch');
  h.run('addPulse(100,100,3.25)');h.advance(1000);h.run('draw()');
  assert.equal(h.snapshot(),before);assert.equal(h.renders,renders,'paused pointers do not invalidate a frame');
  assert.equal(engine.ctx.createdNodes.length,voices,'no ripple or activation voice');
  fire('wheel',0,100,100,'mouse',{deltaY:-200,deltaMode:0});
  assert.ok(h.run('rain.zoom>1'),'wheel zoom stays available');
  fire('pointerdown',1,100,100,'touch');fire('pointermove',1,180,100,'touch');fire('pointerup',1,180,100,'touch');
  assert.notEqual(h.run('cameraPanX'),0,'touch pan stays available');
  fire('pointerdown',1,100,100,'touch');fire('pointerdown',2,200,100,'touch');
  fire('pointermove',2,260,100,'touch');fire('pointerup',2,260,100,'touch');fire('pointerup',1,100,100,'touch');
  assert.equal(h.snapshot(),before);assert.equal(engine.ctx.createdNodes.length,voices);
  h.run('signalBurst()');assert.equal(h.run('rain.paused'),false,'explicit surge resumes');
  h.run('setRainOption("paused",true);systemBreach()');assert.equal(h.run('rain.paused'),false,'explicit breach resumes');
});

check('native gestures map hover and taps, suppress pinch/pan taps and recover cancellation', () => {
  for(const coarse of [false,true]){
    const h=harness({coarse});h.run('setup();setRainOption("audio","off");setRainOption("crt","glass")');
    const mount=h.elements.get('rain');
    const fire=(type,id,x,y,pointerType='touch')=>mount.dispatchEvent({type,pointerId:id,clientX:x,clientY:y,pointerType,
      target:h.sandbox.drawingContext.canvas,button:0,preventDefault(){}});
    for(const zoom of [.65,2]){
      h.run(`setRainOption("zoom",${zoom})`);
      fire('pointermove',99,24,12,'mouse');
      const expected=h.run('(()=>{const p=displayEngine.screenToSource(24,12);return screenToWorld(p.x,p.y);})()');
      assert.ok(Math.abs(h.run('hover.x')-expected.x)<1e-7&&Math.abs(h.run('hover.y')-expected.y)<1e-7);
      h.advance(100);fire('pointerdown',1,24,12);fire('pointerup',1,24,12);
      const pulse=h.run('pulses.at(-1)');const source=h.run('displayEngine.screenToSource(24,12)');
      assert.ok(Math.abs(pulse.x-source.x)<1e-7&&Math.abs(pulse.y-source.y)<1e-7);
    }
    const count=h.run('pulseSeq');
    fire('pointerdown',1,100,100);fire('pointerdown',2,200,100);fire('pointermove',2,250,100);
    fire('pointerup',2,250,100);fire('pointerup',1,100,100);assert.equal(h.run('pulseSeq'),count);
    fire('pointerdown',1,100,100);fire('pointermove',1,180,100);fire('pointerup',1,180,100);assert.equal(h.run('pulseSeq'),count);
    fire('pointerdown',1,100,100);fire('pointercancel',1,100,100);assert.equal(h.run('pulseSeq'),count);
    h.advance(100);fire('pointerdown',3,100,100);fire('pointerup',3,100,100);assert.equal(h.run('pulseSeq'),count+1);
    const hovered=h.run('JSON.stringify(hover)');
    h.sandbox.document.getElementById('panel').dispatchEvent({type:'pointermove',pointerType:'mouse',clientX:10,clientY:10});
    assert.equal(h.run('JSON.stringify(hover)'),hovered,'panel has no disturbance handler');
  }
});

check('shortcuts activate audio once, respect exclusions, restore mute and reset shared state', () => {
  const h=harness();h.sandbox.document.dispatchEvent({type:'DOMContentLoaded'});
  const key=(value,extra={})=>{
    const event={type:'keydown',key:value,target:h.elements.get('density'),
      preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};
    h.sandbox.dispatchEvent(event);return event;
  };
  assert.equal(h.run('soundEngine.ctx'),null);
  assert.ok(key(' ').prevented);assert.equal(h.run('rain.paused'),true);
  const engine=h.run('soundEngine'),context=engine.ctx;assert.ok(context);
  assert.equal(engine.mode,'effects');assert.equal(engine.scorePaused,true);
  key(' ',{repeat:true});assert.equal(h.run('rain.paused'),true);
  key(' ',{ctrlKey:true});assert.equal(h.run('rain.paused'),true);
  key(' ',{isComposing:true});assert.equal(h.run('rain.paused'),true);
  key(' ',{target:{isContentEditable:true}});assert.equal(h.run('rain.paused'),true);
  key(' ',{target:{matches:()=>true}});assert.equal(h.run('rain.paused'),true);
  for(const value of ['d','s','v']){
    const before=h.snapshot(),event=key(value);
    assert.equal(event.prevented,undefined);assert.equal(h.snapshot(),before);
  }
  h.run('setRainOption("audio","score")');key('m');assert.equal(engine.mode,'off');
  key('m');assert.equal(engine.mode,'score');assert.equal(engine.ctx,context,'one audio context');
  key('e');assert.equal(h.run('rain.paused'),false);assert.equal(engine.scorePaused,false);
  h.run('setRainOption("volume",.9);setRainOption("zoom",2);setRainOption("grade","anomaly");setRainOption("crt","glass");resetRain()');
  assert.equal(h.run('JSON.stringify(rain)'),h.run('JSON.stringify(defaults)'));
  assert.equal(engine.mode,'effects');assert.equal(engine.volume,.5);assert.equal(engine.scorePaused,false);
  assert.equal(h.run('displayEngine.mode'),'glass');assert.equal(h.elements.get('zoom').value,1);
  key('m');key('m');assert.equal(engine.mode,'effects','reset restores default audible-mode memory');
});

check('reduced-motion preference follows changes until an explicit animation choice', () => {
  const h=harness({reduced:true});h.run('setup()');assert.equal(h.run('rain.paused'),true);
  const preference=[...h.media].find(([q])=>q.includes('reduced-motion'))[1];
  preference.matches=false;preference.dispatchEvent({type:'change',matches:false});assert.equal(h.run('rain.paused'),false);
  h.run('setRainOption("paused",true)');
  preference.matches=true;preference.dispatchEvent({type:'change',matches:true});
  preference.matches=false;preference.dispatchEvent({type:'change',matches:false});assert.equal(h.run('rain.paused'),true);
  h.run('resetRain()');assert.equal(h.run('rain.paused'),false);
  preference.matches=true;preference.dispatchEvent({type:'change',matches:true});assert.equal(h.run('rain.paused'),true);
});

(async()=>{
  for(const coarse of [false,true]) {
    const h=harness({coarse});h.run('setup();soundEngine.init()');
    const engine=h.run('soundEngine'),ctx=engine.ctx,notes=[];
    let unlock;
    ctx.state='suspended';ctx.resume=()=>new Promise(resolve=>{unlock=resolve;});
    engine.scoreStep=(t,tick)=>notes.push({t,tick});
    engine.setMode('score');assert.equal(notes.length,0,'wait for the audio clock to run');
    ctx.currentTime=.4;ctx.state='running';unlock();await Promise.resolve();
    assert.ok(notes.length>0,'unlock primes playback before the timer');
    assert.equal(notes[0].tick,0,'delayed activation retains the beginning of the score');
    assert.ok(notes[0].t>=ctx.currentTime+engine.startLead);
    notes.length=0;ctx.state='suspended';engine.setMode('score');
    engine.setMode('off');ctx.state='running';unlock();await Promise.resolve();
    assert.equal(notes.length,0,'muting while unlock is pending cannot schedule music');
  }
  console.log('PASS delayed audio unlock primes a complete attack without skipping tick zero or overriding mute');
})().catch(error=>{console.error(error);process.exitCode=1;});
