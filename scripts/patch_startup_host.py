"""Keep an opening editor attached to the track's resolved host."""
from pathlib import Path
from patch_responsive_persistence import replace_once

def patch_startup_host(root: Path) -> None:
    """Invalidate captured editor ports after host selection changes."""
    path: Path = root / 'src/renderer/schwung-grid.ts'
    source: str = path.read_text()
    source = replace_once(source, "import { portFor } from '../track/registry.js';", "import { portFor } from '../track/registry.js';\nimport type { TrackPort } from '../track/port.js';\nconst editorPorts = new WeakMap<SchwungPage, TrackPort>();")
    source = replace_once(source, '''    let p = pages.get(id);
    if (!p) {
        p = createSchwungPage(portFor(trackIndex), componentKey);''', '''    const port = portFor(trackIndex);
    let p = pages.get(id);
    // Opening a Set can resolve its host after this editor first draws.
    // Metadata retries cannot repair a page that captured the OLD port.
    if (!p || editorPorts.get(p) !== port) {
        p = createSchwungPage(port, componentKey);
        editorPorts.set(p, port);''')
    source = replace_once(source, "    return schwungGridMode() === 'page' ? pages.get(track + ':' + component) ?? null : null;", "    if (schwungGridMode() !== 'page') return null;\n    const page = pages.get(track + ':' + component);\n    return page && editorPorts.get(page) === portFor(track) ? page : null;")
    path.write_text(source)
