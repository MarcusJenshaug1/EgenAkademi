'use client';

import { useState } from 'react';
import {
    Trophy, Award, Star, Flame, Medal, Lock, TrendingUp, Eye, EyeOff,
} from 'lucide-react';
import styles from './leaderboard.module.css';
import { setLeaderboardOptIn, type LeaderboardEntry, type MyGamification } from '@/app/actions/gamificationActions';

// Samme allowlist som admin-siden bruker for badge-ikoner.
const ICON_MAP = { Trophy, Award, Star, Flame, Medal } as const;

// Defensivt: kun et trygt hex-format slippes inn i color-mix() i inline styles.
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function safeColor(color: string | null): string | null {
    return color && HEX_COLOR_RE.test(color) ? color : null;
}

function BadgeIcon({ icon, size = 18 }: { icon: string | null; size?: number }) {
    const Icon = (icon && icon in ICON_MAP ? ICON_MAP[icon as keyof typeof ICON_MAP] : Award);
    return <Icon size={size} />;
}

interface Props {
    me: MyGamification | null;
    entries: LeaderboardEntry[];
    enabled: boolean;
}

export default function LeaderboardClient({ me, entries, enabled }: Props) {
    const [optedIn, setOptedIn] = useState<boolean>(me?.optedIn ?? true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!enabled) {
        return (
            <div className={styles.page}>
                <div className={styles.header}>
                    <h1 className={styles.title}>
                        <Trophy size={24} /> Toppliste
                    </h1>
                </div>
                <div className={styles.lockedCard}>
                    <div className={styles.lockedIcon}>
                        <Lock size={26} />
                    </div>
                    <span className={styles.lockedTitle}>Toppliste er ikke aktivert</span>
                    <span className={styles.lockedText}>
                        Denne funksjonen er ikke tilgjengelig for organisasjonen din ennå.
                    </span>
                </div>
            </div>
        );
    }

    async function handleToggle() {
        const next = !optedIn;
        setSaving(true);
        setError(null);
        const res = await setLeaderboardOptIn(next);
        setSaving(false);
        if ('success' in res) {
            setOptedIn(next);
        } else {
            setError(res.error);
        }
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>
                    <Trophy size={24} /> Toppliste
                </h1>
                <p className={styles.subtitle}>Se din egen framgang og hvordan du ligger an mot kollegene</p>
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}

            {/* ── Egen status ─────────────────────────── */}
            {me && (
                <section className={styles.myCard}>
                    <div className={styles.myTop}>
                        <div className={styles.levelBadge}>
                            <span className={styles.levelNumber}>{me.level}</span>
                            <span className={styles.levelWord}>Nivå</span>
                        </div>
                        <div className={styles.myStats}>
                            <div className={styles.myStat}>
                                <span className={styles.myStatValue}>{me.totalPoints.toLocaleString('nb-NO')}</span>
                                <span className={styles.myStatLabel}>Poeng</span>
                            </div>
                            <div className={styles.myStat}>
                                <span className={styles.myStatValue}>
                                    <Flame size={16} className={styles.streakIcon} /> {me.currentStreak}
                                </span>
                                <span className={styles.myStatLabel}>Dagers streak</span>
                            </div>
                            <div className={styles.myStat}>
                                <span className={styles.myStatValue}>
                                    {me.rank != null ? `#${me.rank}` : '—'}
                                </span>
                                <span className={styles.myStatLabel}>Rangering</span>
                            </div>
                        </div>
                    </div>

                    {/* Progresjon mot neste nivå */}
                    <div className={styles.progressWrap}>
                        <div className={styles.progressMeta}>
                            <span className={styles.progressLabel}>
                                <TrendingUp size={14} /> Framgang til nivå {me.level + 1}
                            </span>
                            <span className={styles.progressNumbers}>
                                {me.progress.pointsIntoLevel} / {me.progress.pointsForThisLevel} poeng
                            </span>
                        </div>
                        <div className={styles.progressBar} aria-label={`${me.progress.percent}% til neste nivå`}>
                            <div className={styles.progressFill} style={{ width: `${me.progress.percent}%` }} />
                        </div>
                        <span className={styles.progressHint}>
                            {me.progress.pointsToNextLevel > 0
                                ? `${me.progress.pointsToNextLevel} poeng igjen til neste nivå`
                                : 'Maks framgang for dette nivået'}
                        </span>
                    </div>

                    {/* Opt-in toggle */}
                    <div className={styles.optInRow}>
                        <div className={styles.optInText}>
                            <span className={styles.optInTitle}>Vis meg på topplista</span>
                            <span className={styles.optInHint}>
                                Når dette er av, vises ikke navnet ditt for andre i organisasjonen.
                            </span>
                        </div>
                        <button
                            type="button"
                            className={`${styles.optInToggle} ${optedIn ? styles.optInToggleOn : ''}`}
                            onClick={handleToggle}
                            disabled={saving}
                            aria-pressed={optedIn}
                            aria-label={optedIn ? 'Skjul meg fra topplista' : 'Vis meg på topplista'}
                        >
                            {optedIn ? <Eye size={15} /> : <EyeOff size={15} />}
                            {optedIn ? 'Synlig' : 'Skjult'}
                        </button>
                    </div>

                    {/* Badges */}
                    {me.badges.length > 0 && (
                        <div className={styles.badgesSection}>
                            <span className={styles.badgesTitle}>Dine badges ({me.badges.length})</span>
                            <div className={styles.badgeRow}>
                                {me.badges.map((b) => (
                                    <div
                                        key={b.id}
                                        className={styles.badgeChip}
                                        title={b.description ?? b.name}
                                        style={(() => {
                                            const c = safeColor(b.color);
                                            return c
                                                ? {
                                                      background: `color-mix(in srgb, ${c} 16%, transparent)`,
                                                      color: c,
                                                      borderColor: `color-mix(in srgb, ${c} 32%, transparent)`,
                                                  }
                                                : undefined;
                                        })()}
                                    >
                                        <BadgeIcon icon={b.icon} size={15} />
                                        <span className={styles.badgeChipName}>{b.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* ── Toppliste ───────────────────────────── */}
            <section className={styles.lbSection}>
                <h2 className={styles.lbHeading}>Toppliste</h2>
                {entries.length === 0 ? (
                    <div className={styles.empty}>
                        <div className={styles.emptyIcon}><Trophy size={28} /></div>
                        <span className={styles.emptyTitle}>Ingen på topplista ennå</span>
                        <span className={styles.emptyText}>
                            Fullfør kurs og vær aktiv for å tjene poeng og klatre på lista.
                        </span>
                    </div>
                ) : (
                    <div className={styles.lbList}>
                        {entries.map((e) => (
                            <div
                                key={e.userId}
                                className={`${styles.lbRow} ${e.isCurrentUser ? styles.lbRowMe : ''}`}
                            >
                                <span className={`${styles.lbRank} ${e.rank <= 3 ? styles.lbRankTop : ''}`}>
                                    {e.rank}
                                </span>
                                <div className={styles.lbAvatar}>
                                    {e.avatarUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={e.avatarUrl} alt="" className={styles.lbAvatarImg} />
                                    ) : (
                                        e.name.substring(0, 2).toUpperCase()
                                    )}
                                </div>
                                <div className={styles.lbMain}>
                                    <span className={styles.lbName}>
                                        {e.name}
                                        {e.isCurrentUser && <span className={styles.lbYouTag}>Deg</span>}
                                    </span>
                                    <span className={styles.lbSub}>
                                        Nivå {e.level} &middot; {e.badgeCount} badges
                                    </span>
                                </div>
                                <span className={styles.lbPoints}>{e.totalPoints.toLocaleString('nb-NO')} p</span>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
