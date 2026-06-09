'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
    Library, FolderTree, Image as ImageIcon, Video, Music, FileText, File,
    Upload, Search, Trash2, X, CheckCircle, AlertTriangle, Filter,
    ChevronRight, BookOpen, Layers, Loader2, ExternalLink,
} from 'lucide-react';
import styles from './content.module.css';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
    listMediaAssets, deleteMediaAsset, searchLessons, getMediaStats,
    type MediaAssetItem, type MediaStats, type ContentOverview, type LessonSearchResult,
} from '@/app/actions/contentActions';
import type { MediaKind } from '@prisma/client';

// ── Helpers ─────────────────────────────────────────────────

const KIND_LABELS: Record<MediaKind, string> = {
    IMAGE: 'Bilder',
    VIDEO: 'Video',
    AUDIO: 'Lyd',
    DOCUMENT: 'Dokumenter',
    OTHER: 'Annet',
};

const KIND_FILTERS: { value: MediaKind | 'ALL'; label: string }[] = [
    { value: 'ALL', label: 'Alle' },
    { value: 'IMAGE', label: 'Bilder' },
    { value: 'VIDEO', label: 'Video' },
    { value: 'AUDIO', label: 'Lyd' },
    { value: 'DOCUMENT', label: 'Dokumenter' },
    { value: 'OTHER', label: 'Annet' },
];

function kindIcon(kind: MediaKind, size = 20) {
    switch (kind) {
        case 'IMAGE':
            return <ImageIcon size={size} />;
        case 'VIDEO':
            return <Video size={size} />;
        case 'AUDIO':
            return <Music size={size} />;
        case 'DOCUMENT':
            return <FileText size={size} />;
        default:
            return <File size={size} />;
    }
}

function formatBytes(bytes: number | null): string {
    if (bytes === null || bytes === undefined) return '–';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(d: Date | string) {
    return new Date(d).toLocaleDateString('nb-NO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

const LESSON_TYPE_LABELS: Record<string, string> = {
    STANDARD: 'Standard',
    QUIZ: 'Quiz',
    DOCUMENT: 'Dokument',
    VIDEO: 'Video',
    EMBED: 'Innbygging',
    SCORM_PACKAGE: 'SCORM',
};

// ── Props ───────────────────────────────────────────────────

interface ContentClientProps {
    initialAssets: MediaAssetItem[];
    initialMediaStats: MediaStats;
    initialOverview: ContentOverview;
}

type Tab = 'media' | 'courses';

export default function ContentClient({
    initialAssets,
    initialMediaStats,
    initialOverview,
}: ContentClientProps) {
    const [tab, setTab] = useState<Tab>('media');
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // ── Media state ──
    const [assets, setAssets] = useState<MediaAssetItem[]>(initialAssets);
    const [mediaStats, setMediaStats] = useState<MediaStats>(initialMediaStats);
    const [search, setSearch] = useState('');
    const [kindFilter, setKindFilter] = useState<MediaKind | 'ALL'>('ALL');
    const [mediaLoading, setMediaLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<MediaAssetItem | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Course overview state ──
    const overview = initialOverview;
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [lessonSearch, setLessonSearch] = useState('');
    const [lessonResults, setLessonResults] = useState<LessonSearchResult[]>([]);
    const [lessonSearching, setLessonSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // ── Toast auto-dismiss ──
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // ── Media search + filter (debounced server fetch) ──
    const refreshAssets = useCallback(
        async (q: string, kind: MediaKind | 'ALL') => {
            setMediaLoading(true);
            const result = await listMediaAssets({
                search: q || undefined,
                kind: kind === 'ALL' ? undefined : kind,
            });
            if ('assets' in result) {
                setAssets(result.assets);
            } else {
                setError(result.error);
            }
            setMediaLoading(false);
        },
        []
    );

    useEffect(() => {
        const timer = setTimeout(() => {
            refreshAssets(search, kindFilter);
        }, 300);
        return () => clearTimeout(timer);
    }, [search, kindFilter, refreshAssets]);

    // ── Upload handler ──
    async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'media');

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Opplastingsfeil');
            } else {
                setToast('Mediefil ble lastet opp');
                // Refresh both list and stats from the server (tenant-scoped).
                await refreshAssets(search, kindFilter);
                const statsResult = await getMediaStats();
                if (!('error' in statsResult)) {
                    setMediaStats(statsResult);
                }
            }
        } catch {
            setError('Opplastingsfeil');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    // ── Delete handler ──
    async function handleDelete() {
        if (!deleteTarget) return;
        const result = await deleteMediaAsset(deleteTarget.id);
        if ('success' in result) {
            setToast('Mediefil ble slettet');
            await refreshAssets(search, kindFilter);
            const statsResult = await getMediaStats();
            if (!('error' in statsResult)) {
                setMediaStats(statsResult);
            }
        } else {
            setError(result.error);
        }
        setDeleteTarget(null);
    }

    // ── Expand / collapse course nodes ──
    function toggleExpand(id: string) {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    // ── Lesson search (debounced) ──
    useEffect(() => {
        const term = lessonSearch.trim();
        if (term.length < 2) {
            setLessonResults([]);
            setHasSearched(false);
            return;
        }
        const timer = setTimeout(async () => {
            setLessonSearching(true);
            setHasSearched(true);
            const result = await searchLessons(term);
            if ('results' in result) {
                setLessonResults(result.results);
            } else {
                setError(result.error);
            }
            setLessonSearching(false);
        }, 350);
        return () => clearTimeout(timer);
    }, [lessonSearch]);

    // ── Render ──
    return (
        <div className={styles.contentPage}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Innhold</h1>
                    <p className={styles.subtitle}>
                        Mediebibliotek og oversikt over kursinnhold i organisasjonen
                    </p>
                </div>
                {tab === 'media' && (
                    <>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className={styles.hiddenInput}
                            onChange={handleFileSelected}
                            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                        />
                        <button
                            className={styles.primaryButton}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                        >
                            {uploading ? (
                                <Loader2 size={18} className={styles.spin} />
                            ) : (
                                <Upload size={18} />
                            )}
                            {uploading ? 'Laster opp…' : 'Last opp mediefil'}
                        </button>
                    </>
                )}
            </div>

            {/* Tabs */}
            <div className={styles.tabs} role="tablist">
                <button
                    role="tab"
                    aria-selected={tab === 'media'}
                    className={`${styles.tab} ${tab === 'media' ? styles.tabActive : ''}`}
                    onClick={() => setTab('media')}
                >
                    <Library size={16} />
                    Mediebibliotek
                </button>
                <button
                    role="tab"
                    aria-selected={tab === 'courses'}
                    className={`${styles.tab} ${tab === 'courses' ? styles.tabActive : ''}`}
                    onClick={() => setTab('courses')}
                >
                    <FolderTree size={16} />
                    Kursinnhold
                </button>
            </div>

            {/* Error */}
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

            {/* ── MEDIA TAB ─────────────────────────────── */}
            {tab === 'media' && (
                <>
                    <div className={styles.statsRow}>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Totalt</span>
                            <span className={styles.statValue}>{mediaStats.total}</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Bilder</span>
                            <span className={styles.statValue}>{mediaStats.byKind.IMAGE}</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Video</span>
                            <span className={styles.statValue}>{mediaStats.byKind.VIDEO}</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Lyd</span>
                            <span className={styles.statValue}>{mediaStats.byKind.AUDIO}</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Dokumenter</span>
                            <span className={styles.statValue}>{mediaStats.byKind.DOCUMENT}</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Total størrelse</span>
                            <span className={styles.statValue}>{formatBytes(mediaStats.totalSizeBytes)}</span>
                        </div>
                    </div>

                    <div className={styles.toolbar}>
                        <div className={styles.searchBox}>
                            <Search size={16} className={styles.searchIcon} />
                            <input
                                className={styles.searchInput}
                                type="text"
                                placeholder="Søk etter filnavn…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className={styles.filterGroup}>
                            <Filter size={16} className={styles.filterIcon} />
                            {KIND_FILTERS.map((f) => (
                                <button
                                    key={f.value}
                                    className={`${styles.filterChip} ${kindFilter === f.value ? styles.filterChipActive : ''}`}
                                    onClick={() => setKindFilter(f.value)}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {mediaLoading ? (
                        <div className={styles.loading}>
                            <Loader2 size={20} className={styles.spin} />
                            Laster mediefiler…
                        </div>
                    ) : assets.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>
                                <Library size={28} />
                            </div>
                            <span className={styles.emptyTitle}>
                                {search || kindFilter !== 'ALL' ? 'Ingen treff' : 'Ingen mediefiler ennå'}
                            </span>
                            <span className={styles.emptyText}>
                                {search || kindFilter !== 'ALL'
                                    ? 'Ingen mediefiler matcher søket eller filteret.'
                                    : 'Last opp bilder, video, lyd eller dokumenter for å bygge opp biblioteket.'}
                            </span>
                        </div>
                    ) : (
                        <div className={styles.mediaGrid}>
                            {assets.map((asset) => (
                                <div key={asset.id} className={styles.mediaCard}>
                                    <div className={styles.mediaThumb}>
                                        {asset.kind === 'IMAGE' ? (
                                            <img
                                                src={asset.url}
                                                alt={asset.filename}
                                                className={styles.mediaThumbImg}
                                            />
                                        ) : (
                                            <div className={`${styles.mediaThumbIcon} ${styles[`kind${asset.kind}`]}`}>
                                                {kindIcon(asset.kind, 32)}
                                            </div>
                                        )}
                                        <span className={`${styles.kindBadge} ${styles[`kind${asset.kind}`]}`}>
                                            {kindIcon(asset.kind, 12)}
                                            {KIND_LABELS[asset.kind]}
                                        </span>
                                    </div>
                                    <div className={styles.mediaBody}>
                                        <a
                                            href={asset.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={styles.mediaName}
                                            title={asset.filename}
                                        >
                                            {asset.filename}
                                        </a>
                                        <div className={styles.mediaMeta}>
                                            <span>{formatBytes(asset.sizeBytes)}</span>
                                            <span className={styles.metaDot} />
                                            <span>{formatDate(asset.createdAt)}</span>
                                        </div>
                                        {asset.uploaderName && (
                                            <span className={styles.mediaUploader}>
                                                Lastet opp av {asset.uploaderName}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        className={styles.mediaDelete}
                                        onClick={() => setDeleteTarget(asset)}
                                        aria-label={`Slett ${asset.filename}`}
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ── COURSES TAB ───────────────────────────── */}
            {tab === 'courses' && (
                <>
                    <div className={styles.statsRow}>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Aktive kurs</span>
                            <span className={styles.statValue}>{overview.totals.courses}</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Moduler</span>
                            <span className={styles.statValue}>{overview.totals.modules}</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Leksjoner</span>
                            <span className={styles.statValue}>{overview.totals.lessons}</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Innholdsblokker</span>
                            <span className={styles.statValue}>{overview.totals.blocks}</span>
                        </div>
                    </div>

                    {/* Lesson search */}
                    <div className={styles.toolbar}>
                        <div className={styles.searchBox}>
                            <Search size={16} className={styles.searchIcon} />
                            <input
                                className={styles.searchInput}
                                type="text"
                                placeholder="Søk i leksjoner på tvers av alle kurs…"
                                value={lessonSearch}
                                onChange={(e) => setLessonSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    {hasSearched && (
                        <div className={styles.searchResults}>
                            {lessonSearching ? (
                                <div className={styles.loading}>
                                    <Loader2 size={20} className={styles.spin} />
                                    Søker…
                                </div>
                            ) : lessonResults.length === 0 ? (
                                <div className={styles.emptyInline}>
                                    Ingen leksjoner matcher &laquo;{lessonSearch.trim()}&raquo;.
                                </div>
                            ) : (
                                <ul className={styles.resultList}>
                                    {lessonResults.map((r) => (
                                        <li key={r.lessonId}>
                                            <Link href={r.href} className={styles.resultItem}>
                                                <span className={styles.resultIcon}>
                                                    <FileText size={16} />
                                                </span>
                                                <span className={styles.resultMain}>
                                                    <span className={styles.resultLesson}>{r.lessonTitle}</span>
                                                    <span className={styles.resultPath}>
                                                        {r.courseTitle} &rsaquo; {r.moduleTitle}
                                                    </span>
                                                </span>
                                                <span className={styles.resultMeta}>
                                                    {LESSON_TYPE_LABELS[r.lessonType] || r.lessonType} ·{' '}
                                                    {r.blockCount} blokker
                                                </span>
                                                <ExternalLink size={14} className={styles.resultExternal} />
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* Course tree */}
                    {overview.courses.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>
                                <BookOpen size={28} />
                            </div>
                            <span className={styles.emptyTitle}>Ingen aktive kurs</span>
                            <span className={styles.emptyText}>
                                Opprett kurs for å se innholdsstrukturen her.
                            </span>
                        </div>
                    ) : (
                        <div className={styles.tree}>
                            {overview.courses.map((course) => {
                                const courseExpanded = expanded.has(course.courseId);
                                return (
                                    <div key={course.courseId} className={styles.treeCourse}>
                                        <div className={styles.treeCourseHeader}>
                                            <button
                                                className={styles.treeToggle}
                                                onClick={() => toggleExpand(course.courseId)}
                                                aria-expanded={courseExpanded}
                                                aria-label={courseExpanded ? 'Skjul moduler' : 'Vis moduler'}
                                                disabled={course.moduleCount === 0}
                                            >
                                                <ChevronRight
                                                    size={18}
                                                    className={`${styles.chevron} ${courseExpanded ? styles.chevronOpen : ''}`}
                                                />
                                                <BookOpen size={18} className={styles.treeCourseIcon} />
                                                <span className={styles.treeCourseTitle}>{course.title}</span>
                                                {!course.hasPublishedVersion && (
                                                    <span className={styles.draftBadge}>Utkast</span>
                                                )}
                                            </button>
                                            <div className={styles.treeCounts}>
                                                <span className={styles.countPill}>
                                                    <Layers size={12} /> {course.moduleCount} moduler
                                                </span>
                                                <span className={styles.countPill}>
                                                    <FileText size={12} /> {course.lessonCount} leksjoner
                                                </span>
                                                <span className={styles.countPill}>
                                                    {course.blockCount} blokker
                                                </span>
                                                <Link
                                                    href={`/admin/courses/${course.courseId}`}
                                                    className={styles.openLink}
                                                >
                                                    Åpne <ExternalLink size={13} />
                                                </Link>
                                            </div>
                                        </div>

                                        {courseExpanded && (
                                            <div className={styles.treeModules}>
                                                {course.modules.length === 0 ? (
                                                    <div className={styles.emptyInline}>
                                                        Ingen moduler i denne versjonen.
                                                    </div>
                                                ) : (
                                                    course.modules.map((m) => {
                                                        const moduleKey = `${course.courseId}:${m.id}`;
                                                        const moduleExpanded = expanded.has(moduleKey);
                                                        return (
                                                            <div key={m.id} className={styles.treeModule}>
                                                                <button
                                                                    className={styles.treeModuleHeader}
                                                                    onClick={() => toggleExpand(moduleKey)}
                                                                    aria-expanded={moduleExpanded}
                                                                    disabled={m.lessonCount === 0}
                                                                >
                                                                    <ChevronRight
                                                                        size={16}
                                                                        className={`${styles.chevron} ${moduleExpanded ? styles.chevronOpen : ''}`}
                                                                    />
                                                                    <Layers size={15} className={styles.treeModuleIcon} />
                                                                    <span className={styles.treeModuleTitle}>
                                                                        {m.position}. {m.title}
                                                                    </span>
                                                                    <span className={styles.treeModuleMeta}>
                                                                        {m.lessonCount} leksjoner · {m.blockCount} blokker
                                                                    </span>
                                                                </button>
                                                                {moduleExpanded && (
                                                                    <ul className={styles.treeLessons}>
                                                                        {m.lessons.map((l) => (
                                                                            <li key={l.id} className={styles.treeLesson}>
                                                                                <FileText size={14} className={styles.treeLessonIcon} />
                                                                                <span className={styles.treeLessonTitle}>
                                                                                    {l.position}. {l.title}
                                                                                </span>
                                                                                <span className={styles.treeLessonType}>
                                                                                    {LESSON_TYPE_LABELS[l.lessonType] || l.lessonType}
                                                                                </span>
                                                                                <span className={styles.treeLessonBlocks}>
                                                                                    {l.blockCount} blokker
                                                                                </span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* ── Delete confirm ───────────────────────── */}
            <ConfirmDialog
                open={deleteTarget !== null}
                title="Slett mediefil"
                description={
                    deleteTarget
                        ? `Er du sikker på at du vil slette "${deleteTarget.filename}"? Dette kan ikke angres.`
                        : ''
                }
                confirmText="Slett"
                cancelText="Avbryt"
                variant="danger"
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
            />

            {/* ── Toast ─────────────────────────────────── */}
            {toast && (
                <div className={styles.toast}>
                    <CheckCircle size={16} />
                    {toast}
                </div>
            )}
        </div>
    );
}
