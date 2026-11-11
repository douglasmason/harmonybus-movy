"""Add validated numeric lane metadata to the existing automation contract."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_automation_reader(root: Path) -> None:
    """Persist target capability and share the native/browser reader controls."""
    path: Path = root / "engine/crates/seq-core/src/track.rs"
    source: str = path.read_text()
    source = replace_once(source, "    pub lane_assigned: [bool; 8],",
                          "    pub lane_assigned: [bool; 8],\n    pub lane_numeric: [bool; 8],")
    source = replace_once(source, "            lane_assigned: [false; 8],",
                          "            lane_assigned: [false; 8],\n            lane_numeric: [false; 8],")
    path.write_text(source)
    path = root / "engine/crates/seq-core/src/engine.rs"
    source = path.read_text()
    source = replace_once(source, "            self.tracks[track].lane_label[lane] = label.to_string();",
                          "            if self.tracks[track].lane_label[lane]!=label {self.tracks[track].lane_numeric[lane]=false;}\n            self.tracks[track].lane_label[lane] = label.to_string();")
    source = source.replace("self.tracks[track].lane_assigned[lane] = false;",
                            "self.tracks[track].lane_assigned[lane] = false;\n                self.tracks[track].lane_numeric[lane] = false;")
    path.write_text(source)
    path = root / "engine/crates/seq-core/src/persist.rs"
    source = path.read_text()
    source = replace_once(source, 's.push_str(&format!("au {} {} {} {}\\n", ti, lane, t.lane_base[lane], t.lane_label[lane]));',
                          's.push_str(&format!("au {} {} {} {}\\n", ti, lane, t.lane_base[lane], t.lane_label[lane]));\n                if t.lane_numeric[lane] {s.push_str(&format!("an {} {} {}\\n",ti,lane,t.lane_label[lane]));}')
    source = replace_once(source, "        t.lane_assigned = [false; 8];",
                          "        t.lane_assigned = [false; 8];\n        t.lane_numeric = [false; 8];")
    source = replace_once(source, '            Some("au") => {', '''            Some("an") => {
                let track=it.next().and_then(|value|value.parse::<usize>().ok());
                let lane=it.next().and_then(|value|value.parse::<usize>().ok());
                if let (Some(track),Some(lane),Some(label))=(track,lane,it.next()) {
                    engine.auto_numeric(track,lane,label,true);
                }
            }
            Some("au") => {''')
    path.write_text(source)
    path = root / "engine/crates/seq-core/src/command.rs"
    source = path.read_text()
    source = replace_once(source, '| "abase" | "abaseq" | "alabel"', '| "abase" | "abaseq" | "alabel" | "akind"')
    source = replace_once(source, '        "alabel" => {', '''        "akind" => {
            let track=it.next().and_then(|value|value.parse::<usize>().ok());
            let lane=it.next().and_then(|value|value.parse::<usize>().ok());
            let numeric=it.next().and_then(|value|value.parse::<u8>().ok());
            if let (Some(track),Some(lane),Some(numeric),Some(label))=(track,lane,numeric,it.next()) {
                if numeric<=1 {engine.auto_numeric(track,lane,label,numeric==1);}
            }
        }
        "alabel" => {''')
    path.write_text(source)
    path = root / "src/undo/verbs.ts"
    source = replace_once(path.read_text(), "'abase', 'abaseq', 'alabel'", "'abase', 'abaseq', 'alabel', 'akind'")
    path.write_text(source)
    path = root / "src/model/store.ts"
    source = path.read_text()
    source = replace_once(source, "    automatable: boolean;", "    automatable: boolean;\n    continuous?: boolean;")
    source = replace_once(source, "type: p.type, automatable: paramAutomatable(s, p)",
                          "type: p.type, continuous: !p.options?.length, automatable: paramAutomatable(s, p)")
    path.write_text(source)
    path = root / "src/model/index.ts"
    source = path.read_text()
    source = replace_once(source, "paramRangeByKey(key: string): { min: number; max: number; type: string } | null",
                          "paramRangeByKey(key: string): { min: number; max: number; type: string; continuous?: boolean } | null")
    source = replace_once(source, "{ min: p.min, max: p.max, type: p.type } : null;",
                          "{ min: p.min, max: p.max, type: p.type, continuous: !p.options?.length } : null;")
    source = replace_once(source, "hasLoadedParams(): boolean { return s.knobParams.some((p) => p != null); },",
                          "hasLoadedParams(): boolean { return s.hierarchyKey === s.activeModuleName && s.knobParams.some((p) => p != null); },")
    path.write_text(source)
    path = root / "src/model/hierarchy.ts"
    source = path.read_text()
    source = "import { requestLabelSync } from '../seq/engine.js';\n" + source
    source = replace_once(source, "export function loadHierarchy(s: ModelState): void {",
                          "export function loadHierarchy(s: ModelState): void {\n    requestLabelSync(); // revalidate lanes after this synchronous metadata rebuild")
    path.write_text(source)
    path = root / "src/renderer/schwung-page.ts"
    source = path.read_text()
    source = replace_once(source, "type: meta.type || (cell.kind === 'enum' ? 'enum' : 'float'),",
                          "type: meta.type || (cell.kind === 'enum' ? 'enum' : 'float'),\n                continuous: cell.kind !== 'enum',")
    path.write_text(source)
    path = root / "src/seq/automation.ts"
    source = path.read_text()
    source = replace_once(source, "export type LaneRange = { min: number; max: number; type: string };",
                          "export type LaneRange = { min: number; max: number; type: string; continuous?: boolean };")
    source = replace_once(source, "const liveVal = new Map<string, number>();", '''// Capability follows the exact lane target; unknown metadata never opts in.
const numericKinds = new Map<string,string>();
function publishNumericKind(track:number,lane:number,target:string,info:LaneRange|null):void {
    const numeric=!!info && info.continuous!==false && Number.isFinite(info.min) && Number.isFinite(info.max) &&
        info.max>info.min && (info.type==='float' || (info.type==='int' && info.max-info.min>1));
    const key=track+':'+lane,signature=target+':'+Number(numeric);
    if(numericKinds.get(key)===signature)return;
    numericKinds.set(key,signature);
    seqSideEffect(()=>seqCmd('akind '+track+' '+lane+' '+Number(numeric)+' '+target));
}
const liveVal = new Map<string, number>();''')
    source = replace_once(source, "    liveVal.clear();", "    liveVal.clear();\n    numericKinds.clear();")
    source = replace_once(source, "    if (existing >= 0) return existing;",
                          "    if (existing >= 0) {publishNumericKind(track,existing,tp,info);return existing;}")
    source = replace_once(source, "    seqCmd('alabel ' + track + ' ' + lane + ' ' + tp);",
                          "    seqCmd('alabel ' + track + ' ' + lane + ' ' + tp);\n    publishNumericKind(track,lane,tp,info);")
    source = replace_once(source, "    registry[track][lane] = null;",
                          "    registry[track][lane] = null;\n    numericKinds.delete(track+':'+lane);")
    source = replace_once(source, "    if (lane < 0) return true; // consumed; pool-full state (poolIsFull) drives the toast",
                          "    if (lane < 0) return true; // consumed; pool-full state (poolIsFull) drives the toast\n    publishNumericKind(track,lane,tp,info);")
    source = replace_once(source, "    const tracks = alabels.split(',');",
                          "    const tracks = alabels.split(',');\n    numericKinds.clear();")
    source = replace_once(source, "            apply(t, l, tp);",
                          "            apply(t, l, tp);\n            publishNumericKind(t,l,tp,v==='unknown'?null:v);")
    source = replace_once(source, "        if (c === 1 && verify) {",
                          "        if (c === 1) requestLabelSync();\n        if (c === 1 && verify) {")
    path.write_text(source)
    path = root / "build/browser.mjs"
    source = replace_once(path.read_text(), "        resolve(root, 'src/seq/joint-panels.ts'),",
                          "        resolve(root, 'src/seq/joint-panels.ts'),\n        resolve(root, 'src/seq/source-panels.ts'),")
    path.write_text(source)
    for relative in ("src/seq/constants.ts", "engine/crates/movy-dsp/src/lib.rs"):
        path = root / relative
        path.write_text(path.read_text().replace("0.105.0-cloud4", "0.107.0-cloud-xy1"))
