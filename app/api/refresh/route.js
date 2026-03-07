import { cacheClear } from '@/lib/cache';

export async function POST() {
    cacheClear();
    return Response.json({ success: true, message: 'All caches cleared', timestamp: new Date().toISOString() });
}
