'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Bell, BellOff, BookOpen, Award, Clock,
    AlertTriangle, Info, CheckCircle2, Check,
} from 'lucide-react';
import styles from './notifications.module.css';
import {
    markNotificationRead,
    markAllNotificationsRead,
} from '@/app/actions/learnerActions';
import type { NotificationData } from '@/app/actions/learnerActions';

interface Props {
    notifications: NotificationData[];
}

const TYPE_CONFIG: Record<string, { icon: typeof Bell; label: string }> = {
    COURSE_ASSIGNED: { icon: BookOpen, label: 'Kurs tildelt' },
    COURSE_COMPLETED: { icon: CheckCircle2, label: 'Kurs fullført' },
    CERTIFICATE_ISSUED: { icon: Award, label: 'Sertifikat utstedt' },
    DEADLINE_REMINDER: { icon: Clock, label: 'Fristpåminnelse' },
    GENERAL: { icon: Info, label: 'Generelt' },
    SYSTEM: { icon: AlertTriangle, label: 'System' },
};

function formatDate(d: Date) {
    return new Date(d).toLocaleDateString('nb-NO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function NotificationsClient({ notifications: initialNotifications }: Props) {
    const router = useRouter();
    const [notifications, setNotifications] = useState(initialNotifications);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');

    const unreadCount = notifications.filter((n) => !n.isRead).length;
    const filtered = filter === 'unread'
        ? notifications.filter((n) => !n.isRead)
        : notifications;

    async function handleMarkRead(id: string) {
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
        await markNotificationRead(id);
    }

    async function handleMarkAllRead() {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        await markAllNotificationsRead();
        router.refresh();
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div className={styles.headerIcon}>
                    <Bell size={24} />
                </div>
                <div className={styles.headerText}>
                    <h1 className={styles.title}>Varsler</h1>
                    <p className={styles.subtitle}>
                        {unreadCount === 0
                            ? 'Ingen uleste varsler'
                            : `${unreadCount} ${unreadCount === 1 ? 'ulest varsel' : 'uleste varsler'}`}
                    </p>
                </div>
                {unreadCount > 0 && (
                    <button className={styles.markAllBtn} onClick={handleMarkAllRead}>
                        <Check size={14} />
                        Merk alle som lest
                    </button>
                )}
            </div>

            {/* Filter */}
            <div className={styles.filterBar}>
                <button
                    className={`${styles.filterBtn} ${filter === 'all' ? styles.filterBtnActive : ''}`}
                    onClick={() => setFilter('all')}
                >
                    Alle ({notifications.length})
                </button>
                <button
                    className={`${styles.filterBtn} ${filter === 'unread' ? styles.filterBtnActive : ''}`}
                    onClick={() => setFilter('unread')}
                >
                    Uleste ({unreadCount})
                </button>
            </div>

            {filtered.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <BellOff size={40} />
                    </div>
                    <h2 className={styles.emptyTitle}>
                        {filter === 'unread' ? 'Ingen uleste varsler' : 'Ingen varsler'}
                    </h2>
                    <p className={styles.emptyText}>
                        {filter === 'unread'
                            ? 'Du har lest alle varslene dine.'
                            : 'Du har ingen varsler ennå. De vil vises her når de kommer.'}
                    </p>
                </div>
            ) : (
                <div className={styles.list}>
                    {filtered.map((notif) => {
                        const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.GENERAL;
                        const Icon = config.icon;
                        return (
                            <div
                                key={notif.id}
                                className={`${styles.notifCard} ${!notif.isRead ? styles.notifUnread : ''}`}
                                onClick={() => !notif.isRead && handleMarkRead(notif.id)}
                            >
                                <div className={styles.notifIcon}>
                                    <Icon size={18} />
                                </div>
                                <div className={styles.notifContent}>
                                    <div className={styles.notifHeader}>
                                        <span className={styles.notifType}>{config.label}</span>
                                        <span className={styles.notifTime}>{formatDate(notif.createdAt)}</span>
                                    </div>
                                    <h3 className={styles.notifTitle}>{notif.title}</h3>
                                    <p className={styles.notifMessage}>{notif.message}</p>
                                </div>
                                {!notif.isRead && <div className={styles.unreadDot} />}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
