import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';
import SessionsClient from './SessionsClient';
import UpgradeNotice from './UpgradeNotice';

export default async function SessionsPage() {
    const session = await auth();

    if (!session?.user?.tenantId) {
        redirect('/admin');
    }

    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        redirect('/admin');
    }

    const tenantId = session.user.tenantId;

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, addons: true, trialEndsAt: true },
    });

    const access = tenant
        ? checkAccess(tenant, 'session-events')
        : { allowed: false, reason: 'Ingen tilgang til denne funksjonen.' };

    if (!access.allowed) {
        return <UpgradeNotice reason={access.reason ?? 'Ingen tilgang til denne funksjonen.'} />;
    }

    const now = new Date();

    // Fetch initial list (upcoming) + stats server-side
    const [sessionsRaw, capacitySessions, upcomingCount, completedCount, totalEnrollments] =
        await Promise.all([
            prisma.trainingSession.findMany({
                where: { tenantId, endsAt: { gte: now } },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    format: true,
                    status: true,
                    location: true,
                    meetingUrl: true,
                    startsAt: true,
                    endsAt: true,
                    capacity: true,
                    courseId: true,
                    instructor: {
                        select: { firstName: true, lastName: true, name: true, email: true },
                    },
                    course: { select: { title: true } },
                    enrollments: { select: { status: true } },
                },
                orderBy: { startsAt: 'asc' },
            }),
            prisma.trainingSession.findMany({
                where: { tenantId, capacity: { not: null }, status: { not: 'CANCELLED' } },
                select: {
                    capacity: true,
                    enrollments: {
                        where: { status: { in: ['REGISTERED', 'ATTENDED'] } },
                        select: { id: true },
                    },
                },
            }),
            prisma.trainingSession.count({
                where: { tenantId, endsAt: { gte: now }, status: { not: 'CANCELLED' } },
            }),
            prisma.trainingSession.count({ where: { tenantId, status: 'COMPLETED' } }),
            prisma.sessionEnrollment.count({
                where: { tenantId, status: { in: ['REGISTERED', 'ATTENDED'] } },
            }),
        ]);

    const displayName = (u: {
        firstName: string | null;
        lastName: string | null;
        name: string | null;
        email: string | null;
    }) => {
        if (u.firstName || u.lastName) return [u.firstName, u.lastName].filter(Boolean).join(' ');
        return u.name || u.email || 'Ukjent';
    };

    const sessions = sessionsRaw.map((s) => {
        const registeredCount = s.enrollments.filter(
            (e) => e.status === 'REGISTERED' || e.status === 'ATTENDED'
        ).length;
        const waitlistCount = s.enrollments.filter((e) => e.status === 'WAITLISTED').length;
        return {
            id: s.id,
            title: s.title,
            description: s.description,
            format: s.format,
            status: s.status,
            location: s.location,
            meetingUrl: s.meetingUrl,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            capacity: s.capacity,
            instructorName: s.instructor ? displayName(s.instructor) : null,
            courseId: s.courseId,
            courseTitle: s.course?.title ?? null,
            registeredCount,
            waitlistCount,
        };
    });

    let avgFillRate = 0;
    if (capacitySessions.length > 0) {
        const sum = capacitySessions.reduce((acc, s) => {
            if (!s.capacity || s.capacity <= 0) return acc;
            return acc + Math.min(1, s.enrollments.length / s.capacity);
        }, 0);
        avgFillRate = Math.round((sum / capacitySessions.length) * 100);
    }

    return (
        <SessionsClient
            initialSessions={sessions}
            stats={{ upcomingCount, totalEnrollments, avgFillRate, completedCount }}
        />
    );
}
