import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getLearnerNotifications } from '@/app/actions/learnerActions';
import NotificationsClient from './NotificationsClient';

export default async function NotificationsPage() {
    const session = await auth();
    if (!session?.user?.tenantId) redirect('/login');

    const result = await getLearnerNotifications();

    if ('error' in result) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <p>Kunne ikke laste varslene dine.</p>
            </div>
        );
    }

    return <NotificationsClient notifications={result.notifications} />;
}
