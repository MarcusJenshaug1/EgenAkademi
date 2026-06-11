import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getMyGamification, getLeaderboardPublic } from '@/app/actions/gamificationActions';
import LeaderboardClient from './LeaderboardClient';

export default async function LeaderboardPage() {
    const session = await auth();
    if (!session?.user?.tenantId) redirect('/login');

    const [myResult, lbResult] = await Promise.all([getMyGamification(), getLeaderboardPublic()]);

    const me = 'error' in myResult ? null : myResult.data;
    const leaderboard = 'error' in lbResult ? { entries: [], enabled: false } : lbResult;

    // Featuren regnes som av hvis verken egen-status eller topplista er aktivert.
    const enabled = (me?.enabled ?? false) || leaderboard.enabled;

    return <LeaderboardClient me={me} entries={leaderboard.entries} enabled={enabled} />;
}
