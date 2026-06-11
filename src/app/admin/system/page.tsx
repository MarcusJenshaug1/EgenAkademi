import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import {
    listAllTenants,
    getSystemStats,
    type TenantListItem,
    type SystemStats,
} from '@/app/actions/systemAdminActions';
import SystemAdminClient from './SystemAdminClient';

export default async function SystemAdminPage() {
    const session = await auth();

    // Cross-tenant surface: only SYSTEM_ADMIN may see this. TENANT_ADMIN is sent back.
    if (!session?.user) {
        redirect('/login');
    }
    if (session.user.globalRole !== 'SYSTEM_ADMIN') {
        redirect('/admin');
    }

    const [tenantsResult, statsResult] = await Promise.all([
        listAllTenants(),
        getSystemStats(),
    ]);

    const initialTenants: TenantListItem[] =
        'tenants' in tenantsResult ? tenantsResult.tenants : [];

    const initialStats: SystemStats =
        'totalTenants' in statsResult
            ? statsResult
            : {
                  totalTenants: 0,
                  totalUsers: 0,
                  tenantsPerPlan: { FREE: 0, STANDARD: 0, PLUS: 0, ENTERPRISE: 0 },
              };

    return <SystemAdminClient initialTenants={initialTenants} initialStats={initialStats} />;
}
