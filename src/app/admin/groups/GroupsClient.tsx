'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Plus, Search, X, Pencil, Trash2, Users, UserPlus,
    FolderOpen, CheckCircle, UserMinus, Palette,
} from 'lucide-react';
import {
    listGroups, getGroup, createGroup, updateGroup,
    deleteGroup, addGroupMember, removeGroupMember,
    listAvailableMembers, getGroupStats,
    type GroupListItem, type GroupDetail,
} from '@/app/actions/groupActions';
import { suggestGroupColors, type ColorSuggestion } from '@/lib/groupColors';
import styles from './groups.module.css';

function getInitials(user: { firstName?: string | null; lastName?: string | null; name?: string | null; email?: string | null }): string {
    if (user.firstName && user.lastName) return (user.firstName[0] + user.lastName[0]).toUpperCase();
    if (user.name) return user.name.substring(0, 2).toUpperCase();
    if (user.email) return user.email.substring(0, 2).toUpperCase();
    return '??';
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

    // Color suggestions (computed from existing groups)
    function getColorSuggestions(): ColorSuggestion[] {
        const usedColors = groups
            .filter((g) => g.color && g.id !== selectedGroup?.id)
            .map((g) => g.color!);
        return suggestGroupColors(usedColors);
    }

    // Add member state
    const [memberSearch, setMemberSearch] = useState('');
    const [availableMembers, setAvailableMembers] = useState<{ id: string; name: string | null; email: string | null; firstName: string | null; lastName: string | null }[]>([]);
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

    // ── Create ──────────────────────────────────────────
    async function handleCreate() {
        setError(null);
        setLoading(true);
        const result = await createGroup({
            name: formName,
            description: formDesc || undefined,
            color: formColor || undefined,
        });
        setLoading(false);
        if ('error' in result) { setError(result.error); return; }
        setShowCreate(false);
        setFormName('');
        setFormDesc('');
        setFormColor(null);
        showToast('Gruppe opprettet');
        refreshData();
    }

    // ── Edit ────────────────────────────────────────────
    function openEdit(group: GroupListItem) {
        setSelectedGroup(group);
        setFormName(group.name);
        setFormDesc(group.description || '');
        setFormColor(group.color || null);
        setError(null);
        setShowEdit(true);
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
        setLoading(false);
        if ('error' in result) { setError(result.error); return; }
        setShowEdit(false);
        showToast('Gruppe oppdatert');
        refreshData();
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
                <button className={styles.createButton} onClick={() => { setFormName(''); setFormDesc(''); setFormColor(null); setError(null); setShowCreate(true); }}>
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
                    <button className={styles.createButton} onClick={() => { setFormName(''); setFormDesc(''); setFormColor(null); setError(null); setShowCreate(true); }}>
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
                                        onClick={() => setFormColor(null)}
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
                                            onClick={() => setFormColor(c.hex)}
                                            title={`${c.name} — kontrast ${c.contrastOnDark}:1${c.meetsAA ? ' ✓ WCAG AA' : ''}`}
                                        />
                                    ))}
                                </div>
                                {formColor && (
                                    <span className={styles.colorPreview}>
                                        <span className={styles.colorDot} style={{ background: formColor }} />
                                        {formColor}
                                    </span>
                                )}
                            </div>
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
                                        onClick={() => setFormColor(null)}
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
                                            onClick={() => setFormColor(c.hex)}
                                            title={`${c.name} — kontrast ${c.contrastOnDark}:1${c.meetsAA ? ' ✓ WCAG AA' : ''}`}
                                        />
                                    ))}
                                </div>
                                {formColor && (
                                    <span className={styles.colorPreview}>
                                        <span className={styles.colorDot} style={{ background: formColor }} />
                                        {formColor}
                                    </span>
                                )}
                            </div>
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

                                    <div className={styles.formLabel}>
                                        Medlemmer ({groupDetail.members.length})
                                    </div>

                                    {groupDetail.members.length === 0 ? (
                                        <div className={styles.emptyMembers}>
                                            Ingen medlemmer i denne gruppen ennå.
                                        </div>
                                    ) : (
                                        <div className={styles.memberList}>
                                            {groupDetail.members.map((m) => (
                                                <div key={m.id} className={styles.memberRow}>
                                                    <div className={styles.avatar}>{getInitials(m)}</div>
                                                    <div className={styles.memberInfo}>
                                                        <span className={styles.memberName}>
                                                            {m.firstName && m.lastName
                                                                ? `${m.firstName} ${m.lastName}`
                                                                : m.name || m.email || 'Ukjent'}
                                                        </span>
                                                        <span className={styles.memberEmail}>{m.email}</span>
                                                    </div>
                                                    <button
                                                        className={styles.memberRemove}
                                                        title="Fjern fra gruppe"
                                                        onClick={() => handleRemoveMember(m.id)}
                                                    >
                                                        <UserMinus size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add member */}
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
                                                        <div className={styles.avatar}>{getInitials(u)}</div>
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
                                </>
                            ) : null}
                        </div>
                        <div className={styles.modalFooter}>
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
