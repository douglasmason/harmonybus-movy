/** Asynchronous browser transport behind Movy's existing synchronous TrackPort. */
export const bridge = {
  metadata:null, socket:null, track:0, cache:new Map(), demand:new Map(), connected:false,
  async connect() {
    const response=await fetch('/api/dev/module');if(!response.ok)throw new Error('HB metadata unavailable');
    this.metadata=await response.json();
    await new Promise((resolve,reject)=>{
      const socket=this.socket=new WebSocket(`ws://${location.host}/ws/remote-ui`);
      socket.onopen=()=>socket.send(JSON.stringify({type:'subscribe_tool'}));
      socket.onerror=()=>reject(new Error('Native host connection failed'));
      socket.onclose=()=>{this.connected=false;this.show('Disconnected — reload to reconnect');};
      socket.onmessage=event=>{
        const message=JSON.parse(event.data);
        if(message.type==='error'){this.show(message.message);return}
        if(message.type!=='param_update')return;
        for(const [key,value]of Object.entries(message.params??{}))this.cache.set(key,value);
        if(!this.connected){this.connected=true;this.show('Native HB connected');resolve();}
      };
    });
    this.timer=setInterval(()=>this.watch(),100);
    window.addEventListener('pagehide',()=>{clearInterval(this.timer);this.socket.close()});
  },
  show(message){document.getElementById('native-status').textContent=message},
  select(track){this.track=Number(track);this.demand.clear();this.watch()},
  read(key){
    if(key==='midi_fx1_module'||key==='midi_fx1:module')return 'harmonybus';
    if(key==='midi_fx1:name')return this.metadata.name;
    if(key==='midi_fx1:chain_params')return JSON.stringify(this.metadata.capabilities.chain_params);
    if(key==='midi_fx1:ui_hierarchy')return JSON.stringify(this.metadata.capabilities.ui_hierarchy);
    if(!key.startsWith('midi_fx1:'))return null;
    const bare=key.slice(9);
    if(!this.readable.has(bare))return null;
    const full=`ch${this.track}:${key}`;
    this.demand.set(full,Date.now());return this.cache.get(full)??null;
  },
  write(key,value){
    if(!this.connected||!key.startsWith('midi_fx1:'))return false;
    if(!this.writable.has(key.slice(9))){this.show('This control is read-only in the browser harness');return false;}
    this.socket.send(JSON.stringify({type:'set_param',key:`overtake_dsp:ch${this.track}:${key}`,value:String(value)}));
    this.demand.set(`ch${this.track}:${key}`,Date.now());return true;
  },
  watch(){
    if(!this.connected)return;
    const now=Date.now();const keys=[...this.demand].filter(([,time])=>now-time<750).map(([key])=>key).slice(-64);
    const signature=keys.join('|');if(signature===this.lastWatch)return;
    this.lastWatch=signature;this.socket.send(JSON.stringify({type:'dev_watch',keys}));
  },
  port(){
    const bridge=this;
    return {get track(){return {index:bridge.track,kind:'movy'}},bulkReads:true,
      getParam:key=>bridge.read(key),getMany:keys=>keys.map(key=>bridge.read(key)),
      setParam:(key,value)=>bridge.write(key,value),setParamTimeout:(key,value)=>bridge.write(key,value),
      setMany:pairs=>pairs.map(([key,value])=>bridge.write(key,value)).every(Boolean),sendMidi:()=>{}};
  },
  install(){
    this.readable=new Set(this.metadata.dev.readable);this.writable=new Set(this.metadata.dev.writable);
    globalThis.host_read_file=path=>path.endsWith('/harmonybus/module.json')?JSON.stringify(this.metadata):null;
  }
};
