/** Observe the production page ruler without changing any device pixels. */
export function observePanelBar(contents){
 const start='    if (bankCount <= 1) return;';
 const end='\n}\n\nexport function drawPadGridIcon';
 const segment='        const h    = b === bankIndex ? 2 : 1;';
 for(const seam of [start,end,segment])if(contents.split(seam).length!==2)throw new Error('Movy panel ruler seam changed');
 return contents.replace(start,`    const browserSegments: number[][] = [];
    try {
${start}`).replace(segment,segment+'\n        browserSegments.push([x, barY, segW, 2]);')
  .replace(end,`\n    } finally {
        globalThis.host_browser_panel_bar?.({index: bankIndex, count: bankCount, segments: browserSegments});
    }${end}`);
}
