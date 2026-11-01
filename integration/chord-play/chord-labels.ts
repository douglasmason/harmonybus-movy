import {notationGlyph} from '../font/notation.js';
import {drawNativeText,nativeTextWidth} from '../vendor/schwung/shared/param_pages/hb_large_font.mjs';
import {drawGlyphRun, glyphRunWidth} from '../font/blit.js';
import {registerWidget,isWidgetAvailable} from '../renderer/schwung-widgets.js';
import {chordDegrees,intentLabel,type ChordStatus} from './chord-colors.js';

// Both chord spelling and Roman quality benefit from contrasting letter heights.
export const chordTextWidth=(text:string):number=>nativeTextWidth(text,'regular');

/** Display notation only: quality and spelling come from the native chord name. */
export function chordRoman(intent:number,target:number,status:ChordStatus|undefined):string {
    if(!intent)return '';
    const numeral=chordDegrees[target]??'?';
    if(!status||status.root<0)return intentLabel(intent,target);
    if(intent!==1&&intent!==12&&intent!==13)return intentLabel(intent,target).replace('vii dim','viio');
    const suffix=/^[A-G](?:#|b)?([^/]*)/.exec(status.name)?.[1]??'';
    const minor=/^(?:m(?!aj)|dim)/.test(suffix);
    const extension=suffix.replace(/^min/,'').replace(/^m(?!aj)/,'').replace(/^dim/,'o').replace(/^aug/,'+');
    return (minor?numeral.toLowerCase():numeral)+extension;
}

export function chordLabelMetadata(index:number,intent:number,target:number,status:ChordStatus|undefined):Record<string,unknown> {
    const chordName=status?.name??'--';
    return {name:(index+1)+' '+chordName,label:(index+1)+' '+chordName,
        short_name:String(index+1),movy_full_cell:true,chordName,chordRoman:chordRoman(intent,target,status),chordIntent:intent,chordTarget:target};
}

function fitChordText(text:string,width:number,measure:(value:string)=>number=chordTextWidth):string {
    if(measure(text)<=width)return text;
    text=text.replace(/min/g,'m').replace(/maj/gi,'M').replace(/dim/g,'o').replace(/aug/g,'+');
    if(measure(text)<=width)return text;
    while(text&&measure(text+'..')>width)text=text.slice(0,-1);
    return text+'..';
}

/** A case-aware readout inside the shared controller's existing widget slot. */
export function registerChordLabels():void {
    const kind='custom:hb-chord-label';
    if(isWidgetAvailable(kind))return;
    registerWidget(kind,{draw(ctx:any,{group,metaIndex}:any):void {
        const key=group.keys[0],meta=metaIndex.getOrGuess(key);
        const width=ctx.width,height=ctx.height,active=!!group.movyTouched;
        ctx.fillRect(1,0,width-2,height,active?1:0);
        const names=[String(meta.chordName??'--'),String(meta.chordRoman??'')].filter(Boolean);
        const native=height>=17;
        const textHeight=native?8:5,gap=native?1:2;
        const measure=native?chordTextWidth:(value:string)=>glyphRunWidth(value,notationGlyph,5,0);
        const firstY=Math.floor((height-(names.length*textHeight+(names.length-1)*gap))/2);
        ctx.fillRect(1,0,width-2,1,1);ctx.fillRect(1,height-1,width-2,1,1);
        ctx.fillRect(1,0,1,height,1);ctx.fillRect(width-2,0,1,height,1);
        names.forEach((name,index)=>{
            const text=fitChordText(name,width-6,measure);
            const top=firstY+index*(textHeight+gap);
            const left=Math.floor((width-measure(text))/2);
            if(native){
                drawNativeText(ctx,left,top,text,'regular',active?0:1);
            }else{
                drawGlyphRun(left,0,text,active?0:1,notationGlyph,5,0,
                    (x,y,w,h,color)=>ctx.fillRect(x,top+y,w,h,color));
            }
        });
    }});
}
