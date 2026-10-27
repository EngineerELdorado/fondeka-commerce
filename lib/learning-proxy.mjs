import {
  learnerCurriculum,
  learnerMaterialAccess,
  learnerPurchasePage,
  materialIdPattern,
  purchaseScope,
} from "./public-learning.mjs";

const cookieNames = new Set([
  "__Host-fdk-training-flow",
  "__Host-fdk-training-session",
  "fdk-training-flow-dev",
  "fdk-training-session-dev",
]);
const recoveryErrors = new Set([
  "AUTHENTICATION_FAILED",
  "VERIFICATION_FAILED",
  "VERIFICATION_RATE_LIMITED",
  "TRAINING_RECOVERY_UNAVAILABLE",
  "PERMISSION_DENIED",
  "TRAINING_ACCESS_REQUIRED",
  "NO_RESULT",
  "INVALID_REQUEST",
]);
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie, Origin",
};
const failure = (status = 400, code = "INVALID_REQUEST") =>
  Object.assign(new Error(code), { status, code });

function trainingCookies(header = "") {
  const seen = new Set();
  return header
    .split(";")
    .flatMap((part) => {
      const index = part.indexOf("=");
      const name = part.slice(0, index).trim();
      if (index < 0 || !cookieNames.has(name)) return [];
      const value = part.slice(index + 1).trim();
      if (seen.has(name) || !/^[A-Za-z0-9_-]{1,200}$/.test(value))
        throw failure();
      seen.add(name);
      return [`${name}=${value}`];
    })
    .join("; ");
}

function result(status, body, upstreamHeaders) {
  const headers = new Headers(privateHeaders);
  if (upstreamHeaders) {
    const cookies =
      upstreamHeaders.getSetCookie?.() ||
      (upstreamHeaders.get("set-cookie")
        ? [upstreamHeaders.get("set-cookie")]
        : []);
    for (const combined of cookies)
      for (const cookie of combined.split(
        /,(?=\s*(?:__Host-fdk-training-(?:flow|session)|fdk-training-(?:flow|session)-dev)=)/,
      )) {
        const name = cookie.slice(0, cookie.indexOf("=")).trim();
        if (
          cookieNames.has(name) &&
          /;\s*HttpOnly(?:;|$)/i.test(cookie) &&
          /;\s*Path=\/(?:;|$)/i.test(cookie) &&
          !/;\s*Domain=/i.test(cookie) &&
          (!name.startsWith("__Host-") || /;\s*Secure(?:;|$)/i.test(cookie))
        )
          headers.append("Set-Cookie", cookie);
      }
    const retry = Number(upstreamHeaders.get("retry-after"));
    if (Number.isSafeInteger(retry) && retry > 0 && retry <= 86400)
      headers.set("Retry-After", String(retry));
  }
  if (status === 204) return new Response(null, { status, headers });
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

async function readJson(request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw failure();
  const reader = request.body?.getReader();
  if (!reader) throw failure();
  const pieces = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw failure(413);
    }
    pieces.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const piece of pieces) {
    bytes.set(piece, offset);
    offset += piece.byteLength;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw failure();
    return value;
  } catch {
    throw failure();
  }
}

const only = (body, keys) => {
  if (Object.keys(body).some((key) => !keys.includes(key))) throw failure();
};
const csrf = (value) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,256}$/.test(value))
    throw failure(403, "PERMISSION_DENIED");
  return value;
};

/** Exact first-party routes only. No customer JWT, arbitrary upstream proxy, URL logging or shared cache. */
export function createLearningHandler({
  apiBase,
  allowedOrigins = [],
  fetchImpl = fetch,
}) {
  const base = new URL(apiBase);
  if (
    !["https:", "http:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw failure(503, "TRAINING_TEMPORARY");
  const trusted = new Set([
    base.origin,
    ...allowedOrigins.map((origin) => new URL(origin).origin),
  ]);
  const recoveryBase = `${base.href.replace(/\/$/, "")}/public/commerce/training-access`;
  return async function handle(request, parts) {
    let upstream;
    let timer;
    let abort;
    const controller = new AbortController();
    try {
      // Next's internal request URL may use localhost rather than the public host.
      // Bind Origin to Host (never X-Forwarded-Host); TLS proxies must preserve Host
      // and overwrite X-Forwarded-Proto with their actual transport protocol.
      const internal = new URL(request.url);
      const protocol =
        request.headers.get("x-forwarded-proto") ||
        internal.protocol.slice(0, -1);
      const host = request.headers.get("host") || internal.host;
      if (
        !["http", "https"].includes(protocol) ||
        !/^[A-Za-z0-9.:[\]-]+$/.test(host)
      )
        throw failure(403, "PERMISSION_DENIED");
      const origin = new URL(`${protocol}://${host}`).origin;
      const suppliedOrigin = request.headers.get("origin");
      if (
        (suppliedOrigin && suppliedOrigin !== origin) ||
        request.headers.get("sec-fetch-site") === "cross-site" ||
        (request.method !== "GET" && suppliedOrigin !== origin)
      )
        throw failure(403, "PERMISSION_DENIED");
      const action = parts.join("/");
      const read =
        ["flow", "session", "trainings"].includes(action) &&
        request.method === "GET";
      const challenge =
        /^challenges(?:\/([0-9a-f-]{36})\/(resend|verify))?$/.exec(action);
      const challengeWrite =
        challenge &&
        request.method === "POST" &&
        (!challenge[1] || materialIdPattern.test(challenge[1]));
      const logout = action === "session" && request.method === "DELETE";
      const tokenAction =
        ["course", "material", "progress", "order-status"].includes(action) &&
        request.method === "POST";
      if (!read && !challengeWrite && !logout && !tokenAction)
        throw failure(404, "NO_RESULT");
      const headers = new Headers({
        Accept: "application/json",
        Origin: origin,
      });
      const language = request.headers.get("accept-language");
      if (language && /^[A-Za-z,;=0-9. -]{1,80}$/.test(language))
        headers.set("Accept-Language", language);
      let url;
      let method = request.method;
      let payload;
      let materialId;
      if (tokenAction) {
        const body = await readJson(request);
        only(
          body,
          action === "progress"
            ? ["accessUrl", "materialId", "completed"]
            : action === "material"
              ? ["accessUrl", "materialId"]
              : ["accessUrl"],
        );
        let scope;
        try {
          scope = purchaseScope(body.accessUrl);
        } catch {
          throw failure();
        }
        if (!trusted.has(scope.url.origin))
          throw failure(400, "TRAINING_LINK_UNSUPPORTED");
        // The curriculum uses the exact backend value. Only documented child operations are derived.
        url = body.accessUrl;
        method = "GET";
        if (action === "material" || action === "progress") {
          materialId = body.materialId;
          if (
            typeof materialId !== "string" ||
            !materialIdPattern.test(materialId)
          )
            throw failure();
          const child = new URL(url);
          child.pathname += `/materials/${materialId}/${action === "material" ? "access" : "progress"}`;
          url = child.href;
          if (action === "progress") {
            if (typeof body.completed !== "boolean") throw failure();
            method = "PATCH";
            payload = { completed: body.completed };
          }
        } else if (action === "order-status") {
          const order = new URL(url);
          order.pathname = order.pathname.replace(
            /\/items\/[1-9]\d*\/training$/,
            "",
          );
          url = order.href;
        }
      } else {
        url = `${recoveryBase}/${action}`;
        const cookies = trainingCookies(request.headers.get("cookie") || "");
        if (cookies) headers.set("Cookie", cookies);
        if (challengeWrite || logout)
          headers.set(
            "X-Training-CSRF",
            csrf(request.headers.get("x-training-csrf")),
          );
        if (challengeWrite && challenge[2] !== "resend") {
          const body = await readJson(request);
          only(body, challenge[2] === "verify" ? ["code"] : ["email"]);
          if (challenge[2] === "verify") {
            if (
              typeof body.code !== "string" ||
              body.code.length < 1 ||
              body.code.length > 64
            )
              throw failure();
            payload = { code: body.code };
          } else {
            if (
              typeof body.email !== "string" ||
              body.email.length > 254 ||
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
            )
              throw failure();
            payload = { email: body.email.trim() };
          }
        }
        if (action === "trainings") {
          const incoming = new URL(request.url);
          const pageText = incoming.searchParams.get("page") || "0";
          const sizeText = incoming.searchParams.get("size") || "20";
          if (
            !/^\d{1,8}$/.test(pageText) ||
            !/^\d{1,3}$/.test(sizeText) ||
            Number(sizeText) < 1 ||
            Number(sizeText) > 100
          )
            throw failure();
          url += `?page=${Number(pageText)}&size=${Number(sizeText)}`;
        }
      }
      if (payload) headers.set("Content-Type", "application/json");
      abort = () => controller.abort();
      request.signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(abort, 15000);
      upstream = await fetchImpl(url, {
        method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined,
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });
      if (upstream.status >= 300 && upstream.status < 400)
        throw failure(502, "TRAINING_TEMPORARY");
      let data = null;
      if (upstream.status !== 204) {
        const raw = await upstream.text();
        if (raw.length > 12 * 1024 * 1024)
          throw failure(502, "INVALID_RESPONSE");
        try {
          data = JSON.parse(raw);
        } catch {
          if (upstream.ok) throw failure(502, "INVALID_RESPONSE");
        }
      }
      if (!upstream.ok) {
        const code = recoveryErrors.has(data?.errorCode)
          ? data.errorCode
          : upstream.status === 401
            ? "AUTHENTICATION_FAILED"
            : upstream.status === 404
              ? "NO_RESULT"
              : upstream.status === 403
                ? "PERMISSION_DENIED"
                : "TRAINING_TEMPORARY";
        return result(
          upstream.status,
          { statusCode: upstream.status, errorCode: code },
          upstream.headers,
        );
      }
      const expectedStatus =
        logout || (challengeWrite && challenge[2] === "verify")
          ? 204
          : challengeWrite
            ? 202
            : 200;
      if (upstream.status !== expectedStatus)
        throw failure(502, "INVALID_RESPONSE");
      let safe;
      if (action === "course" || action === "progress")
        safe = learnerCurriculum(data);
      else if (action === "material")
        safe = learnerMaterialAccess(data, materialId);
      else if (action === "trainings") safe = learnerPurchasePage(data);
      else if (action === "order-status")
        safe = {
          reference: String(data?.reference || ""),
          status: String(data?.status || ""),
        };
      else if (
        action === "flow" ||
        (action === "session" && method === "GET")
      ) {
        if (
          typeof data?.csrfToken !== "string" ||
          !/^[A-Za-z0-9_-]{16,256}$/.test(data.csrfToken)
        )
          throw failure(502, "INVALID_RESPONSE");
        safe = { csrfToken: data.csrfToken };
        if (action === "flow") {
          if (
            !Number.isSafeInteger(data.expiresInSeconds) ||
            data.expiresInSeconds < 1
          )
            throw failure(502, "INVALID_RESPONSE");
          safe.expiresInSeconds = data.expiresInSeconds;
        } else {
          if (!data.expiresAt || !Number.isFinite(Date.parse(data.expiresAt)))
            throw failure(502, "INVALID_RESPONSE");
          safe.expiresAt = data.expiresAt;
        }
      } else if (challengeWrite && challenge[2] !== "verify") {
        if (
          !materialIdPattern.test(data?.challengeId) ||
          !Number.isSafeInteger(data.expiresInSeconds) ||
          data.expiresInSeconds < 1 ||
          !Number.isSafeInteger(data.resendAfterSeconds) ||
          data.resendAfterSeconds < 0
        )
          throw failure(502, "INVALID_RESPONSE");
        safe = {
          challengeId: data.challengeId,
          expiresInSeconds: data.expiresInSeconds,
          resendAfterSeconds: data.resendAfterSeconds,
        };
      }
      return result(upstream.status, safe, upstream.headers);
    } catch (error) {
      const status =
        error.status ||
        (["INVALID_RESPONSE", "ACCESS_EXPIRED"].includes(error.message)
          ? 502
          : 503);
      const code =
        error.code ||
        (["INVALID_RESPONSE", "ACCESS_EXPIRED"].includes(error.message)
          ? error.message
          : "TRAINING_TEMPORARY");
      return result(
        status,
        { statusCode: status, errorCode: code },
        upstream?.headers,
      );
    } finally {
      clearTimeout(timer);
      if (abort) request.signal.removeEventListener("abort", abort);
    }
  };
}
