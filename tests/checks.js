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

function harness({coarse = false, reduced = false} = {}) {
  let now = 1000, seed = 123456, renders = 0, randomCalls = 0, fontReady;
  const listeners = new Map(), elements = new Map(), canvasCalls = [];
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
      children: [], attributes: {}, checked: false, classList: {add(){},remove(){},toggle(){},contains(){return false;}},
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
  const document = eventTarget({readyState:'loading',hidden:false,
    createElement:element,getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},
    querySelector(){return null;},querySelectorAll(){return [];},write(){},
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
    connect(node){this.edges.push(node);return node;} disconnect(){this.edges=[];} start(){} stop(){}
  }
  class AudioContext {
    constructor(){this.currentTime=0;this.sampleRate=1000;this.state='running';this.destination=new AudioNode('destination');this.createdNodes=[];}
    node(kind){const node=new AudioNode(kind);this.createdNodes.push(node);return node;}
    createGain(){return this.node('gain');}createDynamicsCompressor(){return this.node('compressor');}
    createBiquadFilter(){return this.node('filter');}createOscillator(){return this.node('oscillator');}
    createBufferSource(){return this.node('buffer');}createStereoPanner(){return this.node('panner');}
    createBuffer(channels,length,sampleRate=this.sampleRate){return {duration:length/sampleRate,getChannelData:()=>new Float32Array(length)};}
    resume(){return Promise.resolve();}
  }
  const sandbox = eventTarget({console,Math:math,document,navigator:{maxTouchPoints:coarse?1:0},
    performance:{now:()=>now},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},requestAnimationFrame:()=>1,
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
  return {run,sandbox,canvasCalls,media,elements,advance(ms=17){now+=ms;},get renders(){return renders;},
    get randomCalls(){return randomCalls;},resolveFonts(){fontReady?.();},
    snapshot:()=>run(`JSON.stringify({simulationTime,frameNumber,pulseSeq,pulses,signalAt,breachAt,hover,
      planes:planes.map(p=>p.lanes.map(l=>({x:l.x,progress:l.progress,active:l.active,nextGap:l.nextGap,
        streams:l.streams.map(s=>({head:s.head,length:s.length,cells:[...s.cells]}))})))})`)};
}

function check(name, body){body();console.log('PASS '+name);}

// Test cases below exercise production source through its public setters and
// actual simulation/display/audio methods rather than copied implementations.
check('ordered scripts initialize with desktop and mobile Canvas adapter', () => {
  for (const coarse of [false,true]) {
    const h=harness({coarse});
    assert.equal(h.run('planes.length'),0,'no premature setup while scripts load');
    h.sandbox.document.dispatchEvent({type:'DOMContentLoaded'});h.advance();h.run('draw()');
    assert.ok(h.run('planes.length === 3 && planes.every(p=>p.lanes.length>0)'));
    assert.ok(h.renders>0);
    assert.equal(h.sandbox.__rainCanvasFallback,true);
    assert.equal(h.elements.get('rain').children.filter(el=>el.id==='defaultCanvas0').length,1);
    assert.equal(h.run('soundEngine.ctx'),null,'startup does not activate audio');
  }
});

check('maximum density keeps lane ownership and at least two dark rows over repeated scheduling', () => {
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
  for(let i=0;i<1800;i++){
    h.run('updateSimulation(.055)');
    assert.ok(verify());
  }
});

check('Canvas CRT pointer conversion agrees with actual strip draw destinations', () => {
  const h=harness();h.run('setup(); displayEngine.setMode("glass"); displayEngine.present(drawingContext.canvas)');
  const strips=h.canvasCalls.filter(c=>c.args.length===9 && c.args[0]===h.sandbox.drawingContext.canvas);
  assert.ok(strips.length>10);
  for(const strip of [strips[0],strips[Math.floor(strips.length/2)],strips.at(-1)]){
    const [source,sx,sy,sw,sh,dx,dy,dw]=strip.args;
    for(const fraction of [0,.1,.5,.9,1]){
      const x=dx+dw*fraction;
      const result=h.run(`displayEngine.screenToSource(${x},${dy})`);
      assert.ok(Math.abs(result.x-(sx+sw*fraction))<1e-7);
      assert.equal(result.y,sy);
    }
  }
  h.run('displayEngine.gl={}; displayEngine.setMode("glass")');
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
  const frozen=h.snapshot();
  for(const [name,value] of [['grade','abyss'],['bloom',false],['glow',.4],['texture',false],['grain',.2],
    ['persistence',.8],['zoom',.65],['zoom',2],['crt','scan'],['crt','glass'],['scanStrength',1],['scanBrightness',1.2]]){
    const renders=h.renders;h.sandbox.testValue=value;
    h.run(`setRainOption(${JSON.stringify(name)},testValue)`);h.advance(1000);h.run('draw()');
    assert.ok(h.renders>renders,`${name} invalidates paused frame`);
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
  assert.equal(h.run('displayEngine.mode'),'off');assert.equal(h.elements.get('zoom').value,1);
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
