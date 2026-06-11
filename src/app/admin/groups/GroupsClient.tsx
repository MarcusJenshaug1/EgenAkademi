'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Plus, Search, X, Pencil, Trash2, Users, UserPlus,
    FolderOpen, CheckCircle, UserMinus, Palette,
    Zap, RefreshCw, Sparkles, Info,
} from 'lucide-react';
import {
    listGroups, getGroup, createGroup, updateGroup,
    deleteGroup, addGroupMember, removeGroupMember,
    listAvailableMembers, getGroupStats,
    setGroupDynamic, syncDynamicGroup,
    type GroupListItem, type GroupDetail,
    type GroupRule, type RuleCondition, type RuleAttribute, type RuleOperator,
} from '@/app/actions/groupActions';
import { suggestGroupColors, contrastRatio, meetsWcagAA, isValidHex, type ColorSuggestion } from '@/lib/groupColors';
import styles from './groups.module.css';

function getInitials(user: { firstName?: string | null; lastName?: string | null; name?: string | null; email?: string | null }): string {
    if (user.firstName && user.lastName) return (user.firstName[0] + user.lastName[0]).toUpperCase();
    if (user.name) return user.name.substring(0, 2).toUpperCase();
    if (user.email) return user.email.substring(0, 2).toUpperCase();
    return '??';
}

/** Read a CSS custom property value from the document root */
function getCssVar(name: string): string {
    if (typeof window === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Get the effective background color for WCAG checks (bg-surface is often semi-transparent, so fall back to bg-secondary then bg-primary) */
function getBrandingBg(): string {
    // bg-secondary is the card/panel background where group badges typically appear
    const bgSecondary = getCssVar('--color-bg-secondary');
    if (bgSecondary && isValidHex(bgSecondary)) return bgSecondary;
    const bgPrimary = getCssVar('--color-bg-primary');
    if (bgPrimary && isValidHex(bgPrimary)) return bgPrimary;
    return '#0f0f11'; // safe default
}

// ── Rule builder metadata ───────────────────────────────────

const ATTRIBUTE_LABELS: Record<RuleAttribute, string> = {
    department: 'Avdeling',
    jobTitle: 'Stillingstittel',
    location: 'Arbeidssted',
    globalRole: 'Rolle',
    active: 'Aktiv',
    email: 'E-post',
    firstName: 'Fornavn',
    lastName: 'Etternavn',
};

const ATTRIBUTE_ORDER: RuleAttribute[] = [
    'department', 'jobTitle', 'location', 'globalRole',
    'active', 'email', 'firstName', 'lastName',
];

const OPERATOR_LABELS: Record<RuleOperator, string> = {
    equals: 'er lik',
    not_equals: 'er ikke lik',
    contains: 'inneholder',
    starts_with: 'starter med',
    is_empty: 'er tom',
    is_not_empty: 'er ikke tom',
};

const OPERATOR_ORDER: RuleOperator[] = [
    'equals', 'not_equals', 'contains', 'starts_with', 'is_empty', 'is_not_empty',
];

const ROLE_OPTIONS: { value: string; label: string }[] = [
    { value: 'USER', label: 'Bruker' },
    { value: 'TENANT_ADMIN', label: 'Organisasjonsadmin' },
    { value: 'SYSTEM_ADMIN', label: 'Systemadmin' },
];

/** Operators that take no value input */
function operatorNeedsValue(op: RuleOperator): boolean {
    return op !== 'is_empty' && op !== 'is_not_empty';
}

function emptyCondition(): RuleCondition {
    return { attribute: 'department', operator: 'equals', value: '' };
}

function emptyRule(): GroupRule {
    return { match: 'all', conditions: [emptyCondition()] };
}

// ── Rule builder component ───────────────────────────────────

interface RuleBuilderProps {
    rule: GroupRule;
    onChange: (rule: GroupRule) => void;
    styles: Record<string, string>;
}

function RuleBuilder({ rule, onChange, styles }: RuleBuilderProps) {
    function updateMatch(match: 'all' | 'any') {
        onChange({ ...rule, match });
    }

    function updateCondition(index: number, patch: Partial<RuleCondition>) {
        const conditions = rule.conditions.map((c, i) => {
            if (i !== index) return c;
            const next = { ...c, ...patch };
            // When switching attribute to active/globalRole, set a valid default
            // value for the resulting select; otherwise clear the value.
            if (patch.attribute === 'active') next.value = 'true';
            else if (patch.attribute === 'globalRole') next.value = 'USER';
            else if (patch.attribute && patch.attribute !== c.attribute) next.value = '';
            return next;
        });
        onChange({ ...rule, conditions });
    }

    function addCondition() {
        onChange({ ...rule, conditions: [...rule.conditions, emptyCondition()] });
    }

    function removeCondition(index: number) {
        onChange({ ...rule, conditions: rule.conditions.filter((_, i) => i !== index) });
    }

    return (
        <div className={styles.ruleBuilder}>
            <div className={styles.ruleMatchRow}>
                <span>Inkluder brukere som matcher</span>
                <select
                    className={styles.ruleMatchSelect}
                    value={rule.match}
                    onChange={(e) => updateMatch(e.target.value as 'all' | 'any')}
                    aria-label="Match-modus"
                >
                    <option value="all">Alle betingelser</option>
                    <option value="any">Enhver betingelse</option>
                </select>
            </div>

            <div className={styles.ruleConditions}>
                {rule.conditions.length === 0 && (
                    <p className={styles.ruleEmpty}>Ingen betingelser ennå. Legg til minst én.</p>
                )}
                {rule.conditions.map((cond, i) => {
                    const needsValue = operatorNeedsValue(cond.operator);
                    return (
                        <div key={i} className={styles.ruleRow}>
                            <select
                                className={styles.ruleSelect}
                                value={cond.attribute}
                                onChange={(e) => updateCondition(i, { attribute: e.target.value as RuleAttribute })}
                                aria-label="Attributt"
                            >
                                {ATTRIBUTE_ORDER.map((attr) => (
                                    <option key={attr} value={attr}>{ATTRIBUTE_LABELS[attr]}</option>
                                ))}
                            </select>

                            <select
                                className={styles.ruleSelect}
                                value={cond.operator}
                                onChange={(e) => updateCondition(i, { operator: e.target.value as RuleOperator })}
                                aria-label="Operator"
                            >
                                {OPERATOR_ORDER.map((op) => (
                                    <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                                ))}
                            </select>

                            {!needsValue ? (
                                <input
                                    className={`${styles.ruleValueInput} ${styles.ruleValueDisabled}`}
                                    value=""
                                    disabled
                                    placeholder="—"
                                    aria-label="Verdi (ikke nødvendig)"
                                />
                            ) : cond.attribute === 'active' ? (
                                <select
                                    className={styles.ruleSelect}
                                    value={cond.value || 'true'}
                                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                                    aria-label="Verdi"
                                >
                                    <option value="true">Ja (aktiv)</option>
                                    <option value="false">Nei (inaktiv)</option>
                                </select>
                            ) : cond.attribute === 'globalRole' ? (
                                <select
                                    className={styles.ruleSelect}
                                    value={cond.value || 'USER'}
                                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                                    aria-label="Verdi"
                                >
                                    {ROLE_OPTIONS.map((r) => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    className={styles.ruleValueInput}
                                    value={cond.value}
                                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                                    placeholder="Verdi..."
                                    aria-label="Verdi"
                                />
                            )}

                            <button
                                type="button"
                                className={styles.ruleRemove}
                                onClick={() => removeCondition(i)}
                                title="Fjern betingelse"
                                aria-label="Fjern betingelse"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>

            <button type="button" className={styles.addConditionBtn} onClick={addCondition}>
                <Plus size={14} /> Legg til betingelse
            </button>
        </div>
    );
}

interface GroupsClientProps {
    initialGroups: GroupListItem[];
    initialStats: { totalGroups: number; totalMemberships: number; emptyGroups: number };
}

export default function GroupsClient({ initialGroups, initialStats }: GroupsClientProps) {
    const [groups, setGroups] = useState<GroupListItem[]>(initialGroups);
    const [stats, setStats] = useState(initialStats);
    const [search, setSearch] = useState('');
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Modal state
    const [showCreate, setShowCreate] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [showDetail, setShowDetail] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<GroupListItem | null>(null);
    const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null);
    const [loading, setLoading] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [formColor, setFormColor] = useState<string | null>(null);
    const [customHex, setCustomHex] = useState('');

    // Dynamic group form state
    const [formIsDynamic, setFormIsDynamic] = useState(false);
    const [formRule, setFormRule] = useState<GroupRule>(emptyRule());

    // Per-card sync state
    const [syncingId, setSyncingId] = useState<string | null>(null);

    // Color suggestions (computed from existing groups + actual branding)
    function getColorSuggestions(): ColorSuggestion[] {
        const usedColors = groups
            .filter((g) => g.color && g.id !== selectedGroup?.id)
            .map((g) => g.color!);
        const brandAccent = getCssVar('--color-accent-blue') || undefined;
        const bg = getBrandingBg();
        return suggestGroupColors(usedColors, brandAccent, bg);
    }

    /** Check WCAG AA for a custom hex against branding background */
    function getCustomColorInfo(hex: string): { ratio: number; aa: boolean } | null {
        const normalized = hex.startsWith('#') ? hex : `#${hex}`;
        if (!isValidHex(normalized)) return null;
        const bg = getBrandingBg();
        const ratio = contrastRatio(normalized, bg);
        return { ratio: Math.round(ratio * 100) / 100, aa: ratio >= 4.5 };
    }

    // Add member state
    const [memberSearch, setMemberSearch] = useState('');
    const [availableMembers, setAvailableMembers] = useState<{ id: string; name: string | null; email: string | null; firstName: string | null; lastName: string | null; avatarUrl: string | null }[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);

    function showToast(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    }

    const refreshData = useCallback(async () => {
        const [groupsResult, statsResult] = await Promise.all([
            listGroups(search || undefined),
            getGroupStats(),
        ]);
        if ('groups' in groupsResult) setGroups(groupsResult.groups);
        if ('totalGroups' in statsResult) setStats(statsResult);
    }, [search]);

    // Search debounce
    useEffect(() => {
        const t = setTimeout(async () => {
            const result = await listGroups(search || undefined);
            if ('groups' in result) setGroups(result.groups);
        }, 300);
        return () => clearTimeout(t);
    }, [search]);

    function resetForm() {
        setFormName('');
        setFormDesc('');
        setFormColor(null);
        setCustomHex('');
        setFormIsDynamic(false);
        setFormRule(emptyRule());
    }

    // ── Create ──────────────────────────────────────────
    async function handleCreate() {
        setError(null);
        setLoading(true);
        const result = await createGroup({
            name: formName,
            description: formDesc || undefined,
            color: formColor || undefined,
        });
        if ('error' in result) { setLoading(false); setError(result.error); return; }

        // If marked dynamic, persist the rule + sync immediately.
        if (formIsDynamic) {
            const dynResult = await setGroupDynamic(result.groupId, true, formRule);
            if ('error' in dynResult) { setLoading(false); setError(dynResult.error); return; }
        }

        setLoading(false);
        setShowCreate(false);
        resetForm();
        showToast(formIsDynamic ? 'Dynamisk gruppe opprettet' : 'Gruppe opprettet');
        refreshData();
    }

    // ── Edit ────────────────────────────────────────────
    async function openEdit(group: GroupListItem) {
        setSelectedGroup(group);
        setFormName(group.name);
        setFormDesc(group.description || '');
        setFormColor(group.color || null);
        setCustomHex('');
        setFormIsDynamic(group.isDynamic);
        setFormRule(emptyRule());
        setError(null);
        setShowEdit(true);
        // Load the persisted rule (only present in the full group detail).
        if (group.isDynamic) {
            const result = await getGroup(group.id);
            if ('group' in result && result.group.ruleJson && result.group.ruleJson.conditions.length > 0) {
                setFormRule(result.group.ruleJson);
            }
        }
    }

    async function handleEdit() {
        if (!selectedGroup) return;
        setError(null);
        setLoading(true);
        const result = await updateGroup(selectedGroup.id, {
            name: formName,
            description: formDesc,
            color: formColor,
        });
        if ('error' in result) { setLoading(false); setError(result.error); return; }

        // Persist dynamic mode + rule (also handles toggling off: clears rule
        // and removes rule-based memberships server-side).
        const dynResult = await setGroupDynamic(
            selectedGroup.id,
            formIsDynamic,
            formIsDynamic ? formRule : null
        );
        if ('error' in dynResult) { setLoading(false); setError(dynResult.error); return; }

        setLoading(false);
        setShowEdit(false);
        showToast('Gruppe oppdatert');
        refreshData();
    }

    // ── Sync dynamic group ──────────────────────────────
    async function handleSync(group: GroupListItem) {
        setSyncingId(group.id);
        const result = await syncDynamicGroup(group.id);
        setSyncingId(null);
        if ('error' in result) { setError(result.error); return; }
        const { added, removed } = result;
        showToast(`Synkronisert: ${added} lagt til, ${removed} fjernet`);
        refreshData();
        // Refresh open detail view if it's this group.
        if (showDetail && selectedGroup?.id === group.id) refreshDetail();
    }

    // ── Delete ──────────────────────────────────────────
    function openDelete(group: GroupListItem) {
        setSelectedGroup(group);
        setShowDelete(true);
    }

    async function handleDelete() {
        if (!selectedGroup) return;
        setLoading(true);
        const result = await deleteGroup(selectedGroup.id);
        setLoading(false);
        if ('error' in result) { setError(result.error); return; }
        setShowDelete(false);
        showToast('Gruppe slettet');
        refreshData();
    }

    // ── Detail (members) ────────────────────────────────
    async function openDetail(group: GroupListItem) {
        setSelectedGroup(group);
        setShowDetail(true);
        setMemberSearch('');
        setAvailableMembers([]);
        setLoading(true);
        const result = await getGroup(group.id);
        setLoading(false);
        if ('group' in result) setGroupDetail(result.group);
    }

    async function refreshDetail() {
        if (!selectedGroup) return;
        const result = await getGroup(selectedGroup.id);
        if ('group' in result) setGroupDetail(result.group);
    }

    // Add member search
    useEffect(() => {
        if (!showDetail || !selectedGroup) return;
        if (!memberSearch.trim()) { setAvailableMembers([]); return; }
        const t = setTimeout(async () => {
            setLoadingMembers(true);
            const result = await listAvailableMembers(selectedGroup.id, memberSearch);
            setLoadingMembers(false);
            if ('users' in result) setAvailableMembers(result.users);
        }, 300);
        return () => clearTimeout(t);
    }, [memberSearch, showDetail, selectedGroup]);

    async function handleAddMember(userId: string) {
        if (!selectedGroup) return;
        const result = await addGroupMember(selectedGroup.id, userId);
        if ('error' in result) { setError(result.error); return; }
        showToast('Medlem lagt til');
        setMemberSearch('');
        setAvailableMembers([]);
        refreshDetail();
        refreshData();
    }

    async function handleRemoveMember(userId: string) {
        if (!selectedGroup) return;
        const result = await removeGroupMember(selectedGroup.id, userId);
        if ('error' in result) { setError(result.error); return; }
        showToast('Medlem fjernet');
        refreshDetail();
        refreshData();
    }

    return (
        <div className={styles.groupsPage}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Grupper</h1>
                    <p className={styles.subtitle}>Organiser brukere i grupper for enklere administrasjon av kurs og tilganger.</p>
                </div>
                <button className={styles.createButton} onClick={() => { resetForm(); setError(null); setShowCreate(true); }}>
                    <Plus size={16} /> Ny gruppe
                </button>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Totalt grupper</span>
                    <span className={styles.statValue}>{stats.totalGroups}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Totalt medlemskap</span>
                    <span className={styles.statValue}>{stats.totalMemberships}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Tomme grupper</span>
                    <span className={styles.statValue}>{stats.emptyGroups}</span>
                </div>
            </div>

            {/* Toolbar */}
            <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Søk etter grupper..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Grid */}
            {groups.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}><FolderOpen size={28} /></div>
                    <p className={styles.emptyTitle}>Ingen grupper ennå</p>
                    <p className={styles.emptyText}>
                        Opprett din første gruppe for å organisere brukere og forenkle kursadministrasjon.
                    </p>
                    <button className={styles.createButton} onClick={() => { resetForm(); setError(null); setShowCreate(true); }}>
                        <Plus size={16} /> Opprett gruppe
                    </button>
                </div>
            ) : (
                <div className={styles.groupGrid}>
                    {groups.map((g) => (
                        <div key={g.id} className={styles.groupCard} onClick={() => openDetail(g)}
                            style={g.color ? { borderTopColor: g.color, borderTopWidth: '3px' } : undefined}
                        >
                            <div className={styles.cardHeader}>
                                <div className={styles.cardTitleRow}>
                                    {g.color && (
                                        <span
                                            className={styles.colorDot}
                                            style={{ background: g.color }}
                                        />
                                    )}
                                    <span className={styles.cardTitle}>{g.name}</span>
                                    {g.isDynamic && (
                                        <span className={styles.dynamicBadge} title="Medlemskap styres av regler">
                                            <Zap size={11} /> Dynamisk
                                        </span>
                                    )}
                                </div>
                                <div className={styles.cardActions}>
                                    <button
                                        className={styles.actionBtn}
                                        title="Rediger"
                                        onClick={(e) => { e.stopPropagation(); openEdit(g); }}
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button
                                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                        title="Slett"
                                        onClick={(e) => { e.stopPropagation(); openDelete(g); }}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            {g.description && <p className={styles.cardDesc}>{g.description}</p>}
                            <div className={styles.cardMeta}>
                                <span className={styles.metaItem}>
                                    <Users size={14} /> {g.memberCount} {g.memberCount === 1 ? 'medlem' : 'medlemmer'}
                                </span>
                                {g.isDynamic && (
                                    <>
                                        <span className={styles.cardMetaSpacer} />
                                        <button
                                            className={styles.syncBtn}
                                            title="Synkroniser medlemskap mot reglene"
                                            disabled={syncingId === g.id}
                                            onClick={(e) => { e.stopPropagation(); handleSync(g); }}
                                        >
                                            <RefreshCw size={13} className={syncingId === g.id ? styles.syncSpin : undefined} />
                                            {syncingId === g.id ? 'Synkroniserer…' : 'Synkroniser nå'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Create modal ──────────────────────────── */}
            {showCreate && (
                <div className={styles.modalOverlay} onClick={() => setShowCreate(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Opprett gruppe</h2>
                            <button className={styles.modalClose} onClick={() => setShowCreate(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            {error && <div className={styles.errorBanner}>{error}</div>}
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Gruppenavn</label>
                                <input
                                    className={styles.formInput}
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="F.eks. Salgsteam, Nyansatte 2025"
                                    autoFocus
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Beskrivelse (valgfritt)</label>
                                <textarea
                                    className={styles.formTextarea}
                                    value={formDesc}
                                    onChange={(e) => setFormDesc(e.target.value)}
                                    placeholder="Kort beskrivelse av gruppens formål..."
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>
                                    <Palette size={12} /> Gruppefarge
                                </label>
                                <div className={styles.colorPicker}>
                                    <button
                                        type="button"
                                        className={`${styles.colorSwatch} ${!formColor ? styles.colorSwatchActive : ''}`}
                                        onClick={() => { setFormColor(null); setCustomHex(''); }}
                                        title="Ingen farge"
                                    >
                                        <X size={10} />
                                    </button>
                                    {getColorSuggestions().slice(0, 12).map((c) => (
                                        <button
                                            key={c.hex}
                                            type="button"
                                            className={`${styles.colorSwatch} ${formColor === c.hex ? styles.colorSwatchActive : ''}`}
                                            style={{ background: c.hex }}
                                            onClick={() => { setFormColor(c.hex); setCustomHex(''); }}
                                            title={`${c.name} — kontrast ${c.contrastOnDark}:1${c.meetsAA ? ' ✓ WCAG AA' : ''}`}
                                        >
                                            {c.meetsAA && <span className={styles.wcagDot} />}
                                        </button>
                                    ))}
                                </div>
                                <div className={styles.customColorRow}>
                                    <span className={styles.customColorHash}>#</span>
                                    <input
                                        className={styles.customColorInput}
                                        value={customHex}
                                        onChange={(e) => {
                                            const v = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                                            setCustomHex(v);
                                            if (v.length === 6) setFormColor(`#${v}`);
                                        }}
                                        placeholder="3b82f6"
                                        maxLength={6}
                                    />
                                    {customHex.length === 6 && (() => {
                                        const info = getCustomColorInfo(customHex);
                                        if (!info) return null;
                                        return (
                                            <span className={`${styles.wcagBadge} ${info.aa ? styles.wcagPass : styles.wcagFail}`}>
                                                {info.aa ? '✓ AA' : '✗ AA'} ({info.ratio}:1)
                                            </span>
                                        );
                                    })()}
                                </div>
                                {formColor && (
                                    <span className={styles.colorPreview}>
                                        <span className={styles.colorDot} style={{ background: formColor }} />
                                        {formColor}
                                        {(() => {
                                            const info = getCustomColorInfo(formColor);
                                            if (!info) return null;
                                            return (
                                                <span className={`${styles.wcagBadge} ${info.aa ? styles.wcagPass : styles.wcagFail}`}>
                                                    {info.aa ? '✓ WCAG AA' : '✗ WCAG AA'} ({info.ratio}:1)
                                                </span>
                                            );
                                        })()}
                                    </span>
                                )}
                            </div>

                            {/* Dynamic group toggle + rule builder */}
                            <div className={styles.toggleRow}>
                                <div className={styles.toggleInfo}>
                                    <span className={styles.toggleTitle}>
                                        <Zap size={14} /> Dynamisk gruppe
                                    </span>
                                    <span className={styles.toggleHint}>
                                        Medlemskap utledes automatisk fra regler mot brukerattributter.
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={formIsDynamic}
                                    aria-label="Dynamisk gruppe"
                                    className={`${styles.switch} ${formIsDynamic ? styles.switchOn : ''}`}
                                    onClick={() => setFormIsDynamic((v) => !v)}
                                >
                                    <span className={styles.switchKnob} />
                                </button>
                            </div>
                            {formIsDynamic && (
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>
                                        <Sparkles size={12} /> Regler
                                    </label>
                                    <RuleBuilder rule={formRule} onChange={setFormRule} styles={styles} />
                                </div>
                            )}
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.btnSecondary} onClick={() => setShowCreate(false)}>Avbryt</button>
                            <button className={styles.btnPrimary} onClick={handleCreate} disabled={loading || !formName.trim()}>
                                {loading ? 'Oppretter...' : 'Opprett'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit modal ────────────────────────────── */}
            {showEdit && selectedGroup && (
                <div className={styles.modalOverlay} onClick={() => setShowEdit(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Rediger gruppe</h2>
                            <button className={styles.modalClose} onClick={() => setShowEdit(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            {error && <div className={styles.errorBanner}>{error}</div>}
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Gruppenavn</label>
                                <input
                                    className={styles.formInput}
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Beskrivelse</label>
                                <textarea
                                    className={styles.formTextarea}
                                    value={formDesc}
                                    onChange={(e) => setFormDesc(e.target.value)}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>
                                    <Palette size={12} /> Gruppefarge
                                </label>
                                <div className={styles.colorPicker}>
                                    <button
                                        type="button"
                                        className={`${styles.colorSwatch} ${!formColor ? styles.colorSwatchActive : ''}`}
                                        onClick={() => { setFormColor(null); setCustomHex(''); }}
                                        title="Ingen farge"
                                    >
                                        <X size={10} />
                                    </button>
                                    {getColorSuggestions().slice(0, 12).map((c) => (
                                        <button
                                            key={c.hex}
                                            type="button"
                                            className={`${styles.colorSwatch} ${formColor === c.hex ? styles.colorSwatchActive : ''}`}
                                            style={{ background: c.hex }}
                                            onClick={() => { setFormColor(c.hex); setCustomHex(''); }}
                                            title={`${c.name} — kontrast ${c.contrastOnDark}:1${c.meetsAA ? ' ✓ WCAG AA' : ''}`}
                                        >
                                            {c.meetsAA && <span className={styles.wcagDot} />}
                                        </button>
                                    ))}
                                </div>
                                <div className={styles.customColorRow}>
                                    <span className={styles.customColorHash}>#</span>
                                    <input
                                        className={styles.customColorInput}
                                        value={customHex}
                                        onChange={(e) => {
                                            const v = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                                            setCustomHex(v);
                                            if (v.length === 6) setFormColor(`#${v}`);
                                        }}
                                        placeholder="3b82f6"
                                        maxLength={6}
                                    />
                                    {customHex.length === 6 && (() => {
                                        const info = getCustomColorInfo(customHex);
                                        if (!info) return null;
                                        return (
                                            <span className={`${styles.wcagBadge} ${info.aa ? styles.wcagPass : styles.wcagFail}`}>
                                                {info.aa ? '✓ AA' : '✗ AA'} ({info.ratio}:1)
                                            </span>
                                        );
                                    })()}
                                </div>
                                {formColor && (
                                    <span className={styles.colorPreview}>
                                        <span className={styles.colorDot} style={{ background: formColor }} />
                                        {formColor}
                                        {(() => {
                                            const info = getCustomColorInfo(formColor);
                                            if (!info) return null;
                                            return (
                                                <span className={`${styles.wcagBadge} ${info.aa ? styles.wcagPass : styles.wcagFail}`}>
                                                    {info.aa ? '✓ WCAG AA' : '✗ WCAG AA'} ({info.ratio}:1)
                                                </span>
                                            );
                                        })()}
                                    </span>
                                )}
                            </div>

                            {/* Dynamic group toggle + rule builder */}
                            <div className={styles.toggleRow}>
                                <div className={styles.toggleInfo}>
                                    <span className={styles.toggleTitle}>
                                        <Zap size={14} /> Dynamisk gruppe
                                    </span>
                                    <span className={styles.toggleHint}>
                                        Medlemskap utledes automatisk fra regler mot brukerattributter.
                                        Manuelle medlemmer beholdes.
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={formIsDynamic}
                                    aria-label="Dynamisk gruppe"
                                    className={`${styles.switch} ${formIsDynamic ? styles.switchOn : ''}`}
                                    onClick={() => setFormIsDynamic((v) => !v)}
                                >
                                    <span className={styles.switchKnob} />
                                </button>
                            </div>
                            {formIsDynamic && (
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>
                                        <Sparkles size={12} /> Regler
                                    </label>
                                    <RuleBuilder rule={formRule} onChange={setFormRule} styles={styles} />
                                </div>
                            )}
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.btnSecondary} onClick={() => setShowEdit(false)}>Avbryt</button>
                            <button className={styles.btnPrimary} onClick={handleEdit} disabled={loading || !formName.trim()}>
                                {loading ? 'Lagrer...' : 'Lagre'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete modal ──────────────────────────── */}
            {showDelete && selectedGroup && (
                <div className={styles.modalOverlay} onClick={() => setShowDelete(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Slett gruppe</h2>
                            <button className={styles.modalClose} onClick={() => setShowDelete(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <p className={styles.confirmText}>
                                Er du sikker på at du vil slette gruppen <span className={styles.confirmHighlight}>{selectedGroup.name}</span>?
                                Alle medlemskap vil fjernes. Denne handlingen kan ikke angres.
                            </p>
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.btnSecondary} onClick={() => setShowDelete(false)}>Avbryt</button>
                            <button className={styles.btnDanger} onClick={handleDelete} disabled={loading}>
                                {loading ? 'Sletter...' : 'Slett gruppe'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Detail modal (members) ────────────────── */}
            {showDetail && selectedGroup && (
                <div className={styles.modalOverlay} onClick={() => setShowDetail(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>{selectedGroup.name}</h2>
                            <button className={styles.modalClose} onClick={() => setShowDetail(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            {loading ? (
                                <div className={styles.loading}>
                                    <div className={styles.spinner} />
                                    Laster medlemmer...
                                </div>
                            ) : groupDetail ? (
                                <>
                                    {groupDetail.description && (
                                        <p className={styles.cardDesc}>{groupDetail.description}</p>
                                    )}

                                    {groupDetail.isDynamic && (
                                        <div className={styles.ruleNote}>
                                            <Info size={15} />
                                            <span>
                                                Dette er en dynamisk gruppe. Medlemskap styres av regler og
                                                oppdateres automatisk. Bruk <strong>Synkroniser nå</strong> for
                                                å kjøre reglene på nytt.
                                            </span>
                                        </div>
                                    )}

                                    <div className={styles.formLabel}>
                                        Medlemmer ({groupDetail.members.length})
                                    </div>

                                    {groupDetail.members.length === 0 ? (
                                        <div className={styles.emptyMembers}>
                                            {groupDetail.isDynamic
                                                ? 'Ingen brukere matcher reglene ennå.'
                                                : 'Ingen medlemmer i denne gruppen ennå.'}
                                        </div>
                                    ) : (
                                        <div className={styles.memberList}>
                                            {groupDetail.members.map((m) => (
                                                <div key={m.id} className={styles.memberRow}>
                                                    {m.avatarUrl ? (
                                                        <img src={m.avatarUrl} alt="" className={styles.avatarImg} />
                                                    ) : (
                                                        <div className={styles.avatar}>{getInitials(m)}</div>
                                                    )}
                                                    <div className={styles.memberInfo}>
                                                        <span className={styles.memberName}>
                                                            {m.firstName && m.lastName
                                                                ? `${m.firstName} ${m.lastName}`
                                                                : m.name || m.email || 'Ukjent'}
                                                        </span>
                                                        <span className={styles.memberEmail}>{m.email}</span>
                                                    </div>
                                                    {groupDetail.isDynamic && (
                                                        <span
                                                            className={`${styles.memberSourceTag} ${m.source === 'manual' ? styles.memberSourceManual : ''}`}
                                                            title={m.source === 'rule' ? 'Lagt til av regel' : 'Lagt til manuelt'}
                                                        >
                                                            {m.source === 'rule' ? 'Regel' : 'Manuell'}
                                                        </span>
                                                    )}
                                                    {/* In dynamic groups, only manual members can be removed by hand;
                                                        rule-driven membership is reconciled by sync. */}
                                                    {(!groupDetail.isDynamic || m.source === 'manual') && (
                                                        <button
                                                            className={styles.memberRemove}
                                                            title="Fjern fra gruppe"
                                                            onClick={() => handleRemoveMember(m.id)}
                                                        >
                                                            <UserMinus size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add member — manual groups only */}
                                    {!groupDetail.isDynamic && (
                                        <div className={styles.addMemberSection}>
                                            <span className={styles.addMemberLabel}>
                                                <UserPlus size={14} /> Legg til medlem
                                            </span>
                                            <input
                                                className={styles.addMemberSearch}
                                                placeholder="Søk etter bruker (navn eller e-post)..."
                                                value={memberSearch}
                                                onChange={(e) => setMemberSearch(e.target.value)}
                                            />
                                            {loadingMembers && (
                                                <div className={styles.loading}>
                                                    <div className={styles.spinner} />
                                                </div>
                                            )}
                                            {availableMembers.length > 0 && (
                                                <div className={styles.addMemberResults}>
                                                    {availableMembers.map((u) => (
                                                        <div key={u.id} className={styles.addMemberRow}>
                                                            {u.avatarUrl ? (
                                                                <img src={u.avatarUrl} alt="" className={styles.avatarImg} />
                                                            ) : (
                                                                <div className={styles.avatar}>{getInitials(u)}</div>
                                                            )}
                                                            <div>
                                                                <div className={styles.addMemberName}>
                                                                    {u.firstName && u.lastName
                                                                        ? `${u.firstName} ${u.lastName}`
                                                                        : u.name || u.email}
                                                                </div>
                                                                <div className={styles.addMemberEmail}>{u.email}</div>
                                                            </div>
                                                            <button
                                                                className={styles.addMemberBtn}
                                                                title="Legg til"
                                                                onClick={() => handleAddMember(u.id)}
                                                            >
                                                                <Plus size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : null}
                        </div>
                        <div className={styles.modalFooter}>
                            {groupDetail?.isDynamic && (
                                <button
                                    className={styles.syncBtn}
                                    disabled={syncingId === selectedGroup.id}
                                    onClick={() => handleSync(selectedGroup)}
                                    style={{ marginRight: 'auto' }}
                                >
                                    <RefreshCw size={13} className={syncingId === selectedGroup.id ? styles.syncSpin : undefined} />
                                    {syncingId === selectedGroup.id ? 'Synkroniserer…' : 'Synkroniser nå'}
                                </button>
                            )}
                            <button className={styles.btnSecondary} onClick={() => setShowDetail(false)}>Lukk</button>
                        </div>
                    </div>
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
