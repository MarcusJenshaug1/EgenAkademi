'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    KeyRound, Shield, Webhook, Plug, ScrollText, Lock,
    Plus, Trash2, Copy, Check, Send, RefreshCw, X,
    AlertTriangle, CheckCircle, ArrowUpCircle, Power, Edit3,
    Download, Save, Eraser, Clock, Info,
} from 'lucide-react';
import styles from './integrations.module.css';
import {
    upsertSsoConnection, setSsoEnabled,
    listScimTokens, createScimToken, revokeScimToken,
    listWebhooks, createWebhook, setWebhookEnabled, deleteWebhook,
    listRecentDeliveries, sendTestWebhook, updateWebhook,
    listLtiPlatforms, createLtiPlatform, updateLtiPlatform, setLtiEnabled, deleteLtiPlatform,
    listAuditLogs, getAuditRetention, setAuditRetention, runAuditRetention, exportAuditCsv,
    type ScimTokenListItem, type WebhookListItem, type WebhookDeliveryItem,
    type LtiPlatformItem, type AuditLogItem,
} from '@/app/actions/integrationActions';
import { WEBHOOK_EVENTS } from '@/lib/webhookEvents';

// ── Shared types (mirror server payload) ────────────────────

interface AccessFlag {
    allowed: boolean;
    reason: string | null;
}

interface SsoData {
    id: string;
    protocol: string;
    enabled: boolean;
    idpEntityId: string | null;
    idpSsoUrl: string | null;
    idpCertificate: string | null;
    spEntityId: string | null;
    attributeMapping: Record<string, string> | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface IntegrationsData {
    access: {
        sso: AccessFlag;
        scim: AccessFlag;
        webhooks: AccessFlag;
        lti: AccessFlag;
        audit: AccessFlag;
    };
    sso: SsoData | null;
    scimTokens: ScimTokenListItem[];
    webhooks: WebhookListItem[];
    ltiPlatforms: LtiPlatformItem[];
    auditLogs: AuditLogItem[];
}

type TabKey = 'sso' | 'scim' | 'webhooks' | 'lti' | 'audit';

const TABS: { key: TabKey; label: string; icon: typeof KeyRound }[] = [
    { key: 'sso', label: 'SSO (SAML)', icon: Shield },
    { key: 'scim', label: 'SCIM', icon: KeyRound },
    { key: 'webhooks', label: 'Webhooks', icon: Webhook },
    { key: 'lti', label: 'LTI', icon: Plug },
    { key: 'audit', label: 'Audit-logg', icon: ScrollText },
];

// ── Helpers ─────────────────────────────────────────────────

function formatDateTime(d: Date | string | null): string {
    if (!d) return '–';
    return new Date(d).toLocaleString('nb-NO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function CopyBox({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard kan være blokkert – ignorer stille.
        }
    }
    return (
        <div className={styles.copyBox}>
            <code className={styles.copyValue}>{value}</code>
            <button type="button" className={styles.copyBtn} onClick={copy} aria-label="Kopier">
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Kopiert' : 'Kopier'}
            </button>
        </div>
    );
}

// ── Upgrade card (shown when !allowed) ──────────────────────

function UpgradeCard({ title, reason }: { title: string; reason: string | null }) {
    return (
        <div className={styles.upgradeCard}>
            <div className={styles.upgradeIcon}>
                <Lock size={28} />
            </div>
            <h3 className={styles.upgradeTitle}>{title} er ikke tilgjengelig på din plan</h3>
            <p className={styles.upgradeReason}>
                {reason ?? 'Denne funksjonen krever en høyere plan.'}
            </p>
            <a href="/admin" className={styles.upgradeBtn}>
                <ArrowUpCircle size={16} />
                Se oppgraderingsalternativer
            </a>
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════

export default function IntegrationsClient({ data }: { data: IntegrationsData }) {
    const [tab, setTab] = useState<TabKey>('sso');
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    const notifyOk = useCallback((msg: string) => setToast(msg), []);
    const notifyErr = useCallback((msg: string) => setError(msg), []);

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Integrasjoner</h1>
                    <p className={styles.subtitle}>
                        SSO, SCIM-provisjonering, webhooks, LTI og audit-logg
                    </p>
                </div>
            </div>

            {error && (
                <div className={styles.errorBanner}>
                    <AlertTriangle size={16} />
                    {error}
                    <button
                        className={styles.bannerClose}
                        onClick={() => setError(null)}
                        aria-label="Lukk feilmelding"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            <div className={styles.layout}>
                {/* Sub-nav */}
                <nav className={styles.subnav} aria-label="Integrasjoner">
                    {TABS.map((t) => {
                        const Icon = t.icon;
                        const active = tab === t.key;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                className={`${styles.subnavItem} ${active ? styles.subnavItemActive : ''}`}
                                onClick={() => setTab(t.key)}
                                aria-current={active ? 'page' : undefined}
                            >
                                <Icon size={17} />
                                {t.label}
                            </button>
                        );
                    })}
                </nav>

                {/* Panel */}
                <div className={styles.panel}>
                    {tab === 'sso' && (
                        data.access.sso.allowed
                            ? <SsoTab initial={data.sso} onOk={notifyOk} onErr={notifyErr} />
                            : <UpgradeCard title="SSO (SAML)" reason={data.access.sso.reason} />
                    )}
                    {tab === 'scim' && (
                        data.access.scim.allowed
                            ? <ScimTab initial={data.scimTokens} onOk={notifyOk} onErr={notifyErr} />
                            : <UpgradeCard title="SCIM" reason={data.access.scim.reason} />
                    )}
                    {tab === 'webhooks' && (
                        data.access.webhooks.allowed
                            ? <WebhooksTab initial={data.webhooks} onOk={notifyOk} onErr={notifyErr} />
                            : <UpgradeCard title="Webhooks" reason={data.access.webhooks.reason} />
                    )}
                    {tab === 'lti' && (
                        data.access.lti.allowed
                            ? <LtiTab initial={data.ltiPlatforms} onOk={notifyOk} onErr={notifyErr} />
                            : <UpgradeCard title="LTI" reason={data.access.lti.reason} />
                    )}
                    {tab === 'audit' && (
                        data.access.audit.allowed
                            ? <AuditTab initial={data.auditLogs} onOk={notifyOk} onErr={notifyErr} />
                            : <UpgradeCard title="Audit-logg" reason={data.access.audit.reason} />
                    )}
                </div>
            </div>

            {toast && (
                <div className={styles.toast}>
                    <CheckCircle size={16} />
                    {toast}
                </div>
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// SSO TAB
// ════════════════════════════════════════════════════════════

function SsoTab({
    initial, onOk, onErr,
}: {
    initial: SsoData | null;
    onOk: (m: string) => void;
    onErr: (m: string) => void;
}) {
    const [enabled, setEnabled] = useState(initial?.enabled ?? false);
    const [saving, setSaving] = useState(false);
    const [toggling, setToggling] = useState(false);
    const mapping = initial?.attributeMapping ?? {};

    // SP-metadata (ACS URL er en placeholder – live SAML-handshake er ikke implementert).
    const spEntityId = initial?.spEntityId || 'urn:egenakademi:sp';
    const acsPlaceholder = '<din-tenant>.egenakademi.no/api/auth/saml/acs';

    async function handleSave(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setSaving(true);
        const result = await upsertSsoConnection({
            idpEntityId: (form.get('idpEntityId') as string) || undefined,
            idpSsoUrl: (form.get('idpSsoUrl') as string) || undefined,
            idpCertificate: (form.get('idpCertificate') as string) || undefined,
            spEntityId: (form.get('spEntityId') as string) || undefined,
            attributeMapping: {
                email: (form.get('mapEmail') as string) || '',
                firstName: (form.get('mapFirstName') as string) || '',
                lastName: (form.get('mapLastName') as string) || '',
            },
        });
        setSaving(false);
        if ('success' in result) onOk('SSO-konfigurasjon lagret');
        else onErr(result.error);
    }

    async function handleToggle() {
        setToggling(true);
        const next = !enabled;
        const result = await setSsoEnabled(next);
        setToggling(false);
        if ('success' in result) {
            setEnabled(next);
            onOk(next ? 'SSO aktivert' : 'SSO deaktivert');
        } else {
            onErr(result.error);
        }
    }

    return (
        <div className={styles.tabContent}>
            <div className={styles.sectionHead}>
                <div>
                    <h2 className={styles.sectionTitle}>SAML 2.0 Single Sign-On</h2>
                    <p className={styles.sectionDesc}>
                        Koble til din identitetsleverandør (IdP) for innlogging via SAML.
                    </p>
                </div>
                <button
                    type="button"
                    className={`${styles.toggleBtn} ${enabled ? styles.toggleOn : styles.toggleOff}`}
                    onClick={handleToggle}
                    disabled={toggling}
                >
                    <Power size={15} />
                    {enabled ? 'Aktivert' : 'Deaktivert'}
                </button>
            </div>

            {/* SP-metadata */}
            <div className={styles.infoCard}>
                <span className={styles.infoCardLabel}>Vår tjenesteleverandør (SP)</span>
                <div className={styles.kvRow}>
                    <span className={styles.kvKey}>SP Entity ID</span>
                    <code className={styles.kvValue}>{spEntityId}</code>
                </div>
                <div className={styles.kvRow}>
                    <span className={styles.kvKey}>ACS URL (placeholder)</span>
                    <code className={styles.kvValue}>{acsPlaceholder}</code>
                </div>
            </div>

            <form onSubmit={handleSave} className={styles.form}>
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>IdP Entity ID / Issuer</label>
                    <input
                        className={styles.input}
                        name="idpEntityId"
                        defaultValue={initial?.idpEntityId ?? ''}
                        placeholder="https://idp.example.com/metadata"
                    />
                </div>
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>IdP SSO-URL (https)</label>
                    <input
                        className={styles.input}
                        name="idpSsoUrl"
                        defaultValue={initial?.idpSsoUrl ?? ''}
                        placeholder="https://idp.example.com/sso"
                    />
                </div>
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>IdP X.509-sertifikat (PEM)</label>
                    <textarea
                        className={styles.textarea}
                        name="idpCertificate"
                        rows={6}
                        defaultValue={initial?.idpCertificate ?? ''}
                        placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'}
                    />
                </div>
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>SP Entity ID (vår)</label>
                    <input
                        className={styles.input}
                        name="spEntityId"
                        defaultValue={initial?.spEntityId ?? ''}
                        placeholder="urn:egenakademi:sp"
                    />
                </div>

                <div className={styles.divider} />
                <span className={styles.subLabel}>Attributtmapping</span>
                <div className={styles.formRow3}>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>E-post</label>
                        <input className={styles.input} name="mapEmail" defaultValue={mapping.email ?? ''} placeholder="email" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Fornavn</label>
                        <input className={styles.input} name="mapFirstName" defaultValue={mapping.firstName ?? ''} placeholder="givenName" />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Etternavn</label>
                        <input className={styles.input} name="mapLastName" defaultValue={mapping.lastName ?? ''} placeholder="sn" />
                    </div>
                </div>

                <div className={styles.formActions}>
                    <button type="submit" className={styles.btnPrimary} disabled={saving}>
                        {saving ? 'Lagrer…' : 'Lagre konfigurasjon'}
                    </button>
                </div>
            </form>
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// SCIM TAB
// ════════════════════════════════════════════════════════════

function ScimTab({
    initial, onOk, onErr,
}: {
    initial: ScimTokenListItem[];
    onOk: (m: string) => void;
    onErr: (m: string) => void;
}) {
    const [tokens, setTokens] = useState<ScimTokenListItem[]>(initial);
    const [showForm, setShowForm] = useState(false);
    const [creating, setCreating] = useState(false);
    const [plaintext, setPlaintext] = useState<string | null>(null);
    const [revoking, setRevoking] = useState<string | null>(null);

    const scimBaseUrl = '/api/scim/v2';

    async function refresh() {
        const result = await listScimTokens();
        if ('tokens' in result) setTokens(result.tokens);
    }

    async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const name = (form.get('name') as string) || '';
        const expiresAt = (form.get('expiresAt') as string) || undefined;
        setCreating(true);
        const result = await createScimToken(name, expiresAt || null);
        setCreating(false);
        if ('success' in result) {
            setPlaintext(result.plaintext);
            setShowForm(false);
            onOk('SCIM-token opprettet');
            await refresh();
        } else {
            onErr(result.error);
        }
    }

    async function handleRevoke(id: string) {
        setRevoking(id);
        const result = await revokeScimToken(id);
        setRevoking(null);
        if ('success' in result) {
            onOk('Token tilbakekalt');
            await refresh();
        } else {
            onErr(result.error);
        }
    }

    return (
        <div className={styles.tabContent}>
            <div className={styles.sectionHead}>
                <div>
                    <h2 className={styles.sectionTitle}>SCIM 2.0 provisjonering</h2>
                    <p className={styles.sectionDesc}>
                        Automatisk bruker-provisjonering via SCIM-tokens.
                    </p>
                </div>
                <button type="button" className={styles.btnPrimary} onClick={() => setShowForm((v) => !v)}>
                    <Plus size={16} />
                    Generer token
                </button>
            </div>

            <div className={styles.infoCard}>
                <span className={styles.infoCardLabel}>SCIM Base-URL</span>
                <div className={styles.kvRow}>
                    <code className={styles.kvValue}>{scimBaseUrl}</code>
                </div>
            </div>

            {/* Freshly created plaintext – shown once */}
            {plaintext && (
                <div className={styles.secretReveal}>
                    <div className={styles.secretWarn}>
                        <AlertTriangle size={16} />
                        Kopier tokenet nå. Det vises kun denne ene gangen.
                    </div>
                    <CopyBox value={plaintext} />
                    <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => setPlaintext(null)}
                    >
                        Jeg har kopiert tokenet
                    </button>
                </div>
            )}

            {showForm && (
                <form onSubmit={handleCreate} className={styles.inlineForm}>
                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Navn *</label>
                            <input className={styles.input} name="name" required placeholder="F.eks. Azure AD provisjonering" autoFocus />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Utløper (valgfritt)</label>
                            <input className={styles.input} type="date" name="expiresAt" />
                        </div>
                    </div>
                    <div className={styles.formActions}>
                        <button type="button" className={styles.btnGhost} onClick={() => setShowForm(false)}>Avbryt</button>
                        <button type="submit" className={styles.btnPrimary} disabled={creating}>
                            {creating ? 'Oppretter…' : 'Opprett token'}
                        </button>
                    </div>
                </form>
            )}

            {tokens.length === 0 ? (
                <EmptyState icon={<KeyRound size={26} />} title="Ingen tokens ennå" text="Generer et SCIM-token for å koble til din IdP." />
            ) : (
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Navn</th>
                            <th>Prefiks</th>
                            <th>Opprettet</th>
                            <th>Sist brukt</th>
                            <th>Utløper</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {tokens.map((t) => {
                            const revoked = !!t.revokedAt;
                            const expired = t.expiresAt ? new Date(t.expiresAt).getTime() < Date.now() : false;
                            return (
                                <tr key={t.id}>
                                    <td>{t.name}</td>
                                    <td><code className={styles.codeInline}>{t.tokenPrefix}</code></td>
                                    <td className={styles.muted}>{formatDateTime(t.createdAt)}</td>
                                    <td className={styles.muted}>{formatDateTime(t.lastUsedAt)}</td>
                                    <td className={styles.muted}>{t.expiresAt ? formatDateTime(t.expiresAt) : 'Aldri'}</td>
                                    <td>
                                        {revoked ? (
                                            <span className={`${styles.badge} ${styles.badgeDanger}`}>Tilbakekalt</span>
                                        ) : expired ? (
                                            <span className={`${styles.badge} ${styles.badgeWarning}`}>Utløpt</span>
                                        ) : (
                                            <span className={`${styles.badge} ${styles.badgeSuccess}`}>Aktiv</span>
                                        )}
                                    </td>
                                    <td>
                                        {!revoked && (
                                            <button
                                                type="button"
                                                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                                onClick={() => handleRevoke(t.id)}
                                                disabled={revoking === t.id}
                                                aria-label="Tilbakekall token"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// WEBHOOKS TAB
// ════════════════════════════════════════════════════════════

function WebhooksTab({
    initial, onOk, onErr,
}: {
    initial: WebhookListItem[];
    onOk: (m: string) => void;
    onErr: (m: string) => void;
}) {
    const [webhooks, setWebhooks] = useState<WebhookListItem[]>(initial);
    const [showForm, setShowForm] = useState(false);
    const [creating, setCreating] = useState(false);
    const [secret, setSecret] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [deliveries, setDeliveries] = useState<Record<string, WebhookDeliveryItem[]>>({});
    const [busy, setBusy] = useState<string | null>(null);

    async function refresh() {
        const result = await listWebhooks();
        if ('webhooks' in result) setWebhooks(result.webhooks);
    }

    async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const url = (form.get('url') as string) || '';
        const events = WEBHOOK_EVENTS.filter((ev) => form.get(`ev_${ev}`) === 'on');
        setCreating(true);
        const result = await createWebhook(url, events);
        setCreating(false);
        if ('success' in result) {
            setSecret(result.secret);
            setShowForm(false);
            onOk('Webhook opprettet');
            await refresh();
        } else {
            onErr(result.error);
        }
    }

    async function toggleEnabled(w: WebhookListItem) {
        setBusy(w.id);
        const result = await setWebhookEnabled(w.id, !w.enabled);
        setBusy(null);
        if ('success' in result) {
            onOk(!w.enabled ? 'Webhook aktivert' : 'Webhook deaktivert');
            await refresh();
        } else {
            onErr(result.error);
        }
    }

    async function handleDelete(id: string) {
        setBusy(id);
        const result = await deleteWebhook(id);
        setBusy(null);
        if ('success' in result) {
            onOk('Webhook slettet');
            await refresh();
        } else {
            onErr(result.error);
        }
    }

    async function handleTest(id: string) {
        setBusy(id);
        const result = await sendTestWebhook(id);
        setBusy(null);
        if ('success' in result) {
            onOk(result.ok ? `Test sendt (HTTP ${result.statusCode ?? '–'})` : 'Test sendt, men leveringen feilet');
            if (expanded === id) await loadDeliveries(id);
        } else {
            onErr(result.error);
        }
    }

    const loadDeliveries = useCallback(async (id: string) => {
        const result = await listRecentDeliveries(id);
        if ('deliveries' in result) {
            setDeliveries((prev) => ({ ...prev, [id]: result.deliveries }));
        }
    }, []);

    async function toggleExpand(id: string) {
        if (expanded === id) {
            setExpanded(null);
        } else {
            setExpanded(id);
            await loadDeliveries(id);
        }
    }

    return (
        <div className={styles.tabContent}>
            <div className={styles.sectionHead}>
                <div>
                    <h2 className={styles.sectionTitle}>Webhooks</h2>
                    <p className={styles.sectionDesc}>
                        Send hendelser til dine systemer. Payloads signeres med HMAC-SHA256
                        (header <code className={styles.codeInline}>X-EgenAkademi-Signature</code>).
                    </p>
                </div>
                <button type="button" className={styles.btnPrimary} onClick={() => setShowForm((v) => !v)}>
                    <Plus size={16} />
                    Ny webhook
                </button>
            </div>

            {secret && (
                <div className={styles.secretReveal}>
                    <div className={styles.secretWarn}>
                        <AlertTriangle size={16} />
                        Kopier signeringsnøkkelen nå. Den vises kun denne ene gangen.
                    </div>
                    <CopyBox value={secret} />
                    <button type="button" className={styles.btnGhost} onClick={() => setSecret(null)}>
                        Jeg har kopiert nøkkelen
                    </button>
                </div>
            )}

            {showForm && (
                <form onSubmit={handleCreate} className={styles.inlineForm}>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Endepunkt-URL (https) *</label>
                        <input className={styles.input} name="url" required placeholder="https://example.com/hooks/egenakademi" autoFocus />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Hendelser</label>
                        <div className={styles.checkGrid}>
                            {WEBHOOK_EVENTS.map((ev) => (
                                <label key={ev} className={styles.checkItem}>
                                    <input type="checkbox" name={`ev_${ev}`} />
                                    <span>{ev}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className={styles.formActions}>
                        <button type="button" className={styles.btnGhost} onClick={() => setShowForm(false)}>Avbryt</button>
                        <button type="submit" className={styles.btnPrimary} disabled={creating}>
                            {creating ? 'Oppretter…' : 'Opprett webhook'}
                        </button>
                    </div>
                </form>
            )}

            {webhooks.length === 0 ? (
                <EmptyState icon={<Webhook size={26} />} title="Ingen webhooks ennå" text="Opprett en webhook for å motta hendelser." />
            ) : (
                <div className={styles.cardList}>
                    {webhooks.map((w) => (
                        <div key={w.id} className={styles.webhookCard}>
                            <div className={styles.webhookHead}>
                                <div className={styles.webhookInfo}>
                                    <code className={styles.webhookUrl}>{w.url}</code>
                                    <div className={styles.eventChips}>
                                        {w.events.map((ev) => (
                                            <span key={ev} className={styles.eventChip}>{ev}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className={styles.webhookActions}>
                                    <button
                                        type="button"
                                        className={`${styles.toggleBtnSm} ${w.enabled ? styles.toggleOn : styles.toggleOff}`}
                                        onClick={() => toggleEnabled(w)}
                                        disabled={busy === w.id}
                                    >
                                        <Power size={13} />
                                        {w.enabled ? 'På' : 'Av'}
                                    </button>
                                    <button type="button" className={styles.iconBtn} onClick={() => handleTest(w.id)} disabled={busy === w.id} aria-label="Send test">
                                        <Send size={15} />
                                    </button>
                                    <button type="button" className={styles.iconBtn} onClick={() => toggleExpand(w.id)} aria-label="Vis leveringer">
                                        <RefreshCw size={15} />
                                    </button>
                                    <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => handleDelete(w.id)} disabled={busy === w.id} aria-label="Slett webhook">
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                            {expanded === w.id && (
                                <div className={styles.deliveries}>
                                    {(deliveries[w.id] ?? []).length === 0 ? (
                                        <span className={styles.muted}>Ingen leveringer registrert ennå.</span>
                                    ) : (
                                        <table className={styles.tableSm}>
                                            <thead>
                                                <tr><th>Hendelse</th><th>Status</th><th>Tid</th></tr>
                                            </thead>
                                            <tbody>
                                                {(deliveries[w.id] ?? []).map((d) => (
                                                    <tr key={d.id}>
                                                        <td><code className={styles.codeInline}>{d.event}</code></td>
                                                        <td>
                                                            <span className={`${styles.badge} ${d.success ? styles.badgeSuccess : styles.badgeDanger}`}>
                                                                {d.success ? `OK ${d.statusCode ?? ''}` : (d.error || 'Feilet')}
                                                            </span>
                                                        </td>
                                                        <td className={styles.muted}>{formatDateTime(d.createdAt)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// LTI TAB
// ════════════════════════════════════════════════════════════

function LtiTab({
    initial, onOk, onErr,
}: {
    initial: LtiPlatformItem[];
    onOk: (m: string) => void;
    onErr: (m: string) => void;
}) {
    const [platforms, setPlatforms] = useState<LtiPlatformItem[]>(initial);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<LtiPlatformItem | null>(null);
    const [saving, setSaving] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    async function refresh() {
        const result = await listLtiPlatforms();
        if ('platforms' in result) setPlatforms(result.platforms);
    }

    function openCreate() {
        setEditing(null);
        setShowForm(true);
    }
    function openEdit(p: LtiPlatformItem) {
        setEditing(p);
        setShowForm(true);
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const payload = {
            name: (form.get('name') as string) || '',
            issuer: (form.get('issuer') as string) || '',
            clientId: (form.get('clientId') as string) || '',
            authUrl: (form.get('authUrl') as string) || undefined,
            jwksUrl: (form.get('jwksUrl') as string) || undefined,
        };
        setSaving(true);
        const result = editing
            ? await updateLtiPlatform(editing.id, payload)
            : await createLtiPlatform(payload);
        setSaving(false);
        if ('success' in result) {
            setShowForm(false);
            setEditing(null);
            onOk(editing ? 'LTI-plattform oppdatert' : 'LTI-plattform opprettet');
            await refresh();
        } else {
            onErr(result.error);
        }
    }

    async function toggleEnabled(p: LtiPlatformItem) {
        setBusy(p.id);
        const result = await setLtiEnabled(p.id, !p.enabled);
        setBusy(null);
        if ('success' in result) {
            onOk(!p.enabled ? 'Plattform aktivert' : 'Plattform deaktivert');
            await refresh();
        } else {
            onErr(result.error);
        }
    }

    async function handleDelete(id: string) {
        setBusy(id);
        const result = await deleteLtiPlatform(id);
        setBusy(null);
        if ('success' in result) {
            onOk('Plattform slettet');
            await refresh();
        } else {
            onErr(result.error);
        }
    }

    return (
        <div className={styles.tabContent}>
            <div className={styles.sectionHead}>
                <div>
                    <h2 className={styles.sectionTitle}>LTI 1.3-plattformer</h2>
                    <p className={styles.sectionDesc}>
                        Registrer LMS-plattformer som kan starte kurs via LTI.
                    </p>
                </div>
                <button type="button" className={styles.btnPrimary} onClick={openCreate}>
                    <Plus size={16} />
                    Ny plattform
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className={styles.inlineForm}>
                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Navn *</label>
                            <input className={styles.input} name="name" required defaultValue={editing?.name ?? ''} placeholder="F.eks. Canvas" autoFocus />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Client ID *</label>
                            <input className={styles.input} name="clientId" required defaultValue={editing?.clientId ?? ''} placeholder="10000000000001" />
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Issuer (iss) *</label>
                        <input className={styles.input} name="issuer" required defaultValue={editing?.issuer ?? ''} placeholder="https://canvas.instructure.com" />
                    </div>
                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Auth-URL (OIDC)</label>
                            <input className={styles.input} name="authUrl" defaultValue={editing?.authUrl ?? ''} placeholder="https://…/api/lti/authorize_redirect" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>JWKS-URL</label>
                            <input className={styles.input} name="jwksUrl" defaultValue={editing?.jwksUrl ?? ''} placeholder="https://…/api/lti/security/jwks" />
                        </div>
                    </div>
                    <div className={styles.formActions}>
                        <button type="button" className={styles.btnGhost} onClick={() => { setShowForm(false); setEditing(null); }}>Avbryt</button>
                        <button type="submit" className={styles.btnPrimary} disabled={saving}>
                            {saving ? 'Lagrer…' : editing ? 'Lagre endringer' : 'Opprett plattform'}
                        </button>
                    </div>
                </form>
            )}

            {platforms.length === 0 ? (
                <EmptyState icon={<Plug size={26} />} title="Ingen plattformer ennå" text="Registrer en LTI-plattform for å koble til et eksternt LMS." />
            ) : (
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Navn</th>
                            <th>Issuer</th>
                            <th>Client ID</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {platforms.map((p) => (
                            <tr key={p.id}>
                                <td>{p.name}</td>
                                <td><code className={styles.codeInline}>{p.issuer}</code></td>
                                <td><code className={styles.codeInline}>{p.clientId}</code></td>
                                <td>
                                    <button
                                        type="button"
                                        className={`${styles.toggleBtnSm} ${p.enabled ? styles.toggleOn : styles.toggleOff}`}
                                        onClick={() => toggleEnabled(p)}
                                        disabled={busy === p.id}
                                    >
                                        <Power size={13} />
                                        {p.enabled ? 'På' : 'Av'}
                                    </button>
                                </td>
                                <td>
                                    <div className={styles.rowActions}>
                                        <button type="button" className={styles.iconBtn} onClick={() => openEdit(p)} aria-label="Rediger">
                                            <Edit3 size={15} />
                                        </button>
                                        <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => handleDelete(p.id)} disabled={busy === p.id} aria-label="Slett">
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// AUDIT TAB
// ════════════════════════════════════════════════════════════

function AuditTab({
    initial, onOk, onErr,
}: {
    initial: AuditLogItem[];
    onOk: (m: string) => void;
    onErr: (m: string) => void;
}) {
    const [logs, setLogs] = useState<AuditLogItem[]>(initial);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);

    // Retention-kontroll
    const [retentionLoaded, setRetentionLoaded] = useState(false);
    const [keepForever, setKeepForever] = useState(true);
    const [retentionDays, setRetentionDays] = useState<string>('365');
    const [savingRetention, setSavingRetention] = useState(false);
    const [cleaning, setCleaning] = useState(false);
    const [exporting, setExporting] = useState(false);

    const refresh = useCallback(async (q: string) => {
        setLoading(true);
        const result = await listAuditLogs({ search: q || undefined, limit: 100 });
        setLoading(false);
        if ('logs' in result) setLogs(result.logs);
        else onErr(result.error);
    }, [onErr]);

    useEffect(() => {
        // Debounce søk. Kjører også ved montering for å holde listen i synk med
        // serverens filtrering (initial-data er kun et førstevisnings-øyeblikksbilde).
        const t = setTimeout(() => {
            refresh(search);
        }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    // Hent gjeldende oppbevaringsinnstilling én gang.
    useEffect(() => {
        let active = true;
        (async () => {
            const result = await getAuditRetention();
            if (!active) return;
            if ('retentionDays' in result) {
                if (result.retentionDays == null) {
                    setKeepForever(true);
                } else {
                    setKeepForever(false);
                    setRetentionDays(String(result.retentionDays));
                }
            }
            setRetentionLoaded(true);
        })();
        return () => {
            active = false;
        };
    }, []);

    async function handleSaveRetention(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        let days: number | null = null;
        if (!keepForever) {
            const parsed = parseInt(retentionDays, 10);
            if (!Number.isFinite(parsed) || parsed < 1 || parsed > 3650) {
                onErr('Antall dager må være et heltall mellom 1 og 3650');
                return;
            }
            days = parsed;
        }
        setSavingRetention(true);
        const result = await setAuditRetention(days);
        setSavingRetention(false);
        if ('success' in result) {
            onOk('Oppbevaringsinnstilling lagret');
        } else {
            onErr(result.error);
        }
    }

    async function handleExport() {
        setExporting(true);
        const result = await exportAuditCsv({ search: search || undefined });
        setExporting(false);
        if ('csv' in result) {
            const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            onOk(
                result.capped
                    ? 'CSV eksportert (begrenset til 5000 rader)'
                    : 'CSV eksportert'
            );
        } else {
            onErr(result.error);
        }
    }

    async function handleRunRetention() {
        setCleaning(true);
        const result = await runAuditRetention();
        setCleaning(false);
        if ('deleted' in result) {
            onOk(
                result.deleted > 0
                    ? `Opprydding fullført – ${result.deleted} hendelser slettet`
                    : 'Opprydding fullført – ingen hendelser eldre enn grensen'
            );
            await refresh(search);
        } else {
            onErr(result.error);
        }
    }

    return (
        <div className={styles.tabContent}>
            <div className={styles.sectionHead}>
                <div>
                    <h2 className={styles.sectionTitle}>Audit-logg</h2>
                    <p className={styles.sectionDesc}>
                        Sikkerhetshendelser i organisasjonen, nyeste først.
                    </p>
                </div>
                <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={handleExport}
                    disabled={exporting}
                >
                    <span className={styles.btnIconLabel}>
                        <Download size={15} />
                        {exporting ? 'Eksporterer…' : 'Eksporter CSV'}
                    </span>
                </button>
            </div>

            {/* Oppbevaring (retention) */}
            <form onSubmit={handleSaveRetention} className={styles.inlineForm}>
                <div className={styles.formGroup}>
                    <span className={styles.subLabel}>Oppbevaring av audit-logg</span>
                    <p className={styles.retentionHint}>
                        Bestem hvor lenge hendelser skal lagres. Eldre hendelser kan
                        ryddes bort manuelt nedenfor.
                    </p>
                </div>

                <div className={styles.retentionControls}>
                    <label className={styles.checkItem}>
                        <input
                            type="radio"
                            name="retentionMode"
                            checked={keepForever}
                            onChange={() => setKeepForever(true)}
                        />
                        <span>Behold for alltid</span>
                    </label>
                    <label className={styles.checkItem}>
                        <input
                            type="radio"
                            name="retentionMode"
                            checked={!keepForever}
                            onChange={() => setKeepForever(false)}
                        />
                        <span>Behold i</span>
                    </label>
                    <input
                        className={styles.daysInput}
                        type="number"
                        min={1}
                        max={3650}
                        value={retentionDays}
                        onChange={(e) => setRetentionDays(e.target.value)}
                        onFocus={() => setKeepForever(false)}
                        disabled={keepForever}
                        aria-label="Antall dager"
                    />
                    <span className={styles.muted}>dager</span>
                </div>

                <div className={styles.formActions}>
                    <button
                        type="submit"
                        className={styles.btnPrimary}
                        disabled={savingRetention || !retentionLoaded}
                    >
                        <Save size={15} />
                        {savingRetention ? 'Lagrer…' : 'Lagre oppbevaring'}
                    </button>
                </div>
            </form>

            {/* Manuell opprydding */}
            <div className={styles.retentionNote}>
                <Info size={15} />
                <div>
                    <span>
                        Planlagt håndheving av oppbevaring (cron) er ennå ikke satt opp
                        (TODO). Inntil videre kan du kjøre oppryddingen manuelt.
                    </span>
                    <div className={styles.retentionNoteAction}>
                        <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={handleRunRetention}
                            disabled={cleaning}
                        >
                            <span className={styles.btnIconLabel}>
                                <Eraser size={15} />
                                {cleaning ? 'Rydder opp…' : 'Kjør opprydding nå'}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            <div className={styles.divider} />

            <span className={styles.subLabel}>
                <span className={styles.btnIconLabel}>
                    <Clock size={14} />
                    Hendelser
                </span>
            </span>

            <input
                className={styles.input}
                placeholder="Søk i handling, aktør, mål…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />

            {loading ? (
                <div className={styles.loadingRow}><span className={styles.spinner} /> Laster…</div>
            ) : logs.length === 0 ? (
                <EmptyState icon={<ScrollText size={26} />} title="Ingen hendelser" text="Ingen audit-hendelser matcher søket ennå." />
            ) : (
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Tid</th>
                            <th>Aktør</th>
                            <th>Handling</th>
                            <th>Mål</th>
                            <th>IP</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map((l) => (
                            <tr key={l.id}>
                                <td className={styles.muted}>{formatDateTime(l.createdAt)}</td>
                                <td>{l.actorEmail ?? <span className={styles.muted}>System</span>}</td>
                                <td><code className={styles.codeInline}>{l.action}</code></td>
                                <td className={styles.muted}>
                                    {l.targetType ? `${l.targetType}${l.targetId ? `:${l.targetId.slice(0, 8)}` : ''}` : '–'}
                                </td>
                                <td className={styles.muted}>{l.ip ?? '–'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ── Shared empty state ──────────────────────────────────────

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
    return (
        <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>{icon}</div>
            <span className={styles.emptyTitle}>{title}</span>
            <span className={styles.emptyText}>{text}</span>
        </div>
    );
}
