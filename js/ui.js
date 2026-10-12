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
  const shortcut = event.code==='Space' || k===' ' ? 'space' :
    event.code==='NumpadAdd' ? '+' :
    event.code==='NumpadSubtract' ? '-' :
    ['+','='].includes(k) ? '+' : ['-','_'].includes(k) ? '-' : k;
  const recognized = new Set(['space','f','g','r','e','b','m','1','2','3','t','c','h','+','-']);
  if(!recognized.has(shortcut))return;
  if(shortcut==='h' && typeof window.toggleRainPanel!=='function')return;
  event.preventDefault();  // Space never activates a focused button or scrolls.
  event.stopImmediatePropagation(); // Other keydown listeners cannot double-fire.
  activateRainAudio();
  const rain=getRainOptions();
  const feedback = kind => window.signalSound()?.interfaceSound(kind);
  switch(shortcut) {
    case 'space': {
      const paused=!rain.paused;
      setRainOption('paused',paused);
      feedback(paused?'pause':'resume');
      break;
    }
    case 'f': if(window.toggleRainFullscreen)window.toggleRainFullscreen();
      else if(document.fullscreenElement)document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(()=>{});
      feedback('select'); break;
    case 'g': setRainOption('bloom',!rain.bloom); feedback(getRainOptions().bloom?'toggle-on':'toggle-off'); break;
    case 'r': reseedRain(); feedback('commit'); break;
    case 'e': signalRain(); break; // Cinematic effect owns its sound.
    case 'b': breachRain(); break;
    case 'm': {
      const wasMuted=rain.audio==='off';
      if(!wasMuted) feedback('toggle-off');
      RainApp.toggleMute();
      if(wasMuted) feedback('toggle-on');
      break;
    }
    case '1': setRainOption('crt','off'); feedback('select'); break;
    case '2': setRainOption('crt','scan'); feedback('select'); break;
    case '3': setRainOption('crt','glass'); feedback('select'); break;
    case 't': setRainOption('grain',rain.grain>0?0:RainApp.settings.grain.default); feedback(getRainOptions().grain>0?'toggle-on':'toggle-off'); break;
    case 'c': setRainOption('grade',RainApp.profiles[(RainApp.profiles.indexOf(rain.grade)+1)%RainApp.profiles.length]); feedback('select'); break;
    case 'h': window.toggleRainPanel(); break;
    case '+': setRainOption('density',rain.density+.1); feedback('slider'); break;
    case '-': setRainOption('density',rain.density-.1); feedback('slider'); break;
  }
}

window.addEventListener('keydown', handleRainShortcut, {capture:true});
(()=>{
  const $=id=>document.getElementById(id);
  // Descriptive text and value labels may be omitted from the panel markup.
  const setText=(id,text)=>{const el=$(id);if(el)el.textContent=text;};
  const panel=$('panel'),toggle=$('toggle');
  const fsButton=$('fullscreen-toggle');
  const musicButton=$('music-toggle');
  musicButton.addEventListener('click',()=>{
    const enabled=getRainOptions().audio!=='score';
    setRainOption('audio',enabled?'score':'effects');
    window.signalSound()?.interfaceSound(enabled?'toggle-on':'toggle-off');
  });
  const touchControls=window.matchMedia?.('(pointer: coarse)');
  const phoneLayout=window.matchMedia?.('(max-width: 560px)');
  const useTouchHelp=()=>touchControls?.matches||phoneLayout?.matches;
  const updateFullscreenButton=()=>{
    const active=!!document.fullscreenElement;
    fsButton.classList.toggle('is-fullscreen',active);
    fsButton.setAttribute('aria-pressed',String(active));
    fsButton.setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');
    fsButton.title=(active?'Exit fullscreen':'Enter fullscreen')+(useTouchHelp()?'':' (F)');
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
  fsButton.addEventListener('click',()=>{
    activateRainAudio();window.toggleRainFullscreen();
    window.signalSound()?.interfaceSound('select');
  });
  document.addEventListener('fullscreenchange',updateFullscreenButton);
  touchControls?.addEventListener?.('change',updateFullscreenButton);
  phoneLayout?.addEventListener?.('change',updateFullscreenButton);
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
       ['Shift','Control','Alt','Meta','CapsLock'].includes(event.key))return;
    activateOnGesture(event);
  },{capture:true});
  const feedback=(kind,value=.5,control='')=>window.signalSound()?.interfaceSound(kind,value,control);
  const updatePanelButton=()=>{
    const label=panel.classList.contains('open')?'Close system panel':'Open system panel';
    toggle.setAttribute('aria-label',label);
    toggle.title=label+(useTouchHelp()?'':' (H)');
  };
  touchControls?.addEventListener?.('change',updatePanelButton);
  phoneLayout?.addEventListener?.('change',updatePanelButton);
  updatePanelButton();
  window.toggleRainPanel=()=>{
    const open=panel.classList.toggle('open');
    toggle.setAttribute('aria-expanded',String(open));
    updatePanelButton();
    if(!open&&panel.contains(document.activeElement))toggle.focus();
    feedback(open?'panel-open':'panel-close');
  };
  toggle.addEventListener('click',window.toggleRainPanel);
  $('rain').addEventListener('pointerdown',()=>{
    if(panel.classList.contains('open'))window.toggleRainPanel();
  });
  panel.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&panel.classList.contains('open')){
      event.preventDefault();window.toggleRainPanel();toggle.focus();
    }
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
  for(const name of ['beatReactive'])
    $(name).addEventListener('change',()=>{
      const enabled=$(name).checked;
      setRainOption(name,enabled);
      feedback(enabled?'toggle-on':'toggle-off');
    });
  for(const selector of ['grade','crt','audio']){
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
    musicButton.setAttribute('aria-label',musicOn?'Turn music off':'Turn music on');
    musicButton.title=musicOn?'Turn music off':'Turn music on';
    document.documentElement.dataset.signal=st.grade;
    // Match supported mobile browser chrome to the selected signal.
    const themeBG={cinema:'#03150b',abyss:'#04131d',voltage:'#111704',anomaly:'#190512'};
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',themeBG[st.grade]);
    for(const name of ranges){
      $(name).value=st[name];
      setText(name+'-value',RainApp.settings[name].format(st[name]));
      $(name).setAttribute('aria-valuetext',RainApp.settings[name].format(st[name]));
    }
    for(const name of ['beatReactive'])$(name).checked=st[name];
    for(const key of ['grade','crt','audio']){
      document.querySelectorAll(`[data-${key}]`).forEach(b=>{
        const active=b.dataset[key]===st[key];
        b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
      });
      if(details[key])setText(key+'-help',details[key][st[key]]);
    }
    setText('pause-btn',st.paused?'RESUME SIGNAL':'PAUSE SIGNAL');
    setText('status',st.paused?'OFFLINE':'ONLINE');
    if($('signal-indicator'))$('signal-indicator').dataset.paused=String(st.paused);
    setText('audio-status',st.audio==='off'?'AUDIO // MUTED':
      st.audio==='score'?'AUDIO // SCORE + HUM':
      st.audio==='effects'?(window.signalSound()?.ctx?'AUDIO // SFX ONLY':'AUDIO // SFX ARMED'):'AUDIO // STATIC HUM');
    $('curvature').disabled=st.crt!=='glass';
    $('scanBrightness').disabled=st.crt==='off';
    $('humVolume').disabled=st.audio!=='ambience'&&st.audio!=='score';
    $('scoreVolume').disabled=st.audio!=='score';
    $('beatReactive').disabled=st.audio!=='score';
    $('beatStrength').disabled=st.audio!=='score'||!st.beatReactive;
    $('interfaceLevel').disabled=st.audio==='off'||!st.interfaceSounds;
  }
  window.addEventListener('rain-state',sync);sync();
  const beatLEDs=Array.from(document.querySelectorAll('#beat-leds i'));
  let lastBeatFrame=0;
  function beatVisualClock(t){
    if(t-lastBeatFrame>32){
      lastBeatFrame=t;
      const st=getRainOptions();
      const e=st.audio==='score'&&st.beatReactive?(window.signalSound()?.beatEnergy()||0)*st.beatStrength:0;
      beatLEDs.forEach((bar,i)=>{
        const level=Math.max(.13,Math.min(1,.12+e*(.62+.20*Math.sin(i*2.1))));
        bar.style.transform=`scaleY(${level})`;
        bar.style.opacity=String(.26+Math.min(1,e)*.74);
      });
    }
    requestAnimationFrame(beatVisualClock);
  }
  requestAnimationFrame(beatVisualClock);
  // Surge and Breach own their cinematic sound signatures; don't stack UI ticks on them.
  $('surge-btn').addEventListener('click',()=>{signalRain();notify('ELECTRICAL SCAN PROPAGATING');});
  $('breach-btn').addEventListener('click',()=>{breachRain();notify('REALITY BREACH / SIGNAL RELOCK IN PROGRESS');const b=$('breach-btn');b.classList.add('triggered');setTimeout(()=>b.classList.remove('triggered'),500);});
  $('pause-btn').addEventListener('click',()=>{
    const next=!getRainOptions().paused;setRainOption('paused',next);
    feedback(next?'pause':'resume');
  });
  $('reseed-btn').addEventListener('click',()=>{reseedRain();feedback('commit');notify('SIGNAL FIELD RESEEDED');});
  $('defaults-btn').addEventListener('click',()=>{
    resetRain();feedback('reset');notify('SOURCE SIGNAL CONFIG RESTORED');
  });
})();
