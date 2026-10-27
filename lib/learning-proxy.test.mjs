import test from "node:test";
import assert from "node:assert/strict";
import { createLearningHandler } from "./learning-proxy.mjs";
import {
  accessUrl,
  curriculum,
  materialId,
  purchase,
} from "./test-fixtures/learning.mjs";

const origin = "https://commerce.example.test";
const csrf = "a".repeat(64);
const challengeId = "33333333-3333-4333-8333-333333333333";
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
const request = (action, body, extra = {}) =>
  new Request(`${origin}/api/learning/${action}`, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...extra.headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...Object.fromEntries(
      Object.entries(extra).filter(([key]) => key !== "headers"),
    ),
  });
const harness = (response) => {
  const calls = [];
  const handle = createLearningHandler({
    apiBase: "https://api.example.test",
    fetchImpl: async (url, init) => {
      calls.push({ url, ...init });
      return typeof response === "function"
        ? response(url, init)
        : response.clone();
    },
  });
  return {
    calls,
    handle: (action, body, extra) =>
      handle(request(action, body, extra), action.split("?")[0].split("/")),
  };
};

test("gateway sends exact curriculum URL with no JWT/cookies, no redirects and no shared cache", async () => {
  const { handle, calls } = harness(json(curriculum));
  const response = await handle(
    "course",
    { accessUrl },
    {
      headers: {
        Cookie: "customer-jwt=synthetic; fdk-training-session-dev=synthetic",
        Authorization: "Bearer synthetic",
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, accessUrl);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].headers.has("Cookie"), false);
  assert.equal(calls[0].headers.has("Authorization"), false);
  assert.equal(calls[0].cache, "no-store");
  assert.equal(calls[0].redirect, "manual");
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.doesNotMatch(
    JSON.stringify(await response.json()),
    /assetKey|linkUrl|fileName/,
  );
});

test("untrusted hosts, alternate paths, cross-origin writes and unknown operations never reach backend", async () => {
  const { handle, calls } = harness(json(curriculum));
  for (const url of [
    accessUrl.replace("api.example.test", "localhost:8080"),
    accessUrl.replace("/training?", "/training/materials?"),
    accessUrl.replace("/42/", "/42%2f..%2f43/"),
  ])
    assert.equal((await handle("course", { accessUrl: url })).status, 400);
  assert.equal(
    (
      await handle(
        "course",
        { accessUrl },
        { headers: { Origin: "https://attacker.test" } },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handle(
        "course",
        { accessUrl },
        { headers: { "Sec-Fetch-Site": "cross-site" } },
      )
    ).status,
    403,
  );
  assert.equal(
    (await handle("customer-api/trainings", { accessUrl })).status,
    404,
  );
  assert.equal(
    (await handle("course", { accessUrl, productId: 8 })).status,
    400,
  );
  assert.equal(calls.length, 0);
});

test("documented material and progress operations retain the same order, item and token", async () => {
  const { handle, calls } = harness((url) =>
    url.includes("/progress?")
      ? json(curriculum)
      : json({ materialId, type: "LINK", url: "https://youtu.be/synthetic" }),
  );
  assert.equal(
    (await handle("material", { accessUrl, materialId })).status,
    200,
  );
  assert.equal(
    calls[0].url,
    accessUrl.replace(
      "/training?",
      `/training/materials/${materialId}/access?`,
    ),
  );
  assert.equal(
    (await handle("progress", { accessUrl, materialId, completed: false }))
      .status,
    200,
  );
  assert.equal(calls[1].method, "PATCH");
  assert.equal(calls[1].body, '{"completed":false}');
  assert.equal(
    calls[1].url,
    accessUrl.replace(
      "/training?",
      `/training/materials/${materialId}/progress?`,
    ),
  );
  assert.equal(
    (await handle("progress", { accessUrl, materialId, completed: "true" }))
      .status,
    400,
  );
  assert.equal(calls.length, 2);
});

test("recovery forwards only learner cookies and CSRF, preserves restricted HttpOnly cookies", async () => {
  const { handle, calls } = harness(
    json({ csrfToken: csrf, expiresInSeconds: 300 }, 200, {
      "Set-Cookie":
        "fdk-training-flow-dev=synthetic; Path=/; HttpOnly; SameSite=Lax",
    }),
  );
  const response = await handle("flow", null, {
    headers: { Cookie: "account=private; fdk-training-session-dev=synthetic" },
  });
  assert.equal(response.status, 200);
  assert.equal(
    calls[0].headers.get("Cookie"),
    "fdk-training-session-dev=synthetic",
  );
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly/);
  const invalidCookie = await handle("flow", null, {
    headers: {
      Cookie: "fdk-training-session-dev=a; fdk-training-session-dev=b",
    },
  });
  assert.equal(invalidCookie.status, 400);
  const write = harness(
    json(
      {
        challengeId,
        expiresInSeconds: 300,
        resendAfterSeconds: 60,
        message: "Discard server message",
      },
      202,
    ),
  );
  assert.equal(
    (await write.handle("challenges", { email: " demo@example.test " })).status,
    403,
  );
  const challenge = await write.handle(
    "challenges",
    { email: " demo@example.test " },
    {
      headers: {
        "X-Training-CSRF": csrf,
        Cookie: "fdk-training-flow-dev=synthetic",
      },
    },
  );
  assert.equal(challenge.status, 202);
  assert.equal(write.calls[0].headers.get("X-Training-CSRF"), csrf);
  assert.equal(write.calls[0].body, '{"email":"demo@example.test"}');
  assert.equal("message" in (await challenge.json()), false);
});

test("verification accepts only backend 204; reads never interpret 202 as entitlement", async () => {
  const success = harness(
    new Response(null, {
      status: 204,
      headers: {
        "Set-Cookie":
          "fdk-training-session-dev=synthetic; Path=/; HttpOnly; SameSite=Lax",
      },
    }),
  );
  assert.equal(
    (
      await success.handle(
        `challenges/${challengeId}/verify`,
        { code: "012345" },
        { headers: { "X-Training-CSRF": csrf } },
      )
    ).status,
    204,
  );
  assert.equal(success.calls[0].body, '{"code":"012345"}');
  const premature = harness(json(curriculum, 202));
  assert.equal((await premature.handle("course", { accessUrl })).status, 502);
  const wrongStatus = harness(json({}, 200));
  assert.equal(
    (
      await wrongStatus.handle(
        `challenges/${challengeId}/verify`,
        { code: "012345" },
        { headers: { "X-Training-CSRF": csrf } },
      )
    ).status,
    502,
  );
});

test("404 is terminal for the supplied identifiers; errors never echo secrets or upstream messages", async () => {
  for (const [status, errorCode] of [
    [404, "NO_RESULT"],
    [403, "TRAINING_ACCESS_REQUIRED"],
    [503, "INVALID_REQUEST"],
    [429, "VERIFICATION_RATE_LIMITED"],
  ]) {
    const { handle, calls } = harness(
      json(
        { errorCode, message: accessUrl, stack: "synthetic-secret" },
        status,
        { "Retry-After": "60" },
      ),
    );
    const response = await handle("course", { accessUrl });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { statusCode: status, errorCode });
    assert.equal(calls.length, 1);
    assert.equal(response.headers.get("Retry-After"), "60");
  }
  const redirected = harness(
    new Response(null, { status: 302, headers: { Location: accessUrl } }),
  );
  assert.equal((await redirected.handle("course", { accessUrl })).status, 502);
  assert.equal(redirected.calls.length, 1);
  const broken = harness(() => {
    throw new Error(accessUrl);
  });
  assert.doesNotMatch(
    await (await broken.handle("course", { accessUrl })).text(),
    /synthetic|accessToken/,
  );
});

test("restricted purchase list strips selection capabilities and private material links expire", async () => {
  const { handle } = harness(
    json({ content: [purchase], totalPages: 1, totalElements: 1 }),
  );
  const response = await handle("trainings?page=0&size=20");
  assert.equal(response.status, 200);
  assert.equal("selectionToken" in (await response.json()).content[0], false);
  const expired = harness(
    json({
      materialId,
      type: "FILE",
      url: "https://private.example.test/file?signature=synthetic",
      expiresAt: "2000-01-01T00:00:00Z",
    }),
  );
  const failure = await expired.handle("material", { accessUrl, materialId });
  assert.equal(failure.status, 502);
  assert.equal((await failure.json()).errorCode, "ACCESS_EXPIRED");
});

test("same-origin validation uses the browser Host through Next internal URLs and TLS termination", async () => {
  const calls = [];
  const handle = createLearningHandler({
    apiBase: "https://api.example.test",
    fetchImpl: async (url, init) => {
      calls.push(init);
      return json(curriculum);
    },
  });
  const make = (headers) =>
    new Request("http://localhost:3000/api/learning/course", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: "commerce.example.test",
        "X-Forwarded-Proto": "https",
        ...headers,
      },
      body: JSON.stringify({ accessUrl }),
    });
  assert.equal(
    (await handle(make({ Origin: origin }), ["course"])).status,
    200,
  );
  assert.equal(calls[0].headers.get("Origin"), origin);
  assert.equal(
    (
      await handle(
        make({
          Origin: "https://attacker.test",
          "X-Forwarded-Host": "attacker.test",
        }),
        ["course"],
      )
    ).status,
    403,
  );
  assert.equal(calls.length, 1);
});

test("plain-text CORS or infrastructure errors retain their HTTP denial without forwarding the body", async () => {
  for (const status of [403, 503]) {
    const { handle } = harness(
      new Response("Invalid CORS request: synthetic-private-detail", {
        status,
      }),
    );
    const response = await handle("session");
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), {
      statusCode: status,
      errorCode: status === 403 ? "PERMISSION_DENIED" : "TRAINING_TEMPORARY",
    });
  }
});
