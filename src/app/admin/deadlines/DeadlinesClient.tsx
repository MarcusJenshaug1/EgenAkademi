'use client';

import { useState, useEffect } from 'react';
import {
    AlarmClock,
    Clock,
    AlertTriangle,
    RefreshCw,
    Info,
    X,
    CheckCircle2,
} from 'lucide-react';
import styles from './deadlines.module.css';
import {
    runDeadlineSweep,
    type DeadlineOverview,
    type DeadlineRow,
    type RecertRow,
    type SweepResult,
} from '@/app/actions/deadlineActions';
import type { EnrollmentStatus } from '@prisma/client';

// ── Label maps ──────────────────────────────────────────────

const STATUS_LABELS: Record<EnrollmentStatus, string> = {
    NOT_STARTED: 'Ikke startet',
    IN_PROGRESS: 'Pågår',
    COMPLETED: 'Fullført',
    OVERDUE: 'Forfalt',
    EXEMPT: 'Fritatt',
};

function statusBadgeClass(status: EnrollmentStatus) {
    if (status === 'OVERDUE') return styles.badgeOverdue;
    if (status === 'IN_PROGRESS') return styles.badgeInProgress;
    if (status === 'COMPLETED') return styles.badgeCompleted;
    if (status === 'EXEMPT') return styles.badgeExempt;
    return styles.badgeNotStarted;
}

function formatDate(d: Date | string | null) {
    if (!d) return '–';
    return new Date(d).toLocaleDateString('nb-NO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

// ── Props ───────────────────────────────────────────────────

interface DeadlinesClientProps {
    overview?: DeadlineOverview;
    initialError?: string;
}

export default function DeadlinesClient({ overview, initialError }: DeadlinesClientProps) {
    const [error, setError] = useState<string | null>(initialError ?? null);
    const [running, setRunning] = useState(false);
    const [sweepResult, setSweepResult] = useState<SweepResult | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    const overdue: DeadlineRow[] = overview?.overdue ?? [];
    const upcoming: DeadlineRow[] = overview?.upcoming ?? [];
    const recertification: RecertRow[] = overview?.recertification ?? [];

    const overdueCount = overview?.overdueCount ?? 0;
    const upcomingCount = overview?.upcomingCount ?? 0;
    const recertCount = overview?.recertificationDueCount ?? 0;

    async function handleRunSweep() {
        setRunning(true);
        setSweepResult(null);
        const result = await runDeadlineSweep();
        setRunning(false);
        if ('error' in result) {
            setError(result.error);
        } else {
            setSweepResult(result);
            setToast('Påminnelser kjørt');
        }
    }

    return (
        <div className={styles.deadlinesPage}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Frister og resertifisering</h1>
                    <p className={styles.subtitle}>
                        Hold oversikt over forfalte frister, kommende frister og resertifisering
                    </p>
                </div>
                <button
                    className={styles.primaryButton}
                    onClick={handleRunSweep}
                    disabled={running}
                >
                    <RefreshCw size={18} className={running ? styles.spinning : undefined} />
                    {running ? 'Kjører...' : 'Kjør påminnelser nå'}
                </button>
            </div>

            {/* Info note about cron */}
            <div className={styles.infoNote}>
                <Info size={16} />
                <span>
                    Automatisk daglig kjøring krever en planlagt jobb (cron) — se TODO. Inntil videre
                    kjøres påminnelser manuelt med knappen over.
                </span>
            </div>

            {/* Error */}
            {error && (
                <div className={styles.errorBanner}>
                    <AlertTriangle size={16} />
                    {error}
                    <button
                        className={styles.iconButton}
                        onClick={() => setError(null)}
                        style={{ marginLeft: 'auto' }}
                        aria-label="Lukk feilmelding"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Sweep result summary */}
            {sweepResult && (
                <div className={styles.sweepSummary}>
                    <div className={styles.sweepSummaryHeader}>
                        <CheckCircle2 size={16} />
                        <span>Påminnelser fullført</span>
                        <button
                            className={styles.iconButton}
                            onClick={() => setSweepResult(null)}
                            style={{ marginLeft: 'auto' }}
                            aria-label="Lukk oppsummering"
                        >
                            <X size={14} />
                        </button>
                    </div>
                    <div className={styles.sweepStats}>
                        <div className={styles.sweepStat}>
                            <span className={styles.sweepStatValue}>{sweepResult.markedOverdue}</span>
                            <span className={styles.sweepStatLabel}>Markert forfalt</span>
                        </div>
                        <div className={styles.sweepStat}>
                            <span className={styles.sweepStatValue}>{sweepResult.remindersSent}</span>
                            <span className={styles.sweepStatLabel}>Påminnelser sendt</span>
                        </div>
                        <div className={styles.sweepStat}>
                            <span className={styles.sweepStatValue}>{sweepResult.escalationsSent}</span>
                            <span className={styles.sweepStatLabel}>Eskaleringer sendt</span>
                        </div>
                        <div className={styles.sweepStat}>
                            <span className={styles.sweepStatValue}>{sweepResult.recertCreated}</span>
                            <span className={styles.sweepStatLabel}>Resertifiseringer opprettet</span>
                        </div>
                    </div>
                </div>
            )}

            {/* KPI cards */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={`${styles.statIcon} ${styles.statIconDanger}`}>
                        <AlertTriangle size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Forfalt</span>
                        <span className={styles.statValue}>{overdueCount}</span>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={`${styles.statIcon} ${styles.statIconWarning}`}>
                        <Clock size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Kommende frister</span>
                        <span className={styles.statValue}>{upcomingCount}</span>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <AlarmClock size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Resertifisering</span>
                        <span className={styles.statValue}>{recertCount}</span>
                    </div>
                </div>
            </div>

            {/* Overdue table */}
            <section className={styles.tableSection}>
                <div className={styles.sectionHeader}>
                    <AlertTriangle size={18} className={styles.sectionHeaderIconDanger} />
                    <h2 className={styles.sectionTitle}>Forfalt</h2>
                    <span className={styles.sectionCount}>{overdueCount}</span>
                </div>
                {overdue.length === 0 ? (
                    <div className={styles.emptyState}>
                        <span className={styles.emptyText}>Ingen forfalte frister. Godt jobbet!</span>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Bruker</th>
                                    <th>Kurs</th>
                                    <th>Frist</th>
                                    <th>Status</th>
                                    <th className={styles.tableNumCol}>Dager forfalt</th>
                                </tr>
                            </thead>
                            <tbody>
                                {overdue.map((row) => (
                                    <tr key={row.enrollmentId}>
                                        <td>
                                            <div className={styles.cellUser}>
                                                <span className={styles.cellUserName}>{row.userName}</span>
                                                {row.userEmail && (
                                                    <span className={styles.cellUserEmail}>{row.userEmail}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>{row.courseTitle}</td>
                                        <td className={styles.cellDate}>{formatDate(row.dueAt)}</td>
                                        <td>
                                            <span className={`${styles.statusBadge} ${statusBadgeClass(row.status)}`}>
                                                {STATUS_LABELS[row.status]}
                                            </span>
                                        </td>
                                        <td className={styles.tableNumCol}>
                                            <span className={styles.daysOverdue}>
                                                {row.daysOverdue ?? 0} dager
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Upcoming table */}
            <section className={styles.tableSection}>
                <div className={styles.sectionHeader}>
                    <Clock size={18} className={styles.sectionHeaderIconWarning} />
                    <h2 className={styles.sectionTitle}>Kommende frister</h2>
                    <span className={styles.sectionCount}>{upcomingCount}</span>
                </div>
                {upcoming.length === 0 ? (
                    <div className={styles.emptyState}>
                        <span className={styles.emptyText}>Ingen kommende frister de neste 14 dagene.</span>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Bruker</th>
                                    <th>Kurs</th>
                                    <th>Frist</th>
                                    <th>Status</th>
                                    <th className={styles.tableNumCol}>Dager igjen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {upcoming.map((row) => (
                                    <tr key={row.enrollmentId}>
                                        <td>
                                            <div className={styles.cellUser}>
                                                <span className={styles.cellUserName}>{row.userName}</span>
                                                {row.userEmail && (
                                                    <span className={styles.cellUserEmail}>{row.userEmail}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>{row.courseTitle}</td>
                                        <td className={styles.cellDate}>{formatDate(row.dueAt)}</td>
                                        <td>
                                            <span className={`${styles.statusBadge} ${statusBadgeClass(row.status)}`}>
                                                {STATUS_LABELS[row.status]}
                                            </span>
                                        </td>
                                        <td className={styles.tableNumCol}>
                                            <span className={styles.daysUntil}>
                                                {row.daysUntilDue ?? 0} dager
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Recertification table */}
            {recertification.length > 0 && (
                <section className={styles.tableSection}>
                    <div className={styles.sectionHeader}>
                        <AlarmClock size={18} className={styles.sectionHeaderIcon} />
                        <h2 className={styles.sectionTitle}>Resertifisering forfalt</h2>
                        <span className={styles.sectionCount}>{recertCount}</span>
                    </div>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Bruker</th>
                                    <th>Kurs</th>
                                    <th>Fullført</th>
                                    <th className={styles.tableNumCol}>Dager siden forfall</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recertification.map((row) => (
                                    <tr key={row.enrollmentId}>
                                        <td>
                                            <div className={styles.cellUser}>
                                                <span className={styles.cellUserName}>{row.userName}</span>
                                                {row.userEmail && (
                                                    <span className={styles.cellUserEmail}>{row.userEmail}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>{row.courseTitle}</td>
                                        <td className={styles.cellDate}>{formatDate(row.completedAt)}</td>
                                        <td className={styles.tableNumCol}>
                                            <span className={styles.daysOverdue}>
                                                {row.daysSinceDue} dager
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* Toast */}
            {toast && (
                <div className={styles.toast}>
                    <CheckCircle2 size={16} />
                    {toast}
                </div>
            )}
        </div>
    );
}
