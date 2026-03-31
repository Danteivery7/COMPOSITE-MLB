import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q || q.length < 2) {
        return NextResponse.json({ results: [] });
    }

    try {
        const res = await fetch(
            `https://site.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&limit=15`,
            { headers: { 'User-Agent': 'MLBDashboard/1.0' } }
        );

        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        const data = await res.json();
        
        // Find the players block in the search results
        const playersBlock = (data.results || []).find(r => r.type === 'player' || r.displayName === 'Players');
        const contents = playersBlock?.contents || [];

        const results = contents
            .filter(a => a.sport === 'baseball') // Ensure they are MLB players, not golfers
            .map(a => {
                // Extract athlete ID from UID (e.g. "s:1~l:10~a:39832")
                let id = a.id;
                if (a.uid && a.uid.includes('~a:')) {
                    id = a.uid.split('~a:')[1];
                }
                return {
                    id: id,
                    name: a.displayName || a.fullName,
                    team: a.subtitle || 'FA',
                    teamName: a.subtitle || '', // Note: Search API doesn't give full team object, but subtitle often has it
                    position: '', 
                    headshot: a.image?.default || `https://a.espncdn.com/i/headshots/mlb/players/full/${id}.png`,
                    jersey: '' 
                };
            });

        return NextResponse.json({ results });
    } catch (e) {
        console.error('Player search error:', e.message);
        return NextResponse.json({ results: [], error: e.message }, { status: 500 });
    }
}
