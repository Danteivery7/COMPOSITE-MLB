/**
 * In-memory cache with TTL support
 * Keys are scoped by type for easy invalidation
 */

import fs from 'fs';

const cache = new Map();
const CACHE_FILE = '/tmp/mlbrankings_cache.json';

export const CACHE_TTL = {
    SCORES: 10,         // 10 seconds for live scores
    RANKINGS: 10,       // 10 seconds for rankings
    STATS: 10,          // 10 seconds for team stats
    TEAM_DETAIL: 604800, // 7 days (revalidated in background every 10s)
    ROSTER: 10,         // 10 seconds for rapid 40-man roster updates
    SCHEDULE: 10,       // 10 seconds for schedules
    PLAYER_STATS: 10,   // 10 seconds for individual player stats
    PLAYERS_TOP: 604800, // 7 days (revalidated in background every 60s)
};

// Load from disk on boot
try {
    if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
            if (Date.now() <= v.expires) cache.set(k, v);
        }
    }
} catch (e) { }

function persistCache() {
    try {
        const obj = {};
        for (const [k, v] of cache.entries()) {
            if (Date.now() <= v.expires) obj[k] = v;
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(obj), 'utf8');
    } catch (e) { }
}

export function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
        cache.delete(key);
        setTimeout(persistCache, 0);
        return null;
    }
    return entry.data;
}

export function cacheSet(key, data, ttlSeconds) {
    cache.set(key, {
        data,
        expires: Date.now() + ttlSeconds * 1000,
        created: Date.now(),
    });
    setTimeout(persistCache, 0);
}

export function cacheDelete(key) {
    cache.delete(key);
    setTimeout(persistCache, 0);
}

export function cacheClear() {
    cache.clear();
    setTimeout(persistCache, 0);
}
