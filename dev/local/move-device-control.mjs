/** Explicit, authenticated companion connection. Never connects to stock WS directly. */
export function openDeviceControl({url,key,onState,WebSocketClass=globalThis.WebSocket,timeout=7000}){
 let socket,closed=false,ready=false,timer,pending=false;
 const notify=(message)=>onState(ready,message);
 function close(message='Transport disconnected'){
  if(closed)return;closed=true;ready=false;clearTimeout(timer);socket?.close();notify(message);
 }
 const watchdog=()=>{clearTimeout(timer);timer=setTimeout(()=>close('Transport timed out. Reconnect explicitly.'),timeout);};
 try{
  if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Enter the 64-character pairing key printed by the transport companion.');
  const endpoint=new URL('/ws/movy-transport',url);endpoint.protocol=endpoint.protocol==='https:'?'wss:':'ws:';
  socket=new WebSocketClass(endpoint.href,['hb-movy-v1','hb-key.'+key]);watchdog();
  socket.onmessage=event=>{
   if(closed)return;
   try{
    const message=JSON.parse(event.data);
    if(message.type==='ready'&&message.tool==='movy'&&typeof message.version==='string'){
     ready=true;notify(`Transport ready · Movy ${message.version} · host version unreported`);
    }else if(message.type==='sent'&&['play','stop'].includes(message.action)){
     pending=false;notify(`${message.action==='play'?'Play':'Stop'} request sent · verify on Move`);
    }else if(message.type==='error'){close(message.message||'Transport unavailable');return;}
    else if(message.type!=='heartbeat')throw new Error('Unsupported companion response');
    watchdog();
   }catch{close('Invalid transport response');}
  };
  socket.onerror=()=>close('Cannot authenticate or reach transport companion. Check the key and endpoint.');
  socket.onclose=()=>close('Transport connection lost. Reconnect explicitly.');
 }catch(error){close(error.message);}
 return {close,send(action){
  if(closed||!ready||pending||socket.readyState!==1||socket.bufferedAmount||!['play','stop'].includes(action))return false;
  pending=true;socket.send(JSON.stringify({type:'transport',action}));return true;
 }};
}
