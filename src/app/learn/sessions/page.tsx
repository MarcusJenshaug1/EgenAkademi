import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listMySessions } from '@/app/actions/sessionActions';
import LearnSessionsClient from './LearnSessionsClient';

export default async function LearnSessionsPage() {
    const session = await auth();
    if (!session?.user?.tenantId) redirect('/login');

    const result = await listMySessions();

    if ('error' in result) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <p>Kunne ikke laste sesjonene.</p>
            </div>
        );
    }

    return <LearnSessionsClient initialSessions={result.sessions} />;
}
