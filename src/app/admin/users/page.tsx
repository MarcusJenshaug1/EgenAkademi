import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import UsersClient from './UsersClient';

export default async function UsersPage() {
    const session = await auth();

    if (!session?.user?.tenantId) {
        redirect('/admin');
    }

    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        redirect('/admin');
    }

    const tenantId = session.user.tenantId;

    // Fetch initial data server-side
    const [usersRaw, total, active, admins, inactive] = await Promise.all([
        prisma.user.findMany({
            where: { tenantId },
            select: {
                id: true,
                name: true,
                email: true,
                firstName: true,
                lastName: true,
                globalRole: true,
                active: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { groupMemberships: true } },
            },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where: { tenantId } }),
        prisma.user.count({ where: { tenantId, active: true } }),
        prisma.user.count({ where: { tenantId, globalRole: { in: ['TENANT_ADMIN', 'SYSTEM_ADMIN'] } } }),
        prisma.user.count({ where: { tenantId, active: false } }),
    ]);

    const users = usersRaw.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        globalRole: u.globalRole,
        active: u.active,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        groupCount: u._count.groupMemberships,
    }));

    return (
        <UsersClient
            initialUsers={users}
            stats={{ total, active, admins, inactive }}
        />
    );
}
