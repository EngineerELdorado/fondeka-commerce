# Public Commerce training: buyer learning experience

Status: implemented in public Commerce. Updated 2026-10-25. This document retains the `fondeka-web` design and API adaptation reference. The public library, email-code recovery and inline player now live in this repository; see [implementation and deployment](public-learning.md).

## Product boundary

**The Business portal creates and manages trainings. Buyers access and complete their purchased trainings on public Commerce.** The Business sidebar/mobile learner entries and `/trainings` pages have been removed. Keep the owner’s product creation, curriculum editor, private uploads and author previews.

Public learning must work for a guest without account sign-in, registration, a customer JWT, Business Tools activation, an app installation or a redirect to `web.fondeka.com`. Email-code verification recovers a purchase on another device; it establishes limited learner access, not a Fondeka account session.

There are three distinct surfaces:

| Surface | Content and purpose |
| --- | --- |
| Public product page | Marketing media, price and published syllabus titles/types. No paid notes, source URLs or private file details. |
| Recovered purchases | Trainings authorized by the current limited learner session, opening the Commerce learner view with an exact backend player link available. |
| Paid learner page | Authorized curriculum, material access and server-saved progress. Access is checked independently of whether the page shell is public. |

## What was implemented in the Business project

The owner flow now reviews the product, then uses **Create draft & add modules** to open the curriculum editor. A prominent **Add module** action starts an empty curriculum; **Add material** opens lesson details with private FILE or HTTPS LINK choices. Structure edits stay local until **Save curriculum**, retain backend IDs/order/version checks, and the product stays in draft until explicitly published. French mobile action labels wrap within the screen.

The buyer reference implementation provides:

- A library of training cards with a cover/fallback, store name, title, backend progress and Continue learning/Revisit training action.
- A learner header with training identity, overall progress, completed/total text and **Continue learning** using `nextMaterialId`.
- An ordered module outline beside a focused lesson panel on desktop, stacking into one readable column on mobile.
- Material selection in any order, learner notes, fresh access on demand and a manual completion control. Completion does not gate later lessons.
- Local progress feedback, recoverable errors, fresh curriculum after progress updates and immediate respect for server access denials.

These buyer components previously used authenticated customer APIs. **Reuse their presentation and interaction patterns; replace the access adapter with the public contracts below.** Do not copy the Business shell, authentication, account cache or authoring controls into the public player.

### Source references

Paths below are relative to the sibling `fondeka-web` repository:

| Source | Use |
| --- | --- |
| `src/components/training-library.tsx` | Retained as a migration reference; no Business route mounts its library/player. Card composition, lesson selection, progress refresh and completion UI. |
| `src/components/training-material-opener.tsx` | Fresh authorized access, loading/retry, file expiry and clearing capability URLs on close. Also still used for owner preview. |
| `src/components/training-editor.tsx` | Owner workflow only. Reuse visual module framing where useful; do not expose editing, uploads, publication, reordering or deletion to buyers. |
| `src/lib/training.ts` | DTO parsing, exact material identity and access expiry checks. Its authenticated route builders are not public guest route builders. |
| `src/app/globals.css` | `.training-library-*`, `.training-heading`, `.training-progress`, `.training-workspace`, `.training-module`, `.training-edit-panel`, `.training-notes`, `.training-completion` and mobile rules. |
| `src/components/ui.tsx` | Heading, icon tile, skeleton/loading, empty/error state and accessible dialog recipes. |

Commerce already has compatible primitives in `app/commerce-ui.js`, semantic styles in `app/commerce-ui.css` and localized copy. Adapt through those rather than importing Business dependencies or global resets.

## Look and feel

Keep the experience calm, focused and light by default. Use neutral surfaces, clear typography and selective identity color. Match the current Commerce palette, including its warm, muted secondary accents.

| Role | Starting point |
| --- | --- |
| Page background | `#F4F7FB` |
| Card / raised surface | `#FFFFFF` / `#F8FAFD` |
| Primary / secondary text | `#142337` / `#425770` |
| Border | `#DCE4EF` |
| Main action and real progress | Commerce green, `#267C55` |
| Training/topic identity | Restrained violet, `#7953B5`, with a pale tinted surface |
| Card shape | 13–18px corners; 20–28px padding |
| Depth | Fine border and soft shadow: `0 1px 3px #182e4c06, 0 5px 16px #182e4c06` |

Use existing fonts; Geist Sans in the reference corresponds to Commerce’s readable system sans. Titles start around 28–32px, section headings 16–20px, body/notes 14–16px. Preserve visible keyboard focus, approximately 44px touch targets and at least 16px mobile input text. Use one coherent inline icon family; no remote icon fonts, social widgets or third-party scripts on token-bearing pages.

Avoid bright repeated card fills, payment confetti, points/streaks, artificial progress and excessive decoration. A training icon tile or a purposeful empty state supplies enough personality. Use green selection/progress and text/checkmarks together; color alone must not communicate completion or access.

## Page composition and behavior

### Recovered training collection

Start with **My learning / Mes formations**, a book icon and one useful orientation sentence. Show neutral cards in an ordered responsive grid; the reference uses `repeat(auto-fill, minmax(min(100%, 280px), 1fr))` with about 22px gaps. A card has a purposeful cover/fallback, training title, optional supplied metadata and one predictable action.

Only show progress, store name and images when supplied by a confirmed backend contract. The current recovery `Recovered` DTO supplies title and purchase-scoped URLs/IDs, not the authenticated library’s image/store/progress summary. Start with title + **Start training** if needed. A richer authorized summary is a separate backend dependency; do not invent zero progress or issue background material-access requests for every card.

Keep each guest purchase scope intact. The account library’s product deduplication must not be copied into a guest list by merging different order items/tokens or their progress. Use backend grouping if it is provided.

### Paid learner page

```text
Back to store                  Training title
Completed / total · percentage [progress bar] [Continue learning]

Ordered module outline         Selected lesson
  Module title                 Type + title
  Material · type · state      Learner notes
  Material · type · state      [Open material / video card]
                               [Mark complete / Completed]
```

- Keep **Continue learning** prominent. Select the returned `nextMaterialId`; do not calculate another next lesson. If none is returned, offer curriculum browsing or review without fabricating a target.
- Preserve backend module/material order and IDs. Every published material can be opened in any order.
- Highlight the selected material, expose its current state accessibly and show a completion check alongside its label.
- Keep learner notes readable with preserved line breaks and safe wrapping. Do not insert untrusted HTML.
- Make **Mark complete / Completed** an explicit control for each material. Selecting, opening or downloading a material must not complete it automatically.
- During a progress write, prevent conflicting/duplicate writes and show local feedback. Send only the existing completion payload; then refetch authorized curriculum so totals and `nextMaterialId` remain backend-driven.
- A refresh should retain useful context when still authorized. If a selected material disappears or access is revoked, clear its paid content/capability immediately and explain the backend outcome.

Desktop can use a 240–320px outline with the remaining space for the lesson. At about 760px and below, stack the regions in logical DOM order. The long outline can use accessible disclosure sections; keep all materials reachable. Avoid fixed-height panes and overlapping mobile actions. Account for the visible viewport, safe areas, zoom, long French labels and the on-screen keyboard.

The public header should return to a known store/training context. **Do not reuse a generic Share button that shares `window.location.href` on a guest player.** That URL may contain a bearer token. Do not send a buyer to the Business portal or the generic Commerce homepage as authentication recovery.

### Opening materials

Fetch the authorized access endpoint at the moment the buyer opens a material. Keep short-lived URLs in memory only, clear them on close/scope change/expiry and fetch a new capability for another attempt. Never substitute a public bucket/CDN path for `commerce-training-assets/*`.

- **FILE:** use the returned signed URL and expiry. A failed/expired link offers **Retry / Refresh access** through the same scoped access endpoint.
- **LINK:** use the returned HTTPS destination. It remains absent from the marketing syllabus.
- **YouTube LINK:** use a polished video card with a local play icon, material title and **Watch video** action, following the backend player’s existing `linkProvider: "YOUTUBE"` presentation. Fetch fresh access when clicked. Do not prefetch the protected URL, embed YouTube scripts/iframes or request remote thumbnails on the guest page.

The reference opener uses a focused dialog with loading, error/retry, an explicit external open action, Escape and focus return. The backend player can also use its existing protected material-open route. Both must revalidate access; opening a card is not completion.

## Public access and API adaptation

Keep the existing Commerce checkout, quote, payment-method, callback and order polling flow. Pending, failed, partially paid, disputed and refunded orders stay locked. A successful HTTP request/provider redirect does not grant access. Once an eligible paid item returns `trainingPlayerUrl`, **Start training** becomes the primary outcome action.

Use the exact backend `trainingPlayerUrl` and `trainingAccessUrl`. Do not construct or rewrite either URL. Commerce now uses a narrowly scoped same-origin gateway for the existing guest APIs; its backend-origin allowlist, cookie/CSRF transport and deployment requirements are documented in [the implementation guide](public-learning.md). It never rewrites hosts in the browser.

The existing order-scoped guest endpoints are:

```http
GET /public/commerce/orders/{reference}/items/{itemId}/training?accessToken=...
GET /public/commerce/orders/{reference}/items/{itemId}/training/materials/{materialId}/access?accessToken=...
PATCH /public/commerce/orders/{reference}/items/{itemId}/training/materials/{materialId}/progress?accessToken=...
Content-Type: application/json

{"completed":true}
```

Keep reference, item ID and token together. Do not retry a 404 with alternate identifiers. The public learner adapter must not call `/customer-api/commerce/trainings` or require the Business session. Authoring continues to use its existing authenticated endpoints in the Business portal.

### Recovery on another device

Reviewed backend source now includes `CommerceTrainingRecoveryController`, `TrainingAccessService` and `TrainingAccessWeb`. Confirm deployment, feature configuration and approved origins before wiring them. The older [backend recovery design](commerce-training-sign-in-backend-handoff.md) is background; the current controller adds flow/session CSRF handling:

| Step | Current backend contract |
| --- | --- |
| Bootstrap | `GET /public/commerce/training-access/flow` sets the flow cookie and returns `csrfToken`, `expiresInSeconds`. |
| Request code | `POST /public/commerce/training-access/challenges`, JSON `{"email":"learner@example.test"}`, with flow cookie and `X-Training-CSRF`. Returns 202 with `challengeId`, `expiresInSeconds`, `resendAfterSeconds`, `message`. |
| Resend | `POST /public/commerce/training-access/challenges/{id}/resend`, same flow binding/CSRF. Respect backend retry timing. |
| Verify | `POST /public/commerce/training-access/challenges/{id}/verify`, JSON `{"code":"012345"}`, same flow binding/CSRF. Returns 204, sets restricted learner-session cookie and clears the flow cookie. |
| Resume session | `GET /public/commerce/training-access/session` returns `expiresAt`, session `csrfToken`. |
| List purchases | `GET /public/commerce/training-access/trainings?page=0&size=20`, with the learner-session cookie. Returns authorized purchase scopes and exact player/access URLs. |
| End session | `DELETE /public/commerce/training-access/session`, with session cookie and its `X-Training-CSRF`. |

Use approved credentialed cookie transport, preferably through a first-party gateway. Do not assume cookies work across different hosts; validate existing CORS/SameSite/origin policy instead of weakening it. Keep CSRF values in memory. Do not add a customer JWT, account claim or registration step. A returned `selectionToken` is opaque, is not a curriculum identifier and is not required for the normal guest-player navigation.

Verification copy should say **Verify your purchase email**, **Send code**, **Verify code**, **Continue learning**. Do not disclose account or purchase existence before verification, infer ownership from a typed email, or create a new purchase. Restore access to the backend-approved purchase/progress scope.

## Complete states, privacy and accessibility

| State | Public learner behavior |
| --- | --- |
| Initial load | Stable heading and skeleton; no invented progress. |
| No recovered purchases | Clear empty state; offer another purchase email/store context. |
| No published materials | Explain that content is not yet published; preserve valid purchase context. |
| 401 | Recover an expired limited session with email verification; do not replace a still-valid guest token flow with account login. |
| 403 `TRAINING_ACCESS_REQUIRED` | Clear paid content and return to order/payment status with an access-not-active explanation. |
| 404 `NO_RESULT` | Unavailable content; no identifier probing. |
| 503 `INVALID_REQUEST` on file access | Temporary file/storage error with a local Retry. |
| Progress/network failure | Keep safe selection/context, show feedback near the control and refresh authorized state before claiming success. |

Treat full guest URLs and returned capabilities as secrets. Exclude them from analytics, logs, error breadcrumbs, support transcripts, metadata, shared caches and persisted drafts/storage. No third-party analytics/scripts on token-bearing pages. Retain no-store/no-referrer responses and [proxy log redaction](../deploy/nginx/commerce-private-logging.conf). Follow [private storage requirements](commerce-training-storage.md). Refunds revoke future access; server curriculum/progress remain, while previous downloads/external destinations cannot be recalled.

Provide persistent labels, keyboard-operable module/material controls, accessible progress values/text and announced local errors. Dialogs trap focus, close with Escape when safe and return focus to their trigger. Use restrained transitions with reduced-motion support. French and English need the same functionality; keep backend enums and IDs unchanged.

| English | French |
| --- | --- |
| My learning | Mes formations |
| Start training | Commencer la formation |
| Continue learning | Continuer à apprendre |
| Open material | Ouvrir la ressource |
| Mark complete / Completed | Marquer comme terminé / Terminé |
| Refresh access | Actualiser l’accès |
| Back to store | Retour à la boutique |

## Acceptance checks

- Business desktop/mobile navigation and direct routes no longer offer buyer learning. Owner product/curriculum creation, save, publish settings and preview still work.
- Public buyers use paid eligibility or verified limited guest access, with no account sign-in, registration, Business Tools gate or portal redirect.
- Library metadata comes from confirmed contracts; missing fields use honest fallbacks. Guest purchase scopes are never mixed.
- Continue learning uses backend `nextMaterialId`; arbitrary selection and manual completion work; curriculum is refreshed after progress changes.
- FILE/LINK/YouTube actions fetch fresh authorized access, handle expiry/retry and never mark completion automatically.
- Verify at approximately 390px mobile and desktop, English/French, keyboard, zoom, reduced motion, loading/empty/error states, expired capabilities and revoked/refunded access.
- Use synthetic credentials and demo fixtures for screenshots/tests. Check that token URLs never reach third-party requests, storage, logs or metadata. Real mail delivery, cookie deployment, private storage and provider payment integration require their own authorized environment checks.
