import { NextResponse } from 'next/server';

/**
 * PLAYER SEARCH API (v2)
 * Robustly scans for all MLB athletes across 'Top Results', 'Athletes', and 'Players' blocks.
 * Fixes the issue where elite pitchers like Edwin Diaz were being filtered out of the response.
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q || q.length < 2) {
        return NextResponse.json({ results: [] });
    }

    try {
        const res = await fetch(
            `https://site.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&limit=20`,
            { headers: { 'User-Agent': 'MLBDashboard/1.0' } }
        );

        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        const data = await res.json();
        
        // 1. Collect all results from 'Top Results', 'Players', and 'Athletes'
        const allBlocks = data.results || [];
        let rawAthletes = [];
        
        for (const block of allBlocks) {
            const label = (block.displayName || block.type || '').toLowerCase();
            const isRelevantBlock = label.includes('player') || label.includes('athlete') || label.includes('top result');
            
            if (isRelevantBlock && Array.isArray(block.contents)) {
                rawAthletes = [...rawAthletes, ...block.contents];
            }
        }

        // 2. Filter for baseball only and Map to our standardized format
        const seenIds = new Set();
        const results = rawAthletes
            .filter(a => {
                const isBaseball = a.sport === 'baseball' || (a.uid && a.uid.includes('l:10')); // l:10 is MLB
                if (!isBaseball) return false;
                
                // Extract ID and check for duplicates
                let id = a.id;
                if (a.uid && a.uid.includes('~a:')) {
                    id = a.uid.split('~a:')[1];
                }
                if (seenIds.has(id)) return false;
                seenIds.add(id);
                return true;
            })
            .map(a => {
                let id = a.id;
                if (a.uid && a.uid.includes('~a:')) {
                    id = a.uid.split('~a:')[1];
                }
                return {
                    id: id,
                    name: a.displayName || a.fullName,
                    team: a.subtitle || 'FA',
                    teamName: a.subtitle || '',
                    position: a.position?.abbreviation || a.description || '', 
                    headshot: a.image?.default || `https://a.espncdn.com/i/headshots/mlb/players/full/${id}.png`,
                    jersey: a.jersey || '' 
                };
            });

        return NextResponse.json({ results: results.slice(0, 15) });
    } catch (e) {
        console.error('Player search error:', e.message);
        return NextResponse.json({ results: [], error: e.message }, { status: 500 });
    }
}
