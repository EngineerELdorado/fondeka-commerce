# Backend handoff: cross-currency payments in public Commerce checkout

Status: audit and targeted integration/fix request. This document does not implement backend changes. Updated 2026-10-25.

## Intended buyer experience

A merchant can price a product in their own currency and receive orders from buyers in other countries. A buyer chooses an eligible payment method available in their country; the backend calculates the payable amount in that method's supported currency.

**A difference between product currency and payment currency must not, by itself, hide an otherwise supported payment method or prevent checkout.** Apply this consistently across supported countries and currencies. XAF-priced products bought from Congo are one example, not a special-case rule.

For example:

```text
Product price:        200 XAF
Buyer country:       CD
Eligible methods:    configured CD collection methods, including supported USD/CDF rails
Buyer selects:       an eligible CDF method
Review:              backend-calculated CDF amount, fees and total
Confirmation:        existing Commerce payment flow
```

Do not relabel 200 XAF as 200 CDF or calculate the conversion in the frontend. Existing provider availability, action restrictions, supported conversion routes and final quote validation still apply. This requirement does not create payment coverage where no supported provider or conversion route exists.

## Boundary: public Commerce collection only

Limit any discovery behavior change to this combination:

| Condition | Required value |
| --- | --- |
| Entry point | Public `GET /public/payment-methods`, through `findPublicPaymentMethodsForAction` |
| Effective transaction type | `COLLECTION`, including the existing default when `type` is omitted |
| Action | Exactly `COMMERCE_CHECKOUT_PAYMENT` |
| Country meaning | Buyer's selected payment country, resolved by the existing country rules |
| Source/request currency | Actual product or checkout source currency; any already supported currency |

Country and currency mismatches are supported Commerce scenarios. Do not hard-code CD, XAF, USD, CDF, provider names/IDs, a particular amount, or a requirement that two currency variants exist together.

Keep authenticated discovery, `PAY_REQUEST`, `REQUEST_PAYMENT`, payouts, deposits, withdrawals, savings and all other actions on their current behavior. Do not change shared country defaults, missing/invalid-country handling, provider configuration or global action rules as part of this work.

## Existing backend capabilities to reuse

The reviewed backend already contains currency-aware Commerce checkout and payment infrastructure:

| Component | Observed capability |
| --- | --- |
| `CommerceCheckoutService.calculate` | Keeps item/billing values and requested `paymentCurrency` distinct; converts the billing amount into the payment currency and records `PAYMENT_CONVERSION` FX snapshots. |
| `CommerceCheckoutService.convertPaymentAmount` | Uses the existing `CurrencyProductRateService` conversion and margin behavior. |
| `CommerceCheckoutService.validatePaymentCurrency` | Requires the selected payment method/request currency to agree with the order's payment currency. Preserve this validation. |
| `CommerceCheckoutServiceTest.quote_singleCurrencyCartCanStillConvertToRequestedPaymentCurrency` | Existing regression coverage for a product priced in one currency and payment requested in another. |
| `PaymentRouteResolutionService` | Contains existing source/product/provider/destination conversion-route validation. Reuse the established route policy where applicable; confirm how it is wired into this flow. |
| Public fee/quote services | Already accept source and payment/display currency information. Audit the existing Commerce mapping before changing it. |

These are source-code findings, not proof that every currency pair/provider is configured in the deployed environment. First audit and reuse the existing contract. If current backend functionality already supports the intended path, document the correct frontend integration instead of implementing duplicate conversion logic or new endpoints.

## Reproduction: a discovery gap

```http
GET /public/payment-methods?action=COMMERCE_CHECKOUT_PAYMENT&amount=200&currency=XAF&countryCode=CD
Accept: application/json
```

Live development API comparisons on 2026-10-25, with `countryCode=CD` and `amount=200`:

| Action | Source currency | Observed Mobile Money results |
| --- | --- | --- |
| `COMMERCE_CHECKOUT_PAYMENT` | `XAF` | None; response contains only crypto |
| `COMMERCE_CHECKOUT_PAYMENT` | `USD` | Airtel, M-Pesa and Orange variants in USD and CDF |
| `COMMERCE_CHECKOUT_PAYMENT` | `CDF` | Airtel, M-Pesa and Orange variants in CDF |
| `PAY_REQUEST` | `XAF` | Airtel, M-Pesa and Orange variants in USD and CDF |

In `PaymentMethodServiceBridge.resolveMobileMoneyCurrencyFilter`, the existing multi-currency Congo fallback is limited by `isPaymentRequestCollectionAction` to payment-request actions. Commerce does not enter that branch. A later fallback handles a single local Mobile Money currency, but does not solve the reproduced USD/CDF combination. The ordinary source-currency predicate then excludes those Mobile Money variants for XAF.

This explains the example; it does not justify adding another country/currency exception. Audit the public Commerce discovery path against the existing cross-currency checkout model.

The controller accepts `amount` but currently does not pass it to method discovery. Introducing a new global amount-filtering policy is outside this request.

## Targeted discovery correction, if needed

1. Identify the public Commerce collection call explicitly. Carry an internal context/overload through this path only, with existing callers retaining their defaults. `accountId == null` alone does not identify this path.
2. Start with the existing buyer-country and universal collection candidates, applying current availability and action rules.
3. For this public Commerce context, do not require a method's collection currency to equal the product/source currency when the existing backend supports that conversion and payment route. Reuse existing route/FX eligibility logic; do not introduce a second exchange-rate system.
4. Return each eligible method with its actual currency and existing ID/metadata. Preserve same-currency options and supported alternatives, including countries with one or multiple local payment currencies. Mobile Money is the reproduced gap; use the established Commerce capabilities for each rail rather than assuming every rail supports every conversion.
5. Keep existing resource conversion, ordering, localization, currency badges, active-provider checks and action include/exclude restrictions. Explicit exclusions still win. Do not introduce account-only balances into guest checkout.

Do not remove the shared currency predicate globally or change `isPaymentRequestCollectionAction` to make Commerce impersonate a payment request. Do not query another country's local providers to compensate for a currency mismatch. The buyer country and source currency remain separate inputs.

## Confirm the full existing checkout contract

Correct method discovery is one part of the flow. Verify these steps together with the storefront team:

1. Discover methods using the buyer's selected country and real source amount/currency.
2. Buyer selects a returned method/currency variant.
3. Create/quote the Commerce checkout with the actual selected payment currency through the existing `paymentCurrency` contract. Preserve product prices and backend billing/settlement accounting.
4. Obtain the existing authoritative fee/FX quote. Display its payable amount, payment currency, fees and total before confirmation.
5. Confirm using the same method/currency and the backend's matching order/quote values. Preserve order-currency validation, idempotency, callbacks and polling.

The reviewed storefront's `app/s/[slug]/storefront.js` currently has a `checkoutPayload` helper that chooses the cart currency for `paymentCurrency`. A later fee request uses the selected method's currency as `displayCurrency`. Confirm the required integration: a display-currency fee preview alone does not establish that an existing order was created in that payment currency. If a frontend adjustment is needed, use the existing backend contract; do not weaken `validatePaymentCurrency`, silently retry charges or create a replacement order during navigation.

When a buyer changes country or method, follow the existing quote invalidation and unpaid-order recovery rules. Keep the source price intact and obtain a matching quote before another explicit confirmation. Never convert amounts using a client-side guessed rate.

Retain existing handling for unavailable providers, unsupported routes, missing/expired rates and quotes, provider limits, failed/pending payments and refunds. Discovery or an HTTP success is not payment confirmation. Training access rules remain unchanged.

## Regression coverage

Test the public entry point and real filtering pipeline, then verify the existing quote/payment-currency contract with synthetic providers and rates. Do not test by making real charges.

| Scenario | Expected behavior |
| --- | --- |
| XAF product, CD buyer, supported USD and CDF methods | Eligible methods appear; each retains its actual currency; either supported variant can produce a matching quote. |
| Another source currency and buyer country, with a supported conversion | Same general behavior; no CD/XAF dependency. |
| Buyer country has only one supported collection currency | Supported cross-currency payment remains available. |
| Buyer country has multiple supported collection currencies | Supported choices remain available and distinguishable; no single-currency shortcut. |
| Source currency matches a payment method | Existing matching option is preserved, alongside other supported choices allowed by current policy. |
| Unsupported conversion/provider route | Existing availability/error policy is honored; no fabricated rate or method. |
| Disabled method/provider or explicit action exclusion | Remains unavailable. |
| Crypto and other already working Commerce methods | Existing behavior and response metadata are preserved. |
| Guest checkout | No sign-in, registration or account-only balances introduced. |
| Omitted `type`; valid, omitted and invalid country values | Existing default/type/country handling remains intact. |
| Authenticated discovery and other actions, including payment requests and payouts | Pre-change behavior and relevant response metadata remain unchanged. |
| Selected currency differs from product currency | Checkout/order payment currency, FX quote, payable amount and payment start agree; product/billing values retain their existing meaning. |
| Country/method changes, stale quote, retry or duplicate confirmation | Existing invalidation, idempotency and recovery rules remain intact. |

Relevant backend tests include `PaymentMethodServiceBridgeTest`, `PublicPaymentMethodControllerTest`, `CommerceCheckoutServiceTest` and the existing fee/route/payment-method tests. A controller test with a mocked bridge is insufficient to verify the filtering fix. Keep current payment-request and authenticated-checkout regressions intact; add a test proving that the new public Commerce context does not reach those paths.

## Backend handoff result

Return the confirmed existing discovery → checkout → quote → payment contract, identifying which currency each amount uses. Include representative synthetic requests/responses for a cross-country purchase and the applicable existing route/quote errors.

Implement only missing public Commerce discovery behavior or a demonstrated integration fix. Identify any required frontend adjustment separately. No new FX engine, global payment-policy change, production provider/configuration mutation or training-specific payment action is authorized by this handoff.
