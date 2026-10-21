/** Copy the static server whitelist into a self-contained website directory. */
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {files} from './serve.mjs';
export const siteRoot=new URL('./build/site/',import.meta.url);
for(const [route,source] of files){
 const target=new URL(route==='/'?'index.html':route==='/joint'?'joint/index.html':route.slice(1),siteRoot);
 await mkdir(new URL('.',target),{recursive:true});
 await copyFile(new URL(source,import.meta.url),target);
}
await writeFile(new URL('index.html',siteRoot),'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/joint/?engine=wasm"><a href="/joint/?engine=wasm">Open browser Joint Play</a>');
console.log('Static website packaged in dev/wasm/build/site (serve at origin root).');
