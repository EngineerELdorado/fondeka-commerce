# Mobile handoff: WhatsApp delivery in authenticated Commerce checkout

Source review: 2026-10-28. This describes the implementation in `fondeka-commerce` and the changes to adapt it to `fondeka-expo`. It does not implement or enable the mobile feature.

## Mental model

**The app collects the buyer's contact and delivery choice when creating checkout. The backend sends the purchase instructions after eligible payment.**

WhatsApp is an additional delivery channel. It is not a payment method, a new authentication step, a marketing subscription or a client-side message-sending action. Keep the existing authenticated checkout, payment widget, quotes, idempotency and order polling.

The storefront implementation is in commit `6a206c5`; see [implementation and rollout notes](commerce-buyer-whatsapp-delivery.md).

## Buyer experience to share

Place a visible checkbox immediately below the buyer's contact phone, using the app's existing controls and theme:

- EN: **Send my order instructions and access links by WhatsApp from Fondeka.**
- FR: **Recevoir les instructions et les liens d’accès de ma commande sur WhatsApp, par Fondeka.**

Explain nearby that this is for the current order, not marketing, and that the number must include its country calling code. Show the buyer's contact and delivery choice again in the final review. Keep the checkbox and helper reachable above the keyboard and bottom-sheet actions; support screen-reader checked state and a touch target of at least 44px.

The latest requested behavior is **checked by default**, with explicit opt-out preserved:

```js
const initialChoice = saved?.whatsappDeliveryOptIn ?? true;
// Bind the checkbox to boolean state. Do not use `savedValue || true`.
const submittedChoice = whatsappDeliveryEnabled && whatsappDeliveryOptIn === true;
```

Keep the current boolean through validation, Back/Continue, payment-method changes, network errors and retries. Changing a payer number must not reset this choice. If saving drafts, scope them to the authenticated account and preserve saved false; clear them on account change. Do not persist payer details, order tokens or private access URLs with this preference.

An account phone can prefill the contact field, but display the actual destination and let the buyer confirm or edit it. A profile phone, verified phone or signed-in session does not replace displaying the delivery choice. Email is optional; do not require an email solely for WhatsApp delivery. Preserve the app's other checkout requirements. If no usable WhatsApp number exists, explain that delivery needs one and allow the buyer to decline and continue the existing purchase flow.

## Authenticated requests

Use the existing `api` client and helpers in `src/services/apiCall.js`:

| Operation | Existing endpoint/helper |
| --- | --- |
| Checkout preview, if needed before confirmation | `POST /customer-api/commerce/checkouts/quote` (add a thin helper if needed) |
| Create final checkout | `POST /customer-api/commerce/checkouts` / `createCommerceCheckout` |
| Create its order | `POST /customer-api/commerce/checkouts/{checkoutId}/orders` / `createCommerceCheckoutOrder` |
| Start payment | `POST /customer-api/commerce/orders/{reference}/payments/start` / `startCommerceOrderPayment` |
| Poll order | `GET /customer-api/commerce/orders/{reference}` / `fetchCommerceOrder` |

Extend the current authenticated checkout payload, preserving its items, amounts/currencies and **`MARKETPLACE`** channel. Example only; retain all other fields used by the actual flow:

```js
await createCommerceCheckout({
  ...existingCheckoutPayload,
  channel: 'MARKETPLACE',
  buyerName: buyer.name.trim(),
  buyerEmail: buyer.email.trim(), // Empty is supported; email is optional.
  buyerPhone: buyer.phone.trim(), // Buyer-confirmed international contact.
  whatsappDeliveryOptIn: whatsappDeliveryEnabled
    && buyer.whatsappDeliveryOptIn === true,
});
```

Always send the boolean, including **false after opt-out or when rollout is disabled**. Do not put it only in the payment-start payload: checkout/order creation snapshots the choice. The backend owns its timestamp and source; do not send a fabricated consent timestamp or change the channel to `STOREFRONT`.

The existing authenticated client in `src/services/axios.js` already attaches the access token, `X-Device-Id`, `X-Device-Session`, platform/country headers and `Accept-Language`. Reuse it. Keep existing session/device/biometric handling and any existing order access-token parameters. No public-client substitution or additional sign-in is needed.

The payment transaction's saved locale determines the template language. Verify the shared client sends the selected app language on payment start, including retries. English and French are supported; the backend falls back to English for other languages. The storefront sends its interface language explicitly; the app already has shared locale forwarding.

## Buyer phone and payer phone are different

Keep these as separate state values and payload destinations:

| Value | Purpose |
| --- | --- |
| `buyerPhone` | Contact/WhatsApp delivery destination captured in checkout |
| Payment widget's `paymentMethod.accountRef` / `msisdn` | Mobile Money payment account, retained in the existing payment request |
| Payment-method country | Discover payment methods; it must not rewrite buyer contact |

For example, buyer contact `+12025550100` stays unchanged when a payer uses `+243812345678`. Do not substitute the merchant's phone, store country, wallet currency or payer number. Preserve an explicitly entered `+` or `00` international prefix; use the buyer-selected calling code for local input. An ambiguous legacy local number is not enough for delivery.

Current backend source prefers an explicitly supplied buyer phone and can otherwise fall back to the authenticated account's contact phone for non-POS checkout. It does not use the payment widget's payer number. Send the displayed contact explicitly so the buyer knows the destination. Name/email are mapped from the request; do not assume the same account fallback exists for those fields.

## Exact mobile adaptation points and lifecycle

Both entry points currently call `createCommerceCheckout` on mount/open with only channel, items and payment currency:

- `src/screens/CommerceScreen/MarketplaceCheckoutScreen.js`: `loadCheckout`, `payCheckout`.
- `src/screens/CommerceScreen/components/MarketplaceCheckoutSheet.js`: `loadCheckout`, `payCheckout`, `paymentCheckout`.

Apply the same buyer-contact/choice component and state rules to both. `apiCall.js` forwards the checkout payload unchanged, so it does not need a new field allowlist.

Do not simply add contact/choice fields to the current load-effect dependencies: that would POST a checkout on every edit. Collect/confirm the fields before final checkout creation. If initial server totals are needed earlier, the existing authenticated checkout quote endpoint can provide a preview; keep the payment widget's fee quotes separate and preserve its required interactions.

Before payment begins, editing contact or the WhatsApp choice invalidates the old checkout/order snapshot. Clear dependent quotes and the sheet's frozen `paymentCheckout` as well; create the replacement checkout/order on the next explicit confirmation. Both existing `payCheckout` functions reuse `order.reference`, so clearing only the visible checkbox or `checkout` would leave the old choice on the paid order.

Ordinary Back navigation, opening a step or changing only a payment method must not create another order. Prevent duplicate confirmation and preserve the existing payment-attempt idempotency key behavior. Once payment has been attempted, including an uncertain network outcome, retain the original order and reconcile it through the existing flow. The storefront locks contact/choice edits at this point; do not silently create another payable order to update delivery preferences.

## Delivery and private links stay backend-owned

Eligible paid orders with delivery content can receive one queued order notification; email continues independently. Do not send WhatsApp directly, enqueue messages from the app, poll for a message before reporting payment, or claim a message was delivered merely because payment succeeded. Provider retries do not change the payment outcome.

One job per order does not guarantee exactly one delivered message: existing at-least-once retries can duplicate a message after a provider-acceptance/process-crash boundary. Do not add a second client dispatch or promise exactly-once delivery.

The message contains the complete backend-generated delivery-page URL. Never manufacture it from an order reference/token, rewrite its host or shorten it. Treat any returned delivery/player/download URL containing purchase proof as private: exclude it from analytics, console logs, crash breadcrumbs, support exports and persisted navigation/drafts. Opening the delivery page does not require account registration. Existing file/training checks still control content access; refunded or otherwise ineligible purchases stay locked.

Do not add an app delivery-page route or a new payment action for this feature. If adapting POS separately, its existing order request accepts the same flag for Fondeka-paid orders; cash POS fulfillment notifications remain out of scope. A merchant's session is not the buyer's WhatsApp destination.

## Version and rollout checks

- The storefront uses `NEXT_PUBLIC_COMMERCE_WHATSAPP_DELIVERY_ENABLED`, default false. The app should use its existing feature/environment configuration for the equivalent guard. Hidden/disabled UI must send false even if a saved preference is true. This is separate from the feature's checked default when visible.
- Enable live opt-in only after backend/migration deployment and approval of both `fondeka_commerce_order_delivery` template variants in the configured Meta account. Recheck approval; this handoff does not verify the live provider or send messages. Do not copy production template IDs into another environment or resubmit templates just for a missing local catalog ID.
- **Backend source difference:** the earlier integration brief described omitted/null consent as false; the currently reviewed `CommerceCheckoutRequest.java` instead initializes it to true and skips null setters. The app must not depend on either default: submit the current boolean explicitly. Reconcile old-client compatibility with the backend team before broader rollout; this handoff changes neither backend behavior nor existing orders.
- **Training routing is separate:** the agreed Commerce training purchase flow opens the public product page. The currently reviewed Expo product/store code can also open `MarketplaceCheckoutSheet` for training; record that existing mismatch for its own routing follow-up. Adding WhatsApp to authenticated checkout is not a request to change that boundary or the returned training-player URL behavior.

## Acceptance checks for the app

1. Cover both full-screen and bottom-sheet checkout, English/French, small phones, large text and keyboard-open scrolling.
2. A new visible choice is checked. Saved false stays false; missing saved choice defaults true. Toggle via the label and accessible checkbox.
3. Capture request bodies: checked sends true, unchecked sends false, disabled rollout sends false. Preserve items, currency and `MARKETPLACE`; no mutation on each toggle/step.
4. Buyer US contact and a different CD payer remain separate through country/method changes, review, retries and order creation. A phone-only buyer can complete the supported flow.
5. After a first checkout/order quote, edit true to false and confirm again: payment uses the replacement order carrying false. Back without an edit reuses the existing snapshot. An attempted/uncertain payment retains its original order and idempotency/recovery behavior.
6. Existing authenticated headers and selected locale reach checkout/order/payment calls; drafts never cross accounts and contain no payment/access credentials.
7. Pending/failed/cancelled/refunded/disputed/partial payments do not imply delivery or content access. Use controlled backend/provider fixtures; no real buyer messages are needed for frontend checks.

Storefront reference validation: 33 automated checks, 32 synthetic browser cases and isolated production build passed. These are web results, not mobile tests or evidence of live delivery readiness.
