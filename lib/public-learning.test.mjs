import test from "node:test";
import assert from "node:assert/strict";
import {
  learnerCurriculum,
  learnerMaterialAccess,
  learnerPurchase,
  learnerPurchasePage,
  learningLink,
  purchaseScope,
  webUrl,
  youtubeDestination,
} from "./public-learning.mjs";

import {
  accessUrl,
  playerUrl,
  materialId,
  moduleId,
  purchase,
  curriculum,
} from "./test-fixtures/learning.mjs";

test("purchase scope preserves exact backend URLs and rejects mismatched or ambiguous credentials", () => {
  const result = learnerPurchase(purchase);
  assert.equal(result.accessUrl, accessUrl);
  assert.equal(result.playerUrl, playerUrl);
  assert.equal(result.key, "DEMO:42");
  assert.equal("selectionToken" in result, false);
  for (const patch of [
    { orderReference: "OTHER" },
    { orderItemId: 43 },
    { trainingPlayerUrl: null },
    { trainingAccessUrl: accessUrl + "&accessToken=other" },
    { trainingAccessUrl: accessUrl + "&redirect=https://elsewhere.test" },
  ]) {
    assert.throws(() => learnerPurchase({ ...purchase, ...patch }), {
      code: "INVALID_RESPONSE",
    });
  }
  for (const value of [
    "https://u:p@api.example.test/public/commerce/orders/DEMO/items/42/training?accessToken=synthetic",
    accessUrl.replace("/DEMO/", "/bad%2Fscope/"),
    accessUrl.replace("/42/", "/0/"),
    accessUrl + "#fragment",
    "javascript:alert(1)",
  ])
    assert.throws(() => purchaseScope(value));
  try {
    webUrl("not-a-url-containing-synthetic-secret");
    assert.fail();
  } catch (error) {
    assert.equal(error.message, "INVALID_RESPONSE");
    assert.equal("input" in error, false);
  }
});

test("recovery keeps distinct order-item scopes for repeat purchases of the same product", () => {
  const second = {
    ...purchase,
    orderItemId: 43,
    trainingAccessUrl: accessUrl.replace("/42/", "/43/"),
  };
  const page = learnerPurchasePage({
    content: [purchase, second],
    totalPages: 1,
    totalElements: 2,
  });
  assert.deepEqual(
    page.content.map((item) => item.key),
    ["DEMO:42", "DEMO:43"],
  );
  assert.throws(() =>
    learnerPurchasePage({
      content: [purchase, purchase],
      totalPages: 1,
      totalElements: 2,
    }),
  );
});

test("curriculum retains backend order, notes, completion and next ID while stripping source fields", () => {
  const result = learnerCurriculum(curriculum);
  assert.equal(result.nextMaterialId, materialId);
  assert.equal(
    result.modules[0].materials[0].description,
    "Private learner notes",
  );
  for (const key of ["linkUrl", "assetKey", "fileName"])
    assert.equal(key in result.modules[0].materials[0], false);
  const later = {
    ...curriculum.modules[0].materials[0],
    id: "33333333-3333-4333-8333-333333333333",
    position: 0,
  };
  const source = structuredClone(curriculum);
  source.modules[0].materials.push(later);
  assert.deepEqual(
    learnerCurriculum(source).modules[0].materials.map((item) => item.id),
    [materialId, later.id],
  );
  assert.throws(() =>
    learnerCurriculum({ ...curriculum, nextMaterialId: moduleId }),
  );
  source.modules[0].materials[0].published = false;
  assert.throws(() => learnerCurriculum(source));
});

test("material access requires exact material identity, HTTPS and a live private file expiry", () => {
  const file = {
    materialId,
    type: "FILE",
    url: "https://storage.example.test/private?signature=synthetic",
    expiresAt: "2030-01-01T00:01:00Z",
  };
  assert.equal(
    learnerMaterialAccess(file, materialId, Date.parse("2030-01-01T00:00:00Z"))
      .url,
    file.url,
  );
  assert.throws(
    () => learnerMaterialAccess(file, materialId, Date.parse(file.expiresAt)),
    { code: "ACCESS_EXPIRED" },
  );
  assert.throws(() =>
    learnerMaterialAccess({ ...file, expiresAt: null }, materialId),
  );
  assert.throws(() =>
    learnerMaterialAccess({ ...file, materialId: moduleId }, materialId),
  );
  assert.throws(() =>
    learnerMaterialAccess(
      { ...file, url: "http://storage.example.test/public" },
      materialId,
    ),
  );
  assert.equal(youtubeDestination("https://youtu.be/synthetic"), true);
  assert.equal(
    youtubeDestination("https://youtube.com.attacker.test/synthetic"),
    false,
  );
  assert.equal(
    learningLink("demo-store", "fr"),
    "/learning?store=demo-store&lang=fr",
  );
  assert.equal(learningLink("//attacker.test", "en"), "/learning");
});
