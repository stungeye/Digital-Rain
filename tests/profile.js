/* Optional controlled browser profiling; no production dependency.
 * NODE_PATH must include Playwright. See PERFORMANCE.md for methodology.
 * node tests/profile.js --compare HEAD --runs 3 --output report.json
 * node tests/profile.js --diagnostics --output diagnostics.json
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name)+1] : fallback;
const runs = Number(arg('--runs', 3)), frames = Number(arg('--frames', 180));
const compare = arg('--compare', null), output = arg('--output', null);
const diagnostics = process.argv.includes('--diagnostics');
if (![runs,frames].every(n=>Number.isInteger(n)&&n>0)) throw Error('Runs and frames must be positive integers');
const files = ['index.html','styles.css','js/rain.js','js/crt.js','js/audio.js','js/ui.js'];
const revisions = new Map([['working', new Map(files.map(file=>['/'+file,fs.readFileSync(path.join(root,file))]))]]);
if(compare) revisions.set('reference',new Map(files.map(file=>['/'+file,execFileSync('git',['show',`${compare}:${file}`],{cwd:root})])));
const server = http.createServer((req,res)=>{
  const [revision,...parts] = new URL(req.url,'http://localhost').pathname.slice(1).split('/');
  const file = revisions.get(revision)?.get('/'+(parts.join('/')||'index.html'));
  if(!file){res.writeHead(404);res.end();return;}
  const extension=path.extname(parts.at(-1)||'index.html');
  res.setHeader('Content-Type',extension==='.js'?'application/javascript':extension==='.css'?'text/css':'text/html');
  res.end(file);
});
const cases=[];
const variants=process.argv.includes('--effects')?['surge','breach','ripples']:['default','stress','flat'];
const devices=['desktop','touch',...(process.argv.includes('--desktop-canvas')?['desktop-canvas']:[])];
for(const device of devices)for(const mode of ['rain','tunnel'])for(const variant of variants) {
  const name=`${device}-${mode}-${variant}`;
  if(!arg('--case','')||name.includes(arg('--case','')))cases.push({name,touch:device==='touch',coarse:device!=='desktop',mode,variant});
}
if(!cases.length)throw Error('No matching cases');
const stats=values=>{
  const sorted=values.slice().sort((a,b)=>a-b);
  const at=p=>+sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))].toFixed(3);
  return {median:at(.5),p95:at(.95),p99:at(.99)};
};
async function openCase(browser,test,revision) {
  const viewport=test.touch?{width:390,height:844}:{width:1920,height:1080};
  const context=await browser.newContext({viewport,hasTouch:test.coarse,isMobile:test.touch});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**/*',route=>route.abort());
  await page.addInitScript(touch=>{
    Object.defineProperty(navigator,'maxTouchPoints',{get:()=>touch?1:0});
    window.perfFrame=requestAnimationFrame.bind(window);
    window.requestAnimationFrame=()=>0;
    let seed=123456;
    Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  },test.coarse);
  await page.goto(`http://127.0.0.1:${server.address().port}/${revision}/`);
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(({mode,variant})=>{
    setRainOption('mode',mode);
    if(variant==='stress'){setRainOption('grade','voltage');setRainOption('density',1.65);setRainOption('speed',2.4);}
    if(variant==='flat')setRainOption('crt','off');
    rain.audio='score';soundEngine.beatEnergy=()=>Math.exp(-(simulationTime%450)/72)*.76;
  },test);
  return {context,page,errors};
}
async function measure(page,test) {
  return page.evaluate(async ({frames,touch,variant})=>{
    const update=[],render=[],intervals=[];
    let last,effectAt=-Infinity;
    // Match the app's simulation step; submission yields to host refreshes.
    for(let i=0;i<60+frames;i++){
      const stamp=await new Promise(window.perfFrame);
      if(touch)await new Promise(window.perfFrame);
      // Repeat complete effects with stable event identities between triggers.
      if(['surge','breach','ripples'].includes(variant)&&simulationTime-effectAt>=(variant==='breach'?3400:variant==='ripples'?1600:1950)) {
        effectAt=simulationTime;
        if(variant==='surge')signalAt=effectAt;
        if(variant==='breach')breachAt=effectAt;
        if(variant==='ripples')pulses=[1,2,3,4].map(id=>({id:++pulseSeq,x:width*id/5,y:height/2,power:2,at:effectAt}));
      }
      const a=performance.now();updateSimulation(touch?1/30:1/60);const b=performance.now();renderScene();const c=performance.now();
      if(i>=60){update.push(b-a);render.push(c-b);intervals.push(stamp-last);}
      last=stamp;
    }
    return {update,render,intervals,crt:displayEngine.gl?'WebGL':'Canvas'};
  },{frames,touch:test.coarse,variant:test.variant});
}
async function gpuTiming(page,test) {
  const supported=await page.evaluate(()=>{
    const gl=displayEngine.gl,ext=gl?.getExtension('EXT_disjoint_timer_query');
    if(!ext)return false;
    window.gpuQueries=[];window.gpuQueryExtension=ext;
    const present=displayEngine.present;
    displayEngine.present=function(source){
      const query=ext.createQueryEXT();ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,query);
      try {present.call(this,source);}finally {ext.endQueryEXT(ext.TIME_ELAPSED_EXT);gpuQueries.push(query);}
    };
    return true;
  });
  if(!supported)return {supported:false};
  await measure(page,test);
  const result=await page.evaluate(async()=>{
    const gl=displayEngine.gl,ext=gpuQueryExtension;
    let available=false;
    for(let i=0;i<60&&!available;i++) {
      await new Promise(window.perfFrame);
      available=gpuQueries.every(q=>ext.getQueryObjectEXT(q,ext.QUERY_RESULT_AVAILABLE_EXT));
    }
    const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);
    const ns=available&&!disjoint?gpuQueries.slice(60).map(q=>ext.getQueryObjectEXT(q,ext.QUERY_RESULT_EXT)):[];
    gpuQueries.forEach(q=>ext.deleteQueryEXT(q));
    return {supported:true,available,disjoint,ms:ns.map(n=>n/1e6)};
  });
  return {supported:result.supported,available:result.available,disjoint:result.disjoint,
    crtCommandMs:result.ms.length?stats(result.ms):null};
}
async function diagnose(page,test) {
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const initialHeap=await cdp.send('Runtime.getHeapUsage');
  await page.evaluate(()=>{
    window.profileCosts={};window.profileCalls={};
    const wrap=(owner,key,label=key)=>{
      const original=owner[key];
      owner[key]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{
        const cost=profileCosts[label]||(profileCosts[label]={ms:0,calls:0});cost.ms+=performance.now()-start;cost.calls++;
      }};
    };
    wrap(window,'buildFilmTile');wrap(window,'renderTunnel');wrap(displayEngine,'present','CRT');
    for(const key of ['updateCells','drawBloom','drawGlyphs'])wrap(CodePlane.prototype,key);
    for(const key of ['drawImage','fillRect','fill','setTransform','createImageData']) {
      const original=CanvasRenderingContext2D.prototype[key];
      CanvasRenderingContext2D.prototype[key]=function(...args){profileCalls[key]=(profileCalls[key]||0)+1;return original.apply(this,args);};
    }
  });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval',{interval:500});
  await cdp.send('Profiler.start');
  await measure(page,test);
  const {profile}=await cdp.send('Profiler.stop');
  const nodes=new Map(profile.nodes.map(node=>[node.id,node.callFrame]));
  const samples=new Map();
  (profile.samples||[]).forEach((id,i)=>{
    const frame=nodes.get(id),label=frame.functionName||'(anonymous)';
    if(frame.url?.includes('/js/')||label.startsWith('('))samples.set(label,(samples.get(label)||0)+(profile.timeDeltas?.[i]||0));
  });
  const components=await page.evaluate(()=>({costs:profileCosts,canvasCalls:profileCalls,
    textureUploadBytesPerFrame:displayEngine.gl&&rain.crt!=='off'?width*height*4:0,
    // Logical RGBA storage estimates; actual driver allocations can differ.
    canvasSurfaceBytes:[drawingContext.canvas,displayEngine.output,vignette.canvas,filmTile,
      ...Object.values(glows).map(g=>g.canvas),...planes.map(p=>p.atlas.canvas)].reduce((n,c)=>n+c.width*c.height*4,0),
    crtTextureBytes:displayEngine.gl?width*height*4:0,
    gpu:displayEngine.gl?(()=>{const gl=displayEngine.gl,e=gl.getExtension('WEBGL_debug_renderer_info');
      return {renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
        timerQuery:!!gl.getExtension('EXT_disjoint_timer_query')};})():null}));
  // Accelerate ten minutes of simulation, presenting once per simulated second.
  // This checks retention, not real-time FPS or per-frame allocation rate.
  const soak=await page.evaluate(()=>{
    const snapshot=()=>({time:simulationTime,streams:planes.reduce((n,p)=>n+p.lanes.reduce((s,l)=>s+l.streams.length,0),0),
      cells:planes.reduce((n,p)=>n+p.lanes.reduce((s,l)=>s+l.streams.reduce((c,t)=>c+t.cells.size,0),0),0),
      tunnelRows:tunnelRows.size,tunnelBytes:[...tunnelRows.values()].reduce((n,r)=>n+r.cells.byteLength+r.glyphs.byteLength+r.mutationRows.byteLength,0)});
    const points=[snapshot()];
    for(let second=0;second<600;second++){
      for(let frame=0;frame<30;frame++)updateSimulation(1/30);
      renderScene();
      if((second+1)%300===0)points.push(snapshot());
    }
    return points;
  });
  await cdp.send('HeapProfiler.collectGarbage');
  const finalHeap=await cdp.send('Runtime.getHeapUsage');
  const gpu=await gpuTiming(page,test);
  return {...components,gpuTiming:gpu,heap:{initial:initialHeap,final:finalHeap},soak,
    cpuSelfMs:Object.fromEntries([...samples].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([name,us])=>[name,+(us/1000).toFixed(2)]))};
}
async function audioDiagnostics(browser) {
  const {context,page}=await openCase(browser,{touch:false,coarse:false,mode:'rain',variant:'flat'},'working');
  try {
    return await page.evaluate(async()=>{
      // Restore the real beat clock overridden for graphics benchmarking.
      delete soundEngine.beatEnergy;
      const start=performance.now();activateRainAudio();const initMs=performance.now()-start;
      await soundEngine.ctx.resume();clearInterval(soundEngine.timer);
      let liveSources=0,peakSources=0,createdSources=0;
      for(const method of ['createOscillator','createBufferSource']) {
        const original=soundEngine.ctx[method].bind(soundEngine.ctx);
        soundEngine.ctx[method]=(...args)=>{
          const source=original(...args);createdSources++;liveSources++;peakSources=Math.max(peakSources,liveSources);
          source.addEventListener('ended',()=>liveSources--,{once:true});return source;
        };
      }
      const profiles=[];
      for(const grade of ['cinema','abyss','voltage','anomaly']) {
        setRainOption('grade',grade);setRainOption('audio','score');clearInterval(soundEngine.timer);
        const times=[],before=createdSources;
        for(let i=0;i<200;i++){
          const a=performance.now();soundEngine.schedule();times.push(performance.now()-a);
          await new Promise(resolve=>setTimeout(resolve,25));
        }
        profiles.push({grade,times,createdSources:createdSources-before,liveSources,peakSources});
      }
      setRainOption('audio','off');
      await new Promise(resolve=>setTimeout(resolve,3500));
      const foley=[];
      for(const kind of ['panel-open','panel-close','toggle-on','select','slider','slider-end']){
        const a=performance.now();soundEngine.uiFoleySample(kind,14);const b=performance.now();soundEngine.uiFoleySample(kind,14);
        foley.push({kind,coldMs:b-a,warmMs:performance.now()-b});
      }
      return {initMs,sampleRate:soundEngine.ctx.sampleRate,noiseBytes:soundEngine.noise.length*4,
        profiles,remainingTransientSources:liveSources,foley,
        foleyBytes:[...soundEngine.uiFoleyCache.values()].reduce((n,b)=>n+b.length*4,0)};
    });
  } finally {await context.close();}
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.env.PERF_BROWSER||'msedge',headless:true});
  const report={reference:compare,host:{platform:os.platform(),cpu:os.cpus()[0].model,browser:browser.version()},
    runs,frames,warmup:60,results:[],diagnostics:[]};
  try {
    for(const test of cases) {
      const revisionsToRun=compare?['reference','working']:['working'];
      for(let run=0;run<runs;run++)for(const revision of run%2?revisionsToRun.slice().reverse():revisionsToRun) {
        const {context,page,errors}=await openCase(browser,test,revision);
        try {
          const measured=await measure(page,test);
          const result={case:test.name,revision,run,crt:measured.crt,update:stats(measured.update),render:stats(measured.render),
            total:stats(measured.update.map((value,i)=>value+measured.render[i])),interval:stats(measured.intervals)};
          if(errors.length)throw Error(errors.join('\n'));
          report.results.push(result);console.log(JSON.stringify(result));
        } finally {await context.close();}
      }
      if(diagnostics&&test.variant==='stress') {
        const {context,page}=await openCase(browser,test,'working');
        try {report.diagnostics.push({case:test.name,...await diagnose(page,test)});console.log('Diagnosed '+test.name);}
        finally {await context.close();}
      }
    }
    if(diagnostics){report.audio=await audioDiagnostics(browser);
      for(const profile of report.audio.profiles){profile.scheduleMs=stats(profile.times);delete profile.times;}}
    if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
