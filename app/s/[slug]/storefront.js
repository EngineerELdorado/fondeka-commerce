'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/api';

const PAGE_SIZE = 20;
const PAYMENT_METHODS = [
    {
        key: 'FONDEKA_BALANCE',
        id: null,
        name: 'Fondeka Balance',
        type: 'BALANCE',
        currency: '',
        note: 'Fastest option for customers using the Fondeka app.',
    },
    {
        key: 'MOBILE_MONEY',
        id: 57,
        name: 'Mobile Money',
        type: 'MOBILE_MONEY',
        currency: 'CDF',
        note: 'Use the buyer phone number for payment follow-up.',
    },
    {
        key: 'CARD',
        id: null,
        name: 'Card',
        type: 'CARD',
        currency: '',
        note: 'Prepared for public card checkout when enabled.',
    },
    {
        key: 'CRYPTO',
        id: null,
        name: 'Crypto',
        type: 'CRYPTO',
        currency: '',
        note: 'Prepared for crypto invoice checkout when enabled.',
    },
];

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

function productImage(product) {
    return product?.image1 || product?.imageUrl || product?.image2 || product?.image3 || product?.image4 || '';
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

function cartSubtotal(cartItems) {
    return cartItems.reduce((sum, { product, quantity }) => (
        sum + number(product.priceAmount) * number(quantity)
    ), 0);
}

function idempotencyKey(prefix = 'commerce-payment') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function feeQuotePayload(feeQuote, order, paymentMethod) {
    const netAmount = number(feeQuote?.netAmount ?? order?.paymentAmount);
    const netCurrency = feeQuote?.netAmountCurrency || order?.paymentCurrency || paymentMethod?.currency || '';
    const feeAmount = number(feeQuote?.fees);
    const feeCurrency = feeQuote?.feesCurrency || feeQuote?.grossAmountCurrency || paymentMethod?.currency || netCurrency;
    const totalAmount = number(feeQuote?.grossAmount ?? feeQuote?.totalToPay ?? order?.paymentAmount);
    const totalCurrency = feeQuote?.grossAmountCurrency || feeQuote?.totalToPayCurrency || paymentMethod?.currency || order?.paymentCurrency || '';

    return {
        ...feeQuote,
        quoteSource: 'CUSTOMER_FEES',
        action: 'COMMERCE_CHECKOUT_PAYMENT',
        paymentMethodId: paymentMethod?.id || null,
        paymentMethodName: paymentMethod?.name || null,
        itemSubtotalAmount: netAmount,
        itemSubtotalCurrency: netCurrency,
        feeAmount,
        feeCurrency,
        totalAmount,
        totalCurrency,
        billingAmount: order?.billingAmount ?? netAmount,
        billingCurrency: order?.billingCurrency || netCurrency,
        paymentAmount: totalAmount,
        paymentCurrency: totalCurrency,
        netAmount,
        netAmountCurrency: netCurrency,
        grossAmount: totalAmount,
        grossAmountCurrency: totalCurrency,
    };
}

export default function Storefront({ slug, productLookup, productSlug, initialStore = null, initialProducts = null, initialCart = null, initialLoadError = null }) {
    const seededProducts = Array.isArray(initialProducts) ? initialProducts : [];
    const hasInitialState = !!initialStore || seededProducts.length > 0 || !!initialLoadError;
    const [store, setStore] = useState(initialStore);
    const [products, setProducts] = useState(seededProducts);
    const [cart, setCart] = useState(initialCart || {});
    const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' });
    const seededCurrency = firstCurrency(initialStore, seededProducts);
    const [currencies, setCurrencies] = useState({ billingCurrency: seededCurrency, paymentCurrency: seededCurrency });
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [quote, setQuote] = useState(null);
    const [checkout, setCheckout] = useState(null);
    const [order, setOrder] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[1].key);
    const [loading, setLoading] = useState(!hasInitialState);
    const [busy, setBusy] = useState(false);
    const [loadError, setLoadError] = useState(initialLoadError);
    const [flowError, setFlowError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        setFlowError(null);
        try {
            let storePayload = null;
            let loadedProducts = [];

            if (productLookup || (slug && productSlug)) {
                const product = slug && productSlug
                    ? await apiFetch(`/public/commerce/stores/${encodeURIComponent(slug)}/products/${encodeURIComponent(productSlug)}`)
                    : await apiFetch(`/public/commerce/products/${encodeURIComponent(productLookup)}`);
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
    }, [productLookup, productSlug, slug]);

    useEffect(() => {
        if (hasInitialState) return;
        load();
    }, [hasInitialState, load]);

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

    const updatePaymentMethod = (methodId) => {
        setPaymentMethod(methodId);
        setQuote(null);
        setCheckout(null);
        setFlowError(null);
    };

    const validate = () => {
        if (!cartItems.length) return 'Choose at least one product.';
        if (!currencies.billingCurrency.trim()) return 'Billing currency is required.';
        if (!currencies.paymentCurrency.trim()) return 'Payment currency is required.';
        if (paymentMethod === 'MOBILE_MONEY' && !buyer.phone.trim()) return 'Buyer phone is required for Mobile Money.';
        const selectedMethod = PAYMENT_METHODS.find((method) => method.key === paymentMethod);
        if (!selectedMethod?.id) return `${selectedMethod?.name || 'This payment method'} is not configured for web checkout yet.`;
        return null;
    };

    const ensureOrder = async () => {
        if (order?.reference && order?.accessToken) return order;
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
        return pendingOrder;
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
            const selectedMethod = PAYMENT_METHODS.find((method) => method.key === paymentMethod) || PAYMENT_METHODS[1];
            const currentOrder = await ensureOrder();
            const paymentCurrency = currentOrder.paymentCurrency || currencies.paymentCurrency;
            const displayCurrency = selectedMethod.currency || paymentCurrency;
            const params = new URLSearchParams({
                action: 'COMMERCE_CHECKOUT_PAYMENT',
                paymentMethodId: String(selectedMethod.id),
                amount: String(currentOrder.paymentAmount),
                currency: String(paymentCurrency || '').trim().toUpperCase(),
                displayCurrency: String(displayCurrency || '').trim().toUpperCase(),
            });
            const feeQuote = await apiFetch(`/customer-api/fees?${params.toString()}`);
            setQuote(feeQuotePayload(feeQuote, currentOrder, selectedMethod));
        } catch (error) {
            setFlowError(readError(error, 'Unable to calculate payment fees.'));
        } finally {
            setBusy(false);
        }
    };

    const startPayment = async () => {
        const validation = validate();
        if (validation) {
            setFlowError({ message: validation, errorCode: 'INVALID_REQUEST' });
            return;
        }
        if (!quote) {
            setFlowError({ message: 'Review the payment total before starting payment.', errorCode: 'INVALID_REQUEST' });
            return;
        }

        setBusy(true);
        setFlowError(null);
        try {
            const selectedMethod = PAYMENT_METHODS.find((method) => method.key === paymentMethod) || PAYMENT_METHODS[1];
            const currentOrder = await ensureOrder();
            const paidOrder = await apiFetch(
                `/customer-api/commerce/orders/${encodeURIComponent(currentOrder.reference)}/payments/start?accessToken=${encodeURIComponent(currentOrder.accessToken || '')}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        paymentMethod: {
                            id: selectedMethod.id,
                            type: selectedMethod.type,
                            accountRef: selectedMethod.key === 'MOBILE_MONEY' ? buyer.phone.trim() : null,
                            currency: selectedMethod.currency || currentOrder.paymentCurrency,
                            networkId: null,
                            feeApplicationMode: quote.feeApplicationMode || null,
                        },
                        idempotencyKey: idempotencyKey(`commerce-${currentOrder.reference}`),
                    }),
                }
            );
            setOrder(paidOrder);
        } catch (error) {
            setFlowError(readError(error, 'Unable to start payment.'));
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
                    <h1>Complete payment</h1>
                    <p>Review the payment total, then start payment with the selected rail.</p>

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

                    <PaymentHandoff order={order} />
                    <OrderPaymentPanel
                        order={order}
                        buyer={buyer}
                        paymentMethod={paymentMethod}
                        setPaymentMethod={updatePaymentMethod}
                        quote={quote}
                        checkout={checkout}
                        flowError={flowError}
                        busy={busy}
                        onQuote={quoteCheckout}
                        onConfirm={startPayment}
                    />

                    <button
                        className="button secondary"
                        onClick={() => {
                            setOrder(null);
                            setCheckout(null);
                            setQuote(null);
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

    const directProduct = (productLookup || productSlug) ? products[0] : null;
    if (directProduct) {
        return (
            <Screen wide>
                <div className="product-page-layout">
                    <ProductHero product={directProduct} store={store} />

                    <aside className="checkout-panel product-checkout-panel" aria-label="Checkout">
                        <div className="section-heading">
                            <h2>Checkout</h2>
                            <span>{cartCount} item{cartCount === 1 ? '' : 's'}</span>
                        </div>

                        <div className="product-quantity-row">
                            <span>Quantity</span>
                            <Quantity
                                quantity={number(cart[directProduct.id])}
                                onIncrement={() => changeQuantity(directProduct.id, 1)}
                                onDecrement={() => changeQuantity(directProduct.id, -1)}
                                disabled={inventoryLabel(directProduct) === 'Out of stock'}
                            />
                        </div>

                        <CheckoutPaymentForm
                            cartItems={cartItems}
                            buyer={buyer}
                            setBuyer={updateBuyer}
                            currencies={currencies}
                            setCurrencies={updateCurrencies}
                            paymentMethod={paymentMethod}
                            setPaymentMethod={updatePaymentMethod}
                            quote={quote}
                            checkout={checkout}
                            flowError={flowError}
                            busy={busy}
                            onQuote={quoteCheckout}
                            onConfirm={startPayment}
                        />
                    </aside>
                </div>
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

                    <CheckoutPaymentForm
                        cartItems={cartItems}
                        buyer={buyer}
                        setBuyer={updateBuyer}
                        currencies={currencies}
                        setCurrencies={updateCurrencies}
                        paymentMethod={paymentMethod}
                        setPaymentMethod={updatePaymentMethod}
                        quote={quote}
                        checkout={checkout}
                        flowError={flowError}
                        busy={busy}
                        onQuote={quoteCheckout}
                        onConfirm={startPayment}
                    />
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

function ProductHero({ product, store }) {
    const image = productImage(product);
    return (
        <section className="product-page-hero">
            <div className="product-page-media">
                {image ? (
                    <img src={image} alt={product.name || ''} />
                ) : (
                    <div className="product-page-media-fallback">{initials(product.name)}</div>
                )}
            </div>

            <div className="product-page-copy">
                <div className="product-page-store">
                    {store?.logoUrl ? (
                        <img src={store.logoUrl} alt="" />
                    ) : (
                        <span>{initials(store?.name || product?.storeName)}</span>
                    )}
                    <div>
                        <strong>{store?.name || product?.storeName || 'Fondeka merchant'}</strong>
                        {store?.description && <small>{store.description}</small>}
                    </div>
                </div>

                <p className="eyebrow">{product.type || 'Product'}</p>
                <h1>{product.name}</h1>
                <div className="product-page-price">{amount(product.priceAmount, product.priceCurrency)}</div>
                {product.description && <p className="product-page-description">{product.description}</p>}
                <div className="store-meta">
                    <span>{inventoryLabel(product)}</span>
                    {store?.countryCode && <span>{store.countryCode}</span>}
                </div>
            </div>
        </section>
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
    const image = productImage(product);
    return (
        <article className="product-card">
            <button className="product-preview" onClick={onOpen} aria-label={`View ${product.name}`}>
                {image ? <img src={image} alt="" /> : initials(product.name)}
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

function CheckoutPaymentForm({
    cartItems,
    buyer,
    setBuyer,
    currencies,
    setCurrencies,
    paymentMethod,
    setPaymentMethod,
    quote,
    checkout,
    flowError,
    busy,
    onQuote,
    onConfirm,
}) {
    const selectedMethod = PAYMENT_METHODS.find((method) => method.key === paymentMethod) || PAYMENT_METHODS[1];
    const cartSubtotal = cartItems.reduce((sum, { product, quantity }) => (
        sum + number(product.priceAmount) * number(quantity)
    ), 0);
    const cartCurrency = currencies.billingCurrency || cartItems[0]?.product?.priceCurrency || '';
    const requiresPhone = selectedMethod.key === 'MOBILE_MONEY';

    return (
        <section className="commerce-payment-flow" aria-label="Payment">
            <section className="payment-step-card">
                <div className="payment-step-heading payment-step-heading--primary">
                    <span>1</span>
                    <div>
                        <strong>Order total</strong>
                        <small>{cartItems.length ? `${cartItems.length} line item${cartItems.length === 1 ? '' : 's'}` : 'No items selected'}</small>
                    </div>
                </div>

                {cartItems.length ? (
                    <div className="cart-lines payment-cart-lines">
                        {cartItems.map(({ product, quantity }) => (
                            <div className="cart-line" key={product.id}>
                                <div>
                                    <strong>{product.name}</strong>
                                    <span>{quantity} x {amount(product.priceAmount, product.priceCurrency)}</span>
                                </div>
                                <b>{amount(number(product.priceAmount) * number(quantity), product.priceCurrency)}</b>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="muted">Choose products to start a checkout.</p>
                )}

                <div className="commerce-payment-total">
                    <span>Estimated subtotal</span>
                    <strong>{amount(cartSubtotal, cartCurrency)}</strong>
                </div>
            </section>

            <section className="payment-step-card">
                <div className="payment-step-heading">
                    <span>2</span>
                    <div>
                        <strong>Buyer details</strong>
                        <small>Used for confirmation and payment follow-up</small>
                    </div>
                </div>
                <BuyerFields buyer={buyer} setBuyer={setBuyer} />
                <CurrencyFields currencies={currencies} setCurrencies={setCurrencies} />
            </section>

            <section className="payment-step-card">
                <div className="payment-step-heading">
                    <span>3</span>
                    <div>
                        <strong>How to pay</strong>
                        <small>Select the route the buyer expects to use</small>
                    </div>
                </div>

                <div className="payment-method-grid">
                    {PAYMENT_METHODS.map((method) => {
                        const active = method.key === paymentMethod;
                        return (
                            <button
                                type="button"
                                key={method.key}
                                className={`payment-method-option${active ? ' payment-method-option--active' : ''}`}
                                onClick={() => setPaymentMethod(method.key)}
                                aria-pressed={active}
                            >
                                <span>{method.currency || method.type}</span>
                                <strong>{method.name}</strong>
                                <small>{method.note}</small>
                            </button>
                        );
                    })}
                </div>

                {requiresPhone && (
                    <p className="payment-method-hint">
                        Mobile Money will use the buyer phone number above. Add it before requesting the quote.
                    </p>
                )}

                <div className="actions payment-actions">
                    <button className="button secondary" onClick={onQuote} disabled={busy || !cartItems.length}>
                        {busy ? 'Working...' : quote ? 'Refresh total' : 'Review payment'}
                    </button>
                    <button className="button primary" onClick={onConfirm} disabled={busy || !quote || !cartItems.length}>
                        Start payment
                    </button>
                </div>

                {checkout && (
                    <p className="muted">Checkout {checkout.id} created. Creating order...</p>
                )}

                {flowError && (
                    isFeatureDisabled(flowError)
                        ? <Unavailable message={flowError.message} />
                        : <InlineError message={flowError.message} />
                )}
            </section>

            {quote && (
                <section className="payment-review-panel">
                    <div className="quote-header">
                        <strong>Payment total</strong>
                        {quote.expiresAt && (
                            <span>Expires {new Date(quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                    </div>
                    <MoneySummary data={quote} />
                    <div className="payment-review-method">
                        <span>Payment route</span>
                        <strong>{selectedMethod.name}</strong>
                    </div>
                </section>
            )}
        </section>
    );
}

function OrderPaymentPanel({
    order,
    buyer,
    paymentMethod,
    setPaymentMethod,
    quote,
    checkout,
    flowError,
    busy,
    onQuote,
    onConfirm,
}) {
    const selectedMethod = PAYMENT_METHODS.find((method) => method.key === paymentMethod) || PAYMENT_METHODS[1];
    const status = String(order?.status || '').toUpperCase();
    const payable = !status || status === 'PENDING_PAYMENT';

    return (
        <section className="commerce-payment-flow" aria-label="Order payment">
            <section className="payment-step-card">
                <div className="payment-step-heading payment-step-heading--primary">
                    <span>1</span>
                    <div>
                        <strong>Checkout amount</strong>
                        <small>Amount before Fondeka payment fees</small>
                    </div>
                </div>
                <div className="commerce-payment-total commerce-payment-total--plain">
                    <span>Amount to fund</span>
                    <strong>{amount(order.paymentAmount, order.paymentCurrency)}</strong>
                </div>
            </section>

            <section className="payment-step-card">
                <div className="payment-step-heading">
                    <span>2</span>
                    <div>
                        <strong>Payment rail</strong>
                        <small>Fees are configured separately for commerce checkout payments</small>
                    </div>
                </div>
                <div className="payment-method-grid">
                    {PAYMENT_METHODS.map((method) => {
                        const active = method.key === paymentMethod;
                        return (
                            <button
                                type="button"
                                key={method.key}
                                className={`payment-method-option${active ? ' payment-method-option--active' : ''}`}
                                onClick={() => setPaymentMethod(method.key)}
                                aria-pressed={active}
                                disabled={!payable}
                            >
                                <span>{method.currency || method.type}</span>
                                <strong>{method.name}</strong>
                                <small>{method.id ? method.note : 'Not configured for web checkout yet.'}</small>
                            </button>
                        );
                    })}
                </div>

                {selectedMethod.key === 'MOBILE_MONEY' && (
                    <p className="payment-method-hint">
                        Payment request will be sent to {buyer.phone || 'the buyer phone number'}.
                    </p>
                )}

                <div className="actions payment-actions">
                    <button className="button secondary" onClick={onQuote} disabled={busy || !payable}>
                        {busy ? 'Working...' : quote ? 'Refresh total' : 'Review payment'}
                    </button>
                    <button className="button primary" onClick={onConfirm} disabled={busy || !quote || !payable}>
                        Start payment
                    </button>
                </div>

                {checkout && (
                    <p className="muted">Checkout {checkout.id} is linked to this order.</p>
                )}

                {flowError && (
                    isFeatureDisabled(flowError)
                        ? <Unavailable message={flowError.message} />
                        : <InlineError message={flowError.message} />
                )}
            </section>

            {quote && (
                <section className="payment-review-panel">
                    <div className="quote-header">
                        <strong>Total to pay</strong>
                    </div>
                    <MoneySummary data={quote} />
                    <div className="payment-review-method">
                        <span>Payment route</span>
                        <strong>{selectedMethod.name}</strong>
                    </div>
                </section>
            )}
        </section>
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
                <span>Checkout amount</span>
                <strong>{amount(data.netAmount ?? data.itemSubtotalAmount, data.netAmountCurrency ?? data.itemSubtotalCurrency)}</strong>
            </div>
            <div>
                <span>Fee</span>
                <strong>{amount(data.feeAmount, data.feeCurrency)}</strong>
            </div>
            <div className="money-total">
                <span>Total to pay</span>
                <strong>{amount(data.grossAmount ?? data.totalAmount, data.grossAmountCurrency ?? data.totalCurrency)}</strong>
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
