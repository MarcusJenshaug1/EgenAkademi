'use client';

import { useEffect, useCallback } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import styles from './confirmDialog.module.css';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'default';
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({
    open,
    title,
    description,
    confirmText = 'Bekreft',
    cancelText = 'Avbryt',
    variant = 'default',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel();
    }, [onCancel]);

    useEffect(() => {
        if (open) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [open, handleKeyDown]);

    if (!open) return null;

    return (
        <div className={styles.overlay} onClick={onCancel} role="dialog" aria-modal="true">
            <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeBtn} onClick={onCancel} type="button" aria-label="Lukk">
                    <X size={18} />
                </button>
                <div className={`${styles.iconBox} ${variant === 'danger' ? styles.iconDanger : styles.iconDefault}`}>
                    <AlertTriangle size={24} />
                </div>
                <h2 className={styles.title}>{title}</h2>
                <p className={styles.description}>{description}</p>
                <div className={styles.actions}>
                    <button className={styles.cancelBtn} onClick={onCancel} type="button">
                        {cancelText}
                    </button>
                    <button
                        className={`${styles.confirmBtn} ${variant === 'danger' ? styles.confirmDanger : styles.confirmDefault}`}
                        onClick={onConfirm}
                        type="button"
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
