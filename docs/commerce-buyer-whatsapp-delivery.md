# Commerce buyer WhatsApp delivery

Implemented in the public storefront on 2026-10-28. The backend owns message delivery and the private delivery page; this integration uses the existing checkout and payment flow.

## Buyer experience

- The buyer-contact step presents the English/French WhatsApp choice immediately below the phone field. It explains that the number must include a country calling code and that the choice concerns order delivery, not marketing.
- The visible choice starts checked. Saved form state defaults a missing choice to true and preserves an explicit false. Validation errors, Back/Continue, country selection and payment-method changes preserve the current choice.
- Email is optional. Name and contact phone retain their existing frontend requirements. Declining WhatsApp never blocks checkout.
- Contact and the boolean form preference use the existing buyer-details storage allowlist. Payer numbers, access tokens and private delivery URLs are excluded.
- Buyer contact country/number remain independent from payment country and the Mobile Money payer number. Explicit `+` or `00` international phone input retains its calling code; a local entry uses the buyer-selected calling code.
- Contact and delivery preference appear in the payment review. Editing them before payment discards the old local pending-order snapshot; the next review creates a checkout/order with the final choice. Contact is fixed once a payment-start attempt has been made, including an uncertain network outcome.

## Existing requests

`POST /public/commerce/checkouts` retains its items, currencies and `STOREFRONT` channel and always includes `whatsappDeliveryOptIn` as a JSON boolean. It sends the buyer contact number, never the separate Mobile Money payer number. Blank email remains supported by the backend.

Checkout creation, checkout-to-order creation and payment start send `Accept-Language: en` or `fr` from the interface. The existing payment-start request continues to use the separate payer phone as `accountNumber`/`paymentMethod.accountRef` for Mobile Money.

There is no new fulfillment request from the browser. Paid eligibility, notifications, retries, email independence and refund checks remain backend responsibilities. Clients do not create, rewrite, persist or log the backend's private delivery-page URL. The backend endpoint remains:

```http
GET /public/commerce/orders/{reference}/delivery?accessToken=...
```

No POS order-creation UI exists in this repository; no cash POS behavior changes here.

## Rollout

The build-time flag `NEXT_PUBLIC_COMMERCE_WHATSAPP_DELIVERY_ENABLED` defaults to false, as shown in `.env.example`. While disabled, the choice and its summary are hidden and checkout explicitly sends false, including when saved form state contains true.

After deploying the backend and migration and confirming approval of both `fondeka_commerce_order_delivery` language variants in the configured WhatsApp account, set the flag to `true` and rebuild/deploy Commerce. The choice then follows the checked-by-default behavior above. This implementation does not submit templates, associate catalog IDs or enable a provider.

## Verification

Use synthetic checkout/payment responses in an isolated build/server directory so no real payment or buyer message is sent. Verify English and French at desktop and approximately 390px, including a shortened mobile viewport, explicit opt-out, saved true/false/missing state, optional email, error recovery, payer/contact separation and contact edits after a first quote.

Validated on 2026-10-28: all 33 Node checks passed, the isolated production build passed, and all 32 synthetic browser cases passed in English/French at 390px and 1440px. Browser coverage includes 24 form/checkout cases, four post-quote preference/snapshot cases and four production-rollout-disabled cases. Screenshots were reviewed for desktop and shortened mobile viewport hierarchy and reachability. No real payment or buyer message was sent.

Local frontend checks do not establish live template approval, mail/WhatsApp delivery or deployed backend configuration.
