'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
    Search, SlidersHorizontal, BookOpen, Clock, CheckCircle2,
    AlertTriangle, ChevronRight, Target, Filter,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import styles from './myLearning.module.css';
import type { EnrollmentSummary } from '@/app/actions/learnerActions';

interface Props {
    items: EnrollmentSummary[];
    initialStatus: string | null;
    initialSort: string;
}

const STATUS_OPTIONS = [
    { value: '', label: 'Alle', icon: BookOpen },
    { value: 'IN_PROGRESS', label: 'Pågående', icon: Clock },
    { value: 'COMPLETED', label: 'Fullført', icon: CheckCircle2 },
    { value: 'NOT_STARTED', label: 'Ikke startet', icon: Target },
    { value: 'OVERDUE', label: 'Forfalt', icon: AlertTriangle },
];

const SORT_OPTIONS = [
    { value: 'lastActivityAt', label: 'Sist aktiv' },
    { value: 'dueAt', label: 'Frist' },
    { value: 'progress', label: 'Fremgang' },
    { value: 'enrolledAt', label: 'Meldt på' },
];

function ProgressBar({ percent }: { percent: number }) {
    return (
        <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
    );
}

export default function MyLearningClient({ items, initialStatus, initialSort }: Props) {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [activeStatus, setActiveStatus] = useState(initialStatus ?? '');
    const [activeSort, setActiveSort] = useState(initialSort);

    // Navigate with new params
    function updateParams(status: string, sort: string) {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (sort && sort !== 'lastActivityAt') params.set('sort', sort);
        const qs = params.toString();
        router.push(`/learn/my-learning${qs ? `?${qs}` : ''}`);
    }

    function handleStatusChange(status: string) {
        setActiveStatus(status);
        updateParams(status, activeSort);
    }

    function handleSortChange(sort: string) {
        setActiveSort(sort);
        updateParams(activeStatus, sort);
    }

    // Client-side search filter
    const filtered = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.filter((i) => i.courseTitle.toLowerCase().includes(q));
    }, [items, search]);

    // Count stats
    const stats = useMemo(() => {
        const total = items.length;
        const inProgress = items.filter((i) => i.status === 'IN_PROGRESS').length;
        const completed = items.filter((i) => i.status === 'COMPLETED').length;
        const overdue = items.filter((i) => i.isOverdue).length;
        return { total, inProgress, completed, overdue };
    }, [items]);

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <h1 className={styles.title}>Min læring</h1>
                <p className={styles.subtitle}>
                    {stats.total} kurs &middot; {stats.completed} fullført
                    {stats.overdue > 0 && <span className={styles.overdueNote}> &middot; {stats.overdue} forfalt</span>}
                </p>
            </div>

            {/* Toolbar */}
            <div className={styles.toolbar}>
                {/* Search */}
                <div className={styles.searchBox}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Søk etter kurs..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>

                {/* Status filter tabs */}
                <div className={styles.statusTabs}>
                    {STATUS_OPTIONS.map(({ value, label, icon: Icon }) => (
                        <button
                            key={value}
                            className={`${styles.statusTab} ${activeStatus === value ? styles.statusTabActive : ''}`}
                            onClick={() => handleStatusChange(value)}
                            type="button"
                        >
                            <Icon size={14} />
                            {label}
                        </button>
                    ))}
                </div>

                {/* Sort */}
                <div className={styles.sortGroup}>
                    <SlidersHorizontal size={14} className={styles.sortIcon} />
                    <select
                        value={activeSort}
                        onChange={(e) => handleSortChange(e.target.value)}
                        className={styles.sortSelect}
                    >
                        {SORT_OPTIONS.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Course List */}
            {filtered.length > 0 ? (
                <div className={styles.courseList}>
                    {filtered.map((item) => (
                        <button
                            key={item.enrollmentId}
                            className={styles.courseCard}
                            onClick={() => router.push(`/learn/courses/${item.courseSlug}`)}
                            type="button"
                        >
                            {/* Thumbnail */}
                            {item.courseThumbnailUrl && (
                                <div className={styles.cardThumb}>
                                    <img src={item.courseThumbnailUrl} alt="" className={styles.cardThumbImg} />
                                </div>
                            )}

                            <div className={styles.cardBody}>
                                <div className={styles.cardRow}>
                                    <h3 className={styles.cardTitle}>{item.courseTitle}</h3>
                                    <div className={styles.cardBadges}>
                                        {item.status === 'COMPLETED' && (
                                            <span className={styles.completedBadge}>
                                                <CheckCircle2 size={12} /> Fullført
                                            </span>
                                        )}
                                        {item.isOverdue && (
                                            <span className={styles.overdueBadge}>
                                                <AlertTriangle size={12} /> Forfalt
                                            </span>
                                        )}
                                        {item.dueAt && !item.isOverdue && item.status !== 'COMPLETED' && (
                                            <span className={styles.dueBadge}>
                                                <Clock size={12} /> Frist: {new Date(item.dueAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className={styles.cardMeta}>
                                    <span>{item.moduleCount} moduler</span>
                                    <span>{item.lessonCount} leksjoner</span>
                                    {item.estimatedMinutes && <span>{item.estimatedMinutes} min</span>}
                                    {item.difficulty && <span className={styles.difficulty}>{item.difficulty}</span>}
                                </div>

                                <div className={styles.cardProgress}>
                                    <ProgressBar percent={item.progressPercent} />
                                    <span className={styles.cardPercent}>{item.progressPercent}%</span>
                                </div>
                            </div>

                            <ChevronRight size={16} className={styles.cardArrow} />
                        </button>
                    ))}
                </div>
            ) : (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        {search ? <Search size={36} /> : <Target size={36} />}
                    </div>
                    <h3 className={styles.emptyTitle}>
                        {search ? 'Ingen treff' : 'Ingen kurs i denne kategorien'}
                    </h3>
                    <p className={styles.emptyText}>
                        {search
                            ? `Ingen kurs matcher "${search}".`
                            : 'Prøv en annen filterkombinasjon.'}
                    </p>
                </div>
            )}
        </div>
    );
}
