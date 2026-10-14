// One source for dispatch, hover hints, keycaps and the desktop controls guide.
const RAIN_SHORTCUTS=Object.freeze([
  {id:'pause',key:'space',keys:['Space'],aria:'Space',group:'Playback',label:'Pause / resume signal'},
  {id:'music',key:'m',shift:false,keys:['M'],aria:'M',group:'Playback',label:'Music on / off'},
  {id:'mute',key:'m',shift:true,keys:['Shift','M'],aria:'Shift+M',group:'Playback',label:'Mute / restore all audio'},
  {id:'fullscreen',key:'f',keys:['F'],aria:'F',group:'Playback',label:'Enter / exit fullscreen'},
  {id:'settings',key:'s',keys:['S'],aria:'S',group:'Settings',label:'Open / close settings'},
  {id:'closeSettings',key:'escape',keys:['Esc'],aria:'Escape',group:'Settings',label:'Close settings',showInHelp:false},
  {id:'view',key:'v',keys:['V'],aria:'V',group:'Appearance',label:'Rain / tunnel view'},
  {id:'color',key:'c',keys:['C'],aria:'C',group:'Appearance',label:'Cycle signal profile'},
  {id:'flat',key:'1',keys:['1'],aria:'1',group:'Appearance',label:'Flat display'},
  {id:'scan',key:'2',keys:['2'],aria:'2',group:'Appearance',label:'Scanlines display'},
  {id:'curved',key:'3',keys:['3'],aria:'3',group:'Appearance',label:'Curved CRT display'},
  {id:'texture',key:'t',keys:['T'],aria:'T',group:'Appearance',label:'Film texture on / off'},
  {id:'glow',key:'g',keys:['G'],aria:'G',group:'Appearance',label:'Glow on / off'},
  {id:'densityDown',key:'-',keys:['−'],aria:'-',group:'Appearance',label:'Decrease column density'},
  {id:'densityUp',key:'+',keys:['+'],aria:'Plus',group:'Appearance',label:'Increase column density'},
  {id:'surge',key:'e',keys:['E'],aria:'E',group:'Effects',label:'Electric surge'},
  {id:'breach',key:'b',keys:['B'],aria:'B',group:'Effects',label:'System breach'},
  {id:'reseed',key:'r',keys:['R'],aria:'R',group:'Effects',label:'Reseed field'}
].map(binding=>Object.freeze({...binding,keys:Object.freeze(binding.keys)})));
window.RainShortcuts=RAIN_SHORTCUTS;

// App dependencies have finished loading before installing the Canvas runtime.
installRainCanvasRuntime();
// The browser's focused control must not steal
// Space, E, B, or any other shortcut. One event => at most one action.
function handleRainShortcut(event) {
  if(event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
  // Respect editable text; range sliders,
  // checkboxes, radios and buttons are deliberately NOT excluded.
  const target=event.target;
  if(target?.isContentEditable || target?.matches?.('textarea, input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])')) return;
  const k=String(event.key).toLowerCase();
  // Space belongs to global pause. Give focused checkboxes an activation key
  // too; unlike buttons, native checkboxes do not activate with Enter.
  if(k==='enter' && target?.matches?.('input[type=checkbox]') && !target.disabled){
    event.preventDefault();event.stopImmediatePropagation();
    activateRainAudio();target.click();return;
  }
  const shortcut = event.code==='Space' || k===' ' ? 'space' :
    event.code==='NumpadAdd' ? '+' :
    event.code==='NumpadSubtract' ? '-' :
    ['+','='].includes(k) ? '+' : ['-','_'].includes(k) ? '-' : k;
  const binding=RAIN_SHORTCUTS.find(item=>item.key===shortcut &&
    (item.shift===undefined || item.shift===!!event.shiftKey));
  if(!binding || typeof window.runRainAction!=='function')return;
  if(binding.id==='closeSettings' && !document.getElementById('panel')?.classList.contains('open'))return;
  event.preventDefault();  // Space never activates a focused button or scrolls.
  event.stopImmediatePropagation(); // Other keydown listeners cannot double-fire.
  if(binding.id!=='closeSettings')activateRainAudio();
  window.runRainAction(binding.id,{keyboard:true});
}

window.addEventListener('keydown', handleRainShortcut, {capture:true});
(()=>{
  const $=id=>document.getElementById(id);
  // Descriptive text and value labels may be omitted from the panel markup.
  const setText=(id,text)=>{const el=$(id);if(el)el.textContent=text;};
  const panel=$('panel'),toggle=$('toggle');
  const fpsIndicator=$('fps-indicator');
  let fpsEnabled=false,fpsPaused=false,fpsSampleAt=0,fpsSampleFrames=0;
  const fsButton=$('fullscreen-toggle');
  const musicButton=$('music-toggle');
  const signalButton=$('signal-indicator');
  const touchControls=window.matchMedia?.('(pointer: coarse)');
  const phoneLayout=window.matchMedia?.('(max-width: 560px)');
  const useTouchHelp=()=>touchControls?.matches||phoneLayout?.matches;
  const shortcutsById=new Map(RAIN_SHORTCUTS.map(binding=>[binding.id,binding]));
  const shortcutControls=Array.from(document.querySelectorAll('[data-shortcut]'));
  const keyMarkup=binding=>binding.keys.map(key=>`<kbd>${key}</kbd>`).join('<span class="key-join"> + </span>');
  const keyNames=ids=>ids.map(id=>shortcutsById.get(id).keys.join(' + ')).join(' / ');
  const hint=(el,label,ids)=>{
    if(!el)return;
    el.title=label+(useTouchHelp()?'':` (${keyNames(ids)})`);
    el.setAttribute('aria-keyshortcuts',ids.map(id=>shortcutsById.get(id).aria).join(' '));
  };
  const help=$('keyboard-help');
  if(help){
    const helpBindings=RAIN_SHORTCUTS.filter(binding=>binding.showInHelp!==false);
    const groups=[...new Set(helpBindings.map(binding=>binding.group))];
    help.innerHTML=groups.map(group=>`<section class="shortcut-group" aria-label="${group} shortcuts"><h3>${group}</h3>${helpBindings.filter(binding=>binding.group===group).map(binding=>`<div class="shortcut-row"><span>${binding.label}</span><span class="shortcut-keys">${keyMarkup(binding)}</span></div>`).join('')}</section>`).join('');
  }
  document.querySelectorAll('[data-shortcut-keys]').forEach(el=>{
    const binding=shortcutsById.get(el.dataset.shortcutKeys);
    if(binding){el.innerHTML=keyMarkup(binding);el.setAttribute('aria-hidden','true');}
  });
  const updateShortcutHints=()=>{
    const st=getRainOptions();
    for(const el of shortcutControls){
      const ids=el.dataset.shortcut.split(' ');
      let label=ids.map(id=>shortcutsById.get(id).label).join(' / ');
      if(el===musicButton)label=st.audio==='score'?'Turn music off':'Turn music on';
      else if(el===fsButton)label=document.fullscreenElement?'Exit fullscreen':'Enter fullscreen';
      else if(el===toggle)label=panel.classList.contains('open')?'Close settings':'Open settings';
      else if(ids[0]==='pause')label=st.paused?'Resume signal':'Pause signal';
      if(el===musicButton||el===fsButton||el===toggle||el===signalButton)el.setAttribute('aria-label',label);
      hint(el,label,ids);
    }
  };
  const updateFullscreenButton=()=>{
    const active=!!document.fullscreenElement;
    fsButton.classList.toggle('is-fullscreen',active);
    fsButton.setAttribute('aria-pressed',String(active));
    updateShortcutHints();
  };
  window.toggleRainFullscreen=async()=>{
    try{
      if(document.fullscreenElement){await document.exitFullscreen();}
      else if(document.documentElement.requestFullscreen){
        await document.documentElement.requestFullscreen({navigationUI:'hide'});
      } else {
        notify('FULLSCREEN UNAVAILABLE HERE / TRY ADD TO HOME SCREEN ON IOS');
      }
    } catch(err){notify('FULLSCREEN BLOCKED BY BROWSER');}
    updateFullscreenButton();
  };
  document.addEventListener('fullscreenchange',updateFullscreenButton);
  touchControls?.addEventListener?.('change',updateShortcutHints);
  phoneLayout?.addEventListener?.('change',updateShortcutHints);
  updateFullscreenButton();
  const notify=s=>setText('notify',s);
  // Browser autoplay policy: do not create or resume WebAudio on page load.
  // The first pointer/key gesture arms the selected default, before the UI
  // handler plays its sound (and before the rain's native pointer ripple).
  const activateOnGesture=(event)=>{
    if(getRainOptions().audio==='off')return;
    if(event.target?.closest?.('[data-audio="off"]'))return;
    const sound=window.signalSound();
    if(!sound||sound.ctx)return;
    window.activateRainAudio?.();
    sync();
  };
  document.addEventListener('pointerdown',activateOnGesture,{capture:true});
  document.addEventListener('keydown',event=>{
    if(event.repeat||event.altKey||event.ctrlKey||event.metaKey||
       event.isComposing || ['Shift','Control','Alt','Meta','CapsLock','Escape'].includes(event.key))return;
    activateOnGesture(event);
  },{capture:true});
  const feedback=(kind,value=.5,control='')=>window.signalSound()?.interfaceSound(kind,value,control);
  window.toggleRainPanel=({keyboard=false}={})=>{
    const open=panel.classList.toggle('open');
    toggle.setAttribute('aria-expanded',String(open));
    updateShortcutHints();
    if(open&&keyboard)document.querySelector('[data-mode="rain"]')?.focus();
    if(!open&&(keyboard||panel.contains(document.activeElement)))toggle.focus();
    feedback(open?'panel-open':'panel-close');
  };
  $('rain').addEventListener('pointerdown',()=>{
    if(panel.classList.contains('open'))window.toggleRainPanel();
  });
  const ranges=Object.keys(RainApp.settings).filter(name=>RainApp.settings[name].type==='number'&&$(name));
  for(const name of ranges){
    const el=$(name),spec=RainApp.settings[name];
    el.min=spec.min;el.max=spec.max;el.step=spec.step;
    const norm=()=>Number((el.value-el.min)/(el.max-el.min));
    el.addEventListener('input',()=>{
      setRainOption(name,Number(el.value));
      feedback('slider',norm(),name);
    });
    // One soft landing when releasing a drag or finishing a keyboard adjustment.
    el.addEventListener('change',()=>feedback('slider-end',norm(),name));
  }
  for(const name of ['beatReactive','showFPS','unlockMobileFPS','bloom'])
    $(name).addEventListener('change',()=>{
      const enabled=$(name).checked;
      setRainOption(name,enabled);
      feedback(enabled?'toggle-on':'toggle-off');
    });
  for(const name of ['showFPS','unlockMobileFPS','beatReactive'])$(name).setAttribute('aria-keyshortcuts','Enter');
  for(const selector of ['mode','grade','crt','audio']){
    document.querySelectorAll(`[data-${selector}]`).forEach(button=>button.addEventListener('click',()=>{
      const selected=button.dataset[selector];
      const previous=getRainOptions()[selector];
      if(selected===previous)return;
      if(selector==='audio'&&selected==='off')feedback('toggle-off');
      setRainOption(selector,selected);
      if(selector==='audio'){
        if(selected!=='off')feedback(previous==='off'?'toggle-on':'select');
      } else feedback('select');
    }));
  }
  const details={
    mode:{rain:'Your window into the Matrix.',tunnel:'Fly through twisting walls of code.'},
    grade:{cinema:'Classic emerald trails with bright heads.',
      abyss:'Sparse cyan drift with long, soft trails.',
      voltage:'Fast chartreuse streams with bold bloom.',
      anomaly:'Uneven magenta surges and broken trails.'},
    crt:{off:'Unprocessed, razor-sharp digital rain.',
      scan:'Analog scanlines with compensated phosphor brightness.',
      glass:'Adjustable barrel curve with a full-screen crop, and pronounced scanlines.'}
  };
  function sync(){
    const st=getRainOptions();
    const musicOn=st.audio==='score';
    musicButton.setAttribute('aria-pressed',String(musicOn));
    updateShortcutHints();
    document.documentElement.dataset.signal=st.grade;
    // Match supported mobile browser chrome to the selected signal.
    const themeBG={cinema:'#03150b',abyss:'#04131d',voltage:'#111704',anomaly:'#190512'};
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',themeBG[st.grade]);
    for(const name of ranges){
      $(name).value=st[name];
      setText(name+'-value',RainApp.settings[name].format(st[name]));
      $(name).setAttribute('aria-valuetext',RainApp.settings[name].format(st[name]));
    }
    for(const name of ['beatReactive','showFPS','unlockMobileFPS','bloom'])$(name).checked=st[name];
    $('mobile-fps-setting').hidden=!RainApp.mobileInput;
    if(fpsIndicator)fpsIndicator.hidden=!st.showFPS;
    if(st.showFPS!==fpsEnabled || st.paused!==fpsPaused) {
      fpsEnabled=st.showFPS;fpsPaused=st.paused;
      fpsSampleAt=performance.now();fpsSampleFrames=RainApp.renderedFrames;
      if(fpsEnabled)setText('fps-value',st.paused?'0':'—');
    }
    for(const key of ['mode','grade','crt','audio']){
      document.querySelectorAll(`[data-${key}]`).forEach(b=>{
        const active=b.dataset[key]===st[key];
        b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
      });
      if(details[key])setText(key+'-help',details[key][st[key]]);
    }
    setText('pause-label',st.paused?'RESUME SIGNAL':'PAUSE SIGNAL');
    $('pause-btn').setAttribute('aria-pressed',String(st.paused));
    setText('speed-label',st.mode==='tunnel'?'FLIGHT / RAIN VELOCITY':'FALL VELOCITY');
    $('rain').setAttribute('aria-label',st.mode==='tunnel'?'Interactive flight through a twisting digital code tunnel':'Interactive falling digital code rain');
    setText('status',st.paused?'OFFLINE':'ONLINE');
    if(signalButton){
      signalButton.dataset.paused=String(st.paused);
      signalButton.setAttribute('aria-pressed',String(st.paused));
    }
    setText('audio-status',st.audio==='off'?'AUDIO // MUTED':
      st.audio==='score'?'AUDIO // SCORE + HUM':
      st.audio==='effects'?(window.signalSound()?.ctx?'AUDIO // SFX ONLY':'AUDIO // SFX ARMED'):'AUDIO // STATIC HUM');
    $('curvature').disabled=st.crt!=='glass'||st.mode==='tunnel';
    $('scanBrightness').disabled=st.crt==='off';
    $('humVolume').disabled=st.audio!=='ambience'&&st.audio!=='score';
    $('scoreVolume').disabled=st.audio!=='score';
    $('beatReactive').disabled=st.audio!=='score';
    $('beatStrength').disabled=st.audio!=='score'||!st.beatReactive;
    $('interfaceLevel').disabled=st.audio==='off'||!st.interfaceSounds;
    $('glow').disabled=!st.bloom;
    $('glow').title=st.bloom?'':'Turn on Phosphor Glow to adjust halo strength.';
    const displayNote=st.mode==='tunnel'?(st.crt==='off'?
      'Curvature is saved for rain. Choose Scanlines or Curved CRT to add scanlines in the tunnel.':
      'Curvature is saved for rain. Scanlines still apply in the tunnel.'):
      st.crt==='off'?'Choose Scanlines or Curved CRT to adjust phosphor brightness.':
      st.crt==='scan'?'Choose Curved CRT to adjust curvature.':'Curvature and phosphor brightness are adjustable.';
    setText('display-note',displayNote);
    const audioNote=st.audio==='off'?'All audio is muted. Choose an audio mode to listen.':
      st.audio==='score'?(st.paused?'Signal paused. Music resumes with the signal; hum and UI sounds can continue.':
        st.beatReactive?'Music is on. Adjust score, hum and beat impact independently.':'Enable Beat Reactive Code to adjust beat impact.'):
      st.audio==='ambience'?'Static hum is on. Turn music on to unlock score volume and beat controls.':
      'UI and effect sounds are on. Choose Static Hum or turn music on to unlock more audio controls.';
    setText('audio-note',audioNote);
    for(const [id,note] of [['curvature',displayNote],['scanBrightness',displayNote],['humVolume',audioNote],
      ['scoreVolume',audioNote],['beatReactive',audioNote],['beatStrength',audioNote],['interfaceLevel',audioNote]]){
      $(id).title=$(id).disabled?note:'';
    }
  }
  window.addEventListener('rain-state',sync);sync();
  const beatLEDs=Array.from(document.querySelectorAll('#beat-leds i'));
  let lastBeatFrame=0,lastBeatEnergy=-1;
  function beatVisualClock(t){
    if(fpsEnabled && t-fpsSampleAt>=1000) {
      const frames=RainApp.renderedFrames;
      const fps=fpsPaused?0:Math.round((frames-fpsSampleFrames)*1000/(t-fpsSampleAt));
      const value=$('fps-value');
      if(value && value.textContent!==String(fps))value.textContent=String(fps);
      fpsSampleAt=t;fpsSampleFrames=frames;
    }
    if(t-lastBeatFrame>32){
      lastBeatFrame=t;
      const st=RainApp.state;
      const e=st.audio==='score'&&st.beatReactive?(window.signalSound()?.beatEnergy()||0)*st.beatStrength:0;
      if(e!==lastBeatEnergy)beatLEDs.forEach((bar,i)=>{
        const level=Math.max(.13,Math.min(1,.12+e*(.62+.20*Math.sin(i*2.1))));
        bar.style.transform=`scaleY(${level})`;
        bar.style.opacity=String(.26+Math.min(1,e)*.74);
      });
      lastBeatEnergy=e;
    }
    requestAnimationFrame(beatVisualClock);
  }
  requestAnimationFrame(beatVisualClock);
  // Buttons and hotkeys share actions, feedback and state changes.
  const actions={
    pause(){
      const next=!getRainOptions().paused;setRainOption('paused',next);
      feedback(next?'pause':'resume');
    },
    music(){
      const enabled=getRainOptions().audio!=='score';
      if(!enabled)feedback('toggle-off');
      setRainOption('audio',enabled?'score':'effects');
      if(enabled)feedback('toggle-on');
    },
    mute(){
      const wasMuted=getRainOptions().audio==='off';
      if(!wasMuted)feedback('toggle-off');
      RainApp.toggleMute();
      if(wasMuted)feedback('toggle-on');
    },
    fullscreen(){activateRainAudio();window.toggleRainFullscreen();feedback('select');},
    settings(options){window.toggleRainPanel(options);},
    closeSettings(options){if(panel.classList.contains('open'))window.toggleRainPanel(options);},
    view(){const st=getRainOptions();setRainOption('mode',st.mode==='tunnel'?'rain':'tunnel');feedback('select');},
    color(){const st=getRainOptions();setRainOption('grade',RainApp.profiles[(RainApp.profiles.indexOf(st.grade)+1)%RainApp.profiles.length]);feedback('select');},
    flat(){setRainOption('crt','off');feedback('select');},
    scan(){setRainOption('crt','scan');feedback('select');},
    curved(){setRainOption('crt','glass');feedback('select');},
    texture(){setRainOption('grain',getRainOptions().grain>0?0:RainApp.settings.grain.default);feedback(getRainOptions().grain>0?'toggle-on':'toggle-off');},
    glow(){setRainOption('bloom',!getRainOptions().bloom);feedback(getRainOptions().bloom?'toggle-on':'toggle-off');},
    densityUp(){setRainOption('density',getRainOptions().density+.1);feedback('slider');},
    densityDown(){setRainOption('density',getRainOptions().density-.1);feedback('slider');},
    // Cinematic effects own their sound signatures; do not stack UI ticks.
    surge(){signalRain();notify('ELECTRICAL SCAN PROPAGATING');},
    breach(){
      breachRain();notify('REALITY BREACH / SIGNAL RELOCK IN PROGRESS');
      const b=$('breach-btn');b.classList.add('triggered');setTimeout(()=>b.classList.remove('triggered'),500);
    },
    reseed(){reseedRain();feedback('commit');notify('SIGNAL FIELD RESEEDED');},
    defaults(){resetRain();feedback('reset');notify('SOURCE SIGNAL CONFIG RESTORED');}
  };
  window.runRainAction=(id,options={})=>actions[id]?.(options);
  for(const [id,action] of [['music-toggle','music'],['fullscreen-toggle','fullscreen'],['toggle','settings'],
    ['signal-indicator','pause'],['pause-btn','pause'],['surge-btn','surge'],['breach-btn','breach'],
    ['reseed-btn','reseed'],['defaults-btn','defaults']]){
    $(id)?.addEventListener('click',event=>window.runRainAction(action,{keyboard:action==='settings'&&event.detail===0}));
  }
})();
