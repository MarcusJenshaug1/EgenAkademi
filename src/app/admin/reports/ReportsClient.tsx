'use client';

import { useState, useEffect } from 'react';
import {
    BarChart3, TrendingUp, Award, Users, Download, AlertTriangle, X,
    BookOpen, CalendarClock, Lock, CheckCircle, Layers, Building2,
} from 'lucide-react';
import styles from './reports.module.css';
import {
    getGroupBreakdown,
    getActivityTimeline,
    exportCsv,
    type OverviewMetrics,
    type CourseCompletionRow,
    type GroupBreakdownRow,
    type DepartmentBreakdownRow,
    type ActivityDay,
    type CsvReport,
} from '@/app/actions/reportActions';

// ── Labels ──────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
    NOT_STARTED: 'Ikke startet',
    IN_PROGRESS: 'Pågår',
    COMPLETED: 'Fullført',
    OVERDUE: 'Forfalt',
    EXEMPT: 'Fritatt',
};

const STATUS_ORDER = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'EXEMPT'] as const;

// ── Helpers ─────────────────────────────────────────────────

function clampPct(n: number): number {
    if (Number.isNaN(n)) return 0;
    return Math.min(100, Math.max(0, n));
}

/** Velg barge-farge: høy fullføring = success, ellers accent. */
function rateColor(rate: number): string {
    return rate >= 75 ? 'var(--color-success)' : 'var(--color-accent-blue)';
}

function formatDayLabel(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

/** Klient-side nedlasting av CSV via Blob + anker. */
function downloadCsv(csv: string, filename: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

// ── Component ───────────────────────────────────────────────

interface ReportsClientProps {
    metrics: OverviewMetrics | null;
    courses: CourseCompletionRow[];
    loadError: string | null;
}

export default function ReportsClient({ metrics, courses, loadError }: ReportsClientProps) {
    const [groups, setGroups] = useState<GroupBreakdownRow[]>([]);
    const [departments, setDepartments] = useState<DepartmentBreakdownRow[]>([]);
    const [timeline, setTimeline] = useState<ActivityDay[]>([]);
    const [breakdownLoading, setBreakdownLoading] = useState(true);
    const [error, setError] = useState<string | null>(loadError);
    const [upgradeHint, setUpgradeHint] = useState<string | null>(null);
    const [exporting, setExporting] = useState<CsvReport | null>(null);

    // Last sekundærdata på klienten.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [breakdown, activity] = await Promise.all([
                getGroupBreakdown(),
                getActivityTimeline(30),
            ]);
            if (cancelled) return;
            if ('groups' in breakdown) {
                setGroups(breakdown.groups);
                setDepartments(breakdown.departments);
            } else {
                setError(breakdown.error);
            }
            if ('timeline' in activity) {
                setTimeline(activity.timeline);
            }
            setBreakdownLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // Auto-skjul oppgraderingshint.
    useEffect(() => {
        if (upgradeHint) {
            const t = setTimeout(() => setUpgradeHint(null), 6000);
            return () => clearTimeout(t);
        }
    }, [upgradeHint]);

    async function handleExport(report: CsvReport) {
        setExporting(report);
        setUpgradeHint(null);
        const result = await exportCsv(report);
        setExporting(null);
        if ('csv' in result) {
            downloadCsv(result.csv, result.filename);
        } else {
            setUpgradeHint(result.error);
        }
    }

    const maxActivity = timeline.reduce((max, d) => Math.max(max, d.count), 0);

    return (
        <div className={styles.reportsPage}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Rapporter</h1>
                    <p className={styles.subtitle}>
                        Innsikt i bruk, fullføring og aktivitet i organisasjonen
                    </p>
                </div>
                <div className={styles.exportGroup}>
                    <button
                        className={styles.exportButton}
                        onClick={() => handleExport('completions')}
                        disabled={exporting !== null}
                    >
                        <Download size={16} />
                        {exporting === 'completions' ? 'Eksporterer…' : 'Fullføringer'}
                    </button>
                    <button
                        className={styles.exportButton}
                        onClick={() => handleExport('users')}
                        disabled={exporting !== null}
                    >
                        <Download size={16} />
                        {exporting === 'users' ? 'Eksporterer…' : 'Brukere'}
                    </button>
                    <button
                        className={styles.exportButton}
                        onClick={() => handleExport('courses')}
                        disabled={exporting !== null}
                    >
                        <Download size={16} />
                        {exporting === 'courses' ? 'Eksporterer…' : 'Kurs'}
                    </button>
                </div>
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

            {/* Upgrade hint (CSV gating) */}
            {upgradeHint && (
                <div className={styles.upgradeBanner}>
                    <Lock size={16} />
                    {upgradeHint}
                    <button
                        className={styles.bannerClose}
                        onClick={() => setUpgradeHint(null)}
                        aria-label="Lukk melding"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* KPI cards */}
            {metrics && (
                <div className={styles.kpiRow}>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiIcon}>
                            <Users size={20} />
                        </div>
                        <div className={styles.kpiBody}>
                            <span className={styles.kpiLabel}>Aktive brukere</span>
                            <span className={styles.kpiValue}>{metrics.activeUsers}</span>
                        </div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiIcon}>
                            <BookOpen size={20} />
                        </div>
                        <div className={styles.kpiBody}>
                            <span className={styles.kpiLabel}>Kurs</span>
                            <span className={styles.kpiValue}>{metrics.totalCourses}</span>
                        </div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiIcon}>
                            <Layers size={20} />
                        </div>
                        <div className={styles.kpiBody}>
                            <span className={styles.kpiLabel}>Innmeldinger</span>
                            <span className={styles.kpiValue}>{metrics.totalEnrollments}</span>
                        </div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiIcon}>
                            <TrendingUp size={20} />
                        </div>
                        <div className={styles.kpiBody}>
                            <span className={styles.kpiLabel}>Fullføringsrate</span>
                            <span className={styles.kpiValue}>{metrics.completionRate}%</span>
                        </div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiIcon}>
                            <Award size={20} />
                        </div>
                        <div className={styles.kpiBody}>
                            <span className={styles.kpiLabel}>Sertifikater</span>
                            <span className={styles.kpiValue}>{metrics.certificatesIssued}</span>
                        </div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiIcon}>
                            <CalendarClock size={20} />
                        </div>
                        <div className={styles.kpiBody}>
                            <span className={styles.kpiLabel}>Kommende sesjoner</span>
                            <span className={styles.kpiValue}>{metrics.upcomingSessions}</span>
                        </div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiIcon}>
                            <CheckCircle size={20} />
                        </div>
                        <div className={styles.kpiBody}>
                            <span className={styles.kpiLabel}>Oppmøterate</span>
                            <span className={styles.kpiValue}>{metrics.sessionAttendanceRate}%</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Enrollment status distribution */}
            {metrics && (
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Innmeldinger etter status</h2>
                    </div>
                    <div className={styles.statusGrid}>
                        {STATUS_ORDER.map((status) => {
                            const count = metrics.enrollmentsByStatus[status];
                            const share = clampPct(
                                metrics.totalEnrollments > 0
                                    ? (count / metrics.totalEnrollments) * 100
                                    : 0
                            );
                            return (
                                <div key={status} className={styles.statusItem}>
                                    <div className={styles.statusTop}>
                                        <span className={styles.statusName}>
                                            {STATUS_LABELS[status]}
                                        </span>
                                        <span className={styles.statusCount}>{count}</span>
                                    </div>
                                    <div className={styles.progressTrack}>
                                        <div
                                            className={styles.progressFill}
                                            style={{
                                                width: `${share}%`,
                                                background:
                                                    status === 'COMPLETED'
                                                        ? 'var(--color-success)'
                                                        : status === 'OVERDUE'
                                                        ? 'var(--color-danger)'
                                                        : 'var(--color-accent-blue)',
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Activity timeline */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Aktivitet siste 30 dager</h2>
                    <span className={styles.sectionMeta}>
                        <BarChart3 size={14} /> Progresjonshendelser per dag
                    </span>
                </div>
                {breakdownLoading ? (
                    <div className={styles.loading}>
                        <div className={styles.spinner} />
                        Laster aktivitet…
                    </div>
                ) : timeline.length === 0 ? (
                    <div className={styles.emptyState}>
                        <span className={styles.emptyText}>Ingen aktivitet registrert ennå.</span>
                    </div>
                ) : (
                    <div className={styles.chart}>
                        <div className={styles.chartBars}>
                            {timeline.map((day) => {
                                const heightPct =
                                    maxActivity > 0 ? (day.count / maxActivity) * 100 : 0;
                                return (
                                    <div key={day.date} className={styles.chartCol}>
                                        <div className={styles.chartBarWrap}>
                                            <div
                                                className={styles.chartBar}
                                                style={{
                                                    height: `${Math.max(heightPct, day.count > 0 ? 4 : 0)}%`,
                                                    background: 'var(--color-accent-blue)',
                                                }}
                                                title={`${formatDayLabel(day.date)}: ${day.count}`}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className={styles.chartAxis}>
                            <span>{formatDayLabel(timeline[0].date)}</span>
                            <span>{formatDayLabel(timeline[timeline.length - 1].date)}</span>
                        </div>
                    </div>
                )}
            </section>

            {/* Course completion table */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Fullføring per kurs</h2>
                </div>
                <div className={styles.tableWrapper}>
                    {courses.length === 0 ? (
                        <div className={styles.emptyState}>
                            <span className={styles.emptyText}>Ingen kurs registrert ennå.</span>
                        </div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Kurs</th>
                                    <th>Innmeldt</th>
                                    <th>Fullført</th>
                                    <th>Forfalt</th>
                                    <th className={styles.barCol}>Fullføringsrate</th>
                                    <th className={styles.barCol}>Snitt progresjon</th>
                                </tr>
                            </thead>
                            <tbody>
                                {courses.map((c) => (
                                    <tr key={c.courseId}>
                                        <td>
                                            <span className={styles.courseTitle}>{c.title}</span>
                                        </td>
                                        <td>{c.enrolled}</td>
                                        <td>{c.completed}</td>
                                        <td>
                                            {c.overdue > 0 ? (
                                                <span className={styles.overdue}>{c.overdue}</span>
                                            ) : (
                                                <span className={styles.muted}>0</span>
                                            )}
                                        </td>
                                        <td className={styles.barCol}>
                                            <div className={styles.barRow}>
                                                <div className={styles.progressTrack}>
                                                    <div
                                                        className={styles.progressFill}
                                                        style={{
                                                            width: `${clampPct(c.completionRate)}%`,
                                                            background: rateColor(c.completionRate),
                                                        }}
                                                    />
                                                </div>
                                                <span className={styles.barValue}>
                                                    {c.completionRate}%
                                                </span>
                                            </div>
                                        </td>
                                        <td className={styles.barCol}>
                                            <div className={styles.barRow}>
                                                <div className={styles.progressTrack}>
                                                    <div
                                                        className={styles.progressFill}
                                                        style={{
                                                            width: `${clampPct(c.avgCompletionPercent)}%`,
                                                            background: 'var(--color-accent-blue)',
                                                        }}
                                                    />
                                                </div>
                                                <span className={styles.barValue}>
                                                    {c.avgCompletionPercent}%
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>

            {/* Group + department breakdown */}
            <div className={styles.breakdownGrid}>
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Fullføring per gruppe</h2>
                        <span className={styles.sectionMeta}>
                            <Users size={14} />
                        </span>
                    </div>
                    <div className={styles.tableWrapper}>
                        {breakdownLoading ? (
                            <div className={styles.loading}>
                                <div className={styles.spinner} />
                                Laster…
                            </div>
                        ) : groups.length === 0 ? (
                            <div className={styles.emptyState}>
                                <span className={styles.emptyText}>Ingen grupper ennå.</span>
                            </div>
                        ) : (
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Gruppe</th>
                                        <th>Medl.</th>
                                        <th>Innm.</th>
                                        <th className={styles.barCol}>Rate</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groups.map((g) => (
                                        <tr key={g.groupId}>
                                            <td>
                                                <span className={styles.groupCell}>
                                                    <span
                                                        className={styles.groupDot}
                                                        style={
                                                            g.color
                                                                ? { background: g.color }
                                                                : {
                                                                      background:
                                                                          'var(--color-accent-blue)',
                                                                  }
                                                        }
                                                    />
                                                    {g.name}
                                                </span>
                                            </td>
                                            <td>{g.members}</td>
                                            <td>{g.enrollments}</td>
                                            <td className={styles.barCol}>
                                                <div className={styles.barRow}>
                                                    <div className={styles.progressTrack}>
                                                        <div
                                                            className={styles.progressFill}
                                                            style={{
                                                                width: `${clampPct(g.completionRate)}%`,
                                                                background: rateColor(
                                                                    g.completionRate
                                                                ),
                                                            }}
                                                        />
                                                    </div>
                                                    <span className={styles.barValue}>
                                                        {g.completionRate}%
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Fullføring per avdeling</h2>
                        <span className={styles.sectionMeta}>
                            <Building2 size={14} />
                        </span>
                    </div>
                    <div className={styles.tableWrapper}>
                        {breakdownLoading ? (
                            <div className={styles.loading}>
                                <div className={styles.spinner} />
                                Laster…
                            </div>
                        ) : departments.length === 0 ? (
                            <div className={styles.emptyState}>
                                <span className={styles.emptyText}>Ingen avdelinger ennå.</span>
                            </div>
                        ) : (
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Avdeling</th>
                                        <th>Medl.</th>
                                        <th>Innm.</th>
                                        <th className={styles.barCol}>Rate</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {departments.map((d) => (
                                        <tr key={d.department}>
                                            <td>
                                                <span className={styles.deptCell}>
                                                    {d.department}
                                                </span>
                                            </td>
                                            <td>{d.members}</td>
                                            <td>{d.enrollments}</td>
                                            <td className={styles.barCol}>
                                                <div className={styles.barRow}>
                                                    <div className={styles.progressTrack}>
                                                        <div
                                                            className={styles.progressFill}
                                                            style={{
                                                                width: `${clampPct(d.completionRate)}%`,
                                                                background: rateColor(
                                                                    d.completionRate
                                                                ),
                                                            }}
                                                        />
                                                    </div>
                                                    <span className={styles.barValue}>
                                                        {d.completionRate}%
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
