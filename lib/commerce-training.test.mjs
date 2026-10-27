import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutLineItems, isEligiblePaidOrder, productQuantity, shouldPollOrder, storefrontCartItems, trainingOutlinePath, trainingPlayerUrl, trainingAccessUrl } from './commerce-training.mjs';

const training = { id: 7, productType: 'TRAINING' };
// Deliberately synthetic credentials; never use real order/player URLs in tests or artifacts.
const player = 'https://api.example.test/player/orders/EXAMPLE/items/42?accessToken=synthetic%2Btoken&lang=fr';
const item = { productId: 7, orderItemId: 42, productType: 'TRAINING', trainingPlayerUrl: player };
const paid = { reference: 'EXAMPLE', accessToken: 'synthetic', status: 'PAID', paymentTransactionStatus: 'COMPLETED', items: [item] };

test('training quantity is one across cart derivation and checkout serialization', () => {
    assert.equal(productQuantity(training, 99), 1);
    assert.equal(productQuantity(training, 0), 0);
    assert.equal(productQuantity(training, -1), 0);
    assert.equal(productQuantity(training, Infinity), 0);
    assert.equal(productQuantity({ type: 'PHYSICAL' }, 3), 3);
    assert.deepEqual(storefrontCartItems([training, { ...training, id: '7' }], { 7: 6 }), [{ product: training, quantity: 1 }]);
    assert.deepEqual(checkoutLineItems([{ product: training, quantity: 8 }]), [{ productId: 7, quantity: 1 }]);
    assert.throws(() => checkoutLineItems([
        { product: training, quantity: 1 }, { product: { ...training, id: '7' }, quantity: 1 },
    ]), /only appear once/);
});

test('player URL is used exactly as returned and never synthesized from access URL or IDs', () => {
    assert.equal(trainingPlayerUrl(paid, item), player);
    assert.equal(trainingPlayerUrl(paid, { ...item, trainingPlayerUrl: null, trainingAccessUrl: 'https://api.example.test/curriculum' }), null);
    assert.equal(trainingPlayerUrl(paid, { ...item, trainingPlayerUrl: 'javascript:alert(1)' }), null);
    assert.equal(trainingPlayerUrl(paid, { ...item, trainingPlayerUrl: '/guessed/player' }), null);
});

test('ineligible orders stay locked even when a completed transaction or stale player URL exists', () => {
    for (const status of ['PENDING_PAYMENT', 'PARTIALLY_PAID', 'ON_CREDIT', 'FAILED', 'CANCELED', 'REFUND_PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED']) {
        const order = { ...paid, status };
        assert.equal(isEligiblePaidOrder(order), false, status);
        assert.equal(trainingPlayerUrl(order, item), null, status);
    }
    for (const paymentTransactionStatus of ['PROCESSING', 'FAILED', 'FUNDED', 'DISPUTED', 'REFUNDED']) {
        assert.equal(trainingPlayerUrl({ ...paid, paymentTransactionStatus }, item), null, paymentTransactionStatus);
    }
    assert.equal(trainingPlayerUrl({ ...paid, paymentTransactionStatus: null }, item), null);
    for (const status of ['PAID', 'CONFIRMED', 'FULFILLING', 'FULFILLED', 'COMPLETED']) {
        assert.equal(trainingPlayerUrl({ ...paid, status }, item), player, status);
    }
});

test('POS cash eligibility requires full payment in the order currency', () => {
    const cash = { status: 'PAID', channel: 'POS', posPaymentMode: 'CASH', posPaymentStatus: 'PAID', amountPaid: '20', totalAmount: '20', amountPaidCurrency: 'USD', totalCurrency: 'USD' };
    assert.equal(isEligiblePaidOrder(cash), true);
    assert.equal(isEligiblePaidOrder({ ...cash, amountPaid: '10' }), false);
    assert.equal(isEligiblePaidOrder({ ...cash, amountPaidCurrency: 'EUR' }), false);
    assert.equal(isEligiblePaidOrder({ ...cash, paymentTransactionId: 123 }), false);
});

test('inline learning receives only the exact access URL of an eligible training purchase', () => {
    const url = 'https://api.example.test/public/commerce/orders/EXAMPLE/items/42/training?accessToken=synthetic%2Btoken';
    const authorizedItem = { ...item, trainingAccessUrl: url };
    assert.equal(trainingAccessUrl(paid, authorizedItem), url);
    assert.equal(trainingAccessUrl(paid, { ...authorizedItem, productType: 'DIGITAL' }), null);
    assert.equal(trainingAccessUrl(paid, { ...authorizedItem, trainingAccessUrl: null }), null);
    for (const status of ['PENDING_PAYMENT', 'PARTIALLY_PAID', 'REFUNDED', 'DISPUTED']) assert.equal(trainingAccessUrl({ ...paid, status }, authorizedItem), null);
});

test('polling continues through pending payment, eligible payment without links, and missing order items', () => {
    assert.equal(shouldPollOrder({ ...paid, status: 'PENDING_PAYMENT' }, [7]), true);
    assert.equal(shouldPollOrder({ ...paid, items: [{ ...item, trainingPlayerUrl: null }] }, [7]), true);
    assert.equal(shouldPollOrder({ ...paid, items: [] }, [7]), true);
    assert.equal(shouldPollOrder({ ...paid, items: [{ ...item, productId: 8 }] }, [7]), true);
    assert.equal(shouldPollOrder(paid, [7]), false);
    assert.equal(shouldPollOrder({ ...paid, items: [], accessToken: null }, [7]), false);
    for (const status of ['FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED']) {
        assert.equal(shouldPollOrder({ ...paid, status }, [7]), false);
    }
});

test('syllabus uses the selected public route with encoded identifiers', () => {
    assert.equal(trainingOutlinePath({ lookup: 'a/b' }), '/public/commerce/products/a%2Fb/training');
    assert.equal(trainingOutlinePath({ storeSlug: 'a b', productSlug: 'c/d' }), '/public/commerce/stores/a%20b/products/c%2Fd/training');
    assert.equal(trainingOutlinePath({}), null);
});
