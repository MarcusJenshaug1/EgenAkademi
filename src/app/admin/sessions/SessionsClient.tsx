'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Plus, Search, X, CalendarClock, Users, Percent, CheckCircle2,
    MapPin, Video, Users2, Edit3, Trash2, Ban, CircleCheck,
    AlertTriangle, ChevronDown, UserPlus, UserMinus, GraduationCap,
} from 'lucide-react';
import styles from './sessions.module.css';
import {
    listSessions, getSession, createSession, updateSession, deleteSession,
    cancelSession, completeSession, enrollUser, unenrollUser, markAttendance,
    listTenantInstructors, listTenantUsers, listTenantCourses,
    type SessionListItem, type SessionDetail, type SessionStats,
    type SessionPickerUser, type SessionInput,
} from '@/app/actions/sessionActions';
import type { SessionFormat, SessionStatus } from '@prisma/client';
import ConfirmDialog from '@/components/ConfirmDialog';

// ── Label maps ──────────────────────────────────────────────

const FORMAT_LABELS: Record<SessionFormat, string> = {
    IN_PERSON: 'Fysisk',
    ONLINE: 'Nettbasert',
    HYBRID: 'Hybrid',
};

const STATUS_LABELS: Record<SessionStatus, string> = {
    DRAFT: 'Kladd',
    SCHEDULED: 'Planlagt',
    CANCELLED: 'Avlyst',
    COMPLETED: 'Gjennomført',
};

const ENROLL_STATUS_LABELS: Record<string, string> = {
    REGISTERED: 'Påmeldt',
    WAITLISTED: 'Venteliste',
    CANCELLED: 'Avmeldt',
    ATTENDED: 'Møtte opp',
    NO_SHOW: 'Ikke møtt',
};

function statusBadgeClass(status: SessionStatus) {
    if (status === 'SCHEDULED') return styles.badgeScheduled;
    if (status === 'CANCELLED') return styles.badgeCancelled;
    if (status === 'COMPLETED') return styles.badgeCompleted;
    return styles.badgeDraft;
}

// ── Date helpers ────────────────────────────────────────────

function formatDayHeading(d: Date) {
    return new Date(d).toLocaleDateString('nb-NO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

function formatTimeRange(start: Date, end: Date) {
    const s = new Date(start);
    const e = new Date(end);
    const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
    return `${s.toLocaleTimeString('nb-NO', opts)}–${e.toLocaleTimeString('nb-NO', opts)}`;
}

function dayKey(d: Date) {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
}

/** Convert a Date to a value usable by <input type="datetime-local"> in local time. */
function toDatetimeLocal(d: Date | null) {
    if (!d) return '';
    const dt = new Date(d);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function formatInitials(name: string) {
    const parts = name.trim().split(/\s+/);
    if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

// ── Props ───────────────────────────────────────────────────

interface SessionsClientProps {
    initialSessions: SessionListItem[];
    stats: SessionStats;
}

type Scope = 'upcoming' | 'past' | 'all';

interface FormState {
    title: string;
    description: string;
    format: SessionFormat;
    status: SessionStatus;
    location: string;
    meetingUrl: string;
    startsAt: string;
    endsAt: string;
    capacity: string;
    instructorUserId: string;
    courseId: string;
}

const EMPTY_FORM: FormState = {
    title: '',
    description: '',
    format: 'IN_PERSON',
    status: 'SCHEDULED',
    location: '',
    meetingUrl: '',
    startsAt: '',
    endsAt: '',
    capacity: '',
    instructorUserId: '',
    courseId: '',
};

export default function SessionsClient({ initialSessions, stats }: SessionsClientProps) {
    const [sessions, setSessions] = useState<SessionListItem[]>(initialSessions);
    const [scope, setScope] = useState<Scope>('upcoming');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Drawer (create/edit)
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    // Pickers
    const [instructors, setInstructors] = useState<SessionPickerUser[]>([]);
    const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);

    // Detail view
    const [detail, setDetail] = useState<SessionDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Confirm dialogs
    const [confirmDelete, setConfirmDelete] = useState<SessionListItem | null>(null);
    const [confirmCancel, setConfirmCancel] = useState<SessionListItem | null>(null);

    // Add-attendee state inside detail
    const [attendeeSearch, setAttendeeSearch] = useState('');
    const [attendeeResults, setAttendeeResults] = useState<SessionPickerUser[]>([]);

    // ── Refresh list ────────────────────────────────────────

    const refresh = useCallback(
        async (currentScope: Scope, q?: string) => {
            setLoading(true);
            const result = await listSessions({ scope: currentScope, search: q });
            if ('sessions' in result) {
                setSessions(result.sessions);
            } else {
                setError(result.error);
            }
            setLoading(false);
        },
        []
    );

    useEffect(() => {
        const timer = setTimeout(() => {
            refresh(scope, search || undefined);
        }, 300);
        return () => clearTimeout(timer);
    }, [scope, search, refresh]);

    // ── Toast auto-dismiss ──────────────────────────────────

    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // ── Load pickers when drawer opens ──────────────────────

    useEffect(() => {
        if (!drawerOpen) return;
        let cancelled = false;
        (async () => {
            const [insRes, courseRes] = await Promise.all([
                listTenantInstructors(),
                listTenantCourses(),
            ]);
            if (cancelled) return;
            if ('users' in insRes) setInstructors(insRes.users);
            if ('courses' in courseRes) setCourses(courseRes.courses);
        })();
        return () => {
            cancelled = true;
        };
    }, [drawerOpen]);

    // ── Attendee search (debounced) ─────────────────────────

    useEffect(() => {
        if (!detail) return;
        if (!attendeeSearch.trim()) {
            setAttendeeResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            const res = await listTenantUsers(attendeeSearch);
            if ('users' in res) {
                const enrolledIds = new Set(
                    detail.enrollments
                        .filter((e) => e.status !== 'CANCELLED')
                        .map((e) => e.userId)
                );
                setAttendeeResults(res.users.filter((u) => !enrolledIds.has(u.id)));
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [attendeeSearch, detail]);

    // ── Open create drawer ──────────────────────────────────

    function openCreate() {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setDrawerOpen(true);
    }

    // ── Open edit drawer ────────────────────────────────────

    async function openEdit(s: SessionListItem) {
        const res = await getSession(s.id);
        if ('error' in res) {
            setError(res.error);
            return;
        }
        const d = res.session;
        setEditingId(d.id);
        setForm({
            title: d.title,
            description: d.description ?? '',
            format: d.format,
            status: d.status,
            location: d.location ?? '',
            meetingUrl: d.meetingUrl ?? '',
            startsAt: toDatetimeLocal(d.startsAt),
            endsAt: toDatetimeLocal(d.endsAt),
            capacity: d.capacity !== null ? String(d.capacity) : '',
            instructorUserId: d.instructorUserId ?? '',
            courseId: d.courseId ?? '',
        });
        setDrawerOpen(true);
    }

    // ── Submit create/edit ──────────────────────────────────

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSaving(true);

        const payload: SessionInput = {
            title: form.title,
            description: form.description || null,
            format: form.format,
            status: form.status,
            location: form.format === 'ONLINE' ? null : form.location || null,
            meetingUrl: form.format === 'IN_PERSON' ? null : form.meetingUrl || null,
            startsAt: form.startsAt,
            endsAt: form.endsAt,
            capacity: form.capacity.trim() === '' ? null : Number(form.capacity),
            instructorUserId: form.instructorUserId || null,
            courseId: form.courseId || null,
        };

        const result = editingId
            ? await updateSession(editingId, payload)
            : await createSession(payload);

        setSaving(false);

        if ('success' in result) {
            setDrawerOpen(false);
            setToast(editingId ? 'Sesjon oppdatert' : 'Sesjon opprettet');
            refresh(scope, search || undefined);
        } else {
            setError(result.error);
        }
    }

    // ── Row actions ─────────────────────────────────────────

    async function handleDelete() {
        if (!confirmDelete) return;
        const result = await deleteSession(confirmDelete.id);
        setConfirmDelete(null);
        if ('success' in result) {
            setToast('Sesjon slettet');
            refresh(scope, search || undefined);
        } else {
            setError(result.error);
        }
    }

    async function handleCancel() {
        if (!confirmCancel) return;
        const result = await cancelSession(confirmCancel.id);
        setConfirmCancel(null);
        if ('success' in result) {
            setToast('Sesjon avlyst');
            refresh(scope, search || undefined);
        } else {
            setError(result.error);
        }
    }

    async function handleComplete(s: SessionListItem) {
        const result = await completeSession(s.id);
        if ('success' in result) {
            setToast('Sesjon markert som gjennomført');
            refresh(scope, search || undefined);
        } else {
            setError(result.error);
        }
    }

    // ── Detail view ─────────────────────────────────────────

    async function openDetail(id: string) {
        setDetailLoading(true);
        const res = await getSession(id);
        setDetailLoading(false);
        if ('session' in res) {
            setDetail(res.session);
            setAttendeeSearch('');
            setAttendeeResults([]);
        } else {
            setError(res.error);
        }
    }

    async function reloadDetail() {
        if (!detail) return;
        const res = await getSession(detail.id);
        if ('session' in res) setDetail(res.session);
        refresh(scope, search || undefined);
    }

    async function handleAddAttendee(userId: string) {
        if (!detail) return;
        const result = await enrollUser(detail.id, userId);
        if ('success' in result) {
            setAttendeeSearch('');
            setAttendeeResults([]);
            setToast(result.status === 'WAITLISTED' ? 'Lagt til på venteliste' : 'Deltaker påmeldt');
            reloadDetail();
        } else {
            setError(result.error);
        }
    }

    async function handleRemoveAttendee(userId: string) {
        if (!detail) return;
        const result = await unenrollUser(detail.id, userId);
        if ('success' in result) {
            setToast('Deltaker avmeldt');
            reloadDetail();
        } else {
            setError(result.error);
        }
    }

    async function handleAttendance(userId: string, status: 'ATTENDED' | 'NO_SHOW') {
        if (!detail) return;
        const result = await markAttendance(detail.id, userId, status);
        if ('success' in result) {
            reloadDetail();
        } else {
            setError(result.error);
        }
    }

    // ── Group sessions by day ───────────────────────────────

    const grouped: { key: string; date: Date; items: SessionListItem[] }[] = [];
    for (const s of sessions) {
        const key = dayKey(s.startsAt);
        const last = grouped[grouped.length - 1];
        if (last && last.key === key) {
            last.items.push(s);
        } else {
            grouped.push({ key, date: s.startsAt, items: [s] });
        }
    }

    // ── Render ──────────────────────────────────────────────

    return (
        <div className={styles.sessionsPage}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>Sesjoner</h1>
                    <p className={styles.subtitle}>
                        Planlegg og administrer instruktørledet opplæring
                    </p>
                </div>
                <button className={styles.primaryButton} onClick={openCreate}>
                    <Plus size={18} />
                    Ny sesjon
                </button>
            </div>

            {/* KPI cards */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <CalendarClock size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Kommende sesjoner</span>
                        <span className={styles.statValue}>{stats.upcomingCount}</span>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Users size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Totalt påmeldte</span>
                        <span className={styles.statValue}>{stats.totalEnrollments}</span>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <Percent size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Snitt fyllingsgrad</span>
                        <span className={styles.statValue}>{stats.avgFillRate}%</span>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>
                        <CheckCircle2 size={20} />
                    </div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Gjennomførte</span>
                        <span className={styles.statValue}>{stats.completedCount}</span>
                    </div>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className={styles.errorBanner}>
                    <AlertTriangle size={16} />
                    {error}
                    <button
                        className={styles.iconButton}
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
                        placeholder="Søk etter tittel, sted..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className={styles.scopeTabs}>
                    {(['upcoming', 'past', 'all'] as Scope[]).map((sc) => (
                        <button
                            key={sc}
                            className={`${styles.scopeTab} ${scope === sc ? styles.scopeTabActive : ''}`}
                            onClick={() => setScope(sc)}
                        >
                            {sc === 'upcoming' ? 'Kommende' : sc === 'past' ? 'Tidligere' : 'Alle'}
                        </button>
                    ))}
                </div>
            </div>

            {/* List grouped by date */}
            <div className={styles.listWrapper}>
                {loading ? (
                    <div className={styles.loading}>
                        <div className={styles.spinner} />
                        Laster sesjoner...
                    </div>
                ) : grouped.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                            <CalendarClock size={28} />
                        </div>
                        <span className={styles.emptyTitle}>
                            {search ? 'Ingen treff' : 'Ingen sesjoner ennå'}
                        </span>
                        <span className={styles.emptyText}>
                            {search
                                ? `Ingen sesjoner matcher "${search}"`
                                : 'Opprett din første sesjon for å komme i gang.'}
                        </span>
                    </div>
                ) : (
                    grouped.map((group) => (
                        <div key={group.key} className={styles.dayGroup}>
                            <h2 className={styles.dayHeading}>{formatDayHeading(group.date)}</h2>
                            <div className={styles.sessionCards}>
                                {group.items.map((s) => (
                                    <div
                                        key={s.id}
                                        className={styles.sessionCard}
                                        onClick={() => openDetail(s.id)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') openDetail(s.id);
                                        }}
                                    >
                                        <div className={styles.cardTime}>
                                            <span className={styles.cardTimeText}>
                                                {formatTimeRange(s.startsAt, s.endsAt)}
                                            </span>
                                            <span className={`${styles.statusBadge} ${statusBadgeClass(s.status)}`}>
                                                {STATUS_LABELS[s.status]}
                                            </span>
                                        </div>

                                        <div className={styles.cardMain}>
                                            <h3 className={styles.cardTitle}>{s.title}</h3>
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
                                                    <span className={styles.metaItem}>
                                                        {s.courseTitle}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className={styles.cardEnroll}>
                                            <span className={styles.enrollCount}>
                                                <Users size={14} />
                                                {s.registeredCount}
                                                {s.capacity !== null ? `/${s.capacity}` : ''} påmeldt
                                            </span>
                                            {s.waitlistCount > 0 && (
                                                <span className={styles.waitlistCount}>
                                                    +{s.waitlistCount} på venteliste
                                                </span>
                                            )}
                                        </div>

                                        <div
                                            className={styles.cardActions}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <button
                                                className={styles.actionBtn}
                                                onClick={() => openEdit(s)}
                                                aria-label="Rediger sesjon"
                                                title="Rediger"
                                            >
                                                <Edit3 size={15} />
                                            </button>
                                            {s.status === 'SCHEDULED' && (
                                                <>
                                                    <button
                                                        className={styles.actionBtn}
                                                        onClick={() => handleComplete(s)}
                                                        aria-label="Marker som gjennomført"
                                                        title="Marker som gjennomført"
                                                    >
                                                        <CircleCheck size={15} />
                                                    </button>
                                                    <button
                                                        className={`${styles.actionBtn} ${styles.actionBtnWarn}`}
                                                        onClick={() => setConfirmCancel(s)}
                                                        aria-label="Avlys sesjon"
                                                        title="Avlys"
                                                    >
                                                        <Ban size={15} />
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                                onClick={() => setConfirmDelete(s)}
                                                aria-label="Slett sesjon"
                                                title="Slett"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* ── Create / Edit drawer ──────────────────────── */}
            {drawerOpen && (
                <div className={styles.drawerOverlay} onClick={() => setDrawerOpen(false)}>
                    <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.drawerHeader}>
                            <h2 className={styles.drawerTitle}>
                                {editingId ? 'Rediger sesjon' : 'Ny sesjon'}
                            </h2>
                            <button
                                className={styles.iconButton}
                                onClick={() => setDrawerOpen(false)}
                                aria-label="Lukk"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className={styles.drawerForm}>
                            <div className={styles.drawerBody}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Tittel *</label>
                                    <input
                                        className={styles.formInput}
                                        type="text"
                                        value={form.title}
                                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                                        required
                                        placeholder="F.eks. Innføring i HMS"
                                        autoFocus
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Beskrivelse</label>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={form.description}
                                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                                        rows={3}
                                        placeholder="Kort beskrivelse av sesjonen"
                                    />
                                </div>

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Format</label>
                                        <div className={styles.selectWrap}>
                                            <select
                                                className={styles.formSelect}
                                                value={form.format}
                                                onChange={(e) =>
                                                    setForm({ ...form, format: e.target.value as SessionFormat })
                                                }
                                            >
                                                <option value="IN_PERSON">Fysisk</option>
                                                <option value="ONLINE">Nettbasert</option>
                                                <option value="HYBRID">Hybrid</option>
                                            </select>
                                            <ChevronDown size={16} className={styles.selectChevron} />
                                        </div>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Status</label>
                                        <div className={styles.selectWrap}>
                                            <select
                                                className={styles.formSelect}
                                                value={form.status}
                                                onChange={(e) =>
                                                    setForm({ ...form, status: e.target.value as SessionStatus })
                                                }
                                            >
                                                <option value="DRAFT">Kladd</option>
                                                <option value="SCHEDULED">Planlagt</option>
                                                <option value="CANCELLED">Avlyst</option>
                                                <option value="COMPLETED">Gjennomført</option>
                                            </select>
                                            <ChevronDown size={16} className={styles.selectChevron} />
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Starter *</label>
                                        <input
                                            className={styles.formInput}
                                            type="datetime-local"
                                            value={form.startsAt}
                                            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Slutter *</label>
                                        <input
                                            className={styles.formInput}
                                            type="datetime-local"
                                            value={form.endsAt}
                                            onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                {form.format !== 'ONLINE' && (
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            <MapPin size={14} /> Sted
                                        </label>
                                        <input
                                            className={styles.formInput}
                                            type="text"
                                            value={form.location}
                                            onChange={(e) => setForm({ ...form, location: e.target.value })}
                                            placeholder="F.eks. Møterom 3, Oslo"
                                        />
                                    </div>
                                )}

                                {form.format !== 'IN_PERSON' && (
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>
                                            <Video size={14} /> Møtelenke
                                        </label>
                                        <input
                                            className={styles.formInput}
                                            type="url"
                                            value={form.meetingUrl}
                                            onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })}
                                            placeholder="https://..."
                                        />
                                    </div>
                                )}

                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Kapasitet</label>
                                        <input
                                            className={styles.formInput}
                                            type="number"
                                            min={0}
                                            value={form.capacity}
                                            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                                            placeholder="Tom = ubegrenset"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Instruktør</label>
                                        <div className={styles.selectWrap}>
                                            <select
                                                className={styles.formSelect}
                                                value={form.instructorUserId}
                                                onChange={(e) =>
                                                    setForm({ ...form, instructorUserId: e.target.value })
                                                }
                                            >
                                                <option value="">Ingen valgt</option>
                                                {instructors.map((u) => (
                                                    <option key={u.id} value={u.id}>
                                                        {u.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown size={16} className={styles.selectChevron} />
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Tilknyttet kurs (valgfritt)</label>
                                    <div className={styles.selectWrap}>
                                        <select
                                            className={styles.formSelect}
                                            value={form.courseId}
                                            onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                                        >
                                            <option value="">Ingen valgt</option>
                                            {courses.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.title}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={16} className={styles.selectChevron} />
                                    </div>
                                </div>
                            </div>

                            <div className={styles.drawerFooter}>
                                <button
                                    type="button"
                                    className={styles.btnSecondary}
                                    onClick={() => setDrawerOpen(false)}
                                >
                                    Avbryt
                                </button>
                                <button type="submit" className={styles.btnPrimary} disabled={saving}>
                                    {saving ? 'Lagrer...' : editingId ? 'Lagre endringer' : 'Opprett sesjon'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Detail loading ────────────────────────────── */}
            {detailLoading && (
                <div className={styles.drawerOverlay}>
                    <div className={styles.loading}>
                        <div className={styles.spinner} />
                        Laster sesjon...
                    </div>
                </div>
            )}

            {/* ── Detail modal ──────────────────────────────── */}
            {detail && (
                <div className={styles.drawerOverlay} onClick={() => setDetail(null)}>
                    <div className={styles.detailModal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.drawerHeader}>
                            <div>
                                <h2 className={styles.drawerTitle}>{detail.title}</h2>
                                <span className={`${styles.statusBadge} ${statusBadgeClass(detail.status)}`}>
                                    {STATUS_LABELS[detail.status]}
                                </span>
                            </div>
                            <button
                                className={styles.iconButton}
                                onClick={() => setDetail(null)}
                                aria-label="Lukk"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className={styles.detailBody}>
                            {detail.description && (
                                <p className={styles.detailDescription}>{detail.description}</p>
                            )}

                            <div className={styles.detailMeta}>
                                <div className={styles.detailMetaItem}>
                                    <span className={styles.detailMetaLabel}>Tidspunkt</span>
                                    <span className={styles.detailMetaValue}>
                                        {formatDayHeading(detail.startsAt)} ·{' '}
                                        {formatTimeRange(detail.startsAt, detail.endsAt)}
                                    </span>
                                </div>
                                <div className={styles.detailMetaItem}>
                                    <span className={styles.detailMetaLabel}>Format</span>
                                    <span className={styles.detailMetaValue}>
                                        {FORMAT_LABELS[detail.format]}
                                    </span>
                                </div>
                                {detail.location && (
                                    <div className={styles.detailMetaItem}>
                                        <span className={styles.detailMetaLabel}>Sted</span>
                                        <span className={styles.detailMetaValue}>{detail.location}</span>
                                    </div>
                                )}
                                {detail.meetingUrl && (
                                    <div className={styles.detailMetaItem}>
                                        <span className={styles.detailMetaLabel}>Møtelenke</span>
                                        <a
                                            className={styles.detailLink}
                                            href={detail.meetingUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            {detail.meetingUrl}
                                        </a>
                                    </div>
                                )}
                                {detail.instructorName && (
                                    <div className={styles.detailMetaItem}>
                                        <span className={styles.detailMetaLabel}>Instruktør</span>
                                        <span className={styles.detailMetaValue}>
                                            {detail.instructorName}
                                        </span>
                                    </div>
                                )}
                                {detail.courseTitle && (
                                    <div className={styles.detailMetaItem}>
                                        <span className={styles.detailMetaLabel}>Kurs</span>
                                        <span className={styles.detailMetaValue}>{detail.courseTitle}</span>
                                    </div>
                                )}
                                <div className={styles.detailMetaItem}>
                                    <span className={styles.detailMetaLabel}>Påmeldte</span>
                                    <span className={styles.detailMetaValue}>
                                        {detail.registeredCount}
                                        {detail.capacity !== null ? ` / ${detail.capacity}` : ''}
                                        {detail.waitlistCount > 0 && ` (+${detail.waitlistCount} venteliste)`}
                                    </span>
                                </div>
                            </div>

                            {/* Add attendee */}
                            <div className={styles.addAttendee}>
                                <span className={styles.sectionLabel}>Legg til deltaker</span>
                                <div className={styles.searchBox}>
                                    <Search size={16} className={styles.searchIcon} />
                                    <input
                                        className={styles.searchInput}
                                        type="text"
                                        placeholder="Søk etter bruker..."
                                        value={attendeeSearch}
                                        onChange={(e) => setAttendeeSearch(e.target.value)}
                                    />
                                </div>
                                {attendeeResults.length > 0 && (
                                    <div className={styles.attendeeResults}>
                                        {attendeeResults.map((u) => (
                                            <button
                                                key={u.id}
                                                type="button"
                                                className={styles.attendeeResult}
                                                onClick={() => handleAddAttendee(u.id)}
                                            >
                                                <div className={styles.rosterAvatar}>
                                                    {u.avatarUrl ? (
                                                        <img src={u.avatarUrl} alt="" className={styles.rosterAvatarImg} />
                                                    ) : (
                                                        formatInitials(u.name)
                                                    )}
                                                </div>
                                                <span className={styles.rosterName}>{u.name}</span>
                                                {u.email && (
                                                    <span className={styles.rosterEmail}>{u.email}</span>
                                                )}
                                                <UserPlus size={15} className={styles.attendeeAddIcon} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Roster */}
                            <span className={styles.sectionLabel}>
                                Deltakerliste ({detail.enrollments.filter((e) => e.status !== 'CANCELLED').length})
                            </span>
                            {detail.enrollments.filter((e) => e.status !== 'CANCELLED').length === 0 ? (
                                <p className={styles.rosterEmpty}>Ingen påmeldte ennå.</p>
                            ) : (
                                <div className={styles.roster}>
                                    {detail.enrollments
                                        .filter((e) => e.status !== 'CANCELLED')
                                        .map((e) => (
                                            <div key={e.enrollmentId} className={styles.rosterRow}>
                                                <div className={styles.rosterAvatar}>
                                                    {e.avatarUrl ? (
                                                        <img src={e.avatarUrl} alt="" className={styles.rosterAvatarImg} />
                                                    ) : (
                                                        formatInitials(e.name)
                                                    )}
                                                </div>
                                                <div className={styles.rosterInfo}>
                                                    <span className={styles.rosterName}>{e.name}</span>
                                                    {e.email && (
                                                        <span className={styles.rosterEmail}>{e.email}</span>
                                                    )}
                                                </div>
                                                <span className={`${styles.enrollBadge} ${
                                                    e.status === 'WAITLISTED'
                                                        ? styles.enrollWaitlisted
                                                        : e.status === 'ATTENDED'
                                                        ? styles.enrollAttended
                                                        : e.status === 'NO_SHOW'
                                                        ? styles.enrollNoShow
                                                        : styles.enrollRegistered
                                                }`}>
                                                    {ENROLL_STATUS_LABELS[e.status]}
                                                </span>
                                                <div className={styles.rosterActions}>
                                                    <button
                                                        className={`${styles.attendBtn} ${
                                                            e.status === 'ATTENDED' ? styles.attendBtnActive : ''
                                                        }`}
                                                        onClick={() => handleAttendance(e.userId, 'ATTENDED')}
                                                        title="Møtte opp"
                                                        aria-label="Marker som møtt"
                                                    >
                                                        <CircleCheck size={15} />
                                                    </button>
                                                    <button
                                                        className={`${styles.attendBtn} ${
                                                            e.status === 'NO_SHOW' ? styles.attendBtnNoShowActive : ''
                                                        }`}
                                                        onClick={() => handleAttendance(e.userId, 'NO_SHOW')}
                                                        title="Møtte ikke"
                                                        aria-label="Marker som ikke møtt"
                                                    >
                                                        <Ban size={15} />
                                                    </button>
                                                    <button
                                                        className={`${styles.attendBtn} ${styles.attendBtnDanger}`}
                                                        onClick={() => handleRemoveAttendee(e.userId)}
                                                        title="Fjern deltaker"
                                                        aria-label="Fjern deltaker"
                                                    >
                                                        <UserMinus size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Confirm dialogs ───────────────────────────── */}
            <ConfirmDialog
                open={confirmDelete !== null}
                title="Slett sesjon"
                description={`Er du sikker på at du vil slette "${confirmDelete?.title ?? ''}"? Alle påmeldinger fjernes. Dette kan ikke angres.`}
                confirmText="Slett sesjon"
                variant="danger"
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(null)}
            />
            <ConfirmDialog
                open={confirmCancel !== null}
                title="Avlys sesjon"
                description={`Er du sikker på at du vil avlyse "${confirmCancel?.title ?? ''}"? Påmeldte deltakere beholdes, men sesjonen markeres som avlyst.`}
                confirmText="Avlys sesjon"
                variant="danger"
                onConfirm={handleCancel}
                onCancel={() => setConfirmCancel(null)}
            />

            {/* ── Toast ─────────────────────────────────────── */}
            {toast && (
                <div className={styles.toast}>
                    <CheckCircle2 size={16} />
                    {toast}
                </div>
            )}
        </div>
    );
}
