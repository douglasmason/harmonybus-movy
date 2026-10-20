/* Real filesystem install replacement, using production persistence helpers. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
const sandbox=mkdtempSync(join(tmpdir(),'movy-update-'));
const local=path=>join(sandbox,path.replace(/^\//,''));
globalThis.host_read_file=path=>{try{return readFileSync(local(path),'utf8');}catch{return null;}};
globalThis.host_write_file=(path,contents)=>{try{writeFileSync(local(path),contents);return true;}catch{return false;}};
globalThis.host_ensure_dir=path=>{mkdirSync(local(path),{recursive:true});return true;};
globalThis.host_file_exists=path=>existsSync(local(path));
const modulePath='/data/UserData/schwung/modules/tools/movy';
const {writeStateBlob,readBestState,writeUiBlob}=await import('../dist/esm/seq/persist-store.js');
const {uuidToStatePath,uuidToUiStatePath,versionStatePath,versionUiPath,versionsIndexPath,rememberSet,loadNameIndex}=await import('../dist/esm/seq/set-context.js');
const {writePrefFullVelocity,readPrefFullVelocity,PREFS_PATH}=await import('../dist/esm/seq/prefs.js');
const {ENGINE_DSP_PATH}=await import('../dist/esm/seq/constants.js');
try{
    host_ensure_dir(modulePath);host_write_file(modulePath+'/ui.js','old module');
    writePrefFullVelocity(true); // root creation before the first Set
    assert.equal(readPrefFullVelocity(),true);
    const payload='movy1\ntrack 0\n';
    assert.equal(writeStateBlob('survivor',payload,8),true);
    host_ensure_dir(dirname(versionStatePath('survivor',1)));
    host_write_file(versionStatePath('survivor',1),'saved history');
    host_write_file(versionUiPath('survivor',1),'saved chain history');
    host_write_file(versionsIndexPath('survivor'),'history index');
    assert.equal(writeUiBlob('survivor','saved UI and chains'),true);
    rememberSet('My recorded loop','survivor');
    const paths=[uuidToStatePath('survivor'),uuidToUiStatePath('survivor'),versionStatePath('survivor',1),versionUiPath('survivor',1),versionsIndexPath('survivor'),PREFS_PATH];
    const contents=paths.map(host_read_file);
    for(let install=0;install<3;install++){
        rmSync(local(modulePath),{recursive:true}); // Manager custom GitHub/archive behavior
        host_ensure_dir(modulePath);host_write_file(modulePath+'/ui.js','new module '+install);
        for(let index=0;index<paths.length;index++)assert.equal(host_read_file(paths[index]),contents[index]);
        assert.equal(readBestState('survivor').payload,payload);
        assert.equal(readPrefFullVelocity(),true);
        assert.equal(loadNameIndex()['My recorded loop'],'survivor');
    }
    assert.equal(ENGINE_DSP_PATH,modulePath+'/dsp.so');
    assert.ok(paths.every(path=>path.startsWith('/data/UserData/movy/')));
    console.log('Data survival: sets, chains, history, index and preferences survive three destructive module replacements');
}finally{rmSync(sandbox,{recursive:true,force:true});}
