import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getLearnerDashboard } from '@/app/actions/learnerActions';
import DashboardClient from './DashboardClient';

export default async function LearnDashboardPage() {
    const session = await auth();
    if (!session?.user?.tenantId) redirect('/login');

    const result = await getLearnerDashboard();
    if ('error' in result) {
        return <div>Feil: {result.error}</div>;
    }

    const rawName = session.user.name?.split(' ')[0] || session.user.email?.split('@')[0] || 'du';
    const firstName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    return <DashboardClient data={result.data} firstName={firstName} />;
}
