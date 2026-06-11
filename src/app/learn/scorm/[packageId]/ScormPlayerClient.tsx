'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import styles from './player.module.css';

interface Props {
    packageId: string;
    title: string;
    scormVersion: string;
    entryPath: string;
    packagePath: string;
    seedCmi: Record<string, string>;
    seedSuspendData: string | null;
    seedLessonStatus: string | null;
}

// Statuser som regnes som fullført.
const COMPLETED_STATUSES = ['completed', 'passed'];

/**
 * Bygg en trygg iframe-src fra packagePath + entryPath. entryPath stammer fra
 * et UKLARERT manifest; selv om det saneres ved import er dette en ekstra
 * forsvarslinje for eldre/uventede verdier. Avviser absolutte/protokoll-
 * relative URL-er, scheme-er og path-traversal, og holder src innenfor
 * pakkemappen. Returnerer null hvis pathen er utrygg.
 */
function buildSafeSrc(packagePath: string, entryPath: string): string | null {
    const value = entryPath.trim().replace(/\\/g, '/');
    if (!value) return null;

    const pathPart = value.split(/[?#]/)[0];
    // Scheme ("http:", "javascript:", "data:" …) eller absolutt/protokoll-relativ.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(pathPart)) return null;
    if (pathPart.startsWith('/')) return null;

    // Path-traversal: ingen "." eller ".." som segment.
    for (const seg of pathPart.split('/')) {
        if (seg === '.' || seg === '..') return null;
    }

    const base = packagePath.endsWith('/') ? packagePath.slice(0, -1) : packagePath;
    return `${base}/${value}`;
}

/**
 * Minimal SCORM 1.2 + 2004 runtime-shim.
 *
 * - Buffrer hele CMI-datamodellen i minnet (en flat key/value-map).
 * - Eksponerer window.API (SCORM 1.2) og window.API_1484_11 (SCORM 2004).
 * - POSTer til /api/scorm/commit ved Commit og Finish/Terminate.
 * - Seedes fra lagret forsøk ved init.
 *
 * Sikkerhet: Innholdet i iframen er UKLARERT HTML/JS. Vi kjører det i en
 * sandkasse-iframe. Commit-kallet autentiseres + tenant-scopes server-side i
 * /api/scorm/commit — klienten kan ikke skrive til en annen brukers forsøk.
 */
export default function ScormPlayerClient({
    packageId,
    title,
    scormVersion,
    entryPath,
    packagePath,
    seedCmi,
    seedSuspendData,
    seedLessonStatus,
}: Props) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [loading, setLoading] = useState(true);
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    // CMI-buffer i minnet. Initialiseres fra lagret forsøk.
    const cmiRef = useRef<Record<string, string>>({ ...seedCmi });
    const lastErrorRef = useRef<string>('0');

    const is2004 = scormVersion === '2004';

    // Bygg src for iframen. entryPath er sanert server-side ved import; vi
    // re-validerer her som ekstra forsvarslinje (null = utrygg path).
    const src = buildSafeSrc(packagePath, entryPath);

    /** Les en CMI-verdi (med fornuftige defaults per versjon). */
    const getValue = useCallback(
        (key: string): string => {
            lastErrorRef.current = '0';
            const v = cmiRef.current[key];
            if (v !== undefined) return v;

            // Defaults for vanlige init-felter.
            if (is2004) {
                if (key === 'cmi.completion_status') return seedLessonStatus ?? 'unknown';
                if (key === 'cmi.success_status') return 'unknown';
                if (key === 'cmi.suspend_data') return seedSuspendData ?? '';
                if (key === 'cmi.entry') return seedSuspendData ? 'resume' : 'ab-initio';
                if (key === 'cmi.credit') return 'credit';
                if (key === 'cmi.mode') return 'normal';
                if (key === 'cmi._version') return '1.0';
            } else {
                if (key === 'cmi.core.lesson_status') return seedLessonStatus ?? 'not attempted';
                if (key === 'cmi.suspend_data') return seedSuspendData ?? '';
                if (key === 'cmi.core.entry') return seedSuspendData ? 'resume' : 'ab-initio';
                if (key === 'cmi.core.credit') return 'credit';
                if (key === 'cmi.core.lesson_mode') return 'normal';
                if (key === 'cmi.core.score.min') return '0';
                if (key === 'cmi.core.score.max') return '100';
            }
            return '';
        },
        [is2004, seedLessonStatus, seedSuspendData]
    );

    /** Skriv en CMI-verdi til bufferet. */
    const setValue = useCallback((key: string, value: string): string => {
        lastErrorRef.current = '0';
        cmiRef.current[key] = String(value);
        return 'true';
    }, []);

    /** Pakk ut status/score/suspend/time fra bufferet og POST til serveren. */
    const commit = useCallback(
        async (finished: boolean): Promise<void> => {
            const cmi = cmiRef.current;

            const lessonStatus = is2004
                ? cmi['cmi.completion_status'] === 'completed'
                    ? cmi['cmi.success_status'] === 'failed'
                        ? 'failed'
                        : cmi['cmi.success_status'] === 'passed'
                            ? 'passed'
                            : 'completed'
                    : cmi['cmi.success_status'] || cmi['cmi.completion_status'] || undefined
                : cmi['cmi.core.lesson_status'] || undefined;

            const scoreRawStr = is2004
                ? cmi['cmi.score.raw']
                : cmi['cmi.core.score.raw'];
            const scoreRaw =
                scoreRawStr !== undefined && scoreRawStr !== '' ? Number(scoreRawStr) : undefined;

            const suspendData = cmi['cmi.suspend_data'];
            const totalTime = is2004
                ? cmi['cmi.session_time'] || cmi['cmi.total_time']
                : cmi['cmi.core.session_time'] || cmi['cmi.core.total_time'];

            setSaveState('saving');
            try {
                const res = await fetch('/api/scorm/commit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        packageId,
                        cmi,
                        lessonStatus,
                        scoreRaw: Number.isFinite(scoreRaw as number) ? scoreRaw : undefined,
                        suspendData,
                        totalTime,
                        finished,
                    }),
                });
                setSaveState(res.ok ? 'saved' : 'error');
            } catch {
                setSaveState('error');
            }
        },
        [is2004, packageId]
    );

    useEffect(() => {
        // ── SCORM 1.2 API ──
        const API = {
            LMSInitialize: (): string => {
                lastErrorRef.current = '0';
                return 'true';
            },
            LMSGetValue: (key: string): string => getValue(key),
            LMSSetValue: (key: string, value: string): string => setValue(key, value),
            LMSCommit: (): string => {
                void commit(false);
                return 'true';
            },
            LMSFinish: (): string => {
                void commit(true);
                return 'true';
            },
            LMSGetLastError: (): string => lastErrorRef.current,
            LMSGetErrorString: (): string => '',
            LMSGetDiagnostic: (): string => '',
        };

        // ── SCORM 2004 API ──
        const API_1484_11 = {
            Initialize: (): string => {
                lastErrorRef.current = '0';
                return 'true';
            },
            GetValue: (key: string): string => getValue(key),
            SetValue: (key: string, value: string): string => setValue(key, value),
            Commit: (): string => {
                void commit(false);
                return 'true';
            },
            Terminate: (): string => {
                void commit(true);
                return 'true';
            },
            GetLastError: (): string => lastErrorRef.current,
            GetErrorString: (): string => '',
            GetDiagnostic: (): string => '',
        };

        // SCORM-innhold søker etter API på window og opp gjennom parent-kjeden.
        // Vi eksponerer begge varianter slik at både 1.2 og 2004 fungerer.
        const w = window as unknown as Record<string, unknown>;
        w.API = API;
        w.API_1484_11 = API_1484_11;

        return () => {
            // Best-effort commit ved unmount (navigering bort), deretter rydd opp.
            void commit(false);
            delete w.API;
            delete w.API_1484_11;
        };
    }, [getValue, setValue, commit]);

    // Lagre når brukeren forlater siden.
    useEffect(() => {
        const handler = () => {
            void commit(false);
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [commit]);

    const completed =
        seedLessonStatus !== null && COMPLETED_STATUSES.includes(seedLessonStatus);

    return (
        <div className={styles.player}>
            <div className={styles.topbar}>
                <div className={styles.topbarLeft}>
                    <h1 className={styles.title}>{title}</h1>
                    <span className={styles.versionBadge}>
                        {is2004 ? 'SCORM 2004' : 'SCORM 1.2'}
                    </span>
                    {completed && (
                        <span className={styles.completedBadge}>
                            <CheckCircle size={14} />
                            Fullført
                        </span>
                    )}
                </div>
                <div className={styles.saveStatus} aria-live="polite">
                    {saveState === 'saving' && (
                        <span className={styles.saving}>
                            <Loader2 size={14} className={styles.spin} />
                            Lagrer…
                        </span>
                    )}
                    {saveState === 'saved' && (
                        <span className={styles.saved}>
                            <CheckCircle size={14} />
                            Lagret
                        </span>
                    )}
                    {saveState === 'error' && (
                        <span className={styles.saveError}>
                            <AlertTriangle size={14} />
                            Kunne ikke lagre
                        </span>
                    )}
                </div>
            </div>

            <div className={styles.frameWrap}>
                {src === null ? (
                    <div className={styles.frameLoading}>
                        <AlertTriangle size={20} />
                        Innholdet kunne ikke vises.
                    </div>
                ) : (
                    <>
                        {loading && (
                            <div className={styles.frameLoading}>
                                <Loader2 size={24} className={styles.spin} />
                                Laster innhold…
                            </div>
                        )}
                        {/*
                          Sandkasse: allow-scripts + allow-same-origin kreves for at
                          SCORM-API-broen skal fungere. Vi gir IKKE allow-top-navigation
                          eller allow-popups. Se followups for same-origin XSS-tradeoff.
                        */}
                        <iframe
                            ref={iframeRef}
                            title={title}
                            src={src}
                            className={styles.frame}
                            sandbox="allow-scripts allow-same-origin allow-forms"
                            onLoad={() => setLoading(false)}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
