import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';
import OnboardingClient from './OnboardingClient';
import UpgradeNotice from './UpgradeNotice';
import {
    listPrograms,
    getOnboardingStats,
    type OnboardingProgramListItem,
    type OnboardingStats,
} from '@/app/actions/onboardingActions';

export default async function OnboardingPage() {
    const session = await auth();

    if (!session?.user?.tenantId) {
        redirect('/admin');
    }

    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        redirect('/admin');
    }

    const tenantId = session.user.tenantId;

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, addons: true, trialEndsAt: true },
    });

    const access = tenant
        ? checkAccess(tenant, 'onboarding-programs')
        : { allowed: false, reason: 'Ingen tilgang til denne funksjonen.' };

    if (!access.allowed) {
        return <UpgradeNotice reason={access.reason ?? 'Ingen tilgang til denne funksjonen.'} />;
    }

    const [programsResult, statsResult] = await Promise.all([
        listPrograms(),
        getOnboardingStats(),
    ]);

    const initialPrograms: OnboardingProgramListItem[] =
        'programs' in programsResult ? programsResult.programs : [];

    const stats: OnboardingStats =
        'totalPrograms' in statsResult
            ? statsResult
            : { totalPrograms: 0, activePrograms: 0, autoAssignPrograms: 0, totalEnrollees: 0 };

    return <OnboardingClient initialPrograms={initialPrograms} stats={stats} />;
}
