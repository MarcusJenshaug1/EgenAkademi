import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Globe, Lock } from 'lucide-react';
import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';
import { listDomains, type DomainListItem } from '@/app/actions/domainActions';
import DomainsClient from './DomainsClient';
import styles from './domains.module.css';

export default async function DomainsPage() {
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
              'custom-domain'
          )
        : { allowed: false, reason: 'Organisasjonen ble ikke funnet.' };

    if (!access.allowed) {
        return (
            <div className={styles.lockedPage}>
                <div className={styles.lockedCard}>
                    <div className={styles.lockedIcon}>
                        <Lock size={28} />
                    </div>
                    <h1 className={styles.lockedTitle}>Egendefinert domene</h1>
                    <p className={styles.lockedText}>
                        {access.reason || 'Denne funksjonen krever Plus-planen eller høyere.'}
                    </p>
                    <p className={styles.lockedHint}>
                        Med egendefinert domene kan du la elevene nå akademiet på din egen
                        nettadresse (f.eks. kurs.dittfirma.no). Vi verifiserer eierskap via en
                        TXT-post, og rutingen settes opp på hosting-plattformen.
                    </p>
                    <Link href="/admin" className={styles.lockedButton}>
                        <Globe size={16} />
                        Tilbake til administrasjon
                    </Link>
                </div>
            </div>
        );
    }

    const result = await listDomains();
    const initialDomains: DomainListItem[] = 'domains' in result ? result.domains : [];

    return <DomainsClient initialDomains={initialDomains} />;
}
