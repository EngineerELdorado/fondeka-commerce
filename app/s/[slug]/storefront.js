'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/api';

const PAGE_SIZE = 20;

function pageItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.content)) return payload.content;
    return [];
}

function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function amount(value, currency) {
    const code = String(currency || '').trim().toUpperCase();
    const n = number(value);
    const formatted = n.toLocaleString(undefined, {
        minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
        maximumFractionDigits: 2,
    });
    return code ? `${formatted} ${code}` : formatted;
}

function readError(error, fallback = 'Something went wrong.') {
    if (error?.payload) return error.payload;
    return {
        message: error?.message || fallback,
        errorCode: error?.errorCode || null,
        statusCode: error?.statusCode || null,
    };
}

function isFeatureDisabled(error) {
    return error?.errorCode === 'FEATURE_DISABLED';
}

function isNotFound(error) {
    return error?.errorCode === 'NO_RESULT' || error?.statusCode === 404;
}

function initials(text) {
    return String(text || 'Store')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase())
        .join('') || 'S';
}

function inventoryLabel(product) {
    if (String(product?.inventoryPolicy || '').toUpperCase() !== 'TRACKED') return 'Available';
    const quantity = number(product?.inventoryQuantity);
    if (quantity <= 0) return 'Out of stock';
    return `${amount(quantity, '')} available`;
}

function firstCurrency(store, products) {
    return store?.defaultCurrency || products[0]?.priceCurrency || '';
}

function checkoutPayload(cartItems, buyer, currencies) {
    return {
        items: cartItems.map(({ product, quantity }) => ({
            productId: product.id,
            quantity,
        })),
        billingCurrency: currencies.billingCurrency.trim().toUpperCase(),
        paymentCurrency: currencies.paymentCurrency.trim().toUpperCase(),
        channel: 'STOREFRONT',
        buyerName: buyer.name.trim(),
        buyerEmail: buyer.email.trim(),
        buyerPhone: buyer.phone.trim(),
    };
}

export default function Storefront({ slug, productLookup }) {
    const [store, setStore] = useState(null);
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState({});
    const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' });
    const [currencies, setCurrencies] = useState({ billingCurrency: '', paymentCurrency: '' });
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [quote, setQuote] = useState(null);
    const [checkout, setCheckout] = useState(null);
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [flowError, setFlowError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        setFlowError(null);
        try {
            let storePayload = null;
            let loadedProducts = [];

            if (productLookup) {
                const product = await apiFetch(`/public/commerce/products/${encodeURIComponent(productLookup)}`);
                loadedProducts = [product];
                if (product.storeSlug) {
                    storePayload = await apiFetch(`/public/commerce/stores/${encodeURIComponent(product.storeSlug)}`);
                } else {
                    storePayload = {
                        name: 'Fondeka merchant',
                        slug: product.storeSlug || '',
                        defaultCurrency: product.priceCurrency || '',
                    };
                }
                setCart({ [product.id]: 1 });
            } else {
                const encodedSlug = encodeURIComponent(slug);
                storePayload = await apiFetch(`/public/commerce/stores/${encodedSlug}`);
                const productsPayload = await apiFetch(`/public/commerce/stores/${encodedSlug}/products?page=0&size=${PAGE_SIZE}`);
                loadedProducts = pageItems(productsPayload);
            }

            setStore(storePayload);
            setProducts(loadedProducts);
            const defaultCurrency = firstCurrency(storePayload, loadedProducts);
            setCurrencies((current) => ({
                billingCurrency: current.billingCurrency || defaultCurrency,
                paymentCurrency: current.paymentCurrency || defaultCurrency,
            }));
        } catch (error) {
            setLoadError(readError(error, 'Unable to load storefront.'));
        } finally {
            setLoading(false);
        }
    }, [productLookup, slug]);

    useEffect(() => {
        load();
    }, [load]);

    const cartItems = useMemo(() => products
        .map((product) => ({ product, quantity: number(cart[product.id]) }))
        .filter((item) => item.quantity > 0), [cart, products]);

    const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    const setQuantity = (productId, nextQuantity) => {
        const safeQuantity = Math.max(0, Math.floor(number(nextQuantity)));
        setCart((current) => {
            const next = { ...current };
            if (safeQuantity > 0) next[productId] = safeQuantity;
            else delete next[productId];
            return next;
        });
        setQuote(null);
        setCheckout(null);
        setOrder(null);
        setFlowError(null);
    };

    const changeQuantity = (productId, delta) => {
        setQuantity(productId, number(cart[productId]) + delta);
    };

    const updateBuyer = (updater) => {
        setBuyer(updater);
        setQuote(null);
        setCheckout(null);
        setFlowError(null);
    };

    const updateCurrencies = (updater) => {
        setCurrencies(updater);
        setQuote(null);
        setCheckout(null);
        setFlowError(null);
    };

    const validate = () => {
        if (!cartItems.length) return 'Choose at least one product.';
        if (!currencies.billingCurrency.trim()) return 'Billing currency is required.';
        if (!currencies.paymentCurrency.trim()) return 'Payment currency is required.';
        return null;
    };

    const quoteCheckout = async () => {
        const validation = validate();
        if (validation) {
            setFlowError({ message: validation, errorCode: 'INVALID_REQUEST' });
            return;
        }

        setBusy(true);
        setQuote(null);
        setCheckout(null);
        setFlowError(null);
        try {
            const quoted = await apiFetch('/public/commerce/checkouts/quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(checkoutPayload(cartItems, buyer, currencies)),
            });
            setQuote(quoted);
        } catch (error) {
            setFlowError(readError(error, 'Unable to quote checkout.'));
        } finally {
            setBusy(false);
        }
    };

    const createOrder = async () => {
        const validation = validate();
        if (validation) {
            setFlowError({ message: validation, errorCode: 'INVALID_REQUEST' });
            return;
        }

        setBusy(true);
        setFlowError(null);
        try {
            const createdCheckout = await apiFetch('/public/commerce/checkouts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(checkoutPayload(cartItems, buyer, currencies)),
            });
            setCheckout({
                id: createdCheckout.id,
                accessToken: createdCheckout.accessToken,
            });
            const pendingOrder = await apiFetch(
                `/public/commerce/checkouts/${encodeURIComponent(createdCheckout.id)}/orders?accessToken=${encodeURIComponent(createdCheckout.accessToken || '')}`,
                { method: 'POST' }
            );
            setOrder(pendingOrder);
            setQuote(null);
        } catch (error) {
            setFlowError(readError(error, 'Unable to create order.'));
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        if (!order?.reference || !order?.accessToken) return undefined;
        const status = String(order.status || '').toUpperCase();
        if (status && status !== 'PENDING_PAYMENT') return undefined;

        let cancelled = false;
        const poll = async () => {
            try {
                const latest = await apiFetch(
                    `/public/commerce/orders/${encodeURIComponent(order.reference)}?accessToken=${encodeURIComponent(order.accessToken)}`
                );
                if (!cancelled) setOrder(latest);
            } catch {
                // Keep the last known order visible; transient polling failures should not hide the reference.
            }
        };

        const timer = window.setInterval(poll, 5000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [order?.accessToken, order?.reference, order?.status]);

    if (loading) {
        return <Screen><StateCard title="Loading storefront..." /></Screen>;
    }

    if (loadError) {
        const title = isFeatureDisabled(loadError)
            ? 'Commerce unavailable'
            : isNotFound(loadError)
                ? 'Store not found'
                : 'Unable to load storefront';

        return (
            <Screen>
                <StateCard title={title} message={loadError.message}>
                    {!isFeatureDisabled(loadError) && (
                        <button className="button secondary" onClick={load}>Retry</button>
                    )}
                </StateCard>
            </Screen>
        );
    }

    if (order) {
        return (
            <Screen>
                <section className="order-panel">
                    <div className="status-pill">{order.status || 'PENDING_PAYMENT'}</div>
                    <h1>Order created</h1>
                    <p>Payment is not yet available in this test version. Keep this reference for the next step.</p>

                    <dl className="order-details">
                        <div>
                            <dt>Order reference</dt>
                            <dd>{order.reference}</dd>
                        </div>
                        <div>
                            <dt>Total amount</dt>
                            <dd>{amount(order.totalAmount, order.totalCurrency)}</dd>
                        </div>
                    </dl>

                    <MoneySummary data={order} />
                    <PaymentHandoff order={order} />

                    <button
                        className="button secondary"
                        onClick={() => {
                            setOrder(null);
                            setCheckout(null);
                            setCart({});
                            setFlowError(null);
                        }}
                    >
                        Back to store
                    </button>
                </section>
            </Screen>
        );
    }

    return (
        <Screen wide>
            <StoreHeader store={store} />

            <div className="store-layout">
                <section aria-label="Products">
                    <div className="section-heading">
                        <h2>{productLookup ? 'Product' : 'Products'}</h2>
                        <span>{products.length} listed</span>
                    </div>

                    {products.length ? (
                        <div className="product-grid">
                            {products.map((product) => (
                                <ProductCard
                                    key={product.id}
                                    product={product}
                                    quantity={number(cart[product.id])}
                                    onOpen={() => setSelectedProduct(product)}
                                    onIncrement={() => changeQuantity(product.id, 1)}
                                    onDecrement={() => changeQuantity(product.id, -1)}
                                />
                            ))}
                        </div>
                    ) : (
                        <StateCard title="No products yet" message="This store has no storefront products available." />
                    )}
                </section>

                <aside className="checkout-panel" aria-label="Checkout">
                    <div className="section-heading">
                        <h2>Cart</h2>
                        <span>{cartCount} item{cartCount === 1 ? '' : 's'}</span>
                    </div>

                    {cartItems.length ? (
                        <div className="cart-lines">
                            {cartItems.map(({ product, quantity }) => (
                                <div className="cart-line" key={product.id}>
                                    <div>
                                        <strong>{product.name}</strong>
                                        <span>{quantity} x {amount(product.priceAmount, product.priceCurrency)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="muted">Choose products to start a checkout.</p>
                    )}

                    <BuyerFields buyer={buyer} setBuyer={updateBuyer} />
                    <CurrencyFields currencies={currencies} setCurrencies={updateCurrencies} />

                    <div className="actions">
                        <button className="button secondary" onClick={quoteCheckout} disabled={busy || !cartItems.length}>
                            {busy ? 'Working...' : 'Get quote'}
                        </button>
                        <button className="button primary" onClick={createOrder} disabled={busy || !quote || !cartItems.length}>
                            Confirm order
                        </button>
                    </div>

                    {checkout && !order && (
                        <p className="muted">Checkout {checkout.id} created. Creating order...</p>
                    )}

                    {flowError && (
                        isFeatureDisabled(flowError)
                            ? <Unavailable message={flowError.message} />
                            : <InlineError message={flowError.message} />
                    )}

                    {quote && (
                        <section className="quote-panel">
                            <div className="quote-header">
                                <strong>Quote ready</strong>
                                {quote.expiresAt && (
                                    <span>Expires {new Date(quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                )}
                            </div>
                            <MoneySummary data={quote} />
                        </section>
                    )}
                </aside>
            </div>

            {selectedProduct && (
                <ProductDialog
                    product={selectedProduct}
                    quantity={number(cart[selectedProduct.id])}
                    onClose={() => setSelectedProduct(null)}
                    onIncrement={() => changeQuantity(selectedProduct.id, 1)}
                    onDecrement={() => changeQuantity(selectedProduct.id, -1)}
                />
            )}
        </Screen>
    );
}

function Screen({ children, wide = false }) {
    return (
        <main className="commerce-page">
            <div className={wide ? 'commerce-shell' : 'commerce-shell commerce-shell--narrow'}>
                <Brand />
                {children}
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

function StateCard({ title, message, children }) {
    return (
        <section className="state-card">
            <h1>{title}</h1>
            {message && <p>{message}</p>}
            {children}
        </section>
    );
}

function StoreHeader({ store }) {
    return (
        <section className="store-header">
            {store.bannerUrl && <img className="store-banner" src={store.bannerUrl} alt="" />}
            <div className="store-header-content">
                {store.logoUrl ? (
                    <img className="store-logo" src={store.logoUrl} alt="" />
                ) : (
                    <div className="store-logo store-logo-fallback">{initials(store.name)}</div>
                )}
                <div>
                    <h1>{store.name}</h1>
                    {store.description && <p>{store.description}</p>}
                    <div className="store-meta">
                        {store.countryCode && <span>{store.countryCode}</span>}
                        {store.defaultCurrency && <span>{store.defaultCurrency}</span>}
                    </div>
                </div>
            </div>
        </section>
    );
}

function ProductCard({ product, quantity, onOpen, onIncrement, onDecrement }) {
    const out = inventoryLabel(product) === 'Out of stock';
    return (
        <article className="product-card">
            <button className="product-preview" onClick={onOpen} aria-label={`View ${product.name}`}>
                {initials(product.name)}
            </button>
            <div className="product-body">
                <button className="product-title" onClick={onOpen}>{product.name}</button>
                {product.description && <p>{product.description}</p>}
                <div className="product-meta">
                    <strong>{amount(product.priceAmount, product.priceCurrency)}</strong>
                    <span>{inventoryLabel(product)}</span>
                </div>
            </div>
            <Quantity quantity={quantity} onIncrement={onIncrement} onDecrement={onDecrement} disabled={out} />
        </article>
    );
}

function Quantity({ quantity, onIncrement, onDecrement, disabled }) {
    return (
        <div className="quantity">
            <button onClick={onDecrement} disabled={disabled || quantity <= 0} aria-label="Decrease quantity">-</button>
            <span>{quantity}</span>
            <button onClick={onIncrement} disabled={disabled} aria-label="Increase quantity">+</button>
        </div>
    );
}

function BuyerFields({ buyer, setBuyer }) {
    const update = (key, value) => setBuyer((current) => ({ ...current, [key]: value }));
    return (
        <div className="buyer-fields">
            <label>
                <span>Name</span>
                <input value={buyer.name} onChange={(event) => update('name', event.target.value)} placeholder="Buyer name" />
            </label>
            <label>
                <span>Email</span>
                <input value={buyer.email} onChange={(event) => update('email', event.target.value)} placeholder="buyer@example.com" inputMode="email" />
            </label>
            <label>
                <span>Phone</span>
                <input value={buyer.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+243..." inputMode="tel" />
            </label>
        </div>
    );
}

function CurrencyFields({ currencies, setCurrencies }) {
    const update = (key, value) => {
        setCurrencies((current) => ({ ...current, [key]: value.toUpperCase().slice(0, 16) }));
    };

    return (
        <div className="buyer-fields currency-fields">
            <label>
                <span>Billing currency</span>
                <input
                    value={currencies.billingCurrency}
                    onChange={(event) => update('billingCurrency', event.target.value)}
                    placeholder="USD"
                    autoCapitalize="characters"
                />
            </label>
            <label>
                <span>Payment currency</span>
                <input
                    value={currencies.paymentCurrency}
                    onChange={(event) => update('paymentCurrency', event.target.value)}
                    placeholder="CDF"
                    autoCapitalize="characters"
                />
            </label>
        </div>
    );
}

function InlineError({ message }) {
    return <div className="inline-error">{message}</div>;
}

function Unavailable({ message }) {
    return (
        <div className="unavailable">
            <strong>Commerce unavailable</strong>
            <span>{message || 'Fondeka Commerce is not available yet.'}</span>
        </div>
    );
}

function MoneySummary({ data }) {
    return (
        <div className="money-summary">
            <div>
                <span>Checkout subtotal</span>
                <strong>{amount(data.itemSubtotalAmount, data.itemSubtotalCurrency)}</strong>
            </div>
            <div>
                <span>Fee</span>
                <strong>{amount(data.feeAmount, data.feeCurrency)}</strong>
            </div>
            <div className="money-total">
                <span>Buyer total</span>
                <strong>{amount(data.totalAmount, data.totalCurrency)}</strong>
            </div>
            <div>
                <span>Billing amount</span>
                <strong>{amount(data.billingAmount, data.billingCurrency)}</strong>
            </div>
            <div>
                <span>Payment amount</span>
                <strong>{amount(data.paymentAmount, data.paymentCurrency)}</strong>
            </div>
            {data.fxSnapshot && <FxDetails fx={data.fxSnapshot} />}
        </div>
    );
}

function PaymentHandoff({ order }) {
    const status = String(order?.status || '').toUpperCase();
    if (status === 'PAID') {
        return (
            <div className="payment-handoff payment-handoff--paid">
                <strong>Payment collected</strong>
                <span>Your order payment has been received.</span>
            </div>
        );
    }

    return (
        <div className="payment-handoff">
            <strong>Waiting for payment</strong>
            <span>
                Public web payment is not available yet. Fondeka Balance payment is currently handled from the authenticated app flow.
            </span>
        </div>
    );
}

function FxDetails({ fx }) {
    return (
        <div className="fx-details">
            Converted from {amount(fx.sourceAmount, fx.sourceCurrency)} to {amount(fx.targetAmount, fx.targetCurrency)}.
            {fx.provider && <span> Provider {fx.provider}.</span>}
        </div>
    );
}

function ProductDialog({ product, quantity, onClose, onIncrement, onDecrement }) {
    const out = inventoryLabel(product) === 'Out of stock';
    return (
        <div className="dialog-backdrop" onClick={onClose} role="presentation">
            <section className="dialog" role="dialog" aria-modal="true" aria-label={product.name} onClick={(event) => event.stopPropagation()}>
                <button className="dialog-close" onClick={onClose} aria-label="Close">x</button>
                <div className="dialog-preview">{initials(product.name)}</div>
                <h2>{product.name}</h2>
                <p>{product.description || 'No description provided.'}</p>
                <div className="product-meta">
                    <strong>{amount(product.priceAmount, product.priceCurrency)}</strong>
                    <span>{inventoryLabel(product)}</span>
                </div>
                <Quantity quantity={quantity} onIncrement={onIncrement} onDecrement={onDecrement} disabled={out} />
            </section>
        </div>
    );
}
