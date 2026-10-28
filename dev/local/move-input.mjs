/** Touch and keyboard gestures for the adaptable HB/Movy control grid. */
export function mountMoveInput({controls,send}){
 const selector=document.querySelector('#encoder');
 const active=new Map(),buttons=new Map();
 const midi=data=>send({type:'move_midi',data});
 const touch=(control,on)=>midi([on?144:128,control.touch,on?127:0]);
 const edge=(control,on)=>midi([control.type==='cc'?176:on?144:128,control.index,on?(control.type==='cc'?127:100):0]);
 function begin(control,button){
  if(active.has(control))return;
  active.set(control,button);button.dataset.held='true';
  if(control.type==='encoder'){selector.value=String(control.index);touch(control,true);}
  else edge(control,true);
 }
 function end(control){
  const button=active.get(control);if(!button)return;
  active.delete(control);button.dataset.held='false';
  if(control.type==='encoder')touch(control,false);else edge(control,false);
 }
 function turn(control,delta){
  const value=Math.max(-63,Math.min(63,delta));if(value)midi([176,control.index,value<0?128+value:value]);
 }
 function clickJog(){midi([176,3,127]);midi([176,3,0]);}
 function release(){
  for(const button of active.values())button.dataset.held='false';active.clear();
  document.querySelector('#shift').checked=false;send({type:'dev_release'});
 }
 for(const control of controls){
  const button=document.createElement('button');button.className='control';button.disabled=true;
  button.setAttribute('aria-label',control.name);button.title=control.name;
  button.dataset.kind=control.type;button.dataset.index=control.index;buttons.set(control,button);
  button.dataset.group=control.group;
  const label=document.createElement('span');label.className='control-label';label.textContent=control.name.replace(/^(Pad|Step) /,'');button.append(label);document.querySelector('#'+control.group).append(button);
  if(control.type==='encoder'){const option=document.createElement('option');option.value=control.index;option.textContent=control.name;selector.append(option);}
  let lastY=0,moved=false,pointer=null;
  button.onpointerdown=event=>{
   if(pointer!==null)return;event.preventDefault();pointer=event.pointerId;
   button.setPointerCapture(pointer);lastY=event.clientY;moved=false;begin(control,button);
   document.querySelector('#control-status').textContent=control.name;
  };
  button.onpointermove=event=>{
   if(pointer!==event.pointerId||control.type!=='encoder'||!active.has(control))return;
   const delta=Math.trunc((lastY-event.clientY)/4);if(delta){turn(control,delta);lastY=event.clientY;moved=true;}
  };
  button.onpointerup=event=>{
   if(pointer!==event.pointerId)return;
   const wasActive=active.has(control);end(control);pointer=null;
   if(wasActive&&control.click&&!moved)clickJog();
  };
  button.onpointercancel=()=>{pointer=null;release();};
  button.onlostpointercapture=()=>{if(pointer!==null){pointer=null;release();}};
  button.onkeydown=event=>{
   if(control.type==='encoder'&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){
    event.preventDefault();begin(control,button);turn(control,['ArrowUp','ArrowRight'].includes(event.key)?1:-1);
   }else if([' ','Enter'].includes(event.key)){event.preventDefault();if(!event.repeat)begin(control,button);}
  };
  button.onkeyup=event=>{
   if(event.key.startsWith('Arrow')||[' ','Enter'].includes(event.key)){
    event.preventDefault();const held=active.has(control);end(control);
    if(held&&control.click&&[' ','Enter'].includes(event.key))clickJog();
   }
  };
  button.onblur=()=>{if(active.has(control))release();};
  // Assistive technology can activate a button without pointer/key events.
  button.onclick=event=>{if(event.detail===0&&!active.has(control)){begin(control,button);end(control);if(control.click)clickJog();}};
 }
 for(const [id,delta]of [['increase',1],['decrease',-1]])document.querySelector('#'+id).onclick=()=>{
  const control=controls.find(control=>control.type==='encoder'&&control.index===Number(selector.value));
  touch(control,true);turn(control,delta);touch(control,false);
 };
 document.querySelector('#enter').onclick=clickJog;
 document.querySelector('#shift').onchange=event=>midi([176,49,event.target.checked?127:0]);
 window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')release();});
 return {release,isHeld:()=>active.size>0||document.querySelector('#shift').checked,
  enable:()=>{for(const button of buttons.values())button.disabled=false;for(const id of ['encoder','decrease','increase','enter','shift'])document.querySelector('#'+id).disabled=false;}};
}
