/** @type {import('next').NextConfig} */
const nextConfig = {
    allowedDevOrigins: ['192.168.178.55'],
    headers: async () => ([
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
