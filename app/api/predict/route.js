/**
 * /api/predict — Game prediction endpoint
 * Accepts teamA (away) and teamB (home) IDs
 */

export const dynamic = 'force-dynamic';

import { predict } from '@/lib/predictor';

export async function POST(request) {
    try {
        const body = await request.json();
        const { teamA: teamAId, teamB: teamBId, formEmphasis, neutralSite } = body;

        if (!teamAId || !teamBId) {
            return Response.json(
                { error: 'Both teamA and teamB are required' },
                { status: 400 }
            );
        }

        if (teamAId === teamBId) {
            return Response.json(
                { error: 'Teams must be different' },
                { status: 400 }
            );
        }

        // The predict function handles rankings lookup internally
        const prediction = await predict(teamAId, teamBId, {
            formEmphasis: formEmphasis ?? 0.5,
            neutralSite: neutralSite ?? false,
        });

        return Response.json(prediction);
    } catch (error) {
        console.error('Predict API error:', error);
        return Response.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
