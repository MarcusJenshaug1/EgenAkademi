import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getMySkillProfile, getMySkillGap } from '@/app/actions/skillActions';
import MySkillsClient from './MySkillsClient';

export default async function MySkillsPage() {
    const session = await auth();
    if (!session?.user?.tenantId) redirect('/login');

    const [profileResult, gapResult] = await Promise.all([getMySkillProfile(), getMySkillGap()]);

    // Generic failure (both error): show a friendly message.
    if ('error' in profileResult && 'error' in gapResult) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <p>Kunne ikke laste kompetanseprofilen din.</p>
            </div>
        );
    }

    const profile = 'error' in profileResult ? { skills: [] } : profileResult;
    const gap = 'error' in gapResult ? { gaps: [], recommendedCourses: [] } : gapResult;

    const locked =
        ('locked' in profileResult && profileResult.locked) ||
        ('locked' in gapResult && gapResult.locked) ||
        false;
    const reason =
        ('reason' in profileResult ? profileResult.reason : undefined) ||
        ('reason' in gapResult ? gapResult.reason : undefined);

    return <MySkillsClient profile={profile} gap={gap} locked={locked} reason={reason} />;
}
