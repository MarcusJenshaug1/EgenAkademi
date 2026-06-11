'use client';

import { useState, useTransition } from 'react';
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { createDemoRequest } from '@/app/actions/marketingActions';
import styles from './demoForm.module.css';

/**
 * Bestill demo-skjema (client). Gjør lett klientvalidering for rask
 * tilbakemelding, men serveren (createDemoRequest) er autoritativ kilde
 * for validering og rate-limiting.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
    name?: string;
    email?: string;
}

export default function DemoForm() {
    const [isPending, startTransition] = useTransition();
    const [submitted, setSubmitted] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setFormError(null);

        const form = e.currentTarget;
        const data = new FormData(form);

        const name = String(data.get('name') ?? '').trim();
        const email = String(data.get('email') ?? '').trim();
        const company = String(data.get('company') ?? '').trim();
        const phone = String(data.get('phone') ?? '').trim();
        const message = String(data.get('message') ?? '').trim();

        // Klientvalidering (UX) – serveren validerer på nytt uansett.
        const errors: FieldErrors = {};
        if (name.length < 2) errors.name = 'Oppgi navnet ditt.';
        if (!EMAIL_RE.test(email)) errors.email = 'Oppgi en gyldig e-postadresse.';
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;

        startTransition(async () => {
            const result = await createDemoRequest({ name, email, company, phone, message });
            if ('success' in result) {
                setSubmitted(true);
            } else {
                setFormError(result.error);
            }
        });
    }

    if (submitted) {
        return (
            <div className={styles.formCard}>
                <div className={styles.success} role="status" aria-live="polite">
                    <span className={styles.successIcon}>
                        <CheckCircle2 size={32} aria-hidden="true" />
                    </span>
                    <h2 className={styles.successTitle}>Takk for forespørselen!</h2>
                    <p className={styles.successText}>
                        Vi har mottatt henvendelsen din og tar kontakt så snart som mulig for å
                        avtale en demo tilpasset din virksomhet.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.formCard}>
            <form className={styles.form} onSubmit={handleSubmit} noValidate>
                {formError && (
                    <div className={`${styles.alert} ${styles.alertError}`} role="alert">
                        <AlertCircle size={18} className={styles.alertIconError} aria-hidden="true" />
                        <span>{formError}</span>
                    </div>
                )}

                <div className={styles.field}>
                    <label className={styles.label} htmlFor="name">
                        Navn<span className={styles.required} aria-hidden="true">*</span>
                    </label>
                    <input
                        id="name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        required
                        maxLength={120}
                        placeholder="Ola Nordmann"
                        className={`${styles.input} ${fieldErrors.name ? styles.inputError : ''}`}
                        aria-invalid={fieldErrors.name ? true : undefined}
                        aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                        disabled={isPending}
                    />
                    {fieldErrors.name && (
                        <span id="name-error" className={styles.fieldError}>{fieldErrors.name}</span>
                    )}
                </div>

                <div className={styles.field}>
                    <label className={styles.label} htmlFor="email">
                        E-post<span className={styles.required} aria-hidden="true">*</span>
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={200}
                        placeholder="ola@virksomhet.no"
                        className={`${styles.input} ${fieldErrors.email ? styles.inputError : ''}`}
                        aria-invalid={fieldErrors.email ? true : undefined}
                        aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                        disabled={isPending}
                    />
                    {fieldErrors.email && (
                        <span id="email-error" className={styles.fieldError}>{fieldErrors.email}</span>
                    )}
                </div>

                <div className={styles.row}>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="company">Firma</label>
                        <input
                            id="company"
                            name="company"
                            type="text"
                            autoComplete="organization"
                            maxLength={160}
                            placeholder="Virksomhet AS"
                            className={styles.input}
                            disabled={isPending}
                        />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="phone">Telefon</label>
                        <input
                            id="phone"
                            name="phone"
                            type="tel"
                            autoComplete="tel"
                            maxLength={40}
                            placeholder="+47 000 00 000"
                            className={styles.input}
                            disabled={isPending}
                        />
                    </div>
                </div>

                <div className={styles.field}>
                    <label className={styles.label} htmlFor="message">Melding</label>
                    <textarea
                        id="message"
                        name="message"
                        maxLength={2000}
                        placeholder="Fortell oss kort om behovet deres, antall brukere og hva som er viktigst for dere."
                        className={styles.textarea}
                        disabled={isPending}
                    />
                </div>

                <button type="submit" className={styles.submit} disabled={isPending}>
                    {isPending ? (
                        <>
                            <Loader2 size={18} className={styles.spin} aria-hidden="true" />
                            Sender ...
                        </>
                    ) : (
                        <>
                            <Send size={18} aria-hidden="true" />
                            Send forespørsel
                        </>
                    )}
                </button>

                <p className={styles.formNote}>
                    Ved å sende inn samtykker du til at vi kontakter deg om en demo. Vi behandler
                    opplysningene i tråd med personvernreglene og deler dem aldri med tredjepart.
                </p>
            </form>
        </div>
    );
}
