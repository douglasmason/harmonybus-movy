import {G} from '../font/glyphs.js';
import {drawGlyphRun, glyphRunWidth, type Glyph} from '../font/blit.js';
import {registerWidget,isWidgetAvailable} from '../renderer/schwung-widgets.js';
import {chordDegrees,intentLabel,type ChordStatus} from './chord-colors.js';

// Chord notation uses the same mixed-case atlas as every other Movy panel.
const glyph=(code:number):Glyph|null=>G[code-32]??null;
export const chordTextWidth=(text:string):number=>glyphRunWidth(text,glyph,5,-1);

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
        short_name:String(index+1),chordName,chordRoman:chordRoman(intent,target,status),chordIntent:intent,chordTarget:target};
}

function fitChordText(text:string,width:number):string {
    if(chordTextWidth(text)<=width)return text;
    text=text.replace(/min/g,'m').replace(/maj/gi,'M').replace(/dim/g,'o').replace(/aug/g,'+');
    if(chordTextWidth(text)<=width)return text;
    while(text&&chordTextWidth(text+'..')>width)text=text.slice(0,-1);
    return text+'..';
}

/** A case-aware readout inside the shared controller's existing widget slot. */
export function registerChordLabels():void {
    const kind='custom:hb-chord-label';
    if(isWidgetAvailable(kind))return;
    registerWidget(kind,{draw(ctx:any,{group,metaIndex}:any):void {
        const key=group.keys[0],meta=metaIndex.getOrGuess(key);
        const width=ctx.width,height=ctx.height;
        const names=[String(meta.chordName??'--'),String(meta.chordRoman??'')].filter(Boolean);
        const firstY=Math.floor((height-(names.length*6-1))/2);
        ctx.fillRect(1,0,width-2,1,1);ctx.fillRect(1,height-1,width-2,1,1);
        ctx.fillRect(1,0,1,height,1);ctx.fillRect(width-2,0,1,height,1);
        names.forEach((name,index)=>{
            const text=fitChordText(name,width-6);
            drawGlyphRun(Math.floor((width-chordTextWidth(text))/2),firstY+index*6,text,1,glyph,5,-1,
                (x,y,w,h,color)=>ctx.fillRect(x,y,w,h,color));
        });
    }});
}
