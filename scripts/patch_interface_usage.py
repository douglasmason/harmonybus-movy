"""Wire bounded, local interaction observation into existing UI lifecycle seams."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_interface_usage(root: Path) -> None:
    """Instrument user dispatch, never the DSP or parameter polling path."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/interface-usage'
    for filename in ('interaction-log.ts', 'interface-usage.ts'):
        (root / 'src/app' / filename).write_text((assets / filename).read_text())
    for filename in ('hb-interface-usage.mjs', 'hb-panel-catalog.mjs'):
        (root / 'browser-test' / filename).write_text((assets / filename).read_text())
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = "import {observeUsagePanel,usageParameters,usageValue,setUsageValue,usageAction} from '../app/interface-usage.js';\n" + path.read_text()
    source = replace_once(source, '        getParam: (k: string) => {', "        getParam: (k: string) => {\n            const usage=hostedModuleId==='harmonybus'?usageValue(k.split(':').pop()??''):null;if(usage!==null)return usage;")
    source = replace_once(source, '        setParam: (k: string, v: string) => {', "        setParam: (k: string, v: string) => {\n            if(hostedModuleId==='harmonybus'&&k.split(':').pop()?.startsWith('usage_')){setUsageValue(k.split(':').pop()!,v);return;}")
    source = replace_once(source, 'orderHarmonyChoices(parameters);v=JSON.stringify(parameters);', 'orderHarmonyChoices(parameters);if(parameters.length)parameters.push(...usageParameters);v=JSON.stringify(parameters);')
    source = replace_once(source, '        knobTouch: (slot: number, down: boolean) => {', "        knobTouch: (slot: number, down: boolean) => {\n            if(hostedModuleId==='harmonybus'&&!navigation.isMenu()&&down&&usageAction(ctl.keyAt(slot)??'',appState.shiftHeld)){ctl.revalue();touchPaintPending=true;return;}")
    # Keep reporting labels in sync after direct controls and navigation; no reads.
    source = replace_once(source, '    return {\n        reload, tick,', '    const result:SchwungPage = {\n        reload, tick,')
    ending: str = """    };
    for(const key of ['render','changePage','goToPage','click','back','knobTurn','knobTouch'] as const){
        const original=(result as any)[key];
        (result as any)[key]=(...args:any[])=>{try{return original(...args);}finally{if(hostedModuleId==='harmonybus')observeUsagePanel(navigationMode,ctl);}};
    }
    return result;
}
"""
    if not source.endswith('    };\n}\n'):
        raise RuntimeError('Shared page binding changed; inspect instrumentation seam')
    source = source[:-len('    };\n}\n')] + ending
    path.write_text(source)

    path = root / 'src/midi/router.ts'
    source = "import {usageContext,usageControl,recordUsageInput} from '../app/interface-usage.js';\nimport {sessionPlayMode} from '../seq/router-buttons.js';\n" + path.read_text()
    source = replace_once(source, 'export function onMidiMessageInternal(data: number[]): void {', """export function onMidiMessageInternal(data: number[]): void {
    if(!data||data.length<3)return;
    const type=data[0]&240;
    if(type!==144&&type!==128&&type!==176){dispatchMidiMessageInternal(data);return;}
    const before=usageContext(sessionPlayMode()),control=usageControl(data[1]<8?data[1]:data[1]-71,before);
    try{dispatchMidiMessageInternal(data);}finally{recordUsageInput(data,before,usageContext(sessionPlayMode()),Date.now(),control);}
}
function dispatchMidiMessageInternal(data: number[]): void {""")
    path.write_text(source)
    path = root / 'src/app/init.ts'
    source = "import {initInterfaceUsage} from './interface-usage.js';\n" + path.read_text()
    path.write_text(replace_once(source, 'export function init(): void {', 'export function init(): void {\n    initInterfaceUsage();'))
    path = root / 'src/app/tick.ts'
    source = "import {tickInterfaceUsage} from './interface-usage.js';\n" + path.read_text()
    path.write_text(replace_once(source, '    perfProbeTick();', '    perfProbeTick();\n    tickInterfaceUsage();'))

    path = root / 'build/browser.mjs'
    source = path.read_text()
    path.write_text(replace_once(source, '    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/app/interaction-log.ts'),\n        resolve(root, 'src/app/interface-usage.ts'),\n        resolve(root, 'src/renderer/panel-catalog.ts'),"))
