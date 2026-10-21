/** Transport only: production Rust emits notes; production HB renders them. */
import createHB from './build/hb.mjs';
export async function createEngine({seqBytes, hbBytes} = {}) {
  const hb = await createHB(hbBytes ? {wasmBinary:hbBytes} : {});
  const bytes = seqBytes ?? await (await fetch(new URL('./build/seq.wasm',import.meta.url))).arrayBuffer();
  const {instance} = await WebAssembly.instantiate(bytes, {});
  const seq = instance.exports;
  hb._hb_init();
  const set = hb.cwrap('hb_set',null,['number','string','string']);
  const collect = count => Array.from({length:count},(_,index)=>hb._hb_event(index)>>>0);
  function midi(track,status,pitch,velocity=0) {
    const count=hb._hb_midi(track,status,pitch,velocity);
    if(count<0)throw new Error('Invalid MIDI');
    return collect(count);
  }
  function drain() {
    const source=[], output=[];
    for(let index=0;index<seq.event_count();index++) {
      const event=seq.event(index)>>>0;
      if(!event)continue;
      source.push(event);
      output.push(...midi(event>>>24,(event>>>16)&255,(event>>>8)&255,event&255));
    }
    return {source,output};
  }
  function command(text) {
    const encoded=new TextEncoder().encode(text);
    if(encoded.length>4096)throw new Error('Command too long');
    const pointer=seq.input_ptr();
    new Uint8Array(seq.memory.buffer,pointer,encoded.length).set(encoded);
    if(seq.command(encoded.length)!==0)throw new Error('Invalid command');
    return drain();
  }
  function advance(frames=128) {
    if(!Number.isInteger(frames)||frames<0||frames>44100)throw new Error('Invalid frame count');
    if(seq.advance(frames)!==0)throw new Error('Invalid frame count');
    const result=drain();
    for(let track=0;track<4;track++)result.output.push(...collect(hb._hb_tick(track,frames)));
    return result;
  }
  return {command,advance,midi,set,seq,hb};
}
