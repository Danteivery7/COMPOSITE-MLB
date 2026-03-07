import { computeRankings } from '@/lib/rankings';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await computeRankings();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Rankings API error:', error);
        return NextResponse.json(
            { rankings: [], error: error.message, lastUpdated: null },
            { status: 500 }
        );
    }
}
