import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutCurrencies, commerceFeeParams, commercePaymentIdempotencyKey, ensureCommerceOrder, orderMatchesMethodCurrency, orderPaymentHasStarted, paymentAttemptNeedsRecovery, paymentReviewMatchesMethod, recoverCommerceOrder } from './commerce-checkout.mjs';

const cart = [{ product: { id: 7, priceCurrency: 'XAF', priceAmount: 200 }, quantity: 1 }];
const method = { id: 23, type: 'MOBILE_MONEY', currency: 'USD' };
const payload = { billingCurrency: 'XAF', paymentCurrency: 'USD' };
const draft = { id: 70, accessToken: 'synthetic-checkout', billingCurrency: 'XAF', paymentCurrency: 'USD' };
const pending = { reference: 'CO-DEMO', accessToken: 'synthetic-order', status: 'PENDING_PAYMENT', paymentCurrency: 'USD',
    paymentTransactionId: null, paymentTransactionReference: null, paymentTransactionStatus: null };

function flow(overrides = {}) {
    const calls = [];
    const state = { checkout: null, order: null };
    return {
        calls, state,
        args: {
            order: null, checkout: null, payload,
            getOrder: async (order) => { calls.push(['getOrder', order.reference]); return order; },
            createCheckout: async (body) => { calls.push(['createCheckout', body]); return draft; },
            createOrder: async (checkout) => { calls.push(['createOrder', checkout.id, checkout.accessToken]); return pending; },
            onCheckout: (checkout) => { state.checkout = checkout; },
            onOrder: (order) => { state.order = order; },
            ...overrides,
        },
    };
}

test('selected payment currency wins while product and billing prices retain their currency', () => {
    assert.deepEqual(checkoutCurrencies(cart, { billingCurrency: 'XAF', paymentCurrency: 'XAF' }, method), payload);
    assert.equal(cart[0].product.priceAmount, 200);
    assert.equal(cart[0].product.priceCurrency, 'XAF');
    assert.deepEqual(checkoutCurrencies(cart, { billingCurrency: 'XAF', paymentCurrency: 'XAF' }, { currency: 'cdf' }),
        { billingCurrency: 'XAF', paymentCurrency: 'CDF' });
    assert.deepEqual(checkoutCurrencies([{ product: { priceCurrency: 'KES' } }], {}, { currency: 'UGX' }),
        { billingCurrency: 'KES', paymentCurrency: 'UGX' });
    assert.deepEqual(checkoutCurrencies(cart, { paymentCurrency: 'XAF' }, { currency: 'XAF' }),
        { billingCurrency: 'XAF', paymentCurrency: 'XAF' });
});

test('missing or blank configured method currency cannot silently become the product currency', () => {
    for (const currency of [undefined, null, '', '   ']) {
        assert.throws(() => checkoutCurrencies(cart, { paymentCurrency: 'XAF' }, { ...method, currency }));
        assert.equal(orderMatchesMethodCurrency(pending, { ...method, currency }), false);
        assert.throws(() => commerceFeeParams({ ...pending, paymentAmount: 0.32 }, { ...method, currency }));
    }
});

test('one order always uses one payment idempotency key across callbacks or method changes', () => {
    const first = commercePaymentIdempotencyKey(pending);
    assert.equal(first, commercePaymentIdempotencyKey({ ...pending, paymentCurrency: 'CDF', feeApplicationMode: 'INCLUSIVE' }));
    assert.equal(first, commercePaymentIdempotencyKey(JSON.parse(JSON.stringify(pending))));
    assert.notEqual(first, commercePaymentIdempotencyKey({ ...pending, reference: 'CO-OTHER' }));
    assert.throws(() => commercePaymentIdempotencyKey({}));
});

test('fees use the already-converted order base once, with matching payment currency and selected fee mode', () => {
    const order = { ...pending, billingAmount: 200, billingCurrency: 'XAF', paymentAmount: 0.32 };
    const params = commerceFeeParams(order, { ...method, feeApplicationMode: 'EXCLUSIVE' });
    assert.equal(params.get('amount'), '0.32');
    for (const key of ['currency', 'paymentCurrency', 'billingCurrency', 'displayCurrency']) assert.equal(params.get(key), 'USD');
    assert.equal(params.get('feeApplicationMode'), 'EXCLUSIVE');
    assert.equal(order.billingAmount, 200);
    assert.equal(order.billingCurrency, 'XAF');
    assert.equal(commerceFeeParams(order, method).has('feeApplicationMode'), false);
    assert.throws(() => commerceFeeParams({ ...order, paymentCurrency: 'XAF' }, method));
});

test('crypto method consistency concerns configured payment currency, not the fee response rail denomination', () => {
    const crypto = { id: 10, type: 'CRYPTO', currency: 'USD' };
    const order = { ...pending, billingCurrency: 'XAF', billingAmount: 200, paymentAmount: 0.32 };
    const feeResponse = { paymentAmount: 0.33, paymentCurrency: 'USDT', feesCurrency: 'USD', grossAmountCurrency: 'USD' };
    assert.equal(orderMatchesMethodCurrency(order, crypto), true);
    assert.equal(commerceFeeParams(order, crypto).get('amount'), '0.32');
    assert.equal(feeResponse.paymentCurrency, 'USDT');
    assert.equal(paymentReviewMatchesMethod({ order, method: crypto, quote: feeResponse }, crypto), true);
    assert.equal(paymentReviewMatchesMethod({ order, method: crypto, quote: feeResponse }, { ...crypto, currency: 'CDF' }), false);
    assert.equal(paymentReviewMatchesMethod({ order, method: crypto, quote: feeResponse }, { ...crypto, id: 11 }), false);
    assert.equal(paymentReviewMatchesMethod({ order, method: crypto, quote: feeResponse }, { ...crypto, feeApplicationMode: 'EXCLUSIVE' }), false);
    assert.equal(paymentReviewMatchesMethod(null, crypto), false);
});

test('initial explicit review creates a checkout in the selected currency before its order', async () => {
    const f = flow();
    assert.equal(await ensureCommerceOrder(f.args), pending);
    assert.deepEqual(f.calls, [['createCheckout', payload], ['createOrder', 70, 'synthetic-checkout']]);
    assert.equal(f.state.checkout, draft);
    assert.equal(f.state.order, pending);
});

test('a matching unstarted order is refreshed and reused without another checkout or order', async () => {
    const f = flow({ order: pending });
    assert.equal(await ensureCommerceOrder(f.args), pending);
    assert.deepEqual(f.calls, [['getOrder', 'CO-DEMO']]);
});

test('explicit review replaces only a confirmed unstarted currency-mismatched order', async () => {
    const f = flow({ order: { ...pending, paymentCurrency: 'XAF' }, checkout: { ...draft, paymentCurrency: 'XAF' } });
    assert.equal(await ensureCommerceOrder(f.args), pending);
    assert.deepEqual(f.calls, [['getOrder', 'CO-DEMO'], ['createCheckout', payload], ['createOrder', 70, 'synthetic-checkout']]);
});

test('an uncertain previous payment attempt never replaces the original order even if a read has no transaction yet', async () => {
    const f = flow({ order: { ...pending, paymentCurrency: 'XAF' }, paymentAttempted: true });
    await assert.rejects(() => ensureCommerceOrder(f.args), { errorCode: 'COMMERCE_PAYMENT_ALREADY_STARTED' });
    assert.deepEqual(f.calls, [['getOrder', 'CO-DEMO']]);
});

test('an attempted payment with lost order state cannot create another checkout or recover an unrelated draft', async () => {
    for (const checkout of [null, draft]) {
        const f = flow({ order: null, checkout, paymentAttempted: true });
        await assert.rejects(() => ensureCommerceOrder(f.args), { errorCode: 'COMMERCE_PAYMENT_ALREADY_STARTED' });
        assert.deepEqual(f.calls, []);
    }
    assert.equal(paymentAttemptNeedsRecovery(null, 'CO-DEMO'), true);
    assert.equal(paymentAttemptNeedsRecovery({ ...pending, reference: 'CO-OTHER' }, 'CO-DEMO'), true);
    assert.equal(paymentAttemptNeedsRecovery(pending, 'CO-DEMO'), true);
    assert.equal(paymentAttemptNeedsRecovery({ ...pending, status: 'PAID', paymentTransactionStatus: 'PROCESSING' }, 'CO-DEMO'), true);
    assert.equal(paymentAttemptNeedsRecovery({ ...pending, status: 'CANCELED' }, 'CO-DEMO'), true);
    assert.equal(paymentAttemptNeedsRecovery({ ...pending, status: 'PAID', paymentTransactionStatus: 'COMPLETED' }, 'CO-DEMO'), false);
    assert.equal(paymentAttemptNeedsRecovery({ ...pending, paymentTransactionStatus: 'FAILED' }, 'CO-DEMO'), false);
    assert.equal(paymentAttemptNeedsRecovery(pending, null), false);
});

test('refresh-and-recover never issues a checkout or payment and preserves credentials if the read fails', async () => {
    const calls = [];
    const latest = { ...pending, paymentTransactionId: 42, paymentTransactionStatus: 'PROCESSING' };
    let saved = pending;
    const input = { order: pending, getOrder: async (order) => { calls.push(order.reference); return latest; }, onOrder: (order) => { saved = order; } };
    assert.equal(await recoverCommerceOrder(input), latest);
    assert.deepEqual(calls, ['CO-DEMO']);
    assert.equal(saved, latest);
    await assert.rejects(() => recoverCommerceOrder({ ...input, getOrder: async () => { throw new Error('Synthetic timeout'); } }));
    assert.equal(saved, latest);
    await assert.rejects(() => recoverCommerceOrder({ ...input, order: null }));
});

test('absent or undefined transaction markers are unknown and never authorize replacement', async () => {
    for (const key of ['paymentTransactionId', 'paymentTransactionReference', 'paymentTransactionStatus']) {
        for (const missing of [true, false]) {
            const order = { ...pending, paymentCurrency: 'XAF' };
            if (missing) delete order[key]; else order[key] = undefined;
            const f = flow({ order });
            await assert.rejects(() => ensureCommerceOrder(f.args), { errorCode: 'COMMERCE_PAYMENT_ALREADY_STARTED' });
            assert.deepEqual(f.calls, [['getOrder', 'CO-DEMO']]);
        }
    }
});

test('each server payment marker and closed or unknown order state prevents replacement', async () => {
    const started = [
        { paymentTransactionId: 1 }, { paymentTransactionReference: 'TX-DEMO' },
        { paymentTransactionStatus: 'PROCESSING' }, { paymentTransactionStatus: 'FAILED' },
        { paymentStartedAt: '2026-10-28T12:00:00Z' },
    ];
    for (const marker of started) {
        assert.equal(orderPaymentHasStarted({ ...pending, ...marker }), true);
        const f = flow({ order: { ...pending, ...marker, paymentCurrency: 'XAF' } });
        await assert.rejects(() => ensureCommerceOrder(f.args), { errorCode: 'COMMERCE_PAYMENT_ALREADY_STARTED' });
        assert.deepEqual(f.calls, [['getOrder', 'CO-DEMO']]);
    }
    for (const status of ['PAID', 'COMPLETED', 'REFUNDED', 'DISPUTED', 'CANCELED', '', undefined]) {
        const f = flow({ order: { ...pending, status, paymentCurrency: 'XAF' } });
        await assert.rejects(() => ensureCommerceOrder(f.args), { errorCode: 'COMMERCE_PAYMENT_ALREADY_STARTED' });
        assert.deepEqual(f.calls, [['getOrder', 'CO-DEMO']]);
    }
});

test('an unavailable order read cannot turn into a replacement purchase', async () => {
    const f = flow({ order: { ...pending, paymentCurrency: 'XAF' }, getOrder: async () => { throw new Error('Synthetic unavailable read'); } });
    await assert.rejects(() => ensureCommerceOrder(f.args), /Synthetic unavailable read/);
    assert.deepEqual(f.calls, []);
});

test('a malformed order read preserves original credentials rather than replacing the draft', async () => {
    for (const response of [null, {}, { ...pending, accessToken: 'unexpected-token' }]) {
        const f = flow({ order: { ...pending, paymentCurrency: 'XAF' }, getOrder: async () => response });
        await assert.rejects(() => ensureCommerceOrder(f.args));
        assert.equal(f.state.order, null);
        assert.deepEqual(f.calls, []);
    }
});

test('lost order-creation response retains and retries the same checkout token', async () => {
    let attempts = 0;
    const f = flow({ createOrder: async (checkout) => {
        f.calls.push(['createOrder', checkout.id, checkout.accessToken]);
        if (++attempts === 1) throw new Error('Synthetic lost response');
        return pending;
    } });
    await assert.rejects(() => ensureCommerceOrder(f.args), /Synthetic lost response/);
    assert.equal(f.state.checkout, draft);
    assert.equal(await ensureCommerceOrder({ ...f.args, checkout: f.state.checkout }), pending);
    assert.deepEqual(f.calls, [['createCheckout', payload], ['createOrder', 70, 'synthetic-checkout'], ['createOrder', 70, 'synthetic-checkout']]);
});

test('recovering an existing checkout cannot authorize a different currency or an already-started payment', async () => {
    for (const returned of [{ ...pending, paymentCurrency: 'XAF' }, { ...pending, paymentTransactionId: 1 }]) {
        const f = flow({ checkout: draft, createOrder: async () => returned });
        await assert.rejects(() => ensureCommerceOrder(f.args));
        assert.equal(f.state.order, returned);
        assert.deepEqual(f.calls, []);
    }
});
