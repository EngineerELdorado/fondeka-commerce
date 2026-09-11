export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080';

export async function apiFetch(path, init) {
    const res = await fetch(`${API_BASE}${path}`, {
        cache: 'no-store',
        ...init,
        headers: {
            Accept: 'application/json',
            ...(init?.headers || {}),
        },
    });

    let payload = null;
    try {
        payload = await res.json();
    } catch {
        payload = null;
    }

    if (!res.ok) {
        const error = new Error(payload?.message || `HTTP ${res.status}`);
        error.payload = {
            message: payload?.message || `HTTP ${res.status}`,
            errorCode: payload?.errorCode || null,
            statusCode: payload?.statusCode || res.status,
            details: payload?.details || null,
        };
        throw error;
    }

    return payload;
}
