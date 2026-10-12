/* Optional browser visual regression checks; NODE_PATH needs Playwright and pngjs.
 * node tests/visual-perf.js [--compare HEAD] [--output report.json]
 *                         [--screenshots directory] [--case rain|tunnel|touch|desktop]
 * Frozen, seeded Canvas source images are compared separately from compositor
 * screenshots of CRT output. This verifies pixels and interaction, not speed.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {PNG} = require('pngjs');
const root = path.resolve(__dirname, '..');
const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name)+1] : fallback;
const compare = arg('--compare', 'HEAD');
const output = arg('--output', null);
const screenshots = arg('--screenshots', null);
const tolerance = Number(arg('--max-difference', .001));
if (!Number.isFinite(tolerance) || tolerance < 0) throw Error('Image difference must be a nonnegative number');
const files = ['index.html','styles.css','js/rain.js','js/crt.js','js/audio.js','js/ui.js'];
const sources = new Map(['reference','working'].map(revision => [revision, new Map(files.map(file => [
  '/'+file, revision === 'reference'
    ? execFileSync('git', ['show', `${compare}:${file}`], {cwd:root})
    : fs.readFileSync(path.join(root,file))
]))]));
const server = http.createServer((req,res) => {
  const [revision,...parts] = new URL(req.url,'http://localhost').pathname.slice(1).split('/');
  const file = sources.get(revision)?.get('/'+(parts.join('/') || 'index.html'));
  if (!file) {res.writeHead(404);res.end();return;}
  const extension = path.extname(parts.at(-1) || 'index.html');
  res.setHeader('Content-Type',extension === '.js' ? 'application/javascript' : extension === '.css' ? 'text/css' : 'text/html');
  res.end(file);
});

function imageDifference(referenceBuffer, workingBuffer) {
  const reference = PNG.sync.read(referenceBuffer), working = PNG.sync.read(workingBuffer);
  assert.equal(working.width,reference.width,'Image width changed');
  assert.equal(working.height,reference.height,'Image height changed');
  let sum = 0, max = 0, changed = 0;
  for (let i=0;i<reference.data.length;i+=4) {
    let changedPixel = false;
    for (let channel=0;channel<3;channel++) {
      const delta = Math.abs(reference.data[i+channel]-working.data[i+channel]);
      sum += delta; max = Math.max(max,delta); changedPixel ||= delta !== 0;
    }
    if (changedPixel) changed++;
  }
  const pixels = reference.width*reference.height;
  return {mean:sum/(pixels*3*255),maxChannel:max,changedFraction:changed/pixels};
}

async function openPage(browser,touch,revision) {
  const viewport = touch ? {width:390,height:844} : {width:1920,height:1080};
  const context = await browser.newContext({viewport,hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.route('https://**/*',route => route.abort());
  await page.addInitScript(touch => {
    Object.defineProperty(navigator,'maxTouchPoints',{get:()=>touch ? 1 : 0});
    window.visualFrame = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = () => 0;
    let seed = 123456;
    window.resetVisualSeed = () => {seed=123456;};
    Math.random = () => ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  },touch);
  await page.goto(`http://127.0.0.1:${server.address().port}/${revision}/`);
  await page.evaluate(() => document.fonts.ready);
  // Screenshots contain only the displayed canvas, with no independently
  // changing UI clock, scrollbars, or controls obscuring the raster.
  await page.addStyleTag({content:'body > :not(#rain) {display:none !important}'});
  const renderer = await page.evaluate(() => {
    window.millis = () => 1000;
    lastRealTime = 1000;
    setRainOption('audio','off');
    const gl = displayEngine.gl;
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return {type:gl ? 'WebGL' : 'Canvas',renderer:info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null};
  });
  assert.equal(renderer.type,touch ? 'Canvas' : 'WebGL',`${revision}: unexpected CRT backend`);
  return {page,context,errors,renderer,revision};
}

async function prepare(page,test) {
  return page.evaluate(({mode,grade,zoom,effect}) => {
    setRainOption('paused',true);
    setRainOption('crt','off');
    setRainOption('mode',mode);
    setRainOption('grade',grade);
    // Selecting the same grade does not reload its preset. Reset explicitly
    // so each scenario is independent of the previous zoom/effect.
    for (const key of ['density','persistence','speed','mutation','glow'])
      setRainOption(key,SIGNAL_MOTION[grade][key]);
    setRainOption('zoom',zoom);
    setRainOption('grain',effect==='grain' ? .35 : 0);
    setRainOption('bloom',true);
    simulationTime=10000;frameNumber=0;nextGrainFrame=0;
    pulseSeq=0;hover={x:-999,y:-999,at:-Infinity};
    resetVisualSeed();buildScene();
    // Exercise real simulation and cell mutation, while fixing the visual beat
    // without creating an audio device or using a wall-clock audio scheduler.
    rain.audio='score';soundEngine.beatEnergy=()=>.68;
    for(let i=0;i<30;i++)updateSimulation(.055);
    if(effect==='breach')breachAt=simulationTime-900;
    if(effect==='surge')signalAt=simulationTime-850;
    if(effect==='ripple')pulses=[{x:width*.28,y:height*.57,at:simulationTime-180,id:++pulseSeq,power:3.25}];
    updateSimulation(.015);renderScene();renderDirty=false;
    if(!drawingContext.getTransform().isIdentity)throw Error('Renderer leaked a Canvas transform');
    return drawingContext.canvas.toDataURL('image/png').split(',')[1];
  },test);
}

async function present(entry,test,crt) {
  await entry.page.evaluate(({mode,crt,reference}) => {
    // Tunnel curvature was intentionally removed. Its historical scan output
    // is the expected appearance; rain continues to use its selected curve.
    setRainOption('crt',reference && mode==='tunnel' && crt==='glass' ? 'scan' : crt);
    draw();
  },{mode:test.mode,crt,reference:entry.revision==='reference'});
  return entry.page.locator('#rain').screenshot({animations:'disabled'});
}

async function waitPaused(page) {
  return page.evaluate(async () => {
    const before=simulationTime;
    for(let i=0;i<4;i++)await new Promise(resolve => visualFrame(() => {draw();resolve();}));
    if(simulationTime!==before)throw Error('Paused simulation advanced');
  });
}

async function pointerChecks(entry,touch,mode) {
  return entry.page.evaluate(({touch,mode,reference}) => {
    const samples=[];
    const target=document.getElementById('rain');
    const rect=target.getBoundingClientRect();
    rain.audio='off';rain.paused=false;
    for(const crt of ['off','scan','glass'])for(const zoom of [.65,1,2]) {
      setRainOption('crt',reference && mode==='tunnel' && crt==='glass' ? 'scan' : crt);
      setRainOption('zoom',zoom);
      for(const [fx,fy] of [[.07,.12],[.5,.5],[.93,.88]]) {
        const x=width*fx,y=height*fy,expected=visibleToSource(x,y);
        const world=screenToWorld(expected.x,expected.y),roundtrip=worldToScreen(world.x,world.y);
        if(Math.hypot(roundtrip.x-expected.x,roundtrip.y-expected.y)>1e-8)
          throw Error('Camera pointer mapping does not round-trip');
        lastClickTime=-Infinity;pulses=[];
        const options={bubbles:true,cancelable:true,pointerId:1,pointerType:touch?'touch':'mouse',
          button:0,isPrimary:true,clientX:rect.left+rect.width*fx,clientY:rect.top+rect.height*fy};
        target.dispatchEvent(new PointerEvent('pointerdown',options));
        if(touch)target.dispatchEvent(new PointerEvent('pointerup',options));
        const pulse=pulses.at(-1);
        if(!pulse||Math.hypot(pulse.x-expected.x,pulse.y-expected.y)>1e-8)
          throw Error('Pointer ripple missed its mapped source position');
        samples.push({crt,zoom,fx,fy,x:expected.x,y:expected.y});
      }
    }
    rain.paused=true;pulses=[];
    return samples;
  },{touch,mode,reference:entry.revision==='reference'});
}

async function lifecycleChecks(entry,test) {
  const {page}=entry;
  await prepare(page,{...test,grade:'cinema',zoom:1,effect:'normal'});
  await page.evaluate(() => {
    setRainOption('mode','rain');setRainOption('crt','glass');draw();
    setRainOption('mode','tunnel');draw();
    if(rain.crt!=='glass')throw Error('Mode switch lost the CRT preference');
    setRainOption('mode','rain');draw();
    if(rain.crt!=='glass'||displayEngine.mode!=='glass')throw Error('Rain CRT preference was not restored');
  });
  const frozenTime=await page.evaluate(({mode,reference}) => {
    setRainOption('mode',mode);
    setRainOption('crt',reference && mode==='tunnel' ? 'scan' : 'glass');
    draw();
    return simulationTime;
  },{mode:test.mode,reference:entry.revision==='reference'});
  // Shrink and grow while paused; both canvases must resize and paint without
  // depending on the next animation tick.
  const original=test.touch ? {width:390,height:844} : {width:1920,height:1080};
  const reduced={width:original.width-41,height:original.height-67};
  await page.setViewportSize(reduced);
  await page.evaluate(() => windowResized());
  await waitPaused(page);
  const dimensions=() => page.evaluate(() => ({source:[width,height],
    output:[displayEngine.output.width,displayEngine.output.height],time:simulationTime}));
  assert.deepEqual(await dimensions(),{source:[reduced.width,reduced.height],
    output:[reduced.width,reduced.height],time:frozenTime});
  const shrunk=await page.locator('#rain').screenshot({animations:'disabled'});
  await page.setViewportSize(original);
  await page.evaluate(() => windowResized());
  await waitPaused(page);
  assert.deepEqual(await dimensions(),{source:[original.width,original.height],
    output:[original.width,original.height],time:frozenTime});
  const grown=await page.locator('#rain').screenshot({animations:'disabled'});
  return {shrunk,grown};
}

(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.env.PERF_BROWSER || 'msedge',headless:true});
  const report={reference:compare,tolerance,source:[],crt:[],retention:[],devices:[],interaction:[]};
  const failures=[];
  if(screenshots)fs.mkdirSync(screenshots,{recursive:true});
  const checkImage=(kind,name,reference,working,limit=tolerance) => {
    const difference=imageDifference(reference,working);
    report[kind].push({case:name,...difference});
    if(difference.mean>limit) {
      failures.push(`${kind} ${name}: mean channel difference ${difference.mean} exceeds ${limit}`);
      if(screenshots)for(const [revision,image] of [['reference',reference],['working',working]])
        fs.writeFileSync(path.join(screenshots,`${kind}-${name}-${revision}.png`),image);
    }
  };
  try {
    for(const touch of [false,true])for(const mode of ['rain','tunnel']) {
      const device=touch?'touch':'desktop',group=`${device}-${mode}`;
      if(arg('--case','')&&!group.includes(arg('--case','')))continue;
      const entries=[];
      try {
        for(const revision of ['reference','working'])entries.push(await openPage(browser,touch,revision));
        report.devices.push({case:group,reference:entries[0].renderer,working:entries[1].renderer});
        const sourceBefore=report.source.length,crtBefore=report.crt.length;
        for(const grade of ['cinema','abyss','voltage','anomaly'])for(const zoom of [.65,1,2])
          for(const effect of ['normal','breach','surge','ripple','grain']) {
            const test={touch,mode,grade,zoom,effect},name=`${group}-${grade}-${zoom}-${effect}`;
            const source=[];
            for(const entry of entries)source.push(Buffer.from(await prepare(entry.page,test),'base64'));
            // Thirty-one seeded updates refresh the film tile repeatedly.
            // Buffer reuse must preserve its pixels and RNG consumption exactly.
            checkImage('source',name,...source,effect==='grain' ? 0 : tolerance);
            // CRT owns only presentation: normal seeded scenes cover every
            // profile and zoom, while source tests cover all effect geometry.
            if(effect==='normal')for(const crt of ['scan','glass']) {
              const displayed=[];
              for(const entry of entries) {
                const before=await present(entry,test,crt);displayed.push(before);
                await waitPaused(entry.page);
                const after=await entry.page.locator('#rain').screenshot({animations:'disabled'});
                checkImage('retention',`${name}-${crt}-${entry.revision}`,before,after,0);
              }
              checkImage('crt',`${name}-${crt}`,...displayed);
            }
          }
        const pointers=[];
        for(const entry of entries)pointers.push(await pointerChecks(entry,touch,mode));
        assert.equal(pointers[0].length,pointers[1].length);
        let pointerError=0;
        for(let i=0;i<pointers[0].length;i++)pointerError=Math.max(pointerError,
          Math.hypot(pointers[0][i].x-pointers[1][i].x,pointers[0][i].y-pointers[1][i].y));
        assert.ok(pointerError<1e-8,`${group}: pointer coordinates changed by ${pointerError}`);
        const resize=[];
        for(const entry of entries)resize.push(await lifecycleChecks(entry,{touch,mode}));
        for(const size of ['shrunk','grown'])
          checkImage('crt',`${group}-paused-resize-${size}`,...resize.map(images=>images[size]));
        report.interaction.push({case:group,pointerSamples:pointers[0].length,pointerError,modePreference:true,pausedResize:true});
        for(const entry of entries)assert.deepEqual(entry.errors,[],`${group} ${entry.revision}: page errors`);
        console.log(JSON.stringify({case:group,sourceChecks:report.source.length-sourceBefore,
          crtChecks:report.crt.length-crtBefore,pointerSamples:pointers[0].length}));
      } finally {for(const entry of entries)await entry.context.close();}
    }
    report.failures=failures;
    if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
    const maximum=kind=>Math.max(0,...report[kind].map(result=>result.mean));
    console.log(JSON.stringify({source:report.source.length,crt:report.crt.length,retention:report.retention.length,
      maxSourceDifference:maximum('source'),maxCrtDifference:maximum('crt'),failures:failures.length}));
    assert.deepEqual(failures,[],'Visual equivalence failed');
  } finally {await browser.close();server.close();}
})().catch(error => {console.error(error);server.close();process.exitCode=1;});
