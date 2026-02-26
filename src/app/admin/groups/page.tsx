import { listGroups, getGroupStats } from '@/app/actions/groupActions';
import GroupsClient from './GroupsClient';

export default async function GroupsPage() {
    const [groupsResult, statsResult] = await Promise.all([
        listGroups(),
        getGroupStats(),
    ]);

    const groups = 'groups' in groupsResult ? groupsResult.groups : [];
    const stats = 'totalGroups' in statsResult
        ? statsResult
        : { totalGroups: 0, totalMemberships: 0, emptyGroups: 0 };

    return (
        <GroupsClient
            initialGroups={groups}
            initialStats={stats}
        />
    );
}
