/** Full-height operation names use native 8-row glyphs, never scaled 5-row art.
 * Tight cells fall back to the original compact fonts without stretching. */
import {fontPrint4x5,fontWidth4x5} from './font4x5.mjs';
import {fontPrint5x3,fontWidth5x3} from './font5x3.mjs';
import {drawNativeText,nativeTextWidth} from './hb_large_font.mjs';

const layouts=new Map();
function wrap(text,width,measure){
    const lines=[];
    let line='';
    for(let word of text.trim().split(/\\s+/)){
        if(line&&measure(line+' '+word)<=width){line+=' '+word;continue;}
        if(line){lines.push(line);line='';}
        while(measure(word)>width){
            let count=1;
            while(count<word.length&&measure(word.slice(0,count+1)+'-')<=width)count++;
            lines.push(word.slice(0,count)+'-');word=word.slice(count);
        }
        line=word;
    }
    if(line)lines.push(line);
    return lines;
}
function layoutFor(text,width,height){
    const budget=Math.max(8,width-2),key=budget+':'+height+':'+text;
    let layout=layouts.get(key);
    if(layout)return layout;
    let kind='native',measure=value=>nativeTextWidth(value,'smooth');
    let lines=wrap(text,budget,measure),textHeight=8,gap=1;
    let count=Math.max(1,Math.floor((height+gap)/(textHeight+gap)));
    if(lines.length>count){
        kind='compact';measure=fontWidth4x5;textHeight=5;gap=2;
        lines=wrap(text,budget,measure);
        count=Math.max(1,Math.floor((height+gap)/(textHeight+gap)));
    }
    if(lines.length>count){
        kind='condensed';measure=fontWidth5x3;
        lines=wrap(text,budget,measure);
    }
    if(lines.length>count){
        lines=lines.slice(0,count);
        let last=lines[count-1];
        while(last&&measure(last+'..')>budget)last=last.slice(0,-1);
        lines[count-1]=last+'..';
    }
    layout={lines,measure,kind,textHeight,gap};
    if(layouts.size>=128)layouts.clear();
    layouts.set(key,layout);
    return layout;
}

export function drawActionLabel(ctx,x,y,width,height,label,active){
    const layout=layoutFor(String(label||'Operation'),width,height);
    ctx.fillRect(x+1,y,width-2,height,active?1:0);
    const total=layout.lines.length*layout.textHeight+(layout.lines.length-1)*layout.gap;
    const top=y+Math.floor((height-total)/2);
    layout.lines.forEach((line,index)=>{
        const rowTop=top+index*(layout.textHeight+layout.gap);
        const left=x+Math.floor((width-layout.measure(line))/2);
        if(layout.kind==='native'){
            drawNativeText(ctx,left,rowTop,line,'smooth',active?0:1);
        }else{
            const printer=layout.kind==='compact'?fontPrint4x5:fontPrint5x3;
            printer({fillRect:(px,py,w,h,color)=>ctx.fillRect(px,rowTop+py,w,h,color)},left,0,line,active?0:1);
        }
    });
}
