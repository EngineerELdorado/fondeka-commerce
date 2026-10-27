# Backend fix request: public Commerce training email recovery

Updated 2026-10-27. Scope: repair the existing public guest recovery flow and its deployment configuration. This file is a local handoff; no backend code or deployed configuration has been changed.

## Problem

The public Commerce UI reports: “Email recovery is temporarily unavailable. Your original training link still works if access is active.”

Commerce displays this exact message only for backend error code `TRAINING_RECOVERY_UNAVAILABLE`, normally HTTP 503. My learning checks the recovery session on page load, so the warning can appear before a buyer enters an email.

The recovery controllers and limited-session implementation already exist. Diagnose and fix readiness/configuration in the intended deployment; do not introduce duplicate recovery endpoints or just suppress the frontend error.

## Evidence and likely checks

- `TrainingAccessService.requireEnabled()` rejects a disabled feature, empty/malformed allowed origins, or an invalid signing key.
- `TrainingAccessCrypto.digest()` requires valid Base64 containing at least 32 decoded bytes.
- `TrainingAccessWeb.origin()` rejects insecure cookies outside the `dev`/`test` profiles.
- Reviewed defaults: `TRAINING_ACCESS_ENABLED=false` and an empty `TRAINING_ACCESS_HMAC_KEY`. These are source defaults, not verified deployed values.
- Historical read-only check on 2026-10-25: the configured API returned 503 with `TRAINING_RECOVERY_UNAVAILABLE` for the public Commerce origin. Local preview origins were rejected by CORS with 403. Recheck the affected environment rather than assuming those observations still describe its configuration.

## Requested fix

1. Identify the effective failing readiness check without exposing secret values.
2. In environments intended to support recovery, explicitly set `TRAINING_ACCESS_ENABLED=true` and provision a stable `TRAINING_ACCESS_HMAC_KEY` through the existing secret manager. Configure `TRAINING_ACCESS_ALLOWED_ORIGINS` with exact approved Commerce origins, including their development ports where applicable.
3. Keep production HTTPS and `TRAINING_ACCESS_SECURE_COOKIES=true`. Local HTTP may use `TRAINING_ACCESS_SECURE_COOKIES=false` under `dev`/`test` only. Keep CORS/origin changes scoped to public training recovery.
4. Verify the existing same-origin Commerce gateway transport: HttpOnly flow/session cookies, CSRF headers, no-store responses and exact backend-issued training URLs. The frontend must not rewrite hosts or manufacture URLs.
5. Add feature-specific, secret-free operator diagnostics for readiness failures. Keep the public error generic and do not make an intentionally disabled optional recovery feature break unrelated APIs.

## Acceptance checks

- With valid recovery configuration, an allowed-origin `GET /public/commerce/training-access/session` without a learner cookie returns **401 AUTHENTICATION_FAILED**, which Commerce treats as the normal email-verification entry state.
- `GET /public/commerce/training-access/flow` returns **200**, the existing CSRF value and an HttpOnly flow cookie.
- Code request/resend preserve the generic **202** contract, mailbox non-enumeration and existing rate limits.
- Valid code verification returns **204** and a restricted learner cookie; session and training-list reads then succeed. Wrong, expired or replayed codes create no session.
- A clean second browser can verify a controlled test purchase mailbox and resume the same eligible training and saved progress on Commerce, without account registration/sign-in or a Business portal redirect.
- Disallowed origins/invalid CSRF remain **403**. Intentionally disabled or invalid recovery configuration must still fail closed with **503 TRAINING_RECOVERY_UNAVAILABLE**; do not return a fake 401 to hide it.
- Verify delivery with an authorized test inbox. Mail delivery failures currently invalidate the challenge; they do not emit this configuration error code. Preserve generic pre-verification responses and record only sanitized operational diagnostics.
- Recheck refund/dispute/revocation and restricted-session expiry. No alternate ID/token probing and no private content for ineligible purchases.

## Scope boundaries

Only the existing public Commerce guest training recovery feature and its deployment/readiness checks are in scope. Preserve checkout, quotes, payment methods, callbacks, order polling, paid eligibility, original order-token access, private-file rules, account authentication/JWT/device approval and account-claim behavior.

Keep learner proof limited to the verified purchase scope. Do not infer account access by matching email addresses. Never log codes, signing keys, cookies, CSRF values, bearer training URLs or signed file URLs.

Extend the existing `TrainingAccessSecurityTest` / `TrainingAccessPersistenceIT` coverage with HTTP/controller checks for the cookie/CSRF sequence. Report the configuration fix, deployment verification and test results; source tests alone do not establish that recovery is enabled and mail delivery works in the affected environment.
