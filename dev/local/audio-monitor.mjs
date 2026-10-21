/** Optional listening aid for final native USB-MIDI packets; no HB musical rules. */
export class AudioMonitor {
  constructor(createContext=()=>new AudioContext()) {
    this.createContext=createContext;this.context=null;this.enabled=false;
    this.sequence=null;this.voices=new Map();this.active=new Set();
    this.levels=[0.6,0.6,0.6,0.6];this.muted=[false,false,false,false];
  }
  async enable() {
    if(!this.context){
      this.context=this.createContext();
      const limiter=this.context.createDynamicsCompressor();
      limiter.threshold.value=-12;limiter.ratio.value=12;
      this.analyser=this.context.createAnalyser();limiter.connect(this.analyser);this.analyser.connect(this.context.destination);
      this.buses=this.levels.map((level,actor)=>{const gain=this.context.createGain();gain.gain.value=this.muted[actor]?0:level*0.12;gain.connect(limiter);return gain;});
    }
    await this.context.resume();this.enabled=this.context.state==='running';
    return this.enabled;
  }
  disable(){this.enabled=false;this.silence();}
  mix(actor,level,muted){
    this.levels[actor]=Math.max(0,Math.min(1,level));this.muted[actor]=muted;
    if(this.context)this.buses[actor].gain.setTargetAtTime(muted?0:this.levels[actor]*0.12,this.context.currentTime,0.01);
  }
  silence(){
    for(const voice of this.active){voice.oscillator.stop();voice.oscillator.disconnect();voice.gain.disconnect();}
    this.active.clear();this.voices.clear();
  }
  consume(events){
    // Initial snapshots are history, not events to replay on connection or enable.
    if(this.sequence===null){this.sequence=events.at(-1)?.sequence??0;return;}
    const fresh=events.filter(event=>event.sequence>this.sequence);
    if(fresh.length&&fresh[0].sequence!==this.sequence+1){this.silence();this.sequence=fresh.at(-1).sequence;return;}
    for(const event of fresh){this.sequence=event.sequence;if(this.enabled)this.packet(event.packet);}
  }
  packet(packet){
    const [,status,pitch,velocity]=packet,actor=status&15,type=status&240;
    if(actor>3||pitch>127)return;
    const key=actor+':'+pitch;
    if(type===176&&(pitch===120||pitch===123)){this.silence();return;}
    if(type===144&&velocity){
      // Bound resources even if the source sends malformed/unbalanced streams.
      if(this.active.size>=128){this.silence();return;}
      const oscillator=this.context.createOscillator(),gain=this.context.createGain();
      oscillator.type=['sine','triangle','sawtooth','square'][actor];
      oscillator.frequency.value=440*2**((pitch-69)/12);
      const now=this.context.currentTime;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(velocity/127*0.25,now+0.008);
      oscillator.connect(gain);gain.connect(this.buses[actor]);
      const voice={oscillator,gain};this.active.add(voice);
      const queue=this.voices.get(key)??[];queue.push(voice);this.voices.set(key,queue);
      oscillator.onended=()=>{this.active.delete(voice);oscillator.disconnect();gain.disconnect();};oscillator.start();
    }else if(type===128||(type===144&&!velocity)){
      // Preserve overlapping owners: one off closes one matching on, FIFO.
      const queue=this.voices.get(key);const voice=queue?.shift();if(!queue?.length)this.voices.delete(key);
      if(voice){const now=this.context.currentTime;voice.gain.gain.cancelAndHoldAtTime(now);voice.gain.gain.linearRampToValueAtTime(0,now+0.025);voice.oscillator.stop(now+0.03);}
    }
  }
}
