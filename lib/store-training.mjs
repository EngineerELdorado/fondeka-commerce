import { isTraining } from './commerce-training.mjs';

function items(page) {
    const content = Array.isArray(page) ? page : page?.content;
    if (!Array.isArray(content)) throw new Error('Invalid public catalog response');
    return content;
}

function isLast(page, number, size) {
    if (Array.isArray(page)) return true;
    if (page.number != null && page.number !== number) throw new Error('Invalid public catalog pagination');
    if (page.last === true) return true;
    if (Number.isSafeInteger(page.totalPages) && page.totalPages >= 0) return number + 1 >= page.totalPages;
    return page.last !== false && items(page).length < size;
}

// This discovers a public navigation option, never learner entitlement. Reuse a
// conclusive first page; otherwise scan larger public pages without blocking UI.
export async function storeOffersTraining({ initialPage = null, initialSize = 20, readPage, signal }) {
    const checkAbort = () => {
        if (signal?.aborted) throw new DOMException('Catalog discovery aborted', 'AbortError');
    };
    checkAbort();
    if (initialPage != null) {
        if (items(initialPage).some(isTraining)) return true;
        if (isLast(initialPage, 0, initialSize)) return false;
    }

    const size = 100;
    for (let number = 0; ; number += 1) {
        checkAbort();
        const page = await readPage(number, size, signal);
        checkAbort();
        const products = items(page);
        if (products.some(isTraining)) return true;
        if (isLast(page, number, size)) return false;
        if (!products.length) throw new Error('Invalid public catalog pagination');
    }
}
