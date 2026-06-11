import Link from 'next/link';
import type { Metadata } from 'next';
import type { TenantPlan } from '@prisma/client';
import {
    ArrowRight,
    Check,
    Minus,
    Star,
    Tag,
    ScanSearch,
    Wrench,
    DatabaseZap,
    LayoutGrid,
    Sparkles,
} from 'lucide-react';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import { PLAN_INFO, getFeaturesForPlan } from '@/lib/features';
import styles from '@/components/marketing/marketing.module.css';

export const metadata: Metadata = {
    title: 'Priser – Egen Akademi',
    description:
        'Tre pakker: Standard, Plus og Enterprise. Sammenlign funksjoner og se tilleggstjenester som Brand Detector, Managed Setup og Migrasjonsassistanse.',
};

/**
 * Menneskelesbare norske etiketter for hver feature-flag i PLAN_FEATURES.
 * features.ts er kilden til sannhet for HVILKE flagg som finnes per plan;
 * her oversetter vi flaggene til markedsspråk for visning.
 */
const FEATURE_LABELS: Record<string, string> = {
    'core-lms': 'LMS-kjerne og kurskatalog',
    'org-name': 'Organisasjonsnavn',
    'user-management': 'Brukeradministrasjon',
    'group-management': 'Gruppestyring',
    'basic-branding': 'Branding med farger',
    'course-builder': 'Modulbasert kursbygger',
    'course-assignment': 'Tildeling av kurs til grupper og personer',
    'progress-tracking': 'Progresjonssporing',
    'basic-analytics': 'Grunnleggende statistikk',
    'onboarding-programs': 'Onboarding-maler',
    'session-events': 'Planlagte sesjoner og events',
    'advanced-branding': 'Full whitelabel (logo, favicon, fonter)',
    scorm: 'SCORM 1.2 / 2004-import',
    'custom-domain': 'Custom domene med TLS',
    'advanced-analytics': 'Analytics med drill-down',
    'csv-export': 'CSV-eksport for BI',
    'course-versioning': 'Kursversjonering',
    'escalation-logic': 'Påminnelser og eskalering',
    'advanced-blocks': 'Avanserte innholdsblokker',
    'sso-saml': 'SSO med SAML 2.0',
    scim: 'SCIM 2.0-provisjonering',
    'audit-logging': 'Full audit-logg',
    gamification: 'Gamification (poeng, badges, leaderboards)',
    wiki: 'Wiki og kunnskapsbase',
    lti: 'LTI 1.3-integrasjon',
    'competency-management': 'Kompetanse- og ferdighetsstyring',
    'ip-restrictions': 'IP-restriksjoner',
    'data-retention': 'GDPR-verktøy og dataretensjon',
    webhooks: 'Webhooks / event stream',
    'interactive-blocks': 'Interaktive oppgaver',
};

// Pakker vi viser kommersielt (Free er en intern prøvestatus, ikke en salgspakke).
const SHOWN_PLANS: TenantPlan[] = ['STANDARD', 'PLUS', 'ENTERPRISE'];

// De viktigste funksjonene som introduseres på hvert nivå (for plan-kortene).
const PLAN_HEADLINE_FEATURES: Record<string, readonly string[]> = {
    STANDARD: [
        'core-lms',
        'course-builder',
        'course-assignment',
        'basic-branding',
        'progress-tracking',
        'session-events',
    ],
    PLUS: [
        'advanced-branding',
        'custom-domain',
        'scorm',
        'advanced-analytics',
        'csv-export',
        'course-versioning',
    ],
    ENTERPRISE: [
        'sso-saml',
        'scim',
        'audit-logging',
        'gamification',
        'wiki',
        'competency-management',
    ],
};

// Rader i sammenligningstabellen (utvalg av nøkkelfunksjoner).
const COMPARE_FEATURES: string[] = [
    'core-lms',
    'course-builder',
    'session-events',
    'basic-branding',
    'advanced-branding',
    'custom-domain',
    'scorm',
    'advanced-analytics',
    'csv-export',
    'sso-saml',
    'scim',
    'audit-logging',
    'gamification',
    'wiki',
    'competency-management',
    'lti',
    'data-retention',
];

const ADDONS = [
    {
        key: 'brand-detector',
        icon: ScanSearch,
        name: 'Brand Detector',
        tag: 'Engangskjøp',
        text: 'URL-basert deteksjon av merkevarefarger, favicon og Google Fonts fra eksisterende nettside, med godkjenn/avvis per forslag.',
    },
    {
        key: 'managed-setup',
        icon: Wrench,
        name: 'Managed Setup',
        tag: 'Engangskjøp',
        text: 'Vi setter opp og konfigurerer hele plattformen for deg – branding, SSO, SCIM, domene og kursstruktur.',
    },
    {
        key: 'migration-assist',
        icon: DatabaseZap,
        name: 'Migrasjonsassistanse',
        tag: 'Engangskjøp',
        text: 'Import av eksisterende kursinnhold, brukere og fullføringsdata fra annet LMS – uten å miste historikk.',
    },
    {
        key: 'content-pro-pack',
        icon: LayoutGrid,
        name: 'Content Pro',
        tag: 'Tilleggspakke',
        text: 'Alle avanserte innholdsblokker (Audio, Kode, Sjekkliste, Embed) uavhengig av plan.',
    },
];

function hasFeature(plan: TenantPlan, feature: string): boolean {
    return getFeaturesForPlan(plan).includes(feature);
}

export default function PricingPage() {
    return (
        <div className={styles.page}>
            <MarketingHeader />

            <main>
                {/* ── Header ── */}
                <section className={styles.hero}>
                    <div className={styles.heroGlow} aria-hidden="true" />
                    <div className={`${styles.container} ${styles.heroInner}`}>
                        <span className={styles.eyebrow}>
                            <Tag size={14} aria-hidden="true" />
                            Priser
                        </span>
                        <h1 className={styles.heroTitle}>Velg pakken som passer</h1>
                        <p className={styles.heroSubtitle}>
                            Tre tydelige pakker som vokser med deg – fra kjernefunksjoner til full
                            enterprise med SSO, SCIM og compliance. Alle priser tilpasses behovet ditt.
                        </p>
                    </div>
                </section>

                {/* ── Plan-kort ── */}
                <section className={styles.sectionTight}>
                    <div className={styles.container}>
                        <div className={styles.pricingGrid}>
                            {SHOWN_PLANS.map((plan, index) => {
                                const info = PLAN_INFO[plan];
                                const features = PLAN_HEADLINE_FEATURES[plan] ?? [];
                                const previousPlan = SHOWN_PLANS[index - 1];
                                return (
                                    <article
                                        key={plan}
                                        className={`${styles.planCard} ${info.highlight ? styles.planCardHighlight : ''}`}
                                    >
                                        {info.highlight && (
                                            <span className={styles.planBadge}>
                                                <Star size={12} aria-hidden="true" />
                                                Anbefalt
                                            </span>
                                        )}
                                        <div>
                                            <div className={styles.planName}>{info.label}</div>
                                            <div className={styles.planPrice}>{info.price}</div>
                                        </div>
                                        <p className={styles.planDesc}>{info.description}</p>

                                        {previousPlan && (
                                            <span className={styles.planInherit}>
                                                Alt i {PLAN_INFO[previousPlan].label}, pluss:
                                            </span>
                                        )}

                                        <ul className={styles.planFeatures}>
                                            {features.map((feature) => (
                                                <li key={feature} className={styles.planFeature}>
                                                    <Check size={17} className={styles.compareCheck} aria-hidden="true" />
                                                    {FEATURE_LABELS[feature] ?? feature}
                                                </li>
                                            ))}
                                        </ul>

                                        <Link
                                            href="/demo"
                                            className={`${styles.btn} ${info.highlight ? styles.btnPrimary : styles.btnGhost} ${styles.btnFull}`}
                                        >
                                            Bestill demo
                                            <ArrowRight size={16} className={styles.btnIcon} aria-hidden="true" />
                                        </Link>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* ── Sammenligningstabell ── */}
                <section className={styles.section}>
                    <div className={styles.container}>
                        <div className={styles.sectionHeader}>
                            <span className={styles.eyebrow}>
                                <LayoutGrid size={14} aria-hidden="true" />
                                Sammenligning
                            </span>
                            <h2 className={styles.sectionTitle}>Funksjoner i detalj</h2>
                            <p className={styles.sectionLead}>
                                Hver pakke inkluderer alt fra pakkene under. Her er nøkkelfunksjonene side om side.
                            </p>
                        </div>

                        <div className={styles.compareWrap}>
                            <table className={styles.compareTable}>
                                <thead>
                                    <tr>
                                        <th scope="col">Funksjon</th>
                                        {SHOWN_PLANS.map((plan) => (
                                            <th
                                                key={plan}
                                                scope="col"
                                                className={`${styles.compareCenter} ${PLAN_INFO[plan].highlight ? styles.compareColHighlight : ''}`}
                                            >
                                                {PLAN_INFO[plan].label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {COMPARE_FEATURES.map((feature) => (
                                        <tr key={feature}>
                                            <td className={styles.compareFeatureCell}>
                                                {FEATURE_LABELS[feature] ?? feature}
                                            </td>
                                            {SHOWN_PLANS.map((plan) => {
                                                const included = hasFeature(plan, feature);
                                                return (
                                                    <td
                                                        key={plan}
                                                        className={`${styles.compareCenter} ${PLAN_INFO[plan].highlight ? styles.compareColHighlight : ''}`}
                                                    >
                                                        {included ? (
                                                            <Check
                                                                size={18}
                                                                className={styles.compareCheck}
                                                                aria-label="Inkludert"
                                                            />
                                                        ) : (
                                                            <Minus
                                                                size={18}
                                                                className={styles.compareDash}
                                                                aria-label="Ikke inkludert"
                                                            />
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* ── Tilleggstjenester ── */}
                <section id="tillegg" className={styles.section}>
                    <div className={styles.container}>
                        <div className={styles.sectionHeader}>
                            <span className={styles.eyebrow}>
                                <Sparkles size={14} aria-hidden="true" />
                                Tilleggstjenester
                            </span>
                            <h2 className={styles.sectionTitle}>Skreddersy oppsettet ditt</h2>
                            <p className={styles.sectionLead}>
                                Tjenester du kan legge til når du trenger ekstra fart eller funksjonalitet.
                            </p>
                        </div>

                        <div className={styles.addonGrid}>
                            {ADDONS.map(({ key, icon: Icon, name, tag, text }) => (
                                <article key={key} className={styles.addonCard}>
                                    <div className={styles.addonHead}>
                                        <span className={styles.iconBox}>
                                            <Icon size={22} aria-hidden="true" />
                                        </span>
                                        <div>
                                            <span className={styles.addonTag}>{tag}</span>
                                        </div>
                                    </div>
                                    <h3 className={styles.cardTitle}>{name}</h3>
                                    <p className={styles.cardText}>{text}</p>
                                    <div className={styles.addonActions}>
                                        <Link href="/demo" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}>
                                            Kontakt oss
                                            <ArrowRight size={15} className={styles.btnIcon} aria-hidden="true" />
                                        </Link>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Final CTA ── */}
                <section className={styles.container}>
                    <div className={styles.finalCta}>
                        <h2 className={styles.sectionTitle}>Usikker på hvilken pakke?</h2>
                        <p className={styles.sectionLead}>
                            Book en demo, så hjelper vi deg å finne riktig nivå for organisasjonen.
                        </p>
                        <Link href="/demo" className={`${styles.btn} ${styles.btnPrimary}`}>
                            Bestill demo
                            <ArrowRight size={18} className={styles.btnIcon} aria-hidden="true" />
                        </Link>
                    </div>
                </section>
            </main>

            <MarketingFooter />
        </div>
    );
}
