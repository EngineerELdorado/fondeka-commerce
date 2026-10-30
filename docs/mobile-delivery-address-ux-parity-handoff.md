# Client app delivery address UX parity

Apply the current Commerce delivery-address experience to `fondeka-expo` in both the checkout screen and checkout sheet. The interaction should match the web: **choose from location suggestions first, with manual typing available when a location is missing**. Country autofill, selected states, wording and recovery behavior are part of the same change.

The current web source is the reference. Read [the delivery component](../app/delivery-address.js), [its styles](../app/delivery-address.css), [country suggestion and validation helpers](../lib/commerce-delivery.mjs), and [checkout integration](../app/s/[slug]/storefront.js). The [delivery implementation notes](commerce-delivery-address.md) cover the wider checkout lifecycle.

## Client adaptation points

Paths below are relative to the sibling `fondeka-expo` repository.

| File | Required adaptation |
| --- | --- |
| `src/screens/CommerceScreen/components/CommerceDeliveryAddress.js` | Replace the province/town text-first form and eight-chip suggestions with a shared searchable location picker and explicit manual mode. Add hierarchy, pagination and selected states. |
| `src/screens/CommerceScreen/MarketplaceCheckoutScreen.js` | Use the shared behavior in full-screen checkout; preserve address snapshot invalidation and payment locks. |
| `src/screens/CommerceScreen/components/MarketplaceCheckoutSheet.js` | Use the same behavior with native sheet inputs, keyboard handling and scrolling. |
| `src/services/apiCall.js` | Reuse the existing delivery country, region and town helpers, including their `parentId`, `regionId`, `query`, `page` and `size` arguments. |
| `src/services/commerceDeliveryAddressStorage.js` | Keep saved addresses scoped to the signed-in account. Store address text; catalog IDs remain temporary picker state. |
| `src/utils/deviceCountry.js` | Reuse `getDeviceCountry()` as the native country hint. Validate the returned country against supported ISO codes. |
| `src/assets/data/locales/en.json`, `src/assets/data/locales/fr.json` | Match the web labels and fallback wording below. |

The current native implementation waits for town text before fetching towns, truncates suggestions to eight chips, always exposes region/town text inputs, defaults the country from account data or `CD`, and renders attribution. Those behaviors need updating for parity.

## Picker interaction

1. Show country, province/region and town as selectable controls. Province/region is optional; country and town are required. Without a country, disable the province and town pickers and show “Choose a country first.”
2. Opening a picker shows a search field and selectable results. Country and province search filter the loaded data, ignoring accents and case. Keep search text separate from committed address text: typing in search never sets `region` or `town`.
3. Fetch the first town page as soon as a country is available, even with an empty search. Filter by the selected region ID when present. Debounce town search by 250 ms, request 20 towns per page, expose “Show more towns,” and deduplicate appended results by ID. Do not truncate the complete result set to eight chips.
4. A user choosing a different country clears region, region IDs and town, then opens province choices. Selecting the same country closes the picker without resetting the address.
5. Choosing a province fetches its children using `parentId`. If children exist, show the next optional “More specific area” picker. Continue for the available hierarchy. At a leaf, open town choices. Save the deepest selected name as the address region; retain its ID only for reference lookups.
6. A region selection or manual region edit clears town and its search/pagination. Changing an ancestor discards its former child selections. Cancel or ignore stale requests so older responses cannot replace choices for the current country or region.
7. Choosing a town commits its name and closes its picker. Selected values stay visible when reopening, including saved text that has no matching catalog ID. Allow clearing an optional region selection.

Country autofill initially leaves the pickers closed. Focus the active picker search when the buyer opens it or advances through an explicit selection. Closing a picker with Back, Escape or dismiss should close that picker first and preserve the checkout and current address.

## Manual entry and unavailable data

Inside province and town pickers, provide **“Not listed? Enter manually”** as a secondary action below the results. It replaces that picker with a focused text field while preserving the committed value. **“Choose from the list”** returns to selection without deleting the address text. Editing a manual region must discard its old reference ID before town lookup.

Automatically show manual entry when the endpoint fails, reports `suggestionsAvailable: false`, or returns no options for the initial unfiltered lookup. A search with no matching results keeps search and the manual action available; it does not automatically commit the search text. If countries cannot load, keep the bundled valid ISO country list available.

Remove the visible provider attribution footer, including **“Suggestions de lieux : Countries States Cities Database · ODbL-1.0”**. The web no longer renders this line in either language.

## Country autofill and precedence

Use this order: existing buyer edits or a valid saved delivery address, then a valid location hint, then an explicit device-region fallback, otherwise no preselection. Apply detection only when initializing an empty address, never after a buyer edit. A late storage/hint result must not overwrite typing or selections. Hydrate saved addresses before exposing editable controls, or guard hydration against intervening edits.

Web uses request-country headers first, then an explicit browser locale region. Native can reuse `getDeviceCountry()` and any already available server location hint. Its existing Android handling deliberately avoids some unreliable locale fallbacks; preserve that behavior. Do not invent an API for web request headers, request GPS permission for this, infer France from language `fr`, or silently use `CD` when no location is known.

Payment-method country, payer phone, merchant country, wallet currency and account-registration country must not rewrite the delivery destination. Keep existing authenticated account defaults for payment/contact separate from delivery autofill. Saved addresses remain isolated by account, and manual choices survive checkout close/reopen.

## Appearance and wording

Use one picker treatment for all three location fields. A selected location has a pale green surface, green text/border, a checkmark and a trailing chevron. An open picker changes the chevron direction and uses a clear active border. Results are readable rows with the place name and optional local area type on a second line. Put the fallback action beneath the result list, not above the primary choice.

The payment-method step shows **payment controls only**: payment country, available methods, any payer/network details and payment actions. Omit both buyer-contact and delivery-address sections from this step, including collapsed address rows. Keep the buyer/address state and validation intact. Back returns to the preceding details step, and final review continues showing the complete buyer and delivery information with existing edit actions. Address-save messages belong to address entry and final review. Order/receipt views retain their address display.

Use the same heading structure and styling as other checkout steps: icon, title below it, then helper text, following the app's shared responsive behavior. When the Mobile Money payment number is missing, reopen the selected Mobile Money section, scroll to its input and focus it so the buyer can type. Show the validation message beside that field, clear it on typing, and support repeated attempts after the section has been collapsed again. Keep buyer contact separate; entering a payer number must not rewrite the saved contact. Preserve focus and visibility when the keyboard reduces the available viewport.

Web reference values are a 56px picker trigger, at least 48px result rows, 13–14px corners, 12–14px inner padding and 18–20px between field groups. Its selected palette uses `#E5F4EC`, `#267C55` and `#1B6444`; neutral borders use `#DCE4EF`. Adapt through the app's existing theme and native primitives while preserving these visual roles, legible input text and comfortable touch targets. Keep search, manual actions and checkout Continue reachable with the keyboard open and large text enabled.

| Purpose | English | French |
| --- | --- | --- |
| Country label | Delivery country | Pays de livraison |
| Province label | Province or region | **Province ou region** |
| Town label | Town or city | Ville |
| Manual fallback | Not listed? Enter manually | Pas dans la liste ? Saisir manuellement |
| Return to suggestions | Choose from the list | Choisir dans la liste |
| Child area | More specific area | Zone plus précise |
| Pagination | Show more towns | Voir plus de villes |
| Search placeholder | Search… | Rechercher… |
| Empty search | No matching places. | Aucun lieu correspondant. |
| Unavailable data | Suggestions are unavailable. Enter this place manually. | Suggestions indisponibles. Saisissez ce lieu manuellement. |

Keep the requested French province label exactly as shown. Use the web `COPY` object for remaining field labels, optional markers, search accessibility labels and validation text.

## Address and checkout lifecycle

Keep country, town and full address required. Region, postal code and instructions remain optional, with limits of 160, 32 and 500 characters respectively; town is limited to 160 and full address to 1000. Preserve Unicode and multiline addresses. Validate real ISO country membership rather than accepting any two letters.

Only address input fields enter the checkout payload: `countryCode`, `region`, `town`, `fullAddress`, `postalCode`, `deliveryInstructions`. Do not serialize search terms, catalog IDs or detection metadata. Restore saved text without requiring a catalog match. Provide the existing saved-address review, change, save-choice and forget behavior through the app's account-scoped storage.

Do not POST a checkout/order on picker open, every keystroke or ordinary Back navigation. Before a payment attempt, editing the address invalidates the unstarted checkout/order and its quote snapshot; the next explicit confirmation captures the edited address. After payment has been attempted, retain the original order, existing edit locks and recovery behavior. Preserve the native authenticated checkout, `MARKETPLACE` channel, financial calculations and payment flow. See the [authenticated mobile handoff](mobile-authenticated-whatsapp-delivery-handoff.md) for shared lifecycle details.

## Acceptance checks

- Both full-screen and sheet checkout show selectable data first, including towns before typing. Search never mutates the submitted address until a result is selected.
- Hierarchical regions, accent-insensitive search, town pagination, empty searches, stale responses, missing places and endpoint failure all leave a usable path forward.
- Country hints fill only an empty initial address; saved addresses and manual changes win. Unknown location leaves country unselected. Account changes do not expose another account's saved address.
- Selecting a new country or region clears dependent values; selecting the same country preserves them. Saved manual text survives editing and picker reopening without catalog IDs.
- Selected styling, exact French label, fallback wording and hidden attribution match web. Back dismisses the picker before checkout. Cover English/French, small phones, keyboard-open scrolling, large text and screen readers.
- Inspect checkout payloads and verify no catalog IDs/search text, no writes on typing, correct snapshot invalidation, and unchanged payment locks/retries.

Web reference validation passed 58 automated checks, an isolated production build, 24 picker/checkout browser cases and seven country-autofill cases using synthetic data. These are web checks; the client implementation needs its own native verification.
