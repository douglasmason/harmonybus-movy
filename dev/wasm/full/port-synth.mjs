/** Use the pinned host ABI rather than NuSaw's embedded legacy prefix structs. */
import {readFile,writeFile} from 'node:fs/promises';
const [source,out]=process.argv.slice(2);
const plugin=await readFile(`${source}/src/dsp/nusaw_plugin.cpp`,'utf8');
const start=plugin.indexOf('#include <stdint.h>'),end=plugin.indexOf('/* Engine */');
if(start<0||end<start||!plugin.slice(start,end).includes('typedef struct plugin_api_v2'))throw new Error('NuSaw API declaration changed');
await writeFile(`${out}/nusaw_plugin.cpp`,plugin.slice(0,start)+'#include "host/plugin_api_v1.h"\n\n'+plugin.slice(end));
await writeFile(`${out}/nusaw_engine.cpp`,await readFile(`${source}/src/dsp/nusaw_engine.cpp`));
