import {Lighting,fixturePositions,clamp,defaultSettings,defaultSamples} from './lighting.mjs';
import {lightingProfile,loadLightingProfile,saveLightingProfile} from './lighting-profile.mjs';

/** Mount a transport-neutral preview. All state consumed here is read-only. */
export function mountLighting(container,monitor=null){
 const monitorFixtures=monitor?[...monitor.querySelectorAll('[data-fixture]')]:[];
 const monitorState=monitor?.querySelector('#light-monitor-state');
 const model=new Lighting();let group=0,selected=0,dimension=0,lastFrame=null;
 let storage;try{storage=globalThis.localStorage;}catch{}
 const saved=loadLightingProfile(storage);
 if(saved.profile){model.settings=saved.profile.settings;model.samples=saved.profile.samples;}
 container.innerHTML=`<details open><summary>Light field <span class="light-tag">4 fixtures · preview</span></summary>
 <div class="light-layout"><div><canvas id="light-stage" width="600" height="600" aria-label="Four colored lights at the corners of a square"></canvas>
 <p id="light-state" role="status">Waiting for the field…</p><p id="light-harmony"></p><p id="light-section" class="light-note" role="status"></p></div>
 <div class="light-controls">
 <label>Palette follows <select id="light-palette"><option value="blend">Scale + chord</option><option value="scale">Scale</option><option value="chord">Chord</option></select></label>
 <label>Harmony color <input id="light-harmony-amount" type="range" min="0" max="1" step=".01" value=".75"></label>
 <label>Light level <input id="light-level" type="range" min="0" max="1" step=".01" value=".7"></label>
 <label>Saturation <input id="light-saturation" type="range" min="0" max="1" step=".01" value=".85"></label>
 <label>Note response <input id="light-reactivity" type="range" min="0" max="1" step=".01" value=".65"></label>
 <label>Voice position <select id="light-position"><option value="degree">Voice + scale degree + register</option><option value="pitch">Pitch across the square</option><option value="voice">Voice home only</option></select></label>
 <label>Spread <input id="light-spread" type="range" min=".25" max="2" step=".05" value=".85"></label>
 <label>Downbeat rewind <input id="light-vinyl" type="range" min="0" max="1" step=".01" value=".45"></label>
 <label>Phrase rotation <select id="light-phraseBars"><option value="0">Off</option><option value="4">Every 4 bars</option><option value="8">Every 8 bars</option><option value="16">Every 16 bars</option></select></label>
 <label>Section change <select id="light-sectionCue"><option value="arrival">Arrival glow</option><option value="rotate">Rotate samples</option><option value="off">Off</option></select></label>
 <button id="light-blackout" aria-pressed="false">Blackout</button>
 </div></div>
 <p class="light-note">Live notes and clips share the same response. Each voice has a home; pitch moves a soft region across the four lights. The moving dots show the strongest note in each voice.</p>
 <details class="light-voices"><summary>Voice identities</summary>
 <p class="light-note">Output channels 1–4 represent Root, Bass, Comp and Melody. These are channel identities; tracks sharing an output channel share its lighting response. Strength changes lights only.</p>
 <div class="light-controls">${['Root','Bass','Comp','Melody'].map((name,index)=>`<label>${name} · channel ${index+1} strength <input id="light-voiceGain${index}" type="range" min="0" max="1" step=".01"></label>
 <label>${name} home <select id="light-voiceHome${index}"><option value="0">Upper left</option><option value="1">Upper right</option><option value="2">Lower right</option><option value="3">Lower left</option></select></label>`).join('')}</div>
 <p class="light-note">Zero strength hides that voice’s note response; the Perlin background continues. Home controls anchor degree motion; pitch mode uses the home’s vertical side.</p></details>
 <p id="light-storage" class="light-note" role="status"></p><button id="light-reset">Reset lighting settings</button>
 <div class="toolbar"><button data-light-cue="phrase">Try phrase change</button><button data-light-cue="break">Try break</button><button data-light-cue="arrival">Try arrival</button></div>
 <details class="light-samples"><summary>Field samples & color cycle</summary>
 <p>Pick a light, a dimension, then a sample in the existing HB field. Each square is a fixed coordinate; the field scrolls beneath it.</p>
 <div class="toolbar"><label>Source <select id="light-source"><option value="terrain">Spatial field samples</option><option value="lanes">Field outputs 1–12</option></select></label>
 <label>Hue turns <select id="light-hueTurns"><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option><option value="4">4</option></select></label>
 <label>Light <select id="light-select"><option value="0">1 · upper left</option><option value="1">2 · upper right</option><option value="2">3 · lower right</option><option value="3">4 · lower left</option></select></label>
 <label>Dimension <select id="light-dimension"><option value="0">Hue</option><option value="1">Level</option><option value="2">Saturation</option></select></label></div>
 <div id="light-sample-grid" aria-label="Perlin sample coordinates"></div><p id="light-sample-label"></p>
 <p>Output mode uses hue lanes 1–4, level lanes 5–8, and saturation lanes 9–12, including your live field overrides. The preview never changes HB mappings or field speed.</p></details>
 <p class="light-note">Section changes follow the song as it plays. Upcoming sections are shown as forecasts or queued; they trigger only when reached. Endings gently dim. Phrase rotation is an optional bar-count pattern. DMX output is not connected.</p>
 </details>`;
 const select=id=>container.querySelector('#light-'+id);
 const profile=()=>lightingProfile({schema:1,settings:model.settings,samples:model.samples});
 const persist=()=>{select('storage').textContent=saveLightingProfile(storage,profile());};
 const controls={level:'level',saturation:'saturation',reactivity:'reactivity',vinyl:'vinyl',phraseBars:'phraseBars',hueTurns:'hueTurns',spread:'spread','harmony-amount':'harmony',palette:'palette',position:'position',source:'source',sectionCue:'sectionCue'};
 for(let voice=0;voice<4;voice++)for(const setting of ["voiceGain","voiceHome"])controls[setting+voice]=setting+voice;
 function syncControls(){
  for(const [id,key] of Object.entries(controls))select(id).value=String(model.settings[key]);
  select('sample-grid').hidden=model.settings.source==='lanes';
  select('blackout').setAttribute('aria-pressed',String(model.settings.blackout));select('blackout').textContent=model.settings.blackout?'Restore lights':'Blackout';
 }
 function restoreProfile(value){
  const checked=lightingProfile(value);if(!checked)return false;
  model.settings=checked.settings;model.samples=checked.samples;model.resetSource();syncControls();persist();return true;
 }
 const bind=(id,key,numeric=true)=>{select(id).oninput=event=>{model.settings[key]=numeric?Number(event.target.value):event.target.value;persist();};};
 for(const key of ['level','saturation','reactivity','vinyl','phraseBars','hueTurns','spread'])bind(key,key);
 bind('harmony-amount','harmony');bind('palette','palette',false);bind('position','position',false);
 bind('sectionCue','sectionCue',false);
 for(let voice=0;voice<4;voice++)for(const setting of ['voiceGain','voiceHome'])bind(setting+voice,setting+voice);
 select('source').onchange=event=>{model.settings.source=event.target.value;model.resetSource();select('sample-grid').hidden=event.target.value==='lanes';persist();};
 select('select').onchange=event=>selected=Number(event.target.value);
 select('dimension').onchange=event=>dimension=Number(event.target.value);
 select('blackout').onclick=()=>{model.settings.blackout=!model.settings.blackout;syncControls();persist();};
 select('reset').onclick=()=>restoreProfile({schema:1,settings:{...defaultSettings,blackout:model.settings.blackout},samples:defaultSamples});
 syncControls();select('storage').textContent=saved.message;
 for(const button of container.querySelectorAll('[data-light-cue]'))button.onclick=()=>model.cue(button.dataset.lightCue,performance.now());
 const samples=Array.from({length:64},(_,index)=>{
  const button=document.createElement('button');button.setAttribute('aria-label',`Sample column ${index%8+1}, row ${Math.floor(index/8)+1}`);
  button.onclick=()=>{model.samples[selected][dimension]=index;persist();};select('sample-grid').append(button);return button;
 });
 const canvas=select('stage'),context=canvas.getContext('2d');
 const mapPoint=position=>[300+position[0]*180,300+position[1]*180];
 const names=['Root','Bass','Comp','Melody'];
 function draw(frame){
  context.clearRect(0,0,600,600);context.fillStyle='#080d13';context.fillRect(0,0,600,600);
  context.strokeStyle='#ffffff12';context.lineWidth=1;
  for(let line=120;line<=480;line+=45){context.beginPath();context.moveTo(line,120);context.lineTo(line,480);context.moveTo(120,line);context.lineTo(480,line);context.stroke();}
  context.strokeStyle='#ffffff40';context.strokeRect(120,120,360,360);
  for(let index=0;index<4;index++){
   const fixture=frame.fixtures[index],[horizontal,vertical]=mapPoint(fixturePositions[index]),color=fixture.rgb.join(',');
   const gradient=context.createRadialGradient(horizontal,vertical,0,horizontal,vertical,240);
   gradient.addColorStop(0,`rgba(${color},.8)`);gradient.addColorStop(.25,`rgba(${color},.32)`);gradient.addColorStop(1,`rgba(${color},0)`);
   context.fillStyle=gradient;context.fillRect(0,0,600,600);
  }
  for(let index=0;index<4;index++){
   const fixture=frame.fixtures[index],[horizontal,vertical]=mapPoint(fixturePositions[index]);
   context.fillStyle=`rgb(${fixture.rgb.join(',')})`;context.beginPath();context.arc(horizontal,vertical,28,0,Math.PI*2);context.fill();
   context.strokeStyle='#d9e6f080';context.lineWidth=2;context.stroke();
   context.fillStyle='#edf6ff';context.font='500 18px system-ui';context.textAlign='center';
   context.fillText(String(index+1),horizontal,vertical+6);
   context.font='14px system-ui';context.fillStyle='#b8c9d8';context.fillText(`${Math.round(fixture.hue)}° · ${Math.round(fixture.level*100)}%`,horizontal,vertical+(index<2?-48:55));
  }
  if(!model.settings.blackout)for(let index=0;index<4;index++){
   const voice=frame.voices[index];if(!voice.position||voice.energy<.02)continue;
   const [horizontal,vertical]=mapPoint(voice.position);context.strokeStyle=`rgba(255,255,255,${clamp(voice.energy,.15,.9)})`;
   context.lineWidth=1.5;context.beginPath();context.arc(horizontal,vertical,10+model.settings.spread*22,0,Math.PI*2);context.stroke();
   context.fillStyle='#eaf3ff';context.font='13px system-ui';context.fillText(names[index],horizontal,vertical-14);
  }
  context.textAlign='center';context.font='12px system-ui';context.fillStyle='#8eabbc';context.fillText('H A R M O N Y B U S  /  L I G H T  F I E L D',300,574);
 }
 function receive(message,cache,now=performance.now()){
  const prefix=`ch${group*4+3}:midi_fx1:`;
  // Only a newly delivered field can renew freshness, never an old cache entry.
  model.ingest({field:message.params?.[prefix+(model.settings.source==='terrain'?'field_view':'field_outputs_view2')],
   shared:message.params?.[prefix+'shared_context_snapshot'],harmony:message.params?.[prefix+'harmony_snapshot'],status:cache.get('status'),events:message.events,observation:message.observation},now);
 }
 function paint(cache,demand,nextGroup,now=performance.now()){
  if(nextGroup!==group){group=nextGroup;model.suspend();model.resume();model.resetSource();}
  const prefix=`ch${group*4+3}:midi_fx1:`;
  for(const key of ['field_view','field_outputs_view2','shared_context_snapshot','harmony_snapshot'])demand.set(prefix+key,Date.now());
  const frame=model.render(now);lastFrame=frame;
  if(container.firstElementChild.open&&!container.closest('[hidden]'))draw(frame);
  if(monitor&&!monitor.closest('[hidden]')){
   for(const light of monitorFixtures){const fixture=frame.fixtures[Number(light.dataset.fixture)];light.style.backgroundColor=`rgb(${fixture.rgb.join(',')})`;}
   const state=model.settings.blackout?'Blackout':!frame.fresh?'Waiting':`${frame.held} held`;
   monitorState.textContent=state;
   monitor.setAttribute('aria-label',`Open lighting controls · ${state}`);
  }
  select('state').textContent=model.settings.blackout?'Blackout':!frame.fresh?'Waiting for current field data':`${frame.playing?'Bar '+frame.bar:'Live play · transport stopped'} · ${frame.held} held ${frame.rewinding?'· field rewind':''}`;
  select('harmony').textContent=frame.palette.label;
  select('section').textContent=frame.sectionLabel+(frame.cue?` · ${frame.cue==='phrase'?'rotation':frame.cue}`:'');
  const chosen=model.samples[selected][dimension];
  select('sample-label').textContent=model.settings.source==='lanes'?'12 field outputs · existing coordinates and overrides':`Light ${selected+1} ${['hue','level','saturation'][dimension]} · x ${((chosen%8-3.5)*.35).toFixed(2)}, y ${((Math.floor(chosen/8)-3.5)*.35).toFixed(2)}, z 0`;
  if(container.querySelector('.light-samples').open)for(let index=0;index<64;index++){
   samples[index].style.backgroundColor=`hsl(205 25% ${15+(model.field?.[index]??0)*55}%)`;samples[index].setAttribute('aria-pressed',String(index===chosen));samples[index].textContent=index===chosen?'●':'';
  }
  return frame;
 }
 return {receive,paint,restoreProfile,get profile(){return profile();},get watchKeys(){return ['field_view','field_outputs_view2','shared_context_snapshot','harmony_snapshot'].map(key=>`ch${group*4+3}:midi_fx1:${key}`);},suspend:()=>model.suspend(),resume:()=>model.resume(),get frame(){return lastFrame;}};
}
