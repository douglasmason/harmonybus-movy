/** Touch and keyboard gestures for the adaptable HB/Movy control grid. */
export function mountMoveInput({controls,send}){
 const selector=document.querySelector('#encoder');
 const status=document.querySelector('#control-status');
 const active=new Map(),buttons=new Map(),aliases=new Set(),shiftOwners=new Set(),shiftButtons=new Set();
 const selectedActions=[];
 const selectedControl=()=>controls.find(control=>control.type==='encoder'&&control.index===Number(selector.value));
 function refreshSelected(){
  const control=selectedControl();if(!control)return;
  selector.disabled=!enabled||selectedActions.some(button=>button.dataset.held==='true');
  document.querySelector('#encoder-reading').textContent=buttons.get(control).title;
  for(const button of selectedActions){
   const action=button.dataset.action,shift=button.parentElement.dataset.shift==='true';
   button.parentElement.setAttribute('aria-label',(shift?'Shift + ':'')+control.name+' actions');
   const name=(shift?'Shift + ':'')+control.name+' '+(['left','right'].includes(action)?'turn '+action:action);
   button.title=name;button.setAttribute('aria-label',name);
  }
 }
 let enabled=false;
 const midi=data=>send({type:'move_midi',data});
 const touch=(control,on)=>midi([144,control.touch,on?127:0]);
 function setShift(owner,on){
  const wasHeld=shiftOwners.size>0;
  if(on)shiftOwners.add(owner);else shiftOwners.delete(owner);
  if(wasHeld!==(shiftOwners.size>0))midi([176,49,shiftOwners.size?127:0]);
 }
 const edge=(control,on,button)=>control.type==='cc'&&control.index===49?setShift(button,on):midi([control.type==='cc'?176:on?144:128,control.index,on?(control.type==='cc'?127:100):0]);
 function begin(control,button){
  if(active.has(control)||button.disabled||button.hidden)return false;
  active.set(control,button);button.dataset.held='true';
  if(shiftButtons.has(button))setShift(button,true);
  status.dataset.encoder=control.type==='encoder'?String(control.index):'';status.textContent=button.title;
  if(control.type==='encoder'){if(!control.click&&!selector.disabled)selector.value=String(control.index);touch(control,true);}
  else edge(control,true,button);
  refreshSelected();
  return true;
 }
 function end(control,button){
  if(active.get(control)!==button)return false;
  active.delete(control);button.dataset.held='false';
  if(control.type==='encoder')touch(control,false);else edge(control,false,button);
  if(shiftButtons.has(button))setShift(button,false);
  refreshSelected();
  return true;
 }
 function turn(control,delta){
  const value=Math.max(-63,Math.min(63,delta));if(value)midi([176,control.index,value<0?128+value:value]);
 }
 function clickJog(){if([...active.keys()].some(control=>control.type==='cc'&&control.index===3))return;midi([176,3,127]);midi([176,3,0]);}
 function release(){
  for(const button of active.values())button.dataset.held='false';active.clear();shiftOwners.clear();
  document.querySelector('#shift').checked=false;send({type:'dev_release'});refreshSelected();
 }
 // Both the physical control grid and the screen cells use this one gesture
 // owner. A second finger on an alias cannot release the first finger's knob.
 function bind(source,button,{shift=false,delta=0,drag=true,click=!!source.click}={}){
  const resolveControl=typeof source==='function'?source:()=>source;
  let control=resolveControl();
  if(shift)shiftButtons.add(button);
  function start(){const next=resolveControl();if(!begin(next,button))return false;control=next;if(delta)turn(control,delta);return true;}
  let lastY=0,moved=false,pointer=null;
  button.onpointerdown=event=>{
   if(pointer!==null)return;event.preventDefault();
   if(!start())return;
   pointer=event.pointerId;button.setPointerCapture(pointer);lastY=event.clientY;moved=false;
  };
  button.onpointermove=event=>{
   if(!drag||pointer!==event.pointerId||control.type!=='encoder'||active.get(control)!==button)return;
   const delta=Math.trunc((lastY-event.clientY)/4);if(delta){turn(control,delta);lastY=event.clientY;moved=true;}
  };
  button.onpointerup=event=>{
   if(pointer!==event.pointerId)return;
   const wasActive=end(control,button);pointer=null;
   if(wasActive&&click&&!moved)clickJog();
  };
  button.onpointercancel=()=>{pointer=null;if(active.get(control)===button)release();};
  button.onlostpointercapture=()=>{if(pointer!==null){pointer=null;if(active.get(control)===button)release();}};
  button.onkeydown=event=>{
   if(drag&&control.type==='encoder'&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){
    event.preventDefault();if(active.get(control)===button||start())turn(control,['ArrowUp','ArrowRight'].includes(event.key)?1:-1);
   }else if([' ','Enter'].includes(event.key)){event.preventDefault();if(!event.repeat)start();}
  };
  button.onkeyup=event=>{
   if(event.key.startsWith('Arrow')||[' ','Enter'].includes(event.key)){
    event.preventDefault();const held=end(control,button);
    if(held&&click&&[' ','Enter'].includes(event.key))clickJog();
   }
  };
  button.onblur=()=>{if(pointer===null&&active.get(control)===button)release();};
  // Assistive technology can activate without pointer/key events.
  button.onclick=event=>{if(event.detail===0&&!event.pointerType&&start()){end(control,button);if(click)clickJog();}};
 }
 function encoderCard(control,button){
  const card=document.createElement('div');card.className='encoder-card';card.dataset.encoder=control.index;card.append(button);
  if(control.click)actionRows(card,control);
  return card;
 }
 function actionRows(container,source){
  const control=typeof source==='function'?source():source;
  const clickControl=control.click?{type:'cc',index:control.click,name:'Jog click'}:null;
  for(const shift of [false,true]){
   const row=document.createElement('div');row.className='encoder-action-row';row.dataset.shift=String(shift);
   row.setAttribute('role','group');row.setAttribute('aria-label',(shift?'Shift + ':'')+control.name+' actions');
   for(const [action,label,delta]of [['left','−',-1],['touch','Touch',0],...(clickControl?[['click','Click',0]]:[]),['right','+',1]]){
    const actionButton=document.createElement('button');actionButton.className='encoder-action';actionButton.disabled=true;
    const name=(shift?'Shift + ':'')+control.name+' '+(delta?'turn '+action:action);
    actionButton.textContent=(shift?'⇧ ':'')+label;actionButton.title=name;actionButton.setAttribute('aria-label',name);
    actionButton.dataset.action=action;row.append(actionButton);aliases.add(actionButton);
    if(typeof source==='function')selectedActions.push(actionButton);
    bind(action==='click'?clickControl:source,actionButton,{shift,delta,drag:false,click:false});
   }
   container.append(row);
  }
 }
 const padRows=new Map();
 for(let row=3;row>=0;row--){
  const section=document.createElement('div');section.className='pad-row';
  const heading=document.createElement('div');heading.className='pad-row-label';heading.dataset.row=row;
  heading.textContent=`Pads ${row*8+1}–${row*8+8}`;
  const rowButtons=document.createElement('div');rowButtons.className='pad-row-buttons';
  section.append(heading,rowButtons);document.querySelector('#pads').append(section);padRows.set(row,rowButtons);
 }
 for(const control of controls){
  const button=document.createElement('button');button.className='control';button.disabled=true;
  button.setAttribute('aria-label',control.name);button.title=control.name;
  button.dataset.kind=control.type;button.dataset.index=control.index;buttons.set(control,button);
  button.dataset.group=control.group;
  const label=document.createElement('span');label.className='control-label';label.textContent=control.name.replace(/^(Pad|Step) /,'');button.append(label);
  if(control.group==='knobs')for(const kind of ['name','value']){
   const reading=document.createElement('span');reading.className='knob-'+kind;button.append(reading);
  }
  if(control.group==='pads'){
   const secondary=document.createElement('span');secondary.className='pad-note';button.append(secondary);
   padRows.get(Math.floor((control.index-68)/8)).append(button);
  }else document.querySelector('#'+control.group).append(control.type==='encoder'?encoderCard(control,button):button);
  if(control.type==='encoder'&&!control.click){const option=document.createElement('option');option.value=control.index;option.textContent=control.name;selector.append(option);}
  bind(control,button);
 }
 actionRows(document.querySelector('#encoder-actions'),selectedControl);
 selector.onchange=()=>{
  const control=controls.find(control=>control.type==='encoder'&&control.index===Number(selector.value));
  status.dataset.encoder=String(control.index);status.textContent=buttons.get(control).title;
  refreshSelected();
 };
 refreshSelected();
 document.querySelector('#shift').onchange=event=>setShift(event.target,event.target.checked);
 window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')release();});
 return {release,refreshSelected,isHeld:()=>active.size>0||shiftOwners.size>0,
  selectPanel:(token,index)=>{if(!active.size&&!shiftOwners.size)send({type:'move_panel',token,index});},
  bindAlias(control,button){aliases.add(button);button.disabled=!enabled;bind(control,button);return ()=>active.get(control)===button;},
  enable:()=>{enabled=true;for(const button of [...buttons.values(),...aliases])button.disabled=false;document.querySelector('#shift').disabled=false;refreshSelected();}};
}
