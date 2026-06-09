import Link from 'next/link';
import { Rocket, Lock, ArrowUpCircle } from 'lucide-react';
import styles from './onboarding.module.css';

export default function UpgradeNotice({ reason }: { reason: string }) {
    return (
        <div className={styles.onboardingPage}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Onboarding</h1>
                    <p className={styles.subtitle}>
                        Tidsstyrt automatisk tildeling av opplæring for nye ansatte
                    </p>
                </div>
            </div>

            <div className={styles.upgradeCard}>
                <div className={styles.upgradeIcon}>
                    <Rocket size={32} />
                </div>
                <h2 className={styles.upgradeTitle}>
                    <Lock size={18} /> Onboarding krever oppgradering
                </h2>
                <p className={styles.upgradeText}>{reason}</p>
                <p className={styles.upgradeText}>
                    Med onboarding-programmer kan du sette opp tidsfasede opplæringsløp som
                    tildeles automatisk til nye brukere, med kurs og frister styrt per uke.
                </p>
                <Link href="/admin/branding" className={styles.upgradeButton}>
                    <ArrowUpCircle size={18} />
                    Se planer og oppgrader
                </Link>
            </div>
        </div>
    );
}
