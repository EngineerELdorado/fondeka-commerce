import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DELIVERY_ADDRESS_LIMITS, DELIVERY_ADDRESS_STORAGE_KEY, emptyDeliveryAddress,
    normalizeDeliveryAddress, deliveryAddressErrors, deliveryCountrySuggestion, hasPhysicalProducts, isDeliveryCountryCode,
    readSavedDeliveryAddress, saveDeliveryAddress, forgetDeliveryAddress,
} from './commerce-delivery.mjs';

const complete = {
    countryCode: 'CD', region: 'Kinshasa', town: 'Kinshasa',
    fullAddress: '12 avenue Exemple\nCommune de la Gombe', postalCode: '',
    deliveryInstructions: 'Appelez à l’arrivée.',
};

function memoryStorage(initial = null) {
    const entries = new Map(initial == null ? [] : [[DELIVERY_ADDRESS_STORAGE_KEY, initial]]);
    return {
        getItem: (key) => entries.get(key) ?? null,
        setItem: (key, value) => entries.set(key, value),
        removeItem: (key) => entries.delete(key),
    };
}

test('delivery country prefers a valid request hint over browser regions', () => {
    assert.equal(deliveryCountrySuggestion(' lu ', ['fr-FR']), 'LU');
    assert.equal(deliveryCountrySuggestion('CD', ['en-US']), 'CD');
    assert.equal(deliveryCountrySuggestion('XX', ['fr-LU']), 'LU');
    assert.equal(deliveryCountrySuggestion('ZZ', ['en-US']), 'US');
    assert.equal(deliveryCountrySuggestion('', ['zh-Hant-TW']), 'TW');
    assert.equal(deliveryCountrySuggestion('', ['fr-FR-u-ca-gregory']), 'FR');
    assert.equal(deliveryCountrySuggestion('', ['invalid_locale', 'es-419', 'fr', 'en-GB']), 'GB');
});

test('unknown location never invents a destination from language or the default payment country', () => {
    for (const requestCountry of ['', null, undefined, 'XX', 'ZZ', 'COD', 'XK']) {
        assert.equal(deliveryCountrySuggestion(requestCountry), '');
        assert.equal(deliveryCountrySuggestion(requestCountry, ['fr', 'en', 'es-419', 'bad_locale']), '');
    }
    assert.equal(deliveryCountrySuggestion('', null), '');
    assert.equal(deliveryCountrySuggestion('', 'fr-FR'), '');
});

test('guest address requires a country, town and street/building details', () => {
    assert.deepEqual(deliveryAddressErrors(emptyDeliveryAddress()), {
        countryCode: 'required', town: 'required', fullAddress: 'required',
    });
    assert.deepEqual(deliveryAddressErrors({ countryCode: ' cd ', town: 'Kinshasa', fullAddress: '12 avenue Exemple' }), {});
    assert.deepEqual(deliveryAddressErrors({ ...complete, countryCode: 'US' }), {});
    assert.equal(isDeliveryCountryCode(' cd '), true);
    assert.equal(isDeliveryCountryCode('US'), true);
    for (const countryCode of ['ZZ', 'XK', 'COD', '']) assert.equal(isDeliveryCountryCode(countryCode), false);
    assert.deepEqual(deliveryAddressErrors({ ...complete, countryCode: 'COD' }), { countryCode: 'invalidCountry' });
    assert.deepEqual(deliveryAddressErrors({ ...complete, town: ' \n\t ' }), { town: 'required' });
    assert.deepEqual(deliveryAddressErrors({ ...complete, region: { name: 'Kinshasa' } }), { region: 'invalidValue' });
});

test('text limits and ISO-control rejection match backend address validation', () => {
    for (const [field, limit] of Object.entries(DELIVERY_ADDRESS_LIMITS)) {
        assert.deepEqual(deliveryAddressErrors({ ...complete, [field]: 'é'.repeat(limit) }), {}, `${field} accepts its boundary`);
        assert.deepEqual(deliveryAddressErrors({ ...complete, [field]: 'é'.repeat(limit + 1) }), { [field]: 'tooLong' });
        assert.deepEqual(deliveryAddressErrors({ ...complete, [field]: `${'é'.repeat(limit)} ` }), { [field]: 'tooLong' }, 'raw request length remains bounded before trimming');
    }
    for (const character of ['\u0000', '\u0008', '\u000B', '\u000C', '\u001F', '\u007F', '\u0085', '\u009F']) {
        assert.deepEqual(deliveryAddressErrors({ ...complete, fullAddress: `12 avenue${character}Exemple` }), { fullAddress: 'invalidCharacters' });
    }
    assert.deepEqual(deliveryAddressErrors({ ...complete, fullAddress: 'Bâtiment 東京\nÉtage 2\r\nPorte\t4' }), {});
});

test('normalization preserves Unicode/multiline text and only copies delivery input fields', () => {
    const input = {
        ...complete, countryCode: ' cd ', town: ' São Tomé ', fullAddress: '  Bâtiment 東京\nÉtage 2  ',
        postalCode: null, countryName: 'Server country name', regionId: 'csc:state:2741',
        accessToken: 'synthetic-proof', buyerPhone: '+12025550100', paymentCurrency: 'USD',
    };
    const original = structuredClone(input);
    const normalized = normalizeDeliveryAddress(input);
    assert.deepEqual(normalized, { ...complete, countryCode: 'CD', town: 'São Tomé', fullAddress: 'Bâtiment 東京\nÉtage 2', postalCode: '' });
    assert.deepEqual(input, original, 'the request source is never changed');
    assert.deepEqual(normalizeDeliveryAddress(null), emptyDeliveryAddress());
});

test('legacy and mixed physical carts require delivery independently of shipping metadata', () => {
    assert.equal(hasPhysicalProducts([{ product: { type: 'PHYSICAL', requiresShipping: false }, quantity: 1 }]), true);
    assert.equal(hasPhysicalProducts([{ product: { type: 'TRAINING' } }, { product: { productType: 'PHYSICAL' } }]), true);
    assert.equal(hasPhysicalProducts([{ type: ' physical ' }]), true);
    assert.equal(hasPhysicalProducts([{ product: { type: 'DIGITAL' } }, { product: { type: 'TRAINING' } }, { product: { type: 'SERVICE' } }]), false);
    assert.equal(hasPhysicalProducts([]), false);
    assert.equal(hasPhysicalProducts(null), false);
});

test('saving, reusing, replacing and forgetting an address never persist catalog IDs or purchase proof', () => {
    const storage = memoryStorage();
    assert.equal(readSavedDeliveryAddress(storage), null);
    assert.equal(saveDeliveryAddress(storage, { ...complete, countryCode: ' cd ', accessToken: 'synthetic-proof', countryName: 'Congo' }), true);
    assert.deepEqual(JSON.parse(storage.getItem(DELIVERY_ADDRESS_STORAGE_KEY)), complete);
    const restored = readSavedDeliveryAddress(storage);
    assert.deepEqual(restored, complete);
    restored.fullAddress = 'Another building';
    assert.equal(readSavedDeliveryAddress(storage).fullAddress, complete.fullAddress, 'editing active state does not rewrite stored or order snapshots');
    const replacement = { ...complete, town: 'Matadi', fullAddress: '8 avenue du Port' };
    assert.equal(saveDeliveryAddress(storage, replacement), true);
    assert.deepEqual(readSavedDeliveryAddress(storage), replacement);
    assert.equal(forgetDeliveryAddress(storage), true);
    assert.equal(readSavedDeliveryAddress(storage), null);
});

test('invalid/incomplete saved data and unavailable browser storage never block checkout helpers', () => {
    for (const raw of ['bad json', 'null', '[]', JSON.stringify({ ...complete, town: '' }), JSON.stringify({ ...complete, fullAddress: 'bad\u0000text' }), JSON.stringify({ ...complete, countryCode: 'ZZ' }), JSON.stringify({ ...complete, countryCode: 'XK' })]) {
        assert.equal(readSavedDeliveryAddress(memoryStorage(raw)), null);
    }
    const storage = memoryStorage(JSON.stringify(complete));
    assert.equal(saveDeliveryAddress(storage, { ...complete, town: '' }), false);
    assert.equal(saveDeliveryAddress(storage, { ...complete, countryCode: 'ZZ' }), false);
    assert.equal(saveDeliveryAddress(storage, { ...complete, countryCode: 'XK' }), false);
    assert.deepEqual(readSavedDeliveryAddress(storage), complete, 'an invalid edit does not overwrite a usable saved address');
    const blocked = {
        getItem() { throw new Error('Storage blocked'); },
        setItem() { throw new Error('Storage blocked'); },
        removeItem() { throw new Error('Storage blocked'); },
    };
    assert.equal(readSavedDeliveryAddress(blocked), null);
    assert.equal(saveDeliveryAddress(blocked, complete), false);
    assert.equal(forgetDeliveryAddress(blocked), false);
    assert.equal(readSavedDeliveryAddress(undefined), null);
    assert.equal(saveDeliveryAddress(undefined, complete), false);
    assert.equal(forgetDeliveryAddress(undefined), false);
});
