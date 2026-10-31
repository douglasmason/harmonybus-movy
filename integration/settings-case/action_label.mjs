/** Label-only action cells inside the existing Schwung Movy renderer. */
import {fontPrint4x5,fontWidth4x5} from './font4x5.mjs';
import {fontPrint5x3,fontWidth5x3} from './font5x3.mjs';

const layouts=new Map();
function wrap(text,width,measure){
    const lines=[];
    let line='';
    for(let word of text.trim().split(/\s+/)){
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

export function drawActionLabel(ctx,x,y,width,height,label,active){
    const text=String(label||'Operation'),budget=Math.max(8,width-2),key=budget+':'+height+':'+text;
    let layout=layouts.get(key);
    if(!layout){
        let measure=fontWidth4x5,print=fontPrint4x5,lines=wrap(text,budget,measure);
        const count=Math.max(1,Math.floor((height+2)/7));
        if(lines.length>count){measure=fontWidth5x3;print=fontPrint5x3;lines=wrap(text,budget,measure);}
        if(lines.length>count){
            lines=lines.slice(0,count);let last=lines[count-1];
            while(last&&measure(last+'..')>budget)last=last.slice(0,-1);
            lines[count-1]=last+'..';
        }
        layout={lines,measure,print};
        if(layouts.size>=128)layouts.clear();
        layouts.set(key,layout);
    }
    ctx.fillRect(x+1,y,width-2,height,active?1:0);
    const top=y+Math.floor((height-(layout.lines.length*7-2))/2);
    layout.lines.forEach((line,index)=>layout.print(ctx,x+Math.floor((width-layout.measure(line))/2),top+index*7,line,active?0:1));
}
