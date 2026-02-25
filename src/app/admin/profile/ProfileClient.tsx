'use client';

import { useState, useRef } from 'react';
import {
    Camera, Trash2, CheckCircle, User, ShieldCheck, ShieldAlert,
    Calendar, Building2, Users
} from 'lucide-react';
import {
    updateMyProfile, uploadAvatar, removeAvatar,
} from '@/app/actions/profileActions';
import styles from './profile.module.css';

const ROLE_LABELS: Record<string, { label: string; badge: string; icon: typeof User }> = {
    USER: { label: 'Bruker', badge: styles.badgeUser, icon: User },
    TENANT_ADMIN: { label: 'Organisasjonsadministrator', badge: styles.badgeAdmin, icon: ShieldCheck },
    SYSTEM_ADMIN: { label: 'Systemadministrator', badge: styles.badgeSystem, icon: ShieldAlert },
};

interface ProfileData {
    id: string;
    email: string | null;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    globalRole: string;
    createdAt: Date;
    tenant: { name: string } | null;
    groupCount: number;
}

interface ProfileClientProps {
    initialProfile: ProfileData;
}

export default function ProfileClient({ initialProfile }: ProfileClientProps) {
    const [profile, setProfile] = useState<ProfileData>(initialProfile);
    const [firstName, setFirstName] = useState(profile.firstName || '');
    const [lastName, setLastName] = useState(profile.lastName || '');
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    function showToast(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    }

    function getInitials(): string {
        if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase();
        if (profile.name) return profile.name.substring(0, 2).toUpperCase();
        if (profile.email) return profile.email.substring(0, 2).toUpperCase();
        return '??';
    }

    async function handleSave() {
        setError(null);
        setSaving(true);
        const result = await updateMyProfile({ firstName, lastName });
        setSaving(false);
        if ('error' in result) { setError(result.error); return; }
        setProfile((p) => ({
            ...p,
            firstName,
            lastName,
            name: [firstName, lastName].filter(Boolean).join(' ') || p.name,
        }));
        showToast('Profil oppdatert');
    }

    async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);
        const reader = new FileReader();
        reader.onload = async () => {
            const result = reader.result as string;
            // Extract base64 part
            const base64 = result.split(',')[1];
            const uploadResult = await uploadAvatar(base64, file.type);
            if ('error' in uploadResult) {
                setError(uploadResult.error);
                return;
            }
            setProfile((p) => ({ ...p, avatarUrl: uploadResult.avatarUrl }));
            showToast('Avatar oppdatert');
        };
        reader.readAsDataURL(file);
        // Reset file input
        if (fileRef.current) fileRef.current.value = '';
    }

    async function handleRemoveAvatar() {
        setError(null);
        const result = await removeAvatar();
        if ('error' in result) { setError(result.error); return; }
        setProfile((p) => ({ ...p, avatarUrl: null }));
        showToast('Avatar fjernet');
    }

    const roleCfg = ROLE_LABELS[profile.globalRole] || ROLE_LABELS.USER;
    const RoleIcon = roleCfg.icon;

    return (
        <div className={styles.profilePage}>
            <div className={styles.header}>
                <h1 className={styles.title}>Min profil</h1>
                <p className={styles.subtitle}>Administrer din profilinformasjon og avatar.</p>
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}

            {/* Avatar section */}
            <div className={styles.avatarSection}>
                <div className={styles.avatarWrapper}>
                    {profile.avatarUrl ? (
                        <img
                            src={profile.avatarUrl}
                            alt="Profilbilde"
                            className={styles.avatarLarge}
                        />
                    ) : (
                        <div className={styles.avatarPlaceholder}>
                            {getInitials()}
                        </div>
                    )}
                    <label className={styles.avatarOverlay} htmlFor="avatar-upload">
                        <Camera size={24} />
                    </label>
                    <input
                        ref={fileRef}
                        id="avatar-upload"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className={styles.avatarFileInput}
                        onChange={handleAvatarUpload}
                    />
                </div>
                <div className={styles.avatarInfo}>
                    <span className={styles.avatarName}>
                        {firstName && lastName
                            ? `${firstName} ${lastName}`
                            : profile.name || profile.email || 'Bruker'}
                    </span>
                    <span className={styles.avatarEmail}>{profile.email}</span>
                    <div className={styles.avatarActions}>
                        <button
                            className={styles.avatarBtn}
                            onClick={() => fileRef.current?.click()}
                        >
                            <Camera size={14} /> Last opp bilde
                        </button>
                        {profile.avatarUrl && (
                            <button
                                className={`${styles.avatarBtn} ${styles.avatarBtnDanger}`}
                                onClick={handleRemoveAvatar}
                            >
                                <Trash2 size={14} /> Fjern
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Edit form */}
            <div className={styles.formCard}>
                <span className={styles.formCardTitle}>Personlig informasjon</span>
                <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Fornavn</label>
                        <input
                            className={styles.formInput}
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="Fornavn"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Etternavn</label>
                        <input
                            className={styles.formInput}
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Etternavn"
                        />
                    </div>
                </div>
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>E-post</label>
                    <input
                        className={styles.formInput}
                        value={profile.email || ''}
                        disabled
                        title="E-post kan ikke endres"
                    />
                </div>
                <div className={styles.formActions}>
                    <button
                        className={styles.btnPrimary}
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Lagrer...' : 'Lagre endringer'}
                    </button>
                </div>
            </div>

            {/* Account info */}
            <div className={styles.infoCard}>
                <span className={styles.formCardTitle}>Kontoinformasjon</span>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Rolle</span>
                    <span className={`${styles.badge} ${roleCfg.badge}`}>
                        <RoleIcon size={12} /> {roleCfg.label}
                    </span>
                </div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Organisasjon</span>
                    <span className={styles.infoValue}>
                        <Building2 size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                        {profile.tenant?.name || 'Ingen organisasjon'}
                    </span>
                </div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Gruppemedlemskap</span>
                    <span className={styles.infoValue}>
                        <Users size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                        {profile.groupCount} {profile.groupCount === 1 ? 'gruppe' : 'grupper'}
                    </span>
                </div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Medlem siden</span>
                    <span className={styles.infoValue}>
                        <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                        {new Date(profile.createdAt).toLocaleDateString('nb-NO', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                        })}
                    </span>
                </div>
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
