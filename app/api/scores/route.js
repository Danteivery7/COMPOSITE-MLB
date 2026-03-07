import { fetchScoreboard } from '@/lib/espn';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await fetchScoreboard();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Scores API error:', error);
        return NextResponse.json(
            { games: [], error: error.message, lastUpdated: null },
            { status: 500 }
        );
    }
}
