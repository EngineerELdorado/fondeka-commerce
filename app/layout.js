import './globals.css';

export const metadata = {
    metadataBase: new URL('https://commerce.fondeka.com'),
    title: {
        default: 'Fondeka Commerce | SaaS Storefronts for Merchants',
        template: '%s | Fondeka Commerce',
    },
    description:
        'Fondeka Commerce is a SaaS storefront platform for merchants to publish online stores, manage product catalogs, and collect structured customer orders.',
    keywords: [
        'Fondeka Commerce',
        'merchant storefront software',
        'SaaS ecommerce platform',
        'online store builder',
        'product catalog website',
        'small business ecommerce',
        'African commerce platform',
        'hosted storefronts',
    ],
    applicationName: 'Fondeka Commerce',
    authors: [{ name: 'Fondeka' }],
    creator: 'Fondeka',
    publisher: 'Fondeka',
    alternates: {
        canonical: '/',
    },
    openGraph: {
        title: 'Fondeka Commerce | SaaS Storefronts for Merchants',
        description:
            'Create hosted merchant storefronts, publish product catalogs, and collect customer orders with Fondeka Commerce.',
        url: 'https://commerce.fondeka.com',
        siteName: 'Fondeka Commerce',
        type: 'website',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Fondeka Commerce | SaaS Storefronts for Merchants',
        description:
            'Hosted storefronts, product catalogs, and structured order flows for modern merchants.',
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-snippet': -1,
            'max-image-preview': 'large',
            'max-video-preview': -1,
        },
    },
};

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
        <body>{children}</body>
        </html>
    );
}
