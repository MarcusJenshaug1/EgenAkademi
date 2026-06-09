'use client';

import { useRouter } from 'next/navigation';
import {
    Play, Clock, BookOpen, Award, AlertTriangle, ChevronRight,
    TrendingUp, Target, CheckCircle2,
} from 'lucide-react';
import styles from './dashboard.module.css';
import type { LearnerDashboardData, EnrollmentSummary } from '@/app/actions/learnerActions';

interface Props {
    data: LearnerDashboardData;
    firstName: string;
}

function formatDate(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('nb-NO', {
        day: 'numeric',
        month: 'short',
    });
}

function daysUntil(iso: string): number {
    const diff = new Date(iso).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function ProgressBar({ percent }: { percent: number }) {
    return (
        <div className={styles.progressBar}>
            <div
                className={styles.progressFill}
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
        </div>
    );
}

function EnrollmentCard({ item, showDue }: { item: EnrollmentSummary; showDue?: boolean }) {
    const router = useRouter();

    const handleClick = () => {
        router.push(`/learn/courses/${item.courseSlug}`);
    };

    return (
        <button className={styles.enrollmentCard} onClick={handleClick} type="button">
            <div className={styles.cardContent}>
                <div className={styles.cardTop}>
                    <h4 className={styles.cardTitle}>{item.courseTitle}</h4>
                    {item.isOverdue && (
                        <span className={styles.overdueBadge}>
                            <AlertTriangle size={12} /> Forfalt
                        </span>
                    )}
                    {showDue && item.dueAt && !item.isOverdue && (
                        <span className={styles.dueBadge}>
                            <Clock size={12} /> {daysUntil(item.dueAt)} dager
                        </span>
                    )}
                </div>
                <div className={styles.cardMeta}>
                    <span>{item.moduleCount} moduler</span>
                    <span>{item.lessonCount} leksjoner</span>
                    {item.estimatedMinutes && <span>{item.estimatedMinutes} min</span>}
                </div>
                <ProgressBar percent={item.progressPercent} />
                <span className={styles.cardPercent}>{item.progressPercent}% fullført</span>
            </div>
            <ChevronRight size={16} className={styles.cardArrow} />
        </button>
    );
}

export default function DashboardClient({ data, firstName }: Props) {
    const router = useRouter();

    const greeting = getGreeting();

    return (
        <div className={styles.dashboard}>
            {/* Header */}
            <div className={styles.header}>
                <h1 className={styles.greeting}>
                    {greeting}, {firstName}!
                </h1>
                <p className={styles.subtitle}>
                    {data.stats.inProgress > 0
                        ? `Du har ${data.stats.inProgress} kurs under arbeid.`
                        : 'Ingen aktive kurs akkurat nå.'}
                </p>
            </div>

            {/* Stats Row */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <BookOpen size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statValue}>{data.stats.total}</span>
                        <span className={styles.statLabel}>Totalt</span>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={`${styles.statIcon} ${styles.statIconProgress}`}>
                        <TrendingUp size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statValue}>{data.stats.inProgress}</span>
                        <span className={styles.statLabel}>Pågående</span>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={`${styles.statIcon} ${styles.statIconCompleted}`}>
                        <CheckCircle2 size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statValue}>{data.stats.completed}</span>
                        <span className={styles.statLabel}>Fullført</span>
                    </div>
                </div>
                {data.stats.overdue > 0 && (
                    <div className={styles.statCard}>
                        <div className={`${styles.statIcon} ${styles.statIconOverdue}`}>
                            <AlertTriangle size={20} />
                        </div>
                        <div className={styles.statBody}>
                            <span className={styles.statValue}>{data.stats.overdue}</span>
                            <span className={styles.statLabel}>Forfalt</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Continue Learning */}
            {data.continueItem && (
                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Fortsett der du slapp</h2>
                    <button
                        className={styles.continueCard}
                        onClick={() => {
                            if (data.continueItem?.resumeLessonId) {
                                router.push(`/learn/courses/${data.continueItem.courseSlug}/player?lesson=${data.continueItem.resumeLessonId}`);
                            } else {
                                router.push(`/learn/courses/${data.continueItem!.courseSlug}`);
                            }
                        }}
                        type="button"
                    >
                        <div className={styles.continueIcon}>
                            <Play size={24} />
                        </div>
                        <div className={styles.continueBody}>
                            <h3 className={styles.continueTitle}>{data.continueItem.courseTitle}</h3>
                            {data.continueItem.resumeLessonTitle && (
                                <p className={styles.continueLesson}>
                                    {data.continueItem.resumeModuleTitle} &rsaquo; {data.continueItem.resumeLessonTitle}
                                </p>
                            )}
                            <ProgressBar percent={data.continueItem.progressPercent} />
                            <span className={styles.continuePercent}>
                                {data.continueItem.progressPercent}% fullført
                            </span>
                        </div>
                        <ChevronRight size={20} className={styles.continueArrow} />
                    </button>
                </section>
            )}

            {/* Due Soon */}
            {data.dueSoon.length > 0 && (
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Neste frist</h2>
                        <span className={styles.sectionBadge}>{data.dueSoon.length}</span>
                    </div>
                    <div className={styles.enrollmentList}>
                        {data.dueSoon.slice(0, 5).map((item) => (
                            <EnrollmentCard key={item.enrollmentId} item={item} showDue />
                        ))}
                    </div>
                </section>
            )}

            {/* In Progress */}
            {data.inProgress.length > 0 && (
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Pågående kurs</h2>
                        <button
                            className={styles.viewAllBtn}
                            onClick={() => router.push('/learn/my-learning?status=IN_PROGRESS')}
                            type="button"
                        >
                            Vis alle
                        </button>
                    </div>
                    <div className={styles.enrollmentList}>
                        {data.inProgress.slice(0, 4).map((item) => (
                            <EnrollmentCard key={item.enrollmentId} item={item} />
                        ))}
                    </div>
                </section>
            )}

            {/* Recently Completed */}
            {data.completed.length > 0 && (
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Nylig fullført</h2>
                        <button
                            className={styles.viewAllBtn}
                            onClick={() => router.push('/learn/my-learning?status=COMPLETED')}
                            type="button"
                        >
                            Vis alle
                        </button>
                    </div>
                    <div className={styles.enrollmentList}>
                        {data.completed.slice(0, 3).map((item) => (
                            <EnrollmentCard key={item.enrollmentId} item={item} />
                        ))}
                    </div>
                </section>
            )}

            {/* Empty state */}
            {data.stats.total === 0 && (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <Target size={40} />
                    </div>
                    <h3 className={styles.emptyTitle}>Ingen kurs ennå</h3>
                    <p className={styles.emptyText}>
                        Du har ikke blitt tildelt noen kurs ennå. Kontakt din administrator for å komme i gang.
                    </p>
                </div>
            )}
        </div>
    );
}

function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 6) return 'God natt';
    if (hour < 12) return 'God morgen';
    if (hour < 18) return 'God ettermiddag';
    return 'God kveld';
}
