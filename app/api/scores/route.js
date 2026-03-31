import { fetchScoreboard } from '@/lib/espn';
import { predict } from '@/lib/predictor';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await fetchScoreboard();
        
        // Inject predictions for pre-game matchups
        if (data && data.games) {
            const predictions = await Promise.all(
                data.games.map(async (game) => {
                    if (game.state === 'pre' && game.away?.teamId && game.home?.teamId) {
                        try {
                            const prediction = await predict(game.away.teamId, game.home.teamId, { neutralSite: false });
                            return { id: game.id, prediction };
                        } catch (err) {
                            return null;
                        }
                    }
                    return null;
                })
            );
            
            predictions.forEach(p => {
                if (p) {
                    const game = data.games.find(g => g.id === p.id);
                    if (game) game.prediction = p.prediction;
                }
            });
        }
        
        return NextResponse.json(data);
    } catch (error) {
        console.error('Scores API error:', error);
        return NextResponse.json(
            { games: [], error: error.message, lastUpdated: null },
            { status: 500 }
        );
    }
}
