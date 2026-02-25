'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { createTenantAndAssign } from '@/app/actions/tenantActions';
import styles from './onboarding.module.css';
import { ArrowRight } from 'lucide-react';

export default function OnboardingForm() {
    const router = useRouter();
    const { update } = useSession();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        setError('');
        try {
            // Kall Server Action
            const result = await createTenantAndAssign(formData);

            if (result.error) {
                setError(result.error);
                setLoading(false);
                return;
            }

            // Vellykket db opprettelse: trigger session update klient-side
            await update({
                tenantId: result.tenantId,
                globalRole: 'TENANT_ADMIN'
            });

            // Redirect trygt
            router.push('/admin');
        } catch (e) {
            setError('Det skjedde en ukjent feil. Vennligst prøv igjen.');
            setLoading(false);
        }
    }

    return (
        <form action={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
                <label htmlFor="tenantName" className={styles.label}>Organisasjonsnavn</label>
                <input
                    type="text"
                    id="tenantName"
                    name="tenantName"
                    className={styles.input}
                    placeholder="F.eks. Acme Corp"
                    required
                    minLength={2}
                    disabled={loading}
                />
            </div>

            {error && <div style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</div>}

            <button type="submit" className={styles.submitButton} disabled={loading}>
                <span>{loading ? 'Oppretter...' : 'Opprett og fortsett'}</span>
                {!loading && <ArrowRight size={18} />}
            </button>
        </form>
    );
}
