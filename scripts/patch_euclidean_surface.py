"""Expose Euclidean rhythm observations on the existing Chord Play surface."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_euclidean_surface(root: Path) -> None:
    """Share step gestures and drawing between Move and browser controllers."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/comp-generator'
    filename: str
    for filename in ('euclidean-web.mjs','generator-web.mjs'):
        (root / filename).write_text((assets / filename).read_text())
    (root / 'src/seq/euclidean-surface.ts').write_text((assets / 'euclidean-surface.ts').read_text())
    path: Path = root / 'src/seq/chord-play.ts'
    source: str = "import {generatorEuclideanView,generatorRotateStep,generatorEuclidean,euclideanExpressionKeys} from './comp-generator.js';\nimport {tickEuclidean,paintEuclideanSteps,drawEuclidean} from './euclidean-surface.js';\nimport {deleteActive} from './edit-ops.js';\nimport {dupActive} from './duplicate.js';\n" + path.read_text()
    source = replace_once(source, "    if(generatorCloud())add('cp_cloud_field'", "    if(generatorEuclidean())add('cp_euclidean_expression',generatorActor()+' Expression',euclideanExpressionKeys);\n    if(generatorCloud())add('cp_cloud_field'")
    source = source.replace("['cp_comp_generator','cp_generator_browser','cp_cloud_field'", "['cp_comp_generator','cp_generator_browser','cp_cloud_field','cp_euclidean_expression'")
    source = replace_once(source, 'export function tickChord():void{', '''function euclideanPageView() {
    if(!chordActive()||settingsActive()||paramPageActive()||page?.ctl.hbNavigation?.isMenu()||page?.ctl.state.pickerOpen||partModalActive()||motifLoaderActive(performanceOwner(setup.conductor))||!['cp_comp_generator','cp_euclidean_expression'].includes(page?.ctl.page?.level??''))return null;
    return generatorEuclideanView(generatorTarget(setup.comp,setup.bass,appState.activeTrack.index));
}
export function tickChord():void{
    tickEuclidean(euclideanPageView());''')
    # Reuse the existing held-step release path even when the user changes page.
    source = replace_once(source, '    const ownerTrack=conductorTrack(),conductorOwner', '''    if(!surface&&panels&&(down||up)&&key>=16&&key<32&&euclideanPageView()&&!seqState.loopMode&&!seqState.trackSelectHold&&!appState.shiftHeld&&!muteHeld()&&!deleteActive()&&!dupActive()){
        if(down){steps.add(key);generatorRotateStep(key-16);appState.dirty=true;}return true;
    }
    const ownerTrack=conductorTrack(),conductorOwner''')
    source = replace_once(source, '    if(chordActive())for(let index=0;index<16;index++){', '    const euclidean=euclideanPageView();if(euclidean)paintEuclideanSteps(euclidean);\n    else if(chordActive())for(let index=0;index<16;index++){')
    source = replace_once(source, "drawBankBar(current.pageIndex,current.pageCount);current.render('Chord Play');", "drawBankBar(current.pageIndex,current.pageCount);current.render('Chord Play');\n    const euclidean=euclideanPageView();if(euclidean&&current.ctl.page?.level==='cp_comp_generator'&&contextVisible(current))drawEuclidean(euclidean);")
    path.write_text(source)
    path = root / 'src/seq/chord-settings-layout.ts'
    path.write_text(path.read_text().replace("['cp_comp_generator','cp_cloud_field'", "['cp_comp_generator','cp_cloud_field','cp_euclidean_expression'"))
    path = root / 'src/renderer/panel-catalog.ts'
    source = replace_once(path.read_text(), "cp_comp_generator:'Libraries',", "cp_comp_generator:'Libraries',cp_euclidean_expression:'Libraries',")
    path.write_text(source.replace("['cp_comp_generator','cp_generator_browser','cp_cloud_field'", "['cp_comp_generator','cp_generator_browser','cp_cloud_field','cp_euclidean_expression'"))
    path = root / 'build/browser.mjs'
    path.write_text(replace_once(path.read_text(), '    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/seq/euclidean-surface.ts'),"))
