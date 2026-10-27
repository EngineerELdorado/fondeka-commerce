const PAID_ORDER_STATUSES = new Set(['PAID', 'CONFIRMED', 'FULFILLING', 'FULFILLED', 'COMPLETED']);
const CLOSED_ORDER_STATUSES = new Set([
    'FAILED', 'CANCELED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED',
]);
const upper = (value) => String(value || '').trim().toUpperCase();

export function isTraining(product) {
    return upper(product?.productType || product?.type) === 'TRAINING';
}

export function productQuantity(product, value) {
    const quantity = Number(value);
    const safe = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
    return isTraining(product) ? Math.min(1, safe) : safe;
}

export function storefrontCartItems(products, cart) {
    const seen = new Set();
    return products.flatMap((product) => {
        const key = String(product.id);
        const quantity = productQuantity(product, cart[product.id]);
        if (!quantity || seen.has(key)) return [];
        seen.add(key);
        return [{ product, quantity }];
    });
}

export function checkoutLineItems(cartItems) {
    const trainings = new Set();
    return cartItems.map(({ product, quantity }) => {
        if (isTraining(product)) {
            const key = String(product.id);
            if (trainings.has(key)) throw new Error('A training can only appear once in your cart.');
            trainings.add(key);
        }
        return { productId: product.id, quantity: productQuantity(product, quantity) };
    });
}

// Match the backend's purchase policy. A provider redirect or transaction status alone is insufficient.
export function isEligiblePaidOrder(order) {
    if (!PAID_ORDER_STATUSES.has(upper(order?.status))) return false;
    if (order.paymentTransactionStatus) return upper(order.paymentTransactionStatus) === 'COMPLETED';
    if (order.paymentTransactionId != null) return false;
    return upper(order.channel) === 'POS' && upper(order.posPaymentMode) === 'CASH'
        && upper(order.posPaymentStatus) === 'PAID'
        && order.amountPaid != null && order.totalAmount != null
        && Number(order.amountPaid) >= Number(order.totalAmount)
        && Boolean(order.totalCurrency) && order.amountPaidCurrency === order.totalCurrency;
}

function trainingResourceUrl(order, item, field) {
    if (!isTraining(item) || !isEligiblePaidOrder(order)) return null;
    const value = item[field];
    if (typeof value !== 'string' || !value) return null;
    try {
        if (!['https:', 'http:'].includes(new URL(value).protocol)) return null;
        // Preserve the backend value byte for byte, including its scoped credentials.
        return value;
    } catch {
        return null;
    }
}

export const trainingPlayerUrl = (order, item) => trainingResourceUrl(order, item, 'trainingPlayerUrl');
export const trainingAccessUrl = (order, item) => trainingResourceUrl(order, item, 'trainingAccessUrl');

export function shouldPollOrder(order, expectedTrainingIds = []) {
    if (!order?.reference || !order?.accessToken) return false;
    if (CLOSED_ORDER_STATUSES.has(upper(order.status))) return false;
    if (['FAILED', 'CANCELED', 'CANCELLED'].includes(upper(order.paymentTransactionStatus))) return false;
    if (!isEligiblePaidOrder(order)) return true;
    const trainings = (Array.isArray(order.items) ? order.items : []).filter(isTraining);
    if (expectedTrainingIds.some((id) => !trainings.some((item) => String(item.productId) === String(id)))) return true;
    return trainings.some((item) => !trainingPlayerUrl(order, item));
}

export function trainingOutlinePath({ lookup, storeSlug, productSlug }) {
    if (lookup != null && String(lookup)) return `/public/commerce/products/${encodeURIComponent(lookup)}/training`;
    if (storeSlug && productSlug) {
        return `/public/commerce/stores/${encodeURIComponent(storeSlug)}/products/${encodeURIComponent(productSlug)}/training`;
    }
    return null;
}
