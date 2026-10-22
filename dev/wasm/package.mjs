/** Copy the static server whitelist into a self-contained website directory. */
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {files} from './serve.mjs';
export const siteRoot=new URL('./build/site/',import.meta.url);
for(const [route,source] of files){
 const target=new URL(route==='/'?'index.html':route==='/joint'?'joint/index.html':route.slice(1),siteRoot);
 await mkdir(new URL('.',target),{recursive:true});
 await copyFile(new URL(source,import.meta.url),target);
}
const infoURL=new URL('wasm/build/full/build-info.json',siteRoot),info=JSON.parse(await readFile(infoURL));
const hash=createHash('sha256').update(await readFile(new URL('wasm/build/full/engine.wasm',siteRoot))).digest('hex');
if(hash!==info.wasmSha256)throw new Error('Compiled engine differs from its build identification; rebuild before packaging');
const git=(...args)=>execFileSync('git',['-C',fileURLToPath(new URL('../../',import.meta.url)),...args],{encoding:'utf8'}).trim();
info.hostSource={commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),dirty:!!git('status','--porcelain','--untracked-files=no')};
await writeFile(infoURL,JSON.stringify(info,null,2)+'\n');
await writeFile(new URL('index.html',siteRoot),'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/joint/?engine=wasm"><a href="/joint/?engine=wasm">Open browser Joint Play</a>');
console.log('Static website packaged in dev/wasm/build/site (serve at origin root).');
