/** Bounded PCM sink. No musical logic or Wasm instance lives on this thread. */
class PcmSink extends AudioWorkletProcessor {
 constructor(){
  super();this.stream=null;this.epoch=0;this.queue=[];this.offset=0;this.frames=0;this.pending=false;
  this.stats={rendered:0,underruns:0,peak:0,received:0,enginePeak:0};this.quanta=0;
  this.port.onmessage=({data})=>{
   if(data.type!=='connect')return;
   this.stream=data.port;
   this.stream.onmessage=({data:message})=>{
    if(message.type==='reset'){
     this.epoch=message.epoch;this.queue=[];this.offset=0;this.frames=0;this.pending=false;this.pull();
    }else if(message.type==='pcm'&&message.epoch===this.epoch){
     this.pending=false;
     if(message.pcm.length!==2048||this.frames+1024>2048)return;
     this.queue.push(message.pcm);this.frames+=1024;this.stats.received+=1024;
     this.stats.enginePeak=message.peak??0;
    }
   };this.stream.start();
  };
 }
 pull(){if(this.stream&&!this.pending&&this.frames<=1024){this.pending=true;this.stream.postMessage({type:'pull',epoch:this.epoch});}}
 process(_inputs,outputs){
  const channels=outputs[0];if(!channels?.length)return true;
  for(let frame=0;frame<channels[0].length;frame++){
   const buffer=this.queue[0];
   if(buffer){
    for(let channel=0;channel<channels.length;channel++){
     const value=buffer[this.offset*2+Math.min(channel,1)]/32768;
     channels[channel][frame]=value;this.stats.peak=Math.max(this.stats.peak,Math.abs(value));
    }
    this.offset++;this.frames--;this.stats.rendered++;
    if(this.offset===1024){this.queue.shift();this.offset=0;}
   }else this.stats.underruns++;
  }
  this.pull();
  if(++this.quanta%128===0){this.port.postMessage({type:'stats',...this.stats,queued:this.frames});this.stats.peak=0;}
  return true;
 }
}
registerProcessor('hb-pcm',PcmSink);
