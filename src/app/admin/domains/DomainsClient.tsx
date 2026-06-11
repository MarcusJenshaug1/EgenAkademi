'use client';

import { useState, useTransition } from 'react';
import {
    Globe,
    CheckCircle,
    AlertTriangle,
    Copy,
    Star,
    Trash2,
    Plus,
    Clock,
    ShieldCheck,
    Info,
} from 'lucide-react';
import {
    addDomain,
    verifyDomain,
    setPrimaryDomain,
    removeDomain,
    type DomainListItem,
} from '@/app/actions/domainActions';
import ConfirmDialog from '@/components/ConfirmDialog';
import styles from './domains.module.css';

interface DomainsClientProps {
    initialDomains: DomainListItem[];
}

type StatusKey = 'pending' | 'verified' | 'failed';

const STATUS_LABEL: Record<StatusKey, string> = {
    pending: 'Avventer',
    verified: 'Verifisert',
    failed: 'Feilet',
};

function statusKey(status: string): StatusKey {
    if (status === 'verified') return 'verified';
    if (status === 'failed') return 'failed';
    return 'pending';
}

export default function DomainsClient({ initialDomains }: DomainsClientProps) {
    const [domains, setDomains] = useState<DomainListItem[]>(initialDomains);
    const [newDomain, setNewDomain] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [isAdding, startAdd] = useTransition();
    const [, startAction] = useTransition();

    // Per-domene tilbakemelding (verifisering / handlinger).
    const [feedback, setFeedback] = useState<Record<string, { type: 'ok' | 'err'; text: string }>>({});
    const [busyId, setBusyId] = useState<string | null>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const setDomainFeedback = (id: string, value: { type: 'ok' | 'err'; text: string } | null) => {
        setFeedback((prev) => {
            const next = { ...prev };
            if (value === null) delete next[id];
            else next[id] = value;
            return next;
        });
    };

    // Wrapper rundt startAction slik at vi kan kjøre async-handlere i en transition.
    const runAction = (fn: () => Promise<void>) => {
        startAction(() => {
            void fn();
        });
    };

    // ── Add domain ──────────────────────────────────────────
    const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setFormError(null);
        const value = newDomain.trim();
        if (!value) {
            setFormError('Skriv inn et domene');
            return;
        }
        startAdd(async () => {
            const res = await addDomain(value);
            if ('error' in res) {
                setFormError(res.error);
                return;
            }
            setDomains((prev) => [...prev, res.domain]);
            setNewDomain('');
        });
    };

    // ── Verify ──────────────────────────────────────────────
    const handleVerify = (id: string) => {
        setBusyId(id);
        setDomainFeedback(id, null);
        runAction(async () => {
            const res = await verifyDomain(id);
            if ('error' in res) {
                setDomainFeedback(id, { type: 'err', text: res.error });
            } else if (res.verified) {
                setDomains((prev) =>
                    prev.map((d) =>
                        d.id === id
                            ? { ...d, status: 'verified', verifiedAt: new Date(), lastError: null }
                            : d
                    )
                );
                setDomainFeedback(id, { type: 'ok', text: 'Domenet er verifisert.' });
            } else {
                setDomains((prev) =>
                    prev.map((d) =>
                        d.id === id
                            ? {
                                  ...d,
                                  status: 'failed',
                                  isPrimary: false,
                                  lastError: 'Fant ikke forventet TXT-post',
                              }
                            : d
                    )
                );
                setDomainFeedback(id, {
                    type: 'err',
                    text: 'Fant ikke forventet TXT-post. Kontroller at posten er lagt til og prøv igjen (DNS kan ta tid å oppdatere).',
                });
            }
            setBusyId(null);
        });
    };

    // ── Set primary ─────────────────────────────────────────
    const handleSetPrimary = (id: string) => {
        setBusyId(id);
        setDomainFeedback(id, null);
        runAction(async () => {
            const res = await setPrimaryDomain(id);
            if ('error' in res) {
                setDomainFeedback(id, { type: 'err', text: res.error });
            } else {
                setDomains((prev) => prev.map((d) => ({ ...d, isPrimary: d.id === id })));
            }
            setBusyId(null);
        });
    };

    // ── Remove ──────────────────────────────────────────────
    const handleRemove = (id: string) => {
        setBusyId(id);
        runAction(async () => {
            const res = await removeDomain(id);
            if ('error' in res) {
                setDomainFeedback(id, { type: 'err', text: res.error });
            } else {
                setDomains((prev) => prev.filter((d) => d.id !== id));
            }
            setConfirmId(null);
            setBusyId(null);
        });
    };

    const handleCopy = async (key: string, value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedKey(key);
            window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1500);
        } catch {
            // Ignorer: clipboard kan være utilgjengelig i enkelte kontekster.
        }
    };

    const confirmDomain = domains.find((d) => d.id === confirmId) ?? null;

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>
                        <Globe size={24} aria-hidden />
                        Egendefinerte domener
                    </h1>
                    <p className={styles.subtitle}>
                        Koble ditt eget domene til akademiet. Vi verifiserer eierskap via en
                        TXT-post i DNS-en din.
                    </p>
                </div>
            </div>

            {/* Infopanel om TLS / ruting (infra/TODO) */}
            <div className={styles.infoPanel} role="note">
                <Info size={18} className={styles.infoIcon} aria-hidden />
                <div>
                    <p className={styles.infoTitle}>TLS-sertifikat og ruting settes opp på plattformen</p>
                    <p className={styles.infoText}>
                        Etter at domenet er verifisert blir TLS-sertifikat (HTTPS) og faktisk ruting
                        av trafikk til riktig organisasjon konfigurert automatisk på
                        hosting-plattformen. Dette er et infrastruktur-steg og kan ta noe tid etter
                        verifisering.
                    </p>
                </div>
            </div>

            {/* Legg til domene */}
            <form className={styles.addForm} onSubmit={handleAdd}>
                <div className={styles.addRow}>
                    <label className={styles.addLabel} htmlFor="new-domain">
                        Legg til domene
                    </label>
                    <div className={styles.addInputRow}>
                        <input
                            id="new-domain"
                            className={styles.input}
                            type="text"
                            inputMode="url"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="kurs.dittfirma.no"
                            value={newDomain}
                            onChange={(e) => {
                                setNewDomain(e.target.value);
                                if (formError) setFormError(null);
                            }}
                            disabled={isAdding}
                            aria-invalid={formError ? true : undefined}
                        />
                        <button className={styles.primaryButton} type="submit" disabled={isAdding}>
                            <Plus size={16} aria-hidden />
                            {isAdding ? 'Legger til…' : 'Legg til'}
                        </button>
                    </div>
                    {formError && <p className={styles.formError}>{formError}</p>}
                    <p className={styles.addHint}>
                        Skriv kun selve domenet, uten https:// eller stier. F.eks.{' '}
                        <code className={styles.codeInline}>kurs.dittfirma.no</code>.
                    </p>
                </div>
            </form>

            {/* Liste */}
            {domains.length === 0 ? (
                <div className={styles.emptyState}>
                    <Globe size={32} aria-hidden />
                    <p className={styles.emptyTitle}>Ingen domener ennå</p>
                    <p className={styles.emptyText}>
                        Legg til ditt første domene over for å komme i gang.
                    </p>
                </div>
            ) : (
                <ul className={styles.domainList}>
                    {domains.map((d) => {
                        const key = statusKey(d.status);
                        const fb = feedback[d.id];
                        const isBusy = busyId === d.id;
                        return (
                            <li key={d.id} className={styles.domainCard}>
                                <div className={styles.domainTop}>
                                    <div className={styles.domainNameWrap}>
                                        <span className={styles.domainName}>{d.domain}</span>
                                        {d.isPrimary && (
                                            <span className={styles.primaryBadge}>
                                                <Star size={12} aria-hidden />
                                                Primær
                                            </span>
                                        )}
                                    </div>
                                    <span
                                        className={`${styles.statusBadge} ${
                                            key === 'verified'
                                                ? styles.statusVerified
                                                : key === 'failed'
                                                  ? styles.statusFailed
                                                  : styles.statusPending
                                        }`}
                                    >
                                        {key === 'verified' && <CheckCircle size={13} aria-hidden />}
                                        {key === 'failed' && <AlertTriangle size={13} aria-hidden />}
                                        {key === 'pending' && <Clock size={13} aria-hidden />}
                                        {STATUS_LABEL[key]}
                                    </span>
                                </div>

                                {d.status === 'failed' && d.lastError && (
                                    <p className={styles.cardError}>
                                        <AlertTriangle size={14} aria-hidden />
                                        {d.lastError}
                                    </p>
                                )}

                                {/* DNS-instruksjoner */}
                                <div className={styles.dnsBlock}>
                                    <p className={styles.dnsHeading}>
                                        <ShieldCheck size={15} aria-hidden />
                                        DNS-poster
                                    </p>

                                    {/* TXT for verifisering */}
                                    <div className={styles.dnsRecord}>
                                        <div className={styles.dnsRecordHead}>
                                            <span className={styles.dnsType}>TXT</span>
                                            <span className={styles.dnsPurpose}>Eierskapsverifisering</span>
                                        </div>
                                        <DnsField
                                            label="Navn / Host"
                                            value={d.instructions.txtName}
                                            fieldKey={`${d.id}-txtname`}
                                            copiedKey={copiedKey}
                                            onCopy={handleCopy}
                                        />
                                        <DnsField
                                            label="Verdi"
                                            value={d.instructions.txtValue}
                                            fieldKey={`${d.id}-txtval`}
                                            copiedKey={copiedKey}
                                            onCopy={handleCopy}
                                        />
                                    </div>

                                    {/* CNAME for ruting */}
                                    <div className={styles.dnsRecord}>
                                        <div className={styles.dnsRecordHead}>
                                            <span className={styles.dnsType}>CNAME</span>
                                            <span className={styles.dnsPurpose}>
                                                Peker domenet mot plattformen
                                            </span>
                                        </div>
                                        <DnsField
                                            label="Navn / Host"
                                            value={d.instructions.cnameName}
                                            fieldKey={`${d.id}-cname`}
                                            copiedKey={copiedKey}
                                            onCopy={handleCopy}
                                        />
                                        <DnsField
                                            label="Mål"
                                            value={d.instructions.cnameTarget}
                                            fieldKey={`${d.id}-cnametarget`}
                                            copiedKey={copiedKey}
                                            onCopy={handleCopy}
                                        />
                                    </div>
                                </div>

                                {fb && (
                                    <p
                                        className={`${styles.feedback} ${
                                            fb.type === 'ok' ? styles.feedbackOk : styles.feedbackErr
                                        }`}
                                        role="status"
                                    >
                                        {fb.type === 'ok' ? (
                                            <CheckCircle size={14} aria-hidden />
                                        ) : (
                                            <AlertTriangle size={14} aria-hidden />
                                        )}
                                        {fb.text}
                                    </p>
                                )}

                                {/* Handlinger */}
                                <div className={styles.cardActions}>
                                    <button
                                        type="button"
                                        className={styles.secondaryButton}
                                        onClick={() => handleVerify(d.id)}
                                        disabled={isBusy}
                                    >
                                        <ShieldCheck size={15} aria-hidden />
                                        {isBusy ? 'Sjekker…' : 'Verifiser'}
                                    </button>

                                    {d.status === 'verified' && !d.isPrimary && (
                                        <button
                                            type="button"
                                            className={styles.secondaryButton}
                                            onClick={() => handleSetPrimary(d.id)}
                                            disabled={isBusy}
                                        >
                                            <Star size={15} aria-hidden />
                                            Sett som primær
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        className={styles.dangerButton}
                                        onClick={() => setConfirmId(d.id)}
                                        disabled={isBusy}
                                        aria-label={`Fjern ${d.domain}`}
                                    >
                                        <Trash2 size={15} aria-hidden />
                                        Fjern
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <ConfirmDialog
                open={confirmId !== null}
                title="Fjern domene"
                description={
                    confirmDomain
                        ? `Er du sikker på at du vil fjerne ${confirmDomain.domain}? DNS-poster du har lagt til kan deretter fjernes hos din leverandør.`
                        : ''
                }
                confirmText="Fjern"
                cancelText="Avbryt"
                variant="danger"
                onConfirm={() => confirmId && handleRemove(confirmId)}
                onCancel={() => setConfirmId(null)}
            />
        </div>
    );
}

// ── Liten gjenbrukbar rad for en kopierbar DNS-verdi ────────

interface DnsFieldProps {
    label: string;
    value: string;
    fieldKey: string;
    copiedKey: string | null;
    onCopy: (key: string, value: string) => void;
}

function DnsField({ label, value, fieldKey, copiedKey, onCopy }: DnsFieldProps) {
    const copied = copiedKey === fieldKey;
    return (
        <div className={styles.dnsField}>
            <span className={styles.dnsFieldLabel}>{label}</span>
            <div className={styles.dnsFieldValueRow}>
                <code className={styles.dnsValue}>{value}</code>
                <button
                    type="button"
                    className={styles.copyButton}
                    onClick={() => onCopy(fieldKey, value)}
                    aria-label={`Kopier ${label}`}
                >
                    {copied ? <CheckCircle size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                    {copied ? 'Kopiert' : 'Kopier'}
                </button>
            </div>
        </div>
    );
}
