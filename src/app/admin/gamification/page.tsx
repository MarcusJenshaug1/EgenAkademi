import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Trophy, Lock } from 'lucide-react';
import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';
import GamificationClient from './GamificationClient';
import styles from './gamification.module.css';

export default async function GamificationPage() {
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
              'gamification'
          )
        : { allowed: false, reason: 'Organisasjonen ble ikke funnet.' };

    if (!access.allowed) {
        return (
            <div className={styles.lockedPage}>
                <div className={styles.lockedCard}>
                    <div className={styles.lockedIcon}>
                        <Lock size={28} />
                    </div>
                    <h1 className={styles.lockedTitle}>Gamification</h1>
                    <p className={styles.lockedText}>
                        {access.reason ||
                            'Denne funksjonen krever Enterprise-planen eller høyere.'}
                    </p>
                    <p className={styles.lockedHint}>
                        Med gamification kan du belønne læring med poeng, nivåer og badges, samt
                        motivere med topplister på tvers av organisasjonen.
                    </p>
                    <Link href="/admin" className={styles.lockedButton}>
                        <Trophy size={16} />
                        Tilbake til administrasjon
                    </Link>
                </div>
            </div>
        );
    }

    return <GamificationClient />;
}
