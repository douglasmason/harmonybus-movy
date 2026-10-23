/** Record the sources of the compiled binary, independently of website packaging. */
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();
const source={commit:git(root,'rev-parse','HEAD'),tree:git(root,'rev-parse','HEAD^{tree}'),dirty:!!git(root,'status','--porcelain','--untracked-files=no')};
source.integrationVersion=JSON.parse(await readFile(new URL('../../../release.json',import.meta.url))).version;
const hb=JSON.parse(await readFile(new URL('../build/full/modules/midi_fx/harmonybus/module.json',import.meta.url)));
const wasm=await readFile(new URL('../build/full/engine.wasm',import.meta.url));
const info={schema:1,engineSource:source,harmonyBus:{commit:git(process.env.HB_SOURCE,'rev-parse','HEAD'),version:hb.version},upstreamMovy:'5c01a4fe7745b730ee98111194fc64328ea2659b',schwung:git(process.env.SCHWUNG_SOURCE,'rev-parse','HEAD'),nuSaw:'e3787739dfc099afe2eb447bab498d875afd8136',rust:execFileSync('rustc',['--version'],{encoding:'utf8'}).trim(),emscripten:execFileSync('emcc',['--version'],{encoding:'utf8'}).split('\n')[0],engineRate:44100,wasmSha256:createHash('sha256').update(wasm).digest('hex')};
await writeFile(new URL('../build/full/build-info.json',import.meta.url),JSON.stringify(info,null,2)+'\n');
