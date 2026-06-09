'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
    Package,
    Upload,
    Play,
    Trash2,
    Loader2,
    AlertTriangle,
    X,
    CheckCircle,
    Users,
} from 'lucide-react';
import styles from './scorm.module.css';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
    listScormPackages,
    deleteScormPackage,
    getScormStats,
    type ScormPackageListItem,
    type ScormStats,
} from '@/app/actions/scormActions';

function formatDate(d: Date | string) {
    return new Date(d).toLocaleDateString('nb-NO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function versionLabel(v: string): string {
    return v === '2004' ? 'SCORM 2004' : 'SCORM 1.2';
}

export default function ScormClient() {
    const [packages, setPackages] = useState<ScormPackageListItem[]>([]);
    const [stats, setStats] = useState<ScormStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<ScormPackageListItem | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Toast auto-dismiss ──
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    const refresh = useCallback(async () => {
        setLoading(true);
        const [pkgResult, statsResult] = await Promise.all([
            listScormPackages(),
            getScormStats(),
        ]);
        if ('packages' in pkgResult) {
            setPackages(pkgResult.packages);
        } else {
            setError(pkgResult.error);
        }
        if (!('error' in statsResult)) {
            setStats(statsResult);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // ── Upload via XHR for progress ──
    function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setUploadProgress(0);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/scorm/upload');

        xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
                setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
            }
        };

        xhr.onload = async () => {
            setUploading(false);
            setUploadProgress(0);
            if (fileInputRef.current) fileInputRef.current.value = '';
            let data: { error?: string } = {};
            try {
                data = JSON.parse(xhr.responseText);
            } catch {
                data = {};
            }
            if (xhr.status >= 200 && xhr.status < 300) {
                setToast('SCORM-pakken ble importert');
                await refresh();
            } else {
                setError(data.error || 'Importfeil');
            }
        };

        xhr.onerror = () => {
            setUploading(false);
            setUploadProgress(0);
            if (fileInputRef.current) fileInputRef.current.value = '';
            setError('Importfeil');
        };

        xhr.send(formData);
    }

    async function handleDelete() {
        if (!deleteTarget) return;
        const result = await deleteScormPackage(deleteTarget.id);
        if ('success' in result) {
            setToast('SCORM-pakken ble slettet');
            await refresh();
        } else {
            setError(result.error);
        }
        setDeleteTarget(null);
    }

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>
                        <Package size={24} />
                        SCORM
                    </h1>
                    <p className={styles.subtitle}>
                        Importer og administrer SCORM 1.2 / 2004-pakker
                    </p>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    className={styles.hiddenInput}
                    onChange={handleFileSelected}
                    accept=".zip,application/zip,application/x-zip-compressed"
                />
                <button
                    className={styles.primaryButton}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                >
                    {uploading ? (
                        <Loader2 size={18} className={styles.spin} />
                    ) : (
                        <Upload size={18} />
                    )}
                    {uploading ? `Laster opp… ${uploadProgress}%` : 'Importer SCORM-pakke'}
                </button>
            </div>

            {/* Upload progress bar */}
            {uploading && (
                <div className={styles.progressTrack} aria-hidden="true">
                    <div
                        className={styles.progressBar}
                        style={{ width: `${uploadProgress}%` }}
                    />
                </div>
            )}

            {/* Error */}
            {error && (
                <div className={styles.errorBanner}>
                    <AlertTriangle size={16} />
                    {error}
                    <button
                        className={styles.bannerClose}
                        onClick={() => setError(null)}
                        aria-label="Lukk feilmelding"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Pakker</span>
                    <span className={styles.statValue}>{stats?.totalPackages ?? 0}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Forsøk</span>
                    <span className={styles.statValue}>{stats?.totalAttempts ?? 0}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>Fullførte forsøk</span>
                    <span className={styles.statValue}>{stats?.completedAttempts ?? 0}</span>
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div className={styles.loading}>
                    <Loader2 size={20} className={styles.spin} />
                    Laster SCORM-pakker…
                </div>
            ) : packages.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <Package size={28} />
                    </div>
                    <span className={styles.emptyTitle}>Ingen SCORM-pakker ennå</span>
                    <span className={styles.emptyText}>
                        Importer en SCORM 1.2- eller 2004-pakke (.zip) for å komme i gang.
                    </span>
                </div>
            ) : (
                <div className={styles.packageList}>
                    {packages.map((pkg) => (
                        <div key={pkg.id} className={styles.packageCard}>
                            <div className={styles.packageIcon}>
                                <Package size={22} />
                            </div>
                            <div className={styles.packageBody}>
                                <span className={styles.packageTitle} title={pkg.title}>
                                    {pkg.title}
                                </span>
                                <div className={styles.packageMeta}>
                                    <span className={styles.versionBadge}>
                                        {versionLabel(pkg.scormVersion)}
                                    </span>
                                    <span className={styles.metaDot} />
                                    <span>{formatDate(pkg.createdAt)}</span>
                                    <span className={styles.metaDot} />
                                    <span className={styles.attemptCount}>
                                        <Users size={13} />
                                        {pkg.attemptCount} forsøk
                                    </span>
                                </div>
                            </div>
                            <div className={styles.packageActions}>
                                <Link
                                    href={`/learn/scorm/${pkg.id}`}
                                    className={styles.previewButton}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Play size={15} />
                                    Forhåndsvis
                                </Link>
                                <button
                                    className={styles.deleteButton}
                                    onClick={() => setDeleteTarget(pkg)}
                                    aria-label={`Slett ${pkg.title}`}
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Delete confirm */}
            <ConfirmDialog
                open={deleteTarget !== null}
                title="Slett SCORM-pakke"
                description={
                    deleteTarget
                        ? `Er du sikker på at du vil slette "${deleteTarget.title}"? Alle tilknyttede forsøk slettes også. Dette kan ikke angres.`
                        : ''
                }
                confirmText="Slett"
                cancelText="Avbryt"
                variant="danger"
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
            />

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
