'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    User, Save, Building2, Briefcase, MapPin,
    Phone, FileText, CheckCircle, Camera,
} from 'lucide-react';
import styles from './profile.module.css';
import { updateLearnerProfile } from '@/app/actions/learnerActions';
import type { ProfileData } from '@/app/actions/learnerActions';
import { RichTextEditor } from '@/components/LexicalEditor';

interface Props {
    profile: ProfileData;
}

export default function ProfileClient({ profile }: Props) {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form state
    const [firstName, setFirstName] = useState(profile.firstName ?? '');
    const [lastName, setLastName] = useState(profile.lastName ?? '');
    const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? '');
    const [department, setDepartment] = useState(profile.department ?? '');
    const [bio, setBio] = useState(profile.bio ?? '');
    const [phone, setPhone] = useState(profile.phone ?? '');
    const [location, setLocation] = useState(profile.location ?? '');
    const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? '');

    async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            setError('Bildet er for stort. Maks 2MB.');
            return;
        }

        setUploading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'avatar');

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                setAvatarUrl(data.url);
                // Save avatar immediately
                const result = await updateLearnerProfile({ avatarUrl: data.url });
                if ('success' in result) {
                    setToast('Profilbilde oppdatert');
                    setTimeout(() => setToast(null), 3000);
                    router.refresh();
                }
            } else {
                setError(data.error || 'Opplasting feilet');
            }
        } catch {
            setError('Opplasting feilet');
        }
        setUploading(false);
    }

    async function handleSave() {
        setSaving(true);
        setError(null);

        const result = await updateLearnerProfile({
            firstName,
            lastName,
            jobTitle,
            department,
            bio,
            phone,
            location,
        });

        if ('success' in result) {
            setToast('Profil oppdatert');
            setTimeout(() => setToast(null), 3000);
            router.refresh();
        } else {
            setError(result.error);
        }
        setSaving(false);
    }

    const initials = [firstName, lastName]
        .filter(Boolean)
        .map((n) => n[0]?.toUpperCase())
        .join('') || profile.email?.[0]?.toUpperCase() || '?';

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div
                    className={styles.avatar}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    aria-label="Last opp profilbilde"
                    onKeyDown={(e) => { if (e.key === 'Enter') fileInputRef.current?.click(); }}
                >
                    {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="Profilbilde" className={styles.avatarImg} />
                    ) : (
                        <span className={styles.avatarInitials}>{initials}</span>
                    )}
                    <div className={styles.avatarOverlay}>
                        {uploading ? (
                            <span className={styles.avatarSpinner} />
                        ) : (
                            <Camera size={20} />
                        )}
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className={styles.avatarInput}
                        onChange={handleAvatarUpload}
                    />
                </div>
                <div className={styles.headerText}>
                    <h1 className={styles.title}>
                        {[firstName, lastName].filter(Boolean).join(' ') || profile.email}
                    </h1>
                    <p className={styles.subtitle}>
                        <Building2 size={14} />
                        {profile.tenantName}
                    </p>
                    {profile.email && (
                        <p className={styles.email}>{profile.email}</p>
                    )}
                </div>
                <button
                    className={styles.saveBtn}
                    onClick={handleSave}
                    disabled={saving}
                >
                    <Save size={16} />
                    {saving ? 'Lagrer...' : 'Lagre endringer'}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className={styles.errorBanner}>{error}</div>
            )}

            {/* Form */}
            <div className={styles.formGrid}>
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <User size={16} />
                        Personlig informasjon
                    </h2>
                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Fornavn</label>
                            <input
                                className={styles.formInput}
                                type="text"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder="Ditt fornavn"
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Etternavn</label>
                            <input
                                className={styles.formInput}
                                type="text"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                placeholder="Ditt etternavn"
                            />
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>
                            <Phone size={13} />
                            Telefon
                        </label>
                        <input
                            className={styles.formInput}
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+47 123 45 678"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>
                            <MapPin size={13} />
                            Lokasjon
                        </label>
                        <input
                            className={styles.formInput}
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="By, kontor, etc."
                        />
                    </div>
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <Briefcase size={16} />
                        Jobb
                    </h2>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Stillingstittel</label>
                        <input
                            className={styles.formInput}
                            type="text"
                            value={jobTitle}
                            onChange={(e) => setJobTitle(e.target.value)}
                            placeholder="F.eks. Prosjektleder"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Avdeling</label>
                        <input
                            className={styles.formInput}
                            type="text"
                            value={department}
                            onChange={(e) => setDepartment(e.target.value)}
                            placeholder="F.eks. Salg og markedsføring"
                        />
                    </div>
                </div>

                <div className={`${styles.section} ${styles.sectionFull}`}>
                    <h2 className={styles.sectionTitle}>
                        <FileText size={16} />
                        Om meg
                    </h2>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Biografi</label>
                        <RichTextEditor
                            initialHtml={bio}
                            onChange={(html) => setBio(html)}
                            minHeight={100}
                            placeholder="Fortell litt om deg selv..."
                        />
                    </div>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className={styles.toast}>
                    <CheckCircle size={16} />
                    {toast}
                </div>
            )}
        </div>
    );
}
