'use client';

import { useState, useEffect } from 'react';
import {
    User, ShieldCheck, ShieldAlert, ChevronDown,
    CheckCircle, Search, Users
} from 'lucide-react';
import {
    getRolesOverview, listUsersByRole, updateUserRole,
    type RoleInfo,
} from '@/app/actions/roleActions';
import styles from './roles.module.css';

function getInitials(user: { firstName?: string | null; lastName?: string | null; name?: string | null; email?: string | null }): string {
    if (user.firstName && user.lastName) return (user.firstName[0] + user.lastName[0]).toUpperCase();
    if (user.name) return user.name.substring(0, 2).toUpperCase();
    if (user.email) return user.email.substring(0, 2).toUpperCase();
    return '??';
}

const ROLE_ICONS: Record<string, { icon: typeof User; className: string }> = {
    USER: { icon: User, className: styles.roleIconUser },
    TENANT_ADMIN: { icon: ShieldCheck, className: styles.roleIconAdmin },
    SYSTEM_ADMIN: { icon: ShieldAlert, className: styles.roleIconSystem },
};

interface RolesClientProps {
    initialRoles: RoleInfo[];
}

type RoleUser = {
    id: string;
    name: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    globalRole: string;
    active: boolean;
};

export default function RolesClient({ initialRoles }: RolesClientProps) {
    const [roles, setRoles] = useState<RoleInfo[]>(initialRoles);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [roleUsers, setRoleUsers] = useState<Record<string, RoleUser[]>>({});
    const [userSearch, setUserSearch] = useState('');
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    function showToast(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    }

    async function refreshRoles() {
        const result = await getRolesOverview();
        if ('roles' in result) setRoles(result.roles);
    }

    async function toggleExpand(roleKey: string) {
        if (expanded === roleKey) {
            setExpanded(null);
            return;
        }
        setExpanded(roleKey);
        setUserSearch('');
        setError(null);
        setLoadingUsers(true);
        const result = await listUsersByRole(roleKey);
        setLoadingUsers(false);
        if ('users' in result) {
            setRoleUsers((prev) => ({ ...prev, [roleKey]: result.users }));
        }
    }

    // Search within expanded role
    useEffect(() => {
        if (!expanded) return;
        const t = setTimeout(async () => {
            setLoadingUsers(true);
            const result = await listUsersByRole(expanded, userSearch || undefined);
            setLoadingUsers(false);
            if ('users' in result) {
                setRoleUsers((prev) => ({ ...prev, [expanded]: result.users }));
            }
        }, 300);
        return () => clearTimeout(t);
    }, [userSearch, expanded]);

    async function handleRoleChange(userId: string, newRole: string) {
        setError(null);
        const result = await updateUserRole(userId, newRole as 'USER' | 'TENANT_ADMIN' | 'SYSTEM_ADMIN');
        if ('error' in result) {
            setError(result.error);
            return;
        }
        showToast('Rolle oppdatert');
        // Refresh role overview and users
        refreshRoles();
        if (expanded) {
            const usersResult = await listUsersByRole(expanded, userSearch || undefined);
            if ('users' in usersResult) {
                setRoleUsers((prev) => ({ ...prev, [expanded]: usersResult.users }));
            }
        }
    }

    return (
        <div className={styles.rolesPage}>
            <div className={styles.header}>
                <h1 className={styles.title}>Roller og tilgang</h1>
                <p className={styles.subtitle}>
                    Oversikt over roller og tilgangsnivåer i organisasjonen. Klikk på en rolle for å se og administrere brukere.
                </p>
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}

            <div className={styles.roleGrid}>
                {roles.map((role) => {
                    const iconCfg = ROLE_ICONS[role.key] || ROLE_ICONS.USER;
                    const IconComp = iconCfg.icon;
                    const isExpanded = expanded === role.key;
                    const users = roleUsers[role.key] || [];

                    return (
                        <div key={role.key} className={styles.roleCard}>
                            <div
                                className={styles.roleHeader}
                                onClick={() => toggleExpand(role.key)}
                            >
                                <div className={styles.roleHeaderLeft}>
                                    <div className={`${styles.roleIcon} ${iconCfg.className}`}>
                                        <IconComp size={22} />
                                    </div>
                                    <div className={styles.roleInfo}>
                                        <span className={styles.roleName}>{role.label}</span>
                                        <span className={styles.roleDesc}>{role.description}</span>
                                    </div>
                                </div>
                                <div className={styles.roleHeaderRight}>
                                    <span className={styles.userCount}>
                                        <Users size={14} />
                                        {role.userCount} {role.userCount === 1 ? 'bruker' : 'brukere'}
                                    </span>
                                    <ChevronDown
                                        size={18}
                                        className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}
                                    />
                                </div>
                            </div>

                            {isExpanded && (
                                <div className={styles.roleBody}>
                                    {/* Permissions */}
                                    <div className={styles.permissionsSection}>
                                        <div className={styles.sectionLabel}>Rettigheter</div>
                                        <div className={styles.permissionList}>
                                            {role.permissions.map((p, i) => (
                                                <div key={i} className={styles.permissionItem}>
                                                    <CheckCircle size={14} className={styles.permCheck} />
                                                    {p}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Users with this role */}
                                    <div className={styles.usersSection}>
                                        <div className={styles.userListHeader}>
                                            <span className={styles.sectionLabel}>
                                                Brukere med denne rollen
                                            </span>
                                            <input
                                                className={styles.searchInput}
                                                placeholder="Søk brukere..."
                                                value={userSearch}
                                                onChange={(e) => setUserSearch(e.target.value)}
                                            />
                                        </div>

                                        {loadingUsers ? (
                                            <div className={styles.loading}>
                                                <div className={styles.spinner} />
                                                Laster brukere...
                                            </div>
                                        ) : users.length === 0 ? (
                                            <div className={styles.emptyUsers}>
                                                Ingen brukere med denne rollen.
                                            </div>
                                        ) : (
                                            <div className={styles.userList}>
                                                {users.map((u) => (
                                                    <div key={u.id} className={styles.userRow}>
                                                        <div className={styles.avatar}>{getInitials(u)}</div>
                                                        <div className={styles.userInfo}>
                                                            <span className={styles.userName}>
                                                                {u.firstName && u.lastName
                                                                    ? `${u.firstName} ${u.lastName}`
                                                                    : u.name || u.email || 'Ukjent'}
                                                            </span>
                                                            <span className={styles.userEmail}>{u.email}</span>
                                                        </div>
                                                        <select
                                                            className={styles.roleSelect}
                                                            value={u.globalRole}
                                                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                        >
                                                            <option value="USER">Bruker</option>
                                                            <option value="TENANT_ADMIN">Organisasjonsadministrator</option>
                                                            <option value="SYSTEM_ADMIN">Systemadministrator</option>
                                                        </select>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Toast */}
            {toast && (
                <div className={styles.toast}>
                    <CheckCircle size={16} /> {toast}
                </div>
            )}
        </div>
    );
}
