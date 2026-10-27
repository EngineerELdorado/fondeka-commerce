# Commerce UI patterns

The public store, product detail and checkout adopt the existing `fondeka-web` portal's visual direction. Commerce remains public, with no account sign-in or registration. The landing site and backend-hosted learner player retain their own presentation. Guest email verification and same-site recovery/player routing are separate pending work; see [the backend recovery handoff](commerce-training-sign-in-backend-handoff.md).

## Shared pieces

- `app/commerce-ui.css` scopes semantic light-theme tokens and controls to `.commerce-ui`. Commerce stays light regardless of the system preference, with the document also declaring a light color scheme for browser controls. The stylesheet is imported after the existing global styles; it does not reset unrelated landing-page components.
- `app/commerce-ui.js` provides consistent SVG icons, media fallbacks, step progress, loading skeletons, dialogs and local checkout-history handling. No font or icon download is required.
- Phone-code and payment-country selectors share a framed SVG chevron and complete country flags. Country results expose the selected state with a checkmark and `aria-pressed`; search, keyboard activation and focus return use the same country dialog.
- Dialogs render in a portal, trap keyboard focus, mark underlying layers inert, lock background scrolling, close on Escape when safe and return focus to the trigger. Stacked country/media/review dialogs share the same behavior. Reduced-motion preferences suppress decoration and transitions.
- Mobile checkout, payment review and country selection fill the visible viewport. Their headers and actions sit outside the content scroll region, so scrolling a field cannot move a footer over it. Visual-viewport resize/offset changes reveal the focused field inside that region, including when the keyboard opens after focus. Form keyboard Next moves to the next field; Done dismisses the keyboard and never initiates payment.
- `lib/commerce-ui-copy.js` contains the matching English/French presentation copy. Backend enums, IDs, provider names and returned media order remain unchanged.

## Checkout sequence

1. **Order:** product images, quantities and estimated subtotal.
2. **Your details:** the existing required name, email and phone. Validation appears after Continue and focuses the first invalid field.
3. **Payment:** existing country, provider and relevant mobile-money/crypto requirements. Method and network failures can retry the existing reads locally.
4. **Review:** the existing backend quote, explicit fees/total and final confirmation. Contact details can be edited before confirming. Payment errors remain inside review with the entered data intact.

Payment providers use a responsive tile grid inspired by `fondeka-pay`: centered logos/names, currency badges and visible radio selection. Typical phones fit three columns and narrower phones fit two; wider task panels fit more without stretching a single method across the entire row. Provider groups, inline phone/network inputs and backend order remain unchanged. Radio accessible names include the returned currency when present to distinguish variants of the same provider.

Currency badges retain `fondeka-expo`'s currency families in a warm, muted palette: USD sage, CDF dusty blue, EUR lavender, KES sand, GHS dusty rose, and a warm neutral fallback. Selection and hover preserve the currency color; the tile border/radio communicates selection separately.

Steps 1–3 are local presentation state. Opening review invokes the existing checkout/order/quote flow. Only the explicit confirmation invokes the existing payment-start operation. Navigation and restoring a review through browser history do not replay those requests. An expired/cleared quote is not recreated by history navigation.

History stores only an ephemeral flow ID, step and navigation depth. Buyer details, player links, tokens, quotes and payment credentials are not added to history or to a new persisted draft. Existing buyer-detail storage is unchanged. Submission locks prevent duplicate quote/payment requests; review cannot be dismissed through its controls or Escape while payment is being submitted.

## Product and training presentation

Desktop pairs media with the purchase area and keeps useful order context beside the checkout task. Mobile retains the same sequence with a compact purchase bar and scrollable task/dialog surfaces. Physical/digital/service quantities retain their existing behavior; training quantity remains one.

Product pages use a framed navigation header with a prominent localized title and product icon. Detail and checkout type labels retain their localized topic icons. Catalog cards omit the product type label to leave room for the image and purchase controls.

The storefront collection uses a masonry grid with image-only card surfaces. Product names, prices and cart controls sit at the bottom of the image. A short, lighter gradient and local text shadows support readability without spreading a nearly opaque panel over the photo. The caption has compact top spacing and no product type badge. The name leads the caption; the price and Add action share the next purchase row when space permits. A video action stays in the upper corner, clear of the caption.

Card proportions follow the first returned image within practical bounds; the image covers the complete card, with enough minimum height and content space for readable controls. Long names use at most three visible lines, retain their full accessible text/hover title and open the full product details. Missing/broken images use the existing fallback beneath the same overlay. Cart updates may grow a card, including translated training Add/Remove states. `app/product-masonry.js` measures card heights with native observers and repacks after image loading, cart changes and responsive resizing. One DOM list preserves backend and keyboard order; there are no column wrappers, dense reordering, new dependencies or API changes. The existing four/three/two/one-column breakpoints remain. Without observers, the collection falls back to a regular grid.

Store social links use inline SVG platform marks with muted brand-colored icons, warm tinted surfaces, fine borders and restrained depth. Instagram uses peach/rose, Facebook/LinkedIn dusty blue, YouTube terracotta, X/TikTok warm stone, and WhatsApp sage. Hover adds a subtle tint; saturated fills, loud gradients and multicolor icon shadows are avoided. Link destinations, labels and new-tab behavior are preserved; no social widgets, icon fonts or third-party asset requests are introduced.

The public syllabus preserves backend order and presents module sections with keyboard-operated disclosure controls. It renders titles and types only. Counts come from the returned public curriculum. The paid success action still waits for an eligible order and the exact backend `trainingPlayerUrl`; decorative payment confetti has been removed.

## Verification

Run `npm test` and `npm run build`. Use synthetic fixtures for browser verification; never capture a real learner URL in test output, screenshots, traces or recordings.

Cover approximately 390px mobile and 1440px desktop, English and French, and reduced motion. Verify that both system light and dark preferences keep the storefront, checkout and browser controls light. Check local field validation, focus containment/return, nested dialogs, keyboard tabs and browser Back/Forward through review. Confirm zero checkout/order/payment mutations on local steps, required network validation, quote/payment error recovery, duplicate submission protection, pending/null-link polling and refunded/disputed lockout. Verify non-training quantity controls and training quantity one in the final checkout payload.

For keyboard regressions, shrink and shift the visual viewport while a field already has focus, keeping the layout viewport unchanged. Do not refocus the field to make the test pass. Check every field, the last provider in a long list, country search/results, review rows and errors for clipping and overlapping controls. Include 320px phones and landscape; keyboard Next/Done must not submit a transaction.
