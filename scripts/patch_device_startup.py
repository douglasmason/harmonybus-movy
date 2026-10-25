"""Keep motif catalogs independent of UI controllers and their import cycles."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_device_startup(root: Path) -> None:
    """Move shared immutable choices to a leaf module before bundling."""
    renderer = root / 'src/renderer'
    approach_path = renderer / 'hb-approach.ts'
    approach_source = approach_path.read_text()
    catalog_lines = []
    for name in ('APPROACH_MOTIFS', 'TRIPLE_MOTIFS'):
        definition = next(line for line in approach_source.splitlines() if line.startswith(f'export const {name}'))
        catalog_lines.append(definition)
        assert approach_source.count(definition + '\n') == 1
        approach_source = approach_source.replace(definition + '\n', '', 1)
    approach_path.write_text("import {APPROACH_MOTIFS,TRIPLE_MOTIFS} from './hb-motif-catalog.js';\nexport {APPROACH_MOTIFS,TRIPLE_MOTIFS} from './hb-motif-catalog.js';\n" + approach_source)
    loader_path = renderer / 'hb-motif-loader.ts'
    loader_source = loader_path.read_text()
    definition = next(line for line in loader_source.splitlines() if line.startswith('export const MOTIF_LOAD_CHOICES='))
    catalog_lines.append(definition)
    loader_source = replace_once(loader_source, definition + '\n', "import {MOTIF_LOAD_CHOICES} from './hb-motif-catalog.js';\nexport {MOTIF_LOAD_CHOICES} from './hb-motif-catalog.js';\n")
    loader_source = loader_source.replace("from './hb-approach.js'", "from './hb-motif-catalog.js'")
    loader_path.write_text(loader_source)
    (renderer / 'hb-motif-catalog.ts').write_text('/** Immutable musical choices; no controller or runtime imports. */\n' + '\n'.join(catalog_lines) + '\n')
    content_path = root / 'src/seq/conductor-content.ts'
    content_path.write_text(replace_once(content_path.read_text(), "import {MOTIF_LOAD_CHOICES,previewMotifSequence} from '../renderer/hb-motif-loader.js';", "import {MOTIF_LOAD_CHOICES} from '../renderer/hb-motif-catalog.js';\nimport {previewMotifSequence} from '../renderer/hb-motif-loader.js';"))
