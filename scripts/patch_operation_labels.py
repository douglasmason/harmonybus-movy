"""Give touch-only operation controls the full existing settings cell."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_operation_labels(root: Path) -> None:
    """Mark HB gestures once in metadata and reuse the shared renderer/fonts."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/settings-case'
    pages: Path = root / 'src/vendor/schwung/shared/param_pages'
    (pages / 'action_label.mjs').write_text((assets / 'action_label.mjs').read_text())
    path: Path = root / 'src/renderer/hb-step-panels.ts'
    source: str = path.read_text()
    source += '''
/** Gesture keys are actions, not numeric amounts. Preserve wire metadata. */
export function markOperationLabels(parameters:any[]):void {
    for(const parameter of parameters){
        const key=String(parameter.key??'').replace(/^cp_track_\\d+_/,'');
        if(/^follow_touch_[1-9]$/.test(key)||(/^motion_control_(?:[1-9]|[1-4]\\d|5[01])$/.test(key)&&parameter.type==='int'&&!parameter.options))
            parameter.movy_action_label=true;
    }
}
'''
    source = replace_once(source, '    const levels = hierarchy.levels;',
                          '    const levels = hierarchy.levels;\n    for(const level of Object.values<any>(levels??{}))markOperationLabels(level.params??[]);')
    path.write_text(source)
    path = root / 'src/renderer/schwung-page.ts'
    source = "import {markOperationLabels} from './hb-step-panels.js';\n" + path.read_text()
    source = replace_once(source, 'orderHarmonyChoices(parameters);', 'orderHarmonyChoices(parameters);markOperationLabels(parameters);')
    source = replace_once(source, '            return meta?.options_as_string',
                          "            if(meta?.movy_action_label)return '';\n            return meta?.options_as_string")
    path.write_text(source)
    path = pages / 'render_page_movy.mjs'
    source = "import {drawActionLabel} from './action_label.mjs';\n" + path.read_text()
    source = replace_once(source, '        const isTouched = held.indexOf(slot) >= 0;', '''        const isTouched = held.indexOf(slot) >= 0;
        if(meta.movy_action_label){
            drawActionLabel(ctx,cellX,rowY,g.cellW,lblY-rowY+FONT4_HEIGHT,meta.label||meta.name,isTouched);
            continue;
        }''')
    path.write_text(source)
    (root / 'browser-test/hb-action-label.mjs').write_text((assets / 'hb-action-label.mjs').read_text())
