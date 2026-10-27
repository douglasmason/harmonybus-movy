/** Shared actor browser and temporary performance source; Record owns persistence. */
import styles from './generator-styles.json';
import {seqCmd,seqCmdFlush,engineReady,engineGeneration} from './engine.js';
import {seqState} from './state.js';
import {seqToast} from './render.js';
import {undoableEdit} from '../undo/edit.js';
type Actor='Comp'|'Bass';
type Draft={config:number[];genre:string};
let selectedActor:Actor='Comp',actor=-1,generation=-1,pageDirty=false,selectedTrack=2;
let tracks={Comp:2,Bass:1};
const shortStyles:Record<string,string>={'Root / Fifth':'R+5',Syncopated:'Sync',Quarters:'Qtrs',Offbeats:'Offbt',Sustain:'Hold'};
const drafts=new Map<string,Draft>();
const liveModes=['Exploring','Recording','Preview','Overdub'];
const recordedModes=['Recorded','Preview','Overdub'];
let cached={track:-1,at:0,value:[] as string[]};
export const generatorBrowseKeys=['cg_actor','cg_genre','cg_family','cg_style'];
export const generatorKeys=['cg_complexity','cg_intensity','cg_seed','cg_explore','cg_bake'];
export function generatorActor():Actor{return selectedActor;}
export function generatorTarget(comp:number,bass:number):number {tracks={Comp:comp,Bass:bass};selectedTrack=tracks[selectedActor];return selectedTrack;}
function draft(track=selectedTrack):Draft {
 const key=selectedActor+':'+track;let value=drafts.get(key);
 if(!value){value={config:[styles.findIndex(style=>style.actor===selectedActor),32,64,1],genre:'All'};drafts.set(key,value);}
 return value;
}
function choices(genre=draft().genre){return styles.filter(style=>style.actor===selectedActor&&(genre==='All'||style.genres.includes(genre)));}
function familyChoices():string[]{return [...new Set([...choices().map(style=>style.family),styles[draft().config[0]].family])];}
function styleChoices():string[]{const family=styles[draft().config[0]].family;return [...new Set([...choices().filter(style=>style.family===family).map(style=>style.name),styles[draft().config[0]].name])];}
export function generatorParameters():any[]{return [
 {key:'cg_actor',name:'Generator Actor',short_name:'Actor',type:'enum',options:['Comp','Bass'],options_as_string:true,default:'Comp'},
 {key:'cg_genre',name:'Genre Filter',short_name:'Genre',type:'enum',options:['All',...new Set(styles.filter(style=>style.actor===selectedActor).flatMap(style=>style.genres))],options_as_string:true,default:'All'},
 {key:'cg_family',name:'Pattern Family',short_name:'Family',type:'enum',options:familyChoices(),options_as_string:true,default:familyChoices()[0]},
 {key:'cg_style',name:'Pattern Style',short_name:'Style',type:'enum',options:styleChoices(),short_options:styleChoices().map(name=>shortStyles[name]??name),options_as_string:true,default:styleChoices()[0]},
 ...['complexity','intensity'].map(field=>({key:'cg_'+field,name:field==='complexity'?'Complexity %':'Intensity %',short_name:field==='complexity'?'Complex':'Intens',type:'int',min:0,max:100,step:1,default:field==='complexity'?25:50})),
 {key:'cg_seed',name:'Variation Seed',short_name:'Seed',type:'int',min:1,max:65535,step:1,default:1},
 ...['explore','bake'].map(field=>({key:'cg_'+field,name:field==='explore'?'Explore / Stop':'Bake Recorded Clip',short_name:field==='explore'?'Explore':'Bake',type:'string',readOnly:true}))
];}
function info(track:number,fresh=false):string[]{
 const now=Date.now();
 if(fresh||cached.track!==track||now-cached.at>=100){cached={track,at:now,value:String(host_module_get_param('generator_info_'+track)??'').split('|')};}
 return cached.value;
}
function active():boolean {
 if(generation!==engineGeneration()){actor=-1;return false;}
 if(actor>=0){const state=info(actor);if(state.length>=3&&!liveModes.includes(state[0]))actor=-1;}
 return actor>=0;
}
export function generatorRecordActive():boolean {return active();}
export function generatorRecordTrack():number|null {return active()?actor:null;}
export function generatorPageChanged():boolean {const changed=pageDirty;pageDirty=false;return changed;}
function compatible(state:string[]):boolean {const style=styles[Number(state[2]?.split(' ')[0])];return !recordedModes.includes(state[0])||style?.actor===selectedActor;}
function readState(track:number,fresh=false):string[]{
 const state=info(track,fresh),current=draft(track);
 if((recordedModes.includes(state[0])||state[0]==='Recording')&&compatible(state)){
  const values=state[2]?.split(' ').slice(0,4).map(Number);
  if(values?.length===4&&values.every(Number.isFinite)&&Number.isInteger(values[0])&&styles[values[0]]){
   if(styles[current.config[0]].family!==styles[values[0]].family)pageDirty=true;
   current.config=values;
  }
 }
 return state;
}
function preview(track:number,slot:number,field?:number,value?:number):boolean {
 if(!engineReady())return false;
 seqCmd('gpreview '+track+' '+slot+(field===undefined?'':' '+field+' '+value));seqCmdFlush();cached.at=0;
 const state=readState(track,true),okay=['Preview','Overdub'].includes(state[0]);
 if(okay){actor=track;generation=engineGeneration();}else seqToast(state[3]??'Preview unavailable');
 return okay;
}
/** null leaves ordinary Record routing alone; false consumes a refused request. */
export function generatorPrepareRecord(track:number):boolean|null {
 if(active())return true;
 const state=readState(track,true);
 if(!compatible(state)){seqToast('Clip belongs to another actor');return false;}
 return state[0]==='Recorded'?preview(track,Number(state[1])):null;
}
export function generatorRecordCommand():string|null {return active()?'rec '+actor:null;}
export function generatorStop():void {if(actor>=0&&engineReady()){seqCmd('gexplore off');seqCmdFlush();}actor=-1;cached.at=0;}
function send(track:number):boolean {
 if(!engineReady())return false;
 seqCmd('gexplore '+track+' '+draft(track).config.join(' '));seqCmdFlush();cached.at=0;
 const result=info(track,true),okay=liveModes.includes(result[0]);
 if(okay){actor=track;generation=engineGeneration();}else seqToast(result[3]??'Generator unavailable');
 return okay;
}
export function generatorRead(key:string,track:number):string|null {
 if(!key.startsWith('cg_'))return null;
 readState(track);const current=draft(track),config=current.config,field=key.slice(3);
 if(field==='actor')return selectedActor;
 if(field==='genre')return current.genre;
 if(field==='family')return styles[config[0]].family;
 if(field==='style')return styles[config[0]].name;
 if(field==='complexity'||field==='intensity')return String(Math.round(config[field==='complexity'?1:2]*100/127));
 if(field==='seed')return String(config[3]);
 if(field==='explore')return active()?'Stop':'Start';
 if(field==='bake')return 'Tap';return null;
}
export function generatorWrite(key:string,value:string,track:number):boolean|null {
 if(!key.startsWith('cg_'))return null;
 const field=key.slice(3);
 if(field==='actor'){
  if(!['Comp','Bass'].includes(value))return false;if(value===selectedActor)return true;
  if(seqState.recording||seqState.countingIn){seqToast('Finish recording before changing actor');return false;}
  generatorStop();selectedActor=value as Actor;selectedTrack=tracks[selectedActor];pageDirty=true;return true;
 }
 const state=readState(track),current=draft(track),recorded=recordedModes.includes(state[0]);
 if(!compatible(state)){seqToast('Clip belongs to another actor');return false;}
 if(field==='genre'){
  if(value!=='All'&&!styles.some(style=>style.actor===selectedActor&&style.genres.includes(value)))return false;
  current.genre=value;pageDirty=true;return true;
 }
 const next=[...current.config];
 if(field==='family'){const index=styles.findIndex(style=>style.actor===selectedActor&&style.family===value&&(current.genre==='All'||style.genres.includes(current.genre)));if(index<0)return false;next[0]=index;}
 else if(field==='style'){const index=styles.findIndex(style=>style.actor===selectedActor&&style.name===value&&style.family===styles[current.config[0]].family&&(current.genre==='All'||style.genres.includes(current.genre)));if(index<0)return false;next[0]=index;}
 else if(field==='complexity'||field==='intensity'){const number=Number(value);if(!Number.isFinite(number))return false;next[field==='complexity'?1:2]=Math.round(Math.max(0,Math.min(100,number))*127/100);}
 else if(field==='seed'){if(recorded){seqToast('Seed fixed for recorded clips');return false;}if(seqState.recording||seqState.countingIn){seqToast('Seed locked during recording');return false;}const number=Number(value);if(!Number.isFinite(number))return false;next[3]=Math.max(1,Math.min(65535,Math.round(number)));}
 else return true;
 if(styles[current.config[0]].family!==styles[next[0]].family)pageDirty=true;
 current.config=next;
 if(recorded){const index=field==='complexity'?0:field==='intensity'?1:2;return preview(track,Number(state[1]),index,next[index===2?0:index+1]);}
 if(active())return send(track);return true;
}
export function generatorTouch(key:string,track:number,down:boolean):boolean {
 if(key.startsWith('cp_blank_'))return true;
 if(!['cg_explore','cg_bake'].includes(key))return false;if(!down)return true;
 const state=readState(track,true);
 if(!compatible(state)){seqToast('Clip belongs to another actor');return true;}
 if(key==='cg_explore') {if(active())generatorStop();else {if(state[0]==='Recorded')preview(track,Number(state[1]));else if(send(track))seqToast('Explore: Play starts / Rec saves');}return true;}
 const slot=Number(state[1]);
 if(state[0]!=='Recorded'||seqState.recording||seqState.countingIn){seqToast('Stop exploration; record a take first');return true;}
 undoableEdit('BAKE '+selectedActor.toUpperCase(),'T'+(track+1),()=>seqCmd('gbake '+track+' '+slot));seqCmdFlush();cached.at=0;
 seqToast(info(track,true)[3]??'Bake requested');return true;
}
export function generatorFooter(track:number):string {
 const state=info(track);if(!compatible(state))return 'Clip belongs to another actor';
 if(state[3]&&/^(Choose|Three|Set actor|Actor needs|Automation|Seed locked|Recording ended|Generator automation|Play the selected|Preview ended)/.test(state[3]))return state[3];
 const target=selectedActor+' T'+(track+1)+':'+(Number(state[1])+1);
 return (state[0]==='Overdub'?'Overdub ':state[0]==='Preview'?'Preview ':state[0]==='Recording'?'Recording ':active()?'Explore ':state[0]==='Recorded'?'Recorded ':'Temporary ')+target;
}
