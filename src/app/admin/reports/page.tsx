import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import {
    getOverviewMetrics,
    getCourseCompletion,
    type OverviewMetrics,
    type CourseCompletionRow,
} from '@/app/actions/reportActions';
import ReportsClient from './ReportsClient';

export default async function ReportsPage() {
    const session = await auth();

    if (!session?.user?.tenantId) {
        redirect('/admin');
    }

    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        redirect('/admin');
    }

    // Hent server-side via gjenbrukbare actions (auth sjekkes på nytt inni hver action).
    const [overviewResult, completionResult] = await Promise.all([
        getOverviewMetrics(),
        getCourseCompletion(),
    ]);

    const metrics: OverviewMetrics | null =
        'metrics' in overviewResult ? overviewResult.metrics : null;
    const courses: CourseCompletionRow[] =
        'courses' in completionResult ? completionResult.courses : [];
    const loadError =
        'error' in overviewResult || 'error' in completionResult
            ? 'Kunne ikke laste all rapportdata.'
            : null;

    return <ReportsClient metrics={metrics} courses={courses} loadError={loadError} />;
}
