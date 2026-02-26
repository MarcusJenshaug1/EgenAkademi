'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
    Search, Clock, BookOpen, BarChart3, FolderOpen, Tag,
    Play, CheckCircle2, ChevronRight, Compass, UserPlus,
} from 'lucide-react';
import { startCourse } from '@/app/actions/learnerActions';
import type { CatalogCourse } from '@/app/actions/learnerActions';
import styles from './courseCatalog.module.css';

interface Props {
    courses: CatalogCourse[];
}

function ProgressBar({ percent }: { percent: number }) {
    return (
        <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
    );
}

function CourseCard({ course }: { course: CatalogCourse }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    function handleEnroll() {
        startTransition(async () => {
            const result = await startCourse(course.slug);
            if ('error' in result) {
                alert(result.error);
                return;
            }
            router.push(`/learn/courses/${course.slug}`);
        });
    }

    function handleGoToCourse() {
        router.push(`/learn/courses/${course.slug}`);
    }

    // Strip HTML tags from description for preview
    const descriptionPreview = course.description
        ? course.description.replace(/<[^>]*>/g, '').substring(0, 120)
        : null;

    return (
        <div className={styles.courseCard}>
            {course.thumbnailUrl && (
                <div className={styles.cardThumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={course.thumbnailUrl} alt="" className={styles.cardThumbImg} />
                </div>
            )}

            <div className={styles.cardBody}>
                <div className={styles.cardTop}>
                    <h3 className={styles.cardTitle}>{course.title}</h3>
                    {course.difficulty && (
                        <span className={styles.difficultyBadge}>
                            <BarChart3 size={12} /> {course.difficulty}
                        </span>
                    )}
                </div>

                {descriptionPreview && (
                    <p className={styles.cardDescription}>
                        {descriptionPreview}{course.description && course.description.replace(/<[^>]*>/g, '').length > 120 ? '...' : ''}
                    </p>
                )}

                <div className={styles.cardMeta}>
                    <span className={styles.metaItem}>
                        <BookOpen size={13} /> {course.moduleCount} moduler
                    </span>
                    <span className={styles.metaItem}>
                        <FolderOpen size={13} /> {course.lessonCount} leksjoner
                    </span>
                    {course.estimatedMinutes && (
                        <span className={styles.metaItem}>
                            <Clock size={13} /> {course.estimatedMinutes} min
                        </span>
                    )}
                </div>

                {(course.categories.length > 0 || course.tags.length > 0) && (
                    <div className={styles.cardTags}>
                        {course.categories.map((c) => (
                            <span key={c.id} className={styles.categoryChip}>
                                <FolderOpen size={10} /> {c.name}
                            </span>
                        ))}
                        {course.tags.map((t) => (
                            <span key={t.id} className={styles.tagChip}>
                                <Tag size={10} /> {t.label}
                            </span>
                        ))}
                    </div>
                )}

                {/* Progress for enrolled courses */}
                {course.isEnrolled && course.progressPercent !== null && course.enrollmentStatus !== 'COMPLETED' && (
                    <div className={styles.cardProgress}>
                        <ProgressBar percent={course.progressPercent} />
                        <span className={styles.cardProgressText}>{course.progressPercent}% fullført</span>
                    </div>
                )}
            </div>

            <div className={styles.cardFooter}>
                {!course.isEnrolled ? (
                    <button
                        className={styles.enrollBtn}
                        onClick={handleEnroll}
                        disabled={isPending}
                        type="button"
                    >
                        <UserPlus size={15} />
                        {isPending ? 'Melder på...' : 'Meld deg på'}
                    </button>
                ) : course.enrollmentStatus === 'COMPLETED' ? (
                    <button className={styles.completedBtn} onClick={handleGoToCourse} type="button">
                        <CheckCircle2 size={15} />
                        Fullført — Se gjennom
                    </button>
                ) : (
                    <button className={styles.continueBtn} onClick={handleGoToCourse} type="button">
                        <Play size={15} />
                        Fortsett
                        <ChevronRight size={14} />
                    </button>
                )}
            </div>
        </div>
    );
}

export default function CourseCatalogClient({ courses }: Props) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'available' | 'enrolled'>('available');

    const filtered = courses.filter((c) => {
        // Search
        if (search) {
            const q = search.toLowerCase();
            const matches =
                c.title.toLowerCase().includes(q) ||
                (c.description?.toLowerCase().includes(q)) ||
                c.categories.some((cat) => cat.name.toLowerCase().includes(q)) ||
                c.tags.some((t) => t.label.toLowerCase().includes(q));
            if (!matches) return false;
        }
        // Filter
        if (filter === 'available' && c.isEnrolled) return false;
        if (filter === 'enrolled' && !c.isEnrolled) return false;
        return true;
    });

    const availableCount = courses.filter((c) => !c.isEnrolled).length;
    const enrolledCount = courses.filter((c) => c.isEnrolled).length;

    return (
        <div className={styles.catalog}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Compass size={28} className={styles.headerIcon} />
                    <div>
                        <h1 className={styles.title}>Kurskatalog</h1>
                        <p className={styles.subtitle}>
                            Utforsk tilgjengelige kurs og meld deg på
                        </p>
                    </div>
                </div>
            </div>

            <div className={styles.toolbar}>
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

                <div className={styles.filterTabs}>
                    <button
                        className={`${styles.filterTab} ${filter === 'all' ? styles.filterTabActive : ''}`}
                        onClick={() => setFilter('all')}
                        type="button"
                    >
                        Alle ({courses.length})
                    </button>
                    <button
                        className={`${styles.filterTab} ${filter === 'available' ? styles.filterTabActive : ''}`}
                        onClick={() => setFilter('available')}
                        type="button"
                    >
                        Tilgjengelige ({availableCount})
                    </button>
                    <button
                        className={`${styles.filterTab} ${filter === 'enrolled' ? styles.filterTabActive : ''}`}
                        onClick={() => setFilter('enrolled')}
                        type="button"
                    >
                        Påmeldt ({enrolledCount})
                    </button>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className={styles.emptyState}>
                    <Compass size={40} />
                    <p>
                        {search
                            ? 'Ingen kurs matcher søket ditt.'
                            : filter === 'available'
                                ? 'Du er allerede meldt på alle tilgjengelige kurs!'
                                : 'Ingen kurs tilgjengelig ennå.'}
                    </p>
                </div>
            ) : (
                <div className={styles.courseGrid}>
                    {filtered.map((course) => (
                        <CourseCard key={course.courseId} course={course} />
                    ))}
                </div>
            )}
        </div>
    );
}
