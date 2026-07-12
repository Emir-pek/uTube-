/**
 * URL Helper Utility
 * Dynamically constructs asset URLs based on the active environment.
 * Uses Vite environment variables (import.meta.env) with reliable fallbacks.
 *
 * ARCHITECTURE NOTE:
 * - API routes live under /api/v1/* (proxied by Vite in dev)
 * - Static files live under /storage/* and /uploads/* (also proxied in dev)
 * - In production, Nginx handles both proxies to the backend
 */

// --- Environment-Driven Base URLs ---
const IS_PROD = import.meta.env.PROD;
// In dev, fallback to localhost:8000. In prod, fallback to origin.
const FALLBACK_HOST = IS_PROD ? window.location.origin : 'http://localhost:8000';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (IS_PROD ? '/api' : 'http://localhost:8000/api');
const MEDIA_BASE_URL = import.meta.env.VITE_MEDIA_BASE_URL || (IS_PROD ? '' : 'http://localhost:8000');
const FLV_BASE_URL = import.meta.env.VITE_FLV_BASE_URL || 'http://localhost:8080/live';
const RTMP_URL = import.meta.env.VITE_RTMP_URL || 'rtmp://localhost:1935/live';

// WebSocket URL — auto-derive from current host in dev, explicit in prod
const WS_BASE_URL = import.meta.env.VITE_WS_URL ||
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

/**
 * Constructs a valid, full URL for a given asset path.
 * - Returns absolute URLs (http/https) as-is.
 * - Paths starting with /storage or /uploads are media paths — they go through
 *   the media proxy, NOT the API prefix.
 * - All other relative paths get the API_BASE_URL prefix.
 * @param {string} path - The raw asset path from the backend.
 * @param {string} fallback - A fallback URL if the path is invalid.
 * @returns {string}
 */
export const getValidUrl = (path, fallback) => {
    if (!path || path === '' || path.includes('synthetic')) return fallback;

    // Already an absolute URL — return directly
    if (path.startsWith('http')) return path;

    // Clear whitespace and ensure leading slash
    let normalizedPath = path.trim();
    if (!normalizedPath.startsWith('/')) {
        normalizedPath = `/${normalizedPath}`;
    }

    // Static media paths: /storage/* is served directly by the backend.
    // Legacy DB paths starting with /uploads or /backgrounds must be prefixed with /storage
    // Also handle cases where /api/ was accidentally included in the stored path
    if (normalizedPath.startsWith('/api/uploads') || normalizedPath.startsWith('/api/backgrounds')) {
        normalizedPath = normalizedPath.replace('/api/', '/storage/');
    } else if (normalizedPath.startsWith('/uploads') || normalizedPath.startsWith('/backgrounds')) {
        normalizedPath = `/storage${normalizedPath}`;
    }

    if (normalizedPath.startsWith('/storage')) {
        return `${MEDIA_BASE_URL}${normalizedPath}`;
    }

    return `${API_BASE_URL}${normalizedPath}`;
};

/**
 * Constructs a valid avatar URL.
 * Falls back to ui-avatars.com if no valid path is provided.
 * @param {string} path - The raw avatar path from the backend.
 * @param {string} username - The username for the fallback avatar.
 * @returns {string}
 */
export const getAvatarUrl = (path, username) => {
    const fallback = `https://ui-avatars.com/api/?name=${username || 'User'}&background=random&color=fff`;

    if (!path || path === '' || path.includes('default') || path.includes('synthetic')) {
        return fallback;
    }

    // If it's just a filename (no slashes), assume it's in the storage/uploads/avatars directory
    if (!path.startsWith('http') && !path.includes('/')) {
        const mediaPath = `/storage/uploads/avatars/${path}`;
        return getMediaUrl(mediaPath) || fallback;
    }

    return getMediaUrl(path) || fallback;
};

/**
 * Constructs a full media URL for assets served from the storage/media server.
 * Use this for paths that are already known to be media paths (e.g., from Upload.jsx).
 * @param {string} path - The relative path (e.g., /storage/uploads/previews/frame.jpg)
 * @returns {string}
 */
export const getMediaUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;

    let normalizedPath = path.trim();
    if (!normalizedPath.startsWith('/')) {
        normalizedPath = `/${normalizedPath}`;
    }

    return `${MEDIA_BASE_URL}${normalizedPath}`;
};

// --- Exported Constants ---
export { API_BASE_URL, MEDIA_BASE_URL, FLV_BASE_URL, RTMP_URL, WS_BASE_URL };

export const THUMBNAIL_FALLBACK = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800';
export const AVATAR_FALLBACK = 'https://ui-avatars.com/api/?name=User&background=random&color=fff';
export const VIDEO_FALLBACK = 'https://vjs.zencdn.net/v/oceans.mp4';
