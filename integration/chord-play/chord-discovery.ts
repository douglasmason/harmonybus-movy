import {chordColor, type ChordStatus} from './chord-colors.js';

export type DiscoveryChord={range:number;root:number;quality:number;form:number;policy:number;tonic:number;scale:number;bass:number;intent:number;target:number;enabled:number};
type Probe={status:ChordStatus;notes:number[];voicing:number;inversion:number};
type Candidate={chord:DiscoveryChord;variant:number;relation:string;probe:Probe|null};
type Owner={get:(key:string)=>string|null;set:(key:string,value:string)=>void};
type Host={conductor:()=>number;sound:()=>Owner;source:()=>DiscoveryChord;colorView:()=>number;commit:(chord:DiscoveryChord)=>void;save:(index:number,chord:DiscoveryChord)=>void;changed:()=>void;toast:(text:string)=>void};
const degrees=['I','II','III','IV','V','VI','VII'];
const voicings=['Current','Root','First','Second','Alternate Up','Fifth Low','Root Below'];
const voicingValues=['Close','Root + Fifth Low','Alternate Up','Shell','Root Below'];
const inversionValues=['Auto','Root','First','Second','Third','Fourth','Fifth','Sixth','Played Top Note'];
const wire=(chord:DiscoveryChord):string=>[chord.root,chord.quality,chord.form,chord.policy,chord.tonic,chord.scale,chord.bass,chord.intent,chord.target,chord.range].join(',');

/** Reject incomplete or incompatible native snapshots rather than guessing notes. */
export function parseDiscovery(text:string|null):Probe|null {
    const fields=text?.split('|');if(!fields||fields.length!==5||fields[0]!=='cd1'||!fields[1])return null;
    const values=fields[2].split(',').map(Number),notes=fields[3].split(',').map(Number),config=fields[4].split(',').map(Number);
    const limits=[11,4095,4095,10,11,11,6,1];
    if(values.length!==8||values.some((value,index)=>!Number.isInteger(value)||value<0||value>limits[index])||
       !notes.length||notes.length>12||notes.some(note=>!Number.isInteger(note)||note<0||note>127)||
       config.length!==2||!Number.isInteger(config[0])||config[0]<0||config[0]>4||!Number.isInteger(config[1])||config[1]<0||config[1]>8)return null;
    const [root,mask,scale,kind,target,bass,family,chromatic]=values;
    return {status:{root,mask,scale,kind,target,bass,family,chromatic:!!chromatic,name:fields[1]},notes,voicing:config[0],inversion:config[1]};
}

/** A frozen seven-choice page. Native work happens only on entry or Refresh,
 * one probe per UI tick; normal display painting performs no native reads. */
export class ChordDiscovery {
    private candidates:Candidate[]=[];
    private mode='';
    private cursor=0;
    private selected=-1;
    private preview:{key:number;owner:Owner}|null=null;
    private anchor:DiscoveryChord|null=null;
    private saveArmed=false;
    private saveSlot=0;
    private destination=0;
    constructor(private readonly host:Host){}
    owns(level:string):boolean{return ['cp_discovery','cp_voicings','cp_discovery_actions'].includes(level);}
    reset():void {this.stop();this.candidates=[];this.mode='';this.cursor=0;this.selected=-1;this.anchor=null;this.saveArmed=false;}
    stop(key?:number):boolean {
        if(!this.preview||key!==undefined&&this.preview.key!==key)return false;
        this.preview.owner.set('hb_chord_discovery_audition','off');this.preview=null;this.host.changed();return true;
    }
    refresh(mode=this.mode):void {
        this.stop();this.mode=mode==='cp_voicings'?'cp_voicings':'cp_discovery';this.selected=-1;this.saveArmed=false;
        const source={...(this.anchor??this.host.source())};
        if(this.mode==='cp_voicings')this.candidates=voicings.map((relation,variant)=>({chord:{...source},variant,relation,probe:null}));
        else {
            const target=this.destination,base=source.intent===1?source.target:target;
            const definition=(intent:number,degree:number,relation:string):Candidate=>({chord:{...source,root:0,quality:0,policy:3,bass:12,intent,target:degree,enabled:1},variant:0,relation,probe:null});
            this.candidates=[...([1,3,5].map(offset=>definition(1,(base+offset)%7,'Stay '+degrees[(base+offset)%7]))),
                definition(2,target,'ii/'+degrees[target]),definition(3,target,'V/'+degrees[target]),
                definition(9,0,'Borrow iv'),definition(11,0,'Borrow bVII')];
        }
        this.cursor=0;this.host.changed();
    }
    tick(level:string):void {
        if(!this.owns(level)){this.stop();return;}
        if(level!=='cp_discovery_actions'&&level!==this.mode)this.refresh(level);
        if(this.cursor>=this.candidates.length||this.preview)return;
        const candidate=this.candidates[this.cursor++],owner=this.host.sound();
        candidate.probe=this.probe(owner,candidate);this.host.changed();
    }
    private probe(owner:Owner,candidate:Candidate):Probe|null {
        owner.set('hb_chord_discovery_probe',this.host.conductor()+','+candidate.variant+';'+wire(candidate.chord));
        return parseDiscovery(owner.get('hb_chord_discovery_probe'));
    }
    audition(index:number,key:number):void {
        const candidate=this.candidates[index];if(!candidate||!candidate.probe){this.host.toast('Wait for candidates');return;}
        this.stop();const owner=this.host.sound();candidate.probe=this.probe(owner,candidate);
        if(!candidate.probe){this.host.toast('Update HarmonyBus');return;}
        this.selected=index;this.saveArmed=false;owner.set('hb_chord_discovery_audition','on');this.preview={key,owner};
        this.host.toast(candidate.probe.status.name+' / '+candidate.relation);this.host.changed();
    }
    keep():void {
        const candidate=this.candidates[this.selected];if(!candidate?.probe){this.host.toast('Audition a choice first');return;}
        this.stop();
        if(this.mode==='cp_voicings'){
            const owner=this.host.sound();owner.set('chord_voicing',voicingValues[candidate.probe.voicing]);owner.set('chord_inversion',inversionValues[candidate.probe.inversion]);
            this.host.toast('Kept sound voicing');
        }else {this.anchor={...candidate.chord};this.host.commit(candidate.chord);this.host.toast('Kept '+candidate.probe.status.name);}
        this.saveArmed=false;this.host.changed();
    }
    save():void {
        const candidate=this.candidates[this.selected];
        if(this.mode==='cp_voicings'){this.host.toast('Keep applies sound voicing');return;}
        if(!candidate?.probe){this.host.toast('Audition a choice first');return;}
        if(!this.saveArmed){this.saveArmed=true;this.host.toast('Tap Save again: slot '+(this.saveSlot+1));this.host.changed();return;}
        this.host.save(this.saveSlot,{...candidate.chord});this.saveArmed=false;this.host.toast('Saved chord '+(this.saveSlot+1));this.host.changed();
    }
    action(key:string):boolean {
        if(key==='cp_discovery_keep')this.keep();else if(key==='cp_discovery_save')this.save();
        else if(key==='cp_discovery_refresh')this.refresh();
        else if(key==='cp_discovery_source'){this.anchor=null;this.refresh();}
        else return false;return true;
    }
    read(key:string):string|null {
        if(key==='cp_discovery_target')return degrees[this.destination];
        if(key==='cp_discovery_save_slot')return String(this.saveSlot+1);
        if(key==='cp_discovery_keep')return 'Tap Keep';
        if(key==='cp_discovery_save')return this.saveArmed?'Confirm '+(this.saveSlot+1):'Save to '+(this.saveSlot+1);
        if(key==='cp_discovery_refresh')return 'Tap Refresh';
        if(key==='cp_discovery_source')return 'Use Edit Chord';
        if(key==='cp_discovery_picked')return this.candidates[this.selected]?.probe?.status.name??'Audition first';
        const match=/^cp_(?:discovery|voicing)_choice_(\d)$/.exec(key);if(!match)return null;
        return this.candidates[Number(match[1])]?.probe?.status.name??(this.cursor<7?'Loading':'Unavailable');
    }
    write(key:string,value:string):boolean|null {
        if(key==='cp_discovery_target'){const index=degrees.indexOf(value);if(index<0)return false;this.destination=index;this.refresh('cp_discovery');return true;}
        if(key==='cp_discovery_save_slot'){const index=Number(value)-1;if(!Number.isInteger(index)||index<0||index>20)return false;this.saveSlot=index;this.saveArmed=false;return true;}
        return key.startsWith('cp_discovery_')?false:null;
    }
    color(index:number):number {const candidate=this.candidates[index];return candidate?.probe?chordColor(candidate.probe.status,candidate.chord.intent,this.host.colorView(),this.preview!==null&&this.selected===index,true):0;}
    label(index:number):string {return this.candidates[index]?.relation??String(index+1);}
    ready():boolean {return this.candidates.some(candidate=>candidate.probe!==null);}
    footer():string {return this.cursor<7?'Preparing '+this.cursor+'/7':this.ready()?'9:Keep 10:Save 11:New':'Needs newer HarmonyBus';}
}

export function discoveryParameters():any[] {
    return [...['discovery','voicing'].flatMap(mode=>Array.from({length:7},(_,index)=>({key:'cp_'+mode+'_choice_'+index,name:'Choice '+(index+1),type:'string',readOnly:true}))),
        ...[['keep','Keep Choice'],['save','Save Choice'],['refresh','Refresh Choices'],['source','Use Edit Chord'],['picked','Chosen Chord']].map(([key,name])=>({key:'cp_discovery_'+key,name,type:'string',readOnly:true})),
        {key:'cp_discovery_target',name:'Lead To Degree',type:'enum',options:degrees,options_as_string:true},
        {key:'cp_discovery_save_slot',name:'Save To Chord',type:'enum',options:Array.from({length:21},(_,index)=>String(index+1)),options_as_string:true}];
}
