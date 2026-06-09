'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    Search, Plus, BookOpen, Eye, EyeOff, Archive,
    MoreVertical, Trash2, X, CheckCircle, AlertTriangle,
    Filter, Clock, Users, Layers, GraduationCap, Lock,
    BookMarked, Tag, FolderOpen, RotateCcw,
} from 'lucide-react';
import styles from './courses.module.css';
import { sanitizeHtml } from '@/lib/sanitize';
import {
    listCourses, createCourse, deleteCourse, archiveCourse, restoreCourse,
    createCategory, deleteCategory, createTag, deleteTag,
    type CourseListItem, type CategoryItem, type TagItem,
} from '@/app/actions/courseActions';
import type { CourseVisibility, CourseDifficulty } from '@prisma/client';
import { RichTextEditor } from '@/components/LexicalEditor';

// ── Helpers ─────────────────────────────────────────────────

const VISIBILITY_LABELS: Record<string, string> = {
    DRAFT_ONLY: 'Utkast',
    INTERNAL: 'Intern',
    PUBLIC: 'Offentlig',
};

const DIFFICULTY_LABELS: Record<string, string> = {
    BEGINNER: 'Nybegynner',
    INTERMEDIATE: 'Middels',
    ADVANCED: 'Avansert',
};

function getVisibilityIcon(visibility: string) {
    if (visibility === 'DRAFT_ONLY') return <EyeOff size={12} />;
    if (visibility === 'PUBLIC') return <Eye size={12} />;
    return <Eye size={12} />;
}

function formatDate(d: Date) {
    return new Date(d).toLocaleDateString('nb-NO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

// ── Stats ───────────────────────────────────────────────────

interface StatsProps {
    total: number;
    published: number;
    draft: number;
    archived: number;
}

// ── Main component ──────────────────────────────────────────

interface CoursesClientProps {
    initialCourses: CourseListItem[];
    stats: StatsProps;
    categories: CategoryItem[];
    tags: TagItem[];
}

export default function CoursesClient({ initialCourses, stats, categories: initialCategories, tags: initialTags }: CoursesClientProps) {
    const [courses, setCourses] = useState<CourseListItem[]>(initialCourses);
    const [categories, setCategories] = useState<CategoryItem[]>(initialCategories);
    const [tags, setTags] = useState<TagItem[]>(initialTags);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft' | 'archived'>('all');
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Modals
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<CourseListItem | null>(null);
    const [contextMenu, setContextMenu] = useState<string | null>(null);
    const [taxonomyOpen, setTaxonomyOpen] = useState(false);
    const [newCourseDescription, setNewCourseDescription] = useState('');

    // ── Search ──────────────────────────────────────────────

    const refreshCourses = useCallback(async (q?: string) => {
        setLoading(true);
        const result = await listCourses(q);
        if ('courses' in result) {
            setCourses(result.courses);
        } else {
            setError(result.error);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            refreshCourses(search || undefined);
        }, 300);
        return () => clearTimeout(timer);
    }, [search, refreshCourses]);

    // Filter
    const filteredCourses = courses.filter((c) => {
        if (filterStatus === 'published') return c.hasPublishedVersion;
        if (filterStatus === 'draft') return !c.hasPublishedVersion && c.status === 'ACTIVE';
        if (filterStatus === 'archived') return c.status === 'ARCHIVED';
        return true;
    });

    // ── Toast ───────────────────────────────────────────────

    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // Close context menu on click outside
    useEffect(() => {
        if (contextMenu) {
            const handler = () => setContextMenu(null);
            document.addEventListener('click', handler);
            return () => document.removeEventListener('click', handler);
        }
    }, [contextMenu]);

    // ── Create handler ──────────────────────────────────────

    async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const title = form.get('title') as string;
        const description = form.get('description') as string;
        const visibility = form.get('visibility') as CourseVisibility;
        const difficulty = form.get('difficulty') as string;
        const estimatedMinutes = form.get('estimatedMinutes') as string;

        const result = await createCourse({
            title,
            description: description || undefined,
            visibility,
            difficulty: (difficulty || undefined) as CourseDifficulty | undefined,
            estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : undefined,
        });

        if ('success' in result) {
            setCreateOpen(false);
            setToast('Kurs opprettet');
            refreshCourses(search || undefined);
        } else {
            setError(result.error);
        }
    }

    // ── Archive / restore / delete handlers ─────────────────

    async function handleArchive(courseId: string) {
        const result = await archiveCourse(courseId);
        if ('success' in result) {
            setToast('Kurs ble arkivert');
            refreshCourses(search || undefined);
        } else {
            setError(result.error);
        }
        setContextMenu(null);
    }

    async function handleRestore(courseId: string) {
        const result = await restoreCourse(courseId);
        if ('success' in result) {
            setToast('Kurs ble gjenopprettet');
            refreshCourses(search || undefined);
        } else {
            setError(result.error);
        }
        setContextMenu(null);
    }

    async function handleDelete() {
        if (!deleteTarget) return;

        const result = await deleteCourse(deleteTarget.id);
        if ('success' in result) {
            setDeleteTarget(null);
            setToast('Kurs ble slettet');
            refreshCourses(search || undefined);
        } else {
            setError(result.error);
        }
    }

    // ── Category / Tag handlers ─────────────────────────────

    async function handleCreateCategory(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const name = form.get('categoryName') as string;
        const result = await createCategory({ name });
        if ('success' in result) {
            setToast('Kategori opprettet');
            // Refresh categories by re-fetching via server action
            const catResult = await import('@/app/actions/courseActions').then(m => m.listCategories());
            if ('categories' in catResult) setCategories(catResult.categories);
            (e.target as HTMLFormElement).reset();
        } else {
            setError(result.error);
        }
    }

    async function handleDeleteCategory(categoryId: string) {
        const result = await deleteCategory(categoryId);
        if ('success' in result) {
            setCategories((prev) => prev.filter((c) => c.id !== categoryId));
            setToast('Kategori slettet');
        } else {
            setError(result.error);
        }
    }

    async function handleCreateTag(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const label = form.get('tagLabel') as string;
        const result = await createTag({ label });
        if ('success' in result) {
            setToast('Tag opprettet');
            const tagResult = await import('@/app/actions/courseActions').then(m => m.listTags());
            if ('tags' in tagResult) setTags(tagResult.tags);
            (e.target as HTMLFormElement).reset();
        } else {
            setError(result.error);
        }
    }

    async function handleDeleteTag(tagId: string) {
        const result = await deleteTag(tagId);
        if ('success' in result) {
            setTags((prev) => prev.filter((t) => t.id !== tagId));
            setToast('Tag slettet');
        } else {
            setError(result.error);
        }
    }

    // ── Render ──────────────────────────────────────────────

    return (
        <div className={styles.coursesPage}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Kurs</h1>
                    <p className={styles.subtitle}>
                        Opprett og administrer kurs for organisasjonen
                    </p>
                </div>
                <div className={styles.headerActions}>
                    <button
                        className={styles.btnSecondary}
                        onClick={() => setTaxonomyOpen(true)}
                    >
                        <FolderOpen size={16} />
                        Kategorier & Tags
                    </button>
                    <button
                        className={styles.createButton}
                        onClick={() => setCreateOpen(true)}
                    >
                        <Plus size={18} />
                        Nytt kurs
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <button
                    className={`${styles.statCard} ${filterStatus === 'all' ? styles.statCardActive : ''}`}
                    onClick={() => setFilterStatus('all')}
                >
                    <span className={styles.statLabel}>Totalt</span>
                    <span className={styles.statValue}>{stats.total}</span>
                </button>
                <button
                    className={`${styles.statCard} ${filterStatus === 'published' ? styles.statCardActive : ''}`}
                    onClick={() => setFilterStatus(filterStatus === 'published' ? 'all' : 'published')}
                >
                    <span className={styles.statLabel}>Publisert</span>
                    <span className={styles.statValue}>{stats.published}</span>
                </button>
                <button
                    className={`${styles.statCard} ${filterStatus === 'draft' ? styles.statCardActive : ''}`}
                    onClick={() => setFilterStatus(filterStatus === 'draft' ? 'all' : 'draft')}
                >
                    <span className={styles.statLabel}>Utkast</span>
                    <span className={styles.statValue}>{stats.draft}</span>
                </button>
                <button
                    className={`${styles.statCard} ${filterStatus === 'archived' ? styles.statCardActive : ''}`}
                    onClick={() => setFilterStatus(filterStatus === 'archived' ? 'all' : 'archived')}
                >
                    <span className={styles.statLabel}>Arkivert</span>
                    <span className={styles.statValue}>{stats.archived}</span>
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className={styles.errorBanner}>
                    <AlertTriangle size={16} />
                    {error}
                    <button
                        className={styles.modalClose}
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
                        placeholder="Søk etter kurs..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Course Grid */}
            {loading ? (
                <div className={styles.loading}>
                    <div className={styles.spinner} />
                    Laster kurs...
                </div>
            ) : filteredCourses.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <BookOpen size={28} />
                    </div>
                    <span className={styles.emptyTitle}>
                        {search ? 'Ingen treff' : 'Ingen kurs ennå'}
                    </span>
                    <span className={styles.emptyText}>
                        {search
                            ? `Ingen kurs matcher "${search}"`
                            : 'Opprett ditt første kurs for å komme i gang.'}
                    </span>
                    {!search && (
                        <button
                            className={styles.createButton}
                            onClick={() => setCreateOpen(true)}
                        >
                            <Plus size={18} />
                            Opprett kurs
                        </button>
                    )}
                </div>
            ) : (
                <div className={styles.courseGrid}>
                    {filteredCourses.map((course) => (
                        <div key={course.id} className={styles.courseCard}>
                            <div className={styles.cardHeader}>
                                <div className={styles.cardBadges}>
                                    <span className={`${styles.visibilityBadge} ${styles[`visibility${course.visibility}`]}`}>
                                        {getVisibilityIcon(course.visibility)}
                                        {VISIBILITY_LABELS[course.visibility]}
                                    </span>
                                    {course.hasPublishedVersion && course.status !== 'ARCHIVED' && (
                                        <span className={styles.publishedBadge}>
                                            <CheckCircle size={12} />
                                            Publisert
                                        </span>
                                    )}
                                    {course.status === 'ARCHIVED' && (
                                        <span className={styles.archivedBadge}>
                                            <Archive size={12} />
                                            Arkivert
                                        </span>
                                    )}
                                    {course.isSystemTemplate && (
                                        <span className={styles.systemTemplateBadge}>
                                            <Lock size={12} />
                                            Systemkurs
                                        </span>
                                    )}
                                </div>
                                <div className={styles.cardMenu}>
                                    <button
                                        className={styles.menuButton}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setContextMenu(contextMenu === course.id ? null : course.id);
                                        }}
                                        aria-label="Kursvalg"
                                    >
                                        <MoreVertical size={16} />
                                    </button>
                                    {contextMenu === course.id && (
                                        <div className={styles.contextMenu} onClick={(e) => e.stopPropagation()}>
                                            <Link href={`/admin/courses/${course.id}`} className={styles.contextMenuItem}>
                                                <BookMarked size={14} />
                                                {course.isSystemTemplate ? 'Vis kurs' : 'Rediger kurs'}
                                            </Link>
                                            {!course.isSystemTemplate && (course.status === 'ACTIVE' ? (
                                                <button className={styles.contextMenuItem} onClick={() => handleArchive(course.id)}>
                                                    <Archive size={14} />
                                                    Arkiver
                                                </button>
                                            ) : (
                                                <button className={styles.contextMenuItem} onClick={() => handleRestore(course.id)}>
                                                    <RotateCcw size={14} />
                                                    Gjenopprett
                                                </button>
                                            ))}
                                            {!course.isSystemTemplate && (
                                                <button
                                                    className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
                                                    onClick={() => {
                                                        setDeleteTarget(course);
                                                        setContextMenu(null);
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                    Slett
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Link href={`/admin/courses/${course.id}`} className={styles.cardBody}>
                                <h3 className={styles.cardTitle}>{course.title}</h3>
                                {course.description && (
                                    <p className={styles.cardDescription} dangerouslySetInnerHTML={{ __html: sanitizeHtml(course.description) }} />
                                )}
                            </Link>

                            <div className={styles.cardMeta}>
                                {course.difficulty && (
                                    <span className={styles.metaItem}>
                                        <GraduationCap size={13} />
                                        {DIFFICULTY_LABELS[course.difficulty]}
                                    </span>
                                )}
                                <span className={styles.metaItem}>
                                    <Layers size={13} />
                                    {course.moduleCount} moduler
                                </span>
                                <span className={styles.metaItem}>
                                    <BookOpen size={13} />
                                    {course.lessonCount} leksjoner
                                </span>
                                {course.estimatedMinutes && (
                                    <span className={styles.metaItem}>
                                        <Clock size={13} />
                                        {course.estimatedMinutes} min
                                    </span>
                                )}
                                <span className={styles.metaItem}>
                                    <Users size={13} />
                                    {course.enrollmentCount} innmeldt
                                </span>
                            </div>

                            {(course.categories.length > 0 || course.tags.length > 0) && (
                                <div className={styles.cardTags}>
                                    {course.categories.map((cat) => (
                                        <span key={cat.id} className={styles.categoryBadge}>
                                            {cat.name}
                                        </span>
                                    ))}
                                    {course.tags.map((tag) => (
                                        <span key={tag.id} className={styles.tagBadge}>
                                            {tag.label}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className={styles.cardFooter}>
                                <span className={styles.dateText}>
                                    Oppdatert {formatDate(course.updatedAt)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Create Course Modal ────────────────────── */}
            {createOpen && (
                <div className={styles.modalOverlay} onClick={() => setCreateOpen(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Nytt kurs</h2>
                            <button
                                className={styles.modalClose}
                                onClick={() => setCreateOpen(false)}
                                aria-label="Lukk"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleCreate}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Kurstittel *</label>
                                    <input
                                        className={styles.formInput}
                                        type="text"
                                        name="title"
                                        required
                                        placeholder="F.eks. Introduksjon til prosjektledelse"
                                        autoFocus
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Beskrivelse</label>
                                    <RichTextEditor
                                        onChange={(html) => setNewCourseDescription(html)}
                                        minHeight={90}
                                        placeholder="Kort beskrivelse av kursets innhold..."
                                    />
                                    <input type="hidden" name="description" value={newCourseDescription} />
                                </div>
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Synlighet</label>
                                        <select className={styles.formSelect} name="visibility" defaultValue="DRAFT_ONLY">
                                            <option value="DRAFT_ONLY">Utkast (kun admin)</option>
                                            <option value="INTERNAL">Intern (innloggede)</option>
                                            <option value="PUBLIC">Offentlig</option>
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Vanskelighetsgrad</label>
                                        <select className={styles.formSelect} name="difficulty" defaultValue="">
                                            <option value="">Ikke spesifisert</option>
                                            <option value="BEGINNER">Nybegynner</option>
                                            <option value="INTERMEDIATE">Middels</option>
                                            <option value="ADVANCED">Avansert</option>
                                        </select>
                                    </div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Estimert tid (minutter)</label>
                                    <input
                                        className={styles.formInput}
                                        type="number"
                                        name="estimatedMinutes"
                                        min={1}
                                        placeholder="F.eks. 120"
                                    />
                                </div>
                            </div>
                            <div className={styles.modalFooter}>
                                <button
                                    type="button"
                                    className={styles.btnSecondary}
                                    onClick={() => setCreateOpen(false)}
                                >
                                    Avbryt
                                </button>
                                <button type="submit" className={styles.btnPrimary}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Plus size={16} />
                                        Opprett kurs
                                    </span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Delete confirm modal ───────────────────── */}
            {deleteTarget && (
                <div className={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Slett kurs</h2>
                            <button
                                className={styles.modalClose}
                                onClick={() => setDeleteTarget(null)}
                                aria-label="Lukk"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <p className={styles.confirmText}>
                                Er du sikker på at du vil slette{' '}
                                <span className={styles.confirmHighlight}>
                                    {deleteTarget.title}
                                </span>?
                            </p>
                            <p className={styles.confirmText}>
                                Alle versjoner, moduler, leksjoner og innhold blir permanent slettet.
                                Denne handlingen kan ikke angres.
                            </p>
                        </div>
                        <div className={styles.modalFooter}>
                            <button
                                type="button"
                                className={styles.btnSecondary}
                                onClick={() => setDeleteTarget(null)}
                            >
                                Avbryt
                            </button>
                            <button
                                type="button"
                                className={styles.btnDanger}
                                onClick={handleDelete}
                            >
                                Slett kurs
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Taxonomy (Categories & Tags) Modal ─────── */}
            {taxonomyOpen && (
                <div className={styles.modalOverlay} onClick={() => setTaxonomyOpen(false)}>
                    <div className={`${styles.modal} ${styles.modalWide}`} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Kategorier & Tags</h2>
                            <button
                                className={styles.modalClose}
                                onClick={() => setTaxonomyOpen(false)}
                                aria-label="Lukk"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            {/* Categories section */}
                            <div className={styles.taxonomySection}>
                                <h3 className={styles.taxonomyTitle}>
                                    <FolderOpen size={16} />
                                    Kategorier
                                </h3>
                                <form onSubmit={handleCreateCategory} className={styles.taxonomyForm}>
                                    <input
                                        className={styles.formInput}
                                        type="text"
                                        name="categoryName"
                                        placeholder="Ny kategori..."
                                        required
                                    />
                                    <button type="submit" className={styles.btnPrimary}>
                                        <Plus size={14} />
                                    </button>
                                </form>
                                <div className={styles.taxonomyList}>
                                    {categories.length === 0 ? (
                                        <p className={styles.taxonomyEmpty}>Ingen kategorier opprettet ennå</p>
                                    ) : (
                                        categories.map((cat) => (
                                            <div key={cat.id} className={styles.taxonomyItem}>
                                                <span className={styles.taxonomyItemName}>{cat.name}</span>
                                                <span className={styles.taxonomyItemCount}>{cat.courseCount} kurs</span>
                                                <button
                                                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                                    onClick={() => handleDeleteCategory(cat.id)}
                                                    aria-label="Slett kategori"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className={styles.formDivider} />

                            {/* Tags section */}
                            <div className={styles.taxonomySection}>
                                <h3 className={styles.taxonomyTitle}>
                                    <Tag size={16} />
                                    Tags
                                </h3>
                                <form onSubmit={handleCreateTag} className={styles.taxonomyForm}>
                                    <input
                                        className={styles.formInput}
                                        type="text"
                                        name="tagLabel"
                                        placeholder="Ny tag..."
                                        required
                                    />
                                    <button type="submit" className={styles.btnPrimary}>
                                        <Plus size={14} />
                                    </button>
                                </form>
                                <div className={styles.taxonomyList}>
                                    {tags.length === 0 ? (
                                        <p className={styles.taxonomyEmpty}>Ingen tags opprettet ennå</p>
                                    ) : (
                                        tags.map((tag) => (
                                            <div key={tag.id} className={styles.taxonomyItem}>
                                                <span className={styles.tagBadge}>{tag.label}</span>
                                                <span className={styles.taxonomyItemCount}>{tag.courseCount} kurs</span>
                                                <button
                                                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                                    onClick={() => handleDeleteTag(tag.id)}
                                                    aria-label="Slett tag"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button
                                type="button"
                                className={styles.btnSecondary}
                                onClick={() => setTaxonomyOpen(false)}
                            >
                                Lukk
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Toast ──────────────────────────────────── */}
            {toast && (
                <div className={styles.toast}>
                    <CheckCircle size={16} />
                    {toast}
                </div>
            )}
        </div>
    );
}
