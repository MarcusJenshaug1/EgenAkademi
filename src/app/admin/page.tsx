import styles from './page.module.css';
import Link from 'next/link';
import { UserPlus, BookPlus, Paintbrush, CheckCircle2, LogIn } from 'lucide-react';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';

export default async function AdminDashboard() {
    // Fetch tenant name for display
    const session = await auth();
    let tenantName = 'din organisasjon';
    let userCount = 0;
    let activeUserCount = 0;

    if (session?.user?.tenantId) {
        const [tenant, total, active] = await Promise.all([
            prisma.tenant.findUnique({
                where: { id: session.user.tenantId },
                select: { name: true },
            }),
            prisma.user.count({ where: { tenantId: session.user.tenantId } }),
            prisma.user.count({ where: { tenantId: session.user.tenantId, active: true } }),
        ]);
        if (tenant) tenantName = tenant.name;
        userCount = total;
        activeUserCount = active;
    }

    return (
        <div className={styles.dashboard}>
            <div className={styles.header}>
                <h1 className={styles.title}>Oversikt</h1>
                <p className={styles.subtitle}>Sanntidsdata for {tenantName}</p>
            </div>

            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Aktive Brukere</span>
                    <span className={styles.statValue}>{activeUserCount}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Pågående Tildelinger</span>
                    <span className={styles.statValue}>18</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Fristbrudd</span>
                    <span className={styles.statValueAlert}>2</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Fullføringsgrad</span>
                    <span className={styles.statValue}>84%</span>
                </div>
            </div>

            <div className={styles.contentGrid}>
                <div className={styles.panel}>
                    <h2 className={styles.panelTitle}>Nylige hendelser</h2>
                    <div className={styles.list}>
                        <div className={styles.listItem}>
                            <div className={styles.itemIcon}>
                                <CheckCircle2 size={20} color="var(--color-accent-blue)" />
                            </div>
                            <div className={styles.itemDetails}>
                                <span className={styles.itemTitle}>Ola Nordmann fullførte "Sikkerhet OHS"</span>
                                <span className={styles.itemMeta}>For 2 timer siden</span>
                            </div>
                        </div>
                        <div className={styles.listItem}>
                            <div className={styles.itemIcon}>
                                <LogIn size={20} color="var(--color-text-secondary)" />
                            </div>
                            <div className={styles.itemDetails}>
                                <span className={styles.itemTitle}>Kari Svendsen logget inn</span>
                                <span className={styles.itemMeta}>For 4 timer siden</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.panel}>
                    <h2 className={styles.panelTitle}>Hurtighandlinger</h2>
                    <div className={styles.actionList}>
                        <Link href="/admin/users" className={styles.actionButton}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <UserPlus size={18} /> Administrer brukere
                            </span>
                        </Link>
                        <Link href="/admin/courses" className={styles.actionButton}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <BookPlus size={18} /> Opprett kurs
                            </span>
                        </Link>
                        <Link href="/admin/branding" className={styles.actionButton}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Paintbrush size={18} /> Tilpass branding
                            </span>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
