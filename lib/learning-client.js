export async function learningRequest(
  action,
  { method = "GET", body, csrf, language = "en", signal } = {},
) {
  const response = await fetch(`/api/learning/${action}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal,
    headers: {
      Accept: "application/json",
      "Accept-Language": language,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(csrf ? { "X-Training-CSRF": csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok || (response.status !== 204 && !data)) {
    const error = new Error("Learning request failed");
    error.status = response.ok ? 502 : response.status;
    error.code =
      data?.errorCode ||
      (response.ok ? "INVALID_RESPONSE" : "TRAINING_TEMPORARY");
    error.retryAfter = Number(response.headers.get("Retry-After")) || 0;
    throw error;
  }
  return data;
}
