/** Invisible, accessible knob aliases placed over production parameter cells. */
export function mountScreenControls(inputs,controls){
 const layer=document.createElement('div');layer.id='screen-controls';
 layer.setAttribute('role','group');layer.setAttribute('aria-label','Screen parameters');
 document.querySelector('#screen').append(layer);
 const cells=controls.map(control=>{
  const button=document.createElement('button');button.className='screen-parameter';button.hidden=true;
  button.type='button';button.dataset.slot=String(control.index-71);layer.append(button);
  return {button,isHeld:inputs.bindAlias(control,button)};
 });
 return {update(frame){
  const targets=new Map((frame.screenTargets??[]).map(target=>[target.slot,target.bounds]));
  for(let slot=0;slot<cells.length;slot++){
   const {button,isHeld}=cells[slot],held=isHeld(),bounds=targets.get(slot),label=frame.knobLabels?.[slot];
   const available=!!bounds&&!!label&&!label.readOnly;
   // Keep the captured element in place through its own value feedback or
   // menu transition. Pointer release still belongs to the original knob.
   button.hidden=!available&&!held;
   if(!available||held)continue;
   const [x,y,width,height]=bounds;
   Object.assign(button.style,{left:x/128*100+'%',top:y/64*100+'%',width:width/128*100+'%',height:height/64*100+'%'});
   button.setAttribute('aria-label','Screen knob '+(slot+1)+' · '+label.name);
   const description=label.action?'Tap to perform action':label.value+'. Drag vertically or use arrow keys to adjust; tap to touch the knob.';
   button.setAttribute('aria-description',description);button.title=label.name+' · '+(label.action?'Action':label.value);
  }
 }};
}
