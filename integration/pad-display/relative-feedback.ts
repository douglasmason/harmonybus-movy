/** Native rendered results. This module never chooses an operation or pitches. */
export type RelativeFeedback = {
    serial:number; token:number; target:number; root:number; mask:number;
    chord:boolean; origin:number; targetName:string; rootName:string;
};
export function parseRelativeFeedback(section:string|undefined):RelativeFeedback|undefined {
    if(!section)return undefined;
    const fields=section.split(',');
    if(fields.length!==10||fields[0]!=='ro1')return undefined;
    const numbers=fields.slice(1,8).map(Number);
    if(fields.slice(1,8).some(value=>!/^\d+$/.test(value))||numbers.some((value,index)=>
        !Number.isInteger(value)||value<0||value>[0xffffffff,63,11,11,4095,1,3][index]))return undefined;
    if(fields.slice(8).some(name=>!/^[A-G](?:#|b)?$/.test(name)))return undefined;
    const [serial,token,target,root,mask,chord,origin]=numbers;
    return {serial,token,target,root,mask,chord:chord===1,origin,targetName:fields[8],rootName:fields[9]};
}

/** First observation establishes a baseline; revisiting a track cannot replay
 * its old feedback. New serials are visible briefly, even when pitches repeat. */
export class RelativeFeedbackCache {
    private track=-1;
    private serial:number|undefined;
    private value:RelativeFeedback|undefined;
    private until=0;
    clear():void { this.value=undefined;this.until=0; }
    expire(now:number):boolean {
        if(!this.value||now<this.until)return false;
        this.clear();return true;
    }
    observe(track:number,next:RelativeFeedback|undefined,now:number):boolean {
        const before=this.value;
        if(track!==this.track){this.track=track;this.serial=next?.serial;this.clear();return !!before;}
        if(!next){this.serial=undefined;this.clear();return !!before;}
        if(this.serial===undefined){this.serial=next.serial;return !!before;}
        const changed=next.serial!==this.serial;
        if(changed){this.serial=next.serial;this.value=next.token?next:undefined;this.until=now+1800;}
        if(now>=this.until)this.clear();
        return changed||before!==this.current(track,now);
    }
    current(track:number,now:number):RelativeFeedback|undefined {
        return track===this.track&&now<this.until?this.value:undefined;
    }
}
