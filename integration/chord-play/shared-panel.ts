import type { SchwungPage } from '../renderer/schwung-page.js';

/** Follow the visible panel when its track-owned controller changes. */
export function sharedPanel(): (page: SchwungPage) => SchwungPage {
    let previous: SchwungPage | null = null;
    return page => {
        if (previous && previous !== page) {
            const selected = previous.ctl.page;
            const candidates = page.ctl.pages ?? [];
            const exact = candidates.findIndex((candidate: any) => candidate.name === selected?.name
                && JSON.stringify(candidate.keys ?? []) === JSON.stringify(selected?.keys ?? []));
            const named = candidates.findIndex((candidate: any) => candidate.name === selected?.name);
            page.goToPage(exact >= 0 ? exact : named >= 0 ? named : 0);
        }
        previous = page;
        return page;
    };
}
