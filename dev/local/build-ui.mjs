import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const source=process.env.MOVY_SOURCE;
if(!source)throw new Error('MOVY_SOURCE is required');
const require=createRequire(resolve(source,'package.json'));
const esbuild=require('esbuild');
await esbuild.build({entryPoints:[resolve(root,'session-codecs.mjs')],bundle:true,format:'esm',platform:'browser',outfile:resolve(root,'build/session-codecs.mjs'),alias:{movy:resolve(source,'src')}});
await esbuild.build({entryPoints:[resolve(root,'panel.mjs')],bundle:true,format:'esm',platform:'browser',external:['/data/*'],outfile:resolve(root,'build/panel.js'),alias:{'movy':resolve(source,'src')}});
const {buildMovy}=await import('./build-movy.mjs');
await buildMovy({root,source,esbuild});

const {buildJoint}=await import('./build-joint.mjs');
await buildJoint({root,source,schwung:process.env.SCHWUNG_SOURCE,esbuild});
const {buildMove}=await import('./build-move.mjs');
await buildMove({root,source,schwung:process.env.SCHWUNG_SOURCE,esbuild});
