/** Use Schwung's stock device font for ordinary operation names whenever it fits.
 * Compact stock shared-ui labels remain the fallback for crowded cells. */
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
function layoutFor(text,width,height,ctx){
    const useStock=typeof ctx.print==='function'&&typeof ctx.textWidth==='function';
    const stockWidth=useStock?ctx.textWidth('Mm'):0;
    const budget=Math.max(8,width-2),key=budget+':'+height+':'+stockWidth+':'+text;
    let layout=layouts.get(key);
    if(layout)return layout;
    let kind=useStock?'stock':'compact';
    let measure=useStock?value=>ctx.textWidth(value):fontWidth4x5;
    let lines=wrap(text,budget,measure),textHeight=useStock?7:5,gap=1;
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
    const layout=layoutFor(String(label||'Operation'),width,height,ctx);
    ctx.fillRect(x+1,y,width-2,height,active?1:0);
    const total=layout.lines.length*layout.textHeight+(layout.lines.length-1)*layout.gap;
    const top=y+Math.floor((height-total)/2);
    layout.lines.forEach((line,index)=>{
        const rowTop=top+index*(layout.textHeight+layout.gap);
        const left=x+Math.floor((width-layout.measure(line))/2);
        if(layout.kind==='stock'){
            ctx.print(left,rowTop,line,active?0:1);
        }else{
            const printer=layout.kind==='compact'?fontPrint4x5:fontPrint5x3;
            printer({fillRect:(px,py,w,h,color)=>ctx.fillRect(px,rowTop+py,w,h,color)},left,0,line,active?0:1);
        }
    });
}
