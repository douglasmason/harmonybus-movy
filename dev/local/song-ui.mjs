/** Transport-neutral presentation of the production Song gestures. */
export function mountSong({root=document,actions,read}){
 const toggle=root.querySelector('#song-build'),summary=root.querySelector('#song-summary');
 let count=-1,buttons=[];
 function rebuild(){count=actions.count;buttons=Array.from({length:count},(_,scene)=>{
  const button=document.createElement('button');button.textContent=`Scene ${scene+1}`;button.disabled=true;
  button.onclick=()=>actions.scene(scene);return button;
 });root.querySelector('#song-scenes').replaceChildren(...buttons);}
 toggle.onclick=()=>actions.hold(!actions.building);
 root.querySelector('#song-edit').onclick=()=>actions.edit();
 return {
  reset:()=>actions.reset(),
  update(){
   if(count!==actions.count)rebuild();
   toggle.setAttribute('aria-pressed',String(actions.building));toggle.textContent=actions.building?'Finish building song':'Build a new song';for(const button of buttons)button.disabled=!actions.building;
   let state;try{state=JSON.parse(read('song_section')??'null');}catch{}
   if(state?.schema!==1){summary.textContent='Waiting for song state';return;}
   const entry=value=>value?`Entry ${value.index+1} · Scene ${value.scene+1}`:'—';
   summary.textContent=!state.count?'No song yet. Record a clip, then add Scene 1.':`${state.count} scene selections · Now ${entry(state.current)}${state.current?.terminal?' · END':''} · Next ${entry(state.next)}${state.next?(state.next.committed?' (queued)':' (forecast)'):''} · ${state.editable?'Stopped — section edits available':'Stop to edit sections'}`;
  }
 };
}
