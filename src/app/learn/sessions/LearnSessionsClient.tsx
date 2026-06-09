'use client';

import { useState, useEffect } from 'react';
import {
    CalendarClock, MapPin, Video, Users2, Users, GraduationCap,
    CheckCircle2, AlertTriangle, Clock,
} from 'lucide-react';
import styles from './learnSessions.module.css';
import {
    enrollMe, unenrollMe, listMySessions,
    type LearnerSessionItem,
} from '@/app/actions/sessionActions';
import type { SessionFormat } from '@prisma/client';

const FORMAT_LABELS: Record<SessionFormat, string> = {
    IN_PERSON: 'Fysisk',
    ONLINE: 'Nettbasert',
    HYBRID: 'Hybrid',
};

function formatDateTime(start: Date, end: Date) {
    const s = new Date(start);
    const e = new Date(end);
    const date = s.toLocaleDateString('nb-NO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });
    const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
    return `${date} · ${s.toLocaleTimeString('nb-NO', opts)}–${e.toLocaleTimeString('nb-NO', opts)}`;
}

interface Props {
    initialSessions: LearnerSessionItem[];
}

export default function LearnSessionsClient({ initialSessions }: Props) {
    const [sessions, setSessions] = useState<LearnerSessionItem[]>(initialSessions);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    async function refresh() {
        const res = await listMySessions();
        if ('sessions' in res) setSessions(res.sessions);
    }

    async function handleEnroll(id: string) {
        setBusyId(id);
        const result = await enrollMe(id);
        setBusyId(null);
        if ('success' in result) {
            setToast(result.status === 'WAITLISTED' ? 'Du står nå på venteliste' : 'Du er påmeldt');
            refresh();
        } else {
            setError(result.error);
        }
    }

    async function handleUnenroll(id: string) {
        setBusyId(id);
        const result = await unenrollMe(id);
        setBusyId(null);
        if ('success' in result) {
            setToast('Du er meldt av');
            refresh();
        } else {
            setError(result.error);
        }
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>Sesjoner</h1>
                <p className={styles.subtitle}>
                    Kommende instruktørledede treningsøkter du kan melde deg på
                </p>
            </div>

            {error && (
                <div className={styles.errorBanner}>
                    <AlertTriangle size={16} />
                    {error}
                </div>
            )}

            {sessions.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <CalendarClock size={28} />
                    </div>
                    <span className={styles.emptyTitle}>Ingen kommende sesjoner</span>
                    <span className={styles.emptyText}>
                        Det er ingen planlagte sesjoner akkurat nå. Kom tilbake senere.
                    </span>
                </div>
            ) : (
                <div className={styles.cards}>
                    {sessions.map((s) => {
                        const isFull =
                            s.capacity !== null && s.registeredCount >= s.capacity;
                        const isCancelledSession = s.status === 'CANCELLED';
                        const enrolled = s.myStatus !== null;
                        const busy = busyId === s.id;

                        return (
                            <div key={s.id} className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <span className={styles.cardDate}>
                                        <Clock size={14} />
                                        {formatDateTime(s.startsAt, s.endsAt)}
                                    </span>
                                    {s.myStatus === 'WAITLISTED' && (
                                        <span className={`${styles.badge} ${styles.badgeWaitlist}`}>
                                            Venteliste
                                        </span>
                                    )}
                                    {s.myStatus === 'REGISTERED' && (
                                        <span className={`${styles.badge} ${styles.badgeEnrolled}`}>
                                            Påmeldt
                                        </span>
                                    )}
                                </div>

                                <h2 className={styles.cardTitle}>{s.title}</h2>
                                {s.description && (
                                    <p className={styles.cardDescription}>{s.description}</p>
                                )}

                                <div className={styles.cardMeta}>
                                    <span className={styles.metaItem}>
                                        {s.format === 'ONLINE' ? (
                                            <Video size={14} />
                                        ) : s.format === 'HYBRID' ? (
                                            <Users2 size={14} />
                                        ) : (
                                            <MapPin size={14} />
                                        )}
                                        {FORMAT_LABELS[s.format]}
                                        {s.location && ` · ${s.location}`}
                                    </span>
                                    {s.instructorName && (
                                        <span className={styles.metaItem}>
                                            <GraduationCap size={14} />
                                            {s.instructorName}
                                        </span>
                                    )}
                                    {s.courseTitle && (
                                        <span className={styles.metaItem}>{s.courseTitle}</span>
                                    )}
                                    <span className={styles.metaItem}>
                                        <Users size={14} />
                                        {s.registeredCount}
                                        {s.capacity !== null ? `/${s.capacity}` : ''} påmeldt
                                    </span>
                                </div>

                                {enrolled && s.myStatus === 'REGISTERED' && s.meetingUrl && (
                                    <a
                                        className={styles.meetingLink}
                                        href={s.meetingUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <Video size={14} /> Åpne møtelenke
                                    </a>
                                )}

                                <div className={styles.cardFooter}>
                                    {enrolled ? (
                                        <button
                                            className={styles.btnOutline}
                                            onClick={() => handleUnenroll(s.id)}
                                            disabled={busy}
                                        >
                                            {busy ? 'Melder av...' : 'Meld meg av'}
                                        </button>
                                    ) : isCancelledSession ? (
                                        <span className={styles.statusNote}>Sesjonen er avlyst</span>
                                    ) : (
                                        <button
                                            className={styles.btnPrimary}
                                            onClick={() => handleEnroll(s.id)}
                                            disabled={busy}
                                        >
                                            <CheckCircle2 size={16} />
                                            {busy
                                                ? 'Melder på...'
                                                : isFull
                                                ? 'Sett meg på venteliste'
                                                : 'Meld meg på'}
                                        </button>
                                    )}
                                    {!enrolled && isFull && !isCancelledSession && (
                                        <span className={styles.fullNote}>Fullt</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {toast && (
                <div className={styles.toast}>
                    <CheckCircle2 size={16} />
                    {toast}
                </div>
            )}
        </div>
    );
}
