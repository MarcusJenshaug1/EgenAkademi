import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getPlayerData } from '@/app/actions/learnerActions';
import PlayerClient from './PlayerClient';

interface Props {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ lesson?: string }>;
}

export default async function CoursePlayerPage({ params, searchParams }: Props) {
    const session = await auth();
    if (!session?.user?.tenantId) redirect('/login');

    const { slug } = await params;
    const sp = await searchParams;

    // We need the enrollment id — get it from course detail first
    // The player action needs an enrollmentId. We'll fetch course detail to get it
    const { getLearnerCourseDetail } = await import('@/app/actions/learnerActions');
    const detailResult = await getLearnerCourseDetail(slug);

    if ('error' in detailResult) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <p>{detailResult.error}</p>
            </div>
        );
    }

    const enrollment = detailResult.data.enrollment;
    if (!enrollment) {
        redirect(`/learn/courses/${slug}`);
    }

    const result = await getPlayerData(enrollment.enrollmentId, sp.lesson ?? undefined);

    if ('error' in result) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <p>{result.error}</p>
            </div>
        );
    }

    return <PlayerClient data={result.data} courseSlug={slug} />;
}
