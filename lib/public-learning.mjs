export const materialIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const referencePattern = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,119}$/;
const positiveId = (value) =>
  ["number", "string"].includes(typeof value) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0;
const invalid = (code = "INVALID_RESPONSE") =>
  Object.assign(new Error(code), { code, status: 502 });
const text = (value, maximum, required = false) => {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    (required && !value.trim())
  )
    throw invalid();
  return value;
};

export function webUrl(value, httpsOnly = false) {
  if (typeof value !== "string" || value.length > 8192) throw invalid();
  let url;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  if (
    !(httpsOnly
      ? url.protocol === "https:"
      : ["http:", "https:"].includes(url.protocol)) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw invalid();
  return url;
}

export function purchaseScope(accessUrl) {
  const url = webUrl(accessUrl);
  const match =
    /^\/public\/commerce\/orders\/([^/]+)\/items\/([1-9]\d*)\/training$/.exec(
      url.pathname,
    );
  if (!match || !positiveId(match[2])) throw invalid();
  let reference;
  try {
    reference = decodeURIComponent(match[1]);
  } catch {
    throw invalid();
  }
  const tokens = url.searchParams.getAll("accessToken");
  if (
    !referencePattern.test(reference) ||
    tokens.length !== 1 ||
    !tokens[0] ||
    tokens[0].length > 512 ||
    [...url.searchParams.keys()].some(
      (key) => !["accessToken", "lang"].includes(key),
    )
  )
    throw invalid();
  return {
    reference,
    itemId: String(match[2]),
    key: `${reference}:${match[2]}`,
    url,
  };
}

export function learnerPurchase(value) {
  const accessUrl = value?.trainingAccessUrl ?? value?.accessUrl;
  const playerUrl = value?.trainingPlayerUrl ?? value?.playerUrl;
  const scope = purchaseScope(accessUrl);
  webUrl(playerUrl);
  if (
    !positiveId(value?.productId) ||
    (value.orderReference != null &&
      String(value.orderReference) !== scope.reference) ||
    (value.orderItemId != null && String(value.orderItemId) !== scope.itemId)
  )
    throw invalid();
  // Credentials always travel in the exact backend-issued URLs, never stitched from other purchases.
  return {
    key: scope.key,
    productId: Number(value.productId),
    reference: scope.reference,
    itemId: scope.itemId,
    title: text(value.title || value.productName || value.name, 180, true),
    accessUrl,
    playerUrl,
  };
}

export function learnerPurchasePage(value) {
  if (
    !Array.isArray(value?.content) ||
    value.content.length > 100 ||
    !Number.isSafeInteger(value.totalPages) ||
    value.totalPages < 0 ||
    !Number.isSafeInteger(value.totalElements) ||
    value.totalElements < 0
  )
    throw invalid();
  const seen = new Set();
  const content = value.content.map((item) => {
    const purchase = learnerPurchase(item);
    if (seen.has(purchase.key)) throw invalid();
    seen.add(purchase.key);
    return purchase;
  });
  return {
    content,
    totalPages: value.totalPages,
    totalElements: value.totalElements,
  };
}

export function learnerCurriculum(value) {
  if (
    !positiveId(value?.productId) ||
    !Array.isArray(value.modules) ||
    value.modules.length > 100 ||
    !Number.isSafeInteger(value.version) ||
    value.version < 0
  )
    throw invalid();
  const ids = new Set();
  const identity = (id) => {
    if (typeof id !== "string" || !materialIdPattern.test(id) || ids.has(id))
      throw invalid();
    ids.add(id);
    return id;
  };
  const modules = value.modules.map((module) => {
    if (
      !module ||
      module.published === false ||
      !Array.isArray(module.materials) ||
      module.materials.length > 200
    )
      throw invalid();
    return {
      id: identity(module.id),
      title: text(module.title, 180, true),
      description: text(module.description || "", 4000),
      materials: module.materials.map((material) => {
        if (
          !material ||
          material.published === false ||
          !["FILE", "LINK"].includes(material.type) ||
          typeof material.completed !== "boolean"
        )
          throw invalid();
        return {
          id: identity(material.id),
          title: text(material.title, 180, true),
          description: text(material.description || "", 4000),
          type: material.type,
          completed: material.completed,
          linkProvider:
            material.type === "LINK" && material.linkProvider === "YOUTUBE"
              ? "YOUTUBE"
              : null,
        };
      }),
    };
  });
  const materials = modules.flatMap((module) => module.materials);
  if (
    materials.length > 2000 ||
    !Number.isSafeInteger(value.totalMaterials) ||
    value.totalMaterials < 0 ||
    !Number.isSafeInteger(value.completedMaterials) ||
    value.completedMaterials < 0 ||
    value.completedMaterials > value.totalMaterials ||
    !Number.isFinite(value.progressPercentage) ||
    value.progressPercentage < 0 ||
    value.progressPercentage > 100 ||
    (value.nextMaterialId != null &&
      !materials.some((material) => material.id === value.nextMaterialId))
  )
    throw invalid();
  return {
    productId: Number(value.productId),
    title: text(value.title, 180, true),
    version: value.version,
    modules,
    totalMaterials: value.totalMaterials,
    completedMaterials: value.completedMaterials,
    progressPercentage: value.progressPercentage,
    nextMaterialId: value.nextMaterialId || null,
  };
}

export function learnerMaterialAccess(
  value,
  expectedMaterialId,
  now = Date.now(),
) {
  if (
    value?.materialId !== expectedMaterialId ||
    !materialIdPattern.test(expectedMaterialId) ||
    !["FILE", "LINK"].includes(value.type)
  )
    throw invalid();
  webUrl(value.url, true);
  if (
    value.type === "FILE" &&
    (!value.expiresAt ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      Date.parse(value.expiresAt) <= now)
  )
    throw invalid("ACCESS_EXPIRED");
  if (
    value.expiresAt &&
    (!Number.isFinite(Date.parse(value.expiresAt)) ||
      Date.parse(value.expiresAt) <= now)
  )
    throw invalid("ACCESS_EXPIRED");
  return {
    materialId: value.materialId,
    type: value.type,
    url: value.url,
    expiresAt: value.expiresAt || null,
    fileName:
      typeof value.fileName === "string" ? value.fileName.slice(0, 255) : null,
  };
}

export function youtubeDestination(value) {
  try {
    const url = webUrl(value, true);
    return (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be",
        "www.youtu.be",
        "youtube-nocookie.com",
        "www.youtube-nocookie.com",
      ].includes(url.hostname) &&
      (!url.port || url.port === "443")
    );
  } catch {
    return false;
  }
}

export function learningReturnPath(value) {
  if (
    typeof value !== "string" ||
    value.length > 180 ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)
  )
    return null;
  return `/stores/${encodeURIComponent(value)}`;
}

export function learningLink(store, language) {
  const params = new URLSearchParams();
  if (learningReturnPath(store)) params.set("store", store);
  if (language === "fr") params.set("lang", "fr");
  return `/learning${params.size ? `?${params}` : ""}`;
}
