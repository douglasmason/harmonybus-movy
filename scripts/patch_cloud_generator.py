"""Extend the shared follower recipe with a bounded spatial touch source."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_cloud_generator(root: Path) -> None:
    """Install cloud data and observations without adding another transport."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/cloud-generator'
    core: Path = root / 'engine/crates/seq-core/src'
    (core / 'cloud.rs').write_text((assets / 'cloud.rs').read_text())
    path: Path = core / 'lib.rs'
    path.write_text(path.read_text() + '\npub mod cloud;\n')
    path = core / 'clip.rs'
    source: str = replace_once(path.read_text(), 'pub struct Clip {', 'pub struct Clip {\n    pub cloud_points:Vec<crate::cloud::Point>,\n    pub cloud_field:bool,pub cloud_field_start:u16,')
    source = replace_once(source, '        Clip {', '        Clip {\n            cloud_points:Vec::new(),cloud_field:false,cloud_field_start:0,')
    source = replace_once(source, '    pub fn clear(&mut self) {', '    pub fn clear(&mut self) {\n        self.cloud_points.clear();self.cloud_field=false;self.cloud_field_start=0;')
    path.write_text(source)
    # Install the same controller in the native bundle and browser emulator.
    for filename in ('cloud-view.ts','cloud-surface.ts','cloud-remote.ts','expression-input.ts'):
        (root / 'src/seq' / filename).write_text((assets / filename).read_text())
    path = root / 'src/seq/chord-play.ts'
    source = "import {cloudParameters,cloudRead,cloudWrite,cloudFieldKeys,cloudSurfaceActive,setCloudSurface,cloudMidi,cloudTurn,releaseCloud,tickCloud,drawCloud} from './cloud-surface.js';\n" + path.read_text()
    source = source.replace('generatorParameters,generatorKeys,', 'generatorParameters,generatorPanelKeys,generatorCloud,')
    source = source.replace('generatorTarget(setup.comp,setup.bass)', 'generatorTarget(setup.comp,setup.bass,appState.activeTrack.index)')
    source = source.replace('...generatorParameters(),', '...cloudParameters(),...generatorParameters(),')
    source = replace_once(source, '        const generated=generatorRead', '        const spatial=cloudRead(bare);if(spatial!==null)return spatial;\n        const generated=generatorRead')
    source = replace_once(source, "const bare=key.split(':').pop()??'';const generated", "const bare=key.split(':').pop()??'';const spatial=cloudWrite(bare,value);if(spatial!==null)return spatial;const generated")
    source = source.replace("+' Generator',generatorKeys);", "+' Generator',generatorPanelKeys());\n    if(generatorCloud())add('cp_cloud_field','Cloud X / Y',cloudFieldKeys);")
    source = source.replace("['cp_comp_generator','cp_generator_browser']", "['cp_comp_generator','cp_generator_browser','cp_cloud_field']")
    source = replace_once(source, '    if(!value)generatorStop();', '    if(!value){setCloudSurface(false);generatorStop();}')
    source = replace_once(source, 'export function tickChord():void{', '''function cloudPageVisible():boolean {return chordActive()&&!settingsActive()&&!page?.ctl.hbNavigation?.isMenu()&&['cp_comp_generator','cp_cloud_field'].includes(page?.ctl.page?.level??'')&&generatorCloud();}
export function tickChord():void{
    setCloudSurface(cloudPageVisible());tickCloud();''')
    source = replace_once(source, 'export function chordMidi(data:number[],panels=true,surface?:SchwungPage):boolean{', '''export function chordMidi(data:number[],panels=true,surface?:SchwungPage):boolean{
    setCloudSurface(cloudPageVisible());if(cloudMidi(data))return true;''')
    source = source.replace('if(rangeControlMidi(data,surface??page))', "if(!['cg_cloud_dynamics','cg_restore'].includes((surface??page)?.keyAt(7)??'')&&rangeControlMidi(data,surface??page))")
    source = source.replace('if(key===7)return true;', "if(key===7&&current.keyAt(7)==='cp_off')return true;")
    source = source.replace('if(key===78)return true;', "if(key===78&&current.keyAt(7)==='cp_off')return true;")
    source = source.replace('if(key>=71&&key<=77){', "if(key>=71&&key<=(cloudSurfaceActive()?78:77)){if(cloudTurn(current.keyAt(key-71)??'',value<64?value:value-128,appState.shiftHeld))return true;")
    source = replace_once(source, "drawBankBar(current.pageIndex,current.pageCount);current.render('Chord Play');", "drawBankBar(current.pageIndex,current.pageCount);current.render('Chord Play');\n    if(cloudPageVisible()&&(contextVisible(current)||current.ctl.page?.level==='cp_cloud_field'&&current.ctl.state.touched>=0&&current.ctl.state.touched<2))drawCloud();")
    path.write_text(source)
    path = root / 'src/renderer/panel-catalog.ts'
    source = replace_once(path.read_text(), "cp_comp_generator:'Libraries',", "cp_comp_generator:'Libraries',cp_cloud_field:'Libraries',")
    source = replace_once(source, "['cp_comp_generator','cp_generator_browser'].includes(base)?(String(page?.name??'').startsWith('Bass')?'Bass':'Comp')", "['cp_comp_generator','cp_generator_browser','cp_cloud_field'].includes(base)?(['Bass','Melody','Comp'].find(actor=>String(page?.name??'').startsWith(actor))??'Shared')")
    path.write_text(source)
    path = root / 'src/seq/chord-settings-layout.ts'
    source = replace_once(path.read_text(), '        const level=levels[link.level],keys=', "        if(['cp_comp_generator','cp_cloud_field'].includes(link.level)&&levels[link.level].knobs.length===8)continue;\n        const level=levels[link.level],keys=")
    path.write_text(source)
    path = root / 'src/seq/ui-state.ts'
    source = "import {cloudSurfaceSnapshot,restoreCloudSurface} from './cloud-surface.js';\n" + path.read_text()
    source = replace_once(source, '        padTrails: trailSettingsSnapshot(),', '        padTrails: trailSettingsSnapshot(),\n        cloudSurface: cloudSurfaceSnapshot(),')
    source = replace_once(source, '        restoreTrailSettings(o.padTrails);', '        restoreTrailSettings(o.padTrails);restoreCloudSurface(o.cloudSurface);')
    source = replace_once(source, '    restoreTrailSettings(null);', '    restoreTrailSettings(null);restoreCloudSurface(null);')
    path.write_text(source)
    path = root / 'src/seq/router-pads.ts'
    source = "import {cloudSurfaceActive} from './cloud-surface.js';\n" + path.read_text()
    source = source.replace('!seqState.sessionMode && !gridActive()', '!cloudSurfaceActive() && !seqState.sessionMode && !gridActive()')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = "import {tickCloudRemote} from '../seq/cloud-remote.js';\nimport {cloudSurfaceActive,paintCloud} from '../seq/cloud-surface.js';\n" + path.read_text()
    source = replace_once(source, 'tickField();', 'tickCloudRemote();tickField();')
    source = replace_once(source, '    if(fieldActive()){return paintField(force);}', '    if(cloudSurfaceActive())return paintCloud(force);\n    if(fieldActive()){return paintField(force);}')
    path.write_text(source)
    path = root / 'src/app/input-reset.ts'
    path.write_text("import {releaseCloud} from '../seq/cloud-surface.js';\n" + path.read_text().replace('    releaseField();', '    releaseCloud();releaseField();'))
    path = root / 'src/surfaces/launchpad.ts'
    source = "import {cloudSurfaceActive,cloudPad,cloudPadPressure,cloudColors,releaseCloud} from '../seq/cloud-surface.js';\n" + path.read_text()
    source = replace_once(source, 'export function releaseLaunchpad(): boolean {', "export function releaseLaunchpad(): boolean {\n    releaseCloud('launchpad');")
    source = source.replace('if(fieldActive()||gridActive())', 'if(cloudSurfaceActive()||fieldActive()||gridActive())')
    source = source.replace('const desired = fieldActive()?', 'const desired = cloudSurfaceActive()?cloudColors(8):fieldActive()?')
    source = replace_once(source, '    if(fieldActive()&&index>=0)', "    if(cloudSurfaceActive()&&index>=0){if(type===160)cloudPadPressure('launchpad',index,value);else if(type===128||type===144)cloudPad('launchpad',index,type===144&&value>0,8,value);return;}\n    if(fieldActive()&&index>=0)")
    path.write_text(source)
    path = root / 'src/seq/mode-buttons.ts'
    source = "import {cloudSurfaceActive,cloudRunning,cloudHolding,toggleCloudHold,cloudMidi,clearCloud} from './cloud-surface.js';\n" + path.read_text()
    source = replace_once(source, 'export function modeButtonColor(cc:number,fallback:number):number {', 'export function modeButtonColor(cc:number,fallback:number):number {\n    if(cloudSurfaceActive()&&cc===CC_MODE_SAMPLE)return cloudHolding()?WHITE_BRIGHT:WHITE_DIM;')
    source = replace_once(source, '    if(cc===CC_MODE_LOOP){', '    if(cloudSurfaceActive()&&(cc===CC_MODE_LOOP||cc===CC_MODE_CLEAR||cc===CC_MODE_SAMPLE)){if(down)capturedReleases.add(cc);if(cc===CC_MODE_SAMPLE){if(down)toggleCloudHold();}else if(cc===CC_MODE_LOOP)cloudMidi([176,cc,down?127:0]);else if(down)clearCloud();return true;}\n    if(cc===CC_MODE_LOOP){')
    source = replace_once(source, 'reopenable:!!guide,lines:guide?.lines??[]', "reopenable:!!guide,lines:cloudSurfaceActive()?['Pads: draw cloud','Sample: hold / release','Loop: explore on / off','X: clear cloud']:guide?.lines??[]")
    source = replace_once(source, '    guide.lines.forEach((label,index)=>fontPrint(2,13+index*(guide.lines.length>4?8:10),label,1));', '    snapshot.lines.forEach((label,index)=>fontPrint(2,13+index*(snapshot.lines.length>4?8:10),label,1));')
    source = replace_once(source, '    if(mode===0)set(', "    if(cloudSurfaceActive()){set(CC_MODE_SAMPLE,cloudHolding()?'Release cloud':'Hold cloud','Capture the cloud; new touches play over it. Release lets it fade.',true,cloudHolding());set(CC_MODE_LOOP,'Cloud Explore','Start or stop this follower cloud',true,cloudRunning());set(CC_MODE_CLEAR,'Clear cloud','Release contacts and clear this cloud trail',true,false);return result;}\n    if(mode===0)set(")
    path.write_text(source)
    path = root / 'build/browser.mjs'
    source = replace_once(path.read_text(), '    entryPoints: [', "    entryPoints: [\n        resolve(root,'src/seq/cloud-view.ts'),\n        resolve(root,'src/seq/cloud-surface.ts'),\n        resolve(root,'src/seq/cloud-remote.ts'),")
    path.write_text(source)
    path = core / 'engine.rs'
    source = replace_once(path.read_text(), 'pub struct Engine {', 'pub struct Engine {\n    pub clouds:[crate::cloud::Runtime;16],')
    source = replace_once(source, '            generator_explore:', '            clouds:std::array::from_fn(|_|Default::default()),\n            generator_explore:')
    source = replace_once(source, '                        let mut modified = modified;', '                        let mut modified = modified || self.tracks[ti].clips[slot].recipe.as_ref().is_some_and(|recipe|matches!(recipe.name.as_str(),"Bass-Cloud"|"Follower-Cloud"));')
    source = replace_once(source, '    pub fn stop(&mut self, out: &mut Vec<OutEvent>) {', '    pub fn stop(&mut self, out: &mut Vec<OutEvent>) {\n        self.clouds=std::array::from_fn(|_|Default::default());')
    source = replace_once(source, '        self.frame_now += frames as u64;', '        self.frame_now += frames as u64;self.cloud_expire_contacts();')
    source += '\n' + (assets / 'cloud_engine.rs').read_text()
    if (assets / 'cloud_tests.rs').exists():
        source += '\n' + (assets / 'cloud_tests.rs').read_text()
    path.write_text(source)
    path = core / 'persist.rs'
    source = replace_once(path.read_text(), '            if let Some(config)=c.generator', '''            if c.cloud_field {s.push_str(&format!("cf1 {} {} {}\\n",ti,ci,c.cloud_field_start));}
            for point in &c.cloud_points {s.push_str(&format!("cp1 {} {} {}\\n",ti,ci,point.wire()));}
            if let Some(config)=c.generator''')
    source = replace_once(source, '    engine.generator_explore.fill(None);', '    engine.clouds=std::array::from_fn(|_|Default::default());\n    engine.generator_explore.fill(None);')
    source = replace_once(source, '            Some("cg1")=>{', '''            Some(kind @ ("cf1"|"cp1"))=>{
                if let (Some(track),Some(slot))=(it.next().and_then(|value|value.parse::<usize>().ok()),it.next().and_then(|value|value.parse::<usize>().ok())) {
                    if let Some(clip)=engine.tracks.get_mut(track).and_then(|track|track.clips.get_mut(slot)) {
                        if kind=="cf1" {clip.cloud_field=true;clip.cloud_field_start=it.next().and_then(|value|value.parse::<u16>().ok()).filter(|value|*value<256).unwrap_or(0);}
                        else if let Some(point)=it.next().and_then(crate::cloud::Point::parse) {if clip.cloud_points.len()<crate::cloud::MAX_POINTS {clip.cloud_points.push(point);}}
                    }
                }
            },
            Some("cg1")=>{''')
    path.write_text(source)
    path = core / 'command.rs'
    source = replace_once(path.read_text(), '            if verb=="guser"', '            if verb=="gcloud" {engine.cloud_touch(op);continue;}\n            if verb=="guser"')
    source = source.replace('"grestore" | "gexplore"', '"gcloud" | "grestore" | "gexplore"')
    path.write_text(source)
    path = root / 'src/undo/verbs.ts'
    path.write_text(path.read_text().replace("'grestore', 'gexplore'", "'gcloud', 'grestore', 'gexplore'"))
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text()
    source = replace_once(source, 'struct Instance {', '''struct Instance {
    cloud_reply:String,cloud_ui:String,cloud_focus:usize,cloud_revision:u64,cloud_watch_until:u64,cloud_view_frame:u64,cloud_actions:Vec<String>,''')
    # One ABI scratch buffer covers the bounded saved history plus UI JSON.
    # It is allocated at instance creation, not on the SPI parameter callback.
    source = replace_once(source, '        Instance {', '        Instance {\n            cloud_reply:String::with_capacity(128*1024),cloud_ui:String::new(),cloud_focus:2,cloud_revision:0,cloud_watch_until:0,cloud_view_frame:0,cloud_actions:Vec::new(),')
    source = replace_once(source, '        match key {\n            "cmd" =>', '''        if key=="cloud_action" {
            if val.len()<=180&&!val.chars().any(char::is_control)&&self.cloud_actions.len()<64 {self.cloud_actions.push(val.into());self.cloud_revision=self.cloud_revision.wrapping_add(1);}
            return;
        }
        if key=="cloud_ui_state" {if val.len()<4096&&!val.chars().any(char::is_control) {self.cloud_ui=val.into();self.cloud_revision=self.cloud_revision.wrapping_add(1);}return;}
        if key=="cloud_focus" {if let Ok(track)=val.parse::<usize>() {if track<16 {self.cloud_focus=track;}}return;}
        match key {
            "cmd" =>''')
    source = replace_once(source, '            "state" => Some(seq_core::persist::serialize(&self.engine)),', '''            "persistent_state" => Some(seq_core::persist::serialize(&self.engine)),
            "module_id"=>Some("movy".into()),
            "cloud_actions"=>Some(std::mem::take(&mut self.cloud_actions).join("\\n")),
            "rui_poll"=>{
                // The host probes this even without a browser. Only a real
                // snapshot reader enables controller work and view refreshes.
                let frame=self.blocks/34;
                if self.blocks<self.cloud_watch_until&&frame!=self.cloud_view_frame {self.cloud_view_frame=frame;self.cloud_revision=self.cloud_revision.wrapping_add(1);}
                Some(format!("{}:{}:{}:{}",self.cloud_revision,u8::from(self.engine.playing),self.engine.hb_master_tick(),self.engine.clock.bpm_x100()/100))
            },
''')
    source += '\n' + (assets / 'cloud_reply.rs').read_text()
    source = replace_once(source, '    fn get_param(&mut self, key: &str) -> Option<String> {', '''    fn get_param(&mut self, key: &str) -> Option<String> {
        if let Some(snapshot) = self.cloud_snapshot(key) { return Some(snapshot.to_owned()); }''')
    source = replace_once(source, '        let Some(value) = i.get_param(key_text) else { return -1 };', '''        if let Some(snapshot) = i.cloud_snapshot(key_text) {
            return hb_param_reply::copy_text_reply(snapshot, output);
        }
        let Some(value) = i.get_param(key_text) else { return -1 };''')
    source = replace_once(source, '                let mut s = self.engine.status();', '                let mut s = self.engine.status();\n                s.push_str(if self.blocks<self.cloud_watch_until||!self.cloud_actions.is_empty(){\" cloudremote=1\"}else{\" cloudremote=0\"});')
    # Read-only serialization tests continue to exercise the explicit persistence contract.
    source = source.replace('instance.get_param("state")', 'instance.get_param("persistent_state")')
    source += '\n' + (assets / 'cloud_dsp_tests.rs').read_text()
    source += '\n' + (assets / 'cloud_performance_tests.rs').read_text()
    (path.parent / 'cloud_grain_reference.rs').write_text((assets / 'cloud_grain_reference.rs').read_text())
    path.write_text(source)

    path = root / 'src/seq/engine.ts'
    source = "export let cloudRemoteRequested=false;\n" + path.read_text()
    source = replace_once(source, '        const val = kv.slice(eq + 1);', "        const val = kv.slice(eq + 1);\n        if(key==='cloudremote')cloudRemoteRequested=val==='1';")
    path.write_text(source)
    for filename in ('cloud-web.mjs','web_ui.html'):
        (root / filename).write_text((assets / filename).read_text())
    path = root / 'build/browser.mjs'
    path.write_text(path.read_text()+"\nawait esbuild.build({entryPoints:[resolve(root,'src/seq/cloud-view.ts')],bundle:true,format:'esm',platform:'browser',outfile:resolve(root,'cloud-view.mjs')});\n")

    (root / 'browser-test/hb-cloud-generator.mjs').write_text((assets / 'hb-cloud-generator.mjs').read_text())
