import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutBuyerFields, internationalPhoneInput, savedBuyerContact } from './commerce-buyer.mjs';

test('checkout sends the current boolean choice only when the rollout is enabled', () => {
    const contact = { name: ' Buyer ', email: '', phone: ' +12025550100 ' };
    for (const consent of [false, 'true', 1]) {
        assert.equal(checkoutBuyerFields({ ...contact, whatsappDeliveryOptIn: consent }, true).whatsappDeliveryOptIn, false);
    }
    assert.equal(checkoutBuyerFields(contact, true).whatsappDeliveryOptIn, true);
    assert.equal(checkoutBuyerFields({ ...contact, whatsappDeliveryOptIn: true }).whatsappDeliveryOptIn, false);
    assert.deepEqual(checkoutBuyerFields({ ...contact, whatsappDeliveryOptIn: true }, true), {
        buyerName: 'Buyer', buyerEmail: '', buyerPhone: '+12025550100', whatsappDeliveryOptIn: true,
    });
});

test('remembered form preserves opt-out, defaults missing choice on, and excludes payer/access fields', () => {
    const stored = savedBuyerContact({ name: 'Buyer', email: '', phone: '+12025550100', whatsappDeliveryOptIn: true, paymentPhone: '+243812345678', accessToken: 'synthetic' });
    assert.deepEqual(stored, { name: 'Buyer', email: '', phone: '+12025550100', whatsappDeliveryOptIn: true });
    assert.equal(savedBuyerContact({ phone: '+12025550100' }).whatsappDeliveryOptIn, true);
    assert.equal(savedBuyerContact({ ...stored, whatsappDeliveryOptIn: false }).whatsappDeliveryOptIn, false);
    assert.equal(checkoutBuyerFields(savedBuyerContact({ ...stored, whatsappDeliveryOptIn: false }), true).whatsappDeliveryOptIn, false);
    assert.equal(checkoutBuyerFields({ ...stored, paymentPhone: '+243812345678', merchantPhone: '+243899999999' }, true).buyerPhone, '+12025550100');
});

test('explicit international numbers retain their country and local entry uses the chosen calling code', () => {
    assert.equal(internationalPhoneInput('+1 (202) 555-0100', '243'), '+12025550100');
    assert.equal(internationalPhoneInput('0012025550100', '243'), '+12025550100');
    assert.equal(internationalPhoneInput('812 345 678', '243'), '+243812345678');
    assert.equal(internationalPhoneInput('812345678', ''), '812345678');
    assert.equal(internationalPhoneInput('', '243'), '');
});
