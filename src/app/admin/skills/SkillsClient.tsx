'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
    Target, Award, GitBranch, TrendingUp, Plus, Edit3, Trash2, X,
    ChevronRight, ChevronDown, CheckCircle, AlertTriangle, Search, Save,
    BookOpen, Users, Layers,
} from 'lucide-react';
import styles from './skills.module.css';
import {
    listSkills, createSkill, updateSkill, deleteSkill,
    listMappableCourses, getCourseSkills, setCourseSkills,
    getTeamMatrix, getUserSkillGap, listSkillUsers, setUserSkill,
    type SkillNode, type MappableCourse, type CourseSkillItem,
    type TeamMatrix, type SkillGapResult,
} from '@/app/actions/skillActions';

type Tab = 'skills' | 'courses' | 'matrix' | 'gap';

const TABS: { id: Tab; label: string; icon: typeof Target }[] = [
    { id: 'skills', label: 'Ferdigheter', icon: Award },
    { id: 'courses', label: 'Kurs-kobling', icon: GitBranch },
    { id: 'matrix', label: 'Kompetansematrise', icon: Layers },
    { id: 'gap', label: 'Gap-analyse', icon: TrendingUp },
];

// Flatten the skill tree into a list of {id, label-with-depth} for parent pickers.
function flattenForSelect(nodes: SkillNode[], depth = 0, acc: { id: string; label: string }[] = []) {
    for (const n of nodes) {
        acc.push({ id: n.id, label: `${'— '.repeat(depth)}${n.name}` });
        if (n.children.length > 0) flattenForSelect(n.children, depth + 1, acc);
    }
    return acc;
}

function countSkills(nodes: SkillNode[]): number {
    return nodes.reduce((sum, n) => sum + 1 + countSkills(n.children), 0);
}

export default function SkillsClient() {
    const [tab, setTab] = useState<Tab>('skills');
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
                        <Target size={24} /> Kompetanse
                    </h1>
                    <p className={styles.subtitle}>
                        Bygg ferdighetstaksonomi, koble til kurs og kartlegg kompetansen i organisasjonen
                    </p>
                </div>
            </div>

            {/* Tabs */}
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
                {tab === 'skills' && <SkillsTab onToast={setToast} onError={setError} />}
                {tab === 'courses' && <CoursesTab onToast={setToast} onError={setError} />}
                {tab === 'matrix' && <MatrixTab onError={setError} />}
                {tab === 'gap' && <GapTab onToast={setToast} onError={setError} />}
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
// TAB 1: Ferdigheter (taxonomy tree CRUD)
// ══════════════════════════════════════════════════════════════

interface SkillFormState {
    id: string | null;
    name: string;
    description: string;
    category: string;
    parentSkillId: string;
    maxLevel: number;
}

const EMPTY_SKILL: SkillFormState = {
    id: null, name: '', description: '', category: '', parentSkillId: '', maxLevel: 5,
};

function SkillsTab({
    onToast,
    onError,
}: {
    onToast: (s: string) => void;
    onError: (s: string) => void;
}) {
    const [tree, setTree] = useState<SkillNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [form, setForm] = useState<SkillFormState | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<SkillNode | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await listSkills();
        if ('skills' in res) {
            setTree(res.skills);
        } else {
            onError(res.error);
        }
        setLoading(false);
    }, [onError]);

    useEffect(() => {
        const t = setTimeout(() => load(), 0);
        return () => clearTimeout(t);
    }, [load]);

    const flatParents = useMemo(() => flattenForSelect(tree), [tree]);
    const total = useMemo(() => countSkills(tree), [tree]);

    function toggle(id: string) {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function openCreate(parentId?: string) {
        setForm({ ...EMPTY_SKILL, parentSkillId: parentId ?? '' });
    }

    function openEdit(node: SkillNode) {
        setForm({
            id: node.id,
            name: node.name,
            description: node.description ?? '',
            category: node.category ?? '',
            parentSkillId: node.parentSkillId ?? '',
            maxLevel: node.maxLevel,
        });
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!form) return;
        setSaving(true);
        const payload = {
            name: form.name,
            description: form.description || undefined,
            category: form.category || undefined,
            parentSkillId: form.parentSkillId || null,
            maxLevel: form.maxLevel,
        };
        const res = form.id
            ? await updateSkill(form.id, payload)
            : await createSkill(payload);
        setSaving(false);
        if ('success' in res) {
            onToast(form.id ? 'Ferdighet oppdatert' : 'Ferdighet opprettet');
            setForm(null);
            load();
        } else {
            onError(res.error);
        }
    }

    async function handleDelete() {
        if (!deleteTarget) return;
        const res = await deleteSkill(deleteTarget.id);
        if ('success' in res) {
            onToast('Ferdighet slettet');
            setDeleteTarget(null);
            load();
        } else {
            onError(res.error);
        }
    }

    function renderNode(node: SkillNode, depth: number) {
        const hasChildren = node.children.length > 0;
        const isOpen = expanded.has(node.id);
        return (
            <div key={node.id} className={styles.treeNode}>
                <div className={styles.treeRow} style={{ paddingLeft: `${depth * 22 + 12}px` }}>
                    <button
                        type="button"
                        className={styles.treeToggle}
                        onClick={() => hasChildren && toggle(node.id)}
                        aria-label={hasChildren ? (isOpen ? 'Skjul' : 'Vis') : 'Ingen underferdigheter'}
                        style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
                    >
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                    <div className={styles.treeMain}>
                        <span className={styles.treeName}>{node.name}</span>
                        {node.category && <span className={styles.treeCategory}>{node.category}</span>}
                    </div>
                    <div className={styles.treeMeta}>
                        <span className={styles.metaPill} title="Maks nivå">
                            <Award size={12} /> {node.maxLevel}
                        </span>
                        <span className={styles.metaPill} title="Koblede kurs">
                            <BookOpen size={12} /> {node.courseCount}
                        </span>
                        <span className={styles.metaPill} title="Brukere med ferdigheten">
                            <Users size={12} /> {node.userCount}
                        </span>
                    </div>
                    <div className={styles.treeActions}>
                        <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => openCreate(node.id)}
                            aria-label="Legg til underferdighet"
                            title="Legg til underferdighet"
                        >
                            <Plus size={15} />
                        </button>
                        <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => openEdit(node)}
                            aria-label="Rediger ferdighet"
                        >
                            <Edit3 size={15} />
                        </button>
                        <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                            onClick={() => setDeleteTarget(node)}
                            aria-label="Slett ferdighet"
                        >
                            <Trash2 size={15} />
                        </button>
                    </div>
                </div>
                {hasChildren && isOpen && (
                    <div className={styles.treeChildren}>
                        {node.children.map((c) => renderNode(c, depth + 1))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={styles.section}>
            <div className={styles.sectionToolbar}>
                <span className={styles.sectionCount}>{total} ferdigheter</span>
                <button type="button" className={styles.btnPrimary} onClick={() => openCreate()}>
                    <Plus size={16} /> Ny ferdighet
                </button>
            </div>

            {loading ? (
                <div className={styles.loading}>
                    <div className={styles.spinner} /> Laster ferdigheter...
                </div>
            ) : tree.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyIcon}><Award size={28} /></div>
                    <span className={styles.emptyTitle}>Ingen ferdigheter ennå</span>
                    <span className={styles.emptyText}>
                        Opprett din første ferdighet for å bygge kompetansetaksonomien.
                    </span>
                </div>
            ) : (
                <div className={styles.tree}>{tree.map((n) => renderNode(n, 0))}</div>
            )}

            {/* Create/Edit modal */}
            {form && (
                <div className={styles.modalOverlay} onClick={() => setForm(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>
                                {form.id ? 'Rediger ferdighet' : 'Ny ferdighet'}
                            </h2>
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
                                        placeholder="F.eks. TypeScript"
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
                                        rows={3}
                                    />
                                </div>
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Kategori</label>
                                        <input
                                            className={styles.formInput}
                                            type="text"
                                            value={form.category}
                                            onChange={(e) => setForm({ ...form, category: e.target.value })}
                                            placeholder="F.eks. Teknologi"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Maks nivå</label>
                                        <input
                                            className={styles.formInput}
                                            type="number"
                                            min={1}
                                            max={10}
                                            value={form.maxLevel}
                                            onChange={(e) =>
                                                setForm({ ...form, maxLevel: Number(e.target.value) || 5 })
                                            }
                                        />
                                    </div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Overordnet ferdighet</label>
                                    <select
                                        className={styles.formSelect}
                                        value={form.parentSkillId}
                                        onChange={(e) => setForm({ ...form, parentSkillId: e.target.value })}
                                    >
                                        <option value="">Ingen (toppnivå)</option>
                                        {flatParents
                                            .filter((p) => p.id !== form.id)
                                            .map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.label}
                                                </option>
                                            ))}
                                    </select>
                                </div>
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
                            <h2 className={styles.modalTitle}>Slett ferdighet</h2>
                            <button className={styles.iconBtn} onClick={() => setDeleteTarget(null)} aria-label="Lukk">
                                <X size={16} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <p className={styles.confirmText}>
                                Er du sikker på at du vil slette{' '}
                                <span className={styles.confirmHighlight}>{deleteTarget.name}</span>?
                            </p>
                            {deleteTarget.children.length > 0 && (
                                <p className={styles.confirmText}>
                                    Underferdighetene flyttes opp ett nivå (slettes ikke). Kurs- og
                                    brukerkoblinger for denne ferdigheten fjernes.
                                </p>
                            )}
                        </div>
                        <div className={styles.modalFooter}>
                            <button type="button" className={styles.btnSecondary} onClick={() => setDeleteTarget(null)}>
                                Avbryt
                            </button>
                            <button type="button" className={styles.btnDanger} onClick={handleDelete}>
                                Slett ferdighet
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// TAB 2: Kurs-kobling (course → skills + level)
// ══════════════════════════════════════════════════════════════

function CoursesTab({
    onToast,
    onError,
}: {
    onToast: (s: string) => void;
    onError: (s: string) => void;
}) {
    const [courses, setCourses] = useState<MappableCourse[]>([]);
    const [allSkills, setAllSkills] = useState<{ id: string; label: string; maxLevel: number }[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<string>('');
    const [items, setItems] = useState<CourseSkillItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingItems, setLoadingItems] = useState(false);
    const [saving, setSaving] = useState(false);
    const [addSkillId, setAddSkillId] = useState('');

    useEffect(() => {
        (async () => {
            setLoading(true);
            const [coursesRes, skillsRes] = await Promise.all([listMappableCourses(), listSkills()]);
            if ('courses' in coursesRes) setCourses(coursesRes.courses);
            else onError(coursesRes.error);
            if ('skills' in skillsRes) {
                const flat: { id: string; label: string; maxLevel: number }[] = [];
                const walk = (nodes: SkillNode[], depth: number) => {
                    for (const n of nodes) {
                        flat.push({ id: n.id, label: `${'— '.repeat(depth)}${n.name}`, maxLevel: n.maxLevel });
                        if (n.children.length) walk(n.children, depth + 1);
                    }
                };
                walk(skillsRes.skills, 0);
                setAllSkills(flat);
            } else {
                onError(skillsRes.error);
            }
            setLoading(false);
        })();
    }, [onError]);

    const loadCourseSkills = useCallback(
        async (courseId: string) => {
            setLoadingItems(true);
            const res = await getCourseSkills(courseId);
            if ('items' in res) setItems(res.items);
            else onError(res.error);
            setLoadingItems(false);
        },
        [onError]
    );

    function handleSelectCourse(courseId: string) {
        setSelectedCourse(courseId);
        setItems([]);
        if (courseId) loadCourseSkills(courseId);
    }

    function addSkill() {
        if (!addSkillId) return;
        if (items.some((i) => i.skillId === addSkillId)) return;
        const skill = allSkills.find((s) => s.id === addSkillId);
        if (!skill) return;
        setItems([
            ...items,
            { skillId: skill.id, skillName: skill.label.replace(/— /g, ''), level: 1, maxLevel: skill.maxLevel },
        ]);
        setAddSkillId('');
    }

    function updateLevel(skillId: string, level: number) {
        setItems(items.map((i) => (i.skillId === skillId ? { ...i, level } : i)));
    }

    function removeItem(skillId: string) {
        setItems(items.filter((i) => i.skillId !== skillId));
    }

    async function handleSave() {
        if (!selectedCourse) return;
        setSaving(true);
        const res = await setCourseSkills(
            selectedCourse,
            items.map((i) => ({ skillId: i.skillId, level: i.level }))
        );
        setSaving(false);
        if ('success' in res) onToast('Kurskoblinger lagret');
        else onError(res.error);
    }

    const availableToAdd = allSkills.filter((s) => !items.some((i) => i.skillId === s.id));

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} /> Laster kurs...
            </div>
        );
    }

    return (
        <div className={styles.section}>
            <div className={styles.formGroup} style={{ maxWidth: 420 }}>
                <label className={styles.formLabel}>Velg kurs</label>
                <select
                    className={styles.formSelect}
                    value={selectedCourse}
                    onChange={(e) => handleSelectCourse(e.target.value)}
                >
                    <option value="">— Velg et kurs —</option>
                    {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.title}
                        </option>
                    ))}
                </select>
            </div>

            {selectedCourse && (
                <>
                    {loadingItems ? (
                        <div className={styles.loading}>
                            <div className={styles.spinner} /> Laster ferdigheter...
                        </div>
                    ) : (
                        <>
                            <div className={styles.mapAddRow}>
                                <select
                                    className={styles.formSelect}
                                    value={addSkillId}
                                    onChange={(e) => setAddSkillId(e.target.value)}
                                    disabled={availableToAdd.length === 0}
                                >
                                    <option value="">
                                        {availableToAdd.length === 0
                                            ? 'Alle ferdigheter er lagt til'
                                            : '— Legg til ferdighet —'}
                                    </option>
                                    {availableToAdd.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.label}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className={styles.btnSecondary}
                                    onClick={addSkill}
                                    disabled={!addSkillId}
                                >
                                    <Plus size={15} /> Legg til
                                </button>
                            </div>

                            {items.length === 0 ? (
                                <div className={styles.empty}>
                                    <div className={styles.emptyIcon}><GitBranch size={28} /></div>
                                    <span className={styles.emptyTitle}>Ingen ferdigheter koblet</span>
                                    <span className={styles.emptyText}>
                                        Legg til ferdigheter dette kurset gir, med nivået kurset oppnår.
                                    </span>
                                </div>
                            ) : (
                                <div className={styles.mapList}>
                                    {items.map((it) => (
                                        <div key={it.skillId} className={styles.mapRow}>
                                            <span className={styles.mapSkillName}>{it.skillName}</span>
                                            <div className={styles.levelControl}>
                                                <span className={styles.levelLabel}>Nivå</span>
                                                <select
                                                    className={styles.levelSelect}
                                                    value={it.level}
                                                    onChange={(e) =>
                                                        updateLevel(it.skillId, Number(e.target.value))
                                                    }
                                                >
                                                    {Array.from({ length: it.maxLevel }, (_, i) => i + 1).map(
                                                        (lvl) => (
                                                            <option key={lvl} value={lvl}>
                                                                {lvl} / {it.maxLevel}
                                                            </option>
                                                        )
                                                    )}
                                                </select>
                                            </div>
                                            <button
                                                type="button"
                                                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                                onClick={() => removeItem(it.skillId)}
                                                aria-label="Fjern ferdighet"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className={styles.sectionFooter}>
                                <button
                                    type="button"
                                    className={styles.btnPrimary}
                                    onClick={handleSave}
                                    disabled={saving}
                                >
                                    <Save size={16} /> {saving ? 'Lagrer...' : 'Lagre koblinger'}
                                </button>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// TAB 3: Kompetansematrise (users × skills grid)
// ══════════════════════════════════════════════════════════════

function MatrixTab({ onError }: { onError: (s: string) => void }) {
    const [matrix, setMatrix] = useState<TeamMatrix | null>(null);
    const [loading, setLoading] = useState(true);
    const [groupId, setGroupId] = useState<string>('');

    const load = useCallback(
        async (gid?: string) => {
            setLoading(true);
            const res = await getTeamMatrix(gid || undefined);
            if ('error' in res) onError(res.error);
            else setMatrix(res);
            setLoading(false);
        },
        [onError]
    );

    useEffect(() => {
        const t = setTimeout(() => load(), 0);
        return () => clearTimeout(t);
    }, [load]);

    function handleGroupChange(gid: string) {
        setGroupId(gid);
        load(gid);
    }

    return (
        <div className={styles.section}>
            <div className={styles.sectionToolbar}>
                <div className={styles.formGroup} style={{ maxWidth: 280, marginBottom: 0 }}>
                    <select
                        className={styles.formSelect}
                        value={groupId}
                        onChange={(e) => handleGroupChange(e.target.value)}
                    >
                        <option value="">Alle aktive brukere</option>
                        {matrix?.groups.map((g) => (
                            <option key={g.id} value={g.id}>
                                {g.name}
                            </option>
                        ))}
                    </select>
                </div>
                {matrix && (
                    <span className={styles.sectionCount}>
                        {matrix.users.length} brukere &middot; {matrix.skills.length} ferdigheter
                    </span>
                )}
            </div>

            {matrix?.capped && (
                <div className={styles.noticeBanner}>
                    <AlertTriangle size={14} />
                    Viser de første {matrix.users.length} av {matrix.userCount} brukere. Filtrer på en
                    gruppe for å se en mindre gruppe.
                </div>
            )}

            {loading ? (
                <div className={styles.loading}>
                    <div className={styles.spinner} /> Laster matrise...
                </div>
            ) : !matrix || matrix.users.length === 0 || matrix.skills.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyIcon}><Layers size={28} /></div>
                    <span className={styles.emptyTitle}>Ingen data å vise</span>
                    <span className={styles.emptyText}>
                        {matrix && matrix.skills.length === 0
                            ? 'Opprett ferdigheter for å bygge matrisen.'
                            : 'Ingen brukere matcher filteret.'}
                    </span>
                </div>
            ) : (
                <div className={styles.matrixWrap}>
                    <table className={styles.matrixTable}>
                        <thead>
                            <tr>
                                <th className={styles.matrixCorner}>Bruker</th>
                                {matrix.skills.map((s) => (
                                    <th key={s.id} className={styles.matrixSkillHead} title={s.name}>
                                        <span className={styles.matrixSkillName}>{s.name}</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {matrix.users.map((u) => (
                                <tr key={u.id}>
                                    <td className={styles.matrixUserCell}>
                                        <div className={styles.matrixUser}>
                                            <span className={styles.matrixUserName}>{u.name}</span>
                                            {u.department && (
                                                <span className={styles.matrixUserDept}>{u.department}</span>
                                            )}
                                        </div>
                                    </td>
                                    {matrix.skills.map((s) => {
                                        const lvl = u.levels[s.id] ?? 0;
                                        const has = lvl > 0;
                                        const ratio = has ? lvl / s.maxLevel : 0;
                                        return (
                                            <td key={s.id} className={styles.matrixCell}>
                                                {has ? (
                                                    <span
                                                        className={styles.levelChip}
                                                        style={{
                                                            background: `color-mix(in srgb, var(--color-accent-blue) ${Math.round(
                                                                15 + ratio * 45
                                                            )}%, transparent)`,
                                                        }}
                                                        title={`Nivå ${lvl} av ${s.maxLevel}`}
                                                    >
                                                        {lvl}
                                                    </span>
                                                ) : (
                                                    <span
                                                        className={styles.gapDash}
                                                        title="Mangler ferdighet"
                                                    >
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// TAB 4: Gap-analyse (pick a user → missing + recommended)
// ══════════════════════════════════════════════════════════════

function GapTab({
    onToast,
    onError,
}: {
    onToast: (s: string) => void;
    onError: (s: string) => void;
}) {
    const [users, setUsers] = useState<{ id: string; name: string; email: string | null }[]>([]);
    const [search, setSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);
    const [gap, setGap] = useState<SkillGapResult | null>(null);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [loadingGap, setLoadingGap] = useState(false);

    const loadUsers = useCallback(
        async (q?: string) => {
            setLoadingUsers(true);
            const res = await listSkillUsers(q);
            if ('users' in res) setUsers(res.users);
            else onError(res.error);
            setLoadingUsers(false);
        },
        [onError]
    );

    useEffect(() => {
        const t = setTimeout(() => loadUsers(search || undefined), 300);
        return () => clearTimeout(t);
    }, [search, loadUsers]);

    async function selectUser(u: { id: string; name: string }) {
        setSelectedUser(u);
        setLoadingGap(true);
        setGap(null);
        const res = await getUserSkillGap(u.id);
        if ('error' in res) onError(res.error);
        else setGap(res);
        setLoadingGap(false);
    }

    async function fillGap(skillId: string, level: number) {
        if (!selectedUser) return;
        const res = await setUserSkill(selectedUser.id, skillId, level, 'manual');
        if ('success' in res) {
            onToast('Ferdighet registrert');
            // reload gap
            const refreshed = await getUserSkillGap(selectedUser.id);
            if (!('error' in refreshed)) setGap(refreshed);
        } else {
            onError(res.error);
        }
    }

    return (
        <div className={styles.gapLayout}>
            {/* User picker */}
            <div className={styles.gapSidebar}>
                <div className={styles.searchBox}>
                    <Search size={15} className={styles.searchIcon} />
                    <input
                        className={styles.searchInput}
                        type="text"
                        placeholder="Søk etter bruker..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className={styles.userList}>
                    {loadingUsers ? (
                        <div className={styles.loadingSmall}>
                            <div className={styles.spinner} />
                        </div>
                    ) : users.length === 0 ? (
                        <span className={styles.emptyTextSmall}>Ingen brukere</span>
                    ) : (
                        users.map((u) => (
                            <button
                                key={u.id}
                                type="button"
                                className={`${styles.userItem} ${selectedUser?.id === u.id ? styles.userItemActive : ''}`}
                                onClick={() => selectUser({ id: u.id, name: u.name })}
                            >
                                <span className={styles.userItemName}>{u.name}</span>
                                {u.email && <span className={styles.userItemEmail}>{u.email}</span>}
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Gap result */}
            <div className={styles.gapMain}>
                {!selectedUser ? (
                    <div className={styles.empty}>
                        <div className={styles.emptyIcon}><TrendingUp size={28} /></div>
                        <span className={styles.emptyTitle}>Velg en bruker</span>
                        <span className={styles.emptyText}>
                            Velg en bruker til venstre for å se manglende ferdigheter og anbefalte kurs.
                        </span>
                    </div>
                ) : loadingGap ? (
                    <div className={styles.loading}>
                        <div className={styles.spinner} /> Analyserer...
                    </div>
                ) : gap ? (
                    <>
                        <h3 className={styles.gapHeading}>Gap-analyse for {selectedUser.name}</h3>

                        {gap.gaps.length === 0 ? (
                            <div className={styles.successCard}>
                                <CheckCircle size={18} />
                                Ingen kompetansegap. Brukeren oppfyller kravene for alle tildelte kurs.
                            </div>
                        ) : (
                            <div className={styles.gapSection}>
                                <span className={styles.gapSectionTitle}>
                                    Manglende ferdigheter ({gap.gaps.length})
                                </span>
                                <div className={styles.gapList}>
                                    {gap.gaps.map((g) => (
                                        <div key={g.skillId} className={styles.gapItem}>
                                            <div className={styles.gapItemMain}>
                                                <span className={styles.gapItemName}>{g.name}</span>
                                                {g.category && (
                                                    <span className={styles.treeCategory}>{g.category}</span>
                                                )}
                                            </div>
                                            <div className={styles.gapLevels}>
                                                <span className={styles.gapCurrentLevel}>
                                                    Nå: {g.currentLevel}
                                                </span>
                                                <ChevronRight size={14} className={styles.gapArrow} />
                                                <span className={styles.gapRequiredLevel}>
                                                    Krav: {g.requiredLevel} / {g.maxLevel}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                className={styles.btnGhost}
                                                onClick={() => fillGap(g.skillId, g.requiredLevel)}
                                                title="Registrer ferdighet på kravnivå (manuell vurdering)"
                                            >
                                                <Award size={14} /> Godkjenn nivå {g.requiredLevel}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {gap.recommendedCourses.length > 0 && (
                            <div className={styles.gapSection}>
                                <span className={styles.gapSectionTitle}>
                                    Anbefalte kurs ({gap.recommendedCourses.length})
                                </span>
                                <div className={styles.recList}>
                                    {gap.recommendedCourses.map((c) => (
                                        <Link
                                            key={c.courseId}
                                            href={`/admin/courses/${c.courseId}`}
                                            className={styles.recCard}
                                        >
                                            <div className={styles.recMain}>
                                                <span className={styles.recTitle}>
                                                    <BookOpen size={15} /> {c.title}
                                                </span>
                                                <div className={styles.recSkills}>
                                                    {c.coversSkills.map((s) => (
                                                        <span key={s.skillId} className={styles.recSkillTag}>
                                                            {s.name} (nivå {s.level})
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <ChevronRight size={16} className={styles.recArrow} />
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                ) : null}
            </div>
        </div>
    );
}
