import styles from './onboarding.module.css';
import { Building2 } from 'lucide-react';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import OnboardingForm from './OnboardingForm';

export default async function OnboardingPage() {
    const session = await auth();

    // Sikkerhetsnett: Skal ikke være her om de ikke er innlogget eller allerede har tenant
    if (!session?.user) {
        redirect('/login');
    }
    if (session.user.tenantId) {
        redirect('/admin');
    }

    return (
        <div className={styles.container}>
            <div className={styles.glow}></div>
            <div className={styles.card}>
                <div className={styles.header}>
                    <div className={styles.logo}>
                        <Building2 size={24} color="white" />
                    </div>
                    <h1 className={styles.title}>Opprett din organisasjon</h1>
                    <p className={styles.subtitle}>
                        Hei {session.user.email}! Det ser ut til at du er første person hit.
                        La oss sette opp workspace for bedriften din.
                    </p>
                </div>

                <OnboardingForm />
            </div>
        </div>
    );
}
