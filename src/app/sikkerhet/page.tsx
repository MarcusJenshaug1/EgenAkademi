import Link from 'next/link';
import type { Metadata } from 'next';
import {
    ArrowRight,
    ShieldCheck,
    KeyRound,
    Users2,
    FileCheck2,
    Lock,
    Gauge,
    Trash2,
    Globe,
    Server,
    Info,
} from 'lucide-react';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import styles from '@/components/marketing/marketing.module.css';

export const metadata: Metadata = {
    title: 'Sikkerhet – Egen Akademi',
    description:
        'SSO med SAML 2.0, SCIM 2.0, audit-logging, 2FA, rate-limiting, GDPR-verktøy, custom domener med TLS og data-isolasjon per organisasjon.',
};

const SECTIONS = [
    {
        icon: KeyRound,
        title: 'Single Sign-On (SAML 2.0)',
        text: 'Egen Akademi fungerer som SAML 2.0 Service Provider. Konfigurer IdP-en din – Microsoft Entra ID, Google Workspace eller Okta – med entity-ID, SSO-URL, sertifikat og attributt-mapping. Brukerne logger inn med eksisterende bedriftsidentitet.',
    },
    {
        icon: Users2,
        title: 'SCIM 2.0-provisjonering',
        text: 'Automatisk bruker- og livssyklushåndtering via SCIM 2.0. Når noen ansettes eller slutter i IdP-en, gjenspeiles det i plattformen. Endepunktene beskyttes av Bearer-token som lagres kun som sha256-hash og kan revokeres.',
    },
    {
        icon: FileCheck2,
        title: 'Audit-logging',
        text: 'Sikkerhetsrelevante hendelser – integrasjonsendringer, sesjonshendelser og administrative handlinger – skrives til en audit-logg med aktør, tidspunkt og kontekst. Loggen kan gjennomgås av administratorer.',
    },
    {
        icon: Lock,
        title: 'Tofaktorautentisering (2FA)',
        text: 'Tidsbasert engangskode (TOTP) som ekstra innloggingsfaktor for administratorer og brukere. Kompatibel med standard autentikator-apper, med engangs gjenopprettingskoder.',
    },
    {
        icon: Gauge,
        title: 'Rate-limiting',
        text: 'Sensitive endepunkter – innlogging, SCIM og offentlige skjemaer – er beskyttet av tellerbasert rate-limiting for å dempe brute force og spam. Grensene er konfigurerbare per miljø.',
    },
    {
        icon: Trash2,
        title: 'GDPR-verktøy',
        text: 'Verktøy for sletting og anonymisering av personopplysninger, samt dataretensjon per organisasjon. Plattformen er bygget for å støtte de registrertes rettigheter etter GDPR.',
    },
    {
        icon: Globe,
        title: 'Custom domener og TLS',
        text: 'Kjør plattformen på ditt eget domene eller subdomene. Domeneverifisering via DNS og automatisk TLS gjør at læringsplattformen lever trygt under din merkevare.',
    },
    {
        icon: Server,
        title: 'Data-isolasjon per tenant',
        text: 'Hver organisasjon (tenant) er logisk isolert. All tilgang autoriseres server-side mot brukerens tenant – det er aldri nok å skjule noe i grensesnittet. Data fra én organisasjon eksponeres aldri for en annen.',
    },
];

export default function SecurityPage() {
    return (
        <div className={styles.page}>
            <MarketingHeader />

            <main>
                {/* ── Header ── */}
                <section className={styles.hero}>
                    <div className={styles.heroGlow} aria-hidden="true" />
                    <div className={`${styles.container} ${styles.heroInner}`}>
                        <span className={styles.eyebrow}>
                            <ShieldCheck size={14} aria-hidden="true" />
                            Sikkerhet
                        </span>
                        <h1 className={styles.heroTitle}>Sikkerhet du kan stå inne for</h1>
                        <p className={styles.heroSubtitle}>
                            Sikkerhet og personvern er ikke et påheng i Egen Akademi – det er
                            fundamentet. Her er kontrollene vi har bygget for å beskytte
                            organisasjonen din og de ansattes data.
                        </p>
                    </div>
                </section>

                {/* ── Sikkerhetsseksjoner ── */}
                <section id="gdpr" className={styles.sectionTight}>
                    <div className={styles.container}>
                        <div className={styles.securityGrid}>
                            {SECTIONS.map(({ icon: Icon, title, text }) => (
                                <article key={title} className={`${styles.card} ${styles.cardHover}`}>
                                    <span className={styles.iconBox}>
                                        <Icon size={22} aria-hidden="true" />
                                    </span>
                                    <h2 className={styles.cardTitle}>{title}</h2>
                                    <p className={styles.cardText}>{text}</p>
                                </article>
                            ))}
                        </div>

                        <div className={styles.securityNote}>
                            <Info size={18} className={styles.securityNoteIcon} aria-hidden="true" />
                            <span>
                                Vi jobber kontinuerlig med å styrke sikkerheten. Enkelte kontroller
                                – som SOC 2- og ISO 27001-rammeverk – er under oppbygging og inngår
                                i veikartet vårt. Vil du vite hvor vi står på et spesifikt krav?
                                Ta gjerne kontakt, så er vi åpne om status.
                            </span>
                        </div>
                    </div>
                </section>

                {/* ── Final CTA ── */}
                <section className={styles.container}>
                    <div className={styles.finalCta}>
                        <h2 className={styles.sectionTitle}>Vil du ha en sikkerhetsgjennomgang?</h2>
                        <p className={styles.sectionLead}>
                            Book en demo, så går vi gjennom arkitektur, integrasjoner og etterlevelse sammen.
                        </p>
                        <div className={styles.heroActions}>
                            <Link href="/demo" className={`${styles.btn} ${styles.btnPrimary}`}>
                                Bestill demo
                                <ArrowRight size={18} className={styles.btnIcon} aria-hidden="true" />
                            </Link>
                            <Link href="/priser" className={`${styles.btn} ${styles.btnGhost}`}>
                                Se priser
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <MarketingFooter />
        </div>
    );
}
