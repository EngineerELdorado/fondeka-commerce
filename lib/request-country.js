const COUNTRY_HEADER_NAMES = [
    'x-vercel-ip-country',
    'cf-ipcountry',
    'x-country-code',
    'cloudfront-viewer-country',
];

export function countryFromHeaders(headersList, fallback = 'CD') {
    for (const name of COUNTRY_HEADER_NAMES) {
        const value = headersList?.get?.(name);
        const code = String(value || '').trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(code) && code !== 'XX') {
            return code;
        }
    }

    return fallback;
}
