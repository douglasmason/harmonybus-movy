import { previewTest, previewTestLines, previewTestVisible, PREVIEW_TEST_PHOTOS } from '../seq/preview-test.js';
import { fontPrint5x3, fontWidth5x3 } from '../font/index5x3.js';
import { fontPrintBig, fontWidthBig } from '../font/big.js';

/** Stable photo pages; each number is a separate peak, never a summed deadline. */
export function renderPreviewTest(): boolean {
    if (!previewTestVisible()) return false;
    if (!['intro', 'results', 'error'].includes(previewTest.stage)) {
        const letter = String.fromCharCode(65 + previewTest.pass);
        const running = previewTest.stage === 'run';
        const heading = previewTest.stage === 'stop' ? 'SAVE ' : running ? 'TEST ' : 'NEXT ';
        fontPrintBig(0, 0, heading + letter, 1);
        if (running) {
            const countdown = previewTest.remaining + 'S';
            fontPrintBig(128 - fontWidthBig(countdown), 0, countdown, 1);
        }
        fontPrintBig(0, 17, ['NORMAL', 'LP PAUSED', 'BOTH PAUSED'][previewTest.pass], 1);
        const activePass = ['settle', 'arming'].includes(previewTest.stage) ? Math.max(0, previewTest.pass - 1) : previewTest.pass;
        fontPrint5x3(0, 33, 'MOVE PREVIEW: ' + (activePass === 2 ? 'PAUSED' : 'ON'), 1);
        fontPrint5x3(0, 41, 'LAUNCHPAD PREVIEW: ' + (activePass > 0 ? 'PAUSED' : 'ON'), 1);
        fontPrint5x3(0, 49, running ? 'LISTEN NOW. KEEP HANDS OFF.' : 'WAIT - AUDIO KEEPS PLAYING', 1);
        fontPrint5x3(0, 59, 'BACK:CANCEL + RESTORE', 1);
        return true;
    }
    if (previewTest.stage === 'results' && (previewTest.photo === 0 || previewTest.photo === 4)) {
        const cadence = previewTest.photo === 4;
        fontPrint5x3(0, 0, 'PHOTO ' + (previewTest.photo + 1) + '/' + PREVIEW_TEST_PHOTOS + (cadence ? '  CADENCE US' : '  ABC PEAK US'), 1);
        ['A ALL', 'B MOVE', 'C NONE'].forEach((label, column) => fontPrint5x3(36 + column * 34, 8, label, 1));
        const rows = cadence ? ['GAP', '>1.5X', 'IDLE', 'PREV', 'REQ', 'BLOCK'] : ['AUDIO', 'OVER', 'READ', 'WRITE', 'MIDI', 'BURST'];
        const columns = previewTest.captures.map(capture => cadence ? [24,23,25,26,27,28].map(index => capture.audio[index]) : [capture.audio[4], capture.audio[2],
            ...[3, 5, 7, 1].map(index => Number(capture.requests[index]))]);
        rows.forEach((label, index) => {
            const row = 16 + index * 7;
            fontPrint5x3(0, row, label, 1);
            columns.forEach((values, column) => {
                const value = values[index];
                const text = value < 10000000 ? String(value) : value.toExponential(1).toUpperCase();
                fontPrint5x3(60 + column * 34 - fontWidth5x3(text), row, text, 1);
            });
        });
        fontPrint5x3(0, 59, 'CLICK:NEXT PHOTO  BACK:EXIT', 1);
    } else {
        previewTestLines().forEach((line, index) => fontPrint5x3(0, index === 7 ? 59 : index * 8, line.slice(0, 32), 1));
    }
    return true;
}
