'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
    ArrowLeft, Play, Clock, BarChart3, Tag, FolderOpen,
    ChevronDown, ChevronRight, CheckCircle2, Lock, Circle,
    BookOpen, AlertTriangle, Award,
} from 'lucide-react';
import { startCourse } from '@/app/actions/learnerActions';
import type { CourseDetailLearner } from '@/app/actions/learnerActions';
import styles from './courseDetail.module.css';
import { sanitizeHtml } from '@/lib/sanitize';

interface Props {
    data: CourseDetailLearner;
}

function LessonStatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'COMPLETED':
            return <CheckCircle2 size={16} className={styles.lessonIconCompleted} />;
        case 'STARTED':
            return <Circle size={16} className={styles.lessonIconStarted} />;
        case 'LOCKED':
            return <Lock size={14} className={styles.lessonIconLocked} />;
        default:
            return <Circle size={16} className={styles.lessonIconAvailable} />;
    }
}

function ProgressBar({ percent }: { percent: number }) {
    return (
        <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
    );
}

export default function CourseDetailClient({ data }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [expandedModules, setExpandedModules] = useState<Set<string>>(
        () => new Set(data.modules.map((m) => m.moduleId))
    );

    const totalLessons = data.modules.reduce((sum, m) => sum + m.lessons.length, 0);
    const completedLessons = data.modules.reduce(
        (sum, m) => sum + m.lessons.filter((l) => l.status === 'COMPLETED').length,
        0
    );

    function toggleModule(moduleId: string) {
        setExpandedModules((prev) => {
            const next = new Set(prev);
            if (next.has(moduleId)) next.delete(moduleId);
            else next.add(moduleId);
            return next;
        });
    }

    function handleStart() {
        startTransition(async () => {
            const result = await startCourse(data.slug);
            if ('error' in result) {
                alert(result.error);
                return;
            }
            router.refresh();
        });
    }

    function handleContinue() {
        if (data.enrollment?.resumeLessonId) {
            router.push(`/learn/courses/${data.slug}/player?lesson=${data.enrollment.resumeLessonId}`);
        } else {
            // Find first non-completed lesson
            for (const mod of data.modules) {
                for (const lesson of mod.lessons) {
                    if (lesson.status !== 'COMPLETED' && lesson.status !== 'LOCKED') {
                        router.push(`/learn/courses/${data.slug}/player?lesson=${lesson.lessonId}`);
                        return;
                    }
                }
            }
            // All completed — go to first lesson
            if (data.modules[0]?.lessons[0]) {
                router.push(`/learn/courses/${data.slug}/player?lesson=${data.modules[0].lessons[0].lessonId}`);
                return;
            }
            // No lessons available — navigate to player anyway (will show empty state)
            router.push(`/learn/courses/${data.slug}/player`);
        }
    }

    function handleLessonClick(lessonId: string, status: string) {
        if (status === 'LOCKED') return;
        router.push(`/learn/courses/${data.slug}/player?lesson=${lessonId}`);
    }

    return (
        <div className={styles.page}>
            {/* Back button */}
            <button className={styles.backBtn} onClick={() => router.push('/learn/my-learning')} type="button">
                <ArrowLeft size={16} />
                Tilbake til mine kurs
            </button>

            {/* Hero section */}
            <div className={styles.hero}>
                <div className={styles.heroContent}>
                    <h1 className={styles.heroTitle}>{data.title}</h1>
                    {data.description && (
                        <div className={styles.heroDescription} dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.description) }} />
                    )}

                    <div className={styles.heroMeta}>
                        {data.estimatedMinutes && (
                            <span className={styles.metaItem}>
                                <Clock size={14} /> {data.estimatedMinutes} min
                            </span>
                        )}
                        <span className={styles.metaItem}>
                            <BookOpen size={14} /> {data.modules.length} moduler &middot; {totalLessons} leksjoner
                        </span>
                        {data.difficulty && (
                            <span className={styles.metaItem}>
                                <BarChart3 size={14} /> {data.difficulty}
                            </span>
                        )}
                    </div>

                    {data.categories.length > 0 && (
                        <div className={styles.heroTags}>
                            {data.categories.map((c) => (
                                <span key={c.id} className={styles.categoryBadge}>
                                    <FolderOpen size={12} /> {c.name}
                                </span>
                            ))}
                            {data.tags.map((t) => (
                                <span key={t.id} className={styles.tagBadge}>
                                    <Tag size={12} /> {t.label}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Action Bar */}
                    <div className={styles.actionBar}>
                        {!data.enrollment ? (
                            <button
                                className={styles.startBtn}
                                onClick={handleStart}
                                disabled={isPending}
                                type="button"
                            >
                                <Play size={16} />
                                {isPending ? 'Starter...' : 'Start kurset'}
                            </button>
                        ) : data.enrollment.status === 'COMPLETED' ? (
                            <div className={styles.completedState}>
                                <Award size={20} className={styles.awardIcon} />
                                <span>Fullført!</span>
                                <button className={styles.reviewBtn} onClick={handleContinue} type="button">
                                    Se gjennom
                                </button>
                            </div>
                        ) : (
                            <button className={styles.continueBtn} onClick={handleContinue} type="button">
                                <Play size={16} />
                                Fortsett
                            </button>
                        )}

                        {data.enrollment && data.enrollment.status !== 'COMPLETED' && (
                            <div className={styles.enrollmentProgress}>
                                <ProgressBar percent={data.enrollment.progressPercent} />
                                <span className={styles.progressText}>
                                    {data.enrollment.progressPercent}% &middot; {completedLessons}/{totalLessons} leksjoner
                                </span>
                                {data.enrollment.dueAt && (
                                    <span className={styles.dueText}>
                                        <AlertTriangle size={12} />
                                        Frist: {new Date(data.enrollment.dueAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {data.thumbnailUrl && (
                    <div className={styles.heroThumb}>
                        <img src={data.thumbnailUrl} alt="" className={styles.heroThumbImg} />
                    </div>
                )}
            </div>

            {/* Modules / Curriculum */}
            <section className={styles.curriculum}>
                <h2 className={styles.curriculumTitle}>Kursinnhold</h2>

                <div className={styles.moduleList}>
                    {data.modules.map((mod) => {
                        const isExpanded = expandedModules.has(mod.moduleId);
                        const modCompleted = mod.lessons.filter((l) => l.status === 'COMPLETED').length;
                        const modTotal = mod.lessons.length;

                        return (
                            <div key={mod.moduleId} className={styles.moduleItem}>
                                <button
                                    className={styles.moduleHeader}
                                    onClick={() => toggleModule(mod.moduleId)}
                                    type="button"
                                >
                                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    <span className={styles.moduleTitle}>
                                        {mod.position + 1}. {mod.title}
                                    </span>
                                    <span className={styles.moduleStats}>
                                        {modCompleted}/{modTotal}
                                    </span>
                                </button>

                                {isExpanded && (
                                    <div className={styles.lessonList}>
                                        {mod.lessons.map((lesson) => (
                                            <button
                                                key={lesson.lessonId}
                                                className={`${styles.lessonItem} ${lesson.status === 'LOCKED' ? styles.lessonLocked : ''}`}
                                                onClick={() => handleLessonClick(lesson.lessonId, lesson.status)}
                                                disabled={lesson.status === 'LOCKED'}
                                                type="button"
                                            >
                                                <LessonStatusIcon status={lesson.status} />
                                                <span className={styles.lessonTitle}>{lesson.title}</span>
                                                <span className={styles.lessonMeta}>
                                                    {lesson.estimatedMinutes && `${lesson.estimatedMinutes} min`}
                                                    {lesson.isOptional && (
                                                        <span className={styles.optionalTag}>Valgfri</span>
                                                    )}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
