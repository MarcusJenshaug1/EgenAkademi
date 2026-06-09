import Link from 'next/link';
import { CalendarClock, Lock, ArrowUpCircle } from 'lucide-react';
import styles from './sessions.module.css';

export default function UpgradeNotice({ reason }: { reason: string }) {
    return (
        <div className={styles.sessionsPage}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Sesjoner</h1>
                    <p className={styles.subtitle}>
                        Planlegg og administrer instruktørledet opplæring
                    </p>
                </div>
            </div>

            <div className={styles.upgradeCard}>
                <div className={styles.upgradeIcon}>
                    <CalendarClock size={32} />
                </div>
                <h2 className={styles.upgradeTitle}>
                    <Lock size={18} /> Sesjoner krever oppgradering
                </h2>
                <p className={styles.upgradeText}>{reason}</p>
                <p className={styles.upgradeText}>
                    Med sesjoner kan du planlegge fysiske, nettbaserte og hybride
                    treningsøkter, administrere påmelding med venteliste og registrere
                    oppmøte.
                </p>
                <Link href="/admin/branding" className={styles.upgradeButton}>
                    <ArrowUpCircle size={18} />
                    Se planer og oppgrader
                </Link>
            </div>
        </div>
    );
}
