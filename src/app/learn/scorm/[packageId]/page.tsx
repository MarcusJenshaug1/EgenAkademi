import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { getMyScormAttempt } from '@/app/actions/scormActions';
import ScormPlayerClient from './ScormPlayerClient';

interface Props {
    params: Promise<{ packageId: string }>;
}

export default async function ScormPlayerPage({ params }: Props) {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
        redirect('/login');
    }

    const { packageId } = await params;
    const tenantId = session.user.tenantId;

    // Tenant-scoped lasting av pakken.
    const pkg = await prisma.scormPackage.findFirst({
        where: { id: packageId, tenantId },
        select: {
            id: true,
            title: true,
            scormVersion: true,
            entryPath: true,
            packagePath: true,
        },
    });

    if (!pkg) {
        return (
            <div
                style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: 'var(--color-text-secondary)',
                }}
            >
                <p>Fant ikke SCORM-pakken.</p>
            </div>
        );
    }

    // Hent lagret forsøk for å seede CMI ved init.
    const attemptResult = await getMyScormAttempt(pkg.id);
    const seed =
        'attempt' in attemptResult && attemptResult.attempt
            ? attemptResult.attempt
            : null;

    return (
        <ScormPlayerClient
            packageId={pkg.id}
            title={pkg.title}
            scormVersion={pkg.scormVersion}
            entryPath={pkg.entryPath}
            packagePath={pkg.packagePath}
            seedCmi={seed?.cmi ?? {}}
            seedSuspendData={seed?.suspendData ?? null}
            seedLessonStatus={seed?.lessonStatus ?? null}
        />
    );
}
