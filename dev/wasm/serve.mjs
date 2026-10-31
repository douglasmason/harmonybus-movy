/** Static-only test server: deliberately has no musical engine or API. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export const files=new Map([['/','index.html'],['/THIRD-PARTY-NOTICES.txt','THIRD-PARTY-NOTICES.txt'],['/engine.mjs','engine.mjs'],['/build/hb.mjs','build/hb.mjs'],['/build/hb.wasm','build/hb.wasm'],['/build/seq.wasm','build/seq.wasm']]);
for(const [route,file] of [
 ['/joint','../local/workspace-redirect.html'],
 ['/move','../local/move.html'],
 ...['lighting.css','move.mjs','move-workspace.mjs','lighting-ui.mjs','lighting.mjs','lighting-profile.mjs','lighting-sections.mjs','song-ui.mjs','build/hb-components.mjs','move-connection.mjs','move-device.mjs','move-input.mjs','session-ui.mjs','build/move-runtime.mjs','build/move-surface.mjs','move.css'].map(name=>['/local/'+name,'../local/'+name]),
 ['/local/protocol-policy.mjs','../local/protocol-policy.mjs'],
 ['/local/observations.mjs','../local/observations.mjs'],
 ['/local/build/session-codecs.mjs','../local/build/session-codecs.mjs'],
 ...['engine.mjs','joint-transport.mjs','joint-service.mjs','joint-worker.mjs','pcm-monitor.mjs','pcm-worklet.mjs','session.mjs'].map(name=>['/wasm/full/'+name,'full/'+name]),
 ...['engine.mjs','engine.wasm','build-info.json','modules/midi_fx/harmonybus/module.json','NuSaw-LICENSE.txt'].map(name=>['/wasm/build/full/'+name,'build/full/'+name])
])files.set(route,file);
export function serve(port=7702,siteRoot=null) {
 return createServer(async(request,response)=>{
  const route=new URL(request.url,'http://localhost').pathname.replace(/\/$/,'')||'/';
  const diagnostic=!siteRoot&&{'/diagnostic-joint':'../local/joint.html','/joint.js':'../local/build/joint.js'}[route];
  const name=diagnostic||files.get(route);
  if(!name){response.writeHead(404).end();return;}
  try{const bytes=await readFile(siteRoot?new URL(route==='/'?'index.html':['/joint','/move'].includes(route)?route.slice(1)+'/index.html':route.slice(1),siteRoot):new URL(name,import.meta.url));response.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':name.endsWith('.mjs')||name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':name.endsWith('.txt')?'text/plain':'text/html');response.end(bytes);}
  catch{response.writeHead(404).end('Build dev/wasm first');}
 }).listen(port,'127.0.0.1');
}
if(process.argv[1]===fileURLToPath(import.meta.url))serve();
