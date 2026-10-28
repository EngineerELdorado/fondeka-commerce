const currencyCode = (value) => String(value || '').trim().toUpperCase();

export function checkoutCurrencies(cartItems, currencies, method) {
    if (method && !currencyCode(method.currency)) {
        throw checkoutError('INVALID_REQUEST', 'The selected payment method has no configured payment currency.');
    }
    const productCurrency = cartItems.find(({ product }) => product?.priceCurrency)?.product?.priceCurrency;
    const billingCurrency = currencyCode(productCurrency || currencies.billingCurrency);
    return {
        billingCurrency,
        paymentCurrency: currencyCode(method?.currency || currencies.paymentCurrency || billingCurrency),
    };
}

export function orderPaymentHasStarted(order) {
    return order?.paymentTransactionId != null
        || Boolean(order?.paymentTransactionReference)
        || Boolean(order?.paymentTransactionStatus)
        || Boolean(order?.paymentStartedAt);
}

function checkoutError(code, message) {
    const error = new Error(message);
    error.errorCode = code;
    return error;
}

export function orderMatchesMethodCurrency(order, method) {
    return Boolean(currencyCode(order?.paymentCurrency) && currencyCode(method?.currency))
        && currencyCode(order.paymentCurrency) === currencyCode(method.currency);
}

export function commercePaymentIdempotencyKey(order) {
    if (!order?.reference) throw checkoutError('INVALID_REQUEST', 'An order reference is required.');
    return `commerce-order-${order.reference}`;
}

export function paymentAttemptNeedsRecovery(order, attemptedReference) {
    if (!attemptedReference) return false;
    if (order?.reference !== attemptedReference) return true;
    const paymentStatus = String(order.paymentTransactionStatus || '').toUpperCase();
    // Order wording alone does not prove an in-flight payment has settled or failed.
    return !['COMPLETED', 'FAILED', 'CANCELED', 'CANCELLED'].includes(paymentStatus);
}

export async function recoverCommerceOrder({ order, getOrder, onOrder }) {
    if (!order?.reference || !order?.accessToken) {
        throw checkoutError('COMMERCE_PAYMENT_ALREADY_STARTED', 'The original payment must be recovered before continuing.');
    }
    const latest = await getOrder(order);
    if (latest?.reference !== order.reference || latest?.accessToken !== order.accessToken) {
        throw checkoutError('INVALID_REQUEST', 'The existing order could not be recovered.');
    }
    onOrder(latest);
    return latest;
}

export function paymentReviewMatchesMethod(review, method) {
    return Boolean(review?.quote && review?.order?.reference && review?.order?.accessToken && method?.id)
        && String(review.method?.id) === String(method.id)
        && orderMatchesMethodCurrency(review.order, review.method)
        && orderMatchesMethodCurrency(review.order, method)
        && (review.method?.feeApplicationMode || '') === (method.feeApplicationMode || '');
}

export function commerceFeeParams(order, method) {
    const paymentCurrency = currencyCode(order?.paymentCurrency);
    if (!paymentCurrency || order?.paymentAmount == null || !orderMatchesMethodCurrency(order, method)) {
        throw checkoutError('INVALID_REQUEST', 'The order and payment method currencies must match.');
    }
    // Checkout has already converted the product/billing value. Fees use that saved payment base.
    const params = new URLSearchParams({
        action: 'COMMERCE_CHECKOUT_PAYMENT',
        paymentMethodId: String(method.id),
        amount: String(order.paymentAmount),
        currency: paymentCurrency,
        paymentCurrency,
        billingCurrency: paymentCurrency,
        displayCurrency: paymentCurrency,
    });
    if (method.feeApplicationMode) params.set('feeApplicationMode', method.feeApplicationMode);
    return params;
}

/** Called only by an explicit buyer review action. This function never starts a payment. */
export async function ensureCommerceOrder({
    order, checkout, payload, paymentAttempted = false,
    getOrder, createCheckout, createOrder, onCheckout, onOrder, paymentAlreadyStartedMessage,
}) {
    const blocked = () => checkoutError('COMMERCE_PAYMENT_ALREADY_STARTED',
        paymentAlreadyStartedMessage || 'A payment has already been started for this order.');
    const pending = (value) => String(value?.status || '').toUpperCase() === 'PENDING_PAYMENT'
        && ['paymentTransactionId', 'paymentTransactionReference', 'paymentTransactionStatus']
            .every((key) => Object.hasOwn(value, key) && value[key] === null)
        && !orderPaymentHasStarted(value);
    const currencyMatches = (value) => currencyCode(value?.paymentCurrency) === currencyCode(payload.paymentCurrency);
    let draft = checkout;

    if (order?.reference && order?.accessToken) {
        // Failure to reload leaves the original order in place; it never permits a replacement.
        const latest = await recoverCommerceOrder({ order, getOrder, onOrder });
        if (paymentAttempted || !pending(latest)) throw blocked();
        if (currencyMatches(latest)) return latest;
        // This old order is positively unstarted. Only this explicit review creates a new currency snapshot.
        draft = null;
    }

    if (paymentAttempted) throw blocked();

    if (!draft?.id || !draft?.accessToken || !currencyMatches(draft)) {
        draft = await createCheckout(payload);
        // Retain this ID/token before the order request: retrying the same checkout recovers a lost response.
        onCheckout(draft);
    }
    const created = await createOrder(draft);
    onOrder(created);
    if (!pending(created)) throw blocked();
    if (!currencyMatches(created)) {
        throw checkoutError('INVALID_REQUEST', 'The checkout returned a different payment currency.');
    }
    return created;
}
