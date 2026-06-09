'use client';

import Link from 'next/link';
import {
    Target, Award, TrendingUp, CheckCircle2, Lock, BookOpen, ChevronRight,
} from 'lucide-react';
import styles from './mySkills.module.css';
import type { SkillProfile, SkillGapResult } from '@/app/actions/skillActions';

interface Props {
    profile: SkillProfile;
    gap: SkillGapResult;
    locked: boolean;
    reason?: string;
}

const SOURCE_LABELS: Record<string, string> = {
    manual: 'Manuelt',
    course: 'Kurs',
    assessment: 'Vurdering',
};

function LevelBar({ level, maxLevel }: { level: number; maxLevel: number }) {
    const percent = maxLevel > 0 ? Math.min(100, Math.round((level / maxLevel) * 100)) : 0;
    return (
        <div className={styles.levelBar} aria-label={`Nivå ${level} av ${maxLevel}`}>
            <div className={styles.levelFill} style={{ width: `${percent}%` }} />
        </div>
    );
}

export default function MySkillsClient({ profile, gap, locked, reason }: Props) {
    if (locked) {
        return (
            <div className={styles.page}>
                <div className={styles.header}>
                    <h1 className={styles.title}>
                        <Target size={24} /> Kompetanse
                    </h1>
                </div>
                <div className={styles.lockedCard}>
                    <div className={styles.lockedIcon}>
                        <Lock size={26} />
                    </div>
                    <span className={styles.lockedTitle}>Kompetanse er ikke aktivert</span>
                    <span className={styles.lockedText}>
                        {reason || 'Denne funksjonen er ikke tilgjengelig for organisasjonen din ennå.'}
                    </span>
                </div>
            </div>
        );
    }

    const acquired = profile.skills;

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>
                    <Target size={24} /> Min kompetanse
                </h1>
                <p className={styles.subtitle}>
                    {acquired.length} ferdigheter oppnådd
                    {gap.gaps.length > 0 && (
                        <span className={styles.gapNote}> &middot; {gap.gaps.length} å jobbe mot</span>
                    )}
                </p>
            </div>

            {/* Acquired skills */}
            <section className={styles.block}>
                <h2 className={styles.blockTitle}>
                    <Award size={18} /> Oppnådde ferdigheter
                </h2>
                {acquired.length === 0 ? (
                    <div className={styles.empty}>
                        <div className={styles.emptyIcon}><Award size={26} /></div>
                        <span className={styles.emptyTitle}>Ingen ferdigheter ennå</span>
                        <span className={styles.emptyText}>
                            Fullfør kurs eller få ferdigheter registrert for å bygge profilen din.
                        </span>
                    </div>
                ) : (
                    <div className={styles.skillGrid}>
                        {acquired.map((s) => (
                            <div key={s.skillId} className={styles.skillCard}>
                                <div className={styles.skillCardTop}>
                                    <span className={styles.skillName}>{s.name}</span>
                                    <span className={styles.skillLevel}>
                                        {s.level} / {s.maxLevel}
                                    </span>
                                </div>
                                {s.category && <span className={styles.skillCategory}>{s.category}</span>}
                                <LevelBar level={s.level} maxLevel={s.maxLevel} />
                                <div className={styles.sourceTags}>
                                    {s.sources.map((src) => (
                                        <span key={src} className={styles.sourceTag}>
                                            {SOURCE_LABELS[src] || src}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Gaps */}
            <section className={styles.block}>
                <h2 className={styles.blockTitle}>
                    <TrendingUp size={18} /> Kompetansegap
                </h2>
                {gap.gaps.length === 0 ? (
                    <div className={styles.successCard}>
                        <CheckCircle2 size={18} />
                        Ingen gap. Du oppfyller kravene for kursene du er tildelt.
                    </div>
                ) : (
                    <div className={styles.gapList}>
                        {gap.gaps.map((g) => (
                            <div key={g.skillId} className={styles.gapItem}>
                                <div className={styles.gapItemMain}>
                                    <span className={styles.gapItemName}>{g.name}</span>
                                    {g.category && <span className={styles.skillCategory}>{g.category}</span>}
                                </div>
                                <div className={styles.gapLevels}>
                                    <span className={styles.gapCurrent}>Nå: {g.currentLevel}</span>
                                    <ChevronRight size={14} className={styles.gapArrow} />
                                    <span className={styles.gapRequired}>
                                        Mål: {g.requiredLevel} / {g.maxLevel}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Recommended courses */}
            {gap.recommendedCourses.length > 0 && (
                <section className={styles.block}>
                    <h2 className={styles.blockTitle}>
                        <BookOpen size={18} /> Anbefalte kurs
                    </h2>
                    <div className={styles.recList}>
                        {gap.recommendedCourses.map((c) => (
                            <Link key={c.courseId} href={`/learn/courses/${c.slug}`} className={styles.recCard}>
                                <div className={styles.recMain}>
                                    <span className={styles.recTitle}>{c.title}</span>
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
                </section>
            )}
        </div>
    );
}
