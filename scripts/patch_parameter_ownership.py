"""Share settings-page control ownership across performance modes."""
from pathlib import Path
import shutil
import subprocess
from patch_responsive_persistence import replace_once


def patch_parameter_ownership(root: Path) -> None:
    """Apply the strict ownership patch and install its real app-loop regression."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/parameter-ownership'
    patch: Path = assets / 'parameter-ownership.patch'
    subprocess.run(['git', '-C', str(root), 'apply', '--check', str(patch)], check=True)
    subprocess.run(['git', '-C', str(root), 'apply', str(patch)], check=True)
    shutil.copy2(assets / 'hb-parameter-ownership.mjs', root / 'browser-test/hb-parameter-ownership.mjs')
    shutil.copy2(assets / 'hb-automation-contract.mjs', root / 'browser-test/hb-automation-contract.mjs')
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = path.read_text()
    source = replace_once(source, "import type { TrackPort } from '../track/port.js';",
                          "import type { TrackPort } from '../track/port.js';\nimport type { KnobParamInfo } from '../model/store.js';")
    source = replace_once(source, 'knobParamInfo(slot: number): any | null;',
                          'knobParamInfo(slot: number): KnobParamInfo | null;')
    source = replace_once(source,
        'targetAt: (slot: number) => { const k = keyAt(slot); return k ? qualify(k) : null; },',
        'targetAt: (slot: number) => { const cell = ctl.describePage().cells[slot]; return cell ? qualify(cell.fullKey) : null; },')
    start: int = source.index('        knobParamInfo(slot: number) {')
    end: int = source.index('        /*', source.index('\n        },', start))
    source = source[:start] + '''        knobParamInfo(slot: number): KnobParamInfo | null {
            // The controller already resolves child keys and named enum values.
            // Consume that same cached description; do not reinterpret the wire.
            const cell = ctl.describePage().cells[slot];
            const meta = ctl.metaAt(slot);
            if (!cell || !meta) return null;
            const fullKey = qualify(cell.fullKey), prefix = componentKey + ':';
            if (!fullKey.startsWith(prefix)) return null;
            const min = typeof meta.min === 'number' ? meta.min : 0;
            const max = typeof meta.max === 'number' ? meta.max : 1;
            const value = cell.kind === 'enum' ? cell.enumIndex : Number(cell.raw);
            const validValue = cell.raw != null && String(cell.raw).trim() !== '' &&
                Number.isFinite(value) && value >= min && value <= max;
            return {
                gi: slot, key: cell.key, ioKey: fullKey.slice(prefix.length), target: componentKey,
                value: validValue ? value : min, min, max,
                type: meta.type || (cell.kind === 'enum' ? 'enum' : 'float'),
                automatable: cell.turnable && meta.automatable !== false && validValue &&
                    Number.isFinite(meta.min) && Number.isFinite(meta.max) && max > min,
            };
        },
''' + source[end:]
    title_lines: str = '''            const editTarget=String(ctl.state.values.chord_edit_target||'Track Settings');
            if(keysOf().includes('chord_edit_target')&&editTarget.startsWith('Lane '))title+=' · '+editTarget;
'''
    if source.count(title_lines) != 1:
        raise RuntimeError('Expected one chord editor title before sharing its description')
    source = source.replace(title_lines, '', 1)
    source = replace_once(source, '            if(drawMotifLoader(lanePort))return;\n',
                          '            if(drawMotifLoader(lanePort))return;\n' + title_lines +
                          '            const description = ctl.describePage({ title });\n')
    source = replace_once(source, '''                const decs = keysOf().map((k) => {
                    if (!k) return null;
                    const lane = auto.laneForKey(k as string);''', '''                const decs = description.cells.map((cell: any) => {
                    if (!cell) return null;
                    const key = qualify(cell.fullKey).slice(componentKey.length + 1);
                    const lane = auto.laneForKey(key);''')
    source = replace_once(source, '''                    return held === undefined ? { locked: true }
                                              : { locked: true, value: held };''', '''                    const value = held !== undefined && cell.kind === 'enum'
                        ? lib.enumWireValue(ctl.metaAt(cell.slot), Math.round(held), cell.raw) : held;
                    return value === undefined ? { locked: true }
                                               : { locked: true, value };''')
    source = replace_once(source, 'const touchHeader = ctl.describePage({ title }).header;',
                          'const touchHeader = description.header;')
    path.write_text(source)
    path = root / 'src/renderer/schwung-lib.ts'
    source = path.read_text()
    source = replace_once(source, '    createController: any;', '    createController: any;\n    enumWireValue: any;')
    source = replace_once(source, 'const [pc, pi, rpm, el, wr, vo] = await Promise.all([',
                          'const [pc, pi, rpm, el, wr, vo, pf] = await Promise.all([')
    source = replace_once(source, "        import('../vendor/schwung/shared/param_pages/voices.mjs'),", """        import('../vendor/schwung/shared/param_pages/voices.mjs'),
        // @ts-ignore — existing bundled wire-format helper; no host reads
        import('../vendor/schwung/shared/param_format.mjs'),""")
    source = replace_once(source, '        applyInput: pi.applyInput,',
                          '        applyInput: pi.applyInput, enumWireValue: pf.enumWireValue,')
    path.write_text(source)
    print('Parameter pages: shared input/display/LED ownership, onset releases and bounded LED retries')
