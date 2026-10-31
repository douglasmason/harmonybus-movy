/** Compose existing views around one connection, cache, focus and session owner. */
import {mountHBComponent} from './build/hb-components.mjs';
import {mountLighting} from './lighting-ui.mjs';
import {mountSong} from './song-ui.mjs';
const names=['controls','pads','field','choices','song','lights'];
const fieldReads=['field_outputs_view2','field_output_labels','field_placement_view','motion_operation'];
/** @param {{connection: import('./workspace-contract.d.ts').ConnectionOwner, inputs: {isHeld():boolean}}} options */
export function mountMoveWorkspace({connection,inputs}){
 const cache=new Map(),demand=new Map(),workspace=document.querySelector('#workspace');
 const components=new Map(),panels=new Map(names.map(name=>[name,workspace.querySelector(`[data-workspace="${name}"]`)]));
 const pickers=[...document.querySelectorAll('[data-show-component]')],trackPicker=document.querySelector('#component-track');
 let frame=null,track=0,available=true,layout='stack',trackSelection='follow',order=[...names];
 const shown=new Set(['controls','pads']);
 const valid=()=>available&&connection.engine==='browser'&&!connection.busy;
 /** @type {import('./workspace-contract.d.ts').ParameterBridge} */
 const api={component:'midi_fx1',getParam:key=>Promise.resolve(valid()?cache.get(`ch${track}:${key}`):undefined),setParam(key,value){if(valid())connection.send({type:'set_param',key:`ch${track}:${key}`,value:String(value)});}};
 for(const name of ['field','choices']){
  const component=mountHBComponent(name,panels.get(name).querySelector('.component-content'),api);
  component.suspend();components.set(name,component);
 }
 const lighting=mountLighting(panels.get('lights').querySelector('.component-content'));
 const song=mountSong({root:panels.get('song'),read:key=>cache.get(key),actions:{get count(){return frame?.song?.count??0;},
  get building(){return !!frame?.song?.building;},hold:value=>connection.send({type:'move_song',action:'hold',value}),
  scene:value=>connection.send({type:'move_song',action:'scene',value}),
  edit(){shown.add('controls');apply();connection.send({type:'move_song',action:'edit'});},
  reset:()=>connection.send({type:'move_song',action:'hold',value:false})}});
 function watch(){
  const keys=[];
  if(available){
   if(shown.has('field'))keys.push(...fieldReads.map(key=>`ch${track}:midi_fx1:${key}`));
   if(shown.has('choices'))keys.push(`ch${track}:midi_fx1:motif_choice_view`,`ch${track}:midi_fx1:motion_operation`);
   if(shown.has('lights'))keys.push(...lighting.watchKeys,...[...demand].filter(([,time])=>Date.now()-time<750).map(([key])=>key));
  }
  connection.watch('workspace',keys);
 }
 function release(){for(const component of components.values())component.release();}
 function suspend(){for(const component of components.values())component.suspend();lighting.suspend();}
 function apply(){
  workspace.dataset.layout=layout;
  for(const name of names){
   const panel=panels.get(name),visible=shown.has(name);panel.hidden=!visible;
   const component=components.get(name);
   if(component){if(visible&&available)component.resume();else component.suspend();}
   const content=panel.querySelector('.component-content');
   if(content){content.inert=!available;content.hidden=!available;}
   const limitation=panel.querySelector('.component-limit');if(limitation)limitation.hidden=available;
  }
  if(shown.has('lights')&&available)lighting.resume();else lighting.suspend();
  for(const picker of pickers)picker.checked=shown.has(picker.dataset.showComponent);
  trackPicker.disabled=!available;watch();
 }
 for(const picker of pickers)picker.onchange=()=>{
  if(inputs.isHeld()||isHeld()){picker.checked=shown.has(picker.dataset.showComponent);return;}
  if(picker.checked)shown.add(picker.dataset.showComponent);else {shown.delete(picker.dataset.showComponent);if(picker.dataset.showComponent==='song')song.reset();}
  apply();
 };
 document.querySelector('#workspace-layout').onchange=event=>{if(inputs.isHeld()||isHeld()){event.target.value=layout;return;}layout=event.target.value;workspace.dataset.layout=layout;};
 for(const [name,panel] of panels){
  const header=document.createElement('div');header.className='component-heading';
  const title=document.createElement('strong');title.textContent={controls:'Display & controls',pads:'Playing pads & steps',field:'Field outputs',choices:'Motif probabilities',song:'Scenes & Song',lights:'Lighting preview'}[name];header.append(title);
  for(const [direction,label] of [[-1,'Move up'],[1,'Move down']]){
   const button=document.createElement('button');button.textContent=direction<0?'↑':'↓';button.setAttribute('aria-label',`${label} · ${title.textContent}`);
   button.onclick=()=>{
    if(inputs.isHeld()||isHeld())return;
    const index=order.indexOf(name),next=index+direction;if(next<0||next>=order.length)return;
    [order[index],order[next]]=[order[next],order[index]];
    for(const key of order)workspace.append(panels.get(key));
   };header.append(button);
  }
  panel.prepend(header);
 }
 function changeTrack(next){
  if(next===track)return;
  for(const component of components.values())component.suspend();
  track=next;
  for(const [name,component] of components)if(available&&shown.has(name))component.resume();
 }
 trackPicker.onchange=()=>{if(isHeld()){trackPicker.value=trackSelection;return;}trackSelection=trackPicker.value;changeTrack(trackPicker.value==='follow'?(frame?.track??0):Number(trackPicker.value));watch();};
 function isHeld(){return [...components.values()].some(component=>component.isHeld());}
 function receive(message){
  if(!available)return;
  for(const [key,value] of Object.entries(message.params??{}))cache.set(key,value);
  if(message.move){frame=message.move;changeTrack(trackPicker.value==='follow'?frame.track:Number(trackPicker.value));}
  song.update();
  if(shown.has('lights')){lighting.receive(message,cache);lighting.paint(cache,demand,Math.floor(track/4));}
  watch();
 }
 function setAvailable(value){
  suspend();available=value;cache.clear();demand.clear();frame=null;apply();
  if(!value){
   document.querySelector('#song-summary').textContent='Song state is unavailable from the Move mirror protocol.';
   // Discard prior browser lighting observations rather than show them as device state.
   lighting.paint(new Map(),new Map(),0);
  }
 }
 function capture(){return {shown:[...shown],order:[...order],layout,track:trackPicker.value,lighting:lighting.profile};}
 function restore(saved){
  suspend();shown.clear();for(const name of saved?.shown??['controls','pads'])if(names.includes(name))shown.add(name);
  order=Array.isArray(saved?.order)&&new Set(saved.order).size===names.length&&saved.order.every(name=>names.includes(name))?[...saved.order]:[...names];
  for(const name of order)workspace.append(panels.get(name));
  layout=saved?.layout==='columns'?'columns':'stack';document.querySelector('#workspace-layout').value=layout;
  trackPicker.value=/^(?:[0-9]|1[0-5])$/.test(saved?.track)?saved.track:'follow';
  trackSelection=trackPicker.value;if(saved?.lighting)lighting.restoreProfile(saved.lighting);if(['field','choices','song','lights'].includes(requested))shown.add(requested);apply();
 }
 const requested=new URLSearchParams(location.search).get('view');if(['field','choices','song','lights'].includes(requested))shown.add(requested);
 apply();
 return {receive,setAvailable,suspend,release,isHeld,capture,restore};
}
