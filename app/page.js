export default function Home() {
    return (
        <main className="commerce-page">
            <div className="commerce-shell commerce-shell--narrow">
                <Brand />
                <section className="state-card">
                    <h1>Open a merchant store</h1>
                    <p>Use a Fondeka Commerce store URL to browse products and create a pending order.</p>
                    <p className="muted">Store URLs use the format /s/store-slug.</p>
                </section>
            </div>
        </main>
    );
}

function Brand() {
    return (
        <header className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <strong>Fondeka Commerce</strong>
        </header>
    );
}
