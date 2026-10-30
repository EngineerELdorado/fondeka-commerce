# Public checkout delivery addresses

Implemented for the public Commerce storefront on 2026-10-29 using the existing checkout contract.

## Buyer experience

- Carts containing a `PHYSICAL` product get a delivery-address step between buyer contact and payment. This includes mixed carts and older physical products without shipping metadata. Digital, training and service-only carts retain their existing steps.
- Delivery country is prefilled from a valid request location header when available, with an explicit browser region as the fallback. A saved address takes precedence, and the buyer can always choose a different country. Without a usable hint, the country remains unselected. Language alone, the default payment country, payer phone, currency and store country do not select or rewrite the destination. Detection initializes the address once and never overwrites later edits.
- Country, town and full address are required. Region, postal code and delivery instructions are optional. Names, Unicode text and multiline addresses stay plain text.
- Country, province/region and town use searchable location pickers backed by the existing public reference endpoints. Selecting a country opens province/region choices; selecting an area opens its next level or the town picker. Selected locations use the existing green accent and a checkmark. Area names/types and depth vary by country. The provider attribution footer is hidden in the delivery form.
- Search text only filters choices; it is not copied into the delivery address. Town search uses the reference endpoint and retains pagination. Country and area search filter the loaded choices, ignoring accents.
- **Not listed? Enter manually** is the secondary action inside area and town pickers. Missing/empty reference data or request failures automatically show editable fields. Countries retain the bundled ISO list when the endpoint fails. Saved human-readable values remain visible when editing even though reference IDs are not stored.
- Changing country clears region/town; changing region clears town. Only the selected human-readable text enters the address snapshot. Reference IDs stay in picker memory.

## Remember, change and forget

The address step offers **Save this address on this device**, initially selected. Continuing from a valid address saves the normalized address in this browser's local storage under `fondeka-commerce-delivery-address`.

On a later visit, a saved address appears as a compact summary with **Change address** and **Forget saved address**. Change opens prefilled fields. Forget removes the browser copy and turns saving off while retaining the active purchase's editable address. Unchecking the save choice also removes the saved copy. A buyer can select saving again for a subsequent address.

Only these address fields are stored: `countryCode`, `region`, `town`, `fullAddress`, `postalCode`, `deliveryInstructions`. Partial/invalid values, `countryName`, catalog IDs, buyer/payment details, tokens and private access URLs are excluded. Save/removal failures do not prevent checkout; the buyer gets a nonblocking message and failed deletion is not reported as a successful forget. Edited drafts are not labeled saved until they match the saved copy.

The saved address is local to this browser/device. It is not an account-profile update or a synchronized address book. It is not stored in history, URLs or analytics.

## Checkout and order snapshots

The existing `POST /public/commerce/checkouts` request includes `deliveryAddress` for physical carts. Amounts, currencies, payment methods, fee quotes and payment-start payloads retain their existing behavior. The backend remains responsible for all financial calculations; no shipping fee is added by the client.

The UI honors a positive backend `deliveryAddressRequired` flag as well as the physical-product fallback. If checkout creation reports a required/missing address, the buyer returns to address entry before order/payment creation continues. Editing an address invalidates the local unstarted checkout/order and quote snapshot; the next explicit review captures the edited address. Navigating Back without edits does not create a new checkout/order.

Once payment has been attempted, contact/address edits are locked and existing order recovery remains authoritative, including uncertain network outcomes. Local storage edits never modify a previously created order snapshot.

The payment-method step shows payment controls only: payment country, available methods, any payer/network details and payment actions. Buyer-contact and delivery-address summaries are absent from this step; Back returns to the preceding details step. Address-save messages remain on address entry and final review. Final payment review and the full buyer order/success view display the complete address, alongside buyer contact. Order/success views use the returned backend snapshot and localized `countryName`. The synthesized receipt does not receive an address copy. Merchant/staff/admin screens are outside this public-site repository.

The payment heading uses the same structure and styling as other checkout steps: icon, title below it, then helper text, with the shared responsive rules. A missing Mobile Money payment number reopens its method group, scrolls to the number input and focuses it. Its validation message appears beside the field with `aria-invalid` and `aria-describedby`; typing clears it. Repeated validation attempts focus the field again. Buyer contact remains separate from the payment number.

## Entry points

- `app/delivery-address.js`, `app/delivery-address.css`: saved/editable address views, reference suggestions, localized validation and read-only summaries.
- `lib/commerce-delivery.mjs`: address allowlist, ISO country validation, required fields/lengths, physical-cart detection and safe storage operations.
- `app/s/[slug]/storefront.js`: address state, conditional checkout step, snapshot invalidation, checkout payload and order display.
- `app/commerce-ui.js`: dynamic payment/review history indices; four steps for nonphysical purchases, five for physical purchases.

No migration, backend deployment, account lookup, carrier integration or provider operation is performed by this frontend implementation. The backend delivery-address migration and endpoints must be deployed for server-side snapshots and suggestions.

## Verification

All 56 automated checks and the isolated production build passed. All 44 synthetic browser cases passed in English/French at 390px and 1440px, covering manual entry during reference failures, country/area/town suggestions, mixed/legacy physical carts, saved-address reload/edit/forget, unsaved drafts, blocked storage/removal, snapshot replacement, backend-required address recovery and nonphysical checkout. A shortened mobile viewport was visually reviewed; address text, checkbox controls and action buttons remained reachable. Tests used synthetic contacts/addresses and mocked payment/provider responses.

The machine's automatic local socket allocation was exhausted during browser verification. The test harness fetched local frontend resources over explicit source ports; it did not change system network settings or send address/payment data to external services. Live backend deployment and production address/catalog behavior require separate environment verification.

Location-picker follow-up: the 56 existing automated checks, isolated production build and 24 synthetic browser cases passed. Browser checks covered selection, hierarchical areas, pagination/deduplication, search without address mutation, manual fallback and switching back, country changes, saved text values, locked controls, validation, unavailable/empty references, keyboard navigation, and French/English layouts at 390px and 1440px. Full checkout checks at both widths verified that Escape closes the picker before the checkout, saving retains text without catalog IDs, and a valid address advances to payment selection. Reference calls were mocked; live catalog coverage was not verified by these checks.

Country autofill follow-up: 58 automated checks, the isolated production build and seven synthetic browser cases passed. Browser checks verified request-header priority, browser-region fallback, rejection of invalid country hints, no country inferred from language alone, saved-address priority, manual overrides surviving checkout reopen, and country detection on store and direct-product entry points. Location hints and reference responses were synthetic; live proxy header configuration was not verified.
