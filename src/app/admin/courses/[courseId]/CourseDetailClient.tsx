'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Save, Eye, EyeOff, BookOpen, Layers,
    Plus, Trash2, GripVertical, X, CheckCircle,
    AlertTriangle, Clock, Settings, FileText,
    ChevronDown, ChevronRight, Users, Lock,
    GraduationCap, Archive, Copy, RotateCcw,
} from 'lucide-react';
import styles from './courseDetail.module.css';
import {
    updateCourse, updateCourseCategories, updateCourseTags,
} from '@/app/actions/courseActions';
import {
    addModule, updateModule, deleteModule, reorderModules,
    addLesson, updateLesson, deleteLesson, reorderLessons,
    publishVersion, createNewVersion,
    getAssignmentRules, createAssignmentRule, deleteAssignmentRule,
    updateAssignmentRule, enrollUsersFromRule,
    duplicateModule, duplicateLesson, restoreVersion,
} from '@/app/actions/courseBuilderActions';
import { listUsers } from '@/app/actions/userActions';
import { listGroups } from '@/app/actions/groupActions';
import type { CourseVisibility, CourseDifficulty, LessonType, CompletionRule, GatingPolicy } from '@prisma/client';
import LessonBlockEditor from './LessonBlockEditor';
import { RichTextEditor } from '@/components/LexicalEditor';

// ── Types ───────────────────────────────────────────────────

interface LessonData {
    id: string;
    position: number;
    title: string;
    lessonType: LessonType;
    completionRule: CompletionRule;
    estimatedMinutes: number | null;
    isOptional: boolean;
    blockCount: number;
}

interface ModuleData {
    id: string;
    position: number;
    title: string;
    summary: string | null;
    gatingPolicy: GatingPolicy;
    lessons: LessonData[];
}

interface VersionData {
    id: string;
    versionNumber: number;
    state: string;
    changeLog: string | null;
    createdAt: Date;
    publishedAt: Date | null;
    moduleCount: number;
    modules: ModuleData[];
}

interface CourseData {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    visibility: CourseVisibility;
    status: string;
    difficulty: CourseDifficulty | null;
    thumbnailUrl: string | null;
    estimatedMinutes: number | null;
    defaultLocale: string;
    currentPublishedVersionId: string | null;
    isSystemTemplate: boolean;
    categories: { id: string; name: string; slug: string }[];
    tags: { id: string; label: string; slug: string }[];
    versions: VersionData[];
    enrollmentCount: number;
    createdAt: Date;
    updatedAt: Date;
}

type TabId = 'overview' | 'builder' | 'assignments' | 'versions';

const TABS: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Oversikt' },
    { id: 'builder', label: 'Kursbygger' },
    { id: 'assignments', label: 'Tildeling' },
    { id: 'versions', label: 'Versjoner' },
];

interface AssignmentRuleData {
    id: string;
    scopeType: string;
    scopeRefId: string | null;
    dueAt: Date | null;
    isMandatory: boolean;
    recertIntervalDays: number | null;
    state: string;
    createdAt: Date;
    _count: { enrollments: number };
}

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

const ROLE_LABELS: Record<string, string> = {
    USER: 'Vanlig bruker',
    TENANT_ADMIN: 'Organisasjonsadministrator',
    SYSTEM_ADMIN: 'Systemadministrator',
};

const LESSON_TYPE_LABELS: Record<string, string> = {
    STANDARD: 'Standard',
    QUIZ: 'Quiz',
    DOCUMENT: 'Dokument',
    VIDEO: 'Video',
    EMBED: 'Embed',
    SCORM_PACKAGE: 'SCORM',
};

function formatDate(d: Date) {
    return new Date(d).toLocaleDateString('nb-NO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

// ── Main component ──────────────────────────────────────────

interface CourseDetailClientProps {
    course: CourseData;
    allCategories: { id: string; name: string; slug: string }[];
    allTags: { id: string; label: string; slug: string }[];
}

export default function CourseDetailClient({ course, allCategories, allTags }: CourseDetailClientProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Overview form state
    const [title, setTitle] = useState(course.title);
    const [description, setDescription] = useState(course.description || '');
    const [visibility, setVisibility] = useState(course.visibility);
    const [difficulty, setDifficulty] = useState<CourseDifficulty | ''>(course.difficulty || '');
    const [estimatedMinutes, setEstimatedMinutes] = useState(course.estimatedMinutes?.toString() || '');
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(course.categories.map((c) => c.id));
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>(course.tags.map((t) => t.id));

    // Builder state — prefer DRAFT, fall back to current published version
    const draftVersion = course.versions.find((v) => v.state === 'DRAFT');
    const publishedVersion = course.versions.find((v) => v.id === course.currentPublishedVersionId);
    const activeBuilderVersion = draftVersion || publishedVersion;
    const isBuilderReadOnly = !draftVersion && !!publishedVersion;
    const [expandedModules, setExpandedModules] = useState<Set<string>>(
        new Set(activeBuilderVersion?.modules.map((m) => m.id) ?? [])
    );

    // Auto-estimate course duration from active version's lessons
    const autoEstimatedMinutes = activeBuilderVersion
        ? activeBuilderVersion.modules.reduce((total, mod) =>
            total + mod.lessons.reduce((sum, l) => sum + (l.estimatedMinutes ?? 0), 0), 0)
        : 0;

    // Add module/lesson modal state
    const [addModuleOpen, setAddModuleOpen] = useState(false);
    const [addLessonModuleId, setAddLessonModuleId] = useState<string | null>(null);
    const [editLessonData, setEditLessonData] = useState<{ moduleId: string; lesson: LessonData } | null>(null);

    // Block editor state
    const [blockEditorLesson, setBlockEditorLesson] = useState<{ id: string; title: string } | null>(null);

    // Assignment state
    const [assignmentRules, setAssignmentRules] = useState<AssignmentRuleData[]>([]);
    const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);
    const [addRuleOpen, setAddRuleOpen] = useState(false);
    const [ruleScopeType, setRuleScopeType] = useState<'ALL_USERS' | 'GROUP' | 'USER' | 'ROLE'>('ALL_USERS');
    const [scopeSearchQuery, setScopeSearchQuery] = useState('');
    const [scopeSearchResults, setScopeSearchResults] = useState<{ id: string; label: string }[]>([]);
    const [selectedScopeRefs, setSelectedScopeRefs] = useState<{ id: string; label: string }[]>([]);
    const [scopeSearching, setScopeSearching] = useState(false);

    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // Load assignments when tab is opened
    useEffect(() => {
        if (activeTab === 'assignments' && !assignmentsLoaded) {
            loadAssignments();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    async function loadAssignments() {
        const result = await getAssignmentRules(course.id);
        if ('success' in result) {
            setAssignmentRules(result.rules as AssignmentRuleData[]);
        }
        setAssignmentsLoaded(true);
    }

    // ── Assignment handlers ─────────────────────────────────

    async function handleScopeSearch(query: string) {
        setScopeSearchQuery(query);
        if (!query.trim() || ruleScopeType === 'ALL_USERS') {
            setScopeSearchResults([]);
            return;
        }
        setScopeSearching(true);
        try {
            if (ruleScopeType === 'USER') {
                const result = await listUsers(query);
                if ('users' in result) {
                    setScopeSearchResults(result.users.map(u => ({
                        id: u.id,
                        label: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id,
                    })));
                }
            } else if (ruleScopeType === 'GROUP') {
                const result = await listGroups(query);
                if ('groups' in result) {
                    setScopeSearchResults(result.groups.map(g => ({
                        id: g.id,
                        label: g.name,
                    })));
                }
            } else if (ruleScopeType === 'ROLE') {
                const roles = ['USER', 'TENANT_ADMIN', 'SYSTEM_ADMIN']
                    .filter(r => (ROLE_LABELS[r] || r).toLowerCase().includes(query.toLowerCase()));
                setScopeSearchResults(roles.map(r => ({ id: r, label: ROLE_LABELS[r] || r })));
            }
        } catch { /* ignore */ }
        setScopeSearching(false);
    }

    function handleSelectScopeRef(item: { id: string; label: string }) {
        if (!selectedScopeRefs.some(s => s.id === item.id)) {
            setSelectedScopeRefs(prev => [...prev, item]);
        }
        setScopeSearchQuery('');
        setScopeSearchResults([]);
    }

    function handleRemoveScopeRef(id: string) {
        setSelectedScopeRefs(prev => prev.filter(s => s.id !== id));
    }

    async function handleAddAssignment(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const dueAt = form.get('dueAt') as string;
        const isMandatory = form.get('isMandatory') === 'true';

        if (ruleScopeType === 'ALL_USERS') {
            const result = await createAssignmentRule(course.id, {
                scopeType: 'ALL_USERS',
                scopeRefId: null,
                dueAt: dueAt || null,
                isMandatory,
            });
            if ('success' in result) {
                setAddRuleOpen(false);
                setToast('Tildelingsregel opprettet');
                loadAssignments();
            } else {
                setError(result.error);
            }
        } else {
            // Create one rule per selected ref
            const refs = selectedScopeRefs.length > 0 ? selectedScopeRefs : [];
            if (refs.length === 0) {
                setError('Velg minst én referanse');
                return;
            }
            let successCount = 0;
            for (const ref of refs) {
                const result = await createAssignmentRule(course.id, {
                    scopeType: ruleScopeType,
                    scopeRefId: ref.id,
                    dueAt: dueAt || null,
                    isMandatory,
                });
                if ('success' in result) successCount++;
            }
            if (successCount > 0) {
                setAddRuleOpen(false);
                setToast(`${successCount} tildelingsregel(er) opprettet`);
                setSelectedScopeRefs([]);
                setScopeSearchQuery('');
                loadAssignments();
            }
        }
    }

    async function handleDeleteRule(ruleId: string) {
        const result = await deleteAssignmentRule(ruleId);
        if ('success' in result) {
            setToast('Tildelingsregel slettet');
            loadAssignments();
        } else {
            setError(result.error);
        }
    }

    async function handleToggleRuleState(ruleId: string, currentState: string) {
        const newState = currentState === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        const result = await updateAssignmentRule(ruleId, { state: newState as 'ACTIVE' | 'PAUSED' });
        if ('success' in result) {
            setToast(newState === 'ACTIVE' ? 'Regel aktivert' : 'Regel pauset');
            loadAssignments();
        } else {
            setError(result.error);
        }
    }

    async function handleEnrollFromRule(ruleId: string) {
        setSaving(true);
        const result = await enrollUsersFromRule(ruleId);
        if ('success' in result) {
            setToast(`${result.enrolled} brukere innmeldt`);
            loadAssignments();
        } else {
            setError(result.error);
        }
        setSaving(false);
    }

    // ── Overview save ───────────────────────────────────────

    async function handleSaveOverview() {
        setSaving(true);
        setError(null);

        const result = await updateCourse(course.id, {
            title: title.trim(),
            description: description.trim() || undefined,
            visibility,
            difficulty: difficulty || null,
            estimatedMinutes: estimatedMinutes
                ? parseInt(estimatedMinutes, 10)
                : (autoEstimatedMinutes > 0 ? autoEstimatedMinutes : null),
        });

        if ('success' in result) {
            // Update categories & tags
            await Promise.all([
                updateCourseCategories(course.id, selectedCategoryIds),
                updateCourseTags(course.id, selectedTagIds),
            ]);
            setToast('Kurs oppdatert');
            router.refresh();
        } else {
            setError(result.error);
        }

        setSaving(false);
    }

    // ── Builder handlers ────────────────────────────────────

    async function handleAddModule(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!draftVersion) return;
        const form = new FormData(e.currentTarget);
        const moduleTitle = form.get('moduleTitle') as string;

        const result = await addModule(draftVersion.id, { title: moduleTitle });
        if ('success' in result) {
            setAddModuleOpen(false);
            setToast('Modul lagt til');
            router.refresh();
        } else {
            setError(result.error);
        }
    }

    async function handleDeleteModule(moduleId: string) {
        const result = await deleteModule(moduleId);
        if ('success' in result) {
            setToast('Modul slettet');
            router.refresh();
        } else {
            setError(result.error);
        }
    }

    async function handleAddLesson(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!addLessonModuleId) return;
        const form = new FormData(e.currentTarget);
        const lessonTitle = form.get('lessonTitle') as string;
        const lessonType = form.get('lessonType') as LessonType;

        const result = await addLesson(addLessonModuleId, {
            title: lessonTitle,
            lessonType,
        });
        if ('success' in result) {
            setAddLessonModuleId(null);
            setToast('Leksjon lagt til');
            router.refresh();
        } else {
            setError(result.error);
        }
    }

    async function handleDeleteLesson(lessonId: string) {
        const result = await deleteLesson(lessonId);
        if ('success' in result) {
            setToast('Leksjon slettet');
            router.refresh();
        } else {
            setError(result.error);
        }
    }

    async function handleUpdateLesson(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!editLessonData) return;

        const form = new FormData(e.currentTarget);
        const lessonTitle = form.get('lessonTitle') as string;
        const lessonType = form.get('lessonType') as LessonType;
        const completionRule = form.get('completionRule') as CompletionRule;
        const est = form.get('estimatedMinutes') as string;
        const isOptional = form.get('isOptional') === 'true';

        const result = await updateLesson(editLessonData.lesson.id, {
            title: lessonTitle,
            lessonType,
            completionRule,
            estimatedMinutes: est ? parseInt(est, 10) : null,
            isOptional,
        });
        if ('success' in result) {
            setEditLessonData(null);
            setToast('Leksjon oppdatert');
            router.refresh();
        } else {
            setError(result.error);
        }
    }

    async function handlePublish() {
        if (!draftVersion) return;
        setSaving(true);
        const result = await publishVersion(draftVersion.id, course.id);
        if ('success' in result) {
            setToast('Versjon publisert');
            router.refresh();
        } else {
            setError(result.error);
        }
        setSaving(false);
    }

    async function handleCreateNewVersion() {
        setSaving(true);
        const result = await createNewVersion(course.id);
        if ('success' in result) {
            setToast('Ny versjon opprettet');
            router.refresh();
        } else {
            setError(result.error);
        }
        setSaving(false);
    }

    async function handleDuplicateModule(moduleId: string) {
        setSaving(true);
        const result = await duplicateModule(moduleId);
        if ('success' in result) {
            setToast('Modul duplisert');
            router.refresh();
        } else {
            setError(result.error);
        }
        setSaving(false);
    }

    async function handleDuplicateLesson(lessonId: string) {
        setSaving(true);
        const result = await duplicateLesson(lessonId);
        if ('success' in result) {
            setToast('Leksjon duplisert');
            router.refresh();
        } else {
            setError(result.error);
        }
        setSaving(false);
    }

    async function handleRestoreVersion(versionId: string) {
        setSaving(true);
        const result = await restoreVersion(versionId, course.id);
        if ('success' in result) {
            setToast('Versjon gjenopprettet som nytt utkast');
            router.refresh();
        } else {
            setError(result.error);
        }
        setSaving(false);
    }

    function toggleModule(moduleId: string) {
        setExpandedModules((prev) => {
            const next = new Set(prev);
            if (next.has(moduleId)) next.delete(moduleId);
            else next.add(moduleId);
            return next;
        });
    }

    // ── Render ──────────────────────────────────────────────

    return (
        <div className={styles.detailPage}>
            {/* System template banner */}
            {course.isSystemTemplate && (
                <div className={styles.systemTemplateBanner}>
                    <Lock size={16} />
                    <span>Dette er et systemkurs og kan ikke redigeres eller slettes.</span>
                </div>
            )}

            {/* Top bar */}
            <div className={styles.topBar}>
                <Link href="/admin/courses" className={styles.backLink}>
                    <ArrowLeft size={16} />
                    Tilbake til kurs
                </Link>
                <div className={styles.topBarActions}>
                    {course.status === 'ARCHIVED' && (
                        <span className={styles.archivedTag}>
                            <Archive size={14} />
                            Arkivert
                        </span>
                    )}
                    {activeTab === 'overview' && !course.isSystemTemplate && (
                        <button
                            className={styles.saveButton}
                            onClick={handleSaveOverview}
                            disabled={saving}
                        >
                            <Save size={16} />
                            {saving ? 'Lagrer...' : 'Lagre endringer'}
                        </button>
                    )}
                    {activeTab === 'builder' && draftVersion && !course.isSystemTemplate && (
                        <button
                            className={styles.publishButton}
                            onClick={handlePublish}
                            disabled={saving}
                        >
                            <Eye size={16} />
                            {saving ? 'Publiserer...' : 'Publiser versjon'}
                        </button>
                    )}
                </div>
            </div>

            {/* Course title */}
            <div className={styles.courseHeader}>
                <h1 className={styles.courseTitle}>{course.title}</h1>
                <div className={styles.courseMeta}>
                    <span className={styles.metaItem}>
                        <Users size={14} />
                        {course.enrollmentCount} innmeldt
                    </span>
                    <span className={styles.metaItem}>
                        <Clock size={14} />
                        Oppdatert {formatDate(course.updatedAt)}
                    </span>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className={styles.errorBanner}>
                    <AlertTriangle size={16} />
                    {error}
                    <button
                        className={styles.closeBtn}
                        onClick={() => setError(null)}
                        aria-label="Lukk feilmelding"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div className={styles.tabs}>
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── OVERVIEW TAB ────────────────────────────── */}
            {activeTab === 'overview' && (
                <div className={styles.tabContent}>
                    <div className={styles.formSection}>
                        <h2 className={styles.sectionTitle}>Grunnleggende informasjon</h2>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Kurstittel</label>
                            <input
                                className={styles.formInput}
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Beskrivelse</label>
                            <RichTextEditor
                                initialHtml={description}
                                onChange={(html) => setDescription(html)}
                                minHeight={120}
                                placeholder="Beskrivelse av kurset..."
                            />
                        </div>
                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Synlighet</label>
                                <select
                                    className={styles.formSelect}
                                    value={visibility}
                                    onChange={(e) => setVisibility(e.target.value as CourseVisibility)}
                                >
                                    <option value="DRAFT_ONLY">Utkast (kun admin)</option>
                                    <option value="INTERNAL">Intern (innloggede)</option>
                                    <option value="PUBLIC">Offentlig</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Vanskelighetsgrad</label>
                                <select
                                    className={styles.formSelect}
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value as CourseDifficulty | '')}
                                >
                                    <option value="">Ikke spesifisert</option>
                                    <option value="BEGINNER">Nybegynner</option>
                                    <option value="INTERMEDIATE">Middels</option>
                                    <option value="ADVANCED">Avansert</option>
                                </select>
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>
                                Estimert tid (minutter)
                                {autoEstimatedMinutes > 0 && (
                                    <span className={styles.autoEstimate}>
                                        — Beregnet fra leksjoner: {autoEstimatedMinutes} min
                                    </span>
                                )}
                            </label>
                            <input
                                className={styles.formInput}
                                type="number"
                                min={1}
                                value={estimatedMinutes}
                                onChange={(e) => setEstimatedMinutes(e.target.value)}
                                placeholder={autoEstimatedMinutes > 0 ? `${autoEstimatedMinutes} (automatisk)` : ''}
                            />
                        </div>
                    </div>

                    {/* Categories & Tags */}
                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Kategorier</label>
                            <div className={styles.pillGrid}>
                                {allCategories.map((cat) => {
                                    const isSelected = selectedCategoryIds.includes(cat.id);
                                    return (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            className={`${styles.pill} ${isSelected ? styles.pillSelected : ''}`}
                                            onClick={() => {
                                                if (isSelected) {
                                                    setSelectedCategoryIds(selectedCategoryIds.filter((id) => id !== cat.id));
                                                } else {
                                                    setSelectedCategoryIds([...selectedCategoryIds, cat.id]);
                                                }
                                            }}
                                        >
                                            {isSelected && <CheckCircle size={14} />}
                                            {cat.name}
                                        </button>
                                    );
                                })}
                                {allCategories.length === 0 && (
                                    <p className={styles.emptyHint}>Ingen kategorier opprettet.</p>
                                )}
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Tags</label>
                            <div className={styles.pillGrid}>
                                {allTags.map((tag) => {
                                    const isSelected = selectedTagIds.includes(tag.id);
                                    return (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            className={`${styles.pill} ${isSelected ? styles.pillSelected : ''}`}
                                            onClick={() => {
                                                if (isSelected) {
                                                    setSelectedTagIds(selectedTagIds.filter((id) => id !== tag.id));
                                                } else {
                                                    setSelectedTagIds([...selectedTagIds, tag.id]);
                                                }
                                            }}
                                        >
                                            {isSelected && <CheckCircle size={14} />}
                                            {tag.label}
                                        </button>
                                    );
                                })}
                                {allTags.length === 0 && (
                                    <p className={styles.emptyHint}>Ingen tags opprettet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── BUILDER TAB ─────────────────────────────── */}
            {activeTab === 'builder' && (
                <div className={styles.tabContent}>
                    {!activeBuilderVersion ? (
                        <div className={styles.emptyBuilder}>
                            <div className={styles.emptyIcon}>
                                <Layers size={28} />
                            </div>
                            <h3 className={styles.emptyTitle}>Ingen versjon</h3>
                            <p className={styles.emptyText}>
                                Opprett en ny versjon for å begynne å redigere kursinnholdet.
                            </p>
                            <button className={styles.saveButton} onClick={handleCreateNewVersion} disabled={saving}>
                                <Plus size={16} />
                                Opprett ny versjon
                            </button>
                        </div>
                    ) : (
                        <>
                            {isBuilderReadOnly && (
                                <div className={styles.readOnlyBanner}>
                                    <EyeOff size={16} />
                                    <span>Du ser på den publiserte versjonen (skrivebeskyttet). Opprett et nytt utkast for å redigere.</span>
                                    <button className={styles.btnPrimary} onClick={handleCreateNewVersion} disabled={saving}>
                                        <Plus size={14} />
                                        Nytt utkast
                                    </button>
                                </div>
                            )}
                            <div className={styles.builderHeader}>
                                <h2 className={styles.sectionTitle}>
                                    Versjon {activeBuilderVersion.versionNumber} — {isBuilderReadOnly ? 'Publisert' : 'Utkast'}
                                </h2>
                                {!isBuilderReadOnly && (
                                    <button className={styles.addModuleBtn} onClick={() => setAddModuleOpen(true)}>
                                        <Plus size={16} />
                                        Legg til modul
                                    </button>
                                )}
                            </div>

                            {activeBuilderVersion.modules.length === 0 ? (
                                <div className={styles.emptyBuilder}>
                                    <div className={styles.emptyIcon}>
                                        <BookOpen size={24} />
                                    </div>
                                    <p className={styles.emptyText}>
                                        Ingen moduler ennå. Legg til den første modulen for å starte.
                                    </p>
                                </div>
                            ) : (
                                <div className={styles.moduleList}>
                                    {activeBuilderVersion.modules
                                        .sort((a, b) => a.position - b.position)
                                        .map((mod, i) => (
                                            <div key={mod.id} className={styles.moduleCard}>
                                                <div
                                                    className={styles.moduleHeader}
                                                    onClick={() => toggleModule(mod.id)}
                                                >
                                                    <div className={styles.moduleHeaderLeft}>
                                                        <GripVertical size={16} className={styles.gripIcon} />
                                                        {expandedModules.has(mod.id) ? (
                                                            <ChevronDown size={16} />
                                                        ) : (
                                                            <ChevronRight size={16} />
                                                        )}
                                                        <span className={styles.modulePosition}>Modul {i + 1}</span>
                                                        <span className={styles.moduleTitle}>{mod.title}</span>
                                                    </div>
                                                    <div className={styles.moduleHeaderRight}>
                                                        <span className={styles.lessonCount}>
                                                            {mod.lessons.length} leksjoner
                                                        </span>
                                                        {!isBuilderReadOnly && (
                                                            <>
                                                                <button
                                                                    className={styles.iconBtn}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDuplicateModule(mod.id);
                                                                    }}
                                                                    aria-label="Dupliser modul"
                                                                    title="Dupliser modul"
                                                                >
                                                                    <Copy size={14} />
                                                                </button>
                                                                <button
                                                                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteModule(mod.id);
                                                                    }}
                                                                    aria-label="Slett modul"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {expandedModules.has(mod.id) && (
                                                    <div className={styles.moduleBody}>
                                                        {mod.lessons.length === 0 ? (
                                                            <p className={styles.emptyLessons}>
                                                                Ingen leksjoner i denne modulen.
                                                            </p>
                                                        ) : (
                                                            <div className={styles.lessonList}>
                                                                {mod.lessons
                                                                    .sort((a, b) => a.position - b.position)
                                                                    .map((lesson) => (
                                                                        <div
                                                                            key={lesson.id}
                                                                            className={styles.lessonItem}
                                                                            onClick={() => setBlockEditorLesson({ id: lesson.id, title: lesson.title })}
                                                                        >
                                                                            <GripVertical size={14} className={styles.gripIcon} />
                                                                            <FileText size={14} className={styles.lessonIcon} />
                                                                            <span className={styles.lessonTitle}>
                                                                                {lesson.title}
                                                                            </span>
                                                                            <span className={styles.lessonTypeBadge}>
                                                                                {LESSON_TYPE_LABELS[lesson.lessonType]}
                                                                            </span>
                                                                            <span className={styles.blockCountBadge}>
                                                                                {lesson.blockCount} blokker
                                                                            </span>
                                                                            {lesson.estimatedMinutes && (
                                                                                <span className={styles.lessonDuration}>
                                                                                    <Clock size={12} />
                                                                                    {lesson.estimatedMinutes} min
                                                                                </span>
                                                                            )}
                                                                            {lesson.isOptional && (
                                                                                <span className={styles.optionalBadge}>
                                                                                    Valgfri
                                                                                </span>
                                                                            )}
                                                                            {!isBuilderReadOnly && (
                                                                                <>
                                                                                    <button
                                                                                        className={styles.iconBtn}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleDuplicateLesson(lesson.id);
                                                                                        }}
                                                                                        aria-label="Dupliser leksjon"
                                                                                        title="Dupliser leksjon"
                                                                                    >
                                                                                        <Copy size={13} />
                                                                                    </button>
                                                                                    <button
                                                                                        className={styles.iconBtn}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setEditLessonData({ moduleId: mod.id, lesson });
                                                                                        }}
                                                                                        aria-label="Rediger innstillinger"
                                                                                    >
                                                                                        <Settings size={13} />
                                                                                    </button>
                                                                                    <button
                                                                                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleDeleteLesson(lesson.id);
                                                                                        }}
                                                                                        aria-label="Slett leksjon"
                                                                                    >
                                                                                        <Trash2 size={13} />
                                                                                    </button>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                            </div>
                                                        )}
                                                        {!isBuilderReadOnly && (
                                                            <button
                                                                className={styles.addLessonBtn}
                                                                onClick={() => setAddLessonModuleId(mod.id)}
                                                            >
                                                                <Plus size={14} />
                                                                Legg til leksjon
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ── VERSIONS TAB ────────────────────────────── */}
            {activeTab === 'versions' && (
                <div className={styles.tabContent}>
                    <div className={styles.builderHeader}>
                        <h2 className={styles.sectionTitle}>Versjonshistorikk</h2>
                        {!draftVersion && (
                            <button className={styles.addModuleBtn} onClick={handleCreateNewVersion} disabled={saving}>
                                <Plus size={16} />
                                Ny versjon
                            </button>
                        )}
                    </div>
                    {course.versions.length === 0 ? (
                        <div className={styles.emptyBuilder}>
                            <p className={styles.emptyText}>Ingen versjoner opprettet ennå.</p>
                        </div>
                    ) : (
                        <div className={styles.versionList}>
                            {course.versions.map((v) => (
                                <div
                                    key={v.id}
                                    className={`${styles.versionCard} ${v.id === course.currentPublishedVersionId ? styles.versionCardActive : ''}`}
                                >
                                    <div className={styles.versionHeader}>
                                        <span className={styles.versionNumber}>
                                            v{v.versionNumber}
                                        </span>
                                        <span className={`${styles.versionState} ${styles[`state${v.state}`]}`}>
                                            {v.state === 'DRAFT' ? 'Utkast' : v.state === 'PUBLISHED' ? 'Publisert' : 'Arkivert'}
                                        </span>
                                        {v.id === course.currentPublishedVersionId && (
                                            <span className={styles.currentBadge}>Gjeldende</span>
                                        )}
                                    </div>
                                    <div className={styles.versionMeta}>
                                        <span>{v.moduleCount} moduler</span>
                                        <span>Opprettet {formatDate(v.createdAt)}</span>
                                        {v.publishedAt && <span>Publisert {formatDate(v.publishedAt)}</span>}
                                    </div>
                                    {v.changeLog && (
                                        <p className={styles.versionChangelog}>{v.changeLog}</p>
                                    )}
                                    {v.state !== 'DRAFT' && !draftVersion && (
                                        <div className={styles.versionActions}>
                                            <button
                                                className={styles.btnSecondary}
                                                onClick={() => handleRestoreVersion(v.id)}
                                                disabled={saving}
                                            >
                                                <RotateCcw size={14} />
                                                Gjenopprett som nytt utkast
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── ASSIGNMENTS TAB ─────────────────────────── */}
            {activeTab === 'assignments' && (
                <div className={styles.tabContent}>
                    <div className={styles.builderHeader}>
                        <h2 className={styles.sectionTitle}>Tildelingsregler</h2>
                        <button className={styles.addModuleBtn} onClick={() => setAddRuleOpen(true)}>
                            <Plus size={16} />
                            Ny tildelingsregel
                        </button>
                    </div>

                    {!assignmentsLoaded ? (
                        <div className={styles.emptyBuilder}>
                            <p className={styles.emptyText}>Laster tildelinger...</p>
                        </div>
                    ) : assignmentRules.length === 0 ? (
                        <div className={styles.emptyBuilder}>
                            <div className={styles.emptyIcon}>
                                <Users size={28} />
                            </div>
                            <h3 className={styles.emptyTitle}>Ingen tildelingsregler</h3>
                            <p className={styles.emptyText}>
                                Opprett tildelingsregler for å tildele dette kurset til brukere, grupper eller roller.
                            </p>
                        </div>
                    ) : (
                        <div className={styles.assignmentList}>
                            {assignmentRules.map((rule) => (
                                <div key={rule.id} className={styles.assignmentCard}>
                                    <div className={styles.assignmentHeader}>
                                        <div className={styles.assignmentInfo}>
                                            <span className={styles.assignmentScope}>
                                                {rule.scopeType === 'ALL_USERS' ? 'Alle brukere' :
                                                 rule.scopeType === 'GROUP' ? 'Gruppe' :
                                                 rule.scopeType === 'USER' ? 'Bruker' : 'Rolle'}
                                            </span>
                                            {rule.scopeRefId && (
                                                <span className={styles.assignmentRef}>
                                                    {rule.scopeType === 'ROLE'
                                                        ? ROLE_LABELS[rule.scopeRefId] || rule.scopeRefId
                                                        : rule.scopeRefId.substring(0, 8) + '...'}
                                                </span>
                                            )}
                                        </div>
                                        <span className={`${styles.assignmentState} ${rule.state === 'ACTIVE' ? styles.stateActive : styles.statePaused}`}>
                                            {rule.state === 'ACTIVE' ? 'Aktiv' : rule.state === 'PAUSED' ? 'Pauset' : 'Arkivert'}
                                        </span>
                                    </div>
                                    <div className={styles.assignmentMeta}>
                                        {rule.isMandatory && (
                                            <span className={styles.mandatoryBadge}>Obligatorisk</span>
                                        )}
                                        <span>{rule._count.enrollments} innmeldte</span>
                                        {rule.dueAt && (
                                            <span>Frist: {formatDate(rule.dueAt)}</span>
                                        )}
                                        <span>Opprettet {formatDate(rule.createdAt)}</span>
                                    </div>
                                    <div className={styles.assignmentActions}>
                                        <button
                                            className={styles.btnSecondary}
                                            onClick={() => handleToggleRuleState(rule.id, rule.state)}
                                        >
                                            {rule.state === 'ACTIVE' ? 'Pause' : 'Aktiver'}
                                        </button>
                                        <button
                                            className={styles.btnPrimary}
                                            onClick={() => handleEnrollFromRule(rule.id)}
                                            disabled={saving || rule.state !== 'ACTIVE'}
                                        >
                                            <Users size={14} />
                                            Meld inn brukere
                                        </button>
                                        <button
                                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                            onClick={() => handleDeleteRule(rule.id)}
                                            aria-label="Slett regel"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Block Editor ───────────────────────────── */}
            {blockEditorLesson && (
                <LessonBlockEditor
                    lessonId={blockEditorLesson.id}
                    lessonTitle={blockEditorLesson.title}
                    isDraft={!isBuilderReadOnly}
                    onClose={() => setBlockEditorLesson(null)}
                    onBlockCountChange={() => router.refresh()}
                />
            )}

            {/* ── Add Module Modal ───────────────────────── */}
            {addModuleOpen && (
                <div className={styles.modalOverlay} onClick={() => setAddModuleOpen(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Ny modul</h2>
                            <button className={styles.closeBtn} onClick={() => setAddModuleOpen(false)} aria-label="Lukk">
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleAddModule}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Modultittel *</label>
                                    <input
                                        className={styles.formInput}
                                        type="text"
                                        name="moduleTitle"
                                        required
                                        placeholder="F.eks. Grunnleggende konsepter"
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.btnSecondary} onClick={() => setAddModuleOpen(false)}>
                                    Avbryt
                                </button>
                                <button type="submit" className={styles.btnPrimary}>
                                    <Plus size={16} />
                                    Legg til
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Add Lesson Modal ───────────────────────── */}
            {addLessonModuleId && (
                <div className={styles.modalOverlay} onClick={() => setAddLessonModuleId(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Ny leksjon</h2>
                            <button className={styles.closeBtn} onClick={() => setAddLessonModuleId(null)} aria-label="Lukk">
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleAddLesson}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Leksjontittel *</label>
                                    <input
                                        className={styles.formInput}
                                        type="text"
                                        name="lessonTitle"
                                        required
                                        placeholder="F.eks. Hva er prosjektledelse?"
                                        autoFocus
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Type</label>
                                    <select className={styles.formSelect} name="lessonType" defaultValue="STANDARD">
                                        <option value="STANDARD">Standard</option>
                                        <option value="VIDEO">Video</option>
                                        <option value="QUIZ">Quiz</option>
                                        <option value="DOCUMENT">Dokument</option>
                                        <option value="EMBED">Embed</option>
                                    </select>
                                </div>
                            </div>
                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.btnSecondary} onClick={() => setAddLessonModuleId(null)}>
                                    Avbryt
                                </button>
                                <button type="submit" className={styles.btnPrimary}>
                                    <Plus size={16} />
                                    Legg til
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Edit Lesson Modal ──────────────────────── */}
            {editLessonData && (
                <div className={styles.modalOverlay} onClick={() => setEditLessonData(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Rediger leksjon</h2>
                            <button className={styles.closeBtn} onClick={() => setEditLessonData(null)} aria-label="Lukk">
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateLesson}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Tittel</label>
                                    <input
                                        className={styles.formInput}
                                        type="text"
                                        name="lessonTitle"
                                        defaultValue={editLessonData.lesson.title}
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Type</label>
                                        <select className={styles.formSelect} name="lessonType" defaultValue={editLessonData.lesson.lessonType}>
                                            <option value="STANDARD">Standard</option>
                                            <option value="VIDEO">Video</option>
                                            <option value="QUIZ">Quiz</option>
                                            <option value="DOCUMENT">Dokument</option>
                                            <option value="EMBED">Embed</option>
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Fullføringsregel</label>
                                        <select className={styles.formSelect} name="completionRule" defaultValue={editLessonData.lesson.completionRule}>
                                            <option value="MANUAL_MARK">Manuell markering</option>
                                            <option value="VIEWED">Ved visning</option>
                                            <option value="ALL_BLOCKS">Alle blokker</option>
                                            <option value="QUIZ_PASS">Bestått quiz</option>
                                        </select>
                                    </div>
                                </div>
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Estimert tid (min)</label>
                                        <input
                                            className={styles.formInput}
                                            type="number"
                                            name="estimatedMinutes"
                                            min={1}
                                            defaultValue={editLessonData.lesson.estimatedMinutes ?? ''}
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Valgfri?</label>
                                        <select className={styles.formSelect} name="isOptional" defaultValue={editLessonData.lesson.isOptional ? 'true' : 'false'}>
                                            <option value="false">Obligatorisk</option>
                                            <option value="true">Valgfri</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.btnSecondary} onClick={() => setEditLessonData(null)}>
                                    Avbryt
                                </button>
                                <button type="submit" className={styles.btnPrimary}>
                                    Lagre endringer
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Add Assignment Rule Modal ──────────────── */}
            {addRuleOpen && (
                <div className={styles.modalOverlay} onClick={() => { setAddRuleOpen(false); setSelectedScopeRefs([]); setScopeSearchResults([]); setScopeSearchQuery(''); }}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Ny tildelingsregel</h2>
                            <button className={styles.closeBtn} onClick={() => { setAddRuleOpen(false); setSelectedScopeRefs([]); }} aria-label="Lukk">
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleAddAssignment}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Omfang *</label>
                                    <select
                                        className={styles.formSelect}
                                        value={ruleScopeType}
                                        onChange={(e) => {
                                            setRuleScopeType(e.target.value as typeof ruleScopeType);
                                            setSelectedScopeRefs([]);
                                            setScopeSearchResults([]);
                                            setScopeSearchQuery('');
                                        }}
                                    >
                                        <option value="ALL_USERS">Alle brukere</option>
                                        <option value="GROUP">Gruppe</option>
                                        <option value="USER">Enkeltbruker</option>
                                        <option value="ROLE">Rolle</option>
                                    </select>
                                </div>
                                {ruleScopeType === 'ROLE' && (
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Velg roller</label>
                                        <div className={styles.roleCheckboxes}>
                                            {['USER', 'TENANT_ADMIN', 'SYSTEM_ADMIN'].map((role) => (
                                                <label key={role} className={styles.roleCheckboxLabel}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedScopeRefs.some(s => s.id === role)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                handleSelectScopeRef({ id: role, label: ROLE_LABELS[role] || role });
                                                            } else {
                                                                handleRemoveScopeRef(role);
                                                            }
                                                        }}
                                                    />
                                                    <span>{ROLE_LABELS[role]}</span>
                                                </label>
                                            ))}
                                        </div>
                                        {selectedScopeRefs.length > 1 && (
                                            <p className={styles.roleHint}>Det opprettes én tildelingsregel per valgt rolle.</p>
                                        )}
                                    </div>
                                )}
                                {(ruleScopeType === 'USER' || ruleScopeType === 'GROUP') && (
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            {ruleScopeType === 'USER' ? 'Søk etter brukere' : 'Søk etter grupper'}
                                        </label>
                                        <div className={styles.scopeSearchWrapper}>
                                            <input
                                                className={styles.formInput}
                                                type="text"
                                                value={scopeSearchQuery}
                                                onChange={(e) => handleScopeSearch(e.target.value)}
                                                placeholder={
                                                    ruleScopeType === 'USER' ? 'Skriv navn eller e-post...' : 'Skriv gruppenavn...'
                                                }
                                                autoComplete="off"
                                            />
                                            {scopeSearchResults.length > 0 && (
                                                <div className={styles.scopeDropdown}>
                                                    {scopeSearchResults.map((item) => (
                                                        <button
                                                            key={item.id}
                                                            type="button"
                                                            className={`${styles.scopeDropdownItem} ${selectedScopeRefs.some(s => s.id === item.id) ? styles.scopeItemSelected : ''}`}
                                                            onClick={() => handleSelectScopeRef(item)}
                                                        >
                                                            {item.label}
                                                            {selectedScopeRefs.some(s => s.id === item.id) && (
                                                                <CheckCircle size={14} />
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {scopeSearching && (
                                                <div className={styles.scopeDropdown}>
                                                    <span className={styles.scopeDropdownItem}>Søker...</span>
                                                </div>
                                            )}
                                        </div>
                                        {selectedScopeRefs.length > 0 && (
                                            <div className={styles.selectedScopeChips}>
                                                {selectedScopeRefs.map((ref) => (
                                                    <span key={ref.id} className={styles.scopeChip}>
                                                        {ref.label}
                                                        <button
                                                            type="button"
                                                            className={styles.scopeChipRemove}
                                                            onClick={() => handleRemoveScopeRef(ref.id)}
                                                            aria-label="Fjern"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Frist</label>
                                        <input
                                            className={styles.formInput}
                                            type="date"
                                            name="dueAt"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Obligatorisk?</label>
                                        <select className={styles.formSelect} name="isMandatory" defaultValue="false">
                                            <option value="false">Valgfritt</option>
                                            <option value="true">Obligatorisk</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className={styles.modalFooter}>
                                <button type="button" className={styles.btnSecondary} onClick={() => { setAddRuleOpen(false); setSelectedScopeRefs([]); }}>
                                    Avbryt
                                </button>
                                <button type="submit" className={styles.btnPrimary}>
                                    <Plus size={16} />
                                    Opprett regel
                                </button>
                            </div>
                        </form>
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
