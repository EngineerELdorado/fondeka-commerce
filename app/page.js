const storefrontFeatures = [
    {
        title: 'Store creation',
        text: 'Launch a branded storefront without building an ecommerce stack.',
    },
    {
        title: 'POS',
        text: 'Create in-person orders and collect payments from the same commerce flow.',
    },
    {
        title: 'Built-in payments',
        text: 'Mobile money, wallet rails, fee lookup, and checkout payments.',
    },
];

const workflow = [
    'Create store',
    'Publish products',
    'Sell online or in person',
    'Track paid orders',
];

const audiences = [
    'Independent retailers and local shops',
    'Diaspora-focused sellers',
    'Digital product and service providers',
    'Market vendors moving from chat-only sales',
    'Merchants that need lightweight online ordering',
    'Teams already using Fondeka financial services',
];

const faqs = [
    {
        question: 'What is Fondeka Commerce?',
        answer: 'A commerce operating system for African merchants.',
    },
    {
        question: 'Who is Fondeka Commerce for?',
        answer: 'Retailers, market vendors, service sellers, and diaspora shops.',
    },
    {
        question: 'What can customers do?',
        answer: 'Browse products, build a cart, enter buyer details, and start payment.',
    },
    {
        question: 'Why use it?',
        answer: 'It turns informal selling into a clear, shareable web checkout.',
    },
];

const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Fondeka Commerce',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: 'https://commerce.fondeka.com',
    description:
        'Fondeka Commerce is a SaaS storefront platform that helps merchants publish online stores, share product catalogs, and collect structured customer orders.',
    offers: {
        '@type': 'Offer',
        category: 'SaaS ecommerce storefront platform',
    },
    audience: {
        '@type': 'BusinessAudience',
        audienceType: 'Merchants, retailers, digital sellers, and small businesses',
    },
    publisher: {
        '@type': 'Organization',
        name: 'Fondeka',
        url: 'https://fondeka.com',
    },
};

export const metadata = {
    title: {
        absolute: 'Fondeka Commerce | SaaS Storefronts for Modern Merchants',
    },
    description:
        'Fondeka Commerce is a SaaS storefront platform for merchants to publish products, share store links, collect customer orders, and grow online commerce.',
    alternates: {
        canonical: '/',
    },
    openGraph: {
        title: 'Fondeka Commerce | SaaS Storefronts for Modern Merchants',
        description:
            'Launch a hosted merchant storefront, publish product catalogs, and collect structured customer orders with Fondeka Commerce.',
        url: 'https://commerce.fondeka.com',
        siteName: 'Fondeka Commerce',
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Fondeka Commerce | SaaS Storefronts for Modern Merchants',
        description:
            'Hosted merchant storefronts, product catalogs, and customer order flows powered by Fondeka.',
    },
};

export default function Home() {
    return (
        <main className="commerce-page landing-page">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <header className="landing-nav commerce-shell" aria-label="Fondeka Commerce">
                <Brand />
                <nav className="landing-nav-links" aria-label="Primary navigation">
                    <a href="#platform">Platform</a>
                    <a href="#workflow">Workflow</a>
                    <a href="#faq">FAQ</a>
                </nav>
                <a className="button primary landing-nav-action" href="#stores">Explore stores</a>
            </header>

            <section className="landing-hero">
                <div className="commerce-shell landing-hero-grid">
                    <div className="landing-hero-copy">
                        <p className="eyebrow">SaaS commerce storefronts by Fondeka</p>
                        <h1>Storefronts for Fondeka merchants.</h1>
                        <p className="hero-lede">
                            Store creation, POS, and African payment rails in one commerce layer.
                        </p>
                        <div className="hero-actions" id="stores">
                            <a className="button primary" href="/s/demo-store">View a storefront</a>
                            <a className="button secondary" href="#platform">See how it works</a>
                        </div>
                        <dl className="hero-proof" aria-label="Fondeka Commerce platform highlights">
                            <div>
                                <dt>Store creation</dt>
                                <dd>Launch branded stores</dd>
                            </div>
                            <div>
                                <dt>POS</dt>
                                <dd>Sell in person</dd>
                            </div>
                            <div>
                                <dt>Payments</dt>
                                <dd>Built-in payment rails</dd>
                            </div>
                        </dl>
                    </div>
                    <div className="storefront-preview" aria-label="Fondeka Commerce storefront preview">
                        <div className="preview-toolbar">
                            <span />
                            <span />
                            <span />
                            <strong>commerce.fondeka.com/s/store</strong>
                        </div>
                        <div className="preview-banner">
                            <div>
                                <span className="preview-logo">FC</span>
                                <h2>Merchant storefront</h2>
                                <p>Curated product catalog, live pricing, and a clear order path.</p>
                            </div>
                        </div>
                        <div className="preview-grid">
                            <article>
                                <span>Create</span>
                                <strong>Store creation</strong>
                                <p>Brand, products, checkout.</p>
                            </article>
                            <article>
                                <span>Sell</span>
                                <strong>POS</strong>
                                <p>Counter orders and payments.</p>
                            </article>
                            <article>
                                <span>Pay</span>
                                <strong>Built-in payments</strong>
                                <p>Mobile money, wallet rails, fees.</p>
                            </article>
                        </div>
                    </div>
                </div>
            </section>

            <section className="landing-section commerce-shell" id="platform">
                <div className="section-kicker">Platform</div>
                <div className="section-intro">
                    <h2>Commerce built for African realities.</h2>
                    <p>Stores, POS, and payment rails that fit how merchants already sell.</p>
                </div>
                <div className="feature-grid">
                    {storefrontFeatures.map((feature) => (
                        <article className="feature-card" key={feature.title}>
                            <h3>{feature.title}</h3>
                            <p>{feature.text}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="landing-band" id="workflow">
                <div className="commerce-shell split-section">
                    <div>
                        <div className="section-kicker">Workflow</div>
                        <h2>From market stall to paid order.</h2>
                        <div className="flow-preview" aria-label="Commerce checkout preview">
                            <div><span>Subtotal</span><strong>85 USD</strong></div>
                            <div><span>Fees</span><strong>2.40 USD</strong></div>
                            <div><span>Total to pay</span><strong>87.40 USD</strong></div>
                        </div>
                    </div>
                    <ol className="workflow-list">
                        {workflow.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ol>
                </div>
            </section>

            <section className="landing-section commerce-shell">
                <div className="section-kicker">Use cases</div>
                <div className="section-intro">
                    <h2>For merchants who sell online, offline, and across borders.</h2>
                    <p>Market stalls, WhatsApp leads, diaspora buyers, repeat customers, and walk-in sales.</p>
                </div>
                <div className="audience-grid">
                    {audiences.map((audience) => (
                        <span key={audience}>{audience}</span>
                    ))}
                </div>
            </section>

            <section className="landing-band">
                <div className="commerce-shell commerce-system">
                    <div>
                        <div className="section-kicker">Inside the flow</div>
                        <h2>Local rails. Modern checkout.</h2>
                    </div>
                    <div className="system-board" aria-label="Fondeka Commerce flow">
                        <div className="system-column">
                            <span>Storefront</span>
                            <strong>/stores/fondeka</strong>
                        </div>
                        <div className="system-column">
                            <span>Checkout</span>
                            <strong>COMMERCE_CHECKOUT_PAYMENT</strong>
                        </div>
                        <div className="system-column">
                            <span>Order</span>
                            <strong>Paid → Fulfill</strong>
                        </div>
                    </div>
                </div>
            </section>

            <section className="landing-section commerce-shell" id="faq">
                <div className="section-kicker">FAQ</div>
                <div className="faq-grid">
                    {faqs.map((faq) => (
                        <article className="faq-item" key={faq.question}>
                            <h3>{faq.question}</h3>
                            <p>{faq.answer}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="landing-cta commerce-shell">
                <div>
                    <p className="eyebrow">Fondeka Commerce</p>
                    <h2>Bring African merchants online and in-store.</h2>
                    <p>Create stores, run POS, and collect payments.</p>
                </div>
                <a className="button primary" href="/s/demo-store">Open demo storefront</a>
            </section>
        </main>
    );
}

function Brand() {
    return (
        <a className="brand brand-link" href="/" aria-label="Fondeka Commerce home">
            <span className="brand-mark" aria-hidden="true" />
            <strong>Fondeka Commerce</strong>
        </a>
    );
}
