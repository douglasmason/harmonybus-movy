import type { PerformancePort } from './hb-performance.js';
import { fontPrint, fontWidth } from '../font/index.js';
import { keyboardState } from '../keyboard/state.js';
import { appState } from '../app/state.js';
import { cachedSetAnimLED } from '../seq/led-cache.js';
import { ANIM_NONE, ANIM_PULSE_SLOW } from '../seq/colors.js';
import { seqToast } from '../seq/render.js';
export const APPROACH_CHOICES = ['Connector Below','Connector Above','Secondary II','Secondary V','Secondary VI','Backdoor II','Backdoor V','Tritone II','Tritone Sub','Secondary III','Secondary IV','Secondary VII','Leading Tone','Upper Dim',...Array.from({length:16},(_,index)=>'Motif '+(index+1))];
export const APPROACH_MOTIFS = ['V-Target','ii-V-Target','iv-bVII-Target','bII7-Target','ii-bII7-Target','bVI-bVII-I','bVI-V-I','bIII-IV-I','vi-V-I','iii-vi-ii-V-I','IV-iv-I','ii halfdim-V-i','I-VI7-ii-V-I','V/V-V-I','ii/V-V/V-V-I','V/ii-ii-V-I','V/vi-vi-ii-V-I','vii dim/V-V-I','III7-VI7-II7-V7-I',...Array.from({length:16},(_,index)=>'User '+(index+1))];
export const TRIPLE_MOTIFS=['vi-ii-V','ii-V-LT','iv-bVII-LT','ii-bII7-LT','iii-vi-ii','IV-ii-V','vii-iii-vi','LT-ii-V'];
export const BANK_CHOICES=[...APPROACH_MOTIFS.map((name,index)=>index<19?'Stock: '+name:name),...TRIPLE_MOTIFS.map(name=>'Stock: '+name),...APPROACH_CHOICES.filter(name=>!name.startsWith('Motif '))];
let owner: PerformancePort | null = null;
const releases = new Map<number,()=>void>();
let statusAt = -Infinity, status: number[] = [];
let rowView: string[] = [], lastRowView = '', rowRevealUntil = 0;
function refreshRows(port: PerformancePort): void {
    const now=Date.now();
    if(now>=statusAt&&now-statusAt<50)return;
    status=port.performanceGet('approach_row_status').split(',').map(Number);statusAt=now;
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
    if(keyboardState.layout!==3)return;
    if(Date.now()>=rowRevealUntil&&!(status[3]||0)){
        const slots=[status[11],status[10],status[9]].map(n=>Number.isFinite(n)?n+1:'?');
        fill_rect(0,58,128,6,0);fontPrint(1,58,'3:'+slots[0]+' > 2:'+slots[1]+' > 1:'+slots[2]+' > T',1);return;
    }
    fill_rect(0,10,128,47,0);
    const lines=approachRowLines();
    for(let index=0;index<3;index++){
        const newest=index===2,y=12+index*11;let label=lines[index];
        while(fontWidth(label)>122&&label.length)label=label.slice(0,-1);
        if(newest)fill_rect(0,y-1,128,9,1);
        fontPrint(2,y,label,newest?0:1);
    }
    fontPrint(2,47,'v TARGET  /  1 NEWEST',1);
}
export function syncApproachOwner(next: PerformancePort | null): void {
    if (owner?.performanceTrack === next?.performanceTrack && !!owner === !!next) return;
    owner?.performanceSet('approach_mode_active','0');
    owner=next;owner?.performanceSet('approach_mode_active','1');statusAt=-Infinity;status=[];rowView=[];lastRowView='';rowRevealUntil=0;
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
    for(let knob=0;knob<8;knob++){
        if(!/^approach_bank_/.test(keys[knob]??''))continue;
        const slot=Number((keys[knob]??'').split('_').pop())-1;const selected=keyboardState.layout===3&&status.length>=12?status.slice(9,12).includes(slot):slot===status[7];const base=selected?37:0,color=base,animation=ANIM_NONE;
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
        const params:any[]=Array.from({length:7},(_,index)=>({key:'approach_bank_'+(bank*8+index+1),name:'Slot '+(bank*8+index+1),type:'enum',options_as_string:true,options:BANK_CHOICES,default:'Stock: '+APPROACH_MOTIFS[bank*8+index]}));
        params.push({key:'motion_control_32',name:'Chord + Arp',type:'int',min:-400,max:400,step:1,default:1});
        levels['approach_bank_'+bank]=panel('Harm Perform '+(bank+1),params.map(parameter=>parameter.key),params);
        links.push({level:'approach_bank_'+bank});
    }
    levels.root.params.push(...links);
}
