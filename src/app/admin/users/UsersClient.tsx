'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    Search, UserPlus, Edit3, Trash2, Users, Shield,
    ShieldCheck, X, CheckCircle, AlertTriangle, Filter,
    Briefcase, MapPin, Phone, Clock,
} from 'lucide-react';
import styles from './users.module.css';
import {
    listUsers, inviteUser, updateUser, removeUser, getUser,
    type UserListItem, type UserDetail,
} from '@/app/actions/userActions';

// ── Role helpers ────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
    USER: 'Bruker',
    TENANT_ADMIN: 'Organisasjonsadministrator',
    SYSTEM_ADMIN: 'Systemadministrator',
};

function getRoleBadgeClass(role: string) {
    if (role === 'TENANT_ADMIN') return styles.roleAdmin;
    if (role === 'SYSTEM_ADMIN') return styles.roleSystem;
    return styles.roleUser;
}

function getInitials(user: UserListItem) {
    if (user.firstName && user.lastName) {
        return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.name) {
        const parts = user.name.split(' ');
        return parts.length > 1
            ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
            : user.name.substring(0, 2).toUpperCase();
    }
    if (user.email) return user.email.substring(0, 2).toUpperCase();
    return '??';
}

function getDisplayName(user: UserListItem) {
    if (user.firstName || user.lastName) {
        return [user.firstName, user.lastName].filter(Boolean).join(' ');
    }
    return user.name || user.email || 'Ukjent bruker';
}

function formatDate(d: Date) {
    return new Date(d).toLocaleDateString('nb-NO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

// ── Stats ───────────────────────────────────────────────────

interface StatsProps {
    total: number;
    active: number;
    admins: number;
    inactive: number;
}

// ── Main component ──────────────────────────────────────────

interface UsersClientProps {
    initialUsers: UserListItem[];
    stats: StatsProps;
}

export default function UsersClient({ initialUsers, stats }: UsersClientProps) {
    const [users, setUsers] = useState<UserListItem[]>(initialUsers);
    const [search, setSearch] = useState('');
    const [filterRole, setFilterRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Modals
    const [inviteOpen, setInviteOpen] = useState(false);
    const [editUser, setEditUser] = useState<UserDetail | null>(null);
    const [editLoading, setEditLoading] = useState(false);
    const [deleteUser, setDeleteUser] = useState<UserListItem | null>(null);

    // Open edit modal: fetch full user detail
    async function openEditModal(user: UserListItem) {
        setEditLoading(true);
        const result = await getUser(user.id);
        setEditLoading(false);
        if ('user' in result) {
            setEditUser(result.user);
        } else {
            setError(result.error);
        }
    }

    // ── Search & filter ─────────────────────────────────────

    const refreshUsers = useCallback(async (q?: string) => {
        setLoading(true);
        const result = await listUsers(q);
        if ('users' in result) {
            setUsers(result.users);
        } else {
            setError(result.error);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            refreshUsers(search || undefined);
        }, 300);
        return () => clearTimeout(timer);
    }, [search, refreshUsers]);

    const filteredUsers = filterRole
        ? users.filter((u) => u.globalRole === filterRole)
        : users;

    // ── Toast ───────────────────────────────────────────────

    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // ── Invite handler ──────────────────────────────────────

    async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const email = form.get('email') as string;
        const firstName = form.get('firstName') as string;
        const lastName = form.get('lastName') as string;
        const role = form.get('role') as string;

        const result = await inviteUser(email, {
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            globalRole: role as 'USER' | 'TENANT_ADMIN',
        });

        if ('success' in result) {
            setInviteOpen(false);
            setToast('Bruker ble invitert');
            refreshUsers(search || undefined);
        } else {
            setError(result.error);
        }
    }

    // ── Edit handler ────────────────────────────────────────

    async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!editUser) return;

        const form = new FormData(e.currentTarget);
        const firstName = form.get('firstName') as string;
        const lastName = form.get('lastName') as string;
        const role = form.get('role') as string;
        const active = form.get('active') === 'true';
        const jobTitle = form.get('jobTitle') as string;
        const department = form.get('department') as string;
        const phone = form.get('phone') as string;
        const location = form.get('location') as string;
        const workSchedule = form.get('workSchedule') as string;

        const result = await updateUser(editUser.id, {
            firstName,
            lastName,
            globalRole: role as 'USER' | 'TENANT_ADMIN',
            active,
            jobTitle: jobTitle || undefined,
            department: department || undefined,
            phone: phone || undefined,
            location: location || undefined,
            workSchedule: workSchedule || undefined,
        });

        if ('success' in result) {
            setEditUser(null);
            setToast('Bruker ble oppdatert');
            refreshUsers(search || undefined);
        } else {
            setError(result.error);
        }
    }

    // ── Delete handler ──────────────────────────────────────

    async function handleDelete() {
        if (!deleteUser) return;

        const result = await removeUser(deleteUser.id);
        if ('success' in result) {
            setDeleteUser(null);
            setToast('Bruker ble fjernet fra organisasjonen');
            refreshUsers(search || undefined);
        } else {
            setError(result.error);
        }
    }

    // ── Render ──────────────────────────────────────────────

    return (
        <div className={styles.usersPage}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Brukere</h1>
                    <p className={styles.subtitle}>
                        Administrer brukere i organisasjonen
                    </p>
                </div>
                <button
                    className={styles.inviteButton}
                    onClick={() => setInviteOpen(true)}
                >
                    <UserPlus size={18} />
                    Inviter bruker
                </button>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Totalt</span>
                    <span className={styles.statValue}>{stats.total}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Aktive</span>
                    <span className={styles.statValue}>{stats.active}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Administratorer</span>
                    <span className={styles.statValue}>{stats.admins}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Inaktive</span>
                    <span className={styles.statValue}>{stats.inactive}</span>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className={styles.errorBanner}>
                    <AlertTriangle size={16} />
                    {error}
                    <button
                        className={styles.modalClose}
                        onClick={() => setError(null)}
                        style={{ marginLeft: 'auto' }}
                        aria-label="Lukk feilmelding"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Toolbar */}
            <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        className={styles.searchInput}
                        type="text"
                        placeholder="Søk etter navn eller e-post..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <button
                    className={`${styles.filterButton} ${filterRole === null ? '' : styles.filterButtonActive}`}
                    onClick={() => setFilterRole(filterRole ? null : 'TENANT_ADMIN')}
                >
                    <Filter size={16} />
                    {filterRole ? ROLE_LABELS[filterRole] || 'Filter' : 'Filter'}
                </button>
            </div>

            {/* Table */}
            <div className={styles.tableWrapper}>
                {loading ? (
                    <div className={styles.loading}>
                        <div className={styles.spinner} />
                        Laster brukere...
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                            <Users size={28} />
                        </div>
                        <span className={styles.emptyTitle}>
                            {search ? 'Ingen treff' : 'Ingen brukere ennå'}
                        </span>
                        <span className={styles.emptyText}>
                            {search
                                ? `Ingen brukere matcher "${search}"`
                                : 'Inviter den første brukeren til organisasjonen.'}
                        </span>
                    </div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Bruker</th>
                                <th>Rolle</th>
                                <th>Status</th>
                                <th>Grupper</th>
                                <th>Opprettet</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map((user) => (
                                <tr
                                    key={user.id}
                                    onClick={() => openEditModal(user)}
                                >
                                    <td>
                                        <div className={styles.userCell}>
                                            <div className={`${styles.avatar} ${!user.active ? styles.avatarInactive : ''}`}>
                                                {user.avatarUrl ? (
                                                    <img src={user.avatarUrl} alt="" className={styles.avatarImg} />
                                                ) : (
                                                    getInitials(user)
                                                )}
                                            </div>
                                            <div className={styles.userInfo}>
                                                <span className={styles.userName}>
                                                    {getDisplayName(user)}
                                                </span>
                                                {user.jobTitle && (
                                                    <span className={styles.userJobTitle}>
                                                        {user.jobTitle}
                                                    </span>
                                                )}
                                                <span className={styles.userEmail}>
                                                    {user.email}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`${styles.roleBadge} ${getRoleBadgeClass(user.globalRole)}`}>
                                            {user.globalRole === 'TENANT_ADMIN' || user.globalRole === 'SYSTEM_ADMIN'
                                                ? <ShieldCheck size={12} />
                                                : <Shield size={12} />}
                                            {ROLE_LABELS[user.globalRole] || user.globalRole}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`${styles.statusBadge} ${user.active ? styles.statusActive : styles.statusInactive}`}>
                                            <span className={styles.statusDot} />
                                            {user.active ? 'Aktiv' : 'Inaktiv'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className={styles.groupBadges}>
                                            {user.groups.length > 0 ? (
                                                <>
                                                    {user.groups.slice(0, 2).map((g) => (
                                                        <Link
                                                            key={g.id}
                                                            href="/admin/groups"
                                                            className={styles.groupBadge}
                                                            onClick={(e) => e.stopPropagation()}
                                                            style={g.color ? {
                                                                background: `color-mix(in srgb, ${g.color} 15%, transparent)`,
                                                                color: g.color,
                                                            } : undefined}
                                                        >
                                                            {g.name}
                                                        </Link>
                                                    ))}
                                                    {user.groups.length > 2 && (
                                                        <span className={styles.groupMore}>+{user.groups.length - 2}</span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className={styles.groupNone}>Ingen</span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={styles.dateText}>
                                            {formatDate(user.createdAt)}
                                        </span>
                                    </td>
                                    <td>
                                        <div className={styles.actionsCell}>
                                            <button
                                                className={styles.actionBtn}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openEditModal(user);
                                                }}
                                                aria-label="Rediger bruker"
                                            >
                                                <Edit3 size={15} />
                                            </button>
                                            <button
                                                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeleteUser(user);
                                                }}
                                                aria-label="Fjern bruker"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Invite modal ───────────────────────────── */}
            {inviteOpen && (
                <div className={styles.modalOverlay} onClick={() => setInviteOpen(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Inviter bruker</h2>
                            <button
                                className={styles.modalClose}
                                onClick={() => setInviteOpen(false)}
                                aria-label="Lukk"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleInvite}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>E-postadresse *</label>
                                    <input
                                        className={styles.formInput}
                                        type="email"
                                        name="email"
                                        required
                                        placeholder="bruker@eksempel.no"
                                        autoFocus
                                    />
                                </div>
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Fornavn</label>
                                        <input
                                            className={styles.formInput}
                                            type="text"
                                            name="firstName"
                                            placeholder="Ola"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Etternavn</label>
                                        <input
                                            className={styles.formInput}
                                            type="text"
                                            name="lastName"
                                            placeholder="Nordmann"
                                        />
                                    </div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Rolle</label>
                                    <select className={styles.formSelect} name="role" defaultValue="USER">
                                        <option value="USER">Bruker</option>
                                        <option value="TENANT_ADMIN">Organisasjonsadministrator</option>
                                        <option value="SYSTEM_ADMIN">Systemadministrator</option>
                                    </select>
                                </div>
                            </div>
                            <div className={styles.modalFooter}>
                                <button
                                    type="button"
                                    className={styles.btnSecondary}
                                    onClick={() => setInviteOpen(false)}
                                >
                                    Avbryt
                                </button>
                                <button type="submit" className={styles.btnPrimary}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <UserPlus size={16} />
                                        Inviter
                                    </span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Edit loading overlay ──────────────────── */}
            {editLoading && (
                <div className={styles.modalOverlay}>
                    <div className={styles.loading}>
                        <div className={styles.spinner} />
                        Laster brukerdata...
                    </div>
                </div>
            )}

            {/* ── Edit modal ─────────────────────────────── */}
            {editUser && (
                <div className={styles.modalOverlay} onClick={() => setEditUser(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Rediger bruker</h2>
                            <button
                                className={styles.modalClose}
                                onClick={() => setEditUser(null)}
                                aria-label="Lukk"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleEdit}>
                            <div className={styles.modalBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>E-post</label>
                                    <input
                                        className={styles.formInput}
                                        type="email"
                                        value={editUser.email || ''}
                                        disabled
                                        style={{ opacity: 0.6 }}
                                    />
                                </div>
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Fornavn</label>
                                        <input
                                            className={styles.formInput}
                                            type="text"
                                            name="firstName"
                                            defaultValue={editUser.firstName || ''}
                                            placeholder="Fornavn"
                                            autoFocus
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Etternavn</label>
                                        <input
                                            className={styles.formInput}
                                            type="text"
                                            name="lastName"
                                            defaultValue={editUser.lastName || ''}
                                            placeholder="Etternavn"
                                        />
                                    </div>
                                </div>
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Rolle</label>
                                        <select
                                            className={styles.formSelect}
                                            name="role"
                                            defaultValue={editUser.globalRole}
                                        >
                                            <option value="USER">Bruker</option>
                                            <option value="TENANT_ADMIN">Organisasjonsadministrator</option>
                                            <option value="SYSTEM_ADMIN">Systemadministrator</option>
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Status</label>
                                        <select
                                            className={styles.formSelect}
                                            name="active"
                                            defaultValue={editUser.active ? 'true' : 'false'}
                                        >
                                            <option value="true">Aktiv</option>
                                            <option value="false">Inaktiv</option>
                                        </select>
                                    </div>
                                </div>

                                <div className={styles.formDivider} />
                                <span className={styles.formSectionLabel}>Ansattinformasjon</span>

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            <Briefcase size={14} /> Stillingstittel
                                        </label>
                                        <input
                                            className={styles.formInput}
                                            type="text"
                                            name="jobTitle"
                                            defaultValue={editUser.jobTitle || ''}
                                            placeholder="F.eks. Utvikler"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Avdeling</label>
                                        <input
                                            className={styles.formInput}
                                            type="text"
                                            name="department"
                                            defaultValue={editUser.department || ''}
                                            placeholder="F.eks. Teknologi"
                                        />
                                    </div>
                                </div>
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            <Phone size={14} /> Telefon
                                        </label>
                                        <input
                                            className={styles.formInput}
                                            type="tel"
                                            name="phone"
                                            defaultValue={editUser.phone || ''}
                                            placeholder="+47 123 45 678"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            <MapPin size={14} /> Arbeidssted
                                        </label>
                                        <input
                                            className={styles.formInput}
                                            type="text"
                                            name="location"
                                            defaultValue={editUser.location || ''}
                                            placeholder="F.eks. Oslo"
                                        />
                                    </div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>
                                        <Clock size={14} /> Arbeidstid
                                    </label>
                                    <input
                                        className={styles.formInput}
                                        type="text"
                                        name="workSchedule"
                                        defaultValue={editUser.workSchedule || ''}
                                        placeholder="F.eks. Man–Fre 08:00–16:00"
                                    />
                                </div>
                            </div>
                            <div className={styles.modalFooter}>
                                <button
                                    type="button"
                                    className={styles.btnSecondary}
                                    onClick={() => setEditUser(null)}
                                >
                                    Avbryt
                                </button>
                                <button type="submit" className={styles.btnPrimary}>
                                    Lagre endringer
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Delete confirm modal ───────────────────── */}
            {deleteUser && (
                <div className={styles.modalOverlay} onClick={() => setDeleteUser(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Fjern bruker</h2>
                            <button
                                className={styles.modalClose}
                                onClick={() => setDeleteUser(null)}
                                aria-label="Lukk"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <p className={styles.confirmText}>
                                Er du sikker på at du vil fjerne{' '}
                                <span className={styles.confirmHighlight}>
                                    {getDisplayName(deleteUser)}
                                </span>{' '}
                                ({deleteUser.email}) fra organisasjonen?
                            </p>
                            <p className={styles.confirmText}>
                                Brukeren vil miste tilgangen, men kontoen slettes ikke permanent.
                            </p>
                        </div>
                        <div className={styles.modalFooter}>
                            <button
                                type="button"
                                className={styles.btnSecondary}
                                onClick={() => setDeleteUser(null)}
                            >
                                Avbryt
                            </button>
                            <button
                                type="button"
                                className={styles.btnDanger}
                                onClick={handleDelete}
                            >
                                Fjern bruker
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Toast ──────────────────────────────────── */}
            {toast && (
                <div className={styles.toast}>
                    <CheckCircle size={16} />
                    {toast}
                </div>
            )}
        </div>
    );
}
