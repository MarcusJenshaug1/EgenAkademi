import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Target, Lock } from 'lucide-react';
import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';
import SkillsClient from './SkillsClient';
import styles from './skills.module.css';

export default async function SkillsPage() {
    const session = await auth();

    if (!session?.user?.tenantId) {
        redirect('/admin');
    }

    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        redirect('/admin');
    }

    const tenant = await prisma.tenant.findUnique({
        where: { id: session.user.tenantId },
        select: { plan: true, addons: true, trialEndsAt: true },
    });

    const access = tenant
        ? checkAccess(
              { plan: tenant.plan, addons: tenant.addons, trialEndsAt: tenant.trialEndsAt },
              'competency-management'
          )
        : { allowed: false, reason: 'Organisasjonen ble ikke funnet.' };

    if (!access.allowed) {
        return (
            <div className={styles.lockedPage}>
                <div className={styles.lockedCard}>
                    <div className={styles.lockedIcon}>
                        <Lock size={28} />
                    </div>
                    <h1 className={styles.lockedTitle}>Kompetansestyring</h1>
                    <p className={styles.lockedText}>
                        {access.reason ||
                            'Denne funksjonen krever Enterprise-planen eller høyere.'}
                    </p>
                    <p className={styles.lockedHint}>
                        Med kompetansestyring kan du bygge en ferdighetstaksonomi, koble ferdigheter
                        til kurs, kartlegge teamets kompetanse og kjøre gap-analyser.
                    </p>
                    <Link href="/admin" className={styles.lockedButton}>
                        <Target size={16} />
                        Tilbake til administrasjon
                    </Link>
                </div>
            </div>
        );
    }

    return <SkillsClient />;
}
