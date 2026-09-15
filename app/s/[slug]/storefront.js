'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/api';

const PAGE_SIZE = 20;
const BUYER_DETAILS_STORAGE_KEY = 'fondeka-commerce-buyer-details';
const MOBILE_BROWSER_RE = /Android|iPhone|iPad|iPod/i;
const COUNTRY_OPTIONS = [
    { code: 'CD', name: 'Congo', callingCode: '243', flag: '🇨🇩' },
    { code: 'CG', name: 'Congo (Brazza)', callingCode: '242', flag: '🇨🇬' },
    { code: 'CM', name: 'Cameroon', callingCode: '237', flag: '🇨🇲' },
    { code: 'RW', name: 'Rwanda', callingCode: '250', flag: '🇷🇼' },
    { code: 'BI', name: 'Burundi', callingCode: '257', flag: '🇧🇮' },
    { code: 'KE', name: 'Kenya', callingCode: '254', flag: '🇰🇪' },
    { code: 'TZ', name: 'Tanzania', callingCode: '255', flag: '🇹🇿' },
    { code: 'UG', name: 'Uganda', callingCode: '256', flag: '🇺🇬' },
    { code: 'ZM', name: 'Zambia', callingCode: '260', flag: '🇿🇲' },
    { code: 'ZW', name: 'Zimbabwe', callingCode: '263', flag: '🇿🇼' },
    { code: 'GA', name: 'Gabon', callingCode: '241', flag: '🇬🇦' },
    { code: 'AO', name: 'Angola', callingCode: '244', flag: '🇦🇴' },
    { code: 'FR', name: 'France', callingCode: '33', flag: '🇫🇷' },
    { code: 'LU', name: 'Luxembourg', callingCode: '352', flag: '🇱🇺' },
    { code: 'US', name: 'United States', callingCode: '1', flag: '🇺🇸' },
];
const COUNTRIES_BY_CODE = COUNTRY_OPTIONS.reduce((acc, country) => {
    acc[country.code] = country;
    return acc;
}, {});
const PAYMENT_GROUP_ORDER = ['MOBILE_MONEY', 'CRYPTO', 'CARD', 'BANK_TRANSFER', 'WALLET', 'BALANCE', 'OTHER'];
const PAYMENT_TYPE_LABELS = {
    MOBILE_MONEY: 'Mobile money',
    CRYPTO: 'Crypto',
    CARD: 'Cards',
    BANK_TRANSFER: 'Bank transfer',
    WALLET: 'Wallet',
    BALANCE: 'Wallet',
    OTHER: 'Other',
};
const STORE_TABS = ['PRODUCTS', 'ABOUT', 'REVIEWS'];
const STORE_TAB_LABELS = {
    PRODUCTS: 'Products',
    ABOUT: 'About',
    REVIEWS: 'Reviews',
};

function pageItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.content)) return payload.content;
    if (Array.isArray(payload?.methods)) return payload.methods;
    if (Array.isArray(payload?.paymentMethods)) return payload.paymentMethods;
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

function formatPhone(value = '') {
    const text = String(value || '');
    if (!text.startsWith('+')) return text;
    const digits = phoneDigits(text);
    if (!digits) return text;
    const country = COUNTRY_OPTIONS
        .slice()
        .sort((a, b) => String(b.callingCode).length - String(a.callingCode).length)
        .find((option) => digits.startsWith(option.callingCode));
    if (!country) return text;
    const rest = digits.slice(country.callingCode.length).replace(/(\d{2,3})(?=\d)/g, '$1 ').trim();
    return `+${country.callingCode}${rest ? ` ${rest}` : ''}`;
}

function parseCryptoHint(text) {
    try {
        const value = String(text || '');
        const amountMatch = value.match(/send\s+([\d.]+\s*\w+)/i);
        const networkMatch = value.match(/network\s+([\w-]+)/i);
        return {
            amount: amountMatch?.[1] || null,
            network: networkMatch?.[1] || null,
        };
    } catch {
        return {};
    }
}

function currencyBadgeClass(currency) {
    const code = String(currency || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return code ? `currency-badge currency-badge--${code}` : 'currency-badge';
}

function formatCryptoPaymentAmount(details, fallback) {
    const value = details?.amountInCrypto ?? details?.cryptoAmount ?? details?.amount;
    const currency = details?.cryptoCurrency || details?.currency || '';
    if (value == null || value === '') return fallback || '';
    const numeric = Number(value);
    const formatted = Number.isFinite(numeric)
        ? numeric.toLocaleString(undefined, { maximumFractionDigits: 8 })
        : String(value);
    return currency ? `${formatted} ${currency}` : formatted;
}

function formatExpiry(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function formatReviewDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function formatMemberSince(value, long = false) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
        month: long ? 'long' : 'short',
        year: 'numeric',
    }).format(date);
}

function normalizeStoreReview(review) {
    const rawStars = number(review?.stars ?? review?.rating);
    const stars = Math.max(1, Math.min(5, Math.round(rawStars)));
    const message = String(review?.message || review?.comment || '').trim();
    if (!rawStars || !message) return null;
    return {
        id: review?.id || `${stars}-${message}`,
        stars,
        message,
        reviewerName: review?.reviewerName || review?.customerName || review?.buyerName || review?.accountName || '',
        createdAt: review?.createdAt || review?.updatedAt || '',
        replyMessage: review?.replyMessage || '',
        replyByName: review?.replyByName || '',
        repliedAt: review?.repliedAt || '',
    };
}

function isVerifiedStatus(value) {
    return String(value || '').trim().toUpperCase() === 'VERIFIED';
}

function whatsappLink(number) {
    const digits = phoneDigits(number);
    return digits ? `https://wa.me/${digits}` : '';
}

function storeContactLinks(store) {
    const links = [];
    const whatsappHref = whatsappLink(store?.whatsappNumber);
    if (whatsappHref) {
        links.push({ key: 'whatsapp', label: 'WhatsApp', href: whatsappHref, kind: 'contact' });
    }
    if (store?.contactEmail) {
        links.push({ key: 'email', label: 'Email', href: `mailto:${store.contactEmail}`, kind: 'contact' });
    }
    return links;
}

function storeSocialLinks(store) {
    return [
        ['instagramUrl', 'Instagram', 'IG'],
        ['facebookUrl', 'Facebook', 'f'],
        ['tiktokUrl', 'TikTok', '♪'],
        ['youtubeUrl', 'YouTube', '▶'],
        ['twitterUrl', 'X', 'X'],
        ['linkedinUrl', 'LinkedIn', 'in'],
    ]
        .map(([field, label, icon]) => ({ key: field, label, icon, href: store?.[field] }))
        .filter((link) => link.href);
}

function storeCategories(store, products = []) {
    const values = [
        ...(Array.isArray(store?.categories) ? store.categories : []),
        store?.category,
        store?.marketplaceCategory,
        ...products.map((product) => product?.marketplaceCategory || product?.type),
    ]
        .filter(Boolean)
        .map((value) => String(value).replace(/_/g, ' ').trim())
        .filter(Boolean);
    return Array.from(new Set(values)).slice(0, 3);
}

function storeCapabilities(store) {
    return [
        store?.deliveryEnabled ? { key: 'delivery', icon: '↗', label: 'Delivery' } : null,
        store?.securePayments ? { key: 'secure', icon: '✓', label: 'Secure payments' } : null,
        store?.supportEnabled ? { key: 'support', icon: '•', label: 'Support' } : null,
    ].filter(Boolean);
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(String(text || ''));
    } catch {
        // Clipboard access can be blocked in insecure or embedded contexts.
    }
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

function isOrderPaid(order) {
    const orderStatus = String(order?.status || '').toUpperCase();
    const paymentStatus = String(order?.paymentTransactionStatus || '').toUpperCase();
    return orderStatus === 'PAID' || paymentStatus === 'COMPLETED' || paymentStatus === 'PAID';
}

function isOrderTerminal(order) {
    const orderStatus = String(order?.status || '').toUpperCase();
    const paymentStatus = String(order?.paymentTransactionStatus || '').toUpperCase();
    return isOrderPaid(order) ||
        ['FAILED', 'CANCELED', 'CANCELLED'].includes(orderStatus) ||
        ['FAILED', 'CANCELED', 'CANCELLED'].includes(paymentStatus);
}

function initials(text) {
    return String(text || 'Store')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase())
        .join('') || 'S';
}

function methodInitials(method) {
    return String(method?.name || method?.type || 'Pay')
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'PM';
}

function normalizeCountryCode(value) {
    const code = String(value || '').trim().toUpperCase();
    return COUNTRIES_BY_CODE[code] ? code : 'CD';
}

function detectBrowserCountry() {
    if (typeof navigator === 'undefined') return 'CD';
    const locales = Array.isArray(navigator.languages) && navigator.languages.length
        ? navigator.languages
        : [navigator.language];
    for (const locale of locales) {
        const region = String(locale || '').split('-')[1];
        if (region && COUNTRIES_BY_CODE[region.toUpperCase()]) {
            return region.toUpperCase();
        }
    }
    return 'CD';
}

function groupedPaymentMethods(methods) {
    const groups = methods.reduce((acc, method) => {
        const type = method.type || 'OTHER';
        (acc[type] ||= []).push(method);
        return acc;
    }, {});
    const ordered = {};
    PAYMENT_GROUP_ORDER.forEach((type) => {
        if (groups[type]?.length) ordered[type] = groups[type];
    });
    Object.keys(groups).forEach((type) => {
        if (!ordered[type]) ordered[type] = groups[type];
    });
    return ordered;
}

function hasBuyerDetails(buyer) {
    return !!(buyer?.name?.trim() || buyer?.email?.trim() || buyer?.phone?.trim());
}

function readStoredBuyerDetails() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(BUYER_DETAILS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            name: String(parsed?.name || ''),
            email: String(parsed?.email || ''),
            phone: String(parsed?.phone || ''),
        };
    } catch {
        return null;
    }
}

function storeBuyerDetails(buyer) {
    if (typeof window === 'undefined') return;
    try {
        if (!hasBuyerDetails(buyer)) {
            window.localStorage.removeItem(BUYER_DETAILS_STORAGE_KEY);
            return;
        }
        window.localStorage.setItem(BUYER_DETAILS_STORAGE_KEY, JSON.stringify({
            name: String(buyer?.name || ''),
            email: String(buyer?.email || ''),
            phone: String(buyer?.phone || ''),
        }));
    } catch {
        // Local storage can be unavailable in private browsing or blocked contexts.
    }
}

function phoneDigits(value) {
    return String(value || '').replace(/\D+/g, '');
}

function nationalPhoneNumber(phone, country) {
    let digits = phoneDigits(phone);
    if (!digits) return '';

    const selectedCallingCode = String(country?.callingCode || '').trim();
    if (selectedCallingCode && digits.startsWith(selectedCallingCode)) {
        return digits.slice(selectedCallingCode.length);
    }

    const matchedCode = COUNTRY_OPTIONS
        .map((option) => String(option.callingCode || '').trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .find((code) => digits.startsWith(code));

    return matchedCode ? digits.slice(matchedCode.length) : digits;
}

function combinePhoneNumber(country, localDigits) {
    const digits = phoneDigits(localDigits);
    const callingCode = String(country?.callingCode || '243').trim();
    return digits ? `+${callingCode}${digits}` : '';
}

function inventoryLabel(product) {
    if (String(product?.inventoryPolicy || '').toUpperCase() !== 'TRACKED') return 'Available';
    const quantity = number(product?.inventoryQuantity);
    if (quantity <= 0) return 'Out of stock';
    return `${amount(quantity, '')} available`;
}

function firstCurrency(products) {
    return products.find((product) => product?.priceCurrency)?.priceCurrency || '';
}

function productImage(product) {
    return product?.image1 || product?.imageUrl || product?.image2 || product?.image3 || product?.image4 || '';
}

function productImages(product) {
    return [
        product?.image1,
        product?.imageUrl,
        product?.image2,
        product?.image3,
        product?.image4,
    ]
        .map((image) => String(image || '').trim())
        .filter(Boolean)
        .filter((image, index, images) => images.indexOf(image) === index);
}

function getFondekaCommerceSchemeBase() {
    const env = String(
        process.env.NEXT_PUBLIC_FONDEKA_APP_ENV ||
        process.env.NEXT_PUBLIC_APP_ENV ||
        process.env.NEXT_PUBLIC_VERCEL_ENV ||
        ''
    ).toLowerCase();

    if (['dev', 'development', 'local'].includes(env)) return 'fondeka-dev://commerce/marketplace';
    if (['preview', 'staging'].includes(env)) return 'fondeka-preview://commerce/marketplace';
    return 'fondeka://commerce/marketplace';
}

function commerceAppCheckoutDeepLink(cartItems, currencies) {
    const items = cartItems
        .filter(({ product, quantity }) => product?.id && number(quantity) > 0)
        .map(({ product, quantity }) => ({
            productId: product.id,
            quantity: Math.max(1, Math.floor(number(quantity))),
        }));

    if (!items.length) return '';

    const base = getFondekaCommerceSchemeBase();
    if (items.length === 1) {
        const params = new URLSearchParams({
            quantity: String(items[0].quantity),
            checkout: '1',
        });
        return `${base}/products/${encodeURIComponent(items[0].productId)}?${params.toString()}`;
    }

    const paymentCurrency = String(
        cartItems.find(({ product }) => product?.priceCurrency)?.product?.priceCurrency ||
        currencies.paymentCurrency ||
        currencies.billingCurrency ||
        ''
    ).trim().toUpperCase();
    const params = new URLSearchParams({
        items: JSON.stringify(items),
    });
    if (paymentCurrency) params.set('paymentCurrency', paymentCurrency);
    return `${base}/checkout?${params.toString()}`;
}

function checkoutPayload(cartItems, buyer, currencies) {
    const cartCurrency = cartItems.find(({ product }) => product?.priceCurrency)?.product?.priceCurrency || '';
    const billingCurrency = cartCurrency || currencies.billingCurrency;
    const paymentCurrency = cartCurrency || currencies.paymentCurrency || billingCurrency;

    return {
        items: cartItems.map(({ product, quantity }) => ({
            productId: product.id,
            quantity,
        })),
        billingCurrency: billingCurrency.trim().toUpperCase(),
        paymentCurrency: paymentCurrency.trim().toUpperCase(),
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

function normalizePaymentMethod(method) {
    const id = method?.id ?? method?.paymentMethodId ?? null;
    const type = String(method?.type || method?.paymentMethodType || method?.methodType || 'OTHER').toUpperCase();
    const name = method?.displayName || method?.name || method?.label || method?.paymentMethodName || type;
    return {
        ...method,
        key: id != null ? String(id) : String(method?.key || name || type),
        id,
        name,
        type,
        currency: method?.currency || method?.paymentCurrency || method?.displayCurrency || '',
        logoUrl: method?.logoUrl || method?.imageUrl || '',
        showCurrencyBadge: method?.showCurrencyBadge,
    };
}

function normalizeCryptoNetwork(network) {
    const id = network?.id ?? network?.networkId ?? null;
    const name = network?.displayName || network?.name || network?.networkName || network?.code || 'Network';
    return {
        ...network,
        id,
        name,
        displayName: network?.displayName || name,
    };
}

function feeQuotePayload(feeQuote, order, paymentMethod) {
    const netAmount = number(feeQuote?.netAmount ?? order?.billingAmount ?? order?.paymentAmount);
    const netCurrency = feeQuote?.netAmountCurrency || order?.billingCurrency || order?.paymentCurrency || paymentMethod?.currency || '';
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
        billingAmount: order?.billingAmount ?? order?.paymentAmount ?? netAmount,
        billingCurrency: order?.billingCurrency || order?.paymentCurrency || netCurrency,
        paymentAmount: feeQuote?.paymentAmount ?? totalAmount,
        paymentCurrency: feeQuote?.paymentCurrency || totalCurrency,
        netAmount,
        netAmountCurrency: netCurrency,
        grossAmount: totalAmount,
        grossAmountCurrency: totalCurrency,
    };
}

export default function Storefront({ slug, productLookup, productSlug, initialStore = null, initialProducts = null, initialCart = null, initialLoadError = null, initialCountry = 'CD' }) {
    const seededProducts = Array.isArray(initialProducts) ? initialProducts : [];
    const hasInitialState = !!initialStore || seededProducts.length > 0 || !!initialLoadError;
    const [store, setStore] = useState(initialStore);
    const [products, setProducts] = useState(seededProducts);
    const [cart, setCart] = useState(initialCart || {});
    const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' });
    const [buyerDetailsLoaded, setBuyerDetailsLoaded] = useState(false);
    const [buyerDetailsOpen, setBuyerDetailsOpen] = useState(true);
    const seededCurrency = firstCurrency(seededProducts);
    const [currencies, setCurrencies] = useState({ billingCurrency: seededCurrency, paymentCurrency: seededCurrency });
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [imageGallery, setImageGallery] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [activeTab, setActiveTab] = useState('PRODUCTS');
    const [checkoutSheetOpen, setCheckoutSheetOpen] = useState(false);
    const [receiptOpen, setReceiptOpen] = useState(false);
    const [activeProductImageIndex, setActiveProductImageIndex] = useState(0);
    const [quote, setQuote] = useState(null);
    const [paymentReviewOpen, setPaymentReviewOpen] = useState(false);
    const [paymentReviewContext, setPaymentReviewContext] = useState(null);
    const [paymentPrompt, setPaymentPrompt] = useState(null);
    const [checkout, setCheckout] = useState(null);
    const [order, setOrder] = useState(null);
    const [showOrderPaymentView, setShowOrderPaymentView] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('');
    const [discoveredPaymentMethods, setDiscoveredPaymentMethods] = useState([]);
    const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
    const [paymentMethodsError, setPaymentMethodsError] = useState(null);
    const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false);
    const [cryptoNetworks, setCryptoNetworks] = useState([]);
    const [cryptoNetworksLoading, setCryptoNetworksLoading] = useState(false);
    const [cryptoNetworksError, setCryptoNetworksError] = useState(null);
    const [selectedCryptoNetworkId, setSelectedCryptoNetworkId] = useState(null);
    const [isMobileBrowser, setIsMobileBrowser] = useState(false);
    const [showAppInstallFallback, setShowAppInstallFallback] = useState(false);
    const [countryCode, setCountryCode] = useState(() => normalizeCountryCode(initialCountry));
    const [showCountryPicker, setShowCountryPicker] = useState(false);
    const [countryQuery, setCountryQuery] = useState('');
    const [userSelectedCountry, setUserSelectedCountry] = useState(false);
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
            const defaultCurrency = firstCurrency(loadedProducts);
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

    useEffect(() => {
        if (typeof navigator !== 'undefined') {
            setIsMobileBrowser(MOBILE_BROWSER_RE.test(navigator.userAgent || ''));
        }
    }, []);

    useEffect(() => {
        const storedBuyer = readStoredBuyerDetails();
        if (storedBuyer && hasBuyerDetails(storedBuyer)) {
            setBuyer(storedBuyer);
            setBuyerDetailsOpen(false);
        }
        setBuyerDetailsLoaded(true);
    }, []);

    useEffect(() => {
        if (!buyerDetailsLoaded) return;
        storeBuyerDetails(buyer);
    }, [buyer, buyerDetailsLoaded]);

    useEffect(() => {
        const reviewSlug = store?.slug || slug;
        if (!reviewSlug) {
            setReviews([]);
            return undefined;
        }

        let cancelled = false;
        setReviews([]);
        apiFetch(`/public/commerce/marketplace/stores/${encodeURIComponent(reviewSlug)}/reviews?page=0&size=20`)
            .then((payload) => {
                if (cancelled) return;
                setReviews(pageItems(payload).map(normalizeStoreReview).filter(Boolean));
            })
            .catch(() => {
                if (!cancelled) setReviews([]);
            });

        return () => {
            cancelled = true;
        };
    }, [store?.slug, slug]);

    const cartItems = useMemo(() => products
        .map((product) => ({ product, quantity: number(cart[product.id]) }))
        .filter((item) => item.quantity > 0), [cart, products]);

    const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const cartTotal = cartSubtotal(cartItems);
    const cartCurrency = cartItems[0]?.product?.priceCurrency || currencies.paymentCurrency || currencies.billingCurrency || '';
    const categories = useMemo(() => storeCategories(store, products), [store, products]);
    const appCheckoutLink = useMemo(() => commerceAppCheckoutDeepLink(cartItems, currencies), [cartItems, currencies]);
    const paymentMethods = discoveredPaymentMethods;
    const selectedPaymentMethod = paymentMethods.find((method) => method.key === paymentMethod) || null;
    const selectedCountry = COUNTRIES_BY_CODE[countryCode] || COUNTRIES_BY_CODE.CD;
    const filteredCountries = useMemo(() => {
        const query = countryQuery.trim().toLowerCase();
        if (!query) return COUNTRY_OPTIONS;
        return COUNTRY_OPTIONS.filter((country) => (
            country.name.toLowerCase().includes(query) ||
            country.code.toLowerCase().includes(query) ||
            country.callingCode.includes(query)
        ));
    }, [countryQuery]);

    useEffect(() => {
        setShowAppInstallFallback(false);
    }, [appCheckoutLink]);

    const setQuantity = (productId, nextQuantity) => {
        const safeQuantity = Math.max(0, Math.floor(number(nextQuantity)));
        setCart((current) => {
            const next = { ...current };
            if (safeQuantity > 0) next[productId] = safeQuantity;
            else delete next[productId];
            return next;
        });
        setQuote(null);
        setPaymentReviewOpen(false);
        setPaymentReviewContext(null);
        setPaymentPrompt(null);
        setCheckout(null);
        setCheckoutSheetOpen(false);
        setOrder(null);
        setShowOrderPaymentView(false);
        setCryptoNetworks([]);
        setCryptoNetworksError(null);
        setSelectedCryptoNetworkId(null);
        setFlowError(null);
    };

    const changeQuantity = (productId, delta) => {
        setQuantity(productId, number(cart[productId]) + delta);
    };

    const updateBuyer = (updater) => {
        setBuyer(updater);
        setQuote(null);
        setPaymentReviewOpen(false);
        setPaymentReviewContext(null);
        setPaymentPrompt(null);
        setCheckout(null);
        setCheckoutSheetOpen(false);
        setShowOrderPaymentView(false);
        setFlowError(null);
    };

    const updatePaymentMethod = (methodKey) => {
        setPaymentMethod(String(methodKey || ''));
        setCryptoNetworks([]);
        setCryptoNetworksError(null);
        setSelectedCryptoNetworkId(null);
        setQuote(null);
        setPaymentReviewOpen(false);
        setPaymentReviewContext(null);
        setPaymentPrompt(null);
        setCheckout(null);
        setCheckoutSheetOpen(false);
        setShowOrderPaymentView(false);
        setFlowError(null);
    };

    const openFondekaAppCheckout = useCallback(() => {
        if (!appCheckoutLink) return;

        const startedAt = Date.now();
        setShowAppInstallFallback(false);
        window.location.href = appCheckoutLink;

        window.setTimeout(() => {
            const elapsed = Date.now() - startedAt;
            if (elapsed < 1800 && !document.hidden) {
                setShowAppInstallFallback(true);
            }
        }, 1500);
    }, [appCheckoutLink]);

    const validate = () => {
        if (!cartItems.length) return 'Choose at least one product.';
        const cartCurrency = cartItems.find(({ product }) => product?.priceCurrency)?.product?.priceCurrency || '';
        if (!cartCurrency && !currencies.billingCurrency.trim()) return 'Billing currency is required.';
        if (!cartCurrency && !currencies.paymentCurrency.trim()) return 'Payment currency is required.';
        const selectedMethod = paymentMethods.find((method) => method.key === paymentMethod);
        if (!selectedMethod?.id) return `${selectedMethod?.name || 'This payment method'} is not configured for web checkout yet.`;
        if (selectedMethod.type === 'MOBILE_MONEY' && !buyer.phone.trim()) return 'Buyer phone is required for Mobile Money.';
        if (selectedMethod.type === 'CRYPTO' && !selectedCryptoNetworkId) return 'Choose a crypto network.';
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

    const fetchPaymentMethodsForAmount = useCallback(async ({ amount: methodAmount, currency: methodCurrency }) => {
        const params = new URLSearchParams({
            action: 'COMMERCE_CHECKOUT_PAYMENT',
            amount: String(methodAmount ?? 0),
            currency: String(methodCurrency || '').trim().toUpperCase(),
            countryCode,
        });
        setPaymentMethodsLoading(true);
        setPaymentMethodsError(null);
        try {
            const payload = await apiFetch(`/public/payment-methods?${params.toString()}`);
            const list = pageItems(payload).map(normalizePaymentMethod).filter((method) => method.id);
            setDiscoveredPaymentMethods(list);
            setPaymentMethod((current) => (
                current && !list.some((method) => method.key === current) ? '' : current
            ));
            setPaymentMethodsLoaded(true);
            return list;
        } catch (error) {
            const normalizedError = readError(error, 'Unable to load payment methods.');
            setPaymentMethodsError(normalizedError);
            setPaymentMethodsLoaded(true);
            throw error;
        } finally {
            setPaymentMethodsLoading(false);
        }
    }, [countryCode]);

    const fetchPaymentMethods = useCallback(async (currentOrder) => fetchPaymentMethodsForAmount({
        amount: currentOrder.paymentAmount ?? currentOrder.billingAmount ?? 0,
        currency: currentOrder.paymentCurrency || currentOrder.billingCurrency || '',
    }), [fetchPaymentMethodsForAmount]);

    const resolveSelectedPaymentMethod = async (currentOrder) => {
        const methods = await fetchPaymentMethods(currentOrder);
        const selectedMethod = methods.find((method) => method.key === paymentMethod);
        if (!selectedMethod?.id) {
            throw new Error('No payment method is available for this checkout.');
        }
        return selectedMethod;
    };

    const fetchPaymentQuote = async ({ resetCheckout = false } = {}) => {
        const currentOrder = await ensureOrder();
        const selectedMethod = await resolveSelectedPaymentMethod(currentOrder);
        const settlementAmount = currentOrder.billingAmount ?? currentOrder.paymentAmount;
        const settlementCurrency = currentOrder.billingCurrency || currentOrder.paymentCurrency || currencies.billingCurrency;
        const displayCurrency = selectedMethod.currency || currentOrder.paymentCurrency || settlementCurrency;
        const params = new URLSearchParams({
            action: 'COMMERCE_CHECKOUT_PAYMENT',
            paymentMethodId: String(selectedMethod.id),
            amount: String(settlementAmount),
            currency: String(settlementCurrency || '').trim().toUpperCase(),
            displayCurrency: String(displayCurrency || '').trim().toUpperCase(),
        });
        const feeQuote = await apiFetch(`/public/fees?${params.toString()}`);
        const nextQuote = feeQuotePayload(feeQuote, currentOrder, selectedMethod);
        if (resetCheckout) setCheckout(null);
        setQuote(nextQuote);
        return { quote: nextQuote, order: currentOrder, method: selectedMethod };
    };

    const reviewPayment = async () => {
        const validation = validate();
        if (validation) {
            setFlowError({ message: validation, errorCode: 'INVALID_REQUEST' });
            return;
        }

        setBusy(true);
        setFlowError(null);
        try {
            const quoteResult = await fetchPaymentQuote();
            setPaymentReviewContext(quoteResult);
            setPaymentReviewOpen(true);
        } catch (error) {
            setFlowError(readError(error, 'Unable to check payment fees.'));
        } finally {
            setBusy(false);
        }
    };

    const showPaymentPrompt = (response, methodForPayment, paymentQuote) => {
        const nextAction = response?.nextAction || response?.payment?.nextAction || response?.transaction?.nextAction || null;
        const responseStatus = String(
            response?.paymentTransactionStatus ||
            response?.status ||
            response?.payment?.status ||
            response?.transaction?.status ||
            ''
        ).toUpperCase();
        const actionable = !responseStatus || ['PENDING', 'PENDING_PAYMENT', 'PROCESSING', 'REQUIRES_ACTION', 'INITIATED', 'NEW'].includes(responseStatus);

        if (methodForPayment.type === 'MOBILE_MONEY' && actionable) {
            setPaymentPrompt({
                type: 'MOBILE_MONEY',
                number: buyer.phone,
                hint: nextAction?.urlOrHint || nextAction?.message || '',
            });
            return;
        }

        if (methodForPayment.type === 'CRYPTO' && actionable) {
            const selectedNetwork = cryptoNetworks.find((network) => network.id === selectedCryptoNetworkId);
            const details = response?.cryptoDetails || response?.payment?.cryptoDetails || response?.transaction?.cryptoDetails || null;
            const hint = nextAction?.type || nextAction?.message || '';
            const parsedHint = parseCryptoHint(hint);
            const railAmount = paymentQuote.paymentAmount ?? paymentQuote.grossAmount ?? paymentQuote.totalAmount;
            const railCurrency = paymentQuote.paymentCurrency || paymentQuote.grossAmountCurrency || paymentQuote.totalCurrency;
            setPaymentPrompt({
                type: 'CRYPTO',
                address: details?.address || response?.address || response?.paymentAddress || '',
                amount: formatCryptoPaymentAmount(details, parsedHint.amount || amount(railAmount, railCurrency)),
                networkName: details?.network || parsedHint.network || selectedNetwork?.displayName || selectedNetwork?.name || '',
                invoiceUrl: details?.invoiceUrl || nextAction?.urlOrHint || '',
                expiresAt: details?.expiresAt || '',
                hint,
            });
        }
    };

    const confirmPayment = async () => {
        const validation = validate();
        if (validation) {
            setFlowError({ message: validation, errorCode: 'INVALID_REQUEST' });
            return;
        }

        setBusy(true);
        setFlowError(null);
        try {
            const quoteResult = paymentReviewContext?.quote && paymentReviewContext?.order && paymentReviewContext?.method
                ? paymentReviewContext
                : await fetchPaymentQuote();
            const currentOrder = quoteResult.order;
            const paymentQuote = quoteResult.quote;
            const methodForPayment = quoteResult.method;
            const accountNumber = methodForPayment.type === 'MOBILE_MONEY' ? buyer.phone.trim() : null;
            const networkId = methodForPayment.type === 'CRYPTO' ? selectedCryptoNetworkId : (methodForPayment.networkId || null);
            const paidOrder = await apiFetch(
                `/public/commerce/orders/${encodeURIComponent(currentOrder.reference)}/payments/start?accessToken=${encodeURIComponent(currentOrder.accessToken || '')}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        paymentMethodId: methodForPayment.id,
                        accountNumber,
                        networkId,
                        amount: paymentQuote.paymentAmount ?? paymentQuote.grossAmount ?? currentOrder.billingAmount ?? currentOrder.paymentAmount,
                        currency: paymentQuote.paymentCurrency || paymentQuote.grossAmountCurrency || currentOrder.billingCurrency || currentOrder.paymentCurrency,
                        paymentMethod: {
                            id: methodForPayment.id,
                            type: methodForPayment.type,
                            currency: methodForPayment.currency || currentOrder.paymentCurrency,
                            accountRef: accountNumber,
                            networkId,
                            feeApplicationMode: methodForPayment.feeApplicationMode || null,
                        },
                        idempotencyKey: idempotencyKey(`commerce-${currentOrder.reference}`),
                    }),
                }
            );
            setPaymentReviewOpen(false);
            setPaymentReviewContext(null);
            showPaymentPrompt(paidOrder, methodForPayment, paymentQuote);
            setOrder(paidOrder);
        } catch (error) {
            setFlowError(readError(error, 'Unable to start payment.'));
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        if (userSelectedCountry) return;
        setCountryCode(normalizeCountryCode(initialCountry || detectBrowserCountry()));
    }, [initialCountry, userSelectedCountry]);

    useEffect(() => {
        if (paymentMethod && !paymentMethods.some((method) => method.key === paymentMethod)) setPaymentMethod('');
    }, [paymentMethod, paymentMethods]);

    useEffect(() => {
        if (selectedPaymentMethod?.type !== 'CRYPTO' || !selectedPaymentMethod.id) {
            setCryptoNetworks([]);
            setCryptoNetworksError(null);
            setSelectedCryptoNetworkId(null);
            return undefined;
        }

        let cancelled = false;
        setCryptoNetworksLoading(true);
        setCryptoNetworksError(null);
        apiFetch(`/public/payment-methods/${encodeURIComponent(selectedPaymentMethod.id)}/networks`)
            .then((payload) => {
                if (cancelled) return;
                const networks = pageItems(payload).map(normalizeCryptoNetwork).filter((network) => network.id);
                setCryptoNetworks(networks);
                setSelectedCryptoNetworkId((current) => (
                    current && networks.some((network) => network.id === current)
                        ? current
                        : (networks[0]?.id ?? null)
                ));
            })
            .catch((error) => {
                if (cancelled) return;
                setCryptoNetworks([]);
                setSelectedCryptoNetworkId(null);
                setCryptoNetworksError(readError(error, 'Unable to load crypto networks.'));
            })
            .finally(() => {
                if (!cancelled) setCryptoNetworksLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [selectedPaymentMethod?.id, selectedPaymentMethod?.type]);

    useEffect(() => {
        const fallbackProduct = cartItems[0]?.product || products.find((product) => product?.priceCurrency);
        const discoveryAmount = cartItems.length ? cartSubtotal(cartItems) : number(fallbackProduct?.priceAmount);
        const discoveryCurrency = cartItems[0]?.product?.priceCurrency ||
            fallbackProduct?.priceCurrency ||
            currencies.paymentCurrency ||
            currencies.billingCurrency ||
            '';

        if (!discoveryCurrency) {
            setPaymentMethodsLoaded(false);
            setPaymentMethodsError(null);
            return undefined;
        }

        let cancelled = false;
        const timer = window.setTimeout(() => {
            fetchPaymentMethodsForAmount({ amount: discoveryAmount || 0, currency: discoveryCurrency })
                .catch(() => {
                    if (!cancelled) {
                        // The visible error state is set in fetchPaymentMethodsForAmount.
                    }
                });
        }, 150);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [cartItems, products, currencies.billingCurrency, currencies.paymentCurrency, fetchPaymentMethodsForAmount]);

    useEffect(() => {
        if (!order?.reference || !order?.accessToken) return undefined;
        if (isOrderTerminal(order)) return undefined;

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
    }, [order?.accessToken, order?.paymentTransactionStatus, order?.reference, order?.status]);

    useEffect(() => {
        if (!isOrderPaid(order)) return;
        setPaymentReviewOpen(false);
        setPaymentReviewContext(null);
        setPaymentPrompt((current) => (
            current?.type === 'PAID'
                ? current
                : {
                    type: 'PAID',
                    reference: order?.reference || '',
                    total: amount(order?.totalAmount ?? order?.paymentAmount, order?.totalCurrency || order?.paymentCurrency),
                    receipt: {
                        reference: order?.reference || '',
                        storeName: store?.name || 'Fondeka Commerce',
                        date: new Date().toISOString(),
                        items: cartItems,
                        totalAmount: order?.totalAmount ?? order?.paymentAmount,
                        totalCurrency: order?.totalCurrency || order?.paymentCurrency,
                        customerName: buyer?.name || '',
                        paidVia: selectedPaymentMethod?.name || '',
                        status: order?.status || order?.paymentTransactionStatus || 'PAID',
                    },
                }
        ));
    }, [buyer?.name, cartItems, order?.paymentAmount, order?.paymentCurrency, order?.paymentTransactionStatus, order?.reference, order?.status, order?.totalAmount, order?.totalCurrency, selectedPaymentMethod?.name, store?.name]);

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

    const countryPicker = (
        <CountryPickerModal
            open={showCountryPicker}
            countries={filteredCountries}
            query={countryQuery}
            selectedCode={countryCode}
            onQueryChange={setCountryQuery}
            onClose={() => setShowCountryPicker(false)}
            onSelect={(country) => {
                setUserSelectedCountry(true);
                setBuyer((current) => {
                    const localDigits = nationalPhoneNumber(current.phone, selectedCountry);
                    return {
                        ...current,
                        phone: localDigits ? combinePhoneNumber(country, localDigits) : current.phone,
                    };
                });
                setCountryCode(country.code);
                setShowCountryPicker(false);
                setQuote(null);
                setPaymentReviewOpen(false);
                setPaymentReviewContext(null);
                setPaymentPrompt(null);
                setCheckout(null);
                setDiscoveredPaymentMethods([]);
                setPaymentMethodsError(null);
                setPaymentMethodsLoaded(false);
                setCryptoNetworks([]);
                setCryptoNetworksError(null);
                setSelectedCryptoNetworkId(null);
                setFlowError(null);
            }}
        />
    );
    const reviewSheet = paymentReviewOpen ? (
        <PaymentReviewSheet
            quote={paymentReviewContext?.quote || quote}
            method={paymentReviewContext?.method || selectedPaymentMethod}
            network={selectedPaymentMethod?.type === 'CRYPTO'
                ? cryptoNetworks.find((network) => network.id === selectedCryptoNetworkId)
                : null}
            account={selectedPaymentMethod?.type === 'MOBILE_MONEY' ? buyer.phone : null}
            busy={busy}
            onClose={() => setPaymentReviewOpen(false)}
            onConfirm={confirmPayment}
        />
    ) : null;
    const paymentPromptModal = paymentPrompt?.type === 'MOBILE_MONEY' ? (
        <MobileMoneyPromptModal
            number={paymentPrompt.number}
            hint={paymentPrompt.hint}
            onClose={() => setPaymentPrompt(null)}
        />
    ) : paymentPrompt?.type === 'CRYPTO' ? (
        <CryptoPaymentModal
            address={paymentPrompt.address}
            amount={paymentPrompt.amount}
            networkName={paymentPrompt.networkName}
            invoiceUrl={paymentPrompt.invoiceUrl}
            expiresAt={paymentPrompt.expiresAt}
            hint={paymentPrompt.hint}
            onClose={() => setPaymentPrompt(null)}
        />
    ) : paymentPrompt?.type === 'PAID' ? (
        <PaymentSuccessModal
            reference={paymentPrompt.reference}
            total={paymentPrompt.total}
            onReceipt={() => setReceiptOpen(true)}
            onClose={() => setPaymentPrompt(null)}
        />
    ) : null;
    const receiptModal = receiptOpen && paymentPrompt?.receipt ? (
        <CommerceReceiptModal receipt={paymentPrompt.receipt} onClose={() => setReceiptOpen(false)} />
    ) : null;

    if (order && showOrderPaymentView) {
        return (
            <Screen>
                <section className="order-panel">
                    <div className="status-pill">{order.status || 'PENDING_PAYMENT'}</div>
                    <h1>Complete payment</h1>
                    <p>Fees are checked before payment starts.</p>

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
                        setBuyer={updateBuyer}
                        paymentMethod={paymentMethod}
                        setPaymentMethod={updatePaymentMethod}
                        paymentMethods={paymentMethods}
                        paymentMethodsLoading={paymentMethodsLoading}
                        paymentMethodsError={paymentMethodsError}
                        paymentMethodsLoaded={paymentMethodsLoaded}
                        cryptoNetworks={cryptoNetworks}
                        cryptoNetworksLoading={cryptoNetworksLoading}
                        cryptoNetworksError={cryptoNetworksError}
                        selectedCryptoNetworkId={selectedCryptoNetworkId}
                        setSelectedCryptoNetworkId={setSelectedCryptoNetworkId}
                        selectedCountry={selectedCountry}
                        onOpenCountryPicker={() => {
                            setCountryQuery('');
                            setShowCountryPicker(true);
                        }}
                        quote={quote}
                        checkout={checkout}
                        flowError={flowError}
                        busy={busy}
                        appCheckoutLink={appCheckoutLink}
                        showAppCheckout={isMobileBrowser}
                        showAppInstallFallback={showAppInstallFallback}
                        onOpenAppCheckout={openFondekaAppCheckout}
                        onConfirm={reviewPayment}
                    />
                    {countryPicker}
                    {reviewSheet}
                    {paymentPromptModal}
                    {receiptModal}

                    <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                            setOrder(null);
                            setCheckout(null);
                            setShowOrderPaymentView(false);
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
                <ProductDetailPage
                    product={directProduct}
                    store={store}
                    quantity={Math.max(1, number(cart[directProduct.id]))}
                    activeImageIndex={activeProductImageIndex}
                    onImageChange={setActiveProductImageIndex}
                    onOpenGallery={(startIndex = 0) => setImageGallery({ product: directProduct, index: startIndex })}
                    onQuantityChange={(nextQuantity) => setQuantity(directProduct.id, Math.max(1, nextQuantity))}
                    onPay={() => setCheckoutSheetOpen(true)}
                />
                <CheckoutSheet
                    open={checkoutSheetOpen}
                    title="Checkout"
                    onClose={() => setCheckoutSheetOpen(false)}
                >
                    <CheckoutPaymentForm
                        cartItems={cartItems}
                        buyer={buyer}
                        setBuyer={updateBuyer}
                        currencies={currencies}
                        paymentMethod={paymentMethod}
                        setPaymentMethod={updatePaymentMethod}
                        paymentMethods={paymentMethods}
                        paymentMethodsLoading={paymentMethodsLoading}
                        paymentMethodsError={paymentMethodsError}
                        paymentMethodsLoaded={paymentMethodsLoaded}
                        cryptoNetworks={cryptoNetworks}
                        cryptoNetworksLoading={cryptoNetworksLoading}
                        cryptoNetworksError={cryptoNetworksError}
                        selectedCryptoNetworkId={selectedCryptoNetworkId}
                        setSelectedCryptoNetworkId={setSelectedCryptoNetworkId}
                        selectedCountry={selectedCountry}
                        buyerDetailsOpen={buyerDetailsOpen}
                        setBuyerDetailsOpen={setBuyerDetailsOpen}
                        onOpenCountryPicker={() => {
                            setCountryQuery('');
                            setShowCountryPicker(true);
                        }}
                        quote={quote}
                        checkout={checkout}
                        flowError={flowError}
                        busy={busy}
                        appCheckoutLink={appCheckoutLink}
                        showAppCheckout={isMobileBrowser}
                        showAppInstallFallback={showAppInstallFallback}
                        onOpenAppCheckout={openFondekaAppCheckout}
                        onConfirm={reviewPayment}
                    />
                </CheckoutSheet>
                {countryPicker}
                {reviewSheet}
                {paymentPromptModal}
                {receiptModal}
                {imageGallery && (
                    <ProductImageGallery
                        product={imageGallery.product}
                        index={imageGallery.index}
                        onIndexChange={(index) => setImageGallery((current) => current ? { ...current, index } : current)}
                        onClose={() => setImageGallery(null)}
                    />
                )}
            </Screen>
        );
    }

    return (
        <Screen wide>
            <StoreProfilePage
                store={store}
                products={products}
                reviews={reviews}
                categories={categories}
                activeTab={activeTab}
                cart={cart}
                cartCount={cartCount}
                cartTotal={cartTotal}
                cartCurrency={cartCurrency}
                onTabChange={setActiveTab}
                onProductOpen={(product) => {
                    const targetSlug = product.slug || product.id;
                    if (targetSlug && store?.slug) window.location.href = `/stores/${encodeURIComponent(store.slug)}/products/${encodeURIComponent(targetSlug)}`;
                    else setSelectedProduct(product);
                }}
                onProductAdd={(product) => changeQuantity(product.id, 1)}
                onProductRemove={(product) => changeQuantity(product.id, -1)}
                onPay={() => setCheckoutSheetOpen(true)}
            />
            <CheckoutSheet
                open={checkoutSheetOpen}
                title="Checkout"
                onClose={() => setCheckoutSheetOpen(false)}
            >
                    <CheckoutPaymentForm
                        cartItems={cartItems}
                        buyer={buyer}
                        setBuyer={updateBuyer}
                        currencies={currencies}
                        paymentMethod={paymentMethod}
                        setPaymentMethod={updatePaymentMethod}
                        paymentMethods={paymentMethods}
                        paymentMethodsLoading={paymentMethodsLoading}
                        paymentMethodsError={paymentMethodsError}
                        paymentMethodsLoaded={paymentMethodsLoaded}
                        cryptoNetworks={cryptoNetworks}
                        cryptoNetworksLoading={cryptoNetworksLoading}
                        cryptoNetworksError={cryptoNetworksError}
                        selectedCryptoNetworkId={selectedCryptoNetworkId}
                        setSelectedCryptoNetworkId={setSelectedCryptoNetworkId}
                        selectedCountry={selectedCountry}
                        buyerDetailsOpen={buyerDetailsOpen}
                        setBuyerDetailsOpen={setBuyerDetailsOpen}
                        onOpenCountryPicker={() => {
                            setCountryQuery('');
                            setShowCountryPicker(true);
                        }}
                        quote={quote}
                        checkout={checkout}
                        flowError={flowError}
                        busy={busy}
                        appCheckoutLink={appCheckoutLink}
                        showAppCheckout={isMobileBrowser}
                        showAppInstallFallback={showAppInstallFallback}
                        onOpenAppCheckout={openFondekaAppCheckout}
                        onConfirm={reviewPayment}
                    />
            </CheckoutSheet>

            {selectedProduct && (
                <ProductDialog
                    product={selectedProduct}
                    quantity={number(cart[selectedProduct.id])}
                    onClose={() => setSelectedProduct(null)}
                    onOpenGallery={(startIndex = 0) => setImageGallery({ product: selectedProduct, index: startIndex })}
                    onIncrement={() => changeQuantity(selectedProduct.id, 1)}
                    onDecrement={() => changeQuantity(selectedProduct.id, -1)}
                />
            )}
            {imageGallery && (
                <ProductImageGallery
                    product={imageGallery.product}
                    index={imageGallery.index}
                    onIndexChange={(index) => setImageGallery((current) => current ? { ...current, index } : current)}
                    onClose={() => setImageGallery(null)}
                />
            )}
            {countryPicker}
            {reviewSheet}
            {paymentPromptModal}
            {receiptModal}
        </Screen>
    );
}

function ProductHero({ product, store, onOpenGallery }) {
    const images = productImages(product);
    const image = images[0];
    return (
        <section className="product-page-hero">
            <button
                type="button"
                className="product-page-media product-page-media--button"
                onClick={() => image && onOpenGallery?.(0)}
                aria-label={image ? `Zoom ${product.name}` : product.name}
                disabled={!image}
            >
                {image ? (
                    <img src={image} alt={product.name || ''} />
                ) : (
                    <div className="product-page-media-fallback">{initials(product.name)}</div>
                )}
                {images.length > 1 && <span className="product-image-count product-image-count--hero">{images.length} photos</span>}
            </button>

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
                <StoreContactActions store={store} compact />
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

function ShareButton({ label = 'Share', text }) {
    const handleShare = async () => {
        const shareUrl = text || (typeof window !== 'undefined' ? window.location.href : '');
        try {
            if (navigator.share) {
                await navigator.share({ url: shareUrl });
                return;
            }
        } catch {
            return;
        }
        await copyToClipboard(shareUrl);
    };

    return (
        <button type="button" className="profile-icon-button" onClick={handleShare} aria-label={label}>
            ↗
        </button>
    );
}

function ProfileTopBar({ title = 'Fondeka Commerce', backHref = '/' }) {
    return (
        <div className="profile-topbar">
            <a className="profile-back-button" href={backHref} aria-label="Back">
                ‹
            </a>
            <strong>{title}</strong>
            <ShareButton />
        </div>
    );
}

function VerifiedBadge({ className = '' }) {
    return (
        <span className={`verified-badge${className ? ` ${className}` : ''}`} aria-label="Verified by Fondeka" title="Verified by Fondeka">
            <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M10 2.4l5.8 2.2v4.1c0 3.8-2.4 7.2-5.8 8.8-3.4-1.6-5.8-5-5.8-8.8V4.6L10 2.4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M6.9 10.1l2 2 4.2-4.4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </span>
    );
}

function StoreProfilePage({
    store,
    products,
    reviews,
    categories,
    activeTab,
    cart,
    cartCount,
    cartTotal,
    cartCurrency,
    onTabChange,
    onProductOpen,
    onProductAdd,
    onProductRemove,
    onPay,
}) {
    const tabs = {
        PRODUCTS: (
            products.length ? (
                <div className="profile-product-grid">
                    {products.map((product) => (
                        <ProfileProductCard
                            key={product.id || product.slug}
                            product={product}
                            quantity={number(cart[product.id])}
                            onOpen={() => onProductOpen(product)}
                            onAdd={() => onProductAdd(product)}
                            onRemove={() => onProductRemove(product)}
                        />
                    ))}
                </div>
            ) : (
                <StateCard title="No products yet" message="This store has no products available right now." />
            )
        ),
        ABOUT: <AboutPanel store={store} categories={categories} />,
        REVIEWS: <StoreReviews reviews={reviews} storeName={store?.name} />,
    };

    return (
        <div className={`store-profile${cartCount ? ' store-profile--with-cart' : ''}`}>
            <ProfileTopBar title="Fondeka Commerce" />
            <StoreProfileHeader store={store} />
            <StoreTabs activeTab={activeTab} onChange={onTabChange} />
            <section className="store-tab-panel" aria-label={STORE_TAB_LABELS[activeTab]}>
                {tabs[activeTab]}
            </section>
            {cartCount > 0 && (
                <StickyCheckoutBar
                    count={cartCount}
                    total={amount(cartTotal, cartCurrency)}
                    onPay={onPay}
                />
            )}
        </div>
    );
}

function StoreProfileHeader({ store }) {
    const verified = isVerifiedStatus(store?.verificationStatus);
    const memberSince = formatMemberSince(store?.createdAt);
    const capabilities = storeCapabilities(store);

    return (
        <section className="store-profile-header">
            <div className="store-cover">
                {store?.bannerUrl ? <img src={store.bannerUrl} alt="" /> : null}
                <div className="store-avatar">
                    {store?.logoUrl ? <img src={store.logoUrl} alt="" /> : <span>{String(store?.name || 'S').slice(0, 1).toUpperCase()}</span>}
                </div>
            </div>

            <div className="store-profile-identity">
                <div className="store-name-line">
                    <h1>{store?.name || store?.slug || 'Store'}</h1>
                    {verified ? <VerifiedBadge /> : null}
                </div>
                {(memberSince || store?.countryCode) && (
                    <div className="store-profile-meta">
                        {memberSince && <span>Membre depuis {memberSince}</span>}
                        {store?.countryCode && <span className="store-location"><LocationIcon />{store.countryCode}</span>}
                    </div>
                )}
                <StoreContactActions store={store} />
                {!!capabilities.length && (
                    <div className="store-capability-row">
                        {capabilities.map((capability) => (
                            <span key={capability.key}><i>{capability.icon}</i>{capability.label}</span>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

function StoreTabs({ activeTab, onChange }) {
    const activeIndex = Math.max(0, STORE_TABS.indexOf(activeTab));
    return (
        <div className="store-tabs" role="tablist" aria-label="Store profile">
            <span className="store-tab-indicator" style={{ transform: `translateX(${activeIndex * 100}%)` }} />
            {STORE_TABS.map((tab) => (
                <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    className={activeTab === tab ? 'store-tab store-tab--active' : 'store-tab'}
                    onClick={() => onChange(tab)}
                >
                    {STORE_TAB_LABELS[tab]}
                </button>
            ))}
        </div>
    );
}

function AboutPanel({ store, categories }) {
    const memberSince = formatMemberSince(store?.createdAt, true);
    return (
        <section className="store-info-panel">
            <h2>À propos</h2>
            {store?.description && <p>{store.description}</p>}
            {!!categories.length && <InfoLine label="Categories" value={categories.join(', ')} />}
            {store?.countryCode && <InfoLine label="Pays" value={store.countryCode} />}
            {memberSince && <InfoLine label="Membre depuis" value={memberSince} />}
            {isVerifiedStatus(store?.verificationStatus) && <InfoLine label="Confiance" value="Vérifiée par Fondeka" />}
        </section>
    );
}

function InfoLine({ label, value }) {
    return (
        <div className="store-info-line">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function StoreContactActions({ store, compact = false }) {
    const contactLinks = storeContactLinks(store);
    const socialLinks = storeSocialLinks(store);

    if (!contactLinks.length && !socialLinks.length) return null;

    return (
        <div className={`store-contact-actions${compact ? ' store-contact-actions--compact' : ''}`}>
            {!!contactLinks.length && (
                <div className="store-contact-primary" aria-label="Store contact actions">
                    {contactLinks.map((link) => (
                        <a key={link.key} href={link.href} target={link.key === 'whatsapp' ? '_blank' : undefined} rel={link.key === 'whatsapp' ? 'noreferrer' : undefined}>
                            {link.key === 'whatsapp' ? <WhatsAppIcon /> : <MailIcon />}
                            {link.label}
                        </a>
                    ))}
                </div>
            )}
            {!!socialLinks.length && (
                <div className="store-social-links" aria-label="Store social links">
                    {socialLinks.map((link) => (
                        <a key={link.key} href={link.href} target="_blank" rel="noreferrer" aria-label={link.label}>
                            {link.icon}
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

function StarRating({ stars, label }) {
    const safeStars = Math.max(0, Math.min(5, Math.round(number(stars))));
    return (
        <div className="star-rating" aria-label={label || `${safeStars} out of 5 stars`}>
            {Array.from({ length: 5 }).map((_, index) => (
                <span key={index} className={index < safeStars ? 'star-rating-star--filled' : ''}>★</span>
            ))}
        </div>
    );
}

function StoreReviews({ reviews, storeName }) {
    if (!reviews?.length) {
        return (
            <section className="store-info-panel">
                <h2>Reviews</h2>
                <p>Reviews will appear here when customers start rating this store.</p>
            </section>
        );
    }

    const average = reviews.reduce((sum, review) => sum + review.stars, 0) / reviews.length;
    const averageLabel = `${average.toFixed(1)} out of 5`;

    return (
        <section className="store-reviews store-reviews--tab" aria-label="Store reviews">
            <div className="store-reviews-heading">
                <div>
                    <h2>Reviews</h2>
                    <p>{averageLabel} from {reviews.length} review{reviews.length === 1 ? '' : 's'}</p>
                </div>
                <StarRating stars={average} label={averageLabel} />
            </div>
            <div className="store-review-grid">
                {reviews.map((review, index) => (
                    <article className="store-review-card" key={review.id || index}>
                        <div className="review-head">
                            <span className="review-avatar">{initials(review.reviewerName || 'Customer').slice(0, 1)}</span>
                            <div>
                                <strong>{review.reviewerName || 'Customer'}</strong>
                                <div className="review-meta">
                                    <StarRating stars={review.stars} />
                                    {review.createdAt && <span>{formatReviewDate(review.createdAt)}</span>}
                                </div>
                            </div>
                        </div>
                        <p>{review.message}</p>
                        {review.replyMessage && (
                            <div className="review-reply">
                                <strong>Réponse de {review.replyByName || storeName || 'la boutique'}</strong>
                                <p>{review.replyMessage}</p>
                                {review.repliedAt && <span>{formatReviewDate(review.repliedAt)}</span>}
                            </div>
                        )}
                    </article>
                ))}
            </div>
        </section>
    );
}

function ProfileProductCard({ product, quantity, onOpen, onAdd, onRemove }) {
    const out = inventoryLabel(product) === 'Out of stock';
    const images = productImages(product);
    const image = images[0];
    return (
        <article className="profile-product-card">
            <button
                type="button"
                className="profile-product-media"
                onClick={onOpen}
                aria-label={`View ${product.name}`}
            >
                {image ? <img src={image} alt="" /> : initials(product.name)}
            </button>
            <div className="profile-product-body">
                <button type="button" className="profile-product-name" onClick={onOpen}>{product.name || product.slug || 'Product'}</button>
                <strong className="profile-product-price">{amount(product.priceAmount, product.priceCurrency)}</strong>
                <div className="profile-product-actions">
                    {quantity > 0 && (
                        <>
                            <button type="button" className="profile-qty-button" onClick={onRemove} disabled={out} aria-label="Decrease quantity">−</button>
                            <span>{quantity}</span>
                        </>
                    )}
                    <button type="button" className={quantity > 0 ? 'profile-add-button profile-add-button--icon' : 'profile-add-button'} onClick={onAdd} disabled={out}>
                        {quantity > 0 ? '+' : 'Add'}
                    </button>
                </div>
            </div>
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

function StickyCheckoutBar({ count, total, onPay }) {
    return (
        <div className="sticky-checkout-bar" role="region" aria-label="Checkout">
            <div>
                <strong>{count} article{count === 1 ? '' : 's'}</strong>
                {total && <span>{total}</span>}
            </div>
            <button type="button" onClick={onPay}>Payer</button>
        </div>
    );
}

function ProductDetailPage({
    product,
    store,
    quantity,
    activeImageIndex,
    onImageChange,
    onOpenGallery,
    onQuantityChange,
    onPay,
}) {
    const images = productImages(product);
    const activeImage = images[activeImageIndex] || images[0] || '';
    const verified = isVerifiedStatus(product?.storeVerificationStatus || store?.verificationStatus);
    const storeName = product?.storeName || store?.name || 'Store';
    const whatsappHref = whatsappLink(store?.whatsappNumber || product?.storeWhatsappNumber || product?.whatsappNumber);
    const storeHref = store?.slug ? `/stores/${encodeURIComponent(store.slug)}` : '#';

    return (
        <div className="product-detail-page">
            <ProfileTopBar title="Product" backHref={storeHref !== '#' ? storeHref : '/'} />
            <div className="product-detail-layout">
                <section className="product-detail-media-col">
                    <div
                        className="product-detail-media"
                    >
                        <button
                            type="button"
                            className="product-detail-media-zoom"
                            onClick={() => activeImage && onOpenGallery(activeImageIndex || 0)}
                            disabled={!activeImage}
                            aria-label={activeImage ? `Zoom ${product.name}` : product.name}
                        >
                            {activeImage ? <img src={activeImage} alt={product.name || ''} /> : <span>{initials(product.name)}</span>}
                        </button>
                        {storeName && (
                            <a className="media-store-pill" href={storeHref}>
                                <span>{store?.logoUrl ? <img src={store.logoUrl} alt="" /> : initials(storeName).slice(0, 1)}</span>
                                <strong>{storeName}</strong>
                                <i>›</i>
                            </a>
                        )}
                        {verified && <VerifiedBadge className="verified-badge--media" />}
                    </div>
                    {images.length > 1 && (
                        <div className="product-gallery-thumbs" aria-label="Product images">
                            {images.map((image, index) => (
                                <button
                                    key={image}
                                    type="button"
                                    className={image === activeImage ? 'product-thumb product-thumb--active' : 'product-thumb'}
                                    onClick={() => onImageChange(index)}
                                    aria-label={`Show image ${index + 1}`}
                                >
                                    <img src={image} alt="" />
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                <section className="product-detail-copy">
                    <div className="product-name-row">
                        <h1>{product.name || product.slug || 'Product'}</h1>
                        {whatsappHref && (
                            <a className="product-whatsapp-button" href={whatsappHref} target="_blank" rel="noreferrer" aria-label="WhatsApp">
                                <WhatsAppIcon />
                            </a>
                        )}
                    </div>
                    <div className="product-price-badge">
                        <span>ⓘ</span>
                        <strong>{amount(product.priceAmount, product.priceCurrency)}</strong>
                    </div>
                    {product.description && (
                        <div className="product-description-section">
                            <h2>Description</h2>
                            <p>{product.description}</p>
                        </div>
                    )}
                </section>
            </div>
            <div className="product-sticky-buy-row">
                <div className="product-buy-qty">
                    <button type="button" onClick={() => onQuantityChange(quantity - 1)} disabled={quantity <= 1} aria-label="Decrease quantity">−</button>
                    <span>{quantity}</span>
                    <button type="button" onClick={() => onQuantityChange(quantity + 1)} aria-label="Increase quantity">+</button>
                </div>
                <button type="button" className="product-pay-button" onClick={onPay}>Payer</button>
            </div>
        </div>
    );
}

function CheckoutSheet({ open, title, onClose, children }) {
    if (!open) return null;
    return (
        <div className="checkout-sheet-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="checkout-sheet" onClick={(event) => event.stopPropagation()}>
                <div className="checkout-sheet-handle" aria-hidden="true" />
                <div className="checkout-sheet-header">
                    <h2>{title}</h2>
                    <button type="button" onClick={onClose}>Close</button>
                </div>
                {children}
            </div>
        </div>
    );
}

function LoadingButtonLabel({ label }) {
    return (
        <span className="button-loading-label">
            <span className="button-spinner" aria-hidden="true" />
            <span>{label}</span>
        </span>
    );
}

function ChevronDownIcon({ className = 'payment-country-chevron' }) {
    return (
        <svg className={className} width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function LocationIcon({ className = 'store-location-icon' }) {
    return (
        <svg className={className} width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 21s7-5.5 7-12a7 7 0 1 0-14 0c0 6.5 7 12 7 12z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="9" r="2.4" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
    );
}

function WhatsAppIcon({ className = 'whatsapp-icon' }) {
    return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20.5 11.8a8.4 8.4 0 0 1-12.4 7.4L4 20.3l1.1-4A8.4 8.4 0 1 1 20.5 11.8z" fill="currentColor" />
            <path d="M8.6 7.8c.2-.4.4-.5.7-.5h.5c.2 0 .4.1.5.4l.7 1.7c.1.3.1.5-.1.7l-.4.5c-.1.1-.2.3-.1.5.3.6.8 1.2 1.3 1.7.6.5 1.2.9 1.9 1.2.2.1.4 0 .5-.1l.5-.6c.2-.2.4-.3.7-.2l1.7.8c.3.1.4.3.4.6 0 .5-.1 1.1-.5 1.5-.4.4-1 .6-1.7.6-1.1 0-2.5-.5-4-1.5-1.3-.9-2.4-2-3.3-3.3-1-1.5-1.5-2.9-1.5-4 0-.7.2-1.2.6-1.6z" fill="#fff" />
        </svg>
    );
}

function MailIcon({ className = 'mail-icon' }) {
    return (
        <svg className={className} width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M4.5 7.5l7.5 5.8 7.5-5.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function BuyerFields({ buyer, setBuyer, selectedCountry, onOpenCountryPicker }) {
    const update = (key, value) => setBuyer((current) => ({ ...current, [key]: value }));
    const localPhone = nationalPhoneNumber(buyer.phone, selectedCountry);

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
                <div className="phone-input-row">
                    <button type="button" className="phone-code-button" onClick={onOpenCountryPicker}>
                        <span aria-hidden="true">{selectedCountry?.flag}</span>
                        <strong>+{selectedCountry?.callingCode || '243'}</strong>
                        <ChevronDownIcon />
                    </button>
                    <input
                        value={localPhone}
                        onChange={(event) => update('phone', combinePhoneNumber(selectedCountry, event.target.value))}
                        placeholder="997371767"
                        inputMode="tel"
                    />
                </div>
            </label>
        </div>
    );
}

function BuyerDetailsSection({ buyer, setBuyer, selectedCountry, open, setOpen, onOpenCountryPicker }) {
    const hasDetails = hasBuyerDetails(buyer);

    if (!open && hasDetails) {
        return (
            <div className="buyer-summary">
                <div className="buyer-summary-main">
                    <strong>{buyer.name || 'Buyer'}</strong>
                    <span>{buyer.phone || 'No phone saved'}</span>
                    {buyer.email && <span>{buyer.email}</span>}
                </div>
                <button type="button" className="buyer-summary-edit" onClick={() => setOpen(true)}>
                    Edit
                </button>
            </div>
        );
    }

    return (
        <div>
            <BuyerFields
                buyer={buyer}
                setBuyer={setBuyer}
                selectedCountry={selectedCountry}
                onOpenCountryPicker={onOpenCountryPicker}
            />
            {hasDetails && (
                <button type="button" className="buyer-collapse-button" onClick={() => setOpen(false)}>
                    Use these details
                </button>
            )}
        </div>
    );
}

function CheckoutPaymentForm({
    cartItems,
    buyer,
    setBuyer,
    currencies,
    paymentMethod,
    setPaymentMethod,
    paymentMethods,
    paymentMethodsLoading,
    paymentMethodsError,
    paymentMethodsLoaded,
    cryptoNetworks,
    cryptoNetworksLoading,
    cryptoNetworksError,
    selectedCryptoNetworkId,
    setSelectedCryptoNetworkId,
    selectedCountry,
    buyerDetailsOpen,
    setBuyerDetailsOpen,
    onOpenCountryPicker,
    quote,
    checkout,
    flowError,
    busy,
    appCheckoutLink,
    showAppCheckout,
    showAppInstallFallback,
    onOpenAppCheckout,
    onConfirm,
}) {
    const selectedMethod = paymentMethods.find((method) => method.key === paymentMethod) || null;
    const cartSubtotal = cartItems.reduce((sum, { product, quantity }) => (
        sum + number(product.priceAmount) * number(quantity)
    ), 0);
    const cartCurrency = cartItems[0]?.product?.priceCurrency || currencies.billingCurrency || '';

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

                {cartItems.length > 0 && (
                    <div className="commerce-payment-total">
                        <span>Estimated subtotal</span>
                        <strong>{amount(cartSubtotal, cartCurrency)}</strong>
                    </div>
                )}
            </section>

            <section className="payment-step-card">
                <div className="payment-step-heading">
                    <span>2</span>
                    <div>
                        <strong>Buyer details</strong>
                        <small>Used for confirmation and payment follow-up</small>
                    </div>
                </div>
                <BuyerDetailsSection
                    buyer={buyer}
                    setBuyer={setBuyer}
                    selectedCountry={selectedCountry}
                    open={buyerDetailsOpen}
                    setOpen={setBuyerDetailsOpen}
                    onOpenCountryPicker={onOpenCountryPicker}
                />
            </section>

            <section className="payment-step-card">
                <div className="payment-step-heading">
                    <span>3</span>
                    <div>
                        <strong>How to pay</strong>
                        <small>Fees are checked before payment starts</small>
                    </div>
                </div>

                {showAppCheckout && (
                    <FondekaAppPaymentPanel
                        appCheckoutLink={appCheckoutLink}
                        disabled={!cartItems.length}
                        showInstallFallback={showAppInstallFallback}
                        onOpen={onOpenAppCheckout}
                    />
                )}

                <PaymentMethodPicker
                    paymentMethod={paymentMethod}
                    setPaymentMethod={setPaymentMethod}
                    buyer={buyer}
                    setBuyer={setBuyer}
                    methods={paymentMethods}
                    loading={paymentMethodsLoading}
                    error={paymentMethodsError}
                    loaded={paymentMethodsLoaded}
                    cryptoNetworks={cryptoNetworks}
                    cryptoNetworksLoading={cryptoNetworksLoading}
                    cryptoNetworksError={cryptoNetworksError}
                    selectedCryptoNetworkId={selectedCryptoNetworkId}
                    setSelectedCryptoNetworkId={setSelectedCryptoNetworkId}
                    selectedCountry={selectedCountry}
                    onOpenCountryPicker={onOpenCountryPicker}
                />

                <div className="actions payment-actions">
                    <button type="button" className="button primary" onClick={onConfirm} disabled={busy || !cartItems.length}>
                        {busy ? <LoadingButtonLabel label="Starting payment" /> : 'Start payment'}
                    </button>
                </div>

                {flowError && (
                    isFeatureDisabled(flowError)
                        ? <Unavailable message={flowError.message} />
                        : <InlineError message={flowError.message} />
                )}
            </section>

        </section>
    );
}

function OrderPaymentPanel({
    order,
    buyer,
    setBuyer,
    paymentMethod,
    setPaymentMethod,
    paymentMethods,
    paymentMethodsLoading,
    paymentMethodsError,
    paymentMethodsLoaded,
    cryptoNetworks,
    cryptoNetworksLoading,
    cryptoNetworksError,
    selectedCryptoNetworkId,
    setSelectedCryptoNetworkId,
    selectedCountry,
    onOpenCountryPicker,
    quote,
    checkout,
    flowError,
    busy,
    appCheckoutLink,
    showAppCheckout,
    showAppInstallFallback,
    onOpenAppCheckout,
    onConfirm,
}) {
    const selectedMethod = paymentMethods.find((method) => method.key === paymentMethod) || null;
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
                        <strong>Payment method</strong>
                        <small>Fees are checked before payment starts</small>
                    </div>
                </div>
                {showAppCheckout && (
                    <FondekaAppPaymentPanel
                        appCheckoutLink={appCheckoutLink}
                        disabled={!payable}
                        showInstallFallback={showAppInstallFallback}
                        onOpen={onOpenAppCheckout}
                    />
                )}
                <PaymentMethodPicker
                    paymentMethod={paymentMethod}
                    setPaymentMethod={setPaymentMethod}
                    buyer={buyer}
                    setBuyer={setBuyer}
                    methods={paymentMethods}
                    loading={paymentMethodsLoading}
                    error={paymentMethodsError}
                    loaded={paymentMethodsLoaded}
                    cryptoNetworks={cryptoNetworks}
                    cryptoNetworksLoading={cryptoNetworksLoading}
                    cryptoNetworksError={cryptoNetworksError}
                    selectedCryptoNetworkId={selectedCryptoNetworkId}
                    setSelectedCryptoNetworkId={setSelectedCryptoNetworkId}
                    selectedCountry={selectedCountry}
                    onOpenCountryPicker={onOpenCountryPicker}
                    disabled={!payable}
                />

                <div className="actions payment-actions">
                    <button type="button" className="button primary" onClick={onConfirm} disabled={busy || !payable}>
                        {busy ? <LoadingButtonLabel label="Starting payment" /> : 'Start payment'}
                    </button>
                </div>

                {flowError && (
                    isFeatureDisabled(flowError)
                        ? <Unavailable message={flowError.message} />
                        : <InlineError message={flowError.message} />
                )}
            </section>

        </section>
    );
}

function FondekaAppPaymentPanel({ appCheckoutLink, disabled, showInstallFallback, onOpen }) {
    return (
        <div className="fondeka-app-pay-panel">
            <div className="fondeka-app-pay-copy">
                <strong>Fondeka app</strong>
                <span>Open this checkout in the app and pay with your Fondeka balance or saved rails.</span>
            </div>
            <button
                type="button"
                className="button primary fondeka-app-pay-button"
                onClick={onOpen}
                disabled={disabled || !appCheckoutLink}
            >
                Pay with Fondeka
            </button>
            {showInstallFallback && (
                <div className="fondeka-app-pay-fallback">
                    <p>Fondeka app not installed? Download the app to finish this checkout on mobile.</p>
                    <a href="/#download">Download the app</a>
                </div>
            )}
        </div>
    );
}

function PaymentMethodPicker({
    paymentMethod,
    setPaymentMethod,
    buyer,
    setBuyer,
    methods,
    loading,
    error,
    loaded = false,
    cryptoNetworks,
    cryptoNetworksLoading,
    cryptoNetworksError,
    selectedCryptoNetworkId,
    setSelectedCryptoNetworkId,
    selectedCountry,
    onOpenCountryPicker,
    disabled = false,
}) {
    const grouped = groupedPaymentMethods(methods);
    const groupKeys = Object.keys(grouped);
    const firstAvailableGroup = groupKeys[0] || '';
    const groupSignature = groupKeys.join('|');

    const [expanded, setExpanded] = useState({});

    useEffect(() => {
        if (!firstAvailableGroup) {
            setExpanded({});
            return;
        }
        setExpanded({ [firstAvailableGroup]: true });
    }, [firstAvailableGroup, groupSignature, selectedCountry?.code]);

    const toggleGroup = (type) => {
        setExpanded((current) => ({ [type]: !current[type] }));
    };

    const selectMethod = (method, type) => {
        setPaymentMethod(method.key);
        setExpanded({ [type]: true });
    };
    const updatePaymentPhone = (digits) => {
        if (!setBuyer) return;
        setBuyer((current) => ({
            ...current,
            phone: combinePhoneNumber(selectedCountry, digits),
        }));
    };

    return (
        <div className="payment-method-focus">
            <div className="payment-methods-heading">
                <span>Pay with</span>
                <button
                    type="button"
                    className="payment-country-chip"
                    onClick={onOpenCountryPicker}
                    disabled={disabled}
                >
                    <span aria-hidden="true">{selectedCountry?.flag}</span>
                    <strong>{selectedCountry?.name || selectedCountry?.code || 'Country'}</strong>
                    <ChevronDownIcon />
                </button>
            </div>

            {loading && <div className="payment-method-status">Loading payment methods...</div>}
            {error && <div className="payment-method-status payment-method-status--error">{error.message}</div>}

            {groupKeys.length ? (
                <div className="payment-method-list">
                    {groupKeys.map((type) => (
                        <section className="payment-method-accordion" key={type}>
                            <button
                                type="button"
                                className={`payment-method-accordion-header${expanded[type] ? ' payment-method-accordion-header--open' : ''}`}
                                onClick={() => toggleGroup(type)}
                                aria-expanded={!!expanded[type]}
                                disabled={disabled}
                            >
                                <span>{PAYMENT_TYPE_LABELS[type] || type}</span>
                                <span className="payment-method-accordion-icon" aria-hidden="true">
                                    <ChevronDownIcon className="payment-method-chevron" />
                                </span>
                            </button>
                            {expanded[type] && (
                                <>
                                    <div className="payment-method-tile-grid">
                                        {grouped[type].map((method) => {
                                            const active = method.key === paymentMethod;
                                            return (
                                                <button
                                                    type="button"
                                                    key={method.key}
                                                    className={`payment-method-tile${active ? ' payment-method-tile--active' : ''}`}
                                                    onClick={() => selectMethod(method, type)}
                                                    aria-pressed={active}
                                                    disabled={disabled}
                                                >
                                                    {method.logoUrl ? (
                                                        <img className="payment-method-tile-image" src={method.logoUrl} alt="" />
                                                    ) : (
                                                        <span className="payment-method-tile-logo" aria-hidden="true">
                                                            {methodInitials(method)}
                                                        </span>
                                                    )}
                                                    {method.currency && <span className={currencyBadgeClass(method.currency)}>{method.currency}</span>}
                                                    <strong>{method.name}</strong>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {type === 'CRYPTO' && grouped[type].some((method) => method.key === paymentMethod) && (
                                        <CryptoNetworkSelector
                                            networks={cryptoNetworks}
                                            loading={cryptoNetworksLoading}
                                            error={cryptoNetworksError}
                                            selectedNetworkId={selectedCryptoNetworkId}
                                            onSelect={setSelectedCryptoNetworkId}
                                            disabled={disabled}
                                        />
                                    )}
                                    {type === 'MOBILE_MONEY' && grouped[type].some((method) => method.key === paymentMethod) && (
                                        <MobileMoneyPhoneSelector
                                            buyer={buyer}
                                            selectedCountry={selectedCountry}
                                            onChangeDigits={updatePaymentPhone}
                                            disabled={disabled}
                                        />
                                    )}
                                </>
                            )}
                        </section>
                    ))}
                </div>
            ) : loaded && !loading && !error ? (
                <div className="payment-method-empty">
                    No payment methods are available for this country yet.
                </div>
            ) : !loading && !error ? (
                <div className="payment-method-status">Loading payment methods...</div>
            ) : null}
        </div>
    );
}

function MobileMoneyPhoneSelector({ buyer, selectedCountry, onChangeDigits, disabled }) {
    const localPhone = nationalPhoneNumber(buyer?.phone, selectedCountry);

    return (
        <div className="mobile-money-phone-panel">
            <label className="mobile-money-phone-label">Mobile Money phone number</label>
            <div className="mobile-money-phone-row">
                <input
                    className="mobile-money-code-input"
                    value={`+${selectedCountry?.callingCode || '243'}`}
                    readOnly
                    aria-label="Country code"
                    disabled={disabled}
                />
                <input
                    className="mobile-money-number-input"
                    type="tel"
                    inputMode="numeric"
                    value={localPhone}
                    placeholder="997371767"
                    onChange={(event) => onChangeDigits(phoneDigits(event.currentTarget.value).slice(0, 15))}
                    disabled={disabled}
                />
            </div>
        </div>
    );
}

function MobileMoneyPromptModal({ number, hint, onClose }) {
    const target = hint || formatPhone(number) || 'your phone';
    return (
        <div className="payment-action-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="payment-action-modal" onClick={(event) => event.stopPropagation()}>
                <div className="payment-action-header">
                    <h3>Confirm on your phone</h3>
                    <button type="button" className="payment-action-close" onClick={onClose}>Close</button>
                </div>
                <p className="payment-action-copy">
                    We sent a Mobile Money payment request to <strong>{target}</strong>. Approve it on your phone to complete the order.
                </p>
            </div>
        </div>
    );
}

function PaymentSuccessModal({ reference, total, onReceipt, onClose }) {
    return (
        <div className="payment-action-backdrop payment-success-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="payment-action-modal payment-success-modal" onClick={(event) => event.stopPropagation()}>
                <div className="payment-success-graffiti" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                </div>
                <div className="payment-action-header payment-success-header">
                    <span className="payment-success-kicker">Order confirmed</span>
                    <button type="button" className="payment-action-close" onClick={onClose}>Close</button>
                </div>
                <div className="payment-success-mark-wrap">
                    <div className="payment-success-ring" aria-hidden="true" />
                    <div className="payment-success-mark" aria-hidden="true">✓</div>
                </div>
                <h3 className="payment-success-title">Payment received</h3>
                <p className="payment-action-copy payment-success-copy">
                    Your payment is confirmed and the merchant has been notified.
                </p>
                <div className="payment-success-receipt">
                    {total && (
                        <div>
                            <span>Total paid</span>
                            <strong>{total}</strong>
                        </div>
                    )}
                    {reference && (
                        <div>
                            <span>Order</span>
                            <strong>{reference}</strong>
                        </div>
                    )}
                </div>
                <button type="button" className="payment-success-done" onClick={onClose}>Done</button>
                <button type="button" className="payment-success-receipt-button" onClick={onReceipt}>Reçu</button>
            </div>
        </div>
    );
}

function CommerceReceiptModal({ receipt, onClose }) {
    const paidAt = receipt?.date ? new Date(receipt.date) : new Date();
    const paidAtLabel = Number.isNaN(paidAt.getTime()) ? '' : paidAt.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    const items = Array.isArray(receipt?.items) ? receipt.items : [];

    return (
        <div className="payment-action-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="commerce-receipt" onClick={(event) => event.stopPropagation()}>
                <div className="commerce-receipt-head">
                    <div className="brand-mark" aria-hidden="true" />
                    <span>REÇU</span>
                </div>
                <div className="commerce-receipt-store">
                    <strong>{receipt?.storeName || 'Fondeka Commerce'}</strong>
                    {paidAtLabel && <span>{paidAtLabel}</span>}
                </div>
                {receipt?.reference && <div className="commerce-receipt-reference">{receipt.reference}</div>}
                <div className="commerce-receipt-items">
                    {items.map(({ product, quantity }) => (
                        <div key={product?.id || product?.slug || product?.name}>
                            <span>{product?.name || 'Product'} × {quantity}</span>
                            <strong>{amount(number(product?.priceAmount) * number(quantity), product?.priceCurrency)}</strong>
                        </div>
                    ))}
                </div>
                <div className="commerce-receipt-total">
                    <span>Total</span>
                    <strong>{amount(receipt?.totalAmount, receipt?.totalCurrency)}</strong>
                </div>
                {receipt?.customerName && <InfoLine label="Client" value={receipt.customerName} />}
                {receipt?.paidVia && <InfoLine label="Paid via" value={receipt.paidVia} />}
                {receipt?.status && <div className="commerce-receipt-status">{receipt.status}</div>}
                <div className="commerce-receipt-footer">
                    <span>Powered by</span>
                    <strong>FONDEKA</strong>
                </div>
                <button type="button" className="payment-success-done" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}

function CryptoPaymentModal({ address, amount, networkName, invoiceUrl, expiresAt, hint, onClose }) {
    const qrValue = invoiceUrl || address;
    const qrSrc = qrValue
        ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(qrValue)}`
        : '';
    const expiryLabel = formatExpiry(expiresAt);

    return (
        <div className="payment-action-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="payment-action-modal payment-action-modal--crypto" onClick={(event) => event.stopPropagation()}>
                <div className="payment-action-header">
                    <h3>Send crypto payment</h3>
                    <button type="button" className="payment-action-close" onClick={onClose}>Close</button>
                </div>

                {hint && <div className="payment-action-hint">{hint}</div>}

                <div className="crypto-payment-content">
                    <div className="crypto-payment-qr">
                        {qrSrc ? <img src={qrSrc} alt="" /> : <span>QR unavailable</span>}
                    </div>

                    <div className="crypto-payment-details">
                        <ReviewSummaryLine label="Amount" value={amount || '-'} highlight />
                        <ReviewSummaryLine label="Network" value={networkName || '-'} />
                        {expiryLabel && <ReviewSummaryLine label="Expires" value={expiryLabel} />}
                        <div className="crypto-address-block">
                            <span>Address</span>
                            <code title={address}>{address || '-'}</code>
                        </div>
                        <button type="button" className="payment-action-copy-button" onClick={() => copyToClipboard(address)}>
                            Copy address
                        </button>
                        {invoiceUrl && (
                            <a className="payment-action-copy-button payment-action-link-button" href={invoiceUrl} target="_blank" rel="noreferrer">
                                Open invoice
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function PaymentReviewSheet({ quote, method, network, account, busy, onClose, onConfirm }) {
    if (!quote) return null;
    const netAmount = quote.netAmount ?? quote.billingAmount ?? quote.itemSubtotalAmount;
    const netCurrency = quote.netAmountCurrency || quote.billingCurrency || quote.itemSubtotalCurrency || quote.totalCurrency;
    const fees = quote.feeAmount ?? quote.fees;
    const feeCurrency = quote.feeCurrency || quote.feesCurrency || quote.totalCurrency;
    const total = quote.grossAmount ?? quote.totalToPay ?? quote.totalAmount ?? quote.paymentAmount ?? netAmount;
    const totalCurrency = quote.grossAmountCurrency || quote.totalToPayCurrency || quote.totalCurrency || quote.paymentCurrency || netCurrency;
    const railAmount = quote.paymentAmount;
    const railCurrency = quote.paymentCurrency;
    const showRailAmount = railAmount != null
        && railCurrency
        && String(railCurrency).toUpperCase() !== String(totalCurrency || '').toUpperCase();

    return (
        <div className="payment-review-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="payment-review-sheet" onClick={(event) => event.stopPropagation()}>
                <div className="payment-review-handle" aria-hidden="true" />
                <div className="payment-review-sheet-header">
                    <h3>Review payment</h3>
                    <button type="button" className="payment-review-close" onClick={onClose}>Close</button>
                </div>

                <div className="payment-review-summary">
                    <ReviewSummaryLine label="Checkout amount" value={amount(netAmount, netCurrency)} />
                    <ReviewSummaryLine label="Fees" value={fees != null ? amount(fees, feeCurrency) : '-'} />
                    <ReviewSummaryLine label="Total to pay" value={amount(total, totalCurrency)} highlight />
                    {showRailAmount && (
                        <ReviewSummaryLine label="Rail amount" value={amount(railAmount, railCurrency)} highlight />
                    )}
                    {method && <ReviewSummaryLine label="Method" value={method.name} />}
                    {network && <ReviewSummaryLine label="Network" value={network.displayName || network.name} />}
                    {account && <ReviewSummaryLine label="Account" value={account} />}
                </div>

                <div className="payment-review-actions">
                    <button type="button" className="payment-review-action payment-review-action--secondary" onClick={onClose}>
                        Back
                    </button>
                    <button
                        type="button"
                        className="payment-review-action payment-review-action--primary"
                        onClick={onConfirm}
                        disabled={busy}
                    >
                        {busy ? 'Submitting...' : 'Confirm payment'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ReviewSummaryLine({ label, value, highlight = false }) {
    return (
        <div className={`review-summary-line${highlight ? ' review-summary-line--highlight' : ''}`}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function CryptoNetworkSelector({ networks, loading, error, selectedNetworkId, onSelect, disabled }) {
    return (
        <div className="crypto-network-panel">
            <div className="crypto-network-label">Network</div>
            {loading && <div className="payment-method-status">Loading crypto networks...</div>}
            {error && <div className="payment-method-status payment-method-status--error">{error.message}</div>}
            {!loading && !error && networks?.length ? (
                <div className="crypto-network-pills">
                    {networks.map((network) => {
                        const active = network.id === selectedNetworkId;
                        return (
                            <button
                                key={network.id}
                                type="button"
                                className={`crypto-network-pill${active ? ' crypto-network-pill--active' : ''}`}
                                onClick={() => onSelect(network.id)}
                                disabled={disabled}
                                aria-pressed={active}
                            >
                                <span className="crypto-network-dot" aria-hidden="true" />
                                <span className="crypto-network-pill-label">{network.displayName || network.name}</span>
                            </button>
                        );
                    })}
                </div>
            ) : null}
            {!loading && !error && !networks?.length && (
                <div className="payment-method-status">No crypto networks are available for this method.</div>
            )}
        </div>
    );
}

function CountryPickerModal({ open, countries, query, selectedCode, onQueryChange, onClose, onSelect }) {
    if (!open) return null;

    return (
        <div className="country-sheet-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="country-sheet" onClick={(event) => event.stopPropagation()}>
                <div className="country-sheet-handle" aria-hidden="true" />
                <div className="country-sheet-header">
                    <h3>Choose country</h3>
                    <button type="button" className="country-sheet-close" onClick={onClose}>Close</button>
                </div>
                <div className="country-search-wrap">
                    <input
                        className="country-search-input"
                        value={query}
                        onChange={(event) => onQueryChange(event.currentTarget.value)}
                        placeholder="Search country"
                    />
                </div>
                <div className="country-list">
                    {countries.map((country) => {
                        const selected = country.code === selectedCode;
                        return (
                            <button
                                type="button"
                                key={country.code}
                                className={`country-row${selected ? ' country-row--selected' : ''}`}
                                onClick={() => onSelect(country)}
                            >
                                <span className="country-row-flag" aria-hidden="true">{country.flag}</span>
                                <span className="country-row-main">
                                    <span className="country-row-name">{country.name}</span>
                                    <span className="country-row-meta">{country.code} · +{country.callingCode}</span>
                                </span>
                                <span className="country-row-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                            </button>
                        );
                    })}
                    {!countries.length && (
                        <div className="country-empty-state">No countries found.</div>
                    )}
                </div>
            </div>
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

function ProductImageGallery({ product, index = 0, onIndexChange, onClose }) {
    const images = productImages(product);
    if (!images.length) return null;

    const safeIndex = Math.min(Math.max(0, number(index)), images.length - 1);
    const currentImage = images[safeIndex];
    const hasMany = images.length > 1;
    const goTo = (nextIndex) => {
        const wrapped = (nextIndex + images.length) % images.length;
        onIndexChange(wrapped);
    };

    return (
        <div className="image-gallery-backdrop" role="dialog" aria-modal="true" aria-label={`${product.name} images`} onClick={onClose}>
            <section className="image-gallery" onClick={(event) => event.stopPropagation()}>
                <div className="image-gallery-header">
                    <div>
                        <strong>{product.name}</strong>
                        {hasMany && <span>{safeIndex + 1} / {images.length}</span>}
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close image gallery">x</button>
                </div>

                <div className="image-gallery-stage">
                    {hasMany && (
                        <button type="button" className="image-gallery-nav image-gallery-nav--prev" onClick={() => goTo(safeIndex - 1)} aria-label="Previous image">
                            ‹
                        </button>
                    )}
                    <img src={currentImage} alt={product.name || ''} />
                    {hasMany && (
                        <button type="button" className="image-gallery-nav image-gallery-nav--next" onClick={() => goTo(safeIndex + 1)} aria-label="Next image">
                            ›
                        </button>
                    )}
                </div>

                {hasMany && (
                    <div className="image-gallery-thumbs" aria-label="Choose image">
                        {images.map((image, thumbIndex) => (
                            <button
                                type="button"
                                key={image}
                                className={thumbIndex === safeIndex ? 'image-gallery-thumb--active' : ''}
                                onClick={() => goTo(thumbIndex)}
                                aria-label={`Show image ${thumbIndex + 1}`}
                                aria-pressed={thumbIndex === safeIndex}
                            >
                                <img src={image} alt="" />
                            </button>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function ProductDialog({ product, quantity, onClose, onOpenGallery, onIncrement, onDecrement }) {
    const out = inventoryLabel(product) === 'Out of stock';
    const images = productImages(product);
    const image = images[0];
    return (
        <div className="dialog-backdrop" onClick={onClose} role="presentation">
            <section className="dialog" role="dialog" aria-modal="true" aria-label={product.name} onClick={(event) => event.stopPropagation()}>
                <button className="dialog-close" onClick={onClose} aria-label="Close">x</button>
                <button
                    type="button"
                    className="dialog-preview dialog-preview--button"
                    onClick={() => image && onOpenGallery?.(0)}
                    disabled={!image}
                    aria-label={image ? `Zoom ${product.name}` : product.name}
                >
                    {image ? <img src={image} alt="" /> : initials(product.name)}
                    {images.length > 1 && <span className="product-image-count">{images.length} photos</span>}
                </button>
                {images.length > 1 && (
                    <div className="dialog-gallery-strip" aria-label="Product images">
                        {images.map((item, index) => (
                            <button
                                type="button"
                                key={item}
                                onClick={() => onOpenGallery?.(index)}
                                aria-label={`View image ${index + 1} of ${images.length}`}
                            >
                                <img src={item} alt="" />
                            </button>
                        ))}
                    </div>
                )}
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
