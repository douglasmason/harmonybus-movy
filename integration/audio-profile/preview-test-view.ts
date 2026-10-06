import { previewTest, previewTestLines, previewTestVisible } from '../seq/preview-test.js';
import { fontPrint5x3, fontWidth5x3 } from '../font/index5x3.js';

/** Stable photo pages; each number is a separate peak, never a summed deadline. */
export function renderPreviewTest(): boolean {
    if (!previewTestVisible()) return false;
    if (previewTest.stage === 'results' && previewTest.photo === 0) {
        const [normal, frozen] = previewTest.captures;
        fontPrint5x3(0, 0, 'PHOTO 1/3  A/B PEAK US', 1);
        fontPrint5x3(48, 8, 'A NORMAL  B FROZEN', 1);
        const rows: [string, number, number][] = [
            ['AUDIO', normal.audio[4], frozen.audio[4]],
            ['OVER', normal.audio[2], frozen.audio[2]],
            ['READ', Number(normal.requests[3]), Number(frozen.requests[3])],
            ['WRITE', Number(normal.requests[5]), Number(frozen.requests[5])],
            ['MIDI', Number(normal.requests[7]), Number(frozen.requests[7])],
            ['BURST', Number(normal.requests[1]), Number(frozen.requests[1])],
        ];
        rows.forEach(([label, first, second], index) => {
            const row = 16 + index * 7;
            fontPrint5x3(0, row, label, 1);
            [first, second].forEach((value, column) => {
                const text = value < 10000000 ? String(value) : value.toExponential(1).toUpperCase();
                fontPrint5x3(80 + column * 48 - fontWidth5x3(text), row, text, 1);
            });
        });
        fontPrint5x3(0, 59, 'CLICK:NEXT PHOTO  BACK:EXIT', 1);
    } else {
        previewTestLines().forEach((line, index) => fontPrint5x3(0, index === 7 ? 59 : index * 8, line.slice(0, 32), 1));
    }
    return true;
}
