import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getLearnerProfile } from '@/app/actions/learnerActions';
import ProfileClient from './ProfileClient';

export default async function ProfilePage() {
    const session = await auth();
    if (!session?.user?.tenantId) redirect('/login');

    const result = await getLearnerProfile();

    if ('error' in result) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <p>Kunne ikke laste profilen din.</p>
            </div>
        );
    }

    return <ProfileClient profile={result.profile} />;
}
