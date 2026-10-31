/** Read the existing Schwung 1.7.3 mirror. No device writes or emulator state. */
export const deviceCapabilities=Object.freeze({input:false,semantic:false,audio:false,hostVersion:null});
export function deviceStreamURL(address,pageURL){
 const page=new URL(pageURL),value=String(address).trim();
 if(!value)throw new Error('Enter the Move or companion address.');
 const url=new URL(value.includes('://')?value:'http://'+value);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Use an HTTP or HTTPS address with an optional port, without a path or credentials.');
 if(page.protocol==='https:'&&url.protocol!=='https:')throw new Error('This workspace requires an HTTPS endpoint when hosted over HTTPS. Open the local companion interface, or use a trusted HTTPS endpoint.');
 return new URL('/stream-auto?v=2',url).href;
}
function bytes(value,length){
 if(typeof value!=='string'||value.length!==4*Math.ceil(length/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new Error('Invalid Move frame encoding.');
 const raw=atob(value);if(raw.length!==length)throw new Error('Invalid Move frame length.');
 return Uint8Array.from(raw,character=>character.charCodeAt(0));
}
export function decodeDeviceScreen(message){
 if(message.width!==128||message.height!==64||message.encoding!=='base64'||!['mono1_packed','gray4'].includes(message.format))throw new Error('Unsupported Move display format.');
 const mono=message.format==='mono1_packed',raw=bytes(message.data,mono?1024:4096),screen=new Uint8Array(8192);
 for(let row=0;row<64;row++)for(let column=0;column<128;column++){
  screen[row*128+column]=mono?((raw[(row>>3)*128+column]>>(row%8))&1)*255:((raw[row*64+(column>>1)]>>(column%2?0:4))&15)*17;
 }
 return screen;
}
export function decodeDeviceSurface(message){
 if(message.v!==1)throw new Error('Unsupported Move LED protocol version.');
 const surface=bytes(message.data,2232),view=new DataView(surface.buffer);
 if(String.fromCharCode(...surface.slice(0,8))!=='SURFLV1\0'||view.getUint32(8,true)!==1||(view.getUint32(12,true)&1))throw new Error('Invalid Move LED frame.');
 return surface;
}
export function blankDeviceFrame(){
 return {device:true,ready:false,track:null,screen:new Uint8Array(8192),surface:new Uint8Array(2232),displayRevision:0,display:null,panels:null,knobLabels:null,padLabels:null,stepLabels:null};
}
/** One explicit connection. EventSource retries are closed; reconnect is a user action. */
export function openDeviceConnection({url,onFrame,onState,EventSourceClass=globalThis.EventSource,timeout=7000}){
 let stream,closed=false,connected=false,timer,frame=blankDeviceFrame();
 const capabilities={...deviceCapabilities,leds:false};
 function finish(state,message){
  if(closed)return;closed=true;clearTimeout(timer);stream?.close();onState(state,message,{...capabilities});
 }
 const watchdog=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(connected?'disconnected':'error',connected?'Move stream stopped. Reconnect when ready.':'No valid Move display received. Check the address and Schwung mirror service.'),timeout);};
 function receive(kind,event){
  if(closed)return;
  try{
   const message=JSON.parse(event.data);
   if(kind==='screen'){
    frame={...frame,screen:decodeDeviceScreen(message),displayRevision:frame.displayRevision+1};
    if(!connected){connected=true;onState('connected','Connected to Move · read-only screen',{...capabilities});}
   }else if(kind==='surface'){
    frame={...frame,surface:decodeDeviceSurface(message)};capabilities.leds=true;
    if(connected)onState('connected','Connected to Move · read-only screen & LEDs',{...capabilities});
   }else{
    if(!Number.isInteger(message.frame)||message.frame<0)throw new Error('Invalid Move heartbeat.');
    if(!connected)return; // A heartbeat alone never establishes a valid screen.
   }
   if(connected)watchdog();if(connected&&kind!=='heartbeat')onFrame(frame);
  }catch(error){finish('error',error.message);}
 }
 onState('connecting','Connecting to Move…',{...capabilities});
 try{
  stream=new EventSourceClass(url);watchdog();
  stream.onmessage=event=>receive('screen',event);
  stream.addEventListener('surface',event=>receive('surface',event));
  stream.addEventListener('hb',event=>receive('heartbeat',event));
  stream.onerror=()=>finish(connected?'disconnected':'error',connected?'Connection to Move lost. Reconnect when ready.':'Cannot reach the Move stream. Check the address, trusted certificate, network access and CORS.');
 }catch(error){finish('error',error.message);}
 return {capabilities,close:()=>finish('disconnected','Disconnected from Move')};
}
