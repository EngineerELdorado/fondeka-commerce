# Commerce training: public email verification and access recovery

Status: backend implementation handoff. Updated 2026-10-24. The APIs below are proposals, not endpoints implemented by this document. Audit and reuse equivalent existing functionality before introducing new routes.

## Product boundary

**Commerce is a public storefront. It has no account sign-in or registration journey.** Buyers browse, purchase and learn here. Recovering a purchase on another device must not require a Fondeka account, an app installation, customer JWT, financial-account device approval or a redirect to `web.fondeka.com`.

The public journey is:

```text
Continue learning → checkout email → verification code → eligible trainings → player on Commerce
```

The code proves control of the purchase mailbox and establishes a limited learner session. It does not sign the buyer into a Fondeka account, create an account, attach purchases to an account or grant financial/account privileges. This remains true when the mailbox happens to match an existing Fondeka account.

Use public-facing labels such as **Continue learning**, **Verify your email**, **Send verification code** and **Access your trainings**. Do not add **Sign in**, **Register**, **Create an account** or account-claim prompts to this site. Existing account libraries and identity/device policies belong to the separate authenticated products and remain outside this work.

## Why we need this

A guest can purchase a training through Commerce. After eligible payment, the backend supplies a private `trainingPlayerUrl`. A buyer can use the complete link on another device and resume server-saved progress, but losing the link currently leaves no public recovery journey.

Email-code verification lets a paying guest recover access from a clean browser without registering or buying again. The security boundary is explicit: an email address typed into a form is not proof of ownership. Access requires fresh, server-verified mailbox proof plus an eligible purchase. Never infer account identity or training entitlement by matching the checkout email to an account email.

## What already exists in the reviewed code

| Component | Observed behavior | Backend action |
| --- | --- | --- |
| Commerce: `app/s/[slug]/storefront.js` | Public checkout and exact backend player links; no account sign-in or registration UI. | Preserve the public purchase flow and supply a guest recovery contract. |
| Web portal: `fondeka-web/src/app/login/page.tsx` | Existing Cognito email-code account sign-in. | Reference its delivery/security patterns where useful; do not make portal/account authentication a guest recovery dependency. |
| `CommerceTrainingLearningService` | Guest access validates reference + item ID + token. Progress uses `ORDER_ITEM:{id}` for guest orders. | Reuse scoped purchase validation and the same learner/progress identity. |
| `CommerceTrainingAccessPolicy` | Paid eligibility and refund restrictions protect training access. | Re-evaluate this policy for every recovered grant and protected request. |
| `CommerceTrainingLearningController`, `CommerceTrainingPurchaseRepository` | An account-based library also exists. | Leave it in the authenticated products; do not require it for public recovery. |

No training-specific mailbox recovery API was identified in these reviewed components. This is not an audit of all identity-provider infrastructure or deployed configuration. Reuse existing safe code delivery, throttling and session infrastructure if available, provided it supports buyers with no Fondeka account.

## Expected buyer journey

1. Buyer selects **Continue learning** on Commerce.
2. If they have a valid original player link or an active limited learner session, they can continue without account login.
3. Otherwise, they enter their checkout email and request a verification code.
4. Before verification, the response reveals no account, order or training existence.
5. Backend validates the code for that attempt and establishes a restricted learner session on Commerce.
6. Commerce lists the eligible guest purchases and opens the exact backend-provided player URL through the approved Commerce origin.
7. Expired recovery sessions return to email verification on Commerce. They never fall through to account sign-in or registration.

Do not change the order's buyer account, transfer a purchase, create account enrollment, or merge guest progress into account progress during recovery. Keep original reference/item/token scopes together. Purchases outside the backend's approved guest recovery policy remain unavailable through this flow; do not substitute account-email matching or redirect to a portal as a fallback.

## Proposed backend contract

Use equivalent existing APIs if available and return the confirmed request/response shapes to the frontend team. The route names and numeric defaults below are coordination proposals.

### Request a verification code

```http
POST /public/commerce/training-access/challenges
Content-Type: application/json

{"email":"learner@example.test"}
```

Return `202 Accepted` with the same shape and message whether the email has an account, guest purchase or neither:

```json
{
  "challengeId": "opaque-attempt-id",
  "expiresInSeconds": 300,
  "resendAfterSeconds": 60,
  "message": "If this email can receive a verification code, one will be sent."
}
```

Bind the attempt to an unpredictable, short-lived browser flow cookie or equivalent server-validated binding. A challenge ID or a client-provided `verified: true` flag must not authorize access. Keep issuance and timing uniform before purchase disclosure, and do not expose email-provider delivery errors to the caller.

### Verify and establish a limited learner session

```http
POST /public/commerce/training-access/challenges/{challengeId}/verify
Content-Type: application/json

{"code":"012345"}
```

On successful verification, atomically consume the challenge and return `204 No Content` while establishing a restricted server-side learner session. The browser stays on Commerce and opens its recovered-training view. Do not return an account JWT, account creation requirement, portal login URL or registration redirect.

An HttpOnly cookie through a first-party gateway is the preferred browser transport. For example, use a `__Host-` cookie with `Secure`, `HttpOnly`, `Path=/`, no `Domain` and an appropriate `SameSite` policy. Suggested absolute lifetime: 30 minutes, configurable and enforced server-side. Rotate the pre-verification session identifier on success. The session may authorize only the verified purchase scopes and related training operations, never payments, refunds, merchant tools or account administration.

The storefront and API may use different origins. Confirm the first-party gateway/CORS/cookie design; do not assume a cookie set by one host works on another. Do not put the session in a URL or introduce long-lived local-storage credentials as a workaround.

### List eligible recovered trainings

```http
GET /public/commerce/training-access/trainings?page=0&size=20
```

Require the limited learner session. Resolve its verified checkout mailbox and authorized guest purchase scopes on the server. Initially cover guest/unclaimed purchases allowed by the existing order-token policy. Do not expand account-owned purchase access implicitly; any additional recovery policy requires explicit backend authorization design, without introducing account sign-in on this public site.

Compare addresses using the established canonicalization rules, without provider-specific guesses such as stripping dots or plus-address suffixes. Match verified purchase-mailbox proof to purchase records, not to account identities.

Return a paginated collection with training title, product ID, order reference, order item ID and the exact backend-generated `trainingPlayerUrl`. The response may also include the exact `trainingAccessUrl`. Both URLs remain bearer secrets. Keep reference, item and token scope together; the frontend must not construct or alter the URLs.

Only currently eligible paid purchases can return active links. Re-evaluate purchase ownership, payment, refunds and disputes on every recovery read and player/material/progress request. Verification must not mark an order paid, create a purchase or manufacture entitlement. Backend eligibility remains authoritative after session creation.

An empty result after verification can explain that no active guest trainings were found, while offering to check another purchase email. Do not reveal unrelated account details or probe alternate order/item IDs.

### End or expire a learner session

Provide a revocation operation, for example:

```http
DELETE /public/commerce/training-access/session
```

Invalidate the server session and clear its cookie. Missing, expired or revoked sessions return `401`; Commerce asks for email verification again. Public copy can say **End learning session** rather than account-oriented sign-out language. An independently valid original guest player link retains its existing behavior.

## Keep the learner interface on Commerce

The current backend-hosted player may return a URL on the API host. Email verification alone does not change that destination. Keeping the player itself on Commerce requires a backend-supported first-party player route or reverse proxy, with the backend returning the exact approved Commerce-origin `trainingPlayerUrl`. Confirm this capability before wiring the UI; do not promise same-site learning while returning an off-site player URL.

Configure trusted storefront/player origins per environment. Preserve backend purchase checks, relative asset/API routing, no-store responses, no-referrer policy and token-log redaction through the gateway. Do not rewrite returned hostnames in the client, weaken frame/security policies to embed an off-site player, or redirect to the Business portal as a fallback.

Authorized FILE downloads and LINK materials may still open their backend-approved external destinations. The recovery, recovered-training view and player interface remain on Commerce.

## Preserve progress and purchase restrictions

Recovery is a new way to reach the same purchase, not a new enrollment. Preserve guest learner keys and existing material progress; no account claim or learner-key migration is part of this work. A different device using the same purchase must see the same saved progress.

Continue using backend totals and `nextMaterialId`. Published materials can be opened in any order, and manual completion must not gate later content. Refunded/disputed access stays locked while curriculum and progress remain on the server. Previously downloaded files or external links cannot be recalled.

## Verification and session protections

These are proposed application requirements/defaults, not claims about deployed configuration:

- Generate six-digit codes with a cryptographically secure random generator. Suggested expiry: five minutes, at most five verification attempts per challenge, and at least 60 seconds between resends. Enforce these limits on the server.
- Rate-limit issuance, resend and verification over rolling windows by mailbox and source, with global delivery-abuse controls. Starting another challenge must not reset all guessing limits. An attacker requesting codes must not lock the buyer's full Fondeka account.
- Bind proof to purpose `TRAINING_ACCESS_RECOVERY`, challenge, mailbox and browser flow. A code from another attempt/mailbox/purpose must fail. Resend invalidates the previous code for that attempt without letting an unrelated browser cancel another buyer's active flow.
- For application-managed challenges, store a keyed digest of code plus challenge context, with its key outside the database, rather than plaintext or a plain hash of a low-entropy code. Compare securely. Reuse a verified implementation where available without requiring account creation.
- Atomically enforce expiry, attempt limits, single-use consumption and session creation. Concurrent correct submissions must not create multiple sessions from one code. Wrong-code requests must not race past the attempt limit.
- Keep pre-verification status, message and timing reasonably uniform. Do not add an unauthenticated “does this email have trainings?” endpoint for UI branching.
- Put codes in POST bodies, never query strings. Exclude codes, challenge state, cookies, account credentials, full player URLs and signed file URLs from logs, analytics, breadcrumbs, support captures and proxy traces. Keep security audit events minimal and free of bearer secrets.
- Use HTTPS, `Cache-Control: no-store` and `Referrer-Policy: no-referrer` on sensitive responses. Keep guest recovery/player pages free of third-party trackers/scripts. Redact token-bearing query strings at every proxy layer.
- Protect cookie-authenticated writes with CSRF defenses and origin validation. Restrict credentialed CORS to explicitly approved origins. Allow only approved same-site recovery destinations and never copy guest tokens into redirect metadata.
- Keep this session type separate from account authentication. Preserve existing customer JWT validation and trusted-device policies elsewhere; training verification must not establish a financial-account session or approve a device for account operations.

These lifecycle and enumeration controls adapt [OWASP's recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). The numeric defaults and restricted training-session policy are product-specific proposals.

## Error behavior

| Situation | Expected contract / buyer behavior |
| --- | --- |
| Initial code request | Generic `202`; disclose no account or purchase existence. |
| Wrong, expired, consumed or wrong-scope code | Stable generic failure, such as `400 VERIFICATION_FAILED`; no partial learner session. |
| Throttled request | `429` with `Retry-After`; preserve existing valid training access. |
| Missing/expired learner session | `401`; verify the purchase email again on Commerce. Never show account sign-in/registration. |
| `403 TRAINING_ACCESS_REQUIRED` | Explain inactive access and return to backend-supported order/payment status. |
| `404 NO_RESULT` | Show unavailable content; do not probe alternate identifiers or switch to account login. |
| `503 INVALID_REQUEST` from material storage | Temporary file/storage error with Retry; never use a public asset fallback. |

Reuse existing error-envelope conventions where they differ and document final codes for the frontend.

## Acceptance criteria and backend handoff response

- A guest on a clean second browser, with no saved player link and no Fondeka account, can verify the checkout mailbox and resume an eligible training with the same progress.
- The Commerce UI contains no account sign-in, registration or account-claim journey. Recovery, recovered trainings and the player remain on Commerce; there is no automatic `web.fondeka.com` navigation, app-install requirement or implicit account creation.
- A mailbox matching an existing account does not change this public flow, transfer a purchase, create account enrollment or grant access to additional account-owned purchases.
- Typing an email without a valid code returns no purchase data. Codes resist replay, restart-based brute force, cross-scope use and concurrent verification; integration tests cover delivery throttling, resend, expiry and non-enumeration.
- Recovery preserves original reference/item/token scope and learner keys. It creates no duplicate enrollment, performs no account-progress migration and does not alter the buyer account.
- Pending, failed, partially paid, disputed and refunded orders remain locked. Refunds and revocation are honored after session creation as well as before it.
- Recovery credentials cannot authorize financial/account actions. Session expiry/revocation asks for verification again on Commerce and does not redirect to account authentication.
- FILE access continues to fetch fresh short-lived URLs and follows [commerce-training-storage.md](commerce-training-storage.md). Direct/CDN reads remain private.
- Automated checks with synthetic credentials confirm no code, session cookie, guest token, player URL or signed file URL leaks into logs, metadata or third-party trackers.
- Existing portal account authentication/library behavior remains unchanged outside this public recovery feature.

Backend should return: what was already implemented; final endpoint/schema/error contracts; limited-session scope; first-party cookie/origin/player routing; guest purchase eligibility rules; progress continuity; configured limits/expiry; and tests proving these cases. The storefront can then implement **Continue learning** and **Verify your email** against that confirmed contract.
