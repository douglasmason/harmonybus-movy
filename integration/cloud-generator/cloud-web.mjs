/** Canonical touchscreen editor, mounted by Remote UI and the standalone workspace. */
import {readCloud,emptyCloud,cloudFade,cloudPosition} from './cloud-view.mjs';
const fields=['density','dynamics','rate','length','register','spread','contour','variation'];
export function mountCloud({root,api}){
 root.innerHTML=`<style>
 :host{color:var(--ui-fg,#eee);font:14px system-ui}*{box-sizing:border-box}.cloud-toolbar,.cloud-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
 button,select,input{font:inherit;color:inherit;accent-color:var(--ui-focus,#e74b50)}button,select{background:var(--ui-control,#252528);border:1px solid var(--ui-border,#555);border-radius:7px;padding:8px}
 button[aria-pressed=true]{border-color:var(--ui-focus,#e74b50);box-shadow:inset 0 0 0 1px var(--ui-focus,#e74b50)}button[data-action=record][aria-pressed=true]{background:#54212b;border-color:#ff6666;box-shadow:inset 0 0 0 1px #ff6666}button:disabled{opacity:.45}.cloud-transport{font-weight:600;min-height:1.4em;margin:10px 0}
 canvas{display:block;width:100%;height:clamp(220px,40vh,480px);background:#090e14;border:1px solid var(--ui-border,#444);border-radius:12px;touch-action:none;margin:14px 0}
 label{display:flex;flex-direction:column;gap:4px;flex:1 1 120px}.cloud-controls input{width:100%}.cloud-legend,.cloud-status{color:var(--ui-muted,#aaa);font-size:12px}.cloud-legend span{margin-right:14px}.cloud-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:12px 0}input[type=number]{background:#252528;border:1px solid #555;border-radius:5px;padding:6px;width:100%}@media(max-width:550px){.cloud-controls{grid-template-columns:repeat(2,minmax(0,1fr))}}
 </style><div class="cloud-toolbar"><strong>Follower cloud</strong><select aria-label="Follower actor" data-actor><option>Melody</option><option>Comp</option><option>Bass</option></select><button data-action="choose">Choose Cloud</button><button data-action="explore">Explore</button><button data-action="play">Play</button><button data-action="stop">Stop</button><button data-action="record">Record</button><button data-action="clear">Clear trail</button></div>
 <p class="cloud-transport" role="status">Waiting for transport…</p><canvas aria-label="Multitouch cloud field. Horizontal movement changes rhythmic activity; vertical movement changes harmonic height."></canvas>
 <div class="cloud-legend"><span style="color:#00ff00">● Direct touch</span><span style="color:#31adff">● Fresh consequences</span><span style="color:#6060ff">● Fading trail</span><span data-axes-label>← Less probability · More probability → &nbsp; ↑ Higher notes</span></div>
 <div class="cloud-toolbar"><label>Activity axis<select aria-label="Cloud field activity" data-activity><option>Probability</option><option>Rate</option></select></label><span class="cloud-legend" data-activity-help></span></div>
 <div class="cloud-controls">${['rate','density','length','register','spread','contour','variation','dynamics'].map(field=>`<label>${field[0].toUpperCase()+field.slice(1)} <output data-value="${field}">—</output><input aria-label="Cloud ${field}" data-control="${field}" type="range" min="0" max="127" value="64"></label>`).join('')}</div>
 <div class="cloud-toolbar"><strong>Draw with X / Y</strong><select aria-label="Cloud field axes" data-axes><option value="pitch-y">X Probability · Y Pitch</option><option value="pitch-x">X Pitch · Y Probability</option></select>${['x','y'].map(axis=>`<button data-draw="${axis}" data-delta="-1" aria-label="Draw ${axis} negative">${axis.toUpperCase()} −</button><button data-draw="${axis}" data-delta="1" aria-label="Draw ${axis} positive">${axis.toUpperCase()} +</button>`).join('')}<select aria-label="Cloud field boundary" data-edge><option>Bounded</option><option>Wrap</option></select><label>Seed<input aria-label="Cloud seed" data-seed type="number" min="1" max="65535" value="1"></label><button data-action="restore">Restore controls</button><button data-action="bake">Bake clip</button></div><p class="cloud-status" role="status">Waiting for the follower generator…</p>`;
 const canvas=root.querySelector('canvas'),context=canvas.getContext('2d'),status=root.querySelector('.cloud-status'),pointers=new Map();
 let suspended=false,requested=true,disposed=false,inFlight=false,state=null,snapshot=emptyCloud(),timer=null,lastHeartbeat=0,generation=0;
 const command=value=>{if(!suspended&&!disposed)api.send(value);};
 const coordinates=event=>{const bounds=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(127,Math.round((event.clientX-bounds.left)/bounds.width*127))),y:Math.max(0,Math.min(127,Math.round((1-(event.clientY-bounds.top)/bounds.height)*127))),pressure:Math.round((event.pointerType==='pen'?event.pressure||.75:.85)*127)};};
 function touch(pointer,pressure=pointer.pressure){command(`touch ${pointer.track} ${pointer.id} ${pointer.x} ${pointer.y} ${pressure}${pointer.activity==='Rate'?' 1':''}`);}
 function finishTouch(pointer){if(pointer.pending){pointer.pending=false;touch(pointer);}touch(pointer,0);}
 function release(){for(const pointer of pointers.values())finishTouch(pointer);pointers.clear();}
 function finish(event){const pointer=pointers.get(event.pointerId);if(!pointer)return;finishTouch(pointer);pointers.delete(event.pointerId);if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);paint();}
 canvas.onpointerdown=event=>{
  if(suspended||!state?.cloud||pointers.size>=16)return;event.preventDefault();
  const used=new Set([...pointers.values()].map(pointer=>pointer.id)),id=Array.from({length:16},(_,index)=>96+index).find(id=>!used.has(id));
  const pointer={...coordinates(event),id,track:state.track,activity:state.activity,pending:false};pointers.set(event.pointerId,pointer);canvas.setPointerCapture(event.pointerId);touch(pointer);paint();
 };
 canvas.onpointermove=event=>{const pointer=pointers.get(event.pointerId);if(!pointer)return;Object.assign(pointer,coordinates(event),{pending:true});paint();};
 canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onlostpointercapture=finish;
 root.querySelector('[data-actor]').onchange=event=>{release();command('actor '+event.target.value);};
 for(const button of root.querySelectorAll('[data-action]'))button.onclick=()=>{if(['stop','clear','choose'].includes(button.dataset.action))release();command(button.dataset.action);};
 for(const input of root.querySelectorAll('[data-control]'))input.oninput=()=>{root.querySelector(`[data-value="${input.dataset.control}"]`).textContent=input.value;command(`control cg_cloud_${input.dataset.control} ${input.value}`);};
 root.querySelector('[data-axes]').onchange=event=>{release();command('axes '+event.target.value);};
 root.querySelector('[data-activity]').onchange=event=>{release();command('activity '+event.target.value);};
 root.querySelector('[data-edge]').onchange=event=>command('edge '+event.target.value);
 root.querySelector('[data-seed]').onchange=event=>command('control cg_seed '+event.target.value);
 for(const button of root.querySelectorAll('[data-draw]')){
  button.onclick=()=>command(`draw ${button.dataset.draw} ${Number(button.dataset.delta)*4}`);
  button.onwheel=event=>{event.preventDefault();command(`draw ${button.dataset.draw} ${event.deltaY>0?-1:1}`);};
 }
 function paint(){
  const width=canvas.clientWidth,height=canvas.clientHeight,scale=Math.min(2,globalThis.devicePixelRatio||1);
  if(!width||!height)return;if(canvas.width!==Math.round(width*scale)||canvas.height!==Math.round(height*scale)){canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);}
  context.setTransform(scale,0,0,scale,0,0);context.clearRect(0,0,width,height);
  context.strokeStyle='#27313f';context.lineWidth=1;
  for(let column=1;column<8;column++){context.beginPath();context.moveTo(column*width/8,0);context.lineTo(column*width/8,height);context.stroke();}
  for(let row=1;row<4;row++){context.beginPath();context.moveTo(0,row*height/4);context.lineTo(width,row*height/4);context.stroke();}
  const dot=(point,color,radius,alpha,soft=false)=>{const x=point.x*width,y=(1-point.y)*height;context.globalAlpha=alpha;if(soft){const gradient=context.createRadialGradient(x,y,0,x,y,radius);gradient.addColorStop(0,color);gradient.addColorStop(1,'transparent');context.fillStyle=gradient;}else context.fillStyle=color;context.beginPath();context.arc(x,y,radius,0,Math.PI*2);context.fill();};
  const project=point=>cloudPosition(point,state?.axes==='Pitch / Activity');
  if(state?.trail){for(const point of snapshot.trails.map(project))dot(point,point.age<1?'#31adff':'#3131ff',15+point.age*6,cloudFade(point,state.trail)*.5,true);for(const point of snapshot.grains.map(project))dot(point,point.age<1?'#80eaff':'#5050ff',2+point.pressure*3,cloudFade(point,state.trail));}
  for(const point of snapshot.contacts.map(project))dot(point,'#00ff00',5,1);
  for(const pointer of pointers.values())dot({x:pointer.x/127,y:pointer.y/127},'#00ff00',6,1);
  if(state?.cloud){context.globalAlpha=.75;context.strokeStyle='#00ff00';context.strokeRect(state.x/127*width-4,(1-state.y/127)*height-4,8,8);}
  context.globalAlpha=1;
 }
 async function poll(){
  if(suspended||disposed)return;
  const now=Date.now();for(const pointer of pointers.values())if(pointer.pending||now-lastHeartbeat>=250){pointer.pending=false;touch(pointer);}if(now-lastHeartbeat>=250)lastHeartbeat=now;
  if(inFlight)return;inFlight=true;const token=generation;
  try{
   const result=await api.read();if(suspended||disposed||token!==generation)return;
   const next=typeof result.ui==='string'?JSON.parse(result.ui||'null'):result.ui;
   if(next&&Number.isInteger(next.track)&&Array.isArray(next.values)&&next.values.length===8){
    if(state&&(state.track!==next.track||state.axes!==next.axes||state.activity!==next.activity))release();state=next;
    const flipped=state.axes==='Pitch / Activity';
    const rate=state.activity==='Rate',activity=rate?'Rate':'Probability',meaning=rate?'trigger rate':'trigger probability';
    root.querySelector('[data-activity]').value=activity;
    root.querySelector('[data-activity-help]').textContent=rate?'Drag from half notes up to the Rate control’s fastest subdivision. Existing strokes keep their behavior.':'Drag to change trigger probability. Rate sets the shared subdivision.';
    const axisOptions=root.querySelector('[data-axes]').options;
    axisOptions[0].textContent=`X ${activity} · Y Pitch`;axisOptions[1].textContent=`X Pitch · Y ${activity}`;
    root.querySelector('[data-axes]').value=flipped?'pitch-x':'pitch-y';
    root.querySelector('[data-axes-label]').textContent=flipped?`← Lower notes · Higher notes →   ↑ ${rate?'Faster triggers':'More probability'}`:`← ${rate?'Slower':'Less probability'} · ${rate?'Faster triggers':'More probability'} →   ↑ Higher notes`;
    canvas.setAttribute('aria-label',flipped?`Multitouch cloud field. Horizontal movement changes harmonic height; vertical movement changes ${meaning}.`:`Multitouch cloud field. Horizontal movement changes ${meaning}; vertical movement changes harmonic height.`);
    root.querySelector('[data-actor]').value=state.actor;root.querySelector('[data-edge]').value=state.edge;
    const transport=state.transport,phase=transport?.phase??'idle',recording=phase!=='idle',playing=transport?.playing===true;
    const record=root.querySelector('[data-action="record"]');
    record.textContent=phase==='count-in'?'Cancel count-in':phase==='armed'?'Cancel recording':recording?'Stop recording':'Record';
    record.setAttribute('aria-pressed',String(recording));record.disabled=!state.cloud&&!recording;
    const play=root.querySelector('[data-action="play"]'),stop=root.querySelector('[data-action="stop"]');
    play.setAttribute('aria-pressed',String(playing));stop.setAttribute('aria-pressed',String(!playing&&!recording));
    play.disabled=playing;stop.disabled=!playing&&!recording;
    const destination=Number.isInteger(transport?.track)?` · Track ${transport.track+1}${Number.isInteger(transport.slot)?` · Clip ${transport.slot+1}`:''}`:'';
    root.querySelector('.cloud-transport').textContent=transport?`${playing?'Playing':'Stopped'} · ${phase==='count-in'?'Count-in':phase==='armed'?'Recording armed':recording?'Recording':'Not recording'}${recording?destination:''}`:'Transport status unavailable';
    root.querySelector('[data-action="bake"]').disabled=!state.cloud||recording;
    for(const input of root.querySelectorAll('[data-control]')){const value=state.values[fields.indexOf(input.dataset.control)];if(root.activeElement!==input)input.value=String(value);root.querySelector(`[data-value="${input.dataset.control}"]`).textContent=value;input.disabled=!state.cloud;}
    root.querySelector('[data-action="explore"]').textContent=state.explore==='Stop'?'Stop exploring':'Explore';
    root.querySelector('[data-seed]').value=state.seed;status.textContent=`${state.actor} · Track ${state.track+1}${Number.isInteger(state.slot)?` · Clip ${state.slot+1}`:''} · ${state.footer}`;
   }
   const view=readCloud(result.view??'');if(view)snapshot=view;paint();
  }catch{status.textContent='Waiting for cloud state…';}finally{inFlight=false;}
 }
 const observer=new ResizeObserver(paint);observer.observe(canvas);
 function pause(){release();suspended=true;generation++;clearInterval(timer);timer=null;snapshot=emptyCloud();paint();}
 function activate(){if(disposed||!requested||document.hidden)return;suspended=false;if(timer===null)timer=setInterval(poll,50);poll();}
 function suspend(){requested=false;pause();}
 function resume(){requested=true;activate();}
 const visibility=()=>{if(document.hidden)pause();else activate();};
 document.addEventListener('visibilitychange',visibility);globalThis.addEventListener('pagehide',pause);globalThis.addEventListener('blur',release);activate();
 return {release,suspend,resume,isHeld:()=>pointers.size>0,dispose(){suspend();disposed=true;observer.disconnect();document.removeEventListener('visibilitychange',visibility);globalThis.removeEventListener('pagehide',pause);globalThis.removeEventListener('blur',release);}};
}
