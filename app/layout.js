import './globals.css';

export const metadata = {
    metadataBase: new URL('https://commerce.fondeka.com'),
    title: 'Fondeka Commerce',
    description: 'Public merchant storefronts powered by Fondeka.',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        </head>
        <body>{children}</body>
        </html>
    );
}
