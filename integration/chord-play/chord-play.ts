/** Chord slots choose conductor harmony; the comp actor owns rhythm and sound. */
import { appState } from '../app/state.js';
import { selectTrack } from '../track/focus.js';
import { portFor } from '../track/registry.js';
import type { TrackPort } from '../track/port.js';
import { createSchwungPage, type SchwungPage } from '../renderer/schwung-page.js';
import { beginControlTouch } from '../surfaces/controls.js';
import type { PerformancePort } from '../renderer/hb-performance.js';
import { ownPerformanceTouch, releasePerformanceTouch } from '../renderer/performance-touch.js';
import { drawHeader, drawBankBar } from '../renderer/header.js';
import { seqState } from './state.js';
import { fieldEngineSet, engineReady } from './engine.js';
import { markUiStateDirty } from './ui-dirty.js';
import { cachedSetAnimLED } from './led-cache.js';
import { trackColor } from './colors.js';
import { muteHeld } from './router-buttons.js';
import { seqToast } from './render.js';
import { recToggle } from '../undo/rec-pass.js';
import { settingsActive } from './hb-settings.js';

const send=(key:string,value:string):void=>{if(engineReady())fieldEngineSet(key,value);};
const notes=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const qualities=['Auto','Major','Minor','Dim','Aug','Maj7','Dom7','Min7','Half Dim7','Dim7','MinMaj7','AugMaj7','Dom7b5'];
const forms=['Auto','Power','Triad','Seventh','Ninth','Add9','Sixth','6/9','Eleventh','Thirteenth','Sus2','Sus4','Shell 7','Shell 9','Shell 6/9','Rootless 7','Rootless 9'];
// Shared HB scale indices, presented through the native parameter metadata below.
type Slot={root:number;quality:number;form:number;policy:number;tonic:number;scale:number;bass:number};
type Setup={conductor:number;comp:number;source:number;selected:number;slots:Slot[]};
const fresh=():Setup=>({conductor:0,comp:2,source:0,selected:0,slots:Array.from({length:16},(_,index)=>({root:[0,2,4,5,7,9,11,10,0,3,5,8,10,2,7,0][index],quality:[1,2,2,1,1,2,3,1,5,1,2,1,6,6,6,1][index],form:0,policy:1,tonic:0,scale:1,bass:12}))});
let setup=fresh(),enabled=false,page:SchwungPage|null=null,pageTrack=-1,activeSlot=-1,route='';
const touches=new Map<number,SchwungPage>(),steps=new Set<number>(),controls=new Set<number>();
const performanceOwners=new Map<number,PerformancePort>();
function performanceOwner(track:number):PerformancePort{
    let owner=performanceOwners.get(track);
    if(!owner){const native=portFor(track);owner={performanceTrack:track,performanceGet:key=>native.getParam('midi_fx1:'+key)??'',performanceSet:(key,value)=>{native.setParam('midi_fx1:'+key,value);}};performanceOwners.set(track,owner);}
    return owner;
}
export const chordEnabled=():boolean=>enabled;
export const chordActive=():boolean=>enabled&&!seqState.sessionMode;
export function chordSnapshot():Setup{return {...setup,slots:setup.slots.map(slot=>({...slot}))};}
export function restoreChord(value:unknown):void{
    setChordEnabled(false);setup=fresh();
    if(value&&typeof value==='object'){
        const input=value as Partial<Setup>;
        for(const key of ['conductor','comp','source','selected'] as const){const number=input[key];if(Number.isInteger(number)&&number!>=0&&number!<=(key==='source'?1:15))setup[key]=number!;}
        if(setup.comp===setup.conductor)setup.comp=setup.conductor===2?3:2;
        setup.slots=setup.slots.map((slot,index)=>{const saved=input.slots?.[index];if(saved&&typeof saved==='object')for(const key of Object.keys(slot) as (keyof Slot)[]){const number=saved[key],limit=key==='quality'||key==='bass'?12:key==='form'?16:key==='policy'?2:key==='scale'?19:11;if(Number.isInteger(number)&&number>=0&&number<=limit&&(key!=='scale'||number>=1))slot[key]=number;}return slot;});
    }
    page=null;route='';
}
export function releaseChordTouches():void{
    for(const [slot,owner] of touches)if(!releasePerformanceTouch(slot,true))owner.knobTouch(slot,false);
    for(const slot of controls)releasePerformanceTouch(slot,true);
    touches.clear();steps.clear();controls.clear();
}
export function setChordEnabled(value:boolean):void{
    if(enabled===value)return;
    releaseChordTouches();send('chord_select','off');enabled=value;activeSlot=-1;route='';
    if(value&&(appState.activeTrack.index===setup.conductor||appState.activeTrack.index===setup.comp))selectTrack([3,1,4].find(track=>track!==setup.conductor&&track!==setup.comp)!);
    if(!value)send('chord_route','off');
    page=null;appState.dirty=true;
}
export function selectChordSlot(index:number):void{
    if(!chordActive()||!engineReady()||!Number.isInteger(index)||index<0||index>=16)return;
    const slot=setup.slots[index];setup.selected=index;activeSlot=index;
    send('chord_select',[setup.conductor,slot.root,slot.quality,slot.form,slot.policy,slot.tonic,slot.scale,slot.bass].join(','));
    markUiStateDirty();appState.dirty=true;
}
const enumeration=(key:string,name:string,options:string[])=>({key,name,type:'enum',options,options_as_string:true,default:options[0]});
const actorPanels=():[string,number,string[]][]=>[
    ['Conductor',setup.conductor,['global_transpose','explicit_key','secondary_scale']],
    ['Comp',setup.comp,['chord_player','chord_forms','arp_player','follower_source','follower_play','rhythm_generate','rhythm_edit','motif_global','motion_operation','motion_timing','motion_conditions']],
    ['Melody',appState.activeTrack.index,['follower_source','follower_play','track_scales','chord_player','arp_player','follower_touch','operations_9_16','motion_operation','motion_timing','motion_conditions']]
];
function parameters(native:any[]):any[]{
    const scale=native.find(parameter=>parameter.key==='key_center_explicit_scale')?.options??['Major','Natural Minor','Dorian','Phrygian','Lydian','Mixolydian','Locrian'];
    return [enumeration('cp_conductor','Conductor Track',Array.from({length:16},(_,index)=>String(index+1))),enumeration('cp_comp','Comp Track',Array.from({length:16},(_,index)=>String(index+1))),enumeration('cp_melody','Playing Track',Array.from({length:16},(_,index)=>String(index+1))),enumeration('cp_source','Comp Input',['Follow Melody','Comp Clip']),enumeration('cp_selected','Edit Slot',Array.from({length:16},(_,index)=>String(index+1))),
        enumeration('cp_root','Root',notes),enumeration('cp_quality','Quality',qualities),enumeration('cp_form','Form',forms),enumeration('cp_policy','Scale Context',['Parent','Minimum Change','Explicit']),enumeration('cp_tonic','Scale Tonic',notes),enumeration('cp_scale','Scale',scale),enumeration('cp_bass','Bass',['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B','Root']),
        ...setup.slots.map((slot,index)=>enumeration('cp_slot_'+index,String(index+1),notes.flatMap(root=>qualities.map(quality=>root+' '+quality))))];
}
function alias(key:string):{track:number;key:string}|null{const match=/cp_track_(\d+)_/.exec(key);return match?{track:Number(match[1]),key:key.replace(match[0],'')}:null;}
export function chordPanelPort(track:number):TrackPort{
    const native=portFor(track);let metadata:any[]=[];
    const getParam=(key:string):string|null=>{
        const target=alias(key);if(target)return portFor(target.track).getParam(target.key);
        const bare=key.replace(/:(base|modulated)$/,'').split(':').pop()??'';
        if(bare==='chain_params'){
            const text=native.getParam(key);if(!text)return text;
            const source=JSON.parse(text);metadata=parameters(source);
            const levels=JSON.parse(native.getParam('midi_fx1:ui_hierarchy')??'{"levels":{}}').levels;
            const aliases=actorPanels().filter(([name])=>name!=='Melody').flatMap(([,owner,panels])=>{
                const keys=new Set(panels.flatMap(panel=>[...(levels[panel]?.knobs??[]),...(levels[panel]?.params??[]).map((item:any)=>item.key).filter(Boolean)]));
                return source.filter((entry:any)=>keys.has(entry.key)).map((entry:any)=>({...entry,key:'cp_track_'+owner+'_'+entry.key}));
            });
            return JSON.stringify([...source,...metadata,...aliases]);
        }
        const meta=metadata.find(entry=>entry.key===bare);
        if(!meta)return native.getParam(key);
        if(key.endsWith(':modulated'))return '0';
        const slot=setup.slots[setup.selected];
        let value=bare==='cp_melody'?appState.activeTrack.index:bare==='cp_conductor'?setup.conductor:bare==='cp_comp'?setup.comp:bare==='cp_source'?setup.source:bare==='cp_selected'?setup.selected:slot[bare.slice(3) as keyof Slot];
        if(bare==='cp_scale')value--;
        if(bare.startsWith('cp_slot_')){const bank=setup.slots[Number(bare.slice(8))];value=bank.root*13+bank.quality;}
        return meta.options[value]??meta.options[0];
    };
    const setParam=(key:string,value:string):boolean=>{
        const target=alias(key);if(target)return portFor(target.track).setParam(target.key,value);
        const bare=key.split(':').pop()??'',meta=metadata.find(entry=>entry.key===bare);
        if(!meta)return native.setParam(key,value);
        const selected=meta.options.indexOf(value);if(selected<0)return false;
        if(['cp_melody','cp_comp','cp_conductor'].includes(bare)){
            const others=bare==='cp_melody'?[setup.conductor,setup.comp]:bare==='cp_comp'?[setup.conductor,appState.activeTrack.index]:[setup.comp,appState.activeTrack.index];
            if(others.includes(selected)){seqToast('Choose distinct tracks');return false;}
            releaseChordTouches();send('chord_select','off');activeSlot=-1;
            if(bare==='cp_melody')selectTrack(selected);else setup[bare==='cp_comp'?'comp':'conductor']=selected;
            page=null;route='';
        }else if(bare==='cp_source'){setup.source=selected;route='';}
        else if(bare==='cp_selected')setup.selected=selected;
        else if(bare.startsWith('cp_slot_')){const index=Number(bare.slice(8));setup.selected=index;setup.slots[index].root=Math.floor(selected/13);setup.slots[index].quality=selected%13;}
        else setup.slots[setup.selected][bare.slice(3) as keyof Slot]=selected+(bare==='cp_scale'?1:0);
        markUiStateDirty();appState.dirty=true;return true;
    };
    return {track:native.track,bulkReads:native.bulkReads,getParam,setParam,
        getMany:(keys,allowFallback)=>{
            const values:(string|null)[]=Array(keys.length).fill(null),groups=new Map<number,{keys:string[];indices:number[]}>();
            keys.forEach((key,index)=>{
                const target=alias(key);
                if(!target&&key.includes(':cp_')){values[index]=getParam(key);return;}
                const owner=target?.track??track,group=groups.get(owner)??{keys:[],indices:[]};
                group.keys.push(target?.key??key);group.indices.push(index);groups.set(owner,group);
            });
            for(const [owner,group] of groups){const read=portFor(owner).getMany(group.keys,allowFallback);group.indices.forEach((index,offset)=>values[index]=read[offset]??null);}
            return values;
        },setMany:pairs=>pairs.every(([key,value])=>setParam(key,value)),
        setParamTimeout:(key,value)=>setParam(key,value),sendMidi:(status,pitch,velocity)=>native.sendMidi(status,pitch,velocity)};
}
export function chordHierarchy(hierarchy:any):any{
    const levels=hierarchy.levels,links:any[]=[];
    const add=(key:string,name:string,knobs:string[]):void=>{levels[key]={name,knobs,params:knobs.map(key=>({key}))};links.push({level:key});};
    add('cp_bank_a','Chords 1-8',Array.from({length:8},(_,index)=>'cp_slot_'+index));
    add('cp_bank_b','Chords 9-16',Array.from({length:8},(_,index)=>'cp_slot_'+(index+8)));
    add('cp_edit','Chord Definition',['cp_selected','cp_root','cp_quality','cp_form','cp_policy','cp_tonic','cp_scale','cp_bass']);
    for(const [name,track,panels] of actorPanels()){
        for(const source of panels){const original=levels[source];if(!original)continue;
            const key='cp_'+name+'_'+source,remap=(key:string)=>name==='Melody'?key:'cp_track_'+track+'_'+key;
            const knobs=(original.knobs??[]).map(remap);
            // Every surfaced control is a live alias into its owner, including defaults.
            levels[key]={...original,name:name+' '+original.name,visible_if:undefined,knobs,params:(original.params??[]).filter((item:any)=>item.key).map((item:any)=>({...item,key:remap(item.key)}))};links.push({level:key});
        }
    }
    levels.root={name:'Chord Play Setup',knobs:['cp_conductor','cp_comp','cp_melody','cp_source','cp_selected'],params:[...['cp_conductor','cp_comp','cp_melody','cp_source','cp_selected'].map(key=>({key})),...links]};
    return hierarchy;
}
export function chordPage():SchwungPage{
    const track=appState.activeTrack.index;
    if(!page||pageTrack!==track){releaseChordTouches();pageTrack=track;page=createSchwungPage(chordPanelPort(track),'midi_fx1',{harmonyMode:3,hierarchy:chordHierarchy});}
    return page;
}
export function tickChord():void{
    if(!chordActive())return;
    const melody=appState.activeTrack.index;
    if(melody===setup.comp||melody===setup.conductor){setChordEnabled(false);seqToast('Choose distinct tracks');return;}
    const next=[melody,setup.comp,setup.source===0?1:0].join(',');
    if(next!==route){send('chord_route',next);route=next;}
    if(!settingsActive()){
        const current=chordPage(),values=()=>JSON.stringify((current.ctl.page?.keys??[]).map((key:string)=>current.ctl.state.values[key]));
        const before=values();if(current.needsTouchPaint)appState.dirty=true;
        current.tick();if(values()!==before)appState.dirty=true;
    }
}
export function chordRecordCommand():string|null{return chordActive()?'jrec '+((1<<setup.conductor)|(1<<appState.activeTrack.index))+' '+(1<<setup.conductor):null;}
export function chordMidi(data:number[],panels=true):boolean{
    const status=data[0]&240,key=data[1],value=data[2],down=status===144&&value>0,up=status===128||(status===144&&!value);
    if(up&&controls.delete(key)){releasePerformanceTouch(key);return true;}
    if(up&&touches.has(key)){touches.get(key)!.knobTouch(key,false);touches.delete(key);return true;}
    if(up&&steps.delete(key))return true;
    if(!chordActive())return false;
    if((down||up)&&key>=16&&key<32&&!seqState.loopMode&&!seqState.trackSelectHold&&!appState.shiftHeld&&!muteHeld()){if(down){steps.add(key);selectChordSlot(key-16);}return true;}
    if(!panels)return false;
    const current=chordPage();
    if((down||up)&&key<8){
        const match=/^cp_slot_(\d+)$/.exec(current.keyAt(key)??'');
        if(match){if(down){steps.add(key);selectChordSlot(Number(match[1]));}return true;}
        const target=alias(current.keyAt(key)??'');
        if(down&&target&&['key_center','parallel_mode','dominant_color','key_center_apply'].includes(target.key)){
            const owner=performanceOwner(target.track);
            if(target.key==='key_center_apply')owner.performanceSet(target.key,'Apply');
            else {controls.add(key);ownPerformanceTouch(key,beginControlTouch(owner,target.key));}
            return true;
        }
        if(down){touches.set(key,current);current.knobTouch(key,true);}return true;
    }
    if(status!==176)return false;
    if(key===14){current.changePage(value<64?value:value-128);appState.dirty=true;return true;}
    if(key>=71&&key<=78){current.knobTurn(key-71,value<64?value:value-128);appState.dirty=true;return true;}
    if(key===MoveMainButton){if(value)current.click(appState.shiftHeld);return true;}
    if(key===51){if(value&&current.back()?.action==='exit')setChordEnabled(false);return true;}
    if(key===86){if(value)recToggle(setup.conductor);return true;}
    return false;
}
export function paintChordSteps():boolean{
    if(!chordActive())return false;
    for(let index=0;index<16;index++)cachedSetAnimLED(16+index,index===activeSlot?127:trackColor(setup.comp),index===activeSlot?127:trackColor(setup.comp),0);
    return true;
}
export function renderChord():void{const current=chordPage();clear_screen();drawHeader(current.pageTitle,'C'+(setup.conductor+1)+' P'+(setup.comp+1)+' M'+(appState.activeTrack.index+1));drawBankBar(current.pageIndex,current.pageCount);current.render('Chord Play');}
