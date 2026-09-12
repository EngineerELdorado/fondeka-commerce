export const playUrl =
    'https://play.google.com/store/apps/details?id=com.fondeka.app';

export const appStoreUrl =
    'https://apps.apple.com/cd/app/fondeka/id6757371679';

export function getDevicePlatform() {
    if (typeof navigator === 'undefined') {
        return 'other';
    }

    const userAgent = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const isAndroid = /Android/i.test(userAgent);
    const isiOS =
        /iPhone|iPad|iPod/i.test(userAgent) ||
        (platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isAndroid) {
        return 'android';
    }

    if (isiOS) {
        return 'ios';
    }

    return 'other';
}
