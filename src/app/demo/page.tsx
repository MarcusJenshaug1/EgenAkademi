import type { Metadata } from 'next';
import { CalendarCheck, Palette, ShieldCheck, Headset } from 'lucide-react';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import DemoForm from './DemoForm';
import styles from '@/components/marketing/marketing.module.css';

export const metadata: Metadata = {
    title: 'Bestill demo – Egen Akademi',
    description:
        'Book en uforpliktende demo av Egen Akademi. Vi viser hvordan den whitelabel læringsplattformen ser ut i din egen profil.',
};

const BENEFITS = [
    {
        icon: Palette,
        title: 'Se din egen merkevare',
        text: 'Vi viser plattformen tilpasset farger, logo og domene fra din virksomhet.',
    },
    {
        icon: ShieldCheck,
        title: 'Trygg gjennomgang',
        text: 'Gå gjennom SSO, SCIM, audit og GDPR med noen som kjenner arkitekturen.',
    },
    {
        icon: CalendarCheck,
        title: 'Tilpasset behovet',
        text: 'Vi fokuserer på det som er viktigst for dere – ikke en generisk salgspresentasjon.',
    },
    {
        icon: Headset,
        title: 'Norsk oppfølging',
        text: 'Personlig kontakt og support på norsk, gjennom hele prosessen.',
    },
];

export default function DemoPage() {
    return (
        <div className={styles.page}>
            <MarketingHeader />

            <main>
                <div className={styles.container}>
                    <div className={styles.demoLayout}>
                        {/* ── Intro / fordeler ── */}
                        <div className={styles.demoIntro}>
                            <span className={styles.eyebrow}>
                                <CalendarCheck size={14} aria-hidden="true" />
                                Bestill demo
                            </span>
                            <h1 className={styles.sectionTitle}>
                                La oss vise deg{' '}
                                <span className={styles.gradientText}>din egen akademi</span>
                            </h1>
                            <p className={styles.sectionLead}>
                                Fyll ut skjemaet, så tar vi kontakt for å avtale en uforpliktende
                                demo. Vi tilpasser gjennomgangen til virksomheten din.
                            </p>

                            <ul className={styles.demoBenefits}>
                                {BENEFITS.map(({ icon: Icon, title, text }) => (
                                    <li key={title} className={styles.demoBenefit}>
                                        <span className={styles.iconBox}>
                                            <Icon size={20} aria-hidden="true" />
                                        </span>
                                        <span className={styles.demoBenefitText}>
                                            <strong>{title}</strong>
                                            <span>{text}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* ── Skjema ── */}
                        <DemoForm />
                    </div>
                </div>
            </main>

            <MarketingFooter />
        </div>
    );
}
