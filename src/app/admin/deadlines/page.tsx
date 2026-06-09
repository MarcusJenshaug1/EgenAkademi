import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getDeadlineOverview } from '@/app/actions/deadlineActions';
import DeadlinesClient from './DeadlinesClient';

export default async function DeadlinesPage() {
    const session = await auth();

    if (!session?.user?.tenantId) {
        redirect('/admin');
    }

    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        redirect('/admin');
    }

    const overview = await getDeadlineOverview();

    if ('error' in overview) {
        return <DeadlinesClient initialError={overview.error} />;
    }

    return <DeadlinesClient overview={overview} />;
}
