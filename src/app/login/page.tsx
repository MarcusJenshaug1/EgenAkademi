'use client';

import styles from './login.module.css';
import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await signIn('nodemailer', {
                email,
                redirect: false,
                callbackUrl: '/admin'
            });

            if (res?.error) {
                setStatus('error');
            } else {
                setStatus('success');
            }
        } catch (error) {
            setStatus('error');
        } finally {
            setLoading(false);
        }
    };
    return (
        <div className={styles.container}>
            <div className={styles.glow}></div>
            <div className={styles.loginCard}>
                <div className={styles.header}>
                    <div className={styles.logo}>EA</div>
                    <h1 className={styles.title}>Velkommen tilbake</h1>
                    <p className={styles.subtitle}>Logg inn på ditt Egen Akademi workspace</p>
                </div>

                <form className={styles.form} onSubmit={handleSubmit}>
                    <div className={styles.inputGroup}>
                        <label htmlFor="email" className={styles.label}>E-postadresse</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={styles.input}
                            placeholder="din.epost@firma.no"
                            required
                            disabled={loading || status === 'success'}
                        />
                    </div>

                    {status === 'success' && (
                        <div className={styles.successMessage}>
                            Sjekk innboksen din! Vi har sendt deg en magisk innloggingslenke.
                        </div>
                    )}

                    {status === 'error' && (
                        <div className={styles.errorMessage}>
                            Noe gikk galt under sending av e-post. Prøv igjen.
                        </div>
                    )}

                    <button type="submit" className={styles.submitButton} disabled={loading || status === 'success'}>
                        <span>{loading ? 'Sender...' : 'Logg inn med e-post'}</span>
                        {!loading && <LogIn size={18} />}
                    </button>
                </form>

                <div className={styles.footer}>
                    <p>SSO (SAML) eller SCIM aktivert? Da blir du automatisk omdirigert.</p>
                </div>
            </div>
        </div>
    );
}
