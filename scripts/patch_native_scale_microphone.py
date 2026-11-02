"""Install the physical Move mic tap without changing the Schwung host.

Only 16 atomic writes per audio block: Goertzel analysis lives on the
worker, which explicitly demotes itself from the SPI real-time priority.
Uses the existing status poll; never adds a blocking UI read cadence.
"""
from pathlib import Path
import re
from patch_responsive_persistence import replace_once


def patch_native_scale_microphone(root: Path) -> None:
    """Install Rust mic monitor and route its status to the Scale Finder UI."""
    asset: Path = Path(__file__).resolve().parents[1] / "integration/scale-finding"
    rust_root: Path = root / "engine/crates/movy-dsp/src"
    (rust_root / "mic_monitor.rs").write_text((asset / "mic-monitor.rs").read_text())

    host_path: Path = rust_root / "host.rs"
    host_source: str = host_path.read_text()
    host_source += """
/// Audio source comes from Schwung's pre-existing host_api mapped AUDIO_IN.
/// The codec chooses Mic vs Line In; no new ALSA client or hardware routing.
pub fn audio_input_available() -> bool {
    host().is_some_and(|api| !api.mapped_memory.is_null()
        && api.audio_in_offset >= 0 && api.audio_in_offset <= 4096
        && api.frames_per_block == 128)
}
pub fn audio_input_block(frames: usize) -> Option<&'static [i16]> {
    let api = host()?;
    if !audio_input_available() || frames != 128 { return None; }
    // Safety: Schwung owns the mapped SPI mailbox for the entire DSP lifetime,
    // and its AUDIO_IN stereo interleaved buffer is 128 frames (512 bytes).
    // Read only during this instance's own render callback.
    let ptr = unsafe { api.mapped_memory.add(api.audio_in_offset as usize) } as *const i16;
    if (ptr as usize) % std::mem::align_of::<i16>() != 0 { return None; }
    Some(unsafe { std::slice::from_raw_parts(ptr, frames * 2) })
}
"""
    host_path.write_text(host_source)

    dsp_path: Path = rust_root / "lib.rs"
    dsp_source: str = dsp_path.read_text()
    for old, new in (
        ("mod host;", "mod host;\nmod mic_monitor;"),
        ("    pads: PadRoute,", "    pads: PadRoute,\n    mic: mic_monitor::MicMonitor,"),
        ("            pads: PadRoute::new(),",
         "            pads: PadRoute::new(),\n            mic: mic_monitor::MicMonitor::new(),"),
        ("    fn set_param(&mut self, key: &str, val: &str) {\n        match key {",
         """    fn set_param(&mut self, key: &str, val: &str) {
        if key == "mic_listen" {
            self.mic.set_listening(val == "1"); return;
        }
        match key {"""),
        ("    fn render(&mut self, out_audio: &mut [i16]) {\n        self.blocks += 1;",
         """    fn render(&mut self, out_audio: &mut [i16]) {
        self.mic.capture(out_audio.len()/2);
        self.blocks += 1;"""),
    ):
        dsp_source = replace_once(dsp_source, old, new)
    # The status block is further modified by earlier patches, so match its
    # single stable return at the end of the status match arm.
    status_anchor: str = '                Some(s)\n            }\n            "capinfo"'
    dsp_source = replace_once(
        dsp_source, status_anchor,
        '                s.push_str(&self.mic.report());\n' + status_anchor)
    dsp_path.write_text(dsp_source)

    engine_path: Path = root / "src/seq/engine.ts"
    engine_source: str = engine_path.read_text()
    mic_interface: str = """
export type NativeScaleMicFrame={
    available:boolean; listening:boolean; seq:number; values:number[];
};
let nativeScaleMicFrame:NativeScaleMicFrame|null=null;
export function scaleMicNativeFrame():NativeScaleMicFrame|null {
    return nativeScaleMicFrame;
}
"""
    engine_source = replace_once(engine_source,
        "let lastEnginePlay: boolean | null = null;",
        mic_interface + "\nlet lastEnginePlay: boolean | null = null;")
    engine_source = replace_once(engine_source,
        "function parseStatus(s: string): void {",
        """function parseStatus(s: string): void {
    let micAvailable:boolean|null=null, micListening:boolean|null=null;
    let micData:{seq:number;values:number[]}|null=null;""")
    engine_source = replace_once(engine_source,
        "        if (key === 'play')",
        """        if(key==='mca')micAvailable=val==='1';
        else if(key==='mcs')micListening=val==='1';
        else if(key==='mcv'){
            const [sequence,hex]=val.split('.');
            if(/^\\d+$/.test(sequence)&&/^[0-9a-f]{24}$/.test(hex)){
                micData={seq:Number(sequence),
                    values:Array.from({length:12},(_,i)=>parseInt(hex.slice(i*2,i*2+2),16)/127)};
            }
        }
        else if (key === 'play')""")
    engine_source = replace_once(engine_source,
        "    adoptLoopWindow();",
        """    if(micAvailable!==null&&micListening!==null&&micData){
        nativeScaleMicFrame={available:micAvailable,listening:micListening,
            seq:micData.seq,values:micData.values};
    }else nativeScaleMicFrame=null;
    adoptLoopWindow();""")
    engine_source = replace_once(engine_source,
        "    lastEnginePlay = null;",
        "    lastEnginePlay = null;\n    nativeScaleMicFrame=null;")
    engine_path.write_text(engine_source)

    scale_path: Path = root / "src/seq/scale-finding.ts"
    scale_source: str = scale_path.read_text()
    scale_source = replace_once(scale_source,
        "import { appState } from '../app/state.js';",
        """import { appState } from '../app/state.js';
import { scaleMicNativeFrame } from './engine.js';
declare const host_browser_engine_ready: (()=>boolean)|undefined;""")
    scale_source = replace_once(scale_source,
        "let lastEvidenceAt=0;",
        """let lastEvidenceAt=0;
let lastNativeMicSeq=-1;
function nativeMicWrite(enabled:boolean):void {
    // Browser Studio owns getUserMedia; never touch its fake host DSP.
    if(typeof host_browser_engine_ready==='function')return;
    if(typeof host_module_set_param_blocking==='function')
        host_module_set_param_blocking('mic_listen',enabled?'1':'0',50);
    else if(typeof host_module_set_param==='function')
        host_module_set_param('mic_listen',enabled?'1':'0');
}
export function scaleFindingMicrophoneTick():void {
    if(typeof host_browser_engine_ready==='function')return;
    if(!scaleFindingActive()){
        if(microphoneListening)setScaleMicrophoneListening(false);
        return;
    }
    const frame=scaleMicNativeFrame();
    if(!frame)return;
    if(microphoneAvailable!==frame.available)setScaleMicrophoneAvailable(frame.available);
    if(!frame.available&&microphoneListening)setScaleMicrophoneListening(false);
    if(microphoneListening&&frame.seq!==lastNativeMicSeq){
        lastNativeMicSeq=frame.seq;
        if(frame.listening)ingestScaleChroma(frame.values);
    }
}
""")
    scale_source = replace_once(scale_source,
        "    if(microphoneListening!==!!next){\n        microphoneListening=!!next;",
        """    if(microphoneListening!==!!next){
        nativeMicWrite(!!next);
        microphoneListening=!!next;""")
    scale_source = replace_once(scale_source,
        "    enabled=next;\n    armed=false;",
        """    if(!next&&microphoneListening)nativeMicWrite(false);
    enabled=next;
    armed=false;""")
    scale_path.write_text(scale_source)

    tick_path: Path = root / "src/app/tick.ts"
    tick_source: str = tick_path.read_text()
    tick_source = "import {scaleFindingMicrophoneTick} from '../seq/scale-finding.js';\n" + tick_source
    tick_source = replace_once(tick_source,
        "    tickModeHelp();",
        "    tickModeHelp();\n    scaleFindingMicrophoneTick();")
    tick_path.write_text(tick_source)

    # Ensure a deployed .so cannot silently retain the previous ABI behavior.
    ui_version: Path = root / "src/seq/constants.ts"
    rust_text: str = dsp_path.read_text()
    ui_text: str = ui_version.read_text()
    rust_match = re.search(r'const ENGINE_VERSION: &str = "([^"]+)";', rust_text)
    ui_match = re.search(r"export const ENGINE_VERSION = '([^']+)';", ui_text)
    if not rust_match or not ui_match or rust_match.group(1)!=ui_match.group(1):
        raise RuntimeError("Native/UI engine version diverged before mic update")
    version: str = "0.97.0-scale-mic1"
    dsp_path.write_text(rust_text.replace(rust_match.group(0),
        f'const ENGINE_VERSION: &str = "{version}";'))
    ui_version.write_text(ui_text.replace(ui_match.group(0),
        f"export const ENGINE_VERSION = '{version}';"))
