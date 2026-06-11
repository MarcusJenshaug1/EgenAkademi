import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Package, Lock } from 'lucide-react';
import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';
import ScormClient from './ScormClient';
import styles from './scorm.module.css';

export default async function ScormPage() {
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
              'scorm'
          )
        : { allowed: false, reason: 'Organisasjonen ble ikke funnet.' };

    if (!access.allowed) {
        return (
            <div className={styles.lockedPage}>
                <div className={styles.lockedCard}>
                    <div className={styles.lockedIcon}>
                        <Lock size={28} />
                    </div>
                    <h1 className={styles.lockedTitle}>SCORM</h1>
                    <p className={styles.lockedText}>
                        {access.reason || 'Denne funksjonen krever Plus-planen eller høyere.'}
                    </p>
                    <p className={styles.lockedHint}>
                        Med SCORM kan du importere ferdige e-læringspakker (SCORM 1.2 / 2004),
                        spille dem av i en sandkasse-spiller og spore fullføring per bruker.
                    </p>
                    <Link href="/admin" className={styles.lockedButton}>
                        <Package size={16} />
                        Tilbake til administrasjon
                    </Link>
                </div>
            </div>
        );
    }

    return <ScormClient />;
}
