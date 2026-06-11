import Link from 'next/link';
import { GraduationCap, ArrowRight } from 'lucide-react';
import styles from './marketing.module.css';

/**
 * Delt header for markedsnettstedet (offentlig / uautentisert).
 * Bruker default-merkevaren fra globals.css. Server Component – ingen
 * interaktivitet utover lenker.
 */
export default function MarketingHeader() {
    return (
        <header className={styles.header}>
            <div className={`${styles.container} ${styles.headerInner}`}>
                <Link href="/" className={styles.brand} aria-label="Egen Akademi – til forsiden">
                    <span className={styles.brandMark}>
                        <GraduationCap size={20} aria-hidden="true" />
                    </span>
                    Egen Akademi
                </Link>

                <nav className={styles.nav} aria-label="Hovedmeny">
                    <Link href="/#funksjoner" className={styles.navLink}>Funksjoner</Link>
                    <Link href="/priser" className={styles.navLink}>Priser</Link>
                    <Link href="/sikkerhet" className={styles.navLink}>Sikkerhet</Link>
                </nav>

                <div className={styles.headerActions}>
                    <Link href="/login" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}>
                        Logg inn
                    </Link>
                    <Link href="/demo" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}>
                        Bestill demo
                        <ArrowRight size={16} className={styles.btnIcon} aria-hidden="true" />
                    </Link>
                </div>
            </div>
        </header>
    );
}
