"""Bundle the pinned shared controller and preserve case in every settings font."""
from __future__ import annotations

import json
import os
import re
import shutil
import string
import subprocess
from pathlib import Path

SCHWUNG_BASE_REF: str = 'a6f7ec9e5cf4d0df172a1dbc00b29d0b5eb67124'
SCHWUNG_REF: str = '35f401c3876557606ee44fbc9f3e363a6e39fb84'


def replace_once(source: str, before: str, after: str) -> str:
    """Require a single pinned seam, including when the result is a substring."""
    count: int = source.count(before)
    if count != 1:
        raise RuntimeError(f'Expected one typography seam, found {count}: {before}')
    return source.replace(before, after, 1)


def append_lowercase(path: Path, table_name: str, glyphs: list[list[int]]) -> None:
    """Extend a shared font, leaving every existing glyph and advance intact."""
    source: str = path.read_text()
    count: int
    source, count = re.subn(
        r'((?:export )?const CHARS5? = .+);',
        lambda match: match[1] + ' + "' + string.ascii_lowercase + '";', source, count=1)
    if count != 1:
        raise RuntimeError(f'Missing character table in {path}')
    source = replace_once(source, 'const FALLBACK_ADV =',
                          f'{table_name}.push(...{json.dumps(glyphs)});\n\nconst FALLBACK_ADV =')
    path.write_text(source)


def tamzen_lowercase(schwung_root: Path) -> list[list[int]]:
    """Use six-row lowercase bodies and seven-row ascenders in the value band."""
    source: str = (schwung_root / 'fonts/tamzen/Tamzen6x12r.bdf').read_text()
    map_letter_to_rows: dict[str, list[int]] = {}
    block: str
    for block in source.split('STARTCHAR ')[1:]:
        encoding: re.Match[str] | None = re.search(r'^ENCODING (\d+)$', block, re.M)
        if encoding is None or not 97 <= int(encoding[1]) <= 122:
            continue
        bitmap: str = block.split('BITMAP\n')[1].split('ENDCHAR')[0]
        rows: list[int] = [int(row, 16) for row in bitmap.splitlines()]
        map_letter_to_rows[chr(int(encoding[1]))] = [
            sum(1 << column for column in range(5) if row & (128 >> column))
            for row in rows[2:9]]
    # The source has a 9-row mixed-case extent. Compact only these descenders,
    # rather than losing their tails or expanding a fixed-height widget.
    map_letter_to_rows.update(g=[0, 0, 14, 17, 30, 16, 14], j=[4, 0, 4, 4, 4, 5, 2],
                  p=[0, 0, 15, 17, 15, 1, 1], q=[0, 0, 30, 17, 30, 16, 16],
                  y=[0, 0, 17, 17, 30, 16, 14])
    normalized: list[list[int]] = []
    letter: str
    for letter in string.ascii_lowercase:
        rows = map_letter_to_rows[letter]
        occupied: list[int] = [index for index, row in enumerate(rows) if row]
        rows = rows[occupied[0]:occupied[-1] + 1]
        height: int = 7 if letter in 'bdfhklt' else 6
        normalized.append([6, 0, 5, 7, *([0] * (7 - height)),
                           *(rows[index * len(rows) // height] for index in range(height))])
    return normalized


def patch_settings_case(root: Path) -> None:
    """Use one packaged shared UI in browser/device, then fix its typography."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/settings-case'
    schwung_root: Path = Path(os.environ.get('SCHWUNG_ROOT', str(root.parent / 'schwung'))).resolve()
    revision: str = subprocess.check_output(
        ['git', '-C', str(schwung_root), 'rev-parse', 'HEAD'], text=True).strip()
    if revision not in (SCHWUNG_BASE_REF, SCHWUNG_REF):
        raise RuntimeError(f'Shared UI requires Schwung 1.7.3 or 1.8.2 sources, got {revision}')
    if subprocess.check_output(['git', '-C', str(schwung_root), 'diff', 'HEAD', '--',
                                'src/shared', 'fonts/tamzen'], text=True):
        raise RuntimeError('Shared UI inputs have uncommitted changes')
    vendor: Path = root / 'src/vendor/schwung/shared'
    shutil.copytree(schwung_root / 'src/shared', vendor, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('*.json', '*.c', '*.h'))
    if revision == SCHWUNG_BASE_REF:
        # Exact upstream delta, applied before our typography changes. This
        # keeps old-host builds offline and produces the same 1.8.2 controller
        # with either source checkout; no runtime version branch or new renderer.
        delta: Path = assets.parent / 'schwung-host/shared-ui-1.8.2.patch'
        subprocess.run(['git', '-C', str(root), 'apply', '-p2',
                        '--directory=src/vendor/schwung', str(delta)], check=True)
    pages: Path = vendor / 'param_pages'
    # Install one pixel-native large-font implementation for both the shared
    # settings renderer and Movy's custom chord widgets.
    shutil.copy2(assets / 'hb_large_font.mjs', pages / 'hb_large_font.mjs')
    (pages / 'hb_large_font.d.mts').write_text(
        "export type NativeFace = 'upper' | 'musical' | 'smooth';\n"
        "export const NATIVE_FONT_HEIGHT: number;\n"
        "export function nativeTextWidth(text: string, face?: NativeFace): number;\n"
        "export function drawNativeText(ctx: {fillRect(x:number,y:number,w:number,h:number,color:number):void}, x:number, y:number, text:string, face?:NativeFace, color?:number):number;\n"
    )
    lower: dict[str, list[int]] = json.loads((assets / 'lowercase.json').read_text())
    compact: dict[str, list[int]] = dict(lower)
    compact.update(a=[3, 0, 6, 4, 7, 6], b=[3, 1, 1, 3, 5, 3],
                   d=[3, 4, 4, 6, 5, 6], e=[3, 0, 2, 7, 1, 6],
                   g=[3, 0, 6, 5, 6, 3], h=[3, 1, 1, 3, 5, 5],
                   m=[3, 0, 7, 7, 5, 5], n=[3, 0, 3, 5, 5, 5],
                   o=[3, 0, 2, 5, 5, 2], p=[3, 0, 3, 5, 3, 1],
                   q=[3, 0, 6, 5, 6, 4], u=[3, 0, 5, 5, 5, 6],
                   w=[3, 0, 5, 5, 7, 7])
    append_lowercase(pages / 'font4x5.mjs', 'G',
                     [[data[0] + 1, 0, data[0], 5, *data[1:]] for data in lower.values()])
    append_lowercase(pages / 'font5x3.mjs', 'G5',
                     [[4, 0, data[0], 5, *data[1:]] for data in compact.values()])
    append_lowercase(pages / 'font_tamzen6x12.mjs', 'G', tamzen_lowercase(schwung_root))

    path: Path = pages / 'render_page_movy.mjs'
    source: str = path.read_text()
    source = replace_once(source,
        '/** Uppercase, ascii-folded — the register this grid sets in. font4x5 has no\n *  lowercase, so a mixed-case name would silently lose glyphs. */',
        '/** Fold unsupported Unicode while preserving musical and authored case. */')
    source = source.replace('caps(', 'displayText(')
    source = replace_once(source,
        'return asciiFold(String(s == null ? "" : s)).toUpperCase();',
        'return asciiFold(String(s == null ? "" : s));')
    source = replace_once(source, 'String(shown == null ? "" : shown).toUpperCase()',
                          'String(shown == null ? "" : shown)')
    source = replace_once(source, 'function preAbbreviate(label, budget) {',
        '''function matchWordCase(text, original) {
    if (original === original.toUpperCase()) return text.toUpperCase();
    if (original === original.toLowerCase()) return text.toLowerCase();
    return text[0].toUpperCase() + text.slice(1).toLowerCase();
}

function preAbbreviate(label, budget) {''')
    source = replace_once(source, 'const abbrev = WORD_ABBREV[lw];',
                          'const abbrev = WORD_ABBREV[lw] && matchWordCase(WORD_ABBREV[lw], w);')
    source = replace_once(source, '(ABBREV_CANONICAL.get(lw) || lw).toUpperCase()',
                          'matchWordCase(ABBREV_CANONICAL.get(lw) || lw, w)')
    path.write_text(source)
    path = pages / 'font5x3.mjs'
    source = path.read_text().replace('.toUpperCase()', '')
    source = source.replace('[A-Z0-9]', '[A-Za-z0-9]')
    source = source.replace('Fold to what this font can actually draw: ASCII, uppercase.',
                            'Legacy API name; display text now preserves letter case.')
    source = source.replace('Feed it uppercased, ascii-folded text: this font has no\n * lowercase by design.',
                            'Feed it ascii-folded text; both letter cases are supported.')
    path.write_text(source)
    path = pages / 'page_controller.mjs'
    source = path.read_text()
    for expression in ('childLabel(lvl.def, from)', 'childLabel(g.def, idx)'):
        source = replace_once(source, expression + '.toUpperCase()', expression)
    path.write_text(source)

    # Movy's surrounding chrome, lists and legacy controls share the same
    # lowercase skeleton as the proportional shared font, with Movy's padding.
    path = root / 'src/font/glyphs.ts'
    source = path.read_text()
    letter: str
    data: list[int]
    for letter, data in lower.items():
        glyph: list[int] = [data[0] + 2, 0, data[0] + 2, 5, *(row << 1 for row in data[1:])]
        count: int
        source, count = re.subn(r"  \[.*\],// '" + letter + "'", f"  {glyph},// '{letter}'", source)
        if count != 1:
            raise RuntimeError(f'Missing Movy glyph {letter}')
    path.write_text(source)
    # Notation opts in to the old small glyphs; every ordinary renderer keeps
    # the normalized atlas. Advances match, so font choice cannot reflow text.
    roman: dict[str, list[int]] = json.loads((assets / 'roman-lowercase.json').read_text())
    roman_glyphs: list[list[int]] = [
        [data[0] + 2, 0, data[0] + 2, 5, *(row << 1 for row in data[1:])]
        for data in roman.values()]
    (root / 'src/font/notation.ts').write_text(
        "import {G} from './glyphs.js';\nimport type {Glyph} from './blit.js';\n"
        + 'const lowercase: Glyph[] = ' + json.dumps(roman_glyphs) + ';\n'
        + 'export const notationGlyph = (code:number):Glyph|null => code>=97&&code<=122 ? lowercase[code-97] : G[code-32]??null;\n')
    path = root / 'src/font/glyphs5x3.ts'
    path.write_text(path.read_text() + '\nG5.push(...' + json.dumps(
        [[4, 0, data[0], 5, *data[1:]] for data in compact.values()]) + ');\n')
    path = root / 'src/font/index5x3.ts'
    path.write_text(re.sub(r'(export const CHARS5 = .+);', r'\1 + "' + string.ascii_lowercase + '";', path.read_text()))
    path = root / 'src/renderer/shorten.ts'
    path.write_text(path.read_text().replace('.toUpperCase()', '').replace('/[AEIOU]/g', '/[AEIOU]/gi'))
    for filename in ('model/trigger.ts', 'model/store.ts', 'model/index.ts'):
        path = root / 'src' / filename
        path.write_text(path.read_text().replace('(p.label || p.key).toUpperCase()', '(p.label || p.key)'))

    path = root / 'src/renderer/schwung-lib.ts'
    source = path.read_text()
    source = re.sub(r'/\* schwung-lib\.ts.*?\*/',
        '''/* The one door to the pinned, packaged Schwung shared UI.
 * Browser and device bundle the same controller, renderer and widget registry.
 * Imports settle during module evaluation, before the host registers callbacks;
 * no promise is created in the audio or UI tick path. The error boundary still
 * supplies a diagnostic if module evaluation fails. */''', source, count=1, flags=re.S)
    source = re.sub(r'/\* LITERAL PATHS, NOT A CONCATENATION\..*?\*/',
        '/* Literal local imports let esbuild package the identical graph on both targets. */',
        source, count=1, flags=re.S)
    source = source.replace('/data/UserData/schwung/shared/param_pages/', '../vendor/schwung/shared/param_pages/')
    source = source.replace('// @ts-ignore — absolute device path; external in the device build',
                            '// @ts-ignore — pinned shared .mjs source, bundled on both targets')
    license_text: str = '\n\n'.join((schwung_root / name).read_text()
                                    for name in ('LICENSE', 'fonts/tamzen/LICENSE'))
    license_text += '\n\n' + (root / 'LICENSE').read_text()
    source = '/*! Packaged Schwung shared UI, ' + SCHWUNG_REF + '\n' + license_text + '\n*/\n' + source
    path.write_text(source)
    path = root / 'src/app/globals.ts'
    path.write_text(path.read_text() + "\n// Device-bundle health probe, also useful to installation diagnostics.\nexport {schwungLibAvailable,schwungLibError} from '../renderer/schwung-lib.js';\n")
    shutil.copy2(assets / 'hb-settings-case.mjs', root / 'browser-test/hb-settings-case.mjs')
    shutil.copy2(assets.parent / 'schwung-host/hb-schwung-host.mjs',
                 root / 'browser-test/hb-schwung-host.mjs')
    subprocess.run(['git', '-C', str(root), 'apply', str(assets / 'upstream-tests.patch')], check=True)
    print('Packaged shared settings UI with mixed-case fonts: ' + SCHWUNG_REF)
