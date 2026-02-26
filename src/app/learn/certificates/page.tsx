import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getLearnerCertificates } from '@/app/actions/learnerActions';
import CertificatesClient from './CertificatesClient';

export default async function CertificatesPage() {
    const session = await auth();
    if (!session?.user?.tenantId) redirect('/login');

    const result = await getLearnerCertificates();

    if ('error' in result) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                <p>Kunne ikke laste sertifikatene dine.</p>
            </div>
        );
    }

    return <CertificatesClient certificates={result.certificates} />;
}
