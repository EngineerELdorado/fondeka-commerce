const DEFAULT_API_PORT = '8080';

function fallbackApiBase() {
    if (typeof window !== 'undefined') {
        const { protocol, hostname } = window.location || {};
        if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') {
            return `${protocol || 'http:'}//${hostname}:${DEFAULT_API_PORT}`;
        }
    }
    return `http://localhost:${DEFAULT_API_PORT}`;
}

export function getApiBase() {
    return process.env.NEXT_PUBLIC_API_BASE || fallbackApiBase();
}

export const API_BASE = getApiBase();

export async function apiFetch(path, init) {
    const res = await fetch(`${getApiBase()}${path}`, {
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
