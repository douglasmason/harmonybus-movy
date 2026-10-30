/** Browser aliases for the visible production controller's own page navigation. */
export function mountPanelControls(inputs){
 const selector=document.querySelector('#settings-panel');
 const layer=document.createElement('div');layer.id='screen-panels';
 layer.setAttribute('role','group');layer.setAttribute('aria-label','Settings panel segments');
 document.querySelector('#screen').append(layer);
 let current=null,signature='';
 selector.onchange=()=>{if(current)inputs.selectPanel(current.token,Number(selector.value));};
 return {update(frame){
  current=frame.panels;
  selector.dataset.panelIndex=current?String(current.index):'';
  const next=JSON.stringify(current);
  selector.disabled=!current||inputs.isHeld();
  if(next===signature)return;signature=next;
  selector.replaceChildren();layer.replaceChildren();
  if(!current){const option=document.createElement('option');option.textContent='No settings panel in this view';selector.append(option);return;}
  const groups=new Map();
  for(const entry of current.entries){
   let group=groups.get(entry.group);
   if(!group){group=document.createElement('optgroup');group.label=entry.group;groups.set(entry.group,group);selector.append(group);}
   const option=document.createElement('option');option.value=entry.index;option.textContent=entry.label;group.append(option);
  }
  selector.value=String(current.index);
  for(const {index,label,bounds:[x,y,width]}of current.segments){
   const button=document.createElement('button');button.className='screen-panel';button.type='button';
   button.setAttribute('aria-label','Settings panel · '+label);button.title=label;
   button.setAttribute('aria-current',index===current.index?'page':'false');
   Object.assign(button.style,{left:x/128*100+'%',top:Math.max(0,y-4)/64*100+'%',width:width/128*100+'%',height:6/64*100+'%'});
   const token=current.token;button.onclick=()=>inputs.selectPanel(token,index);layer.append(button);
  }
 }};
}
