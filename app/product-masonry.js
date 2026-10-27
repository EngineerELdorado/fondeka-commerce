'use client';

import { useLayoutEffect, useRef } from 'react';

// Keep one DOM list in backend order. Small grid rows pack natural-height cards
// without column wrappers, dense placement or a separate keyboard order.
export default function ProductMasonry({ children }) {
    const container = useRef(null);

    useLayoutEffect(() => {
        const grid = container.current;
        if (!grid || typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return;

        let frame = 0;
        let width = grid.getBoundingClientRect().width;
        const observed = new Set();
        const measure = () => {
            frame = 0;
            const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
            // Read every height before writing, so a cart or image update needs
            // only one layout pass. Each card includes the space beneath it.
            const spans = [...grid.children].map(card => [card, Math.max(1, Math.ceil(card.getBoundingClientRect().height + gap))]);
            for (const [card, span] of spans) {
                const end = `span ${span}`;
                if (card.style.gridRowEnd !== end) card.style.gridRowEnd = end;
            }
            grid.classList.add('is-masonry');
        };
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(measure);
        };
        const resize = new ResizeObserver(entries => {
            let changed = false;
            for (const entry of entries) {
                if (entry.target !== grid) changed = true;
                else if (entry.contentRect.width !== width) {
                    width = entry.contentRect.width;
                    changed = true;
                }
            }
            if (changed) schedule();
        });
        const watchCards = () => {
            const current = new Set(grid.children);
            for (const card of observed) if (!current.has(card)) {
                resize.unobserve(card);
                observed.delete(card);
            }
            for (const card of current) if (!observed.has(card)) {
                resize.observe(card);
                observed.add(card);
            }
            schedule();
        };
        const mutations = new MutationObserver(watchCards);
        mutations.observe(grid, { childList: true });
        resize.observe(grid);
        watchCards();
        // Start in the safe regular grid, then enable packing with measured spans.
        cancelAnimationFrame(frame);
        measure();

        return () => {
            cancelAnimationFrame(frame);
            resize.disconnect();
            mutations.disconnect();
            grid.classList.remove('is-masonry');
            for (const card of observed) card.style.removeProperty('grid-row-end');
        };
    }, []);

    return <div className="profile-product-grid" ref={container}>{children}</div>;
}
