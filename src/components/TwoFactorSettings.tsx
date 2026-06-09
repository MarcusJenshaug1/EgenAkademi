'use client';

import { useEffect, useState } from 'react';
import {
    ShieldCheck,
    ShieldOff,
    QrCode,
    KeyRound,
    Copy,
    Check,
    AlertTriangle,
    Loader2,
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import {
    getTwoFactorStatus,
    startTotpSetup,
    confirmTotpSetup,
    disableTotp,
    regenerateRecoveryCodes,
} from '@/app/actions/twoFactorActions';
import styles from './twoFactorSettings.module.css';

type View = 'idle' | 'setup' | 'regenPrompt' | 'disablePrompt';

export default function TwoFactorSettings() {
    const [loading, setLoading] = useState(true);
    const [enabled, setEnabled] = useState(false);
    const [recoveryRemaining, setRecoveryRemaining] = useState(0);

    const [view, setView] = useState<View>('idle');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Setup state
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [manualKey, setManualKey] = useState<string | null>(null);
    const [setupCode, setSetupCode] = useState('');

    // Code prompts (regen / disable)
    const [regenCode, setRegenCode] = useState('');
    const [disableOpen, setDisableOpen] = useState(false);
    const [disableCode, setDisableCode] = useState('');

    // Recovery codes shown once (after enable or regen)
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
    const [recoveryContext, setRecoveryContext] = useState<'enabled' | 'regenerated' | null>(null);

    const [copiedKey, setCopiedKey] = useState(false);
    const [copiedCodes, setCopiedCodes] = useState(false);

    useEffect(() => {
        let active = true;
        (async () => {
            const result = await getTwoFactorStatus();
            if (!active) return;
            if ('error' in result) {
                setError(result.error);
            } else {
                setEnabled(result.enabled);
                setRecoveryRemaining(result.recoveryCodesRemaining);
            }
            setLoading(false);
        })();
        return () => {
            active = false;
        };
    }, []);

    function resetTransient() {
        setError(null);
        setRecoveryCodes(null);
        setRecoveryContext(null);
    }

    async function copyToClipboard(text: string, which: 'key' | 'codes') {
        try {
            await navigator.clipboard.writeText(text);
            if (which === 'key') {
                setCopiedKey(true);
                setTimeout(() => setCopiedKey(false), 2000);
            } else {
                setCopiedCodes(true);
                setTimeout(() => setCopiedCodes(false), 2000);
            }
        } catch {
            // Stille feil – kopiering er en bekvemmelighet, ikke kritisk.
        }
    }

    async function handleStartSetup() {
        resetTransient();
        setBusy(true);
        const result = await startTotpSetup();
        setBusy(false);
        if ('error' in result) {
            setError(result.error);
            return;
        }
        setQrDataUrl(result.qrDataUrl);
        setManualKey(result.manualKey);
        setSetupCode('');
        setView('setup');
    }

    async function handleConfirmSetup() {
        setError(null);
        setBusy(true);
        const result = await confirmTotpSetup(setupCode);
        setBusy(false);
        if ('error' in result) {
            setError(result.error);
            return;
        }
        // Suksess: skjul hemmelighet, vis gjenopprettingskoder én gang.
        setQrDataUrl(null);
        setManualKey(null);
        setSetupCode('');
        setEnabled(true);
        setRecoveryRemaining(result.recoveryCodes.length);
        setRecoveryCodes(result.recoveryCodes);
        setRecoveryContext('enabled');
        setView('idle');
    }

    function handleCancelSetup() {
        setQrDataUrl(null);
        setManualKey(null);
        setSetupCode('');
        setError(null);
        setView('idle');
    }

    async function handleRegenerate() {
        setError(null);
        setBusy(true);
        const result = await regenerateRecoveryCodes(regenCode);
        setBusy(false);
        if ('error' in result) {
            setError(result.error);
            return;
        }
        setRegenCode('');
        setRecoveryRemaining(result.recoveryCodes.length);
        setRecoveryCodes(result.recoveryCodes);
        setRecoveryContext('regenerated');
        setView('idle');
    }

    async function handleDisable() {
        setError(null);
        setBusy(true);
        const result = await disableTotp(disableCode);
        setBusy(false);
        setDisableOpen(false);
        if ('error' in result) {
            setError(result.error);
            return;
        }
        setDisableCode('');
        setEnabled(false);
        setRecoveryRemaining(0);
        setRecoveryCodes(null);
        setRecoveryContext(null);
        setView('idle');
    }

    if (loading) {
        return (
            <div className={styles.card}>
                <div className={styles.statusRow}>
                    <span className={`${styles.statusLabel} ${styles.loadingLabel}`}>
                        <Loader2 size={16} className={styles.spin} /> Laster sikkerhetsinnstillinger...
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.card}>
            <div className={styles.cardHead}>
                <div className={styles.cardHeadIcon}>
                    <ShieldCheck size={20} />
                </div>
                <div className={styles.cardHeadText}>
                    <span className={styles.cardTitle}>To-faktor-autentisering (2FA)</span>
                    <span className={styles.cardDesc}>
                        Legg til et ekstra sikkerhetslag på kontoen din med en
                        autentiseringsapp som genererer engangskoder.
                    </span>
                </div>
            </div>

            {error && (
                <div className={styles.error} role="alert">
                    <AlertTriangle size={16} /> {error}
                </div>
            )}

            {/* Status */}
            <div className={styles.statusRow}>
                <span className={styles.statusLabel}>Status</span>
                {enabled ? (
                    <span className={`${styles.badge} ${styles.badgeOn}`}>
                        <ShieldCheck size={13} /> Aktivert
                    </span>
                ) : (
                    <span className={`${styles.badge} ${styles.badgeOff}`}>
                        <ShieldOff size={13} /> Deaktivert
                    </span>
                )}
            </div>

            {/* Recovery codes shown once (after enable or regen) */}
            {recoveryCodes && (
                <div className={styles.recoveryBox}>
                    <div className={styles.recoveryWarn}>
                        <AlertTriangle size={18} className={styles.recoveryWarnIcon} />
                        <span>
                            {recoveryContext === 'enabled'
                                ? 'To-faktor er nå aktivert. '
                                : 'Nye gjenopprettingskoder er generert (de gamle virker ikke lenger). '}
                            <strong>Lagre disse gjenopprettingskodene</strong> på et trygt sted.
                            De vises kun denne ene gangen, og hver kode kan kun brukes én gang
                            for å logge inn hvis du mister autentiseringsappen.
                        </span>
                    </div>
                    <div className={styles.recoveryGrid}>
                        {recoveryCodes.map((c) => (
                            <span key={c} className={styles.recoveryCode}>
                                {c}
                            </span>
                        ))}
                    </div>
                    <div className={styles.recoveryActions}>
                        <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => copyToClipboard(recoveryCodes.join('\n'), 'codes')}
                        >
                            {copiedCodes ? <Check size={14} /> : <Copy size={14} />}
                            {copiedCodes ? 'Kopiert' : 'Kopier alle koder'}
                        </button>
                    </div>
                </div>
            )}

            {/* DISABLED → setup flow */}
            {!enabled && view !== 'setup' && (
                <div className={styles.actions}>
                    <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={handleStartSetup}
                        disabled={busy}
                    >
                        <ShieldCheck size={16} /> Aktiver 2FA
                    </button>
                </div>
            )}

            {!enabled && view === 'setup' && qrDataUrl && manualKey && (
                <div className={styles.setup}>
                    <ol className={styles.setupSteps}>
                        <li>Åpne en autentiseringsapp (f.eks. Google Authenticator eller Authy).</li>
                        <li>Skann QR-koden, eller skriv inn nøkkelen manuelt.</li>
                        <li>Skriv inn den 6-sifrede koden appen viser for å bekrefte.</li>
                    </ol>

                    <div className={styles.qrWrap}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={qrDataUrl}
                            alt="QR-kode for to-faktor-oppsett"
                            className={styles.qrImage}
                        />
                        <div className={styles.manualBlock}>
                            <span className={styles.manualLabel}>
                                <QrCode size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                Manuell nøkkel
                            </span>
                            <div className={styles.manualKey}>
                                <span>{manualKey}</span>
                                <button
                                    type="button"
                                    className={styles.iconBtn}
                                    aria-label="Kopier nøkkel"
                                    onClick={() => copyToClipboard(manualKey, 'key')}
                                >
                                    {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className={styles.codeBlock}>
                        <label className={styles.codeLabel} htmlFor="totp-setup-code">
                            Bekreftelseskode
                        </label>
                        <input
                            id="totp-setup-code"
                            className={styles.codeInput}
                            value={setupCode}
                            onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="000000"
                            maxLength={6}
                        />
                    </div>

                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.btnPrimary}
                            onClick={handleConfirmSetup}
                            disabled={busy || setupCode.length !== 6}
                        >
                            <ShieldCheck size={16} /> {busy ? 'Bekrefter...' : 'Bekreft og aktiver'}
                        </button>
                        <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={handleCancelSetup}
                            disabled={busy}
                        >
                            Avbryt
                        </button>
                    </div>
                </div>
            )}

            {/* ENABLED → manage */}
            {enabled && (
                <>
                    <hr className={styles.divider} />
                    <div className={styles.statusRow}>
                        <span className={styles.statusLabel}>Gjenopprettingskoder igjen</span>
                        <span className={styles.metaText}>
                            <span className={styles.metaStrong}>{recoveryRemaining}</span> av 10
                        </span>
                    </div>

                    {view === 'regenPrompt' && (
                        <div className={styles.inlinePrompt}>
                            <span className={styles.inlinePromptTitle}>
                                <KeyRound size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                Generer nye gjenopprettingskoder
                            </span>
                            <div className={styles.codeBlock}>
                                <label className={styles.codeLabel} htmlFor="totp-regen-code">
                                    Skriv inn en gyldig kode fra autentiseringsappen
                                </label>
                                <input
                                    id="totp-regen-code"
                                    className={styles.codeInput}
                                    value={regenCode}
                                    onChange={(e) =>
                                        setRegenCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                                    }
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder="000000"
                                    maxLength={6}
                                />
                            </div>
                            <div className={styles.actions}>
                                <button
                                    type="button"
                                    className={styles.btnPrimary}
                                    onClick={handleRegenerate}
                                    disabled={busy || regenCode.length !== 6}
                                >
                                    <KeyRound size={16} /> {busy ? 'Genererer...' : 'Generer nye koder'}
                                </button>
                                <button
                                    type="button"
                                    className={styles.btnSecondary}
                                    onClick={() => {
                                        setView('idle');
                                        setRegenCode('');
                                        setError(null);
                                    }}
                                    disabled={busy}
                                >
                                    Avbryt
                                </button>
                            </div>
                        </div>
                    )}

                    {view === 'disablePrompt' && (
                        <div className={styles.inlinePrompt}>
                            <span className={styles.inlinePromptTitle}>
                                <ShieldOff size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                Deaktiver to-faktor
                            </span>
                            <div className={styles.codeBlock}>
                                <label className={styles.codeLabel} htmlFor="totp-disable-code">
                                    Skriv inn en kode fra autentiseringsappen, eller en gjenopprettingskode
                                </label>
                                <input
                                    id="totp-disable-code"
                                    className={styles.codeInput}
                                    value={disableCode}
                                    onChange={(e) => setDisableCode(e.target.value.trim().slice(0, 9))}
                                    autoComplete="one-time-code"
                                    placeholder="000000"
                                />
                            </div>
                            <div className={styles.actions}>
                                <button
                                    type="button"
                                    className={`${styles.btnSecondary} ${styles.btnDanger}`}
                                    onClick={() => setDisableOpen(true)}
                                    disabled={busy || disableCode.trim().length < 6}
                                >
                                    <ShieldOff size={16} /> Deaktiver 2FA
                                </button>
                                <button
                                    type="button"
                                    className={styles.btnSecondary}
                                    onClick={() => {
                                        setView('idle');
                                        setDisableCode('');
                                        setError(null);
                                    }}
                                    disabled={busy}
                                >
                                    Avbryt
                                </button>
                            </div>
                        </div>
                    )}

                    {view === 'idle' && (
                        <div className={styles.actions}>
                            <button
                                type="button"
                                className={styles.btnSecondary}
                                onClick={() => {
                                    resetTransient();
                                    setRegenCode('');
                                    setView('regenPrompt');
                                }}
                                disabled={busy}
                            >
                                <KeyRound size={16} /> Generer nye gjenopprettingskoder
                            </button>
                            <button
                                type="button"
                                className={`${styles.btnSecondary} ${styles.btnDanger}`}
                                onClick={() => {
                                    resetTransient();
                                    setDisableCode('');
                                    setView('disablePrompt');
                                }}
                                disabled={busy}
                            >
                                <ShieldOff size={16} /> Deaktiver 2FA
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Final destructive confirmation for disabling 2FA */}
            <ConfirmDialog
                open={disableOpen}
                title="Deaktiver to-faktor?"
                description="Dette fjerner det ekstra sikkerhetslaget fra kontoen din. Er du sikker på at du vil deaktivere to-faktor-autentisering?"
                confirmText="Deaktiver"
                cancelText="Avbryt"
                variant="danger"
                onCancel={() => setDisableOpen(false)}
                onConfirm={handleDisable}
            />
        </div>
    );
}
