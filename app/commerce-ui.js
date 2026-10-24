'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { visibleFieldScrollTop } from '../lib/checkout-viewport.mjs';

const paths = {
    bag: <><path d="M6 7h12l2 14H4L6 7Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
    book: <><path d="M12 5v15M3 4c3-1 6 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 2-3-2-6-3-9-2V4Z" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
    back: <><path d="M20 12H4m6-6-6 6 6 6" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    card: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h3" /></>,
    phone: <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 18h4" /></>,
    bank: <><path d="m3 7 9-5 9 5H3Zm2 3v8m7-8v8m7-8v8M3 22h18M3 18h18" /></>,
    wallet: <><path d="M20 7V5H5a2 2 0 0 1 0-4h13v4M3 3v16a2 2 0 0 0 2 2h15V7H5" /><path d="M20 12h-5v5h5" /></>,
    coin: <><circle cx="12" cy="12" r="9" /><path d="M15 8H9v4h6v4H9m3-10v12" /></>,
    file: <><path d="M14 2H5v20h14V7l-5-5Z" /><path d="M14 2v6h5M8 13h8m-8 4h5" /></>,
    link: <><path d="m10 13 4-4m-7 6-1 1a3.5 3.5 0 0 0 5 5l4-4a3.5 3.5 0 0 0-1-6m-4 2a3.5 3.5 0 0 1-1-6l4-4a3.5 3.5 0 0 1 5 5l-1 1" /></>,
    share: <><path d="M12 16V3m-5 5 5-5 5 5M5 13v8h14v-8" /></>,
    user: <><circle cx="12" cy="7" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};

export function CommerceIcon({ name, size = 20, className = '' }) {
    return <svg className={`commerce-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.bag}</svg>;
}

// Inline marks avoid third-party icon requests, fonts and social widgets.
const socialMarks = {
    instagram: <g fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" /></g>,
    facebook: <path d="M14 22v-9h3l.5-3H14V8c0-1 .3-1.5 1.6-1.5H18V3.2c-.8-.1-1.7-.2-2.5-.2C12.8 3 11 4.6 11 7.5V10H8v3h3v9h3Z" />,
    tiktok: <path d="M19.6 6.7A4.8 4.8 0 0 1 16.8 2h-3.4v13.7a3 3 0 1 1-2.6-3V9.2a6.4 6.4 0 1 0 6 6.4V8.8a8.2 8.2 0 0 0 4.8 1.5V6.9a4.8 4.8 0 0 1-2-.2Z" />,
    youtube: <path fillRule="evenodd" d="M21.6 7.2c-.2-.8-.8-1.4-1.6-1.6-1.5-.4-8-.4-8-.4s-6.5 0-8 .4c-.8.2-1.4.8-1.6 1.6C2.1 8.8 2 10.4 2 12s.1 3.2.4 4.8c.2.8.8 1.4 1.6 1.6 1.5.4 8 .4 8 .4s6.5 0 8-.4c.8-.2 1.4-.8 1.6-1.6.3-1.6.4-3.2.4-4.8s-.1-3.2-.4-4.8ZM10 15.3V8.7l5.7 3.3-5.7 3.3Z" />,
    x: <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l7.3-8.5L1.2 2h6.5l4.8 6.7L18.9 2Zm-1.1 18h1.7L6.7 3.9H4.9L17.8 20Z" />,
    linkedin: <><circle cx="5.2" cy="5" r="1.8" /><path d="M3.5 8.5h3.4V21H3.5V8.5ZM10 9h3v1.6c.8-1.2 1.9-1.9 3.4-1.9 3.3 0 4.1 2.1 4.1 5V21h-3.3v-6.6c0-1.6-.4-2.8-1.9-2.8-1.6 0-2 1.3-2 2.8V21H10V9Z" /></>,
};

export function SocialIcon({ platform }) {
    return <svg className={`social-icon social-icon--${platform}`} width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">{socialMarks[platform]}</svg>;
}

export function DropdownChevron() {
    return <span className="commerce-select-chevron" aria-hidden="true"><CommerceIcon name="chevron" size={16} /></span>;
}

export function CommerceImage({ src, alt = '', fallback = '', ...props }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    return src && !failed
        ? <img src={src} alt={alt} onError={() => setFailed(true)} {...props} />
        : <span className="commerce-media-fallback" role={alt ? 'img' : undefined} aria-label={alt || undefined}>{fallback || <CommerceIcon name="bag" size={32} />}</span>;
}

export function StepProgress({ step, labels, text }) {
    return (
        <div className="checkout-progress">
            <div className="checkout-progress-top"><span>{text}</span><span>{labels[step]}</span></div>
            <div className="checkout-progress-track" role="progressbar" aria-label={text} aria-valuemin={1} aria-valuemax={labels.length} aria-valuenow={step + 1}>
                <span style={{ width: `${((step + 1) / labels.length) * 100}%` }} />
            </div>
            <ol className="checkout-step-path">
                {labels.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={index < step ? 'is-past' : index === step ? 'is-current' : ''}><span>{index < step ? <CommerceIcon name="check" size={12} /> : index + 1}</span>{label}</li>)}
            </ol>
        </div>
    );
}

const dialogs = [];
let originalOverflow = '';
let dialogLayer = 100;
const focusable = 'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]';

export function DialogBackdrop({ children, className, label, onClose, locked = false }) {
    const [mounted, setMounted] = useState(false);
    const root = useRef(null);
    const current = useRef({ onClose, locked });
    current.current = { onClose, locked };
    useEffect(() => setMounted(true), []);
    useLayoutEffect(() => {
        if (!mounted || !root.current) return undefined;
        const node = root.current;
        const viewport = window.visualViewport;
        let frame = 0;
        const revealFocusedField = () => {
            if (dialogs.at(-1) !== node) return;
            const control = document.activeElement;
            if (!node.contains(control) || !control.matches('input, textarea, select')) return;
            const region = control.closest('.commerce-scroll-region');
            if (!region) return;
            const field = control.closest('.commerce-field, .mobile-money-phone-panel') || control;
            const bounds = region.getBoundingClientRect();
            const target = control.getBoundingClientRect();
            const group = field.getBoundingClientRect();
            region.scrollTop = visibleFieldScrollTop({
                scrollTop: region.scrollTop, scrollHeight: region.scrollHeight,
                viewportTop: bounds.top, viewportBottom: bounds.bottom,
                fieldTop: group.top, fieldBottom: group.bottom,
                controlTop: target.top, controlBottom: target.bottom,
            });
        };
        const scheduleReveal = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(revealFocusedField);
        };
        const resize = () => {
            node.style.setProperty('--dialog-height', `${viewport?.height || window.innerHeight}px`);
            node.style.setProperty('--dialog-top', `${viewport?.offsetTop || 0}px`);
            node.dataset.compactViewport = String((viewport?.height || window.innerHeight) < 500);
            scheduleReveal();
        };
        resize();
        viewport?.addEventListener('resize', resize);
        viewport?.addEventListener('scroll', resize);
        window.addEventListener('resize', resize);
        const previous = document.activeElement;
        const page = document.querySelector('main.commerce-page');
        if (!dialogs.length) {
            dialogLayer = 100;
            originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            if (page) page.inert = true;
        }
        dialogs.forEach((dialog) => { dialog.inert = true; });
        dialogs.push(node);
        node.style.zIndex = String(++dialogLayer);
        const visibleControls = () => [...node.querySelectorAll(focusable)].filter((element) => element.getClientRects().length && !element.closest('[inert]'));
        const heading = node.querySelector('[data-dialog-focus], h2, h3');
        if (heading) heading.tabIndex = -1;
        (heading || visibleControls()[0] || node).focus({ preventScroll: true });
        const keydown = (event) => {
            if (dialogs.at(-1) !== node) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                if (!current.current.locked) current.current.onClose?.();
            }
            if (event.key === 'Tab') {
                const controls = visibleControls();
                const first = controls[0] || node;
                const last = controls.at(-1) || node;
                if (event.shiftKey && (!controls.includes(document.activeElement) || document.activeElement === first)) {
                    event.preventDefault(); last.focus();
                } else if (!event.shiftKey && (!controls.includes(document.activeElement) || document.activeElement === last)) {
                    event.preventDefault(); first.focus();
                }
            }
        };
        const focusin = (event) => {
            if (dialogs.at(-1) === node && !node.contains(event.target)) (visibleControls()[0] || node).focus();
            else scheduleReveal();
        };
        const observer = new ResizeObserver(scheduleReveal);
        node.querySelectorAll('.commerce-scroll-region').forEach((region) => observer.observe(region));
        const contentObserver = new MutationObserver(scheduleReveal);
        contentObserver.observe(node, { childList: true, subtree: true, characterData: true });
        document.addEventListener('keydown', keydown, true);
        document.addEventListener('focusin', focusin);
        return () => {
            document.removeEventListener('keydown', keydown, true);
            document.removeEventListener('focusin', focusin);
            viewport?.removeEventListener('resize', resize);
            viewport?.removeEventListener('scroll', resize);
            window.removeEventListener('resize', resize);
            window.cancelAnimationFrame(frame);
            observer.disconnect();
            contentObserver.disconnect();
            const index = dialogs.indexOf(node);
            if (index >= 0) dialogs.splice(index, 1);
            const active = dialogs.at(-1);
            if (active) active.inert = false;
            else {
                document.body.style.overflow = originalOverflow;
                if (page) page.inert = false;
            }
            if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
        };
    }, [mounted]);
    if (!mounted) return null;
    return createPortal(
        <div className={`commerce-ui commerce-dialog-root ${className}`} ref={root} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onClick={(event) => { if (event.target === event.currentTarget && !locked) onClose?.(); }}>{children}</div>,
        document.body,
    );
}

// History contains only a local step and an ephemeral flow ID. It never contains buyer or access data.
export function useCheckoutNavigation({ setOpen, setReviewOpen, canReview, busy }) {
    const [step, setStep] = useState(0);
    const session = useRef(null);
    const latest = useRef({ setOpen, setReviewOpen, canReview, busy });
    latest.current = { setOpen, setReviewOpen, canReview, busy };
    useEffect(() => {
        const restore = () => {
            if (latest.current.busy) return;
            const entry = window.history.state?.commerceCheckout;
            if (session.current && entry?.id === session.current) {
                setStep(Math.max(0, Math.min(2, entry.step)));
                latest.current.setOpen(true);
                latest.current.setReviewOpen(entry.step === 3 && latest.current.canReview);
            } else {
                latest.current.setOpen(false);
                latest.current.setReviewOpen(false);
            }
        };
        window.addEventListener('popstate', restore);
        return () => window.removeEventListener('popstate', restore);
    }, []);
    const open = useCallback(() => {
        if (latest.current.busy) return;
        session.current = `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        window.history.pushState({ ...window.history.state, commerceCheckout: { id: session.current, step: 0, depth: 1 } }, '');
        setStep(0);
        latest.current.setOpen(true);
    }, []);
    const go = useCallback((next) => {
        if (latest.current.busy || !session.current) return;
        const entry = window.history.state?.commerceCheckout;
        window.history.pushState({ ...window.history.state, commerceCheckout: { id: session.current, step: next, depth: (entry?.id === session.current ? entry.depth : 0) + 1 } }, '');
        setStep(next);
        latest.current.setReviewOpen(false);
    }, []);
    const close = useCallback(() => {
        if (latest.current.busy) return;
        const entry = window.history.state?.commerceCheckout;
        latest.current.setOpen(false);
        if (entry?.id === session.current) window.history.go(-entry.depth);
    }, []);
    const back = useCallback(() => {
        if (latest.current.busy) return;
        window.history.back();
    }, []);
    const review = useCallback(() => {
        const entry = window.history.state?.commerceCheckout;
        if (entry?.id === session.current && session.current) {
            window.history.pushState({ ...window.history.state, commerceCheckout: { ...entry, step: 3, depth: entry.depth + 1 } }, '');
        }
        latest.current.setReviewOpen(true);
    }, []);
    const closeReview = useCallback(() => {
        if (latest.current.busy) return;
        const entry = window.history.state?.commerceCheckout;
        if (entry?.id === session.current && entry?.step === 3 && session.current) window.history.back();
        else latest.current.setReviewOpen(false);
    }, []);
    const finishReview = useCallback(() => {
        const entry = window.history.state?.commerceCheckout;
        if (entry?.id === session.current && entry?.step === 3 && session.current) {
            window.history.replaceState({ ...window.history.state, commerceCheckout: { ...entry, step: 2 } }, '');
        }
        latest.current.setReviewOpen(false);
    }, []);
    const complete = useCallback(() => {
        const entry = window.history.state?.commerceCheckout;
        if (entry?.id === session.current) {
            const { commerceCheckout, ...rest } = window.history.state;
            window.history.replaceState(rest, '');
        }
        session.current = null;
        latest.current.setOpen(false);
        latest.current.setReviewOpen(false);
    }, []);
    return { step, open, go, back, close, review, closeReview, finishReview, complete };
}

export function StorefrontSkeleton({ label }) {
    return <div className="storefront-skeleton" role="status" aria-label={label}><span className="sr-only">{label}</span><div className="commerce-skeleton skeleton-media" /><div className="skeleton-copy"><span className="commerce-skeleton" /><span className="commerce-skeleton" /><span className="commerce-skeleton" /></div></div>;
}
