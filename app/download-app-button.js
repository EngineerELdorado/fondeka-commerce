'use client';

import { useEffect, useRef, useState } from 'react';
import { appStoreUrl, getDevicePlatform, playUrl } from '../lib/appStores';

const PlayIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#3DDC84" d="M1.5 3.5v17l10-8.5z" />
        <path fill="#0F9D58" d="M21 12 11.5 3.5v17z" />
        <path fill="#FFCD40" d="m21 12-4.5 2.9-5-2.9 4.9-2.9z" />
        <path fill="#4285F4" d="m1.5 3.5 10 8.5-2 1.5-8-7z" />
    </svg>
);

const AppleIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path
            fill="currentColor"
            d="M16.365 13.23c.03 3.272 2.873 4.363 2.903 4.377-.024.078-.454 1.56-1.506 3.09-.906 1.315-1.85 2.626-3.326 2.652-1.45.026-1.918-.86-3.58-.86-1.661 0-2.179.83-3.548.886-1.425.056-2.576-1.42-3.487-2.73-1.9-2.727-3.358-7.71-1.407-11.082.972-1.68 2.707-2.745 4.608-2.77 1.438-.028 2.797.943 3.58.943.78 0 2.478-1.167 4.185-.995.713.03 2.716.29 3.995 2.177-.104.064-2.384 1.39-2.317 3.312zM14.23 3.98c.767-.926 1.264-2.222 1.123-3.51-1.084.044-2.39.72-3.162 1.646-.696.806-1.304 2.098-1.14 3.357 1.202.094 2.412-.61 3.179-1.493z"
        />
    </svg>
);

export default function DownloadAppButton({
    label = 'Download Fondeka',
    androidLabel = 'Download for Android',
    iosLabel = 'Download for iPhone',
    desktopTitle = 'Scan and install Fondeka',
    desktopBody = 'Use the app for stores, payments, wallets, cards, bills, airtime, and more.',
    desktopCta = 'Open store page',
    className = '',
    variant = 'default',
    trackingId,
}) {
    const [platform, setPlatform] = useState('other');
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);

    const qrSize = '180x180';
    const qrPlay = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}&data=${encodeURIComponent(playUrl)}&margin=0`;
    const qrApple = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}&data=${encodeURIComponent(appStoreUrl)}&margin=0`;
    const isHero = variant === 'hero';

    useEffect(() => {
        setPlatform(getDevicePlatform());
    }, []);

    useEffect(() => {
        const onClick = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setOpen(false);
            }
        };

        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, []);

    if (platform === 'android' || platform === 'ios') {
        const isAndroid = platform === 'android';
        const Icon = isAndroid ? PlayIcon : AppleIcon;
        const href = isAndroid ? playUrl : appStoreUrl;
        const mobileLabel = isAndroid ? androidLabel : iosLabel;

        return (
            <div className={className}>
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`button primary download-button ${isHero ? 'download-button--hero' : ''}`}
                    data-download-button={trackingId || undefined}
                    aria-label={mobileLabel}
                >
                    <Icon />
                    <span>{mobileLabel}</span>
                </a>
            </div>
        );
    }

    return (
        <div className={`download-menu ${className}`} ref={menuRef}>
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    setOpen((current) => !current);
                }}
                className={`button primary download-button ${isHero ? 'download-button--hero' : ''}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                data-download-button={trackingId || undefined}
            >
                <span>{label}</span>
            </button>

            {open && (
                <div className="download-popover" role="dialog" aria-label={desktopTitle}>
                    <div className="download-popover-intro">
                        <strong>{desktopTitle}</strong>
                        <p>{desktopBody}</p>
                    </div>
                    <a
                        href={playUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="download-qr"
                        onClick={() => setOpen(false)}
                    >
                        <img src={qrPlay} alt="QR code for Google Play" loading="lazy" />
                        <span><PlayIcon /> Google Play</span>
                    </a>
                    <a
                        href={appStoreUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="download-qr"
                        onClick={() => setOpen(false)}
                    >
                        <img src={qrApple} alt="QR code for the App Store" loading="lazy" />
                        <span><AppleIcon /> App Store</span>
                    </a>
                    <a
                        href={playUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button secondary download-store-link"
                        onClick={() => setOpen(false)}
                    >
                        {desktopCta}
                    </a>
                </div>
            )}
        </div>
    );
}
