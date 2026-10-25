import { preparePart,partModalTouch,partModalActive,cancelPartReview,drawPartReview } from './part-library.js';
import {partParameters,partRead,partWrite,partChoiceFor,partKind,partNativeKey} from './part-controls.js';
import {groupOpen} from '../undo/group.js';
import {undoableEdit} from '../undo/edit.js';
import {recordParamOp,recordUiOp} from '../undo/record.js';
import { returnPreviousInputView } from './router-buttons.js';
import { sharedPanel } from './shared-panel.js';
const followPanel=sharedPanel();
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
import { resetKnobLedCache } from '../renderer/knob-leds.js';
import { chordColor, chordIntents, chordDegrees, intentLabel, parseChordBank, matchesHarmony, type ChordBankStatus } from './chord-colors.js';
import { muteHeld } from './router-buttons.js';
import { seqToast } from './render.js';
import { recToggle } from '../undo/rec-pass.js';
import { settingsActive } from './hb-settings.js';

const send=(key:string,value:string):void=>{if(engineReady())fieldEngineSet(key,value);};
const notes=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const qualities=['Auto','Major','Minor','Dim','Aug','Maj7','Dom7','Min7','Half Dim7','Dim7','MinMaj7','AugMaj7','Dom7b5'];
const forms=['Auto','Power','Triad','Seventh','Ninth','Add9','Sixth','6/9','Eleventh','Thirteenth','Sus2','Sus4','Shell 7','Shell 9','Shell 6/9','Rootless 7','Rootless 9'];
// Shared HB scale indices, presented through the native parameter metadata below.
type Slot={root:number;quality:number;form:number;policy:number;tonic:number;scale:number;bass:number;intent:number;target:number;enabled:number};
type Setup={directRender:string|null;conductor:number;comp:number;bass:number;bassClip:boolean;source:number;selected:number;colorView:number;slots:Slot[]};
const defaultSlots=():Slot[]=>Array.from({length:21},(_,index)=>({root:0,quality:0,form:0,policy:index>=14?1:3,tonic:0,scale:1,bass:12,intent:index<7?1:index<14?12:13,target:index%7,enabled:1}));
const fresh=():Setup=>({directRender:null,conductor:0,comp:2,bass:1,bassClip:false,source:0,selected:0,colorView:0,slots:defaultSlots()});
let setup=fresh(),enabled=false,page:SchwungPage|null=null,pageTrack=-1,activeSlot=-1,route='';
let conductorRenders=false;
let bankStatus:ChordBankStatus|null=null,bankWire='',bankOwner=-1,bankPollAt=-Infinity,bankKnobs=false,bankPageDirty=false,bankUrgentUntil=-Infinity;
const slotPayload=(slot:Slot):string=>[slot.root,slot.quality,slot.form,slot.policy,slot.tonic,slot.scale,slot.bass,slot.intent,slot.target].join(',');
function resetBank():void{conductorRenders=false;bankStatus=null;bankWire='';bankOwner=-1;bankPollAt=-Infinity;bankUrgentUntil=-Infinity;bankPageDirty=false;}
function refreshBank():void{
    const now=Date.now(),wire=setup.slots.map(slotPayload).join(';'),owner=setup.conductor;
    const changed=wire!==bankWire||owner!==bankOwner;
    if(!changed&&now>=bankPollAt&&now-bankPollAt<(now<bankUrgentUntil?16:seqState.playing?50:250))return;
    bankPollAt=now;const port=portFor(owner);
    const output=port.getParam('midi_fx1:render_channel');conductorRenders=!!output&&output!=='Off'&&output!=='--';
    if(changed){port.setParam('midi_fx1:hb_chord_bank',wire);bankWire=wire;bankOwner=owner;}
    const raw=port.getParam('midi_fx1:hb_chord_bank_snapshot');if(raw==='--'){bankStatus=null;activeSlot=-1;return;}
    const next=parseChordBank(raw);
    if(next&&JSON.stringify(next)!==JSON.stringify(bankStatus)){bankStatus=next;appState.dirty=true;}
}
export function chordSlotColor(index:number):number{
    const slot=setup.slots[index],status=bankStatus?.slots[index];
    const matching=bankStatus?setup.slots.findIndex((candidate,other)=>candidate.enabled&&matchesHarmony(bankStatus!.slots[other],bankStatus!.active)):-1;
    const selected=bankStatus?(setup.slots[activeSlot]?.enabled&&matchesHarmony(bankStatus.slots[activeSlot],bankStatus.active)?activeSlot:matching):-1;
    return chordColor(status,slot.intent,setup.colorView,index===selected,!!slot.enabled);
}
let styleTouch:{key:number;control:string;moved:boolean}|null=null;
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
        if(typeof input.directRender==='string'&&/^(Off|[1-9]|1[0-6])$/.test(input.directRender))setup.directRender=input.directRender;
        for(const key of ['conductor','comp','bass','source','selected','colorView'] as const){const number=input[key];if(Number.isInteger(number)&&number!>=0&&number!<=(key==='source'?2:key==='colorView'?2:key==='selected'?20:15))setup[key]=number!;}
        setup.bassClip=input.bassClip===true;
        if(setup.comp===setup.conductor)setup.comp=setup.conductor===2?3:2;
        if([setup.conductor,setup.comp].includes(setup.bass))setup.bass=Array.from({length:16},(_,index)=>index).find(track=>![setup.conductor,setup.comp].includes(track))!;
        setup.slots=setup.slots.map((slot,index)=>{const saved=input.slots?.[index];if(saved&&typeof saved==='object'&&saved.intent===undefined){slot.intent=0;slot.target=0;}if(saved&&typeof saved==='object')for(const key of Object.keys(slot) as (keyof Slot)[]){const number=saved[key],limit=key==='quality'||key==='bass'?12:key==='form'?16:key==='policy'?3:key==='scale'?19:key==='target'?6:key==='enabled'?1:key==='intent'?13:11;if(Number.isInteger(number)&&number>=0&&number<=limit&&(key!=='scale'||number>=1))slot[key]=number;}return slot;});
    }
    page=null;route='';resetBank();
}
export function releaseChordTouches():void{
    cancelPartReview();styleTouch=null;
    for(const [slot,owner] of touches)if(!releasePerformanceTouch(slot,true))owner.knobTouch(slot,false);
    for(const slot of controls)releasePerformanceTouch(slot,true);
    touches.clear();steps.clear();controls.clear();
}
export function setChordEnabled(value:boolean):void{
    if(enabled===value)return;
    releaseChordTouches();resetBank();resetKnobLedCache();if(!value&&bankKnobs){for(let knob=0;knob<8;knob++){cachedSetAnimLED(knob,0,0,0);cachedSetAnimLED(71+knob,0,0,0,true);}bankKnobs=false;}send('chord_select','off');enabled=value;activeSlot=-1;route='';
    if(value&&[setup.conductor,setup.comp,setup.bass].includes(appState.activeTrack.index))selectTrack(Array.from({length:16},(_,index)=>(index+3)%16).find(track=>![setup.conductor,setup.comp,setup.bass].includes(track))!);
    if(!value)send('chord_route','off');
    page=null;appState.dirty=true;
}
export function selectChordSlot(index:number):void{
    if(!chordActive()||!engineReady()||!Number.isInteger(index)||index<0||index>=setup.slots.length)return;
    const slot=setup.slots[index];if(!slot.enabled)return;setup.selected=index;activeSlot=index;
    send('chord_select',[setup.conductor,slot.root,slot.quality,slot.form,slot.policy,slot.tonic,slot.scale,slot.bass,...(slot.intent?[slot.intent,slot.target]:[])].join(','));
    bankPollAt=-Infinity;bankUrgentUntil=Date.now()+100; // Refresh accepted harmony on the next frame, not after the idle poll interval.
    markUiStateDirty();appState.dirty=true;
}
const enumeration=(key:string,name:string,options:string[])=>({key,name,type:'enum',options,options_as_string:true,default:options[0]});
const actorPanels=():[string,number,string[]][]=>[
    ['Conductor',setup.conductor,['global_transpose','explicit_key','secondary_scale','chord_player','chord_forms','arp_player','rhythm_generate','rhythm_edit']],
    ['Comp',setup.comp,['chord_player','chord_forms','arp_player','follower_source','follower_play','rhythm_generate','rhythm_edit','motif_global','motion_operation','motion_timing','motion_conditions']],
    ['Melody',appState.activeTrack.index,['follower_source','follower_play','track_scales','chord_player','arp_player','follower_touch','operations_9_16','motion_operation','motion_timing','motion_conditions']]
];
function parameters(native:any[]):any[]{
    const scale=native.find(parameter=>parameter.key==='key_center_explicit_scale')?.options??['Major','Natural Minor','Dorian','Phrygian','Lydian','Mixolydian','Locrian'];
    return [...partParameters(native),...Array.from({length:7},(_,index)=>({key:'cp_blank_'+index,name:' ',type:'string',readOnly:true})),{key:'cp_off',name:'Harmony Off',type:'string',readOnly:true},{key:'cp_reset',name:'Reset Chords',type:'string',readOnly:true},enumeration('cp_conductor','Conductor Track',Array.from({length:16},(_,index)=>String(index+1))),enumeration('cp_bass_track','Bass Track',Array.from({length:16},(_,index)=>String(index+1))),enumeration('cp_bass_source','Bass Input',['Existing Routing','Bass Clip']),enumeration('cp_comp','Comp Track',Array.from({length:16},(_,index)=>String(index+1))),enumeration('cp_melody','Playing Track',Array.from({length:16},(_,index)=>String(index+1))),enumeration('cp_source','Comp Input',['Conductor / Melody','Comp Clip','Follow Melody']),enumeration('cp_selected','Edit Chord',Array.from({length:21},(_,index)=>String(index+1))),enumeration('cp_colorView','Color By',['Quality + Scale','Intent + Scale','Scale Only']),enumeration('cp_intent','Chord Intent',chordIntents),enumeration('cp_target','Target Degree',chordDegrees),enumeration('cp_enabled','Chord Enabled',['Off','On']),{key:'cp_resolved',name:'Resolved Chord',type:'string',readOnly:true},{key:'cp_relation',name:'Scale Relation',type:'string',readOnly:true},
        enumeration('cp_root','Literal Root',notes),enumeration('cp_quality','Quality',qualities),enumeration('cp_form','Form',forms),enumeration('cp_policy','Scale Context',['Parent','Minimum Change','Explicit','Harmony Rules']),enumeration('cp_tonic','Scale Tonic',notes),enumeration('cp_scale','Scale',scale),enumeration('cp_bass','Bass',['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B','Root']),
        ...setup.slots.map((slot,index)=>enumeration('cp_slot_'+index,String(index+1),slot.intent?chordDegrees.map((_,degree)=>intentLabel(slot.intent,degree)):notes.flatMap(root=>qualities.map(quality=>root+' '+quality))))];
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
                const keys=new Set(['key_center','parallel_mode','dominant_color',...panels.flatMap(panel=>[...(levels[panel]?.knobs??[]),...(levels[panel]?.params??[]).map((item:any)=>item.key).filter(Boolean)])]);
                return source.filter((entry:any)=>keys.has(entry.key)).map((entry:any)=>({...entry,key:'cp_track_'+owner+'_'+entry.key}));
            });
            return JSON.stringify([...source,...metadata,...aliases]);
        }
        const meta=metadata.find(entry=>entry.key===bare);
        if(!meta)return native.getParam(key);
        if(key.endsWith(':modulated'))return '0';
        const slot=setup.slots[setup.selected];
        if(bare.startsWith('cp_blank_'))return '';
        if(bare==='cp_off')return 'OFF';
        const partValue=partRead(bare,partOwner(bare));if(partValue!==null)return partValue;
        if(bare==='cp_reset')return 'RESET';
        if(bare==='cp_resolved')return bankStatus?.slots[setup.selected]?.name??'--';
        if(bare==='cp_relation')return !slot.enabled?'Off':bankStatus?(bankStatus.slots[setup.selected]?.chromatic?'Chromatic':'Diatonic'):'--';
        let value=bare==='cp_colorView'?setup.colorView:bare==='cp_melody'?appState.activeTrack.index:bare==='cp_conductor'?setup.conductor:bare==='cp_comp'?setup.comp:bare==='cp_bass_track'?setup.bass:bare==='cp_bass_source'?Number(setup.bassClip):bare==='cp_source'?setup.source:bare==='cp_selected'?setup.selected:slot[bare.slice(3) as keyof Slot];
        if(bare==='cp_scale')value--;
        if(bare.startsWith('cp_slot_')){const bank=setup.slots[Number(bare.slice(8))];value=bank.intent?bank.target:bank.root*13+bank.quality;}
        return meta.options[value]??meta.options[0];
    };
    const setParam=(key:string,value:string):boolean=>{
        const target=alias(key);if(target)return portFor(target.track).setParam(target.key,value);
        const bare=key.split(':').pop()??'';const partResult=partWrite(bare,value,partOwner(bare));if(partResult!==null)return partResult;
        const meta=metadata.find(entry=>entry.key===bare);
        if(!meta)return native.setParam(key,value);
        if(!meta.options)return false;
        const selected=meta.options.indexOf(value);if(selected<0)return false;
        if(['cp_melody','cp_comp','cp_conductor','cp_bass_track'].includes(bare)){
            const assignments={cp_melody:appState.activeTrack.index,cp_comp:setup.comp,cp_conductor:setup.conductor,cp_bass_track:setup.bass};
            const others=Object.entries(assignments).filter(([key])=>key!==bare).map(([,track])=>track);
            if(others.includes(selected)){seqToast('Choose distinct tracks');return false;}
            releaseChordTouches();send('chord_select','off');activeSlot=-1;
            if(bare==='cp_melody')selectTrack(selected);else setup[bare==='cp_comp'?'comp':bare==='cp_bass_track'?'bass':'conductor']=selected;
            page=null;route='';
        }else if(bare==='cp_bass_source'){setChordBassClip(selected===1);}
        else if(bare==='cp_source'){setChordCompSource(selected);}
        else if(bare==='cp_selected')setup.selected=selected;
        else if(bare==='cp_colorView')setup.colorView=selected;
        else if(bare==='cp_intent'){const slot=setup.slots[setup.selected];slot.intent=selected;if(selected){slot.quality=0;slot.policy=3;}bankPageDirty=true;}
        else if(bare.startsWith('cp_slot_')){const index=Number(bare.slice(8));setup.selected=index;if(setup.slots[index].intent)setup.slots[index].target=selected;else{setup.slots[index].root=Math.floor(selected/13);setup.slots[index].quality=selected%13;}}
        else setup.slots[setup.selected][bare.slice(3) as keyof Slot]=selected+(bare==='cp_scale'?1:0);
        markUiStateDirty();appState.dirty=true;return true;
    };
    return {track:native.track,bulkReads:native.bulkReads,getParam,setParam,
        getMany:(keys,allowFallback)=>{
            const values:(string|null)[]=Array(keys.length).fill(null),groups=new Map<number,{keys:string[];indices:number[]}>();
            keys.forEach((key,index)=>{
                const bare=key.replace(/:(base|modulated)$/,'').split(':').pop()??'';
                const partKey=partNativeKey(bare);
                const target=alias(key)??(partKey?{track:partOwner(bare),key:'midi_fx1:'+partKey+(key.endsWith(':base')?':base':key.endsWith(':modulated')?':modulated':'')}:null);
                if(!target&&/:(cp|bp)_/.test(key)){values[index]=getParam(key);return;}
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
    add('cp_comp_library','Comp Library',['cp_style','cp_load','cp_save','cp_user','cp_mapping','cp_gate','cp_register']);
    add('cp_bass_library','Bass Library',['bp_style','bp_velocity','bp_gate','bp_register','bp_mapping','bp_user','bp_save']);
    add('cp_setup','Chord Play Setup',['cp_conductor','cp_comp','cp_melody','cp_colorView','cp_reset','cp_bass_track','cp_bass_source']);
    for(let bank=0;bank<3;bank++)add('cp_bank_'+bank,['Home Chords','Parallel Chords','Blues Dominants'][bank],[...Array.from({length:7},(_,index)=>'cp_slot_'+(bank*7+index)),'cp_off']);
    add('cp_scale_controls','Scale Operations',['cp_track_'+setup.conductor+'_key_center','cp_track_'+setup.conductor+'_parallel_mode','cp_track_'+setup.conductor+'_dominant_color']);
    add('cp_edit','Chord Editor',['cp_selected','cp_intent','cp_target','cp_root','cp_quality','cp_form','cp_bass']);
    add('cp_edit_scale','Chord Scale Context',['cp_policy','cp_tonic','cp_scale','cp_enabled','cp_resolved','cp_relation']);
    for(const [name,track,panels] of actorPanels()){
        for(const source of panels){const original=levels[source];if(!original)continue;
            const key='cp_'+name+'_'+source,remap=(key:string)=>name==='Melody'?key:'cp_track_'+track+'_'+key;
            const knobs=(original.knobs??[]).map(remap);
            // Every surfaced control is a live alias into its owner, including defaults.
            levels[key]={...original,name:name+' '+original.name,visible_if:undefined,knobs,params:(original.params??[]).filter((item:any)=>item.key).map((item:any)=>({...item,key:remap(item.key)}))};links.push({level:key});
        }
    }
    levels.root={name:'Chord Play',knobs:['cp_source','cp_style','cp_velocity','cp_gate','cp_form_live','cp_voicing_live','cp_register','cp_off'],params:[...['cp_source','cp_style','cp_velocity','cp_gate','cp_form_live','cp_voicing_live','cp_register','cp_off'].map(key=>({key})),...links]};
    // Reserve the same physical stop control on every page, retaining displaced settings.
    for(const link of [...links]){
        const level=levels[link.level],knobs=level.knobs??[];
        if(knobs[7]&&knobs[7]!=='cp_off'){
            const overflow=link.level+'_more';levels[overflow]={name:level.name+' More',knobs:[knobs[7],...Array.from({length:6},(_,index)=>'cp_blank_'+index),'cp_off'],params:[{key:knobs[7]},{key:'cp_off'}]};
            links.push({level:overflow});levels.root.params.push({level:overflow});
        }
        level.knobs=[...knobs.slice(0,7),...Array.from({length:Math.max(0,7-knobs.length)},(_,index)=>'cp_blank_'+index),'cp_off'];
        level.params=level.knobs.map((key:string)=>({key}));
    }
    const retained=new Set(['root',...links.map(link=>link.level)]);
    for(const key of Object.keys(levels))if(!retained.has(key))delete levels[key];
    return hierarchy;
}
export function chordPage():SchwungPage{
    const track=appState.activeTrack.index;
    if(!page||pageTrack!==track){releaseChordTouches();pageTrack=track;page=createSchwungPage(chordPanelPort(track),'midi_fx1',{harmonyMode:3,hierarchy:chordHierarchy});}
    return followPanel(page);
}
export function tickChord():void{
    if(!chordActive())return;
    const melody=appState.activeTrack.index;
    if(melody===setup.comp||melody===setup.conductor||melody===setup.bass){setChordEnabled(false);seqToast('Choose distinct tracks');return;}
    refreshBank();
    const followMelody=setup.source===2||(setup.source===0&&!conductorRenders);
    const next=[melody,setup.comp,followMelody?1:setup.source===0&&conductorRenders?2:0].join(',')+(setup.bassClip?','+setup.bass:'');
    if(next!==route){send('chord_route',next);route=next;}
    if(bankPageDirty&&!touches.size&&!controls.size){const index=page?.pageIndex??0;page=null;chordPage().goToPage(index);bankPageDirty=false;}
    if(page&&bankStatus)for(let index=0;index<setup.slots.length;index++){const meta=page.ctl.state.metaIndex.get('cp_slot_'+index);if(meta&&bankStatus.slots[index]){meta.label=meta.name=(index+1)+' '+bankStatus.slots[index].name;meta.short_name=meta.name;}}
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
    if(up&&touches.has(key)){
        touches.get(key)!.knobTouch(key,false);touches.delete(key);
        if(styleTouch?.key===key){const load=!styleTouch.moved,styleTouchKey=styleTouch.control;styleTouch=null;if(load){reviewStyle(styleTouchKey);partModalTouch(key,true);partModalTouch(key,false);}}
        return true;
    }
    if(up&&steps.delete(key))return true;
    if(!chordActive())return false;
    if((down||up)&&key>=16&&key<32&&!seqState.loopMode&&!seqState.trackSelectHold&&!appState.shiftHeld&&!muteHeld()){if(down){steps.add(key);const index=stepSlot(key-16);if(index<0)harmonyOff();else selectChordSlot(index);}return true;}
    if(!panels)return false;
    const current=chordPage();
    if((down||up)&&key<8&&partModalTouch(key,down)){if(key===7&&down)harmonyOff();return true;}
    if(partModalActive()&&status===176){if(key===51&&value)cancelPartReview();return true;}
    if((down||up)&&key<8){
        if(key===7){if(down){steps.add(key);harmonyOff();}return true;}
        if(current.ctl.hbNavigation?.isMenu())return true;
        if(/^(cp|bp)_(load|save)$/.test(current.keyAt(key)??'')){
            if(down){reviewStyle(current.keyAt(key)!);partModalTouch(key,true);}return true;
        }
        if(current.keyAt(key)==='cp_reset'){if(down){steps.add(key);resetChordDefaults();}return true;}
        const match=/^cp_slot_(\d+)$/.exec(current.keyAt(key)??'');
        if(match){if(down){steps.add(key);selectChordSlot(Number(match[1]));}return true;}
        const target=alias(current.keyAt(key)??'');
        if(down&&target&&['key_center','parallel_mode','dominant_color','key_center_apply'].includes(target.key)){
            const owner=performanceOwner(target.track);
            if(target.key==='key_center_apply')owner.performanceSet(target.key,'Apply');
            else {controls.add(key);ownPerformanceTouch(key,beginControlTouch(owner,target.key));}
            return true;
        }
        if(down&&/^(cp|bp)_style$/.test(current.keyAt(key)??''))styleTouch={key,control:current.keyAt(key)!,moved:false};
        if(down){touches.set(key,current);current.knobTouch(key,true);}return true;
    }
    if(status!==176)return false;
    if(key===14){current.changePage(value<64?value:value-128);appState.dirty=true;return true;}
    if(key===78)return true;
    if(key>=71&&key<=77){if(styleTouch?.key===key-71)styleTouch.moved=true;current.knobTurn(key-71,value<64?value:value-128);appState.dirty=true;return true;}
    if(key===MoveMainButton){if(value)current.click(appState.shiftHeld);return true;}
    if(key===51){if(value&&current.back()?.action==='exit')returnPreviousInputView();return true;}
    if(key===86){if(value)recToggle(setup.conductor);return true;}
    return false;
}
/** Bank LEDs belong to the chord painter, not the generic parameter meter. */
export function chordKnobLEDMask():number{
    if(!chordActive()||settingsActive()||!page)return 0;
    let mask=0;for(let knob=0;knob<8;knob++)if(knob===7||/^cp_slot_/.test(page.keyAt(knob)??''))mask|=1<<knob;
    return mask;
}
export function paintChordSteps():boolean{
    if(!chordActive())return false;
    for(let index=0;index<16;index++){const slot=stepSlot(index),color=slot<0?123:chordSlotColor(slot);cachedSetAnimLED(16+index,color,color,0);}
    const current=!settingsActive()?page:null;
    const keys=Array.from({length:8},(_,knob)=>current?.keyAt(knob)??null),onBank=keys.some(key=>/^cp_slot_/.test(key??''));
    if(onBank){
        for(let knob=0;knob<8;knob++){const index=knob===7?-1:Number(keys[knob]!.slice(8)),color=index<0?123:chordSlotColor(index);cachedSetAnimLED(knob,color,color,0);cachedSetAnimLED(71+knob,color,color,0,true);}
    }else if(bankKnobs){
        for(let knob=0;knob<8;knob++)if(!current||!(current.knobLEDMask&(1<<knob))){const color=keys[knob]?123:0;cachedSetAnimLED(knob,color,color,0);cachedSetAnimLED(71+knob,color,color,0,true);}
    }
    cachedSetAnimLED(7,123,123,0);cachedSetAnimLED(78,123,123,0,true);
    bankKnobs=onBank;
    return true;
}
export function renderChord():void{if(drawPartReview())return;const current=chordPage();clear_screen();drawHeader(current.pageTitle,'C'+(setup.conductor+1)+' P'+(setup.comp+1)+' M'+(appState.activeTrack.index+1));drawBankBar(current.pageIndex,current.pageCount);current.render('Chord Play');}

/** Reset shared definitions only; routing and the selected melody track remain intact. */
export function resetChordDefaults():void{
    harmonyOff();setup.slots=defaultSlots();setup.selected=0;bankPageDirty=true;resetBank();
    markUiStateDirty();appState.dirty=true;seqToast('Chord defaults restored');
}
export function harmonyOff():void{
    send('chord_select','off');activeSlot=-1;bankPollAt=-Infinity;bankUrgentUntil=Date.now()+100;appState.dirty=true;
}
function stepSlot(index:number):number{
    if(index%8===7)return -1;
    const keys=page?.ctl.page?.keys??[],first=keys.find((key:string|null)=>/^cp_slot_/.test(key??''));
    const bank=first?Math.floor(Number(first.slice(8))/7):0;
    return ((bank+Math.floor(index/8))%3)*7+index%8;
}

function reviewStyle(key:string):void{
    const kind=partKind(key),choice=partChoiceFor(kind);
    preparePart({kind,track:kind==='bass'?setup.bass:setup.comp,conductor:setup.conductor,activate:()=>kind==='bass'?setChordBassClip(true):setChordCompSource(1)},choice.style,key.endsWith('_save')?choice.user:null);
}
function partOwner(key:string):number{return key.startsWith('bp_')?setup.bass:['cp_velocity','cp_form_live','cp_voicing_live'].includes(key)&&setup.source===0&&conductorRenders?setup.conductor:setup.comp;}
export function chordCompState():string{return JSON.stringify({source:setup.source,directRender:setup.directRender,bassClip:setup.bassClip});}
export function restoreChordCompState(value:string):void{
    try {const state=JSON.parse(value);if(Number.isInteger(state.source)&&state.source>=0&&state.source<3){setup.source=state.source;setup.bassClip=state.bassClip===true;setup.directRender=typeof state.directRender==='string'?state.directRender:null;route='';markUiStateDirty();}}catch{}
}
export function setChordCompSource(source:number):void{
    const change=():void=>{
        const before=chordCompState(),port=portFor(setup.conductor),key='midi_fx1:render_channel',old=port.getParam(key);
        if(old===null||old==='--')return;
        if(source!==0&&old!=='Off')setup.directRender=old;
        const next=source===0?(setup.directRender??old):'Off';
        if(next!==old){recordParamOp(setup.conductor,key,old,next);port.setParam(key,next);}
        setup.source=source;route='';bankPollAt=-Infinity;
        recordUiOp('chordComp',before,chordCompState());markUiStateDirty();appState.dirty=true;
    };
    if(groupOpen())change();else undoableEdit('COMP INPUT','Chord Play',change);
}

/** Bass clip ownership is local to Chord Play and undone with its loaded clip. */
export function setChordBassClip(value:boolean):void{
    const change=():void=>{
        const before=chordCompState();setup.bassClip=value;route='';
        recordUiOp('chordComp',before,chordCompState());markUiStateDirty();appState.dirty=true;
    };
    if(groupOpen())change();else undoableEdit('BASS INPUT','Chord Play',change);
}
