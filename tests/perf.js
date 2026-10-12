/* Optional real-browser benchmark: NODE_PATH must include Playwright.
 * node tests/perf.js [--ref HEAD] [--output path.json]
 * node tests/perf.js --verify-ref HEAD [--screenshots directory]
 * Measures JS simulation/render submission, not GPU presentation or device audio.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const option = name => process.argv[process.argv.indexOf(name)+1];
const ref = process.argv.includes('--ref') ? option('--ref') : null;
const output = process.argv.includes('--output') ? option('--output') : null;
const verifyRef = process.argv.includes('--verify-ref') ? option('--verify-ref') : null;
const screenshots = process.argv.includes('--screenshots') ? option('--screenshots') : null;
let referenceTunnel=null;
if(verifyRef) {
  const code=execFileSync('git',['show',`${verifyRef}:js/rain.js`],{cwd:root,encoding:'utf8'});
  referenceTunnel=code.slice(code.indexOf('function renderTunnel('),code.indexOf('function pulseInfluence('))
    .replace('function renderTunnel(','function referenceTunnel(');
}
const content = new Map();
for (const file of ['index.html','styles.css','js/rain.js','js/crt.js','js/audio.js','js/ui.js'])
  content.set('/'+file, ref ? execFileSync('git',['show',`${ref}:${file}`],{cwd:root}) : fs.readFileSync(path.join(root,file)));
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://localhost').pathname;
  const file = content.get(url==='/'?'/index.html':url);
  if (!file) {res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type', url.endsWith('.js')?'application/javascript':url.endsWith('.css')?'text/css':'text/html');
  res.end(file);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({channel:process.env.PERF_BROWSER || 'msedge',headless:true,
    args:process.argv.includes('--webgl')?['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:[]});
  const results = [];
  try {
    for(const coarse of [false,true])for(const mode of ['rain','tunnel'])for(const stress of [false,true]) {
      const viewport = coarse ? {width:390,height:844} : {width:1920,height:1080};
      const context = await browser.newContext({viewport,hasTouch:coarse,isMobile:coarse});
      const page = await context.newPage();
      const errors=[];page.on('pageerror',err=>errors.push(err.message));
      page.on('console',message=>{
        if(message.type()==='warning' || (message.type()==='error' && !/404|net::ERR_FAILED/.test(message.text())))
          console.log('Browser '+message.type()+': '+message.text());
      });
      await page.route('https://**/*',route=>route.abort());
      await page.addInitScript(coarse=>{
        Object.defineProperty(navigator,'maxTouchPoints',{get:()=>coarse?1:0});
        window.perfFrame=window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame=()=>0;
        let seed=123456;
        Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
      },coarse);
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.evaluate(()=>document.fonts.ready);
      const result = verifyRef ? await page.evaluate(({mode,stress,referenceTunnel})=>{
        (0,eval)(referenceTunnel);
        setRainOption('mode',mode);setRainOption('grain',0);
        simulationTime=3600000;tunnelTravel=48000;rain.mutation=2.5;
        let maxDifference=0;
        for(const grade of ['cinema','abyss','voltage','anomaly'])for(const zoom of [1,2])for(const beat of [0,.8]) {
          setRainOption('grade',grade);setRainOption('zoom',zoom);
          if(stress){setRainOption('density',1.65);setRainOption('speed',2.4);}
          rain.audio='score';visualBeat=beat;
          if(mode==='tunnel') {
            // Isolate render changes at the same geometry and beat input.
            background(...GRADES[rain.grade].bg);renderTunnel(drawingContext,simulationTime);
            const actual=drawingContext.getImageData(0,0,width,height).data;
            background(...GRADES[rain.grade].bg);window.referenceTunnel(drawingContext,simulationTime);
            const expected=drawingContext.getImageData(0,0,width,height).data;
            let difference=0;
            for(let i=0;i<actual.length;i++)difference+=Math.abs(actual[i]-expected[i]);
            maxDifference=Math.max(maxDifference,difference/(actual.length*255));
            if(maxDifference>.001)throw Error('Tunnel image changed: '+maxDifference);
          }
          renderScene();
          const transform=drawingContext.getTransform();
          if(!transform.isIdentity)throw Error('Tunnel leaked a canvas transform');
        }
        setRainOption('grade','cinema');setRainOption('zoom',1);visualBeat=0;
        setRainOption('paused',true);renderScene();
        return {maxDifference,crt:displayEngine.gl?'WebGL':'Canvas'};
      },{mode,stress,referenceTunnel}) : await page.evaluate(async ({mode,stress})=>{
        setRainOption('mode',mode);
        if(stress){setRainOption('grade','voltage');setRainOption('density',1.65);setRainOption('speed',2.4);}
        rain.audio='score';soundEngine.beatEnergy=()=>Math.exp(-(simulationTime%450)/72)*.76;
        const update=[],render=[];
        for(let i=0;i<150;i++){
          await new Promise(window.perfFrame);
          const a=performance.now();updateSimulation(1/60);const b=performance.now();renderScene();const c=performance.now();
          if(i>=30){update.push(b-a);render.push(c-b);}
        }
        const stats=values=>{
          const sorted=values.slice().sort((a,b)=>a-b);
          return {median:+sorted[Math.floor(sorted.length*.5)].toFixed(2),p95:+sorted[Math.floor(sorted.length*.95)].toFixed(2)};
        };
        return {update:stats(update),render:stats(render),total:stats(update.map((v,i)=>v+render[i])),crt:displayEngine.gl?'WebGL':'Canvas'};
      },{mode,stress});
      results.push({device:coarse?'touch emulation':'desktop',mode,stress,...result,errors});
      console.log(JSON.stringify(results.at(-1)));
      if(errors.length)throw Error(errors.join('\n'));
      if(verifyRef && mode==='rain' && !stress) {
        await page.evaluate(()=>setRainOption('paused',false));
        await page.keyboard.press('m');await page.keyboard.press('m');
        const audio=await page.evaluate(async ()=>{
          const energy=[];
          for(let i=0;i<40;i++) {
            await new Promise(resolve=>setTimeout(resolve,20));
            energy.push(soundEngine.beatEnergy());
          }
          if(!energy.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!energy.some(v=>v>0))
            throw Error('Real audio clock did not produce beat envelopes');
          setRainOption('paused',true);
          if(soundEngine.beatEnergy()!==0)throw Error('Pause did not clear the beat');
          setRainOption('audio','off');
          return {state:soundEngine.ctx.state,timestamp:!!soundEngine.ctx.getOutputTimestamp,peak:Math.max(...energy)};
        });
        console.log('Audio smoke '+JSON.stringify({coarse,...audio}));
      }
      if(screenshots) {
        fs.mkdirSync(screenshots,{recursive:true});
        await page.screenshot({path:path.join(screenshots,`${coarse?'touch':'desktop'}-${mode}-${stress?'stress':'default'}.png`)});
      }
      await context.close();
    }
    if(output)fs.writeFileSync(output,JSON.stringify({ref,results},null,2)+'\n');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
