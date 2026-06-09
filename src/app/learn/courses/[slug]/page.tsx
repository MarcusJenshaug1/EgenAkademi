import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getLearnerCourseDetail } from '@/app/actions/learnerActions';
import CourseDetailClient from './CourseDetailClient';

interface Props {
    params: Promise<{ slug: string }>;
}

export default async function LearnerCourseDetailPage({ params }: Props) {
    const session = await auth();
    if (!session?.user?.tenantId) redirect('/login');

    const { slug } = await params;
    const result = await getLearnerCourseDetail(slug);

    if ('error' in result) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <p>{result.error}</p>
            </div>
        );
    }

    return <CourseDetailClient data={result.data} />;
}
