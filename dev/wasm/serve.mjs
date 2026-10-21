/** Static-only test server: deliberately has no musical engine or API. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const files=new Map([['/','index.html'],['/engine.mjs','engine.mjs'],['/build/hb.mjs','build/hb.mjs'],['/build/hb.wasm','build/hb.wasm'],['/build/seq.wasm','build/seq.wasm']]);
export function serve(port=7702) {
 return createServer(async(request,response)=>{
  const name=files.get(new URL(request.url,'http://localhost').pathname);
  if(!name){response.writeHead(404).end();return;}
  try{const bytes=await readFile(new URL(name,import.meta.url));response.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':name.endsWith('.mjs')?'text/javascript':'text/html');response.end(bytes);}
  catch{response.writeHead(404).end('Build dev/wasm first');}
 }).listen(port,'127.0.0.1');
}
if(process.argv[1]===fileURLToPath(import.meta.url))serve();
