/** Select only the engine transport; Joint controls/rendering stay identical. */
export async function openJointConnection(){
 if(new URLSearchParams(location.search).get('engine')==='wasm'){
  const {openBrowserConnection}=await import('/wasm/full/joint-transport.mjs');
  return openBrowserConnection();
 }
 const metadata=await fetch('/api/dev/module').then(response=>response.json());
 const socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws/remote-ui`);
 return {metadata,socket,label:'Native Joint Play connected'};
}
