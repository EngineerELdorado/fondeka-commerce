// Restore the visible form choice without turning an explicit opt-out back on.
export function savedBuyerContact(buyer) {
    return {
        name: String(buyer?.name || ''),
        email: String(buyer?.email || ''),
        phone: String(buyer?.phone || ''),
        whatsappDeliveryOptIn: typeof buyer?.whatsappDeliveryOptIn === 'boolean' ? buyer.whatsappDeliveryOptIn : true,
    };
}

export function checkoutBuyerFields(buyer, whatsappEnabled = false) {
    const contact = savedBuyerContact(buyer);
    return {
        buyerName: contact.name.trim(),
        buyerEmail: contact.email.trim(),
        buyerPhone: contact.phone.trim(),
        whatsappDeliveryOptIn: whatsappEnabled && (buyer?.whatsappDeliveryOptIn ?? true) === true,
    };
}

export function internationalPhoneInput(value, callingCode) {
    const text = String(value || '').trim();
    const digits = text.replace(/\D/g, '');
    if (!digits) return '';
    if (text.startsWith('+')) return `+${digits}`;
    if (text.startsWith('00')) return `+${digits.slice(2)}`;
    const code = String(callingCode || '').replace(/\D/g, '');
    return code ? `+${code}${digits}` : digits;
}
