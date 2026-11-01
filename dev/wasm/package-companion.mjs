/** Ship the existing companion plus the exact static artifact, without a second UI build. */
import {cp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('./build/companion/',import.meta.url),bundle=new URL('move-companion/',root),site=new URL('./build/site/',import.meta.url);
await rm(root,{recursive:true,force:true});await mkdir(bundle,{recursive:true});
await cp(site,new URL('site/',bundle),{recursive:true,filter:path=>!path.endsWith('/downloads')});
for(const name of ['companion-start.mjs','move-device-server.mjs','move-device.mjs','move-device-control.mjs','move-transport.mjs','move-transport-server.mjs']){
 const target=new URL('dev/local/'+name,bundle);await mkdir(new URL('.',target),{recursive:true});await cp(new URL('../local/'+name,import.meta.url),target);
}
await mkdir(new URL('dev/wasm/',bundle),{recursive:true});await cp(new URL('./serve.mjs',import.meta.url),new URL('dev/wasm/serve.mjs',bundle));
await cp(new URL('../local/node_modules/ws/',import.meta.url),new URL('node_modules/ws/',bundle),{recursive:true});
await cp(new URL('../local/COMPANION-README.md',import.meta.url),new URL('README.md',bundle));
await cp(new URL('../local/MOVE-CONNECTION.md',import.meta.url),new URL('MOVE-CONNECTION.md',bundle));
await writeFile(new URL('start.mjs',bundle),"import {startCompanion} from './dev/local/companion-start.mjs';\nstartCompanion(process.argv.slice(2),new URL('./site/',import.meta.url));\n");
const hashes={};
async function hashFiles(url,prefix=''){
 for(const entry of await readdir(url,{withFileTypes:true})){const path=prefix+entry.name;if(entry.isDirectory())await hashFiles(new URL(entry.name+'/',url),path+'/');else hashes[path]=createHash('sha256').update(await readFile(new URL(entry.name,url))).digest('hex');}
}
await hashFiles(bundle);
const build=JSON.parse(await readFile(new URL('wasm/build/full/build-info.json',site)));
if(build.hostSource.dirty||build.engineSource.dirty)throw new Error('Companion requires a clean tested build');
await writeFile(new URL('BUILD.json',bundle),JSON.stringify({schema:1,build,files:hashes},null,2)+'\n');
await mkdir(new URL('downloads/',site),{recursive:true});
const archive=new URL('downloads/move-companion.tar.gz',site);
execFileSync('tar',['-czf',fileURLToPath(archive),'-C',fileURLToPath(root),'move-companion']);
const sha=createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(new URL('downloads/move-companion.sha256',site),sha+'  move-companion.tar.gz\n');
console.log('Portable read-only companion packaged with the same workspace: '+sha);
