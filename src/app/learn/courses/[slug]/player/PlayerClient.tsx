'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2, Circle,
    Lock, Menu, X, BookOpen, ChevronDown, Check, HelpCircle,
    Trophy, ArrowRight, RotateCcw,
    Headphones, Copy, Info, Lightbulb, AlertTriangle, ShieldAlert,
    ListChecks, PenLine,
} from 'lucide-react';
import {
    markLessonCompleted,
    trackLessonView,
    saveBlockResponse,
} from '@/app/actions/learnerActions';
import type { PlayerData } from '@/app/actions/learnerActions';
import { sanitizeHtml, sanitizeEmbed } from '@/lib/sanitize';
import styles from './player.module.css';

interface Props {
    data: PlayerData;
    courseSlug: string;
}

function LessonStatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'COMPLETED':
            return <CheckCircle2 size={14} className={styles.iconCompleted} />;
        case 'STARTED':
            return <Circle size={14} className={styles.iconStarted} />;
        case 'LOCKED':
            return <Lock size={12} className={styles.iconLocked} />;
        default:
            return <Circle size={14} className={styles.iconAvailable} />;
    }
}

/* ── YouTube/Vimeo URL → embed URL conversion ───── */
function getEmbedUrl(url: string): string {
    // YouTube: various URL formats
    const ytMatch = url.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;

    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

    // Already an embed URL or other — return as-is
    return url;
}

/* ── Quiz Block (interactive, multi-step) ────────────────────── */

interface QuizQuestion {
    question: string;
    options: { text: string; isCorrect: boolean }[];
    explanation: string;
}

interface SavedQuizResponse {
    selectedIndices: (number | null)[];
    submittedSteps: boolean[];
    completed: boolean;
}

function QuizBlock({ data, onComplete, savedResponse, onSave }: {
    data: Record<string, unknown>;
    onComplete?: () => void;
    savedResponse?: SavedQuizResponse;
    onSave?: (response: SavedQuizResponse) => void;
}) {
    // Support both legacy single-question and multi-step format
    const questions: QuizQuestion[] = (() => {
        const qs = data.questions as QuizQuestion[] | undefined;
        if (qs && Array.isArray(qs) && qs.length > 0) return qs;
        // Legacy single-question format
        return [{
            question: (data.question as string) || '',
            options: (data.options as Array<{ text: string; isCorrect: boolean }>) || [],
            explanation: (data.explanation as string) || '',
        }];
    })();

    const [currentStep, setCurrentStep] = useState(() => {
        if (savedResponse?.submittedSteps) {
            // Resume at the first unanswered step, or last step if all submitted
            const firstUnanswered = savedResponse.submittedSteps.findIndex((s) => !s);
            return firstUnanswered === -1 ? Math.max(0, questions.length - 1) : firstUnanswered;
        }
        return 0;
    });
    const [selectedIndices, setSelectedIndices] = useState<(number | null)[]>(
        () => savedResponse?.selectedIndices ?? questions.map(() => null)
    );
    const [submittedSteps, setSubmittedSteps] = useState<boolean[]>(
        () => savedResponse?.submittedSteps ?? questions.map(() => false)
    );
    const [completed, setCompleted] = useState(() => savedResponse?.completed ?? false);

    // Fire onComplete on mount if already completed from saved state
    const firedInitialComplete = useRef(false);
    useEffect(() => {
        if (completed && !firedInitialComplete.current) {
            firedInitialComplete.current = true;
            onComplete?.();
        }
    }, [completed, onComplete]);

    const totalSteps = questions.length;
    const isMultiStep = totalSteps > 1;
    const q = questions[currentStep];
    const selectedIndex = selectedIndices[currentStep];
    const isSubmitted = submittedSteps[currentStep];
    const isCorrect = selectedIndex !== null && q.options[selectedIndex]?.isCorrect;

    // Check if all steps are answered correctly
    const allCorrect = questions.every((qu, i) => {
        const sel = selectedIndices[i];
        return sel !== null && submittedSteps[i] && qu.options[sel]?.isCorrect;
    });

    function handleSelect(optIndex: number) {
        if (isSubmitted) return;
        setSelectedIndices(prev => {
            const next = [...prev];
            next[currentStep] = optIndex;
            return next;
        });
    }

    function persistState(indices: (number | null)[], submitted: boolean[], done: boolean) {
        onSave?.({ selectedIndices: indices, submittedSteps: submitted, completed: done });
    }

    function handleSubmit() {
        const newSubmitted = [...submittedSteps];
        newSubmitted[currentStep] = true;
        setSubmittedSteps(newSubmitted);
        persistState(selectedIndices, newSubmitted, completed);
    }

    function handleNext() {
        if (currentStep < totalSteps - 1) {
            setCurrentStep(currentStep + 1);
        } else if (allCorrect && !completed) {
            setCompleted(true);
            onComplete?.();
            persistState(selectedIndices, submittedSteps, true);
        }
    }

    function handleRetry() {
        const newIndices = [...selectedIndices];
        newIndices[currentStep] = null;
        const newSubmitted = [...submittedSteps];
        newSubmitted[currentStep] = false;
        setSelectedIndices(newIndices);
        setSubmittedSteps(newSubmitted);
        persistState(newIndices, newSubmitted, false);
    }

    return (
        <div className={styles.quizContainer}>
            <div className={styles.quizHeader}>
                <HelpCircle size={18} />
                <span>Quiz</span>
                {isMultiStep && (
                    <span className={styles.quizStepIndicator}>
                        {currentStep + 1} / {totalSteps}
                    </span>
                )}
            </div>

            {isMultiStep && (
                <div className={styles.quizProgressBar}>
                    <div
                        className={styles.quizProgressFill}
                        style={{ width: `${((currentStep + (isSubmitted ? 1 : 0)) / totalSteps) * 100}%` }}
                    />
                </div>
            )}

            {q.question && (
                <div className={styles.quizQuestion} dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question) }} />
            )}
            <div className={styles.quizOptions}>
                {q.options.map((opt, i) => {
                    let optClass = styles.quizOption;
                    if (isSubmitted && i === selectedIndex) {
                        optClass += opt.isCorrect ? ` ${styles.quizOptionCorrect}` : ` ${styles.quizOptionWrong}`;
                    } else if (isSubmitted && opt.isCorrect) {
                        optClass += ` ${styles.quizOptionCorrect}`;
                    } else if (!isSubmitted && i === selectedIndex) {
                        optClass += ` ${styles.quizOptionSelected}`;
                    }
                    return (
                        <button
                            key={i}
                            type="button"
                            className={optClass}
                            onClick={() => handleSelect(i)}
                            disabled={isSubmitted}
                        >
                            <span className={styles.quizOptionLetter}>{String.fromCharCode(65 + i)}</span>
                            <span className={styles.quizOptionText}>{opt.text || `Alternativ ${i + 1}`}</span>
                            {isSubmitted && i === selectedIndex && (
                                isCorrect
                                    ? <CheckCircle2 size={16} className={styles.quizIconCorrect} />
                                    : <X size={16} className={styles.quizIconWrong} />
                            )}
                            {isSubmitted && opt.isCorrect && i !== selectedIndex && (
                                <CheckCircle2 size={16} className={styles.quizIconCorrect} />
                            )}
                        </button>
                    );
                })}
            </div>

            {!isSubmitted ? (
                <button
                    type="button"
                    className={styles.quizSubmitBtn}
                    disabled={selectedIndex === null}
                    onClick={handleSubmit}
                >
                    Sjekk svar
                </button>
            ) : (
                <div className={`${styles.quizResult} ${isCorrect ? styles.quizResultCorrect : styles.quizResultWrong}`}>
                    <span className={styles.quizResultText}>
                        {isCorrect ? 'Riktig!' : 'Feil svar.'}
                    </span>
                    {q.explanation && (
                        <div className={styles.quizExplanation} dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.explanation) }} />
                    )}
                    <div className={styles.quizResultActions}>
                        {!isCorrect && (
                            <button
                                type="button"
                                className={styles.quizRetryBtn}
                                onClick={handleRetry}
                            >
                                Prøv igjen
                            </button>
                        )}
                        {isCorrect && currentStep < totalSteps - 1 && (
                            <button
                                type="button"
                                className={styles.quizNextBtn}
                                onClick={handleNext}
                            >
                                Neste spørsmål
                                <ChevronRight size={16} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {completed && (
                <div className={styles.quizCompleted}>
                    <CheckCircle2 size={18} />
                    <span>Quiz fullført!</span>
                </div>
            )}
        </div>
    );
}

/* ── Audio Block ─────────────────────────────────── */
function AudioBlock({ data }: { data: Record<string, unknown> }) {
    const url = (data.url as string) || '';
    const title = (data.title as string) || '';
    const transcript = (data.transcript as string) || '';
    const [showTranscript, setShowTranscript] = useState(false);

    if (!url) return <p className={styles.blockPlaceholder}>Lydfil ikke tilgjengelig.</p>;

    return (
        <div className={styles.audioContainer}>
            <div className={styles.audioHeader}>
                <Headphones size={18} />
                <span>{title || 'Lydfil'}</span>
            </div>
            <audio
                controls
                className={styles.audioPlayer}
                preload="metadata"
            >
                <source src={url} />
                Nettleseren din støtter ikke lydavspilling.
            </audio>
            {transcript && (
                <>
                    <button
                        type="button"
                        className={styles.transcriptToggle}
                        onClick={() => setShowTranscript(!showTranscript)}
                    >
                        {showTranscript ? 'Skjul transkripsjon' : 'Vis transkripsjon'}
                        <ChevronDown size={14} style={{ transform: showTranscript ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </button>
                    {showTranscript && (
                        <div className={styles.transcriptContent}>{transcript}</div>
                    )}
                </>
            )}
        </div>
    );
}

/* ── Code Block ──────────────────────────────────── */
function CodeBlock({ data }: { data: Record<string, unknown> }) {
    const code = (data.code as string) || '';
    const language = (data.language as string) || '';
    const caption = (data.caption as string) || '';
    const showLineNumbers = (data.lineNumbers as boolean) ?? true;
    const showCopyButton = (data.copyButton as boolean) ?? true;
    const [copied, setCopied] = useState(false);

    if (!code) return <p className={styles.blockPlaceholder}>Kodesnutt ikke tilgjengelig.</p>;

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    }

    const lines = code.split('\n');

    return (
        <div className={styles.codeContainer}>
            <div className={styles.codeHeader}>
                {language && <span className={styles.codeLanguage}>{language}</span>}
                {showCopyButton && (
                    <button type="button" className={styles.codeCopyBtn} onClick={handleCopy}>
                        {copied ? <><Check size={14} /> Kopiert</> : <><Copy size={14} /> Kopiér</>}
                    </button>
                )}
            </div>
            <pre className={styles.codeBlock}>
                {showLineNumbers ? (
                    <table className={styles.codeTable}>
                        <tbody>
                            {lines.map((line, i) => (
                                <tr key={i}>
                                    <td className={styles.codeLineNum}>{i + 1}</td>
                                    <td className={styles.codeLineContent}>{line || '\n'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <code>{code}</code>
                )}
            </pre>
            {caption && <p className={styles.codeCaption}>{caption}</p>}
        </div>
    );
}

/* ── Callout Block ───────────────────────────────── */
function CalloutBlock({ data }: { data: Record<string, unknown> }) {
    const variant = (data.variant as string) || 'info';
    const title = (data.title as string) || '';
    const body = (data.body as string) || '';

    const variantIcons: Record<string, typeof Info> = {
        info: Info,
        tip: Lightbulb,
        warning: AlertTriangle,
        danger: ShieldAlert,
    };
    const Icon = variantIcons[variant] || Info;

    const variantLabels: Record<string, string> = {
        info: 'Info',
        tip: 'Tips',
        warning: 'Advarsel',
        danger: 'Viktig',
    };

    return (
        <div className={`${styles.calloutContainer} ${styles[`callout_${variant}`] || ''}`}>
            <div className={styles.calloutHeader}>
                <Icon size={18} />
                <span>{title || variantLabels[variant] || 'Merknad'}</span>
            </div>
            {body && (
                <div className={styles.calloutBody} dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }} />
            )}
        </div>
    );
}

/* ── Checklist Block ─────────────────────────────── */
function ChecklistBlock({ data }: { data: Record<string, unknown> }) {
    const title = (data.title as string) || '';
    const items = (data.items as Array<{ id: string; text: string; required: boolean }>) || [];
    const showProgress = (data.showProgress as boolean) ?? true;
    const [checked, setChecked] = useState<Record<string, boolean>>({});

    const checkedCount = Object.values(checked).filter(Boolean).length;
    const progressPercent = items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 0;

    function toggleItem(id: string) {
        setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
    }

    return (
        <div className={styles.checklistContainer}>
            <div className={styles.checklistHeader}>
                <ListChecks size={18} />
                <span>{title || 'Sjekkliste'}</span>
            </div>
            {showProgress && items.length > 0 && (
                <div className={styles.checklistProgress}>
                    <div className={styles.checklistProgressBar}>
                        <div
                            className={styles.checklistProgressFill}
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <span className={styles.checklistProgressText}>
                        {checkedCount}/{items.length} fullført
                    </span>
                </div>
            )}
            <div className={styles.checklistItems}>
                {items.map((item) => (
                    <label key={item.id} className={`${styles.checklistItem} ${checked[item.id] ? styles.checklistItemChecked : ''}`}>
                        <input
                            type="checkbox"
                            checked={!!checked[item.id]}
                            onChange={() => toggleItem(item.id)}
                            className={styles.checklistCheckbox}
                        />
                        <span className={styles.checklistItemText}>
                            {item.text || 'Punkt'}
                            {item.required && <span className={styles.checklistRequired}>*</span>}
                        </span>
                    </label>
                ))}
            </div>
        </div>
    );
}

/* ── Open Response Block ─────────────────────────── */
function OpenResponseBlock({ data, savedText, onSave }: { data: Record<string, unknown>; savedText?: string; onSave?: (text: string) => void }) {
    const prompt = (data.prompt as string) || '';
    const maxChars = (data.maxChars as number) || 3000;
    const [response, setResponse] = useState(savedText ?? '');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
        const text = e.target.value.slice(0, maxChars);
        setResponse(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            onSave?.(text);
        }, 800);
    }

    return (
        <div className={styles.openResponseContainer}>
            <div className={styles.openResponseHeader}>
                <PenLine size={18} />
                <span>Refleksjonsoppgave</span>
            </div>
            {prompt && (
                <div className={styles.openResponsePrompt} dangerouslySetInnerHTML={{ __html: sanitizeHtml(prompt) }} />
            )}
            <textarea
                className={styles.openResponseTextarea}
                value={response}
                onChange={handleChange}
                placeholder="Skriv svaret ditt her..."
                maxLength={maxChars}
                rows={6}
            />
            <div className={styles.openResponseFooter}>
                <span className={styles.openResponseCount}>
                    {response.length} / {maxChars} tegn
                </span>
            </div>
        </div>
    );
}

/* ── Divider Block ───────────────────────────────── */
function DividerBlock({ data }: { data: Record<string, unknown> }) {
    const divStyle = (data.style as string) || 'line';

    if (divStyle === 'space') {
        return <div className={styles.dividerSpace} />;
    }
    if (divStyle === 'dots') {
        return (
            <div className={styles.dividerDots}>
                <span /><span /><span />
            </div>
        );
    }
    return <hr className={styles.dividerLine} />;
}

/* ── Block Renderers ────────────────────────────── */
function RenderBlock({ block, onQuizComplete, enrollmentId, blockResponses }: {
    block: { blockId: string; type: string; data: unknown; position: number };
    onQuizComplete?: (blockId: string) => void;
    enrollmentId: string;
    blockResponses: Record<string, unknown>;
}) {
    const d = block.data as Record<string, unknown>;

    const handleSaveResponse = useCallback((responseData: Record<string, unknown>) => {
        saveBlockResponse(enrollmentId, block.blockId, responseData);
    }, [enrollmentId, block.blockId]);

    switch (block.type) {
        case 'TEXT':
        case 'RICH_TEXT':
            return (
                <div
                    className={styles.blockText}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml((d.html as string) ?? (d.content as string) ?? '') }}
                />
            );
        case 'VIDEO': {
            const rawUrl = (d.url as string) || '';
            const embedUrl = rawUrl ? getEmbedUrl(rawUrl) : '';
            return (
                <div className={styles.blockVideo}>
                    {embedUrl ? (
                        <iframe
                            src={embedUrl}
                            title={(d.title as string) || 'Video'}
                            className={styles.videoIframe}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    ) : (
                        <p className={styles.blockPlaceholder}>Video ikke tilgjengelig.</p>
                    )}
                </div>
            );
        }
        case 'IMAGE':
            return (
                <div className={styles.blockImage}>
                    {d.url ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={d.url as string} alt={(d.alt as string) ?? ''} className={styles.imageEl} />
                            {(d.caption as string) && (
                                <p className={styles.imageCaption}>{d.caption as string}</p>
                            )}
                        </>
                    ) : (
                        <p className={styles.blockPlaceholder}>Bilde ikke tilgjengelig.</p>
                    )}
                </div>
            );
        case 'QUIZ':
        case 'ASSESSMENT':
            return (
                <QuizBlock
                    data={d}
                    onComplete={() => onQuizComplete?.(block.blockId)}
                    savedResponse={blockResponses[block.blockId] as SavedQuizResponse | undefined}
                    onSave={(resp) => handleSaveResponse(resp as unknown as Record<string, unknown>)}
                />
            );
        case 'DOCUMENT':
        case 'FILE':
            return (
                <div className={styles.blockFile}>
                    <a
                        href={d.url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.fileLink}
                    >
                        Last ned fil: {(d.title as string) ?? (d.filename as string) ?? 'Vedlegg'}
                    </a>
                </div>
            );
        case 'EMBED': {
            const code = (d.code as string) || '';
            return (
                <div className={styles.blockEmbed}>
                    {code ? (
                        <div dangerouslySetInnerHTML={{ __html: sanitizeEmbed(code) }} />
                    ) : (
                        <p className={styles.blockPlaceholder}>Embed ikke tilgjengelig.</p>
                    )}
                </div>
            );
        }
        case 'AUDIO':
            return <AudioBlock data={d} />;
        case 'CODE':
            return <CodeBlock data={d} />;
        case 'CALLOUT':
            return <CalloutBlock data={d} />;
        case 'CHECKLIST':
            return <ChecklistBlock data={d} />;
        case 'OPEN_RESPONSE': {
            const savedOR = blockResponses[block.blockId] as { text?: string } | undefined;
            return (
                <OpenResponseBlock
                    data={d}
                    savedText={savedOR?.text}
                    onSave={(text) => handleSaveResponse({ text })}
                />
            );
        }
        case 'DIVIDER':
            return <DividerBlock data={d} />;
        default:
            return (
                <div className={styles.blockUnknown}>
                    <p className={styles.blockPlaceholder}>Innholdstype &quot;{block.type}&quot; støttes ikke ennå.</p>
                </div>
            );
    }
}

/* ── Course Completed Overlay ────────────────────── */
function CourseCompletedOverlay({ courseTitle, courseSlug }: { courseTitle: string; courseSlug: string }) {
    const router = useRouter();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Trigger entrance animation
        const t = setTimeout(() => setVisible(true), 50);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className={`${styles.completionOverlay} ${visible ? styles.completionVisible : ''}`}>
            {/* Confetti particles */}
            <div className={styles.confettiContainer} aria-hidden>
                {Array.from({ length: 40 }).map((_, i) => (
                    <span key={i} className={styles.confetti} style={{
                        '--x': `${Math.random() * 100}vw`,
                        '--delay': `${Math.random() * 2}s`,
                        '--duration': `${2.5 + Math.random() * 2}s`,
                        '--rotation': `${Math.random() * 720 - 360}deg`,
                        '--color': ['var(--color-accent-blue)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-button-primary)', '#a855f7', '#ec4899'][i % 6],
                        '--size': `${6 + Math.random() * 6}px`,
                    } as React.CSSProperties} />
                ))}
            </div>

            <div className={`${styles.completionCard} ${visible ? styles.completionCardVisible : ''}`}>
                <div className={styles.completionTrophy}>
                    <Trophy size={48} />
                </div>
                <h1 className={styles.completionTitle}>Gratulerer!</h1>
                <p className={styles.completionSubtitle}>Du har fullført kurset</p>
                <p className={styles.completionCourse}>{courseTitle}</p>

                <div className={styles.completionActions}>
                    <button
                        className={styles.completionPrimary}
                        onClick={() => router.push('/learn/my-learning')}
                        type="button"
                    >
                        Mine kurs
                        <ArrowRight size={16} />
                    </button>
                    <button
                        className={styles.completionSecondary}
                        onClick={() => router.push(`/learn/courses/${courseSlug}`)}
                        type="button"
                    >
                        <RotateCcw size={14} />
                        Se gjennom kurset
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function PlayerClient({ data, courseSlug }: Props) {
    const router = useRouter();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showCompletion, setShowCompletion] = useState(false);
    const [expandedModules, setExpandedModules] = useState<Set<string>>(() => {
        // Auto-expand the module containing the current lesson
        const current = data.currentLesson;
        if (!current) return new Set(data.modules.map((m) => m.moduleId));
        const containingModule = data.modules.find((m) =>
            m.lessons.some((l) => l.lessonId === current.lessonId)
        );
        return containingModule ? new Set([containingModule.moduleId]) : new Set();
    });

    // Track which quiz blocks in the current lesson have been completed
    const [completedQuizzes, setCompletedQuizzes] = useState<Set<string>>(() => {
        // Initialize from persisted block responses
        const initial = new Set<string>();
        if (data.blockResponses) {
            for (const [blockId, resp] of Object.entries(data.blockResponses)) {
                const r = resp as SavedQuizResponse | null;
                if (r?.completed) initial.add(blockId);
            }
        }
        return initial;
    });

    // When lesson changes, re-initialize from persisted data
    useEffect(() => {
        const initial = new Set<string>();
        if (data.blockResponses) {
            for (const [blockId, resp] of Object.entries(data.blockResponses)) {
                const r = resp as SavedQuizResponse | null;
                if (r?.completed) initial.add(blockId);
            }
        }
        setCompletedQuizzes(initial);
    }, [data.currentLesson?.lessonId, data.blockResponses]);

    // Find all quiz block IDs in the current lesson
    const quizBlockIds: string[] = data.currentLesson
        ? data.currentLesson.blocks
            .filter((b) => b.type === 'QUIZ' || b.type === 'ASSESSMENT')
            .map((b) => b.blockId)
        : [];

    // Are all quizzes in this lesson answered correctly?
    const allQuizzesCompleted = quizBlockIds.length === 0 || quizBlockIds.every((id) => completedQuizzes.has(id));

    const handleQuizComplete = useCallback((blockId: string) => {
        setCompletedQuizzes((prev) => {
            const next = new Set(prev);
            next.add(blockId);
            return next;
        });
    }, []);

    // Track lesson view on mount
    useEffect(() => {
        if (data.currentLesson) {
            trackLessonView(data.enrollmentId, data.currentLesson.lessonId);
        }
    }, [data.enrollmentId, data.currentLesson]);

    // "Neste" auto-completes the lesson then moves forward (optimistic navigation)
    const handleNext = useCallback(() => {
        if (!data.currentLesson) return;

        // Check if already completed
        const alreadyDone = (() => {
            for (const mod of data.modules) {
                const found = mod.lessons.find((l) => l.lessonId === data.currentLesson!.lessonId);
                if (found) return found.status === 'COMPLETED';
            }
            return false;
        })();

        // Fire-and-forget: mark lesson as completed in the background
        if (!alreadyDone) {
            markLessonCompleted(data.enrollmentId, data.currentLesson.lessonId).catch(console.error);
        }

        // Navigate immediately (optimistic)
        if (data.nextLessonId) {
            router.push(`/learn/courses/${courseSlug}/player?lesson=${data.nextLessonId}`);
        } else {
            setShowCompletion(true);
        }
    }, [data, courseSlug, router]);

    function navigateToLesson(lessonId: string) {
        router.push(`/learn/courses/${courseSlug}/player?lesson=${lessonId}`);
    }

    function toggleModule(moduleId: string) {
        setExpandedModules((prev) => {
            const next = new Set(prev);
            if (next.has(moduleId)) next.delete(moduleId);
            else next.add(moduleId);
            return next;
        });
    }

    // Check if current lesson is already completed
    const isCurrentCompleted = (() => {
        if (!data.currentLesson) return false;
        for (const mod of data.modules) {
            const found = mod.lessons.find((l) => l.lessonId === data.currentLesson!.lessonId);
            if (found) return found.status === 'COMPLETED';
        }
        return false;
    })();

    const isLastLesson = !data.nextLessonId;

    return (
        <div className={styles.player}>
            {/* Sidebar TOC */}
            <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
                <div className={styles.sidebarHeader}>
                    <button
                        className={styles.backBtn}
                        onClick={() => router.push(`/learn/courses/${courseSlug}`)}
                        type="button"
                    >
                        <ArrowLeft size={16} />
                        <span className={styles.backLabel}>Tilbake</span>
                    </button>
                    <button
                        className={styles.closeSidebarBtn}
                        onClick={() => setSidebarOpen(false)}
                        type="button"
                        aria-label="Lukk innholdsfortegnelse"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className={styles.sidebarTitle}>
                    <h2 className={styles.courseTitle}>{data.courseTitle}</h2>
                    <div className={styles.sidebarProgress}>
                        <div className={styles.progressBar}>
                            <div className={styles.progressFill} style={{ width: `${data.progressPercent}%` }} />
                        </div>
                        <span className={styles.progressText}>{data.progressPercent}%</span>
                    </div>
                </div>

                <nav className={styles.tocNav}>
                    {data.modules.map((mod) => {
                        const isExpanded = expandedModules.has(mod.moduleId);
                        return (
                            <div key={mod.moduleId} className={styles.tocModule}>
                                <button
                                    className={styles.tocModuleBtn}
                                    onClick={() => toggleModule(mod.moduleId)}
                                    type="button"
                                >
                                    <ChevronDown
                                        size={14}
                                        className={`${styles.tocChevron} ${isExpanded ? styles.tocChevronOpen : ''}`}
                                    />
                                    <span className={styles.tocModuleTitle}>{mod.title}</span>
                                </button>

                                {isExpanded && (
                                    <div className={styles.tocLessons}>
                                        {mod.lessons.map((lesson) => {
                                            const isCurrent = lesson.lessonId === data.currentLesson?.lessonId;
                                            return (
                                                <button
                                                    key={lesson.lessonId}
                                                    className={`${styles.tocLesson} ${isCurrent ? styles.tocLessonActive : ''} ${lesson.status === 'LOCKED' ? styles.tocLessonLocked : ''}`}
                                                    onClick={() => {
                                                        if (lesson.status !== 'LOCKED') navigateToLesson(lesson.lessonId);
                                                    }}
                                                    disabled={lesson.status === 'LOCKED'}
                                                    type="button"
                                                >
                                                    <LessonStatusIcon status={isCurrent && !isCurrentCompleted ? 'STARTED' : lesson.status} />
                                                    <span className={styles.tocLessonTitle}>{lesson.title}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>
            </aside>

            {/* Main content area */}
            <main className={styles.mainContent}>
                {/* Top bar */}
                <div className={styles.topBar}>
                    {!sidebarOpen && (
                        <button
                            className={styles.menuBtn}
                            onClick={() => setSidebarOpen(true)}
                            type="button"
                            aria-label="Åpne innholdsfortegnelse"
                        >
                            <Menu size={18} />
                        </button>
                    )}
                    <div className={styles.topBarTitle}>
                        {data.currentLesson && (
                            <>
                                <span className={styles.topBarModule}>{data.currentLesson.moduleTitle}</span>
                                <span className={styles.topBarSep}>/</span>
                                <span className={styles.topBarLesson}>{data.currentLesson.title}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className={styles.contentArea}>
                    {data.currentLesson ? (
                        <div className={styles.lessonContent}>
                            {data.currentLesson.blocks.length > 0 ? (
                                data.currentLesson.blocks
                                    .sort((a, b) => a.position - b.position)
                                    .map((block) => (
                                        <RenderBlock
                                            key={block.blockId}
                                            block={block}
                                            onQuizComplete={handleQuizComplete}
                                            enrollmentId={data.enrollmentId}
                                            blockResponses={data.blockResponses ?? {}}
                                        />
                                    ))
                            ) : (
                                <div className={styles.noContent}>
                                    <BookOpen size={32} />
                                    <p>Denne leksjonen har ikke noe innhold ennå.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={styles.noContent}>
                            <BookOpen size={32} />
                            <p>Velg en leksjon fra innholdsfortegnelsen.</p>
                        </div>
                    )}
                </div>

                {/* Bottom navigation */}
                {data.currentLesson && (
                    <div className={styles.bottomBar}>
                        <button
                            className={styles.navBtn}
                            disabled={!data.prevLessonId}
                            onClick={() => data.prevLessonId && navigateToLesson(data.prevLessonId)}
                            type="button"
                        >
                            <ChevronLeft size={16} />
                            Forrige
                        </button>

                        {isCurrentCompleted ? (
                            <span className={styles.completedTag}>
                                <CheckCircle2 size={16} /> Fullført
                            </span>
                        ) : !allQuizzesCompleted && quizBlockIds.length > 0 ? (
                            <span className={styles.quizGateHint}>
                                <Lock size={14} />
                                Fullfør alle quizer for å gå videre
                            </span>
                        ) : null}

                        {isLastLesson && !isCurrentCompleted ? (
                            <button
                                className={`${styles.navBtn} ${styles.navBtnFinish}`}
                                disabled={!allQuizzesCompleted}
                                onClick={handleNext}
                                type="button"
                                title={!allQuizzesCompleted ? 'Fullfør alle quizer først' : undefined}
                            >
                                Fullfør kurs
                                <Trophy size={16} />
                            </button>
                        ) : (
                            <button
                                className={styles.navBtn}
                                disabled={!allQuizzesCompleted && !isCurrentCompleted}
                                onClick={() => {
                                    if (isCurrentCompleted && data.nextLessonId) {
                                        navigateToLesson(data.nextLessonId);
                                    } else {
                                        handleNext();
                                    }
                                }}
                                type="button"
                                title={!allQuizzesCompleted && !isCurrentCompleted ? 'Fullfør alle quizer først' : undefined}
                            >
                                Neste
                                <ChevronRight size={16} />
                            </button>
                        )}
                    </div>
                )}
            </main>

            {/* Course Completed overlay */}
            {showCompletion && (
                <CourseCompletedOverlay courseTitle={data.courseTitle} courseSlug={courseSlug} />
            )}
        </div>
    );
}
