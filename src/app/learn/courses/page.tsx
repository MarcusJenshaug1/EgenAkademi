import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getAvailableCourses } from '@/app/actions/learnerActions';
import CourseCatalogClient from './CourseCatalogClient';

export default async function CourseCatalogPage() {
    const session = await auth();
    if (!session?.user?.tenantId) redirect('/login');

    const result = await getAvailableCourses();

    if ('error' in result) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <p>{result.error}</p>
            </div>
        );
    }

    return <CourseCatalogClient courses={result.data} />;
}
