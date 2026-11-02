import {notationGlyph} from '../font/notation.js';
import {drawNativeText,nativeTextWidth} from '../vendor/schwung/shared/param_pages/hb_large_font.mjs';
import {drawGlyphRun, glyphRunWidth} from '../font/blit.js';
import {registerWidget,isWidgetAvailable} from '../renderer/schwung-widgets.js';
import {chordDegrees,intentLabel,type ChordStatus} from './chord-colors.js';

// Music-only typography: compact chord spellings, prominent Roman numerals.
// All non-musical labels remain the shared Schwung renderer's responsibility.
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
        const chordName=String(meta.chordName??'--');
        const roman=String(meta.chordRoman??'');
        const showRoman=!!roman;
        // Explicit per-line metrics: a normal 5px chord name over an 8px Roman.
        // Compact 15px cells use two 5px lines; an extra top inset always
        // clears the frame instead of allowing the capitals to touch its edge.
        const largeRoman=showRoman&&height>=17;
        const nameHeight=5,romanHeight=largeRoman?8:5,gap=showRoman?1:0;
        const usedHeight=nameHeight+(showRoman?gap+romanHeight:0);
        const top=Math.max(2,Math.floor((height-usedHeight)/2));
        ctx.fillRect(1,0,width-2,1,1);ctx.fillRect(1,height-1,width-2,1,1);
        ctx.fillRect(1,0,1,height,1);ctx.fillRect(width-2,0,1,height,1);
        const compactMeasure=(value:string)=>glyphRunWidth(value,notationGlyph,5,0);
        const drawCompact=(value:string,y:number):void=>{
            const text=fitChordText(value,width-6,compactMeasure);
            const left=Math.floor((width-compactMeasure(text))/2);
            drawGlyphRun(left,0,text,active?0:1,notationGlyph,5,0,
                (x,dy,w,h,color)=>ctx.fillRect(x,y+dy,w,h,color));
        };
        drawCompact(chordName,top);
        if(showRoman){
            const romanTop=top+nameHeight+gap;
            if(largeRoman){
                const text=fitChordText(roman,width-6,chordTextWidth);
                const left=Math.floor((width-chordTextWidth(text))/2);
                drawNativeText(ctx,left,romanTop,text,'regular',active?0:1);
            }else drawCompact(roman,romanTop);
        }
    }});
}
