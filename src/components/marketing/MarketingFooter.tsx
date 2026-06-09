import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import styles from './marketing.module.css';

/**
 * Delt footer for markedsnettstedet (offentlig / uautentisert).
 * Server Component – kun lenker. Farger via default-merkevaren.
 */
export default function MarketingFooter() {
    const year = new Date().getFullYear();

    return (
        <footer className={styles.footer}>
            <div className={`${styles.container} ${styles.footerInner}`}>
                <div className={styles.footerBrandCol}>
                    <Link href="/" className={styles.brand} aria-label="Egen Akademi – til forsiden">
                        <span className={styles.brandMark}>
                            <GraduationCap size={20} aria-hidden="true" />
                        </span>
                        Egen Akademi
                    </Link>
                    <p className={styles.footerTagline}>
                        Whitelabel læringsplattform bygget for norske virksomheter.
                        Din merkevare, ditt domene, dine data.
                    </p>
                </div>

                <div className={styles.footerCol}>
                    <h3>Produkt</h3>
                    <ul>
                        <li><Link href="/#funksjoner">Funksjoner</Link></li>
                        <li><Link href="/priser">Priser</Link></li>
                        <li><Link href="/sikkerhet">Sikkerhet</Link></li>
                        <li><Link href="/demo">Bestill demo</Link></li>
                    </ul>
                </div>

                <div className={styles.footerCol}>
                    <h3>Plattform</h3>
                    <ul>
                        <li><Link href="/login">Logg inn</Link></li>
                        <li><Link href="/priser#tillegg">Tilleggstjenester</Link></li>
                        <li><Link href="/sikkerhet#gdpr">GDPR og personvern</Link></li>
                    </ul>
                </div>

                <div className={styles.footerCol}>
                    <h3>Kontakt</h3>
                    <ul>
                        <li><Link href="/demo">Snakk med oss</Link></li>
                        <li><a href="mailto:hei@egenakademi.no">hei@egenakademi.no</a></li>
                    </ul>
                </div>
            </div>

            <div className={`${styles.container} ${styles.footerBottom}`}>
                <span>&copy; {year} Egen Akademi. Alle rettigheter forbeholdt.</span>
                <span>Laget i Norge</span>
            </div>
        </footer>
    );
}
