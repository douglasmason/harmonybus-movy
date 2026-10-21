import {installEnv} from './env.mjs';
import {writeFileSync} from 'node:fs';
installEnv();
const {jointFreshState}=await import('../dist/esm/seq/ui-state.js');
writeFileSync(process.argv[2],JSON.stringify([0,1,2,3].map(jointFreshState)));
