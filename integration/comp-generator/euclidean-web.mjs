/** Euclidean editor: engine observations draw the pattern; shared controls own edits. */
const controls=[['hits','Hits',0,16],['steps','Steps',1,16],['rotation','Rotation',0,15],['rate','Rate'],['accents','Accents',0,16],['depth','Accent depth',0,100],['gate','Gate',1,100],['intensity','Intensity',0,100]];
const rates=['1/16','1/8','1/4','1/2'];
export function mountEuclidean({root,api}){
 root.innerHTML=`<style>
 :host{font:14px system-ui;color:var(--ui-fg,#eee)}*{box-sizing:border-box}[hidden]{display:none!important}.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
 button,select,input{font:inherit;color:inherit;accent-color:var(--ui-focus,#e74b50)}button,select{background:var(--ui-control,#252528);border:1px solid var(--ui-border,#555);border-radius:7px;padding:10px}button:disabled,input:disabled,select:disabled{opacity:.45}button[aria-pressed=true]{border-color:var(--ui-focus,#e74b50);box-shadow:inset 0 0 0 1px var(--ui-focus,#e74b50)}button[data-action=record]{min-width:11em}button[data-action=record][aria-pressed=true]{background:#54212b;border-color:#f66}
 .pattern{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px;margin:12px 0}.step{position:relative;min-height:64px;border:2px solid var(--ui-border,#555);background:#161619;padding:8px;color:#bbb}.step::before{content:'';display:block;width:17px;height:17px;margin:0 auto 6px;border:2px solid #777;border-radius:50%}.step[data-hit=true]::before{background:#9c302c;border-color:#df655f}.step[data-accent=true]::before{background:#ff4545;border-color:#ff9b93;box-shadow:0 0 9px #f4434355}.step[aria-current=step]{outline:3px solid var(--ui-fg,#eee);outline-offset:1px}.step[aria-current=step]::after{content:'';position:absolute;bottom:3px;height:3px;background:var(--ui-fg,#eee);left:20%;right:20%}.step:disabled{opacity:.2}
 .controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:20px 0}label{display:flex;flex-direction:column;gap:6px;min-width:0}.controls input,.controls select{width:100%;min-height:36px}.control-name{display:flex;justify-content:space-between;gap:6px}.control-name output{font-variant-numeric:tabular-nums}.hint,.euclidean-status{color:var(--ui-muted,#aaa);line-height:1.5}.transport{font-weight:600;min-height:2.8em;line-height:1.4}.pattern-summary{font-variant-numeric:tabular-nums;min-height:1.5em}@media(max-width:550px){.pattern{grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.controls{grid-template-columns:repeat(2,minmax(0,1fr))}}
 </style><div class="toolbar"><strong>Euclidean rhythms</strong><select aria-label="Euclidean actor" data-actor><option>Comp</option><option>Bass</option><option disabled>Melody</option></select><button data-action="choose">Choose Euclidean</button><button data-action="explore">Explore</button><button data-action="play">Play</button><button data-action="stop">Stop</button><button data-action="record" aria-pressed="false">Record</button></div>
 <p class="transport" role="status">Waiting for transport…</p><p class="pattern-summary">Choose Comp or Bass, then Euclidean.</p><div class="pattern" aria-label="Euclidean pattern">${Array.from({length:16},(_,index)=>`<button class="step" data-step="${index}" disabled aria-label="Step ${index+1}">${index+1}</button>`).join('')}</div>
 <p class="hint">Tap a step to rotate the pattern there. Bright dots are strong hits; softer dots are quieter hits. The outline follows the engine’s playing step.</p>
 <div class="controls">${controls.map(([field,label,min,max])=>`<label><span class="control-name">${label}<output data-value="${field}">—</output></span>${field==='rate'?`<select aria-label="Euclidean ${label}" data-control="${field}" disabled>${rates.map(rate=>`<option>${rate}</option>`).join('')}</select>`:`<input aria-label="Euclidean ${label}" data-control="${field}" type="range" min="${min}" max="${max}" step="1" disabled>`}</label>`).join('')}</div>
 <div class="toolbar"><button data-action="restore">Revert controls</button><button data-action="bake">Bake clip</button></div><p class="hint">Explore is temporary. Record saves the rhythm and control changes. Gate is a percentage of the selected step rate.</p><p class="euclidean-status" role="status">Waiting for the generator…</p>`;
 const status=root.querySelector('.euclidean-status'),pending=new Map(),held=new Set();
 let state=null,requested=true,suspended=false,disposed=false,inFlight=false,generation=0,timer=null,gestureTrack=null;
 const send=value=>{if(!suspended&&!disposed)api.send(value);};
 const valid=()=>state?.ready===true&&Number.isInteger(state.track)&&state.track>=0&&state.track<16;
 const command=value=>{if(valid())send(`euclidean ${state.track} ${value}`);};
 const fieldKey=field=>field==='intensity'?'cg_intensity':'cg_euclid_'+field;
 function flush(){for(const message of pending.values())send(message);pending.clear();}
 function release(){pending.clear();held.clear();gestureTrack=null;}
 root.querySelector('[data-actor]').onchange=event=>{release();if(valid())send('actor '+event.target.value);};
 for(const button of root.querySelectorAll('[data-action]'))button.onclick=()=>{
  flush();const action=button.dataset.action;
  if(action==='play'||action==='stop'){if(valid())send(action);}else command(action);
 };
 for(const button of root.querySelectorAll('[data-step]'))button.onclick=()=>{flush();command('rotate '+button.dataset.step);};
 for(const input of root.querySelectorAll('[data-control]')){
  const field=input.dataset.control;
  input.onpointerdown=event=>{if(!input.disabled){if(!held.size)gestureTrack=state.track;held.add(event.pointerId);input.setPointerCapture(event.pointerId);}};
  const finish=event=>{held.delete(event.pointerId);if(!held.size)gestureTrack=null;flush();};
  input.onpointerup=finish;input.onpointercancel=event=>{held.delete(event.pointerId);if(!held.size)gestureTrack=null;pending.delete(field);};
  input.onlostpointercapture=input.onpointercancel;
  input.oninput=()=>{
   if(!valid()||!state.euclidean||gestureTrack!==null&&gestureTrack!==state.track)return;
   root.querySelector(`[data-value="${field}"]`).textContent=input.value+(controls.find(control=>control[0]===field)[3]===100?'%':'');
   pending.set(field,`euclidean ${state.track} control ${fieldKey(field)} ${input.value}`);
  };
  input.onchange=()=>{if(field==='rate')input.oninput();flush();};
 }
 function unavailable(){state=null;release();for(const element of root.querySelectorAll('button,input,select'))element.disabled=true;for(const step of root.querySelectorAll('[data-step]'))step.setAttribute('aria-current','false');status.textContent='Waiting for generator state…';}
 function paint(next){
  const changedTrack=state&&state.track!==next.track;if(changedTrack)pending.clear();state=next;
  const view=state.euclidean,enabled=!!view&&Array.isArray(state.euclideanValues)&&state.euclideanValues.length===8;
  const transport=state.transport,phase=transport?.phase??'idle',recording=phase!=='idle',playing=transport?.playing===true;
  root.querySelector('[data-actor]').disabled=held.size>0;root.querySelector('[data-actor]').value=state.actor;
  root.querySelector('[data-action=choose]').disabled=!['Comp','Bass'].includes(state.actor)||recording;
  for(const action of ['explore','restore','bake'])root.querySelector(`[data-action=${action}]`).disabled=!enabled||action==='bake'&&state.canBake!==true;
  root.querySelector('[data-action=explore]').textContent=state.explore==='Stop'?'Stop exploring':'Explore';
  const record=root.querySelector('[data-action=record]');record.disabled=!enabled&&!recording;
  record.textContent=phase==='count-in'?'Cancel count-in':phase==='armed'?'Cancel recording':recording?'Stop recording':'Record';record.setAttribute('aria-pressed',String(recording));
  const play=root.querySelector('[data-action=play]'),stop=root.querySelector('[data-action=stop]');play.disabled=playing;stop.disabled=!playing&&!recording;play.setAttribute('aria-pressed',String(playing));stop.setAttribute('aria-pressed',String(!playing&&!recording));
  const destination=Number.isInteger(transport?.track)?` · Track ${transport.track+1}${Number.isInteger(transport.slot)?` · Clip ${transport.slot+1}`:''}`:'';
  root.querySelector('.transport').textContent=`${playing?'Playing':'Stopped'} · ${phase==='count-in'?'Count-in':phase==='armed'?'Recording armed':recording?'Recording':'Not recording'}${recording?destination:''}`;
  root.querySelector('.pattern-summary').textContent=enabled?`${view.hits} hits / ${view.steps} steps · ${rates[view.rate]} · Rotation ${view.rotation} · ${view.accents} accents`:'Choose Comp or Bass, then Euclidean.';
  for(const button of root.querySelectorAll('[data-step]')){
   const step=Number(button.dataset.step),inside=enabled&&step<view.steps,hit=inside&&!!(view.mask&(1<<step)),accent=hit&&(view.accents===0||view.depth===0||!!(view.accentMask&(1<<step)));
   button.disabled=!inside;button.dataset.hit=String(hit);button.dataset.accent=String(accent);button.setAttribute('aria-current',inside&&view.cursor===step?'step':'false');
   button.setAttribute('aria-label',`Step ${step+1}, ${!inside?'outside cycle':!hit?'rest':accent?'strong hit':'soft hit'}${inside?'; rotate pattern here':''}`);
  }
  controls.forEach(([field,,,max],index)=>{
   const input=root.querySelector(`[data-control="${field}"]`);input.disabled=!enabled;
   if(enabled&&(changedTrack||root.activeElement!==input)&&!pending.has(field))input.value=String(state.euclideanValues[index]);
   if(!pending.has(field))root.querySelector(`[data-value="${field}"]`).textContent=enabled?String(state.euclideanValues[index])+(max===100?'%':''):'—';
  });
  status.textContent=`${state.actor} · Track ${state.track+1}${Number.isInteger(state.slot)?` · Clip ${state.slot+1}`:''} · ${state.footer}`;
 }
 async function poll(){
  if(suspended||disposed)return;flush();if(inFlight)return;inFlight=true;const token=generation;
  try{
   const result=await api.read();if(suspended||disposed||token!==generation)return;
   const next=typeof result.ui==='string'?JSON.parse(result.ui||'null'):result.ui;
   if(next?.ready===true&&Number.isInteger(next.track)&&next.track>=0&&next.track<16)paint(next);else unavailable();
  }catch{if(token===generation&&!suspended&&!disposed)unavailable();}finally{inFlight=false;}
 }
 function pause(){suspended=true;generation++;clearInterval(timer);timer=null;unavailable();}
 function activate(){if(disposed||!requested||document.hidden)return;suspended=false;if(timer===null)timer=setInterval(poll,50);poll();}
 const visibility=()=>{if(document.hidden)pause();else activate();};
 document.addEventListener('visibilitychange',visibility);globalThis.addEventListener('pagehide',pause);globalThis.addEventListener('blur',release);unavailable();activate();
 return {release,isHeld:()=>held.size>0,suspend(){requested=false;pause();},resume(){requested=true;activate();},dispose(){requested=false;pause();disposed=true;document.removeEventListener('visibilitychange',visibility);globalThis.removeEventListener('pagehide',pause);globalThis.removeEventListener('blur',release);}};
}
