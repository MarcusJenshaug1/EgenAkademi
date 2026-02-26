import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getMyLearning } from '@/app/actions/learnerActions';
import MyLearningClient from './MyLearningClient';

interface Props {
    searchParams: Promise<{ status?: string; sort?: string }>;
}

export default async function MyLearningPage({ searchParams }: Props) {
    const session = await auth();
    if (!session?.user?.tenantId) redirect('/login');

    const sp = await searchParams;

    const result = await getMyLearning({
        status: sp.status,
        sort: sp.sort,
    });

    if ('error' in result) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <p>Kunne ikke laste kursene dine.</p>
            </div>
        );
    }

    return <MyLearningClient items={result.items} initialStatus={sp.status ?? null} initialSort={sp.sort ?? 'lastActivityAt'} />;
}
