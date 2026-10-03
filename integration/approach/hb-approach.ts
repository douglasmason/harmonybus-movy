import type { PerformancePort } from './hb-performance.js';
import { cachedNamedControlStatus } from './hb-performance.js';
import { fontPrint, fontWidth } from '../font/index.js';
import { keyboardState } from '../keyboard/state.js';
import { appState } from '../app/state.js';
import { cachedSetAnimLED } from '../seq/led-cache.js';
import { ANIM_NONE, ANIM_PULSE_SLOW } from '../seq/colors.js';
import { seqToast } from '../seq/render.js';
export const APPROACH_CHOICES = ['Secondary V','Secondary II','Connector Below','Connector Above','Leading Tone','Tritone Sub','Backdoor V','Backdoor II','Tritone II','Secondary VI','Secondary III','Secondary IV','Secondary VII','Upper Dim',...Array.from({length:16},(_,index)=>'Motif '+(index+1))];
export const APPROACH_MOTIFS = ['V-Target','ii-V-Target','iv-bVII-Target','bII7-Target','ii-bII7-Target','bVI-bVII-I','bVI-V-I','bIII-IV-I','vi-V-I','iii-vi-ii-V-I','IV-iv-I','ii halfdim-V-i','I-VI7-ii-V-I','V/V-V-I','ii/V-V/V-V-I','V/ii-ii-V-I','V/vi-vi-ii-V-I','vii dim/V-V-I','III7-VI7-II7-V7-I',...Array.from({length:16},(_,index)=>'User '+(index+1))];
export const TRIPLE_MOTIFS=['vi-ii-V','ii-V-LT','iv-bVII-LT','ii-bII7-LT','iii-vi-ii','IV-ii-V','vii-iii-vi','LT-ii-V'];
export const BANK_CHOICES=[...APPROACH_CHOICES.filter(name=>!name.startsWith('Motif ')),...APPROACH_MOTIFS.map((name,index)=>index<19?'Stock: '+name:name),...TRIPLE_MOTIFS.map(name=>'Stock: '+name)];
/** Only the two dedicated approach layouts turn bank knobs into row selectors. */
export function approachRowsActive(): boolean { return keyboardState.layout===2||keyboardState.layout===3; }
export const APPROACH_BANK_DEFAULTS=['Secondary V','Secondary II','Connector Below','Connector Above','Leading Tone','Tritone Sub','Backdoor V','Upper Dim','Stock: ii-V-Target','Stock: iv-bVII-Target','Stock: ii-bII7-Target','Stock: vi-ii-V','Stock: ii-V-LT','Stock: V/V-V-I','Stock: iii-vi-ii-V-I','Stock: ii/V-V/V-V-I'];
let owner: PerformancePort | null = null;
let keyCenterLabel='';
let chordArpStatus='Off',motifLatchStatus='Off',keyCenterStatus='Off',parallelStatus='Off';
export const PARALLEL_SCALES=["Major", "Natural Minor", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Locrian", "Harmonic Minor", "Melodic Minor", "Dorian b2", "Lydian Augmented", "Lydian Dominant", "Mixolydian b6", "Locrian #2", "Altered", "Whole Tone", "Augmented", "Relative Major/Minor"];
const releases = new Map<number,()=>void>();
let statusAt = -Infinity, status: number[] = [];
let rowView: string[] = [], lastRowView = '', rowRevealUntil = 0;
let sequenceView='';
function refreshRows(port: PerformancePort): void {
    const now=Date.now();
    if(now>=statusAt&&now-statusAt<50)return;
    const next=port.performanceGet('approach_row_status').split(',').map(Number);
    if(next.join(',')!==status.join(','))appState.dirty=true;
    status=next;statusAt=now;
    const keyView=port.performanceGet('key_center_view').split('|');
    const center=keyView.length>=2?keyView[0]:(port.performanceGet('key_center')||'Off'),parallel=port.performanceGet('parallel_mode')||'Off';
    const label=keyView.length>=2?(keyView[2]||keyView[1]):center;
    if(label!==keyCenterLabel){keyCenterLabel=label;appState.dirty=true;}
    if(center!==keyCenterStatus||parallel!==parallelStatus){keyCenterStatus=center;parallelStatus=parallel;appState.dirty=true;}
    const latch=port.performanceGet('approach_motif_latch')||'Off';
    if(latch!==motifLatchStatus){motifLatchStatus=latch;appState.dirty=true;}
    const sequence=port.performanceGet('approach_sequence_view');
    if(sequence!==sequenceView){sequenceView=sequence;appState.dirty=true;}
    const view=port.performanceGet('approach_rows_view');
    if(view!==lastRowView){lastRowView=view;rowView=view.split('|');rowRevealUntil=now+1800;appState.dirty=true;}
}
export function approachTouched(port: PerformancePort): void {
    statusAt=-Infinity;refreshRows(port);rowRevealUntil=Date.now()+1800;appState.dirty=true;
}
export function approachRowLines(): string[] {
    return [2,1,0].map(row=>{const item=rowView[row]||'';const comma=item.indexOf(',');const slot=comma>=0?item.slice(0,comma):'?';const name=comma>=0?item.slice(comma+1).replace(/^Stock: /,''):'';return (row+1)+'  '+slot+': '+name;});
}
export function drawApproachRows(port: PerformancePort): void {
    refreshRows(port);
    const [header,...labels]=sequenceView.split('|');
    const [selected,total,offset]=header.split(',').map(Number);
    if(!labels.length||![selected,total,offset].every(Number.isInteger)||total<1)return;
    let begin=0,end=labels.length,chosen=selected-offset;
    const width=()=>labels.slice(begin,end).reduce((sum,label)=>sum+fontWidth(label)+4,0)+8;
    while(width()>126&&end-begin>1){
        if(chosen-begin>end-1-chosen)begin++;else end--;
    }
    fill_rect(0,58,128,6,0);
    let x=offset+begin>0?5:1;
    if(offset+begin>0)fontPrint(0,58,'<',1);
    for(let index=begin;index<end;index++){
        let label=labels[index];while(fontWidth(label)>112)label=label.slice(0,-1);
        const width=fontWidth(label),active=index===chosen;
        if(active)fill_rect(x-1,58,width+2,6,1);
        fontPrint(x,58,label,active?0:1);x+=width+4;
    }
    if(offset+end<total)fontPrint(123,58,'>',1);
}
export function syncApproachOwner(next: PerformancePort | null): void {
    if (owner?.performanceTrack === next?.performanceTrack && !!owner === !!next) return;
    owner?.performanceSet('approach_mode_active','0');
    owner=next;owner?.performanceSet('approach_mode_active','1');statusAt=-Infinity;status=[];rowView=[];lastRowView='';sequenceView='';rowRevealUntil=0;
}
export function approachStep(data: number[], port: PerformancePort | null): boolean {
    const step=data[1]-16,type=data[0]&0xf0;
    if(step<0||step>=16||(type!==0x80&&type!==0x90))return false;
    const down=type===0x90&&data[2]>0;
    if(!down&&releases.has(step)){releases.get(step)!();releases.delete(step);return true;}
    if(!port)return false;
    if(down&&!releases.has(step)){
        const started=Date.now();releases.set(step,()=>port.performanceSet('approach_step_touch_'+(step+1),'Up,'+Math.max(0,Date.now()-started)));port.performanceSet('approach_step_touch_'+(step+1),'Down');
        approachTouched(port);if(keyboardState.layout!==3)seqToast('Bank 2 · '+(step+1));
    }
    return true;
}
export function approachLight(slot: number, state: number[], held = false): [number,number,number] {
    if(slot<0||slot>=16)return [0,0,ANIM_NONE];
    const down=held||!!((state[3]||0)&(1<<slot));
    const active=!!state[6]&&!!((state[5]||0)&(1<<slot));
    if(down)return [120,120,ANIM_NONE];
    if(active)return state[8]?[124,120,ANIM_PULSE_SLOW]:[120,120,ANIM_NONE];
    return [0,0,ANIM_NONE];
}
export function paintApproach(port: PerformancePort | null): boolean {
    if(!port)return false;
    refreshRows(port);
    if(rowRevealUntil>0&&Date.now()>=rowRevealUntil){rowRevealUntil=0;appState.dirty=true;}
    for(let step=0;step<16;step++){
        const [base,color,animation]=approachLight(step,status,releases.has(step));
        cachedSetAnimLED(16+step,base,color,animation);
    }
    return true;
}
export function paintApproachKnobs(port: PerformancePort, keys: (string | null)[]): boolean {
    if(!keys.some(key=>/^approach_bank_/.test(key ?? '')))return false;
    refreshRows(port);
    const nextChordStatus=cachedNamedControlStatus(port,32);
    if(nextChordStatus!==chordArpStatus){chordArpStatus=nextChordStatus;appState.dirty=true;}
    for(let knob=0;knob<8;knob++){
        if(keys[knob]==='key_center'||keys[knob]==='parallel_mode'){
            const state=keys[knob]==='key_center'?keyCenterStatus:parallelStatus;
            const on=state!=='Off',pulse=state==='Latch';
            cachedSetAnimLED(knob,on?18:0,on?16:0,pulse?ANIM_PULSE_SLOW:ANIM_NONE);
            cachedSetAnimLED(71+knob,on?18:0,on?16:0,pulse?ANIM_PULSE_SLOW:ANIM_NONE,true);continue;
        }
        if(keys[knob]==='approach_motif_latch'){
            const on=motifLatchStatus==='On'&&!approachRowsActive();
            cachedSetAnimLED(knob,on?18:0,on?16:0,on?ANIM_PULSE_SLOW:ANIM_NONE);
            cachedSetAnimLED(71+knob,on?18:0,on?16:0,on?ANIM_PULSE_SLOW:ANIM_NONE,true);continue;
        }
        if(!/^approach_bank_/.test(keys[knob]??''))continue;
        const slot=Number((keys[knob]??'').split('_').pop())-1;const selected=keyboardState.layout===3&&status.length>=12?status.slice(9,12).includes(slot):keyboardState.layout===2&&status[12]?!!(status[12]&(1<<slot)):slot===status[7];const [base,color,animation]=approachRowsActive()?[selected?37:0,selected?37:0,ANIM_NONE]:approachLight(slot,status);
        cachedSetAnimLED(knob,base,color,animation);cachedSetAnimLED(71+knob,base,color,animation,true);
    }
    return true;
}
export function approachPanels(hierarchy: any, mode: number): void {
    if(mode!==2)return;
    const levels=hierarchy.levels;
    const panel=(name:string,keys:string[],params:any[])=>({name,knobs:keys,params});
    const links: {level:string}[]=[];
    for(let bank=0;bank<2;bank++){
        const params:any[]=Array.from({length:4},(_,index)=>({key:'approach_bank_'+(bank*8+index+1),name:'Operation',type:'enum',options_as_string:true,options:BANK_CHOICES,default:APPROACH_BANK_DEFAULTS[bank*8+index]}));
        params.push({key:'key_center',name:'Key Center',type:'enum',options_as_string:true,options:['Off','On'],default:'Off'});
        params.push({key:'parallel_mode',name:'Parallel Scale',type:'enum',options_as_string:true,options:['Off','On'],default:'Off'});
        params.push({key:'approach_motif_latch',name:'Motif Latch',type:'enum',options_as_string:true,options:['Off','On'],default:'Off'});
        params.push({key:'motion_control_32',name:'Chord + Arp',type:'int',min:-400,max:400,step:1,default:1});
        levels['approach_bank_'+bank]=panel('Harm Play '+(bank+1),params.map(parameter=>parameter.key),params);
        links.push({level:'approach_bank_'+bank});
    }
    levels.root.params.push(...links);
}

/** Under-cell labels use the same cached state as each knob's LED. */
export function approachKnobCaption(slot:number):string {
    if(slot<0)return '';
    if((status[3]||0)&(1<<slot))return 'Hold';
    if(status[6]&&((status[5]||0)&(1<<slot)))return status[8]?'Latch':'Armed';
    if(keyboardState.layout===3){
        const rows=status.slice(9,12).flatMap((selected,index)=>selected===slot?[index+1]:[]);
        return rows.length?'R'+rows.join('/'):'Off';
    }
    if(keyboardState.layout===2){
        if(status[12]){
            if(!(status[12]&(1<<slot)))return 'Off';
            const count=status[16]||0;
            const order=status.slice(17,17+count);
            if(count&&order.length===count){
                // Repeated touches may put one knob in several sequence positions.
                const cursor=status[14]||0;
                const upcoming=order.findIndex((member,index)=>member===slot&&index>=cursor);
                const index=upcoming>=0?upcoming:order.indexOf(slot);
                if(index>=0)return String(index+1);
            }
            // Older modules expose only the current position, never invent touch order.
            return status.length>=17&&status[13]===slot?String(status[14]+1):'Member';
        }
        return status[7]===slot?'Row':'Off';
    }
    return 'Off';
}

export function performKnobCaption(key:string|null):string {
    return key==='key_center'?(keyCenterLabel||keyCenterStatus):key==='parallel_mode'?parallelStatus:key==='approach_motif_latch'?(approachRowsActive()?'Rows':motifLatchStatus==='On'?'Latch':'Off'):key==='motion_control_32'?chordArpStatus:
        approachKnobCaption(key?.startsWith('approach_bank_')?Number(key.split('_').pop())-1:-1);
}

/** Spend each operation cell on its musical meaning, rather than a slot label. */
export function drawApproachOperations(keys: (string | null)[], values: Record<string, unknown>, touched: number): void {
    if (!keys.some(key => /^approach_bank_/.test(key ?? ''))) return;
    const names: Record<string, string> = {
        'Secondary V':'Sec V', 'Secondary II':'Sec II', 'Connector Below':'CCB',
        'Connector Above':'CCA', 'Leading Tone':'LT', 'Tritone Sub':'TTS',
        'Backdoor V':'Back V', 'Backdoor II':'Back II', 'Tritone II':'TTS II',
        'Secondary VI':'Sec VI', 'Secondary III':'Sec III', 'Secondary IV':'Sec IV',
        'Secondary VII':'Sec VII', 'Upper Dim':'Upper Dim',
        'Stock: ii-V-Target':'ii-V', 'Stock: iv-bVII-Target':'Back door',
        'Stock: ii-bII7-Target':'TTS ii-V', 'Stock: vi-ii-V':'vi-ii-V',
        'Stock: ii-V-LT':'ii-V LT', 'Stock: V/V-V-I':'V/V-V',
        'Stock: iii-vi-ii-V-I':'iii-vi ii-V',
    };
    keys.forEach((key, slot) => {
        if (!/^approach_bank_/.test(key ?? '') && key !== 'motion_control_32' && key !== 'approach_motif_latch' && key !== 'key_center' && key !== 'parallel_mode') return;
        const raw=key==='key_center'?'Key Center':key==='parallel_mode'?'Parallel Scale':key==='approach_motif_latch'?'Motif Latch':key==='motion_control_32'?'Chord + Arp':String(values[key!] ?? '');
        const label=names[raw] ?? raw.replace(/^Stock: /,'').replace(/Target/g,'T');
        const words=label.split(/(?<=-)|\s+/), lines:string[]=[];
        let line='';
        for (const word of words) {
            const joined=line+(line&&!line.endsWith('-')?' ':'')+word;
            if (line && fontWidth(joined)>26) { lines.push(line);line=word; }
            else line=joined;
        }
        if(line)lines.push(line);
        const display=lines.slice(0,2);
        if(lines.length>2)display[1]+='..';
        for(let index=0;index<display.length;index++){
            if(fontWidth(display[index])<=26)continue;
            let text=display[index].replace(/\.\.$/,'');
            while(text.length&&fontWidth(text+'..')>26)text=text.slice(0,-1);
            display[index]=text+'..';
        }
        const x=(slot%4)*32, y=9+Math.floor(slot/4)*24, active=touched===slot;
        fill_rect(x,y,32,24,0);
        fill_rect(x+1,y,30,15,1);
        fill_rect(x+2,y+1,28,13,active?1:0);
        const textY=y+(display.length===1?5:2);
        display.forEach((text,index)=>fontPrint(x+Math.floor((32-fontWidth(text))/2),textY+index*6,text,active?0:1));
        const caption=performKnobCaption(key);
        if(caption)fontPrint(x+Math.floor((32-fontWidth(caption))/2),y+16,caption,1);
    });
}

/** Keep the detected form visible alongside its harmony, without host reads. */
export function drawDetectedChordForm(keys:(string|null)[],values:Record<string,unknown>,touched:number):void {
    const slot=keys.indexOf('detected_chord_form');if(slot<0)return;
    const raw=String(values.detected_chord_form??'--'),split=raw.lastIndexOf(' ');
    const lines=split<0?[raw,'--']:[raw.slice(0,split),raw.slice(split+1)];
    const x=(slot%4)*32,y=9+Math.floor(slot/4)*24,active=touched===slot;
    fill_rect(x,y,32,15,0);fill_rect(x+1,y,30,15,1);fill_rect(x+2,y+1,28,13,active?1:0);
    lines.forEach((line,index)=>{
        let text=line;
        if(fontWidth(text)>26){while(text.length&&fontWidth(text+'..')>26)text=text.slice(0,-1);text+='..';}
        fontPrint(x+Math.floor((32-fontWidth(text))/2),y+2+index*6,text,active?0:1);
    });
}
