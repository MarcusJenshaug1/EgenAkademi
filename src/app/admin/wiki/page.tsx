import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BookText, Lock } from 'lucide-react';
import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';
import WikiAdminClient from './WikiAdminClient';
import styles from './wiki.module.css';

export default async function WikiAdminPage() {
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
              'wiki'
          )
        : { allowed: false, reason: 'Organisasjonen ble ikke funnet.' };

    if (!access.allowed) {
        return (
            <div className={styles.lockedPage}>
                <div className={styles.lockedCard}>
                    <div className={styles.lockedIcon}>
                        <Lock size={28} />
                    </div>
                    <h1 className={styles.lockedTitle}>Kunnskapsbase</h1>
                    <p className={styles.lockedText}>
                        {access.reason || 'Denne funksjonen krever Enterprise-planen eller høyere.'}
                    </p>
                    <p className={styles.lockedHint}>
                        Med kunnskapsbasen kan du bygge en intern wiki med hierarkiske sider,
                        rik tekst, versjonshistorikk, gjennomgangsflyt og tilgangsstyring.
                    </p>
                    <Link href="/admin" className={styles.lockedButton}>
                        <BookText size={16} />
                        Tilbake til administrasjon
                    </Link>
                </div>
            </div>
        );
    }

    return <WikiAdminClient />;
}
