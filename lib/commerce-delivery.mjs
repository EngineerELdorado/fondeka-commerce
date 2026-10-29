export const DELIVERY_ADDRESS_STORAGE_KEY = 'fondeka-commerce-delivery-address';

export const DELIVERY_ADDRESS_LIMITS = Object.freeze({
    region: 160,
    town: 160,
    fullAddress: 1000,
    postalCode: 32,
    deliveryInstructions: 500,
});

// ISO 3166-1 alpha-2 membership matches the backend's Locale.getISOCountries().
// Keep this independent of calling-code catalogs, which may also include XK.
const ISO_COUNTRY_CODES = new Set((
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
    'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
    'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
    'NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
    'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
    'UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' '));

const ADDRESS_FIELDS = Object.freeze(['countryCode', ...Object.keys(DELIVERY_ADDRESS_LIMITS)]);
const REQUIRED_FIELDS = new Set(['countryCode', 'town', 'fullAddress']);
// The backend permits line breaks and tabs while rejecting other ISO controls.
const UNSUPPORTED_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

function fieldValue(value, field) {
    return value && typeof value === 'object' && Object.hasOwn(value, field) ? value[field] : undefined;
}

export function emptyDeliveryAddress() {
    return Object.fromEntries(ADDRESS_FIELDS.map((field) => [field, '']));
}

// Catalog IDs, server-derived country names, payment fields and proof are never
// copied into the delivery snapshot or browser storage.
export function normalizeDeliveryAddress(value) {
    const result = emptyDeliveryAddress();
    for (const field of ADDRESS_FIELDS) {
        const source = fieldValue(value, field);
        result[field] = typeof source === 'string' ? source.trim() : '';
    }
    result.countryCode = result.countryCode.toUpperCase();
    return result;
}

export function isDeliveryCountryCode(value) {
    return typeof value === 'string' && ISO_COUNTRY_CODES.has(value.trim().toUpperCase());
}

export function deliveryCountrySuggestion(requestCountry, locales = []) {
    if (isDeliveryCountryCode(requestCountry)) return requestCountry.trim().toUpperCase();
    for (const locale of Array.isArray(locales) ? locales : []) {
        try {
            // An explicit browser region is a fallback hint; a language alone
            // must not imply a delivery destination (for example, fr != FR).
            const region = new Intl.Locale(locale).region;
            if (isDeliveryCountryCode(region)) return region;
        } catch { /* Ignore malformed or unavailable locale information. */ }
    }
    return '';
}

export function deliveryAddressErrors(value) {
    const normalized = normalizeDeliveryAddress(value);
    const errors = {};
    for (const field of ADDRESS_FIELDS) {
        const source = fieldValue(value, field);
        if (source != null && typeof source !== 'string') {
            errors[field] = 'invalidValue';
        } else if (REQUIRED_FIELDS.has(field) && !normalized[field]) {
            errors[field] = 'required';
        } else if (field === 'countryCode' && normalized[field] && !isDeliveryCountryCode(normalized[field])) {
            errors[field] = 'invalidCountry';
        } else if (DELIVERY_ADDRESS_LIMITS[field] && (source?.length || 0) > DELIVERY_ADDRESS_LIMITS[field]) {
            errors[field] = 'tooLong';
        } else if (UNSUPPORTED_CONTROLS.test(normalized[field])) {
            errors[field] = 'invalidCharacters';
        }
    }
    return errors;
}

export function hasPhysicalProducts(cartItems) {
    return Array.isArray(cartItems) && cartItems.some((item) => {
        const product = item?.product || item;
        return String(product?.productType || product?.type || '').trim().toUpperCase() === 'PHYSICAL';
    });
}

export function readSavedDeliveryAddress(storage) {
    try {
        const raw = storage?.getItem(DELIVERY_ADDRESS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Object.keys(deliveryAddressErrors(parsed)).length ? null : normalizeDeliveryAddress(parsed);
    } catch {
        return null;
    }
}

export function saveDeliveryAddress(storage, value) {
    try {
        if (!storage?.setItem || Object.keys(deliveryAddressErrors(value)).length) return false;
        storage.setItem(DELIVERY_ADDRESS_STORAGE_KEY, JSON.stringify(normalizeDeliveryAddress(value)));
        return true;
    } catch {
        return false;
    }
}

export function forgetDeliveryAddress(storage) {
    try {
        if (!storage?.removeItem) return false;
        storage.removeItem(DELIVERY_ADDRESS_STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}
