import { getRolesOverview } from '@/app/actions/roleActions';
import RolesClient from './RolesClient';

export default async function RolesPage() {
    const result = await getRolesOverview();
    const roles = 'roles' in result ? result.roles : [];

    return <RolesClient initialRoles={roles} />;
}
