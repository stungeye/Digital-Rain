/* Experimental score playback through an HTML audio element. Production is unchanged. */
(()=>{
'use strict';
function wav(buffer, start, length) {
  const bytes=new ArrayBuffer(44+length*4), view=new DataView(bytes);
  const text=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
  view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*4,true);
  view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*4,true);
  const fade=Math.round(buffer.sampleRate*.003);
  let peak=0, invalid=0, clipped=0;
  for(let channel=0;channel<2;channel++) {
    const samples=buffer.getChannelData(channel);
    for(let i=0;i<length;i++) {
      const sample=samples[start+i];
      if(!Number.isFinite(sample))invalid++;
      peak=Math.max(peak,Math.abs(sample));if(Math.abs(sample)>=1)clipped++;
      // Exact-zero seam, including the source's nonperiodic noise and human timing.
      const edge=Math.min(1,i/fade,(length-1-i)/fade);
      view.setInt16(44+i*4+channel*2,Math.round(Math.max(-1,Math.min(1,sample))*edge*32767),true);
    }
  }
  if(invalid||clipped)throw Error(`Unsafe render: ${invalid} invalid, ${clipped} clipped samples`);
  return {blob:new Blob([bytes],{type:'audio/wav'}),peak,invalid,clipped};
}
async function renderScore(profile, rate, cancelled=()=>false, progress=()=>{}) {
  const score=SignalAudio.scores[profile];
  if(!score)throw Error('Unknown score');
  const ticks=score.bars*16, frames=Math.round(score.bars*4*60/score.bpm*rate);
  const period=frames/rate, tickSeconds=period/ticks, leadFrames=Math.round(4.1*rate);
  const lead=leadFrames/rate;
  const context=new OfflineAudioContext(2,leadFrames+frames,rate);
  // Only the score graph: no global AudioContext replacement, live context,
  // ambient oscillators, UI buses, timer or autoplay activation during preparation.
  const engine=new SignalAudio();engine.ctx=context;engine.profile=profile;engine.mode='score';
  engine.master=context.createGain();engine.master.gain.value=.5*.52;
  engine.compressor=context.createDynamicsCompressor();
  for(const [name,value] of Object.entries({threshold:-17,knee:17,ratio:3,attack:.009,release:.2}))
    engine.compressor[name].value=value;
  engine.master.connect(engine.compressor).connect(context.destination);
  engine.scoreBus=context.createGain();engine.scoreBus.connect(engine.master);
  engine.noise=engine.noiseBuffer(27.7);engine.schedulingScore=true;
  const hits=[];let recording=false;
  for(const [name,energy] of [['kick',.76],['snare',.55]]) {
    const original=engine[name];
    engine[name]=function(t,velocity=1){
      if(recording)hits.push({t:(t-lead+period)%period,energy:energy*velocity});
      return original.call(this,t,velocity);
    };
  }
  // Render the previous arrangement's last four seconds to carry its sustained
  // voices and compressor state into the loop. Do not append a silent tail.
  const first=-Math.floor(4/tickSeconds);
  let next=first;
  const scheduleChunk=()=>{
    const end=Math.min(ticks,next+32);
    for(;next<end;next++) {
      recording=next>=0;
      engine.scoreStep(lead+next*tickSeconds,(next+ticks)%ticks);
    }
    progress(`Rendering ${score.title}… ${Math.round((next-first)/(ticks-first)*100)}%`);
  };
  // Do not connect a whole arrangement of idle filters/waveshapers at once.
  // Suspend before each new two-bar batch, allowing ended voices to retire.
  // The production note graph and its sample-time grid remain unchanged.
  scheduleChunk();
  let suspension=next<ticks?context.suspend(lead+next*tickSeconds-.05):null;
  const rendering=context.startRendering();
  // Attach immediately so a renderer failure cannot become an unhandled rejection.
  rendering.catch(()=>{});
  try {
    while(suspension) {
      await Promise.race([suspension,rendering.then(()=>{throw Error('Render ended before scheduled batch');})]);
      if(cancelled()) {
        await context.resume();await rendering;
        throw Error('Preparation cancelled');
      }
      scheduleChunk();
      suspension=next<ticks?context.suspend(lead+next*tickSeconds-.05):null;
      await context.resume();
    }
  } catch(error) {
    if(context.state==='suspended')await context.resume();
    await rendering.catch(()=>{});
    throw error;
  }
  const buffer=await rendering;
  if(cancelled())throw Error('Preparation cancelled');
  const encoded=wav(buffer,leadFrames,frames);
  return {...encoded,hits,profile,rate,period};
}
class MediaScorePlayer {
  constructor(player=new Audio()) {
    this.player=player;player.loop=true;player.preload='auto';
    this.track=null;this.url=null;this.generation=0;this.queue=Promise.resolve();
  }
  async prepare(profile,rate=48000,progress=()=>{}) {
    const generation=++this.generation;
    this.release();
    // At most one offline graph in flight, even if profile selection changes.
    const task=this.queue.catch(()=>{}).then(()=>{
      if(generation!==this.generation)throw Error('Preparation cancelled');
      return renderScore(profile,rate,()=>generation!==this.generation,progress);
    });
    // The serialization promise must not retain the rendered Blob after Stop.
    this.queue=task.then(()=>undefined,()=>undefined);
    const track=await task;
    if(generation!==this.generation)return false;
    this.track=track;this.url=URL.createObjectURL(track.blob);this.player.src=this.url;
    return true;
  }
  release() {
    this.player.pause();this.player.removeAttribute('src');this.player.load();
    if(this.url)URL.revokeObjectURL(this.url);
    this.url=null;this.track=null;
  }
  stop() {++this.generation;this.release();}
  play() {if(!this.track)return Promise.reject(Error('Prepare a score first'));return this.player.play();}
  pause() {this.player.pause();}
  beatEnergy() {
    if(!this.track||this.player.paused||this.player.muted)return 0;
    const now=this.player.currentTime, period=this.track.period;
    let energy=0;
    for(const hit of this.track.hits) {
      const elapsed=(now-hit.t+period)%period;
      if(elapsed<.29)energy+=hit.energy*Math.exp(-elapsed*14);
    }
    return Math.min(1,energy);
  }
}
window.MediaScorePlayer=MediaScorePlayer;
})();
