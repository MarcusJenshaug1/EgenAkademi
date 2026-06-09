'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { checkAccess } from '@/lib/features';
import type { EnrollmentStatus } from '@prisma/client';

// ── Helpers ─────────────────────────────────────────────────

async function requireTenantAdmin() {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
        throw new Error('Ikke autentisert');
    }
    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        throw new Error('Ikke tilgang');
    }
    return { userId: session.user.id, tenantId: session.user.tenantId };
}

/** Avrund til én desimal og returner som tall (0–100). */
function rate(part: number, whole: number): number {
    if (whole <= 0) return 0;
    return Math.round((part / whole) * 1000) / 10;
}

/**
 * Escape ett CSV-felt.
 * 1) Nøytraliser CSV-/formel-injection: felter som starter med =, +, -, @, tab
 *    eller CR kan tolkes som formler av Excel/Sheets. Prefiks med ' for å
 *    tvinge tekst-tolkning.
 * 2) Pakk i anførselstegn hvis feltet inneholder , " eller linjeskift (RFC 4180).
 */
function csvField(value: unknown): string {
    if (value === null || value === undefined) return '';
    let str = String(value);
    if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
    }
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/** Bygg en CSV-streng fra header-rad + datarader. */
function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
    const lines = [header.map(csvField).join(',')];
    for (const row of rows) {
        lines.push(row.map(csvField).join(','));
    }
    // BOM for korrekt UTF-8-visning i Excel
    return '﻿' + lines.join('\r\n');
}

const ENROLLMENT_STATUSES: EnrollmentStatus[] = [
    'NOT_STARTED',
    'IN_PROGRESS',
    'COMPLETED',
    'OVERDUE',
    'EXEMPT',
];

// ── Types ───────────────────────────────────────────────────

export interface OverviewMetrics {
    activeUsers: number;
    totalCourses: number;
    totalEnrollments: number;
    enrollmentsByStatus: Record<EnrollmentStatus, number>;
    completionRate: number;
    certificatesIssued: number;
    upcomingSessions: number;
    sessionAttendanceRate: number;
}

export interface CourseCompletionRow {
    courseId: string;
    title: string;
    enrolled: number;
    completed: number;
    completionRate: number;
    avgCompletionPercent: number;
    overdue: number;
}

export interface GroupBreakdownRow {
    groupId: string;
    name: string;
    color: string | null;
    members: number;
    enrollments: number;
    completed: number;
    completionRate: number;
}

export interface DepartmentBreakdownRow {
    department: string;
    members: number;
    enrollments: number;
    completed: number;
    completionRate: number;
}

export interface ActivityDay {
    date: string; // ISO yyyy-mm-dd
    count: number;
}

// ── Overview KPIs ───────────────────────────────────────────

export async function getOverviewMetrics(): Promise<
    { metrics: OverviewMetrics } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();
        const now = new Date();

        const [
            activeUsers,
            totalCourses,
            totalEnrollments,
            statusGroups,
            certificatesIssued,
            upcomingSessions,
            attended,
            noShow,
        ] = await Promise.all([
            prisma.user.count({ where: { tenantId, active: true } }),
            prisma.course.count({ where: { tenantId } }),
            prisma.courseEnrollment.count({ where: { tenantId } }),
            prisma.courseEnrollment.groupBy({
                by: ['status'],
                where: { tenantId },
                _count: { _all: true },
            }),
            prisma.certificate.count({ where: { tenantId } }),
            prisma.trainingSession.count({
                where: { tenantId, startsAt: { gt: now } },
            }),
            prisma.sessionEnrollment.count({
                where: { tenantId, status: 'ATTENDED' },
            }),
            prisma.sessionEnrollment.count({
                where: { tenantId, status: 'NO_SHOW' },
            }),
        ]);

        const enrollmentsByStatus = ENROLLMENT_STATUSES.reduce(
            (acc, status) => {
                acc[status] = 0;
                return acc;
            },
            {} as Record<EnrollmentStatus, number>
        );
        for (const g of statusGroups) {
            enrollmentsByStatus[g.status] = g._count._all;
        }

        // Fullføringsrate = COMPLETED / (alle unntatt EXEMPT)
        const completed = enrollmentsByStatus.COMPLETED;
        const completionBase = totalEnrollments - enrollmentsByStatus.EXEMPT;

        return {
            metrics: {
                activeUsers,
                totalCourses,
                totalEnrollments,
                enrollmentsByStatus,
                completionRate: rate(completed, completionBase),
                certificatesIssued,
                upcomingSessions,
                sessionAttendanceRate: rate(attended, attended + noShow),
            },
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Per kurs: fullføring ────────────────────────────────────

export async function getCourseCompletion(): Promise<
    { courses: CourseCompletionRow[] } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const courses = await prisma.course.findMany({
            where: { tenantId },
            select: {
                id: true,
                title: true,
                enrollments: {
                    select: {
                        status: true,
                        completionPercentCached: true,
                    },
                },
            },
            orderBy: { title: 'asc' },
        });

        const rows: CourseCompletionRow[] = courses.map((c) => {
            const enrolled = c.enrollments.length;
            const completed = c.enrollments.filter((e) => e.status === 'COMPLETED').length;
            const overdue = c.enrollments.filter((e) => e.status === 'OVERDUE').length;
            const avgCompletionPercent =
                enrolled > 0
                    ? Math.round(
                          c.enrollments.reduce((sum, e) => sum + e.completionPercentCached, 0) /
                              enrolled
                      )
                    : 0;

            return {
                courseId: c.id,
                title: c.title,
                enrolled,
                completed,
                completionRate: rate(completed, enrolled),
                avgCompletionPercent,
                overdue,
            };
        });

        // Sorter mest aktive først (flest innmeldinger), deretter alfabetisk
        rows.sort((a, b) => b.enrolled - a.enrolled || a.title.localeCompare(b.title, 'nb-NO'));

        return { courses: rows };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Per gruppe + per avdeling ───────────────────────────────

export async function getGroupBreakdown(): Promise<
    {
        groups: GroupBreakdownRow[];
        departments: DepartmentBreakdownRow[];
    } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const [groups, users] = await Promise.all([
            prisma.group.findMany({
                where: { tenantId },
                select: {
                    id: true,
                    name: true,
                    color: true,
                    members: {
                        select: {
                            user: {
                                select: {
                                    courseEnrollments: {
                                        where: { tenantId },
                                        select: { status: true },
                                    },
                                },
                            },
                        },
                    },
                },
                orderBy: { name: 'asc' },
            }),
            prisma.user.findMany({
                where: { tenantId },
                select: {
                    department: true,
                    courseEnrollments: {
                        where: { tenantId },
                        select: { status: true },
                    },
                },
            }),
        ]);

        const groupRows: GroupBreakdownRow[] = groups.map((g) => {
            const members = g.members.length;
            let enrollments = 0;
            let completed = 0;
            for (const m of g.members) {
                for (const e of m.user.courseEnrollments) {
                    enrollments++;
                    if (e.status === 'COMPLETED') completed++;
                }
            }
            return {
                groupId: g.id,
                name: g.name,
                color: g.color,
                members,
                enrollments,
                completed,
                completionRate: rate(completed, enrollments),
            };
        });
        groupRows.sort((a, b) => b.members - a.members || a.name.localeCompare(b.name, 'nb-NO'));

        // Avdelingsfordeling
        const deptMap = new Map<
            string,
            { members: number; enrollments: number; completed: number }
        >();
        for (const u of users) {
            const key = u.department?.trim() || 'Ingen avdeling';
            const entry = deptMap.get(key) ?? { members: 0, enrollments: 0, completed: 0 };
            entry.members++;
            for (const e of u.courseEnrollments) {
                entry.enrollments++;
                if (e.status === 'COMPLETED') entry.completed++;
            }
            deptMap.set(key, entry);
        }

        const departmentRows: DepartmentBreakdownRow[] = Array.from(deptMap.entries()).map(
            ([department, v]) => ({
                department,
                members: v.members,
                enrollments: v.enrollments,
                completed: v.completed,
                completionRate: rate(v.completed, v.enrollments),
            })
        );
        departmentRows.sort(
            (a, b) => b.members - a.members || a.department.localeCompare(b.department, 'nb-NO')
        );

        return { groups: groupRows, departments: departmentRows };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Aktivitet over tid (ProgressEvent per dag) ──────────────

export async function getActivityTimeline(
    days = 30
): Promise<{ timeline: ActivityDay[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const span = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);

        // Start fra midnatt for (span - 1) dager siden, slik at vi får `span` hele dager t.o.m. i dag.
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - (span - 1));

        const events = await prisma.progressEvent.findMany({
            where: { tenantId, createdAt: { gte: start } },
            select: { createdAt: true },
        });

        // Forhåndsfyll alle dager med 0 for jevn akse.
        const counts = new Map<string, number>();
        for (let i = 0; i < span; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            counts.set(toIsoDay(d), 0);
        }
        for (const e of events) {
            const key = toIsoDay(e.createdAt);
            if (counts.has(key)) {
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
        }

        const timeline: ActivityDay[] = Array.from(counts.entries()).map(([date, count]) => ({
            date,
            count,
        }));

        return { timeline };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/** Lokal yyyy-mm-dd uten tidssone-drift. */
function toIsoDay(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ── CSV-eksport (Plus-gated) ────────────────────────────────

export type CsvReport = 'completions' | 'users' | 'courses';

export async function exportCsv(
    report: CsvReport
): Promise<{ csv: string; filename: string } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { plan: true, addons: true, trialEndsAt: true },
        });
        if (!tenant) return { error: 'Ukjent feil' };

        const access = checkAccess(tenant, 'csv-export');
        if (!access.allowed) {
            return {
                error:
                    access.reason ??
                    'CSV-eksport krever Plus-planen eller høyere. Oppgrader for å eksportere data.',
            };
        }

        const stamp = toIsoDay(new Date());

        if (report === 'completions') {
            const enrollments = await prisma.courseEnrollment.findMany({
                where: { tenantId },
                select: {
                    status: true,
                    completionPercentCached: true,
                    enrolledAt: true,
                    completedAt: true,
                    dueAt: true,
                    user: {
                        select: {
                            email: true,
                            firstName: true,
                            lastName: true,
                            department: true,
                        },
                    },
                    course: { select: { title: true } },
                },
                orderBy: { enrolledAt: 'desc' },
            });

            const header = [
                'Bruker',
                'E-post',
                'Avdeling',
                'Kurs',
                'Status',
                'Fullført %',
                'Innmeldt',
                'Fullført',
                'Frist',
            ];
            const rows = enrollments.map((e) => [
                [e.user.firstName, e.user.lastName].filter(Boolean).join(' '),
                e.user.email,
                e.user.department,
                e.course.title,
                e.status,
                e.completionPercentCached,
                e.enrolledAt ? toIsoDay(e.enrolledAt) : '',
                e.completedAt ? toIsoDay(e.completedAt) : '',
                e.dueAt ? toIsoDay(e.dueAt) : '',
            ]);

            return {
                csv: toCsv(header, rows),
                filename: `fullforinger-${stamp}.csv`,
            };
        }

        if (report === 'users') {
            const users = await prisma.user.findMany({
                where: { tenantId },
                select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                    jobTitle: true,
                    department: true,
                    globalRole: true,
                    active: true,
                    createdAt: true,
                    _count: { select: { courseEnrollments: true } },
                },
                orderBy: { createdAt: 'desc' },
            });

            const header = [
                'Fornavn',
                'Etternavn',
                'E-post',
                'Stilling',
                'Avdeling',
                'Rolle',
                'Status',
                'Innmeldinger',
                'Opprettet',
            ];
            const rows = users.map((u) => [
                u.firstName,
                u.lastName,
                u.email,
                u.jobTitle,
                u.department,
                u.globalRole,
                u.active ? 'Aktiv' : 'Inaktiv',
                u._count.courseEnrollments,
                toIsoDay(u.createdAt),
            ]);

            return {
                csv: toCsv(header, rows),
                filename: `brukere-${stamp}.csv`,
            };
        }

        // report === 'courses'
        const courses = await prisma.course.findMany({
            where: { tenantId },
            select: {
                title: true,
                slug: true,
                status: true,
                visibility: true,
                enrollments: {
                    select: { status: true, completionPercentCached: true },
                },
            },
            orderBy: { title: 'asc' },
        });

        const header = [
            'Kurs',
            'Slug',
            'Status',
            'Synlighet',
            'Innmeldinger',
            'Fullført',
            'Fullføringsrate %',
            'Snitt fullført %',
        ];
        const rows = courses.map((c) => {
            const enrolled = c.enrollments.length;
            const completed = c.enrollments.filter((e) => e.status === 'COMPLETED').length;
            const avg =
                enrolled > 0
                    ? Math.round(
                          c.enrollments.reduce((s, e) => s + e.completionPercentCached, 0) / enrolled
                      )
                    : 0;
            return [
                c.title,
                c.slug,
                c.status,
                c.visibility,
                enrolled,
                completed,
                rate(completed, enrolled),
                avg,
            ];
        });

        return {
            csv: toCsv(header, rows),
            filename: `kurs-${stamp}.csv`,
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}
