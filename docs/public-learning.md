# Public buyer learning

Implemented in `fondeka-commerce`, 2026-10-25. The Business portal continues to own product and curriculum authoring. Buyers learn on public Commerce without account sign-in, registration, a customer JWT or a redirect to `web.fondeka.com`.

## Buyer journey

- **My learning / Mes formations** appears in a store's header only when a training is confirmed in that store's public catalog. It stays hidden for empty/non-training stores and while discovery is loading or unavailable. Loaded trainings show it immediately; otherwise a background read follows the existing public catalog pagination, including from non-training product-detail pages. These reads stop at the first training or final page and are cancelled when leaving/changing the store. The paid-training confirmation link, direct learning page and general Commerce homepage entry remain available independently of this navigation check.
- The existing checkout still polls payment and makes the exact backend **Start training** player URL available only after eligible payment. Pending, partially paid, failed, disputed and refunded purchases remain locked.
- Eligible paid items with both backend URLs are remembered in React memory for the active tab. **My learning** opens their inline player in Commerce without repeating email verification. A reload or new device uses purchase recovery; bearer URLs are never persisted in browser storage.
- On another device, the buyer enters their purchase email, receives a verification code, and verifies it here. The restricted backend learner session lists its authorized training purchases. This does not create or sign in to a Fondeka account.
- The library opens the course inside `/learning`. Its clean URL contains only an optional store slug and language. Browser Back/Forward restores the local library/course selection without placing a purchase URL, email, token or material capability in history state.
- **End learning session** revokes a recovered session on the backend before clearing it locally. Active-tab checkout capabilities are also cleared. Session expiry asks for purchase-email verification again; a still-valid checkout capability remains usable.

The exact backend player link remains available as **Open secure player**. External materials open only after an explicit learner action. There is no automatic portal redirect.

## Presentation

The interface adapts the retained `fondeka-web` training components through Commerce's own JavaScript, inline icons, theme tokens and accessible dialog. No new UI dependency is required.

It is light by default, with neutral layered cards, soft borders/shadows, a restrained violet training identity and green primary actions. Recovery uses two focused email/code steps. Training cards show supplied titles and order references, with honest book artwork instead of invented covers or progress summaries.

The player has backend progress and completed/total text, **Continue learning** using `nextMaterialId`, ordered module disclosures and a focused lesson panel. Desktop places the outline beside the lesson; mobile stacks them in readable order without fixed action overlays. French and English have equivalent controls. Notes are plain text with preserved line breaks. Every lesson can be selected freely and has an explicit **Mark complete / Completed** control. A progress change refreshes the curriculum before updating totals or reporting confirmed progress.

YouTube materials use a warm video card and a local play icon. No remote thumbnails, embedded players, third-party scripts or analytics load in the learner space. FILE/LINK access is requested only when opening the material. A focused dialog offers the returned HTTPS destination, clears it on close/expiry and requests fresh access on retry. It never substitutes a public file/CDN URL.

## API adapter and privacy

`app/api/learning/[...action]/route.js` is a same-origin gateway, not a new backend entitlement service. It implements only these operations:

| Commerce gateway | Existing backend operation |
| --- | --- |
| GET `flow` | GET `/public/commerce/training-access/flow` |
| POST `challenges` | POST `/public/commerce/training-access/challenges`, email body |
| POST `challenges/{id}/resend` | POST the same recovery child route |
| POST `challenges/{id}/verify` | POST the same recovery child route, code body; requires 204 |
| GET / DELETE `session` | GET / DELETE `/public/commerce/training-access/session` |
| GET `trainings?page=0&size=20` | GET `/public/commerce/training-access/trainings?page=0&size=20` |
| POST `course` | GET the exact backend `trainingAccessUrl` |
| POST `material` | GET its documented material `/access` child |
| POST `progress` | PATCH its documented material `/progress` child, only `{"completed":boolean}` |
| POST `order-status` | GET the same scope's existing order status route |

The gateway accepts only same-origin writes, forwards only named training cookies and the backend's flow/session CSRF value, and never forwards customer JWTs or unrelated cookies. It preserves HttpOnly cookie scope. The server checks an upstream origin allowlist and exact route/identifier shapes before any token request, disables redirects and caching, and strips unused/private response fields including `selectionToken`. Errors contain local codes, never upstream messages, input URLs or stack traces. A 202, provider redirect or completed HTTP request does not grant access.

The browser sends purchase capabilities to the gateway in POST bodies rather than request URLs. No guest query tokens enter page metadata or share controls. Curriculum/material reads are private and uncached. A 404 stops at the supplied scope; there is no alternate-ID lookup. Access denials clear paid lesson content. File storage failures offer local retry. Refunds do not erase saved server progress.

Recovery `tr1` grants authorize a training item and cannot be promoted to the original order-wide checkout token. If the existing order-status endpoint rejects such a grant, the payment-status view shows that denial; it does not try another token/identifier. A richer recovery-scoped payment-status response would be a separate backend addition.

## Deployment configuration

| Setting | Purpose |
| --- | --- |
| `COMMERCE_TRAINING_API_BASE` | Optional server-only backend base for this gateway; defaults to the existing `NEXT_PUBLIC_API_BASE` / API configuration. The Next server must reach it. |
| `COMMERCE_TRAINING_ALLOWED_ORIGINS` | Optional comma-separated server-only origins of backend-issued training access URLs when different from the API base. Use exact trusted backend origins. No wildcard, browser override or arbitrary host rewriting. |
| Backend `app.commerce.training-access.enabled` | Enables recovery. The backend must include its existing recovery controllers, migrations and mail delivery. |
| Backend `app.commerce.training-access.hmac-key` | Required stable recovery signing secret; configure through the backend secret manager. |
| Backend `app.commerce.training-access.allowed-origins` | Must include the actual public Commerce origin, including scheme and development port where applicable. The gateway forwards the browser's verified origin. |
| Backend `app.commerce.training-access.secure-cookies` | Keep enabled for production HTTPS. The backend's explicit development cookie configuration is needed for local HTTP. |

The existing backend environment aliases are `TRAINING_ACCESS_ENABLED`, `TRAINING_ACCESS_HMAC_KEY`, `TRAINING_ACCESS_ALLOWED_ORIGINS` and `TRAINING_ACCESS_SECURE_COOKIES`. No customer client ID or account-claim setup is needed for this public journey.

The backend's `app.baseUrl` determines the exact returned player/access URLs. Configure it correctly; the frontend does not replace their hosts. A mismatched/unapproved access origin fails closed with an explanation and the original player link. Restart/redeploy Next after changing server configuration. Recovery cookies are returned through Commerce's same-origin gateway, avoiding cross-site browser-cookie dependence.

The HTTPS reverse proxy must preserve the public `Host` and overwrite `X-Forwarded-Proto` with its actual transport protocol. Origin checks deliberately ignore `X-Forwarded-Host`.

Availability check on 2026-10-25: the currently configured API returned `503 TRAINING_RECOVERY_UNAVAILABLE` for `https://commerce.fondeka.com`; local origins `http://localhost:4100` and `http://192.168.178.55:4100` were rejected by CORS with 403. Enable/configure the backend recovery feature and approved origins before testing real email codes. This read-only check did not request a code or use learner credentials.

The current scoped backend fix request and acceptance checks are in [backend-training-recovery-unavailable.md](backend-training-recovery-unavailable.md). It reuses the existing endpoints and preserves account, checkout and payment behavior.

Do not enable request/response body logging, fetch URL logging, analytics breadcrumbs or third-party error capture for the gateway or learner page. Apply [private proxy logging](../deploy/nginx/commerce-private-logging.conf) to backend token routes and follow [private training storage](commerce-training-storage.md). These checked-in examples do not change live infrastructure.

## Verification

`npm test` covers paid eligibility, quantity rules, exact URLs, scoped recovery, private DTO stripping, access expiry, CSRF/cookie forwarding, upstream allowlisting, same-origin enforcement, expected HTTP outcomes and terminal 404 behavior. Store navigation checks also cover complete and paginated public catalogs, direct-product discovery, cancellation and failed/malformed responses.

Validated on 2026-10-25: 24 Node checks passed, the isolated production build passed, and synthetic browser checks passed at 320px, 390px and 1440px in English/French with a dark browser preference still rendering the light interface. Browser coverage included incorrect/correct code verification, HttpOnly recovery cookies, library/course navigation, backend-selected next material, completion refresh, fresh file access/expiry/retry, material 404/storage errors, access revocation when returning to the tab, session end, safe history/storage/metadata and checkout-to-learning handoff. No real email or payment was sent by these fixtures.

Store navigation validated on 2026-10-27: all 30 Node checks and the isolated production build passed. All 52 synthetic browser cases passed in English/French at 390px and 1440px, covering training and non-training stores, empty/loading/error states, trainings beyond the first 20 and 100 products, direct-product discovery, unchanged cart/navigation behavior and public-read-only discovery.

Build and browser checks must use an isolated build directory while the regular development server is running, so `.next` output does not collide. Use synthetic mail codes, cookies and links for browser fixtures. Real email delivery, deployed recovery configuration, HTTPS cookies, proxy logs, payment providers and private storage need environment-specific verification; frontend fixtures do not prove those integrations.

Implementation entry points: `app/learning/`, `app/learning-session.js`, `app/learning.css`, `lib/public-learning.mjs`, `lib/learning-client.js`, `lib/learning-proxy.mjs` and `lib/learning-copy.js`. The original [UI handoff](public-training-learner-ui-handoff.md) remains the design/contract reference.
