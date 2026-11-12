/** Canonical touchscreen editor, mounted by Remote UI and the standalone workspace. */
import {readCloud,emptyCloud,cloudFade,cloudPosition,cloudPointer,createCloudMpeInput} from './cloud-view.mjs';
const fields=['density','dynamics','rate','length','register','spread','contour','variation'];
export function mountCloud({root,api}){
 root.innerHTML=`<style>
 :host{color:var(--ui-fg,#eee);font:14px system-ui}*{box-sizing:border-box}.cloud-toolbar,.cloud-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
 button,select,input{font:inherit;color:inherit;accent-color:var(--ui-focus,#e74b50)}button,select{background:var(--ui-control,#252528);border:1px solid var(--ui-border,#555);border-radius:7px;padding:8px}
 button[aria-pressed=true]{border-color:var(--ui-focus,#e74b50);box-shadow:inset 0 0 0 1px var(--ui-focus,#e74b50)}button[data-action=record]{width:11em;white-space:nowrap}button[data-action=record][aria-pressed=true]{background:#54212b;border-color:#ff6666;box-shadow:inset 0 0 0 1px #ff6666}button:disabled{opacity:.45}.cloud-transport{font-weight:600;line-height:1.4;min-height:1.4em;margin:10px 0}@media(max-width:550px){.cloud-transport{min-height:2.8em}}
 canvas{display:block;width:100%;height:clamp(220px,40vh,480px);background:#090e14;border:1px solid var(--ui-border,#444);border-radius:12px;touch-action:none;margin:14px 0}
 label{display:flex;flex-direction:column;gap:4px;flex:1 1 120px}.cloud-controls input{width:100%}.cloud-legend,.cloud-status{color:var(--ui-muted,#aaa);font-size:12px}.cloud-legend span{margin-right:14px}.cloud-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:12px 0}input[type=number]{background:#252528;border:1px solid #555;border-radius:5px;padding:6px;width:100%}@media(max-width:550px){.cloud-controls{grid-template-columns:repeat(2,minmax(0,1fr))}}
 button[data-action=hold]{min-width:9em}
 </style><div class="cloud-toolbar"><strong>Follower cloud</strong><select aria-label="Follower actor" data-actor><option>Melody</option><option>Comp</option><option>Bass</option></select><button data-action="choose">Choose Cloud</button><button data-action="explore">Explore</button><button data-action="play">Play</button><button data-action="stop">Stop</button><button data-action="record">Record</button><button data-action="hold" aria-pressed="false" title="Capture the current cloud; new touches play over it. Release lets it fade.">Hold cloud</button><button data-action="clear">Clear cloud</button></div>
 <p class="cloud-transport" role="status">Waiting for transport…</p><canvas aria-label="Multitouch cloud field. Horizontal movement changes rhythmic activity; vertical movement changes harmonic height."></canvas>
 <div class="cloud-legend"><span style="color:#00ff00">● Direct touch</span><span style="color:#31adff">● Fresh consequences</span><span style="color:#6060ff">● Fading trail</span><span>Continuous X/Y · pressure when supported</span><span data-axes-label>← Less probability · More probability → &nbsp; ↑ Higher notes</span></div>
 <div class="cloud-toolbar"><label>Activity axis<select aria-label="Cloud field activity" data-activity><option>Probability</option><option>Rate</option></select></label><span class="cloud-legend" data-activity-help></span></div>
 <div class="cloud-toolbar"><strong>Input pressure response</strong><label>Target<select aria-label="Cloud pressure target" data-response="target"><option>Velocity</option><option>Length</option><option>Spread</option><option>Probability</option><option>Rate</option></select></label><label>Response<select aria-label="Cloud pressure response" data-response="curve"><option>Linear</option><option>Soft</option><option>Firm</option></select></label><label>Direction<select aria-label="Cloud pressure direction" data-response="direction"><option>Normal</option><option>Reverse</option></select></label><label>Low<input aria-label="Cloud pressure low" data-response="low" type="number" min="1" max="127" value="1"></label><label>High<input aria-label="Cloud pressure high" data-response="high" type="number" min="1" max="127" value="127"></label></div><p class="cloud-legend">Pressure shapes Velocity, Length, pitch Spread, Probability or Rate. Rate stays within the Rate knob and activity-axis limits; Probability thins eligible grains. Spread also uses Variation. Shared by pads, touch, MPE and drawing pressure; recorded strokes retain their target and response.</p>
 <div class="cloud-toolbar"><strong>Move held cloud</strong>${['x','y'].map(axis=>`<label>Hold ${axis.toUpperCase()} <output data-hold-value="${axis}">0.00</output><input aria-label="Move held cloud ${axis.toUpperCase()}" data-hold-axis="${axis}" type="range" min="-16383" max="16383" step="1" value="0" disabled></label>`).join('')}<button data-hold-center disabled>Center held cloud</button></div><p class="cloud-legend">Hold a drawn cloud first. Move its emitters with these touch sliders or Move's Cloud Hold X/Y knobs. Edges uses Bounded or Wrap; Center restores its captured position. Choose Move held cloud to drag it directly on the field or standalone pads; Draw adds new strokes.</p>
 <div class="cloud-controls">${['rate','density','length','register','spread','contour','variation','dynamics'].map(field=>`<label>${field[0].toUpperCase()+field.slice(1)} <output data-value="${field}">—</output><input aria-label="Cloud ${field}" data-control="${field}" type="range" min="0" max="127" value="64"></label>`).join('')}</div>
 <div class="cloud-toolbar"><strong>Draw with X / Y</strong><label>Drawing precision<select aria-label="Cloud drawing precision" data-precision><option value="coarse">Coarse</option><option value="fine">Fine</option></select></label><label>Draw pressure <output data-pressure-value>100</output><input aria-label="Cloud draw pressure" data-pressure type="range" min="1" max="127" value="100" title="Pressure for knob drawing. Touch and MPE keep their own pressure."></label><select aria-label="Cloud field axes" data-axes><option value="pitch-y">X Probability · Y Pitch</option><option value="pitch-x">X Pitch · Y Probability</option></select>${['x','y'].map(axis=>`<button data-draw="${axis}" data-delta="-1" aria-label="Draw ${axis} negative">${axis.toUpperCase()} −</button><button data-draw="${axis}" data-delta="1" aria-label="Draw ${axis} positive">${axis.toUpperCase()} +</button>`).join('')}<select aria-label="Cloud field boundary" data-edge><option>Bounded</option><option>Wrap</option></select><label>Seed<input aria-label="Cloud seed" data-seed type="number" min="1" max="65535" value="1"></label><button data-action="restore">Restore controls</button><button data-action="bake">Bake clip</button></div><p class="cloud-status" role="status">Waiting for the follower generator…</p>`;
 const midiBar=document.createElement('div');midiBar.className='cloud-toolbar';midiBar.innerHTML='<label>Field touch<select aria-label="Cloud field touch mode" data-touch-mode><option value="draw">Draw</option><option value="move" disabled>Move held cloud</option></select></label><button data-mpe-connect>Connect MPE input</button><select aria-label="MPE MIDI input" data-mpe-port hidden><option value="">Choose MIDI input</option></select><span class="cloud-legend" data-mpe-status>Lower zone · X pitch/bend · Y slide · Z pressure</span>';root.querySelector('canvas').before(midiBar);
 const mpeButton=root.querySelector('[data-mpe-connect]'),mpePorts=root.querySelector('[data-mpe-port]'),mpeStatus=root.querySelector('[data-mpe-status]');
 const canvas=root.querySelector('canvas'),context=canvas.getContext('2d'),status=root.querySelector('.cloud-status'),pointers=new Map();
 let suspended=false,requested=true,disposed=false,inFlight=false,state=null,snapshot=emptyCloud(),timer=null,lastHeartbeat=0,generation=0;
 let touchMode='draw',dragX=0,dragY=0;
 const command=value=>{if(!suspended&&!disposed)api.send(value);};
 function touch(pointer,pressure=pointer.pressure,start=false){if(pointer.drag)return;command(`${start||pressure===0?'touch':'move'}${pointer.maximum===16383?'14':''} ${pointer.track} ${pointer.id} ${pointer.x} ${pointer.y} ${pressure}${pointer.activity==='Rate'?' 1':''}`);}
 function finishTouch(pointer){if(pointer.drag){flushDrag();return;}if(pointer.pending){pointer.pending=false;touch(pointer);}touch(pointer,0);}
 // Rebase on membership changes: joining/lifting fingers never moves the shape.
 // Retain fractional deltas across packets so slow multi-finger drags keep precision.
 function flushDrag(){
  const pointer=[...pointers.values()].find(pointer=>pointer.drag);
  if(!pointer||!state?.holding||pointer.track!==state.track||pointer.axes!==state.axes){dragX=dragY=0;return;}
  const x=Math.round(dragX),y=Math.round(dragY);dragX-=x;dragY-=y;
  if(x||y)command(`shiftxy14 ${pointer.track} ${x} ${y}`);
 }
 const mpeContacts=new Map();
 const mpe=createCloudMpeInput(contact=>{
  const previous=mpeContacts.get(contact.id);
  if(contact.action==='up'){if(previous){finishTouch(previous);mpeContacts.delete(contact.id);}return;}
  if(contact.action==='down'){
   if(suspended||!state?.cloud||state.xyBits!==14||pointers.size+mpeContacts.size>=16)return;
   const pointer={...contact,maximum:16383,track:state.track,activity:state.activity,pending:false};mpeContacts.set(contact.id,pointer);touch(pointer,pointer.pressure,true);paint();
  }else if(previous){Object.assign(previous,contact,{pending:true});}
 });
 function release(){for(const pointer of pointers.values())finishTouch(pointer);pointers.clear();dragX=dragY=0;mpe.release();mpeContacts.clear();}
 let midiAccess=null,midiPort=null,midiGeneration=0,midiPending=false;
 function detachMidi(){mpe.reset();mpeContacts.clear();if(midiPort){midiPort.onmidimessage=null;Promise.resolve(midiPort.close?.()).catch(()=>{});}midiPort=null;}
 function disconnectMidi(){midiGeneration++;detachMidi();if(midiAccess)midiAccess.onstatechange=null;midiAccess=null;mpePorts.hidden=true;mpeButton.textContent='Connect MPE input';}
 function refreshMidiPorts(){
  const selected=midiPort?.id??'';mpePorts.replaceChildren(new Option('Choose MIDI input',''));
  for(const port of midiAccess?.inputs.values()??[])if(port.state!=='disconnected')mpePorts.add(new Option(port.name||port.id,port.id));
  if(midiPort?.state==='disconnected'){detachMidi();mpeStatus.textContent='MPE input disconnected';}
  mpePorts.value=midiPort?selected:'';
 }
 mpePorts.onchange=()=>{
  detachMidi();midiPort=midiAccess?.inputs.get(mpePorts.value)??null;if(!midiPort)return;
  const port=midiPort;port.onmidimessage=event=>{if(!suspended&&!disposed&&state?.cloud&&state.xyBits===14)mpe.midi(event.data);};
  Promise.resolve(port.open?.()).catch(()=>{if(midiPort===port){detachMidi();mpePorts.value='';mpeStatus.textContent='Could not open this MIDI input';}});
  mpeStatus.textContent=`${port.name||'MPE input'} · lower zone · bend range from controller (default ±48)`;
 };
 mpeButton.onclick=async()=>{
  if(midiAccess){disconnectMidi();mpeStatus.textContent='MPE input disconnected';return;}
  const token=++midiGeneration;midiPending=true;mpeButton.disabled=true;
  try{const access=await navigator.requestMIDIAccess({sysex:false});if(disposed||token!==midiGeneration)return;midiAccess=access;access.onstatechange=refreshMidiPorts;refreshMidiPorts();mpePorts.hidden=false;mpeButton.textContent='Disconnect MPE input';mpeStatus.textContent='Choose the MPE controller input · lower zone';}
  catch{mpeStatus.textContent='MIDI input unavailable; touchscreen X/Y remains available';}
  finally{midiPending=false;if(!disposed)mpeButton.disabled=typeof navigator.requestMIDIAccess!=='function'||state?.xyBits!==14;}
 };
 if(typeof navigator.requestMIDIAccess!=='function'){mpeButton.disabled=true;mpeButton.title='This browser supports touchscreen X/Y but does not expose Web MIDI input.';}
 function finish(event){const pointer=pointers.get(event.pointerId);if(!pointer)return;finishTouch(pointer);pointers.delete(event.pointerId);if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);paint();}
 function beginPointer(event,bounds){
  if(suspended||!state?.cloud||pointers.size+mpeContacts.size>=16||touchMode==='move'&&(!state.holding||!state.holdDrag))return;event.preventDefault();flushDrag();
  const used=new Set([...pointers.values()].map(pointer=>pointer.id)),id=Array.from({length:16},(_,index)=>96+index).find(id=>!used.has(id));
  const maximum=touchMode==='move'||state.xyBits===14?16383:127,point=cloudPointer(event,bounds,maximum);if(!point)return false;
  const pointer={...point,maximum,id,track:state.track,activity:state.activity,axes:state.axes,drag:touchMode==='move',pending:false};pointers.set(event.pointerId,pointer);touch(pointer,pointer.pressure,true);paint();return true;
 }
 function movePointer(event,bounds){const pointer=pointers.get(event.pointerId);if(!pointer)return false;const point=cloudPointer(event,bounds,pointer.maximum);if(!point)return false;if(pointer.drag){const count=[...pointers.values()].filter(value=>value.drag).length;dragX+=(point.x-pointer.x)/count;dragY+=(point.y-pointer.y)/count;}Object.assign(pointer,point,{pending:true});paint();return true;}
 canvas.onpointerdown=event=>{if(beginPointer(event,canvas.getBoundingClientRect()))canvas.setPointerCapture(event.pointerId);};
 canvas.onpointermove=event=>movePointer(event,canvas.getBoundingClientRect());
 canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onlostpointercapture=finish;
 root.querySelector('[data-touch-mode]').onchange=event=>{release();touchMode=event.target.value;};
 root.querySelector('[data-actor]').onchange=event=>{release();command('actor '+event.target.value);};
 for(const button of root.querySelectorAll('[data-action]'))button.onclick=()=>{if(['stop','clear','choose','explore'].includes(button.dataset.action))release();if(button.dataset.action==='hold'){if(state?.holding)release();for(const pointer of [...pointers.values(),...mpeContacts.values()])if(!state?.holding||pointer.pending){pointer.pending=false;touch(pointer);}command(`hold ${state?.holding?0:1}`);}else command(button.dataset.action);};
 for(const input of root.querySelectorAll('[data-control]'))input.oninput=()=>{root.querySelector(`[data-value="${input.dataset.control}"]`).textContent=input.value;command(`control cg_cloud_${input.dataset.control} ${input.value}`);};
 root.querySelector('[data-axes]').onchange=event=>{release();command('axes '+event.target.value);};
 root.querySelector('[data-activity]').onchange=event=>{release();command('activity '+event.target.value);};
 root.querySelector('[data-edge]').onchange=event=>command('edge '+event.target.value);
 root.querySelector('[data-seed]').onchange=event=>command('control cg_seed '+event.target.value);
 for(const input of root.querySelectorAll('[data-response]'))input.onchange=()=>command(`response ${input.dataset.response} ${input.value}`);
 root.querySelector('[data-pressure]').oninput=event=>{root.querySelector('[data-pressure-value]').textContent=event.target.value;command('pressure '+event.target.value);};
 for(const input of root.querySelectorAll('[data-hold-axis]')){
  let owner=null;
  input.onpointerdown=event=>{owner={track:state?.track,axes:state?.axes};input.setPointerCapture(event.pointerId);};
  input.onpointerup=input.onpointercancel=input.onlostpointercapture=()=>{owner=null;};
  input.oninput=()=>{const track=owner?.track??state?.track;if(!state?.holding||!state?.holdShift||track!==state.track||owner&&owner.axes!==state.axes)return;root.querySelector(`[data-hold-value="${input.dataset.holdAxis}"]`).textContent=(Number(input.value)/129).toFixed(2);command(`shift14 ${track} ${input.dataset.holdAxis} ${input.value}`);};
 }
 root.querySelector('[data-hold-center]').onclick=()=>{if(state?.holding&&state?.holdShift){release();command(`center ${state.track}`);}};
 const drawAction=event=>state?.drawBits===14&&(event.shiftKey||root.querySelector('[data-precision]').value==='fine')?'drawfine':'draw';
 for(const button of root.querySelectorAll('[data-draw]')){
  button.onclick=event=>command(`${drawAction(event)} ${button.dataset.draw} ${Number(button.dataset.delta)*(drawAction(event)==='drawfine'?1:4)}`);
  button.onwheel=event=>{event.preventDefault();command(`${drawAction(event)} ${button.dataset.draw} ${event.deltaY>0?-1:1}`);};
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
  for(const pointer of [...pointers.values(),...mpeContacts.values()])dot({x:pointer.x/pointer.maximum,y:pointer.y/pointer.maximum},pointer.drag?'#eeeeee':'#00ff00',6,1);
  // The parked X/Y cursor is a locator, not an active contact. Green is reserved
  // for actual touch/pad/encoder contacts, including when Hold keeps a cloud alive.
  if(state?.cloud){context.globalAlpha=.75;context.strokeStyle='#929aaa';context.strokeRect(state.x/127*width-4,(1-state.y/127)*height-4,8,8);}
  context.globalAlpha=1;
 }
 async function poll(){
  if(suspended||disposed)return;
  flushDrag();const now=Date.now();for(const pointer of [...pointers.values(),...mpeContacts.values()])if(pointer.pending||now-lastHeartbeat>=250){pointer.pending=false;touch(pointer);}if(now-lastHeartbeat>=250)lastHeartbeat=now;
  if(inFlight)return;inFlight=true;const token=generation;
  try{
   const result=await api.read();if(suspended||disposed||token!==generation)return;
   const next=typeof result.ui==='string'?JSON.parse(result.ui||'null'):result.ui;
   if(next&&Number.isInteger(next.track)&&Array.isArray(next.values)&&next.values.length===8){
    const movedSurface=state&&(state.track!==next.track||state.axes!==next.axes);
    if(state&&(state.track!==next.track||state.axes!==next.axes||state.activity!==next.activity||state.cloud&&!next.cloud||state.holding&&!next.holding||state.explore==='Stop'&&next.explore!=='Stop'||state.transport?.playing&&!next.transport?.playing))release();state=next;
    if(!state.holding&&touchMode==='move'){touchMode='draw';root.querySelector('[data-touch-mode]').value='draw';}
    root.querySelector('[data-touch-mode] option[value=move]').disabled=!state.cloud||!state.holding||!state.holdDrag;
    mpeButton.disabled=midiPending||typeof navigator.requestMIDIAccess!=='function'||state.xyBits!==14;
    for(const input of root.querySelectorAll('[data-response]')){const response=state.pressureResponse;input.disabled=!state.cloud||!response||input.dataset.response==='target'&&!response.target;if(response&&root.activeElement!==input)input.value=String(input.dataset.response==='direction'?(response.reverse?'Reverse':'Normal'):response[input.dataset.response]);}
    for(const option of root.querySelector('[data-response=target]').options)option.disabled=!(state.pressureTargets??['Velocity','Length','Spread']).includes(option.value);
    root.querySelector('[data-response=low]').max=String(state.pressureResponse?.high??127);root.querySelector('[data-response=high]').min=String(state.pressureResponse?.low??1);
    const pressure=root.querySelector('[data-pressure]');pressure.disabled=!state.cloud||state.drawBits!==14;if(root.activeElement!==pressure)pressure.value=String(state.pressure??100);root.querySelector('[data-pressure-value]').textContent=pressure.value;root.querySelector('[data-precision]').disabled=state.drawBits!==14;
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
    for(const input of root.querySelectorAll('[data-hold-axis]')){input.disabled=!state.cloud||!state.holding||!state.holdShift;if(movedSurface||input.disabled||root.activeElement!==input)input.value=String(state.holdShift?.[input.dataset.holdAxis]??0);root.querySelector(`[data-hold-value="${input.dataset.holdAxis}"]`).textContent=(Number(input.value)/129).toFixed(2);}
    root.querySelector('[data-hold-center]').disabled=!state.cloud||!state.holding||!state.holdShift;
    const hold=root.querySelector('[data-action="hold"]');hold.textContent=state.holding?'Release cloud':'Hold cloud';hold.setAttribute('aria-pressed',String(state.holding===true));hold.disabled=!state.cloud;
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
 return {release,suspend,resume,padGesture(phase,event,bounds){if(phase==='down')return beginPointer(event,bounds);if(phase==='move')return movePointer(event,bounds);finish(event);return true;},isHeld:()=>pointers.size+mpeContacts.size>0,dispose(){suspend();disconnectMidi();disposed=true;observer.disconnect();document.removeEventListener('visibilitychange',visibility);globalThis.removeEventListener('pagehide',pause);globalThis.removeEventListener('blur',release);}};
}
