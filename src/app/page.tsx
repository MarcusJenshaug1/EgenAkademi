import Link from 'next/link';
import type { Metadata } from 'next';
import {
    ArrowRight,
    Sparkles,
    Palette,
    BookOpen,
    Package,
    CalendarClock,
    Target,
    KeyRound,
    Users2,
    Trophy,
    Library,
    ShieldCheck,
    Lock,
    FileCheck2,
    Globe,
} from 'lucide-react';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import styles from '@/components/marketing/marketing.module.css';

export const metadata: Metadata = {
    title: 'Egen Akademi – Whitelabel LMS for norske virksomheter',
    description:
        'Egen Akademi er en whitelabel læringsplattform der din merkevare, ditt domene og dine data står i sentrum. Kurs, SCORM, sesjoner, kompetanse, SSO og mer.',
};

const FEATURES = [
    {
        icon: BookOpen,
        title: 'Kurs og kursbygger',
        text: 'Modulbasert kursbygger med tekst, bilde, video, dokument og quiz. Versjonering uten å miste fullføringshistorikk.',
    },
    {
        icon: Package,
        title: 'SCORM-støtte',
        text: 'Importer eksisterende SCORM 1.2 / 2004-pakker og kjør dem side om side med innhold bygget i plattformen.',
    },
    {
        icon: CalendarClock,
        title: 'Planlagte sesjoner',
        text: 'Klasseromsøkter og webinarer med kapasitet, venteliste, påmelding og fremmøteregistrering.',
    },
    {
        icon: Target,
        title: 'Kompetanse og ferdigheter',
        text: 'Ferdighetstaksonomi, kompetansematrise per team og kursanbefalinger som tetter kompetansegap.',
    },
    {
        icon: KeyRound,
        title: 'SSO med SAML 2.0',
        text: 'La ansatte logge inn med eksisterende identitetsleverandør – Microsoft Entra, Google eller Okta.',
    },
    {
        icon: Users2,
        title: 'SCIM 2.0-provisjonering',
        text: 'Automatisk bruker- og gruppesynkronisering fra IdP-en din. Onboarding og offboarding skjer av seg selv.',
    },
    {
        icon: Trophy,
        title: 'Gamification',
        text: 'Poeng, badges, nivåer og opt-in leaderboards som driver engasjement og fullføring.',
    },
    {
        icon: Library,
        title: 'Wiki og kunnskapsbase',
        text: 'Strukturerte sider med hierarki, tagger, søk, versjonshistorikk og tilgangsstyring per seksjon.',
    },
];

const BRAND_POINTS = [
    'Alle 14 fargefelter, logo, favicon og typografi styres per organisasjon',
    'Brand Detector henter farger og fonter automatisk fra nettstedet ditt',
    'Custom domene med automatisk TLS – plattformen lever på ditt domene',
    'WCAG AA-kontrast sjekkes automatisk på hver fargekombinasjon',
];

const SECURITY_PILLS = [
    { icon: KeyRound, label: 'SSO (SAML 2.0)' },
    { icon: Users2, label: 'SCIM 2.0' },
    { icon: FileCheck2, label: 'Audit-logg' },
    { icon: Lock, label: '2FA (TOTP)' },
    { icon: Globe, label: 'Data-isolasjon per tenant' },
];

const STATS = [
    { value: '14', label: 'fargefelter for full whitelabel-kontroll' },
    { value: 'SAML + SCIM', label: 'enterprise identitet ut av boksen' },
    { value: '100 %', label: 'norsk grensesnitt og support' },
];

export default function Home() {
    return (
        <div className={styles.page}>
            <MarketingHeader />

            <main>
                {/* ── Hero ── */}
                <section className={styles.hero}>
                    <div className={styles.heroGlow} aria-hidden="true" />
                    <div className={`${styles.container} ${styles.heroInner}`}>
                        <span className={styles.eyebrow}>
                            <Sparkles size={14} aria-hidden="true" />
                            Whitelabel LMS
                        </span>
                        <h1 className={styles.heroTitle}>
                            Læringsplattformen som bærer{' '}
                            <span className={styles.gradientText}>din merkevare</span>
                        </h1>
                        <p className={styles.heroSubtitle}>
                            Egen Akademi er en komplett whitelabel LMS for norske virksomheter.
                            Ditt domene, din profil, dine data – og alt fra kursbygger til SSO,
                            SCIM og kompetansestyring i én plattform.
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
                        <p className={styles.heroTrust}>
                            <ShieldCheck size={16} aria-hidden="true" />
                            Bygget for sikkerhet, etterlevelse og GDPR fra første dag.
                        </p>
                    </div>
                </section>

                {/* ── Whitelabel highlight ── */}
                <section className={styles.section}>
                    <div className={styles.container}>
                        <div className={styles.highlightPanel}>
                            <div className={styles.highlightCopy}>
                                <span className={styles.eyebrow}>
                                    <Palette size={14} aria-hidden="true" />
                                    Whitelabel og branding
                                </span>
                                <h2 className={styles.sectionTitle}>Det er din plattform – ikke vår</h2>
                                <p className={styles.sectionLead}>
                                    Ingen «powered by»-logoer eller fremmede farger. Egen Akademi
                                    tilpasser seg virksomhetens visuelle identitet helt dynamisk,
                                    fra innloggingsskjerm til siste sertifikat.
                                </p>
                                <ul className={styles.highlightList}>
                                    {BRAND_POINTS.map((point) => (
                                        <li key={point} className={styles.highlightItem}>
                                            <FileCheck2 size={18} className={styles.checkIcon} aria-hidden="true" />
                                            {point}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Token-drevet «branding preview» */}
                            <div className={styles.brandPreview} aria-hidden="true">
                                <div className={styles.brandPreviewBar}>
                                    <span className={`${styles.brandDot} ${styles.brandDotAccent}`} />
                                    <span className={`${styles.brandDot} ${styles.brandDotSuccess}`} />
                                    <span className={`${styles.brandDot} ${styles.brandDotWarning}`} />
                                </div>
                                <div className={styles.brandPreviewBody}>
                                    <div className={styles.brandPreviewSidebar}>
                                        <span className={`${styles.brandPreviewNav} ${styles.brandPreviewNavActive}`} />
                                        <span className={styles.brandPreviewNav} />
                                        <span className={styles.brandPreviewNav} />
                                        <span className={styles.brandPreviewNav} />
                                    </div>
                                    <div className={styles.brandPreviewMain}>
                                        <span className={styles.brandPreviewHeading} />
                                        <span className={styles.brandPreviewLine} />
                                        <span className={`${styles.brandPreviewLine} ${styles.brandPreviewLineShort}`} />
                                        <span className={styles.brandPreviewBtn} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Funksjoner ── */}
                <section id="funksjoner" className={styles.section}>
                    <div className={styles.container}>
                        <div className={styles.sectionHeader}>
                            <span className={styles.eyebrow}>
                                <Sparkles size={14} aria-hidden="true" />
                                Funksjoner
                            </span>
                            <h2 className={styles.sectionTitle}>Alt du trenger for intern læring</h2>
                            <p className={styles.sectionLead}>
                                Fra grunnleggende kurskatalog til enterprise-integrasjoner –
                                bygget for å vokse med organisasjonen din.
                            </p>
                        </div>
                        <div className={`${styles.grid} ${styles.grid4}`}>
                            {FEATURES.map(({ icon: Icon, title, text }) => (
                                <article key={title} className={`${styles.card} ${styles.cardHover}`}>
                                    <span className={styles.iconBox}>
                                        <Icon size={22} aria-hidden="true" />
                                    </span>
                                    <h3 className={styles.cardTitle}>{title}</h3>
                                    <p className={styles.cardText}>{text}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Sikkerhet-teaser ── */}
                <section className={styles.section}>
                    <div className={styles.container}>
                        <div className={styles.teaser}>
                            <span className={styles.eyebrow}>
                                <ShieldCheck size={14} aria-hidden="true" />
                                Sikkerhet
                            </span>
                            <h2 className={styles.sectionTitle}>Sikkerhet du kan stå inne for</h2>
                            <p className={styles.sectionLead}>
                                SSO, SCIM, tofaktor, audit-logging, rate-limiting og data-isolasjon
                                per organisasjon. Vi bygger for etterlevelse og personvern – ikke
                                som et påheng, men som fundament.
                            </p>
                            <div className={styles.teaserBadges}>
                                {SECURITY_PILLS.map(({ icon: Icon, label }) => (
                                    <span key={label} className={styles.pill}>
                                        <Icon size={14} className={styles.pillIcon} aria-hidden="true" />
                                        {label}
                                    </span>
                                ))}
                            </div>
                            <Link href="/sikkerhet" className={`${styles.btn} ${styles.btnGhost}`}>
                                Les om sikkerhet
                                <ArrowRight size={18} className={styles.btnIcon} aria-hidden="true" />
                            </Link>
                        </div>
                    </div>
                </section>

                {/* ── Social proof (placeholder) ── */}
                <section className={`${styles.section} ${styles.proof}`}>
                    <div className={styles.container}>
                        <p className={styles.proofLabel}>Bygget for virksomheter som tar læring på alvor</p>
                        <div className={styles.proofRow}>
                            <span className={styles.proofLogo}><Globe size={20} aria-hidden="true" /> Nordvik &amp; Co</span>
                            <span className={styles.proofLogo}><Globe size={20} aria-hidden="true" /> Fjord Helse</span>
                            <span className={styles.proofLogo}><Globe size={20} aria-hidden="true" /> Boreal Tech</span>
                            <span className={styles.proofLogo}><Globe size={20} aria-hidden="true" /> Vestland Retail</span>
                        </div>
                        <div className={styles.statsRow}>
                            {STATS.map((stat) => (
                                <div key={stat.label} className={styles.stat}>
                                    <div className={styles.statValue}>{stat.value}</div>
                                    <div className={styles.statLabel}>{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Final CTA ── */}
                <section className={styles.container}>
                    <div className={styles.finalCta}>
                        <span className={styles.eyebrow}>
                            <Sparkles size={14} aria-hidden="true" />
                            Kom i gang
                        </span>
                        <h2 className={styles.sectionTitle}>Klar for din egen akademi?</h2>
                        <p className={styles.sectionLead}>
                            Book en uforpliktende demo, så viser vi hvordan plattformen ser ut i din profil.
                        </p>
                        <div className={styles.heroActions}>
                            <Link href="/demo" className={`${styles.btn} ${styles.btnPrimary}`}>
                                Bestill demo
                                <ArrowRight size={18} className={styles.btnIcon} aria-hidden="true" />
                            </Link>
                            <Link href="/priser" className={`${styles.btn} ${styles.btnGhost}`}>
                                Utforsk pakkene
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <MarketingFooter />
        </div>
    );
}
