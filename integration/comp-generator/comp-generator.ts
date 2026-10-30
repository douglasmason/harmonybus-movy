/** Shared actor browser and temporary performance source; Record owns persistence. */
import styles from './generator-styles.json';
import {userParts,isGeneratorPart,type PartKind} from './part-storage.js';
import {portFor} from '../track/registry.js';
import {seqCmd,seqCmdFlush,engineReady,engineGeneration} from './engine.js';
import {seqState} from './state.js';
import {seqToast} from './render.js';
import {undoableEdit} from '../undo/edit.js';
type Actor='Comp'|'Bass';
type Draft={config:number[];genre:string;user:number|null;auditioned?:boolean};
let selectedActor:Actor='Comp',generation=-1,recordingTrack:number|null=null,pageDirty=false,selectedTrack=2;
let tracks={Comp:2,Bass:1};
const shortStyles:Record<string,string>={'Root / Fifth':'R+5',Syncopated:'Sync',Quarters:'Qtrs',Offbeats:'Offbt',Sustain:'Hold','Pop Answer 2b':'Pop 2b','Funk Pocket 2b':'Funk 2b','Bossa 2b':'Bosa 2b','Soul Space 4b':'Soul 4b'};
const drafts=new Map<string,Draft>();
const liveModes=['Exploring','Recording','Preview','Overdub'];
const recordedModes=['Recorded','Preview','Overdub'];
const cached=new Map<number,{at:number;value:string[]}>();
export const generatorBrowseKeys=['cg_actor','cg_genre','cg_family','cg_style'];
export const generatorKeys=['cg_complexity','cg_intensity','cg_seed','cg_explore','cg_bake'];
export function generatorActor():Actor{return selectedActor;}
export function generatorTarget(comp:number,bass:number):number {tracks={Comp:comp,Bass:bass};selectedTrack=tracks[selectedActor];return selectedTrack;}
function draft(track=selectedTrack):Draft {
 const key=selectedActor+':'+track;let value=drafts.get(key);
 if(!value){value={config:[styles.findIndex(style=>style.actor===selectedActor),32,64,1],genre:'All',user:null};drafts.set(key,value);}
 return value;
}
/** Existing library Load can start the same temporary source and Record path. */
export function generatorAuditionUser(track:number,kind:PartKind,index:number):boolean {
 const actor:Actor=kind==='bass'?'Bass':'Comp',entry=userParts(kind)[index];
 if(!entry||!isGeneratorPart(entry)||(entry.generator&&entry.generator!==actor)){seqToast('Choose a saved generator recipe');return false;}
 if(entry.synth!==(portFor(track).getParam('synth_module')??'')){seqToast('User preset needs its saved instrument');return false;}
 if(!engineReady())return false;
 seqCmd('guser '+track+' '+kind+' '+entry.payload);seqCmdFlush();cached.clear();
 const state=info(track,true);
 if(state[5]!=='1'||!state[3]?.startsWith('Explore saved recipe')){seqToast(state[3]??'Recipe unavailable');return false;}
 selectedActor=actor;selectedTrack=track;tracks[actor]=track;
 const current=draft(track);current.user=index;current.auditioned=true;current.genre='All';pageDirty=true;readState(track,true);return true;
}
function editUser(track:number,field:number,value:number):boolean {
 seqCmd('guser '+track+' edit '+field+' '+value);seqCmdFlush();cached.clear();
 const state=readState(track,true);if((state[5]!=='1'&&state[0]!=='Overdub')||!state[3]?.startsWith('Explore saved recipe')){seqToast(state[3]??'Recipe unavailable');return false;}return true;
}
function choices(genre=draft().genre){return styles.filter(style=>style.actor===selectedActor&&(genre==='All'||style.genres.includes(genre)));}
function familyChoices():string[]{return [...new Set([...choices().map(style=>style.family),styles[draft().config[0]].family,...(draft().genre==='All'||draft().user!==null?['User']:[])])];}
function styleChoices():string[]{if(draft().user!==null)return Array.from({length:8},(_,index)=>'User '+(index+1));const family=styles[draft().config[0]].family;return [...new Set([...choices().filter(style=>style.family===family).map(style=>style.name),styles[draft().config[0]].name])];}
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
 if(generation!==engineGeneration()){cached.clear();recordingTrack=null;generation=engineGeneration();}
 const now=Date.now();let state=cached.get(track);
 if(fresh||!state||now-state.at>=100){state={at:now,value:String(host_module_get_param('generator_info_'+track)??'').split('|')};cached.set(track,state);}
 return state.value;
}
function active(track=selectedTrack):boolean {return liveModes.includes(info(track)[0]);}
function recordingTarget():number|null {
 const binding=info(selectedTrack)[4];
 if(binding!==undefined){const owner=Number(binding);recordingTrack=Number.isInteger(owner)&&owner>=0&&owner<16?owner:null;}
 else if(!seqState.recording&&!seqState.countingIn)recordingTrack=null;
 return recordingTrack;
}
export function generatorRecordActive():boolean {return recordingTarget()!==null||(active()&&compatible(info(selectedTrack)));}
export function generatorRecordTrack():number|null {return recordingTarget()??(active()&&compatible(info(selectedTrack))?selectedTrack:null);}
export function generatorPageChanged():boolean {const changed=pageDirty;pageDirty=false;return changed;}
function compatible(state:string[]):boolean {const style=styles[Number(state[2]?.split(' ')[0])];return !(liveModes.includes(state[0])||state[0]==='Recorded')||style?.actor===selectedActor;}
function readState(track:number,fresh=false):string[]{
 const state=info(track,fresh),current=draft(track);
 if((liveModes.includes(state[0])||state[0]==='Recorded')&&compatible(state)){
  const values=state[2]?.split(' ').slice(0,4).map(Number);
  if(values?.length===4&&values.every(Number.isFinite)&&Number.isInteger(values[0])&&styles[values[0]]){
   if(styles[current.config[0]].family!==styles[values[0]].family)pageDirty=true;
   current.config=values;
   if(recordedModes.includes(state[0])&&current.user!==null&&current.auditioned){current.user=null;pageDirty=true;}
  }
 }
 return state;
}
function preview(track:number,slot:number,field?:number,value?:number):boolean {
 if(!engineReady())return false;
 seqCmd('gpreview '+track+' '+slot+(field===undefined?'':' '+field+' '+value));seqCmdFlush();cached.clear();
 const state=readState(track,true),okay=['Preview','Overdub'].includes(state[0]);
 if(!okay)seqToast(state[3]??'Preview unavailable');
 return okay;
}
/** null leaves ordinary Record routing alone; false consumes a refused request. */
export function generatorPrepareRecord(track:number):boolean|null {
 if(recordingTarget()!==null)return true;
 const state=readState(track,true);
 if(!compatible(state)){seqToast('Clip belongs to another actor');return false;}
 if(active(track))return true;
 return state[0]==='Recorded'?preview(track,Number(state[1])):null;
}
export function generatorRecordCommand():string|null {const track=generatorRecordTrack();if(track===null)return null;recordingTrack=track;return 'rec '+track;}
export function generatorStop(track?:number):void {if(engineReady()){seqCmd(track===undefined?'gexplore off':'gexplore '+track+' off');seqCmdFlush();}cached.clear();if(track===undefined||recordingTrack===track)recordingTrack=null;}
function send(track:number):boolean {
 if(!engineReady())return false;
 seqCmd('gexplore '+track+' '+draft(track).config.join(' '));seqCmdFlush();cached.clear();
 const result=info(track,true),okay=liveModes.includes(result[0]);
 if(!okay)seqToast(result[3]??'Generator unavailable');
 return okay;
}
export function generatorRead(key:string,track:number):string|null {
 if(!key.startsWith('cg_'))return null;
 readState(track);const current=draft(track),config=current.config,field=key.slice(3);
 if(field==='actor')return selectedActor;
 if(field==='genre')return current.genre;
 if(field==='family')return current.user!==null?'User':styles[config[0]].family;
 if(field==='style')return current.user!==null?'User '+(current.user+1):styles[config[0]].name;
 if(field==='complexity'||field==='intensity')return String(Math.round(config[field==='complexity'?1:2]*100/127));
 if(field==='seed')return String(config[3]);
 if(field==='explore')return active(track)?'Stop':'Start';
 if(field==='bake')return 'Tap';return null;
}
export function generatorWrite(key:string,value:string,track:number):boolean|null {
 if(!key.startsWith('cg_'))return null;
 const field=key.slice(3);
 if(field==='actor'){
  if(!['Comp','Bass'].includes(value))return false;if(value===selectedActor)return true;
  selectedActor=value as Actor;selectedTrack=tracks[selectedActor];cached.clear();pageDirty=true;return true;
 }
 const state=readState(track),current=draft(track),recorded=recordedModes.includes(state[0]);
 if(!compatible(state)){seqToast('Clip belongs to another actor');return false;}
 if(field==='genre'){
  if(value!=='All'&&!styles.some(style=>style.actor===selectedActor&&style.genres.includes(value)))return false;
  current.genre=value;pageDirty=true;return true;
 }
 const userChoice=field==='family'&&value==='User'?0:field==='style'&&current.user!==null&&/^User [1-8]$/.test(value)?Number(value.slice(5))-1:null;
 if(userChoice!==null){
  if(recordingTarget()===track){seqToast('Finish this actor take first');return false;}
  if(active(track))return generatorAuditionUser(track,selectedActor==='Bass'?'bass':'comp',userChoice);
  current.user=userChoice;current.auditioned=false;pageDirty=true;return true;
 }
 if(field==='seed'&&current.user!==null){seqToast('Seed fixed for saved recipes');return false;}
 const next=[...current.config];
 if(field==='family'){const index=styles.findIndex(style=>style.actor===selectedActor&&style.family===value&&(current.genre==='All'||style.genres.includes(current.genre)));if(index<0)return false;next[0]=index;}
 else if(field==='style'){const index=styles.findIndex(style=>style.actor===selectedActor&&style.name===value&&style.family===styles[current.config[0]].family&&(current.genre==='All'||style.genres.includes(current.genre)));if(index<0)return false;next[0]=index;}
 else if(field==='complexity'||field==='intensity'){const number=Number(value);if(!Number.isFinite(number))return false;next[field==='complexity'?1:2]=Math.round(Math.max(0,Math.min(100,number))*127/100);}
 else if(field==='seed'){if(recorded){seqToast('Seed fixed for recorded clips');return false;}if(recordingTarget()===track){seqToast('Seed locked during recording');return false;}const number=Number(value);if(!Number.isFinite(number))return false;next[3]=Math.max(1,Math.min(65535,Math.round(number)));}
 else return true;
 if(current.user!==null){
  if(field==='family'||field==='style'){
   if(recordingTarget()===track){seqToast('Finish this actor take first');return false;}
   const wasActive=active(track);if(wasActive)generatorStop(track);current.user=null;current.config=next;pageDirty=true;
   return wasActive?send(track):true;
  }
  if(active(track))return editUser(track,field==='complexity'?0:1,next[field==='complexity'?1:2]);
  seqToast('Start recipe exploration to change its controls');return false;
 }
 if(styles[current.config[0]].family!==styles[next[0]].family)pageDirty=true;
 current.config=next;
 if(recorded){const index=field==='complexity'?0:field==='intensity'?1:2;return preview(track,Number(state[1]),index,next[index===2?0:index+1]);}
 if(active(track))return send(track);return true;
}
export function generatorTouch(key:string,track:number,down:boolean):boolean {
 if(key.startsWith('cp_blank_'))return true;
 if(!['cg_explore','cg_bake'].includes(key))return false;if(!down)return true;
 const state=readState(track,true);
 if(!compatible(state)){seqToast('Clip belongs to another actor');return true;}
 if(key==='cg_explore') {if(active(track))generatorStop(track);else {if(draft(track).user!==null)generatorAuditionUser(track,selectedActor==='Bass'?'bass':'comp',draft(track).user!);else if(state[0]==='Recorded')preview(track,Number(state[1]));else if(send(track))seqToast('Explore: Play starts / Rec saves');}return true;}
 const slot=Number(state[1]);
 if(state[0]!=='Recorded'||seqState.recording||seqState.countingIn){seqToast('Stop exploration; record a take first');return true;}
 undoableEdit('BAKE '+selectedActor.toUpperCase(),'T'+(track+1),()=>seqCmd('gbake '+track+' '+slot));seqCmdFlush();cached.clear();
 seqToast(info(track,true)[3]??'Bake requested');return true;
}
export function generatorFooter(track:number):string {
 const state=info(track);if(!compatible(state))return 'Clip belongs to another actor';
 if(state[3]&&/^(Choose|Three|Set actor|Actor needs|Automation|Seed locked|Recording ended|Generator automation|Play the selected|Preview ended)/.test(state[3]))return state[3];
 const target=selectedActor+' T'+(track+1)+':'+(Number(state[1])+1),owner=recordingTarget();
 if(owner!==null&&owner!==track)return target+' / Rec T'+(owner+1);
 return (state[0]==='Overdub'?'Overdub ':state[0]==='Preview'?'Preview ':state[0]==='Recording'?'Recording ':active(track)?'Explore ':state[0]==='Recorded'?'Recorded ':'Temporary ')+target;
}
