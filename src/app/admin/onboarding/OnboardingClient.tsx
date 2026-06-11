'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Rocket, Plus, Search, X, Trash2, GripVertical, Users, Edit3,
    CheckCircle2, AlertTriangle, ChevronDown, Layers, Zap, UserPlus,
    Calendar, ListChecks, Power,
} from 'lucide-react';
import styles from './onboarding.module.css';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
    listPrograms, getProgram, createProgram, updateProgram, deleteProgram,
    addItem, updateItem, deleteItem, reorderItems,
    listTenantCourses, listTenantGroups, listTenantUsers,
    assignProgram, listProgramEnrollees,
    type OnboardingProgramListItem, type OnboardingProgramDetail,
    type OnboardingStats, type OnboardingItem, type OnboardingPickerCourse,
    type OnboardingPickerGroup, type OnboardingPickerUser, type OnboardingEnrollee,
} from '@/app/actions/onboardingActions';

// ── Quick presets for offsetDays ────────────────────────────

const WEEK_PRESETS: { label: string; days: number }[] = [
    { label: 'Uke 1', days: 0 },
    { label: 'Uke 2', days: 7 },
    { label: 'Uke 3', days: 14 },
    { label: 'Uke 4', days: 21 },
];

function offsetLabel(days: number): string {
    if (days <= 0) return 'Ved oppstart (uke 1)';
    const weeks = Math.floor(days / 7);
    if (days % 7 === 0 && weeks >= 1) return `Etter ${days} dager (uke ${weeks + 1})`;
    return `Etter ${days} dager`;
}

function formatDate(d: Date): string {
    return new Date(d).toLocaleDateString('nb-NO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function formatInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

// ── Drawer item draft (client-side, before persisting) ──────

interface ItemDraft {
    id: string | null;        // null = new (not yet persisted)
    tempKey: string;          // stable React key
    courseId: string;
    title: string;
    offsetDays: number;
}

interface OnboardingClientProps {
    initialPrograms: OnboardingProgramListItem[];
    stats: OnboardingStats;
}

let tempCounter = 0;
function nextTempKey(): string {
    tempCounter += 1;
    return `tmp-${tempCounter}`;
}

export default function OnboardingClient({ initialPrograms, stats }: OnboardingClientProps) {
    const [programs, setPrograms] = useState<OnboardingProgramListItem[]>(initialPrograms);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Pickers
    const [courses, setCourses] = useState<OnboardingPickerCourse[]>([]);
    const [groups, setGroups] = useState<OnboardingPickerGroup[]>([]);

    // Drawer (create/edit)
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [autoAssignOnCreate, setAutoAssignOnCreate] = useState(false);
    const [autoAssignGroupId, setAutoAssignGroupId] = useState('');
    const [items, setItems] = useState<ItemDraft[]>([]);
    const [originalItemIds, setOriginalItemIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [dragIndex, setDragIndex] = useState<number | null>(null);

    // Assign modal
    const [assignProgramTarget, setAssignProgramTarget] = useState<OnboardingProgramListItem | null>(null);
    const [userSearch, setUserSearch] = useState('');
    const [userResults, setUserResults] = useState<OnboardingPickerUser[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [assigning, setAssigning] = useState(false);

    // Enrollee list modal
    const [enrolleeProgram, setEnrolleeProgram] = useState<OnboardingProgramListItem | null>(null);
    const [enrollees, setEnrollees] = useState<OnboardingEnrollee[]>([]);
    const [enrolleesLoading, setEnrolleesLoading] = useState(false);

    // Confirm delete
    const [confirmDelete, setConfirmDelete] = useState<OnboardingProgramListItem | null>(null);

    // ── Refresh list ────────────────────────────────────────

    const refresh = useCallback(async () => {
        setLoading(true);
        const result = await listPrograms();
        if ('programs' in result) {
            setPrograms(result.programs);
        } else {
            setError(result.error);
        }
        setLoading(false);
    }, []);

    // ── Toast auto-dismiss ──────────────────────────────────

    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // ── Load pickers when drawer opens ──────────────────────

    useEffect(() => {
        if (!drawerOpen) return;
        let cancelled = false;
        (async () => {
            const [courseRes, groupRes] = await Promise.all([
                listTenantCourses(),
                listTenantGroups(),
            ]);
            if (cancelled) return;
            if ('courses' in courseRes) setCourses(courseRes.courses);
            if ('groups' in groupRes) setGroups(groupRes.groups);
        })();
        return () => {
            cancelled = true;
        };
    }, [drawerOpen]);

    // ── User search (debounced) for assign modal ────────────

    useEffect(() => {
        if (!assignProgramTarget) return;
        const timer = setTimeout(async () => {
            const res = await listTenantUsers(userSearch || undefined);
            if ('users' in res) setUserResults(res.users);
        }, 300);
        return () => clearTimeout(timer);
    }, [userSearch, assignProgramTarget]);

    // ── Filtered programs (client-side search) ──────────────

    const filteredPrograms = programs.filter((p) => {
        if (!search.trim()) return true;
        const term = search.trim().toLowerCase();
        return (
            p.name.toLowerCase().includes(term) ||
            (p.description ?? '').toLowerCase().includes(term)
        );
    });

    // ── Open create drawer ──────────────────────────────────

    function openCreate() {
        setEditingId(null);
        setName('');
        setDescription('');
        setIsActive(true);
        setAutoAssignOnCreate(false);
        setAutoAssignGroupId('');
        setItems([]);
        setOriginalItemIds([]);
        setDrawerOpen(true);
    }

    // ── Open edit drawer ────────────────────────────────────

    async function openEdit(p: OnboardingProgramListItem) {
        const res = await getProgram(p.id);
        if ('error' in res) {
            setError(res.error);
            return;
        }
        const d: OnboardingProgramDetail = res.program;
        setEditingId(d.id);
        setName(d.name);
        setDescription(d.description ?? '');
        setIsActive(d.isActive);
        setAutoAssignOnCreate(d.autoAssignOnCreate);
        setAutoAssignGroupId(d.autoAssignGroupId ?? '');
        setItems(
            d.items.map((it: OnboardingItem) => ({
                id: it.id,
                tempKey: it.id,
                courseId: it.courseId ?? '',
                title: it.title,
                offsetDays: it.offsetDays,
            }))
        );
        setOriginalItemIds(d.items.map((it) => it.id));
        setDrawerOpen(true);
    }

    // ── Item editor handlers (drawer-local state) ───────────

    function addDraftItem() {
        const lastOffset = items.length > 0 ? items[items.length - 1].offsetDays : 0;
        setItems([
            ...items,
            { id: null, tempKey: nextTempKey(), courseId: '', title: '', offsetDays: lastOffset },
        ]);
    }

    function updateDraftItem(index: number, patch: Partial<ItemDraft>) {
        setItems(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
    }

    function removeDraftItem(index: number) {
        setItems(items.filter((_, i) => i !== index));
    }

    function handleDragStart(index: number) {
        setDragIndex(index);
    }

    function handleDragOver(e: React.DragEvent, index: number) {
        e.preventDefault();
        if (dragIndex === null || dragIndex === index) return;
        const reordered = [...items];
        const [moved] = reordered.splice(dragIndex, 1);
        reordered.splice(index, 0, moved);
        setDragIndex(index);
        setItems(reordered);
    }

    function handleDragEnd() {
        setDragIndex(null);
    }

    // ── Submit create/edit (persist program + items) ────────

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSaving(true);
        setError(null);

        const programData = {
            name,
            description: description || null,
            isActive,
            autoAssignOnCreate,
            autoAssignGroupId: autoAssignGroupId || null,
        };

        let programId = editingId;

        if (editingId) {
            const res = await updateProgram(editingId, programData);
            if ('error' in res) {
                setError(res.error);
                setSaving(false);
                return;
            }
        } else {
            const res = await createProgram(programData);
            if ('error' in res) {
                setError(res.error);
                setSaving(false);
                return;
            }
            programId = res.programId;
        }

        if (!programId) {
            setError('Ukjent feil');
            setSaving(false);
            return;
        }

        // Sync items: delete removed, update existing, create new.
        const currentIds = items.filter((it) => it.id).map((it) => it.id as string);
        const removedIds = originalItemIds.filter((id) => !currentIds.includes(id));

        for (const id of removedIds) {
            await deleteItem(id);
        }

        // Create/update items in order; collect resulting ids for reorder.
        const orderedIds: string[] = [];
        for (const it of items) {
            const title = it.title.trim() || (it.courseId
                ? (courses.find((c) => c.id === it.courseId)?.title ?? 'Kurs')
                : 'Element');
            if (it.id) {
                await updateItem(it.id, {
                    courseId: it.courseId || null,
                    title,
                    offsetDays: it.offsetDays,
                });
                orderedIds.push(it.id);
            } else {
                const res = await addItem(programId, {
                    courseId: it.courseId || null,
                    title,
                    offsetDays: it.offsetDays,
                });
                if ('itemId' in res) orderedIds.push(res.itemId);
            }
        }

        if (orderedIds.length > 0) {
            await reorderItems(programId, orderedIds);
        }

        setSaving(false);
        setDrawerOpen(false);
        setToast(editingId ? 'Program oppdatert' : 'Program opprettet');
        refresh();
    }

    // ── Toggle active ───────────────────────────────────────

    async function toggleActive(p: OnboardingProgramListItem) {
        // Optimistic update
        setPrograms((prev) =>
            prev.map((x) => (x.id === p.id ? { ...x, isActive: !x.isActive } : x))
        );
        const res = await updateProgram(p.id, { name: p.name, isActive: !p.isActive });
        if ('error' in res) {
            setError(res.error);
            // revert
            setPrograms((prev) =>
                prev.map((x) => (x.id === p.id ? { ...x, isActive: p.isActive } : x))
            );
        } else {
            setToast(!p.isActive ? 'Program aktivert' : 'Program deaktivert');
        }
    }

    // ── Delete ──────────────────────────────────────────────

    async function handleDelete() {
        if (!confirmDelete) return;
        const res = await deleteProgram(confirmDelete.id);
        setConfirmDelete(null);
        if ('success' in res) {
            setToast('Program slettet');
            refresh();
        } else {
            setError(res.error);
        }
    }

    // ── Assign modal ────────────────────────────────────────

    function openAssign(p: OnboardingProgramListItem) {
        setAssignProgramTarget(p);
        setUserSearch('');
        setUserResults([]);
        setSelectedUserIds(new Set());
    }

    function toggleUser(id: string) {
        setSelectedUserIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function handleAssign() {
        if (!assignProgramTarget) return;
        if (selectedUserIds.size === 0) {
            setError('Velg minst én bruker');
            return;
        }
        setAssigning(true);
        const res = await assignProgram(assignProgramTarget.id, Array.from(selectedUserIds));
        setAssigning(false);
        if ('success' in res) {
            setToast(`Tildelt ${res.assignedCount} bruker(e)`);
            setAssignProgramTarget(null);
            refresh();
        } else {
            setError(res.error);
        }
    }

    // ── Enrollee list modal ─────────────────────────────────

    async function openEnrollees(p: OnboardingProgramListItem) {
        setEnrolleeProgram(p);
        setEnrollees([]);
        setEnrolleesLoading(true);
        const res = await listProgramEnrollees(p.id);
        setEnrolleesLoading(false);
        if ('enrollees' in res) {
            setEnrollees(res.enrollees);
        } else {
            setError(res.error);
            setEnrolleeProgram(null);
        }
    }

    // ── Render ──────────────────────────────────────────────

    return (
        <div className={styles.onboardingPage}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Onboarding</h1>
                    <p className={styles.subtitle}>
                        Tidsstyrt automatisk tildeling av opplæring for nye ansatte
                    </p>
                </div>
                <button className={styles.primaryButton} onClick={openCreate}>
                    <Plus size={18} />
                    Nytt program
                </button>
            </div>

            {/* KPI cards */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Layers size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Programmer</span>
                        <span className={styles.statValue}>{stats.totalPrograms}</span>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Power size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Aktive</span>
                        <span className={styles.statValue}>{stats.activePrograms}</span>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Zap size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Auto-tildeling</span>
                        <span className={styles.statValue}>{stats.autoAssignPrograms}</span>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Users size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Påmeldte totalt</span>
                        <span className={styles.statValue}>{stats.totalEnrollees}</span>
                    </div>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className={styles.errorBanner}>
                    <AlertTriangle size={16} />
                    {error}
                    <button
                        className={styles.iconButton}
                        onClick={() => setError(null)}
                        style={{ marginLeft: 'auto' }}
                        aria-label="Lukk feilmelding"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Toolbar */}
            <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        className={styles.searchInput}
                        type="text"
                        placeholder="Søk etter program..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Program list */}
            <div className={styles.listWrapper}>
                {loading ? (
                    <div className={styles.loading}>
                        <div className={styles.spinner} />
                        Laster programmer...
                    </div>
                ) : filteredPrograms.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                            <Rocket size={28} />
                        </div>
                        <span className={styles.emptyTitle}>
                            {search ? 'Ingen treff' : 'Ingen onboarding-programmer ennå'}
                        </span>
                        <span className={styles.emptyText}>
                            {search
                                ? `Ingen programmer matcher "${search}"`
                                : 'Opprett ditt første program for å automatisere opplæring av nye ansatte.'}
                        </span>
                    </div>
                ) : (
                    <div className={styles.programCards}>
                        {filteredPrograms.map((p) => (
                            <div key={p.id} className={styles.programCard}>
                                <div className={styles.programMain}>
                                    <div className={styles.programIcon}>
                                        <Rocket size={20} />
                                    </div>
                                    <div className={styles.programInfo}>
                                        <div className={styles.programTitleRow}>
                                            <h3 className={styles.programTitle}>{p.name}</h3>
                                            {p.autoAssignOnCreate && (
                                                <span className={styles.autoBadge}>
                                                    <Zap size={12} />
                                                    Auto
                                                </span>
                                            )}
                                        </div>
                                        {p.description && (
                                            <p className={styles.programDesc}>{p.description}</p>
                                        )}
                                        <div className={styles.programMeta}>
                                            <span className={styles.metaItem}>
                                                <ListChecks size={14} />
                                                {p.itemCount} steg
                                            </span>
                                            <button
                                                type="button"
                                                className={styles.metaButton}
                                                onClick={() => openEnrollees(p)}
                                            >
                                                <Users size={14} />
                                                {p.enrolleeCount} påmeldte
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.programActions}>
                                    <button
                                        type="button"
                                        className={`${styles.toggle} ${p.isActive ? styles.toggleOn : ''}`}
                                        onClick={() => toggleActive(p)}
                                        role="switch"
                                        aria-checked={p.isActive}
                                        aria-label={p.isActive ? 'Deaktiver program' : 'Aktiver program'}
                                        title={p.isActive ? 'Aktiv' : 'Inaktiv'}
                                    >
                                        <span className={styles.toggleKnob} />
                                    </button>
                                    <button
                                        className={styles.actionBtn}
                                        onClick={() => openAssign(p)}
                                        aria-label="Tildel til brukere"
                                        title="Tildel til brukere"
                                    >
                                        <UserPlus size={16} />
                                    </button>
                                    <button
                                        className={styles.actionBtn}
                                        onClick={() => openEdit(p)}
                                        aria-label="Rediger program"
                                        title="Rediger"
                                    >
                                        <Edit3 size={16} />
                                    </button>
                                    <button
                                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                        onClick={() => setConfirmDelete(p)}
                                        aria-label="Slett program"
                                        title="Slett"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Create / Edit drawer ──────────────────────── */}
            {drawerOpen && (
                <div className={styles.drawerOverlay} onClick={() => setDrawerOpen(false)}>
                    <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.drawerHeader}>
                            <h2 className={styles.drawerTitle}>
                                {editingId ? 'Rediger program' : 'Nytt program'}
                            </h2>
                            <button
                                className={styles.iconButton}
                                onClick={() => setDrawerOpen(false)}
                                aria-label="Lukk"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className={styles.drawerForm}>
                            <div className={styles.drawerBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Navn *</label>
                                    <input
                                        className={styles.formInput}
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                        placeholder="F.eks. Onboarding nyansatte"
                                        autoFocus
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Beskrivelse</label>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={2}
                                        placeholder="Kort beskrivelse av programmet"
                                    />
                                </div>

                                <label className={styles.checkboxRow}>
                                    <input
                                        type="checkbox"
                                        checked={autoAssignOnCreate}
                                        onChange={(e) => setAutoAssignOnCreate(e.target.checked)}
                                        className={styles.checkbox}
                                    />
                                    <span className={styles.checkboxBody}>
                                        <span className={styles.checkboxLabel}>
                                            <Zap size={14} /> Tildel automatisk til nye brukere
                                        </span>
                                        <span className={styles.checkboxHint}>
                                            Når en ny bruker opprettes, blir programmet tildelt
                                            automatisk.
                                        </span>
                                    </span>
                                </label>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>
                                        Tilknyttet gruppe (valgfritt)
                                    </label>
                                    <div className={styles.selectWrap}>
                                        <select
                                            className={styles.formSelect}
                                            value={autoAssignGroupId}
                                            onChange={(e) => setAutoAssignGroupId(e.target.value)}
                                        >
                                            <option value="">Ingen valgt</option>
                                            {groups.map((g) => (
                                                <option key={g.id} value={g.id}>
                                                    {g.name}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={16} className={styles.selectChevron} />
                                    </div>
                                </div>

                                {/* Items editor */}
                                <div className={styles.itemsSection}>
                                    <div className={styles.itemsHeader}>
                                        <span className={styles.sectionLabel}>Program-steg</span>
                                        <button
                                            type="button"
                                            className={styles.addItemBtn}
                                            onClick={addDraftItem}
                                        >
                                            <Plus size={14} />
                                            Legg til steg
                                        </button>
                                    </div>

                                    {items.length === 0 ? (
                                        <p className={styles.itemsEmpty}>
                                            Ingen steg ennå. Legg til kurs som skal tildeles, med
                                            valgfri tidsforskyvning.
                                        </p>
                                    ) : (
                                        <div className={styles.itemsList}>
                                            {items.map((it, index) => (
                                                <div
                                                    key={it.tempKey}
                                                    className={styles.itemRow}
                                                    draggable
                                                    onDragStart={() => handleDragStart(index)}
                                                    onDragOver={(e) => handleDragOver(e, index)}
                                                    onDragEnd={handleDragEnd}
                                                >
                                                    <span
                                                        className={styles.dragHandle}
                                                        aria-label="Dra for å endre rekkefølge"
                                                    >
                                                        <GripVertical size={16} />
                                                    </span>
                                                    <div className={styles.itemFields}>
                                                        <div className={styles.itemFieldsTop}>
                                                            <div className={styles.selectWrap}>
                                                                <select
                                                                    className={styles.formSelect}
                                                                    value={it.courseId}
                                                                    onChange={(e) =>
                                                                        updateDraftItem(index, {
                                                                            courseId: e.target.value,
                                                                        })
                                                                    }
                                                                >
                                                                    <option value="">
                                                                        Uten kurs (kun steg)
                                                                    </option>
                                                                    {courses.map((c) => (
                                                                        <option key={c.id} value={c.id}>
                                                                            {c.title}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <ChevronDown
                                                                    size={16}
                                                                    className={styles.selectChevron}
                                                                />
                                                            </div>
                                                            <input
                                                                className={styles.formInput}
                                                                type="text"
                                                                value={it.title}
                                                                onChange={(e) =>
                                                                    updateDraftItem(index, {
                                                                        title: e.target.value,
                                                                    })
                                                                }
                                                                placeholder="Tittel på steg"
                                                            />
                                                            <button
                                                                type="button"
                                                                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                                                onClick={() => removeDraftItem(index)}
                                                                aria-label="Fjern steg"
                                                                title="Fjern"
                                                            >
                                                                <Trash2 size={15} />
                                                            </button>
                                                        </div>
                                                        <div className={styles.itemFieldsBottom}>
                                                            <span className={styles.offsetLabel}>
                                                                <Calendar size={13} />
                                                                {offsetLabel(it.offsetDays)}
                                                            </span>
                                                            <div className={styles.presets}>
                                                                {WEEK_PRESETS.map((preset) => (
                                                                    <button
                                                                        key={preset.label}
                                                                        type="button"
                                                                        className={`${styles.presetBtn} ${
                                                                            it.offsetDays === preset.days
                                                                                ? styles.presetBtnActive
                                                                                : ''
                                                                        }`}
                                                                        onClick={() =>
                                                                            updateDraftItem(index, {
                                                                                offsetDays: preset.days,
                                                                            })
                                                                        }
                                                                    >
                                                                        {preset.label}
                                                                    </button>
                                                                ))}
                                                                <input
                                                                    className={styles.offsetInput}
                                                                    type="number"
                                                                    min={0}
                                                                    value={it.offsetDays}
                                                                    onChange={(e) =>
                                                                        updateDraftItem(index, {
                                                                            offsetDays:
                                                                                e.target.value === ''
                                                                                    ? 0
                                                                                    : Math.max(
                                                                                          0,
                                                                                          Number(
                                                                                              e.target.value
                                                                                          )
                                                                                      ),
                                                                        })
                                                                    }
                                                                    aria-label="Dager etter oppstart"
                                                                    title="Dager etter oppstart"
                                                                />
                                                                <span className={styles.offsetUnit}>
                                                                    dager
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className={styles.drawerFooter}>
                                <button
                                    type="button"
                                    className={styles.btnSecondary}
                                    onClick={() => setDrawerOpen(false)}
                                >
                                    Avbryt
                                </button>
                                <button type="submit" className={styles.btnPrimary} disabled={saving}>
                                    {saving
                                        ? 'Lagrer...'
                                        : editingId
                                          ? 'Lagre endringer'
                                          : 'Opprett program'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Assign modal ──────────────────────────────── */}
            {assignProgramTarget && (
                <div className={styles.drawerOverlay} onClick={() => setAssignProgramTarget(null)}>
                    <div className={styles.detailModal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.drawerHeader}>
                            <div>
                                <h2 className={styles.drawerTitle}>Tildel til brukere</h2>
                                <span className={styles.drawerSub}>{assignProgramTarget.name}</span>
                            </div>
                            <button
                                className={styles.iconButton}
                                onClick={() => setAssignProgramTarget(null)}
                                aria-label="Lukk"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className={styles.detailBody}>
                            <div className={styles.searchBox}>
                                <Search size={16} className={styles.searchIcon} />
                                <input
                                    className={styles.searchInput}
                                    type="text"
                                    placeholder="Søk etter bruker..."
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                />
                            </div>

                            {selectedUserIds.size > 0 && (
                                <span className={styles.selectionCount}>
                                    {selectedUserIds.size} valgt
                                </span>
                            )}

                            <div className={styles.userList}>
                                {userResults.length === 0 ? (
                                    <p className={styles.rosterEmpty}>
                                        {userSearch
                                            ? 'Ingen brukere matcher søket.'
                                            : 'Søk for å finne brukere.'}
                                    </p>
                                ) : (
                                    userResults.map((u) => {
                                        const selected = selectedUserIds.has(u.id);
                                        return (
                                            <button
                                                key={u.id}
                                                type="button"
                                                className={`${styles.userRow} ${selected ? styles.userRowSelected : ''}`}
                                                onClick={() => toggleUser(u.id)}
                                                aria-pressed={selected}
                                            >
                                                <span className={styles.checkboxBox}>
                                                    {selected && <CheckCircle2 size={16} />}
                                                </span>
                                                <div className={styles.rosterAvatar}>
                                                    {u.avatarUrl ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={u.avatarUrl}
                                                            alt=""
                                                            className={styles.rosterAvatarImg}
                                                        />
                                                    ) : (
                                                        formatInitials(u.name)
                                                    )}
                                                </div>
                                                <div className={styles.rosterInfo}>
                                                    <span className={styles.rosterName}>{u.name}</span>
                                                    {(u.jobTitle || u.email) && (
                                                        <span className={styles.rosterEmail}>
                                                            {u.jobTitle ?? u.email}
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className={styles.drawerFooter}>
                            <button
                                type="button"
                                className={styles.btnSecondary}
                                onClick={() => setAssignProgramTarget(null)}
                            >
                                Avbryt
                            </button>
                            <button
                                type="button"
                                className={styles.btnPrimary}
                                onClick={handleAssign}
                                disabled={assigning || selectedUserIds.size === 0}
                            >
                                {assigning ? 'Tildeler...' : `Tildel (${selectedUserIds.size})`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Enrollee list modal ───────────────────────── */}
            {enrolleeProgram && (
                <div className={styles.drawerOverlay} onClick={() => setEnrolleeProgram(null)}>
                    <div className={styles.detailModal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.drawerHeader}>
                            <div>
                                <h2 className={styles.drawerTitle}>Påmeldte</h2>
                                <span className={styles.drawerSub}>{enrolleeProgram.name}</span>
                            </div>
                            <button
                                className={styles.iconButton}
                                onClick={() => setEnrolleeProgram(null)}
                                aria-label="Lukk"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className={styles.detailBody}>
                            {enrolleesLoading ? (
                                <div className={styles.loading}>
                                    <div className={styles.spinner} />
                                    Laster påmeldte...
                                </div>
                            ) : enrollees.length === 0 ? (
                                <p className={styles.rosterEmpty}>Ingen påmeldte ennå.</p>
                            ) : (
                                <div className={styles.roster}>
                                    {enrollees.map((e) => (
                                        <div key={e.enrollmentId} className={styles.rosterRow}>
                                            <div className={styles.rosterAvatar}>
                                                {e.avatarUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={e.avatarUrl}
                                                        alt=""
                                                        className={styles.rosterAvatarImg}
                                                    />
                                                ) : (
                                                    formatInitials(e.name)
                                                )}
                                            </div>
                                            <div className={styles.rosterInfo}>
                                                <span className={styles.rosterName}>{e.name}</span>
                                                {e.email && (
                                                    <span className={styles.rosterEmail}>
                                                        {e.email}
                                                    </span>
                                                )}
                                            </div>
                                            <div className={styles.enrolleeMeta}>
                                                <span className={styles.enrolleeDate}>
                                                    Tildelt {formatDate(e.assignedAt)}
                                                </span>
                                                {e.completedAt ? (
                                                    <span className={styles.enrolleeDone}>
                                                        <CheckCircle2 size={13} />
                                                        Fullført
                                                    </span>
                                                ) : (
                                                    <span className={styles.enrolleePending}>
                                                        Pågår
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Confirm delete ────────────────────────────── */}
            <ConfirmDialog
                open={confirmDelete !== null}
                title="Slett program"
                description={`Er du sikker på at du vil slette "${confirmDelete?.name ?? ''}"? Alle steg og påmeldinger fjernes. Dette kan ikke angres.`}
                confirmText="Slett program"
                variant="danger"
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(null)}
            />

            {/* ── Toast ─────────────────────────────────────── */}
            {toast && (
                <div className={styles.toast}>
                    <CheckCircle2 size={16} />
                    {toast}
                </div>
            )}
        </div>
    );
}
