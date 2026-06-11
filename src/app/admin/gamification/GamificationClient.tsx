'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Trophy, Award, Star, Flame, Medal, Settings2, Users, Plus, Edit3, Trash2, X,
    CheckCircle, AlertTriangle, Save, Search, ToggleLeft, ToggleRight,
} from 'lucide-react';
import styles from './gamification.module.css';
import {
    listPointRules, setPointRule, seedDefaultRules,
    listBadges, createBadge, updateBadge, deleteBadge,
    getLeaderboard, getGamificationStats, listGroupsForFilter,
    listGamificationUsers, awardBadge,
    type PointRuleItem, type BadgeItem, type LeaderboardEntry,
    type GamificationStats, type BadgeInput,
} from '@/app/actions/gamificationActions';
import type { BadgeCriteriaType } from '@prisma/client';

type Tab = 'rules' | 'badges' | 'leaderboard';

const TABS: { id: Tab; label: string; icon: typeof Trophy }[] = [
    { id: 'rules', label: 'Poengregler', icon: Settings2 },
    { id: 'badges', label: 'Badges', icon: Award },
    { id: 'leaderboard', label: 'Toppliste', icon: Trophy },
];

// Liten allowlist over lucide-ikoner som kan velges for en badge.
const ICON_OPTIONS = [
    { name: 'Trophy', Icon: Trophy },
    { name: 'Award', Icon: Award },
    { name: 'Star', Icon: Star },
    { name: 'Flame', Icon: Flame },
    { name: 'Medal', Icon: Medal },
] as const;

type IconName = (typeof ICON_OPTIONS)[number]['name'];

// Defensivt: kun et trygt hex-format slippes inn i color-mix() i inline styles.
// Serveren validerer allerede, men dette beskytter mot legacy-/manuelt redigerte rader.
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function safeColor(color: string | null): string | null {
    return color && HEX_COLOR_RE.test(color) ? color : null;
}

function BadgeIcon({ icon, size = 18 }: { icon: string | null; size?: number }) {
    const found = ICON_OPTIONS.find((o) => o.name === icon);
    const Icon = found?.Icon ?? Award;
    return <Icon size={size} />;
}

const CRITERIA_OPTIONS: { value: BadgeCriteriaType; label: string; hint: string }[] = [
    { value: 'MANUAL', label: 'Manuell', hint: 'Tildeles manuelt av en administrator' },
    { value: 'POINTS_TOTAL', label: 'Totale poeng', hint: 'Tildeles automatisk ved oppnådd poengsum' },
    { value: 'COURSES_COMPLETED', label: 'Fullførte kurs', hint: 'Tildeles automatisk ved antall fullførte kurs' },
    { value: 'STREAK_DAYS', label: 'Streak (dager)', hint: 'Tildeles automatisk ved sammenhengende aktive dager' },
];

const CRITERIA_LABELS: Record<BadgeCriteriaType, string> = {
    MANUAL: 'Manuell',
    POINTS_TOTAL: 'Totale poeng',
    COURSES_COMPLETED: 'Fullførte kurs',
    STREAK_DAYS: 'Streak (dager)',
};

export default function GamificationClient() {
    const [tab, setTab] = useState<Tab>('rules');
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>
                        <Trophy size={24} /> Gamification
                    </h1>
                    <p className={styles.subtitle}>
                        Beløn læring med poeng, nivåer og badges, og motiver med topplister
                    </p>
                </div>
            </div>

            <div className={styles.tabs}>
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
                        onClick={() => setTab(id)}
                    >
                        <Icon size={16} />
                        {label}
                    </button>
                ))}
            </div>

            {error && (
                <div className={styles.errorBanner}>
                    <AlertTriangle size={16} />
                    {error}
                    <button
                        className={styles.iconBtn}
                        onClick={() => setError(null)}
                        style={{ marginLeft: 'auto' }}
                        aria-label="Lukk feilmelding"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            <div className={styles.tabContent}>
                {tab === 'rules' && <RulesTab onToast={setToast} onError={setError} />}
                {tab === 'badges' && <BadgesTab onToast={setToast} onError={setError} />}
                {tab === 'leaderboard' && <LeaderboardTab onError={setError} />}
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

// ══════════════════════════════════════════════════════════════
// TAB 1: Poengregler
// ══════════════════════════════════════════════════════════════

function RulesTab({
    onToast,
    onError,
}: {
    onToast: (s: string) => void;
    onError: (s: string) => void;
}) {
    const [rules, setRules] = useState<PointRuleItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingEvent, setSavingEvent] = useState<string | null>(null);
    const [seeding, setSeeding] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await listPointRules();
        if ('rules' in res) setRules(res.rules);
        else onError(res.error);
        setLoading(false);
    }, [onError]);

    useEffect(() => {
        const t = setTimeout(() => load(), 0);
        return () => clearTimeout(t);
    }, [load]);

    async function persist(event: string, points: number, active: boolean) {
        setSavingEvent(event);
        const res = await setPointRule(event, points, active);
        setSavingEvent(null);
        if ('success' in res) onToast('Poengregel lagret');
        else onError(res.error);
    }

    function updateLocal(event: string, patch: Partial<PointRuleItem>) {
        setRules((prev) => prev.map((r) => (r.event === event ? { ...r, ...patch } : r)));
    }

    async function handleSeed() {
        setSeeding(true);
        const res = await seedDefaultRules();
        setSeeding(false);
        if ('success' in res) {
            onToast(res.created > 0 ? `${res.created} standardregler lagt til` : 'Alle regler er allerede satt opp');
            load();
        } else {
            onError(res.error);
        }
    }

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} /> Laster poengregler...
            </div>
        );
    }

    const anyConfigured = rules.some((r) => r.configured);

    return (
        <div className={styles.section}>
            <div className={styles.sectionToolbar}>
                <span className={styles.sectionCount}>Poeng tildeles per hendelse</span>
                {!anyConfigured && (
                    <button type="button" className={styles.btnSecondary} onClick={handleSeed} disabled={seeding}>
                        <Plus size={15} /> {seeding ? 'Legger til...' : 'Sett opp standardregler'}
                    </button>
                )}
            </div>

            <div className={styles.ruleList}>
                {rules.map((rule) => (
                    <div key={rule.event} className={styles.ruleRow}>
                        <div className={styles.ruleMain}>
                            <span className={styles.ruleLabel}>{rule.label}</span>
                            <span className={styles.ruleEvent}>{rule.event}</span>
                        </div>
                        <div className={styles.ruleControls}>
                            <div className={styles.pointsField}>
                                <input
                                    className={styles.pointsInput}
                                    type="number"
                                    min={0}
                                    value={rule.points}
                                    onChange={(e) =>
                                        updateLocal(rule.event, { points: Math.max(0, Number(e.target.value) || 0) })
                                    }
                                    aria-label={`Poeng for ${rule.label}`}
                                />
                                <span className={styles.pointsSuffix}>poeng</span>
                            </div>
                            <button
                                type="button"
                                className={styles.toggleBtn}
                                onClick={() => updateLocal(rule.event, { active: !rule.active })}
                                aria-label={rule.active ? 'Aktiv' : 'Inaktiv'}
                                aria-pressed={rule.active}
                            >
                                {rule.active ? (
                                    <ToggleRight size={26} className={styles.toggleOn} />
                                ) : (
                                    <ToggleLeft size={26} className={styles.toggleOff} />
                                )}
                                <span className={styles.toggleLabel}>{rule.active ? 'Aktiv' : 'Av'}</span>
                            </button>
                            <button
                                type="button"
                                className={styles.btnPrimary}
                                onClick={() => persist(rule.event, rule.points, rule.active)}
                                disabled={savingEvent === rule.event}
                            >
                                <Save size={15} /> {savingEvent === rule.event ? 'Lagrer...' : 'Lagre'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// TAB 2: Badges (CRUD + manuell tildeling)
// ══════════════════════════════════════════════════════════════

interface BadgeFormState {
    id: string | null;
    name: string;
    description: string;
    color: string;
    icon: IconName;
    criteriaType: BadgeCriteriaType;
    threshold: string;
}

const EMPTY_BADGE: BadgeFormState = {
    id: null,
    name: '',
    description: '',
    color: '',
    icon: 'Award',
    criteriaType: 'MANUAL',
    threshold: '',
};

function BadgesTab({
    onToast,
    onError,
}: {
    onToast: (s: string) => void;
    onError: (s: string) => void;
}) {
    const [badges, setBadges] = useState<BadgeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState<BadgeFormState | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<BadgeItem | null>(null);
    const [awardTarget, setAwardTarget] = useState<BadgeItem | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await listBadges();
        if ('badges' in res) setBadges(res.badges);
        else onError(res.error);
        setLoading(false);
    }, [onError]);

    useEffect(() => {
        const t = setTimeout(() => load(), 0);
        return () => clearTimeout(t);
    }, [load]);

    function openCreate() {
        setForm({ ...EMPTY_BADGE });
    }

    function openEdit(b: BadgeItem) {
        const icon = (ICON_OPTIONS.find((o) => o.name === b.icon)?.name ?? 'Award') as IconName;
        setForm({
            id: b.id,
            name: b.name,
            description: b.description ?? '',
            color: b.color ?? '',
            icon,
            criteriaType: b.criteriaType,
            threshold: b.threshold != null ? String(b.threshold) : '',
        });
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!form) return;
        setSaving(true);
        const payload: BadgeInput = {
            name: form.name,
            description: form.description || null,
            color: form.color || null,
            icon: form.icon,
            criteriaType: form.criteriaType,
            threshold: form.criteriaType === 'MANUAL' ? null : Number(form.threshold) || 0,
        };
        const res = form.id ? await updateBadge(form.id, payload) : await createBadge(payload);
        setSaving(false);
        if ('success' in res) {
            onToast(form.id ? 'Badge oppdatert' : 'Badge opprettet');
            setForm(null);
            load();
        } else {
            onError(res.error);
        }
    }

    async function handleDelete() {
        if (!deleteTarget) return;
        const res = await deleteBadge(deleteTarget.id);
        if ('success' in res) {
            onToast('Badge slettet');
            setDeleteTarget(null);
            load();
        } else {
            onError(res.error);
        }
    }

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} /> Laster badges...
            </div>
        );
    }

    return (
        <div className={styles.section}>
            <div className={styles.sectionToolbar}>
                <span className={styles.sectionCount}>{badges.length} badges</span>
                <button type="button" className={styles.btnPrimary} onClick={openCreate}>
                    <Plus size={16} /> Ny badge
                </button>
            </div>

            {badges.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyIcon}><Award size={28} /></div>
                    <span className={styles.emptyTitle}>Ingen badges ennå</span>
                    <span className={styles.emptyText}>
                        Opprett badges som brukerne kan tjene automatisk eller få tildelt manuelt.
                    </span>
                </div>
            ) : (
                <div className={styles.badgeGrid}>
                    {badges.map((b) => (
                        <div key={b.id} className={styles.badgeCard}>
                            <div
                                className={styles.badgeMedallion}
                                style={(() => {
                                    const c = safeColor(b.color);
                                    return c
                                        ? {
                                              background: `color-mix(in srgb, ${c} 18%, transparent)`,
                                              color: c,
                                              borderColor: `color-mix(in srgb, ${c} 35%, transparent)`,
                                          }
                                        : undefined;
                                })()}
                            >
                                <BadgeIcon icon={b.icon} size={22} />
                            </div>
                            <div className={styles.badgeBody}>
                                <span className={styles.badgeName}>{b.name}</span>
                                {b.description && <span className={styles.badgeDesc}>{b.description}</span>}
                                <div className={styles.badgeMeta}>
                                    <span className={styles.badgePill}>{CRITERIA_LABELS[b.criteriaType]}</span>
                                    {b.criteriaType !== 'MANUAL' && b.threshold != null && (
                                        <span className={styles.badgePill}>Terskel: {b.threshold}</span>
                                    )}
                                    <span className={styles.badgePillMuted}>
                                        <Users size={11} /> {b.awardedCount}
                                    </span>
                                </div>
                            </div>
                            <div className={styles.badgeActions}>
                                {b.criteriaType === 'MANUAL' && (
                                    <button
                                        type="button"
                                        className={styles.iconBtn}
                                        onClick={() => setAwardTarget(b)}
                                        aria-label="Tildel badge"
                                        title="Tildel manuelt"
                                    >
                                        <Medal size={15} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className={styles.iconBtn}
                                    onClick={() => openEdit(b)}
                                    aria-label="Rediger badge"
                                >
                                    <Edit3 size={15} />
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                    onClick={() => setDeleteTarget(b)}
                                    aria-label="Slett badge"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create / edit modal */}
            {form && (
                <div className={styles.modalOverlay} onClick={() => setForm(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>{form.id ? 'Rediger badge' : 'Ny badge'}</h2>
                            <button className={styles.iconBtn} onClick={() => setForm(null)} aria-label="Lukk">
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Navn *</label>
                                    <input
                                        className={styles.formInput}
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        placeholder="F.eks. Kursmester"
                                        autoFocus
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Beskrivelse</label>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={form.description}
                                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                                        placeholder="Valgfri beskrivelse"
                                        rows={2}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Ikon</label>
                                    <div className={styles.iconPicker}>
                                        {ICON_OPTIONS.map(({ name, Icon }) => (
                                            <button
                                                key={name}
                                                type="button"
                                                className={`${styles.iconChoice} ${form.icon === name ? styles.iconChoiceActive : ''}`}
                                                onClick={() => setForm({ ...form, icon: name })}
                                                aria-label={name}
                                                aria-pressed={form.icon === name}
                                            >
                                                <Icon size={18} />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Farge</label>
                                        <div className={styles.colorField}>
                                            <input
                                                className={styles.colorSwatch}
                                                type="color"
                                                value={form.color || '#f59e0b'}
                                                onChange={(e) => setForm({ ...form, color: e.target.value })}
                                                aria-label="Velg farge"
                                            />
                                            <input
                                                className={styles.formInput}
                                                type="text"
                                                value={form.color}
                                                onChange={(e) => setForm({ ...form, color: e.target.value })}
                                                placeholder="#f59e0b"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Tildelingskriterium</label>
                                    <select
                                        className={styles.formSelect}
                                        value={form.criteriaType}
                                        onChange={(e) =>
                                            setForm({ ...form, criteriaType: e.target.value as BadgeCriteriaType })
                                        }
                                    >
                                        {CRITERIA_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                    <span className={styles.formHint}>
                                        {CRITERIA_OPTIONS.find((o) => o.value === form.criteriaType)?.hint}
                                    </span>
                                </div>

                                {form.criteriaType !== 'MANUAL' && (
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Terskel *</label>
                                        <input
                                            className={styles.formInput}
                                            type="number"
                                            min={1}
                                            value={form.threshold}
                                            onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                                            placeholder="F.eks. 500"
                                            required
                                        />
                                    </div>
                                )}
                            </div>
                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.btnSecondary} onClick={() => setForm(null)}>
                                    Avbryt
                                </button>
                                <button type="submit" className={styles.btnPrimary} disabled={saving}>
                                    <Save size={16} /> {saving ? 'Lagrer...' : 'Lagre'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete confirm */}
            {deleteTarget && (
                <div className={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Slett badge</h2>
                            <button className={styles.iconBtn} onClick={() => setDeleteTarget(null)} aria-label="Lukk">
                                <X size={16} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <p className={styles.confirmText}>
                                Er du sikker på at du vil slette{' '}
                                <span className={styles.confirmHighlight}>{deleteTarget.name}</span>? Alle
                                tildelinger av denne badgen fjernes.
                            </p>
                        </div>
                        <div className={styles.modalFooter}>
                            <button type="button" className={styles.btnSecondary} onClick={() => setDeleteTarget(null)}>
                                Avbryt
                            </button>
                            <button type="button" className={styles.btnDanger} onClick={handleDelete}>
                                Slett badge
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manual award modal */}
            {awardTarget && (
                <AwardBadgeModal
                    badge={awardTarget}
                    onClose={() => setAwardTarget(null)}
                    onToast={(s) => {
                        onToast(s);
                        load();
                    }}
                    onError={onError}
                />
            )}
        </div>
    );
}

function AwardBadgeModal({
    badge,
    onClose,
    onToast,
    onError,
}: {
    badge: BadgeItem;
    onClose: () => void;
    onToast: (s: string) => void;
    onError: (s: string) => void;
}) {
    const [search, setSearch] = useState('');
    const [users, setUsers] = useState<{ id: string; name: string; email: string | null }[]>([]);
    const [loading, setLoading] = useState(true);
    const [awarding, setAwarding] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const t = setTimeout(async () => {
            setLoading(true);
            const res = await listGamificationUsers(search || undefined);
            if (cancelled) return;
            if ('users' in res) setUsers(res.users);
            else onError(res.error);
            setLoading(false);
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [search, onError]);

    async function handleAward(userId: string) {
        setAwarding(userId);
        const res = await awardBadge(userId, badge.id);
        setAwarding(null);
        if ('success' in res) onToast('Badge tildelt');
        else onError(res.error);
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2 className={styles.modalTitle}>Tildel &laquo;{badge.name}&raquo;</h2>
                    <button className={styles.iconBtn} onClick={onClose} aria-label="Lukk">
                        <X size={16} />
                    </button>
                </div>
                <div className={styles.modalBody}>
                    <div className={styles.searchBox}>
                        <Search size={15} className={styles.searchIcon} />
                        <input
                            className={styles.searchInput}
                            type="text"
                            placeholder="Søk etter bruker..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className={styles.userList}>
                        {loading ? (
                            <div className={styles.loadingSmall}>
                                <div className={styles.spinner} />
                            </div>
                        ) : users.length === 0 ? (
                            <span className={styles.emptyTextSmall}>Ingen brukere</span>
                        ) : (
                            users.map((u) => (
                                <div key={u.id} className={styles.awardRow}>
                                    <div className={styles.awardUser}>
                                        <span className={styles.userItemName}>{u.name}</span>
                                        {u.email && <span className={styles.userItemEmail}>{u.email}</span>}
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.btnGhost}
                                        onClick={() => handleAward(u.id)}
                                        disabled={awarding === u.id}
                                    >
                                        <Medal size={14} /> {awarding === u.id ? 'Tildeler...' : 'Tildel'}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// TAB 3: Toppliste (admin view + group filter + stats)
// ══════════════════════════════════════════════════════════════

function LeaderboardTab({ onError }: { onError: (s: string) => void }) {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [stats, setStats] = useState<GamificationStats | null>(null);
    const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
    const [groupId, setGroupId] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const [statsRes, groupsRes] = await Promise.all([getGamificationStats(), listGroupsForFilter()]);
            if ('stats' in statsRes) setStats(statsRes.stats);
            else onError(statsRes.error);
            if ('groups' in groupsRes) setGroups(groupsRes.groups);
        })();
    }, [onError]);

    const load = useCallback(
        async (gid: string) => {
            setLoading(true);
            const res = await getLeaderboard(gid ? { groupId: gid } : undefined);
            if ('entries' in res) setEntries(res.entries);
            else onError(res.error);
            setLoading(false);
        },
        [onError]
    );

    useEffect(() => {
        const t = setTimeout(() => load(groupId), 0);
        return () => clearTimeout(t);
    }, [groupId, load]);

    return (
        <div className={styles.section}>
            {stats && (
                <div className={styles.statGrid}>
                    <div className={styles.statCard}>
                        <span className={styles.statValue}>{stats.participants}</span>
                        <span className={styles.statLabel}>Deltakere</span>
                    </div>
                    <div className={styles.statCard}>
                        <span className={styles.statValue}>{stats.totalPointsAwarded.toLocaleString('nb-NO')}</span>
                        <span className={styles.statLabel}>Poeng tildelt</span>
                    </div>
                    <div className={styles.statCard}>
                        <span className={styles.statValue}>{stats.badgesAwarded}</span>
                        <span className={styles.statLabel}>Badges tildelt</span>
                    </div>
                    <div className={styles.statCard}>
                        <span className={styles.statValue}>{stats.topLevel}</span>
                        <span className={styles.statLabel}>Høyeste nivå</span>
                    </div>
                    <div className={styles.statCard}>
                        <span className={styles.statValue}>{stats.longestStreak}</span>
                        <span className={styles.statLabel}>Lengste streak</span>
                    </div>
                </div>
            )}

            <div className={styles.sectionToolbar}>
                <div className={styles.formGroup} style={{ maxWidth: 280, marginBottom: 0 }}>
                    <select
                        className={styles.formSelect}
                        value={groupId}
                        onChange={(e) => setGroupId(e.target.value)}
                        aria-label="Filtrer på gruppe"
                    >
                        <option value="">Alle brukere</option>
                        {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                                {g.name}
                            </option>
                        ))}
                    </select>
                </div>
                <span className={styles.sectionCount}>{entries.length} på topplista</span>
            </div>

            {loading ? (
                <div className={styles.loading}>
                    <div className={styles.spinner} /> Laster toppliste...
                </div>
            ) : entries.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyIcon}><Trophy size={28} /></div>
                    <span className={styles.emptyTitle}>Ingen på topplista ennå</span>
                    <span className={styles.emptyText}>
                        Brukere vises her når de har tjent poeng og deltar i topplista.
                    </span>
                </div>
            ) : (
                <div className={styles.lbList}>
                    {entries.map((e) => (
                        <div key={e.userId} className={styles.lbRow}>
                            <span className={`${styles.lbRank} ${e.rank <= 3 ? styles.lbRankTop : ''}`}>
                                {e.rank}
                            </span>
                            <div className={styles.lbAvatar}>
                                {e.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={e.avatarUrl} alt="" className={styles.lbAvatarImg} />
                                ) : (
                                    e.name.substring(0, 2).toUpperCase()
                                )}
                            </div>
                            <div className={styles.lbMain}>
                                <span className={styles.lbName}>{e.name}</span>
                                <span className={styles.lbSub}>
                                    Nivå {e.level} &middot; {e.badgeCount} badges
                                </span>
                            </div>
                            <span className={styles.lbPoints}>{e.totalPoints.toLocaleString('nb-NO')} p</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
