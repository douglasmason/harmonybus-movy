import type { PerformancePort } from './hb-performance.js';
import { appState } from '../app/state.js';
import { cachedSetAnimLED } from '../seq/led-cache.js';
import { ANIM_NONE } from '../seq/colors.js';
import { seqToast } from '../seq/render.js';
export const APPROACH_CHOICES = ['Secondary LT','Chromatic Above','Secondary II','Secondary V','Secondary VI','Backdoor II','Backdoor V','Tritone II','Tritone V','Secondary III','Secondary IV','Secondary VII',...Array.from({length:16},(_,index)=>'Motif '+(index+1))];
export const APPROACH_MOTIFS = ['V-Target','ii-V-Target','iv-bVII-Target','bII7-Target','ii-bII7-Target','bVI-bVII-I','bVI-V-I','bIII-IV-I','vi-V-I','iii-vi-ii-V-I','IV-iv-I','ii halfdim-V-i','I-VI7-ii-V-I','V/V-V-I','ii/V-V/V-V-I','V/ii-ii-V-I','V/vi-vi-ii-V-I','vii dim/V-V-I','III7-VI7-II7-V7-I',...Array.from({length:16},(_,index)=>'User '+(index+1))];
export const TRIPLE_MOTIFS=['vi-ii-V','ii-V-LT','iv-bVII-LT','ii-bII7-LT','iii-vi-ii','IV-ii-V','vii-iii-vi','LT-ii-V'];
export const BANK_CHOICES=[...APPROACH_MOTIFS.map((name,index)=>index<19?'Stock: '+name:name),...TRIPLE_MOTIFS.map(name=>'Stock: '+name),...APPROACH_CHOICES.filter(name=>!name.startsWith('Motif '))];
let owner: PerformancePort | null = null;
const releases = new Map<number,()=>void>();
let statusAt = -Infinity, status: number[] = [];
export function syncApproachOwner(next: PerformancePort | null): void {
    if (owner?.performanceTrack === next?.performanceTrack && !!owner === !!next) return;
    owner?.performanceSet('approach_mode_active','0');
    owner=next;owner?.performanceSet('approach_mode_active','1');statusAt=-Infinity;status=[];
}
export function approachStep(data: number[], port: PerformancePort | null): boolean {
    const step=data[1]-16,type=data[0]&0xf0;
    if(step<0||step>=16||(type!==0x80&&type!==0x90))return false;
    const down=type===0x90&&data[2]>0;
    if(!down&&releases.has(step)){releases.get(step)!();releases.delete(step);return true;}
    if(!port)return false;
    if(down&&!releases.has(step)){
        const started=Date.now();releases.set(step,()=>port.performanceSet('approach_step_touch_'+(step+1),'Up,'+Math.max(0,Date.now()-started)));port.performanceSet('approach_step_touch_'+(step+1),'Down');
        statusAt=-Infinity;seqToast('Bank 2 · '+(step+1));appState.dirty=true;
    }
    return true;
}
export function paintApproach(port: PerformancePort | null): boolean {
    if(!port)return false;
    const now=Date.now();
    if(now<statusAt||now-statusAt>=50){status=port.performanceGet('approach_row_status').split(',').map(Number);statusAt=now;}
    for(let step=0;step<16;step++){
        const color=releases.has(step)?120:status[6]&&((status[5]||0)&(1<<step))?13:step===status[7]?37:22;
        cachedSetAnimLED(16+step,color,color,ANIM_NONE);
    }
    return true;
}
export function paintApproachKnobs(port: PerformancePort, keys: (string | null)[]): boolean {
    if(!keys.some(key=>/^approach_bank_/.test(key ?? '')))return false;
    const down=status[3]||0;
    for(let knob=0;knob<8;knob++){
        const slot=Number((keys[knob]??'').split('_').pop())-1;const color=down&(1<<slot)?120:status[6]&&((status[5]||0)&(1<<slot))?13:slot===status[7]?37:22;
        cachedSetAnimLED(knob,color,color,ANIM_NONE);cachedSetAnimLED(71+knob,color,color,ANIM_NONE,true);
    }
    return true;
}
export function approachPanels(hierarchy: any, mode: number): void {
    if(mode!==2)return;
    const levels=hierarchy.levels;
    const panel=(name:string,keys:string[],params:any[])=>({name,knobs:keys,params});
    for(let bank=0;bank<2;bank++){
        const params=Array.from({length:8},(_,index)=>({key:'approach_bank_'+(bank*8+index+1),name:'Slot '+(bank*8+index+1),type:'enum',options_as_string:true,options:BANK_CHOICES,default:'Stock: '+(bank?APPROACH_MOTIFS[8+index]:TRIPLE_MOTIFS[index])}));
        levels['approach_bank_'+bank]=panel('Perform 2 · '+(bank*8+1)+'–'+(bank*8+8),params.map(parameter=>parameter.key),params);
    }
    const settings=[{key:'approach_latch',name:'Performance Latch',type:'enum',options_as_string:true,options:['Off','On'],default:'Off'}];
    levels.approach_settings=panel('Perform 2 Settings',['approach_latch'],settings);
    levels.root.params.unshift({level:'approach_bank_0'},{level:'approach_bank_1'},{level:'approach_settings'});
}
