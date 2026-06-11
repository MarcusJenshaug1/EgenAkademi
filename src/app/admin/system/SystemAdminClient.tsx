'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    ShieldAlert, Building2, Crown, Save, Search, Users, CheckCircle, X,
} from 'lucide-react';
import type { TenantPlan } from '@prisma/client';
import {
    listAllTenants,
    updateTenant,
    type TenantListItem,
    type SystemStats,
} from '@/app/actions/systemAdminActions';
import { PLAN_INFO, ADDON_FEATURES } from '@/lib/features';
import styles from './system.module.css';

const PLAN_ORDER: TenantPlan[] = ['FREE', 'STANDARD', 'PLUS', 'ENTERPRISE'];
const ADDON_ENTRIES = Object.entries(ADDON_FEATURES) as [string, string][];

interface SystemAdminClientProps {
    initialTenants: TenantListItem[];
    initialStats: SystemStats;
}

/** Per-row editable draft, independent of the persisted list value. */
interface RowDraft {
    plan: TenantPlan;
    addons: string[];
    trialEndsAt: string; // yyyy-mm-dd for <input type="date">, '' = none
}

/** Convert a Date | null into the yyyy-mm-dd value an <input type="date"> expects. */
function toDateInputValue(date: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

function draftFromTenant(t: TenantListItem): RowDraft {
    return {
        plan: t.plan,
        addons: [...t.addons],
        trialEndsAt: toDateInputValue(t.trialEndsAt),
    };
}

function draftMatchesTenant(draft: RowDraft, t: TenantListItem): boolean {
    if (draft.plan !== t.plan) return false;
    if (draft.trialEndsAt !== toDateInputValue(t.trialEndsAt)) return false;
    const a = [...draft.addons].sort();
    const b = [...t.addons].sort();
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
}

export default function SystemAdminClient({ initialTenants, initialStats }: SystemAdminClientProps) {
    const [tenants, setTenants] = useState<TenantListItem[]>(initialTenants);
    const [stats] = useState<SystemStats>(initialStats);
    const [search, setSearch] = useState('');
    const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
        Object.fromEntries(initialTenants.map((t) => [t.id, draftFromTenant(t)]))
    );
    const [savingId, setSavingId] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    function showToast(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    }

    // Keep drafts in sync when the tenant list is (re)loaded by search.
    const syncDrafts = useCallback((list: TenantListItem[]) => {
        setDrafts((prev) => {
            const next: Record<string, RowDraft> = {};
            for (const t of list) {
                // Preserve an in-progress edit if it still diverges from the new server value.
                next[t.id] = prev[t.id] && !draftMatchesTenant(prev[t.id], t)
                    ? prev[t.id]
                    : draftFromTenant(t);
            }
            return next;
        });
    }, []);

    // Search debounce
    useEffect(() => {
        const handle = setTimeout(async () => {
            const result = await listAllTenants(search || undefined);
            if ('tenants' in result) {
                setTenants(result.tenants);
                syncDrafts(result.tenants);
            }
        }, 300);
        return () => clearTimeout(handle);
    }, [search, syncDrafts]);

    function updateDraft(tenantId: string, patch: Partial<RowDraft>) {
        setDrafts((prev) => ({ ...prev, [tenantId]: { ...prev[tenantId], ...patch } }));
    }

    function toggleAddon(tenantId: string, key: string) {
        setDrafts((prev) => {
            const current = prev[tenantId];
            if (!current) return prev;
            const has = current.addons.includes(key);
            const addons = has
                ? current.addons.filter((a) => a !== key)
                : [...current.addons, key];
            return { ...prev, [tenantId]: { ...current, addons } };
        });
    }

    async function handleSave(tenant: TenantListItem) {
        const draft = drafts[tenant.id];
        if (!draft) return;
        setError(null);
        setSavingId(tenant.id);
        const result = await updateTenant(tenant.id, {
            plan: draft.plan,
            addons: draft.addons,
            trialEndsAt: draft.trialEndsAt === '' ? null : draft.trialEndsAt,
        });
        setSavingId(null);
        if ('error' in result) {
            setError(result.error);
            return;
        }
        // Reflect the saved draft into the persisted list so the dirty-state clears.
        setTenants((prev) =>
            prev.map((t) =>
                t.id === tenant.id
                    ? {
                          ...t,
                          plan: draft.plan,
                          addons: [...draft.addons],
                          trialEndsAt: draft.trialEndsAt === '' ? null : new Date(draft.trialEndsAt),
                      }
                    : t
            )
        );
        showToast(`«${tenant.name}» oppdatert`);
    }

    return (
        <div className={styles.systemPage}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <span className={styles.headerBadge}>
                        <ShieldAlert size={14} /> Systemadministrasjon
                    </span>
                    <h1 className={styles.title}>Organisasjoner</h1>
                    <p className={styles.subtitle}>
                        Administrer planer, tillegg og prøveperioder på tvers av alle organisasjoner.
                    </p>
                </div>
            </div>

            {error && (
                <div className={styles.errorBanner}>
                    <X size={16} /> {error}
                </div>
            )}

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}><Building2 size={18} /></div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Organisasjoner</span>
                        <span className={styles.statValue}>{stats.totalTenants}</span>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}><Users size={18} /></div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Brukere totalt</span>
                        <span className={styles.statValue}>{stats.totalUsers}</span>
                    </div>
                </div>
                {PLAN_ORDER.map((plan) => (
                    <div key={plan} className={styles.statCard}>
                        <div className={styles.statIcon}><Crown size={18} /></div>
                        <div className={styles.statBody}>
                            <span className={styles.statLabel}>{PLAN_INFO[plan].label}</span>
                            <span className={styles.statValue}>{stats.tenantsPerPlan[plan]}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Søk etter organisasjon eller domene..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Tenant table */}
            {tenants.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}><Building2 size={28} /></div>
                    <p className={styles.emptyTitle}>Ingen organisasjoner funnet</p>
                    <p className={styles.emptyText}>Juster søket for å se flere resultater.</p>
                </div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Organisasjon</th>
                                <th>Plan</th>
                                <th>Tillegg</th>
                                <th>Prøveperiode</th>
                                <th>Brukere</th>
                                <th className={styles.actionsCol}>Handling</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tenants.map((t) => {
                                const draft = drafts[t.id] ?? draftFromTenant(t);
                                const dirty = !draftMatchesTenant(draft, t);
                                const saving = savingId === t.id;
                                return (
                                    <tr key={t.id} className={dirty ? styles.rowDirty : undefined}>
                                        <td>
                                            <div className={styles.tenantCell}>
                                                <span className={styles.tenantName}>{t.name}</span>
                                                <span className={styles.tenantId}>{t.id}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <select
                                                className={styles.planSelect}
                                                value={draft.plan}
                                                onChange={(e) =>
                                                    updateDraft(t.id, { plan: e.target.value as TenantPlan })
                                                }
                                                aria-label={`Plan for ${t.name}`}
                                            >
                                                {PLAN_ORDER.map((plan) => (
                                                    <option key={plan} value={plan}>
                                                        {PLAN_INFO[plan].label}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <div className={styles.addonList}>
                                                {ADDON_ENTRIES.map(([key, label]) => {
                                                    const checked = draft.addons.includes(key);
                                                    return (
                                                        <label
                                                            key={key}
                                                            className={`${styles.addonItem} ${checked ? styles.addonItemOn : ''}`}
                                                            title={label}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className={styles.addonCheckbox}
                                                                checked={checked}
                                                                onChange={() => toggleAddon(t.id, key)}
                                                            />
                                                            <span className={styles.addonKey}>{key}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td>
                                            <input
                                                type="date"
                                                className={styles.dateInput}
                                                value={draft.trialEndsAt}
                                                onChange={(e) =>
                                                    updateDraft(t.id, { trialEndsAt: e.target.value })
                                                }
                                                aria-label={`Prøveperiode for ${t.name}`}
                                            />
                                        </td>
                                        <td>
                                            <span className={styles.userCountCell}>
                                                <Users size={13} /> {t.userCount}
                                            </span>
                                        </td>
                                        <td className={styles.actionsCol}>
                                            <button
                                                type="button"
                                                className={styles.saveBtn}
                                                onClick={() => handleSave(t)}
                                                disabled={!dirty || saving}
                                            >
                                                <Save size={14} />
                                                {saving ? 'Lagrer…' : 'Lagre'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={styles.toast}>
                    <CheckCircle size={16} /> {toast}
                </div>
            )}
        </div>
    );
}
