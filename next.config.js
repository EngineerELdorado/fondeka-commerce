/** @type {import('next').NextConfig} */
const nextConfig = {
    allowedDevOrigins: ['192.168.178.55'],
    headers: async () => ([
        {
            source: '/learning',
            headers: [
                { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
                { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
            ],
        },
        {
            source: '/:path*',
            headers: [
                { key: 'X-Frame-Options', value: 'DENY' },
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'Referrer-Policy', value: 'no-referrer' },
            ],
        },
    ]),
};

module.exports = nextConfig;
