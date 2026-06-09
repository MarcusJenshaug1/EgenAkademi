'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    X, Plus, Trash2, GripVertical, Save,
    Type, Image, Video, FileText, Code, HelpCircle, Upload,
    ChevronUp, ChevronDown, ArrowLeft,
    Headphones, Code2, AlertTriangle, ListChecks, PenLine, Minus,
    Info, Lightbulb, ShieldAlert, Copy, Check,
} from 'lucide-react';
import styles from './blockEditor.module.css';
import { sanitizeHtml } from '@/lib/sanitize';
import { RichTextEditor } from '@/components/LexicalEditor';
import {
    getLessonBlocks, addBlock, updateBlock, deleteBlock, reorderBlocks,
} from '@/app/actions/courseBuilderActions';

// ── Types ───────────────────────────────────────────────────

type BlockType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'QUIZ' | 'DOCUMENT' | 'EMBED'
    | 'AUDIO' | 'CODE' | 'CALLOUT' | 'CHECKLIST' | 'OPEN_RESPONSE' | 'DIVIDER';

interface BlockData {
    id: string;
    position: number;
    type: BlockType;
    data: Record<string, unknown>;
    accessibilityMeta: Record<string, unknown> | null;
}

interface LessonBlockEditorProps {
    lessonId: string;
    lessonTitle: string;
    isDraft: boolean;
    onClose: () => void;
    onBlockCountChange: () => void;
}

const BLOCK_TYPE_INFO: Record<BlockType, { label: string; icon: typeof Type; description: string }> = {
    TEXT: { label: 'Tekst', icon: Type, description: 'Rik tekst med formatering' },
    IMAGE: { label: 'Bilde', icon: Image, description: 'Bilde med alt-tekst' },
    VIDEO: { label: 'Video', icon: Video, description: 'Video fra URL (YouTube, Vimeo, etc.)' },
    DOCUMENT: { label: 'Dokument', icon: FileText, description: 'Lenke til dokument eller fil' },
    EMBED: { label: 'Embed', icon: Code, description: 'Embed-kode (iframe, widget, etc.)' },
    QUIZ: { label: 'Quiz', icon: HelpCircle, description: 'Spørsmål med svaralternativer' },
    AUDIO: { label: 'Lyd', icon: Headphones, description: 'Lydfil med avspiller og valgfri transkripsjon' },
    CODE: { label: 'Kode', icon: Code2, description: 'Kodesnutt med syntaksutheving' },
    CALLOUT: { label: 'Merknad', icon: AlertTriangle, description: 'Info, tips, advarsel eller fare-boks' },
    CHECKLIST: { label: 'Sjekkliste', icon: ListChecks, description: 'Interaktiv sjekkliste med fremgang' },
    OPEN_RESPONSE: { label: 'Åpent svar', icon: PenLine, description: 'Fritekstoppgave for refleksjon' },
    DIVIDER: { label: 'Skillelinje', icon: Minus, description: 'Visuelt skille mellom seksjoner' },
};

// ── Default data per block type ─────────────────────────────

function getDefaultData(type: BlockType): Record<string, unknown> {
    switch (type) {
        case 'TEXT':
            return { content: '' };
        case 'IMAGE':
            return { url: '', alt: '', caption: '' };
        case 'VIDEO':
            return { url: '', title: '' };
        case 'DOCUMENT':
            return { url: '', title: '', description: '' };
        case 'EMBED':
            return { code: '', title: '' };
        case 'QUIZ':
            return {
                question: '',
                options: [
                    { text: '', isCorrect: true },
                    { text: '', isCorrect: false },
                ],
                explanation: '',
            };
        case 'AUDIO':
            return { url: '', title: '', transcript: '', allowSpeed: true };
        case 'CODE':
            return { code: '', language: 'javascript', caption: '', lineNumbers: true, copyButton: true };
        case 'CALLOUT':
            return { variant: 'info', title: '', body: '' };
        case 'CHECKLIST':
            return {
                title: '',
                items: [
                    { id: crypto.randomUUID(), text: '', required: false },
                ],
                showProgress: true,
            };
        case 'OPEN_RESPONSE':
            return { prompt: '', maxChars: 3000, required: false };
        case 'DIVIDER':
            return { style: 'line' };
    }
}

// ── Main component ──────────────────────────────────────────

export default function LessonBlockEditor({
    lessonId,
    lessonTitle,
    isDraft,
    onClose,
    onBlockCountChange,
}: LessonBlockEditorProps) {
    const [blocks, setBlocks] = useState<BlockData[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // ── Load blocks ─────────────────────────────────────────

    const loadBlocks = useCallback(async () => {
        const result = await getLessonBlocks(lessonId);
        if ('success' in result) {
            setBlocks(result.blocks as BlockData[]);
        } else {
            setError(result.error);
        }
        setLoading(false);
    }, [lessonId]);

    useEffect(() => {
        loadBlocks();
    }, [loadBlocks]);

    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // ── Handlers ────────────────────────────────────────────

    async function handleAddBlock(type: BlockType) {
        setSaving(true);
        setShowAddMenu(false);
        const result = await addBlock(lessonId, {
            type,
            data: getDefaultData(type),
        });
        if ('success' in result) {
            setToast('Blokk lagt til');
            await loadBlocks();
            onBlockCountChange();
            setEditingBlockId(result.blockId);
        } else {
            setError(result.error);
        }
        setSaving(false);
    }

    async function handleSaveBlock(block: BlockData) {
        setSaving(true);
        const result = await updateBlock(block.id, {
            data: block.data,
        });
        if ('success' in result) {
            setToast('Blokk lagret');
            setEditingBlockId(null);
        } else {
            setError(result.error);
        }
        setSaving(false);
    }

    async function handleDeleteBlock(blockId: string) {
        setSaving(true);
        const result = await deleteBlock(blockId);
        if ('success' in result) {
            setBlocks((prev) => prev.filter((b) => b.id !== blockId));
            setToast('Blokk slettet');
            onBlockCountChange();
        } else {
            setError(result.error);
        }
        setSaving(false);
    }

    async function handleMoveBlock(blockId: string, direction: 'up' | 'down') {
        const idx = blocks.findIndex((b) => b.id === blockId);
        if (idx < 0) return;
        if (direction === 'up' && idx === 0) return;
        if (direction === 'down' && idx === blocks.length - 1) return;

        const newBlocks = [...blocks];
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        [newBlocks[idx], newBlocks[swapIdx]] = [newBlocks[swapIdx], newBlocks[idx]];

        // Update local state immediately
        setBlocks(newBlocks);

        // Persist new order
        const result = await reorderBlocks(lessonId, newBlocks.map((b) => b.id));
        if ('error' in result) {
            setError(result.error);
            await loadBlocks(); // revert
        }
    }

    function updateLocalBlock(blockId: string, newData: Record<string, unknown>) {
        setBlocks((prev) =>
            prev.map((b) => (b.id === blockId ? { ...b, data: newData } : b))
        );
    }

    // ── Render ──────────────────────────────────────────────

    return (
        <div className={styles.overlay}>
            <div className={styles.editor}>
                {/* Header */}
                <div className={styles.editorHeader}>
                    <div className={styles.editorHeaderLeft}>
                        <button className={styles.backBtn} onClick={onClose} aria-label="Tilbake">
                            <ArrowLeft size={18} />
                        </button>
                        <div>
                            <h2 className={styles.editorTitle}>{lessonTitle}</h2>
                            <p className={styles.editorSubtitle}>
                                {blocks.length} {blocks.length === 1 ? 'innholdsblokk' : 'innholdsblokker'}
                            </p>
                        </div>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Lukk">
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className={styles.editorBody}>
                    {loading ? (
                        <div className={styles.loadingState}>Laster innhold...</div>
                    ) : (
                        <>
                            {error && (
                                <div className={styles.errorBanner}>
                                    {error}
                                    <button className={styles.closeBtnSmall} onClick={() => setError(null)} aria-label="Lukk">
                                        <X size={14} />
                                    </button>
                                </div>
                            )}

                            {blocks.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <FileText size={32} className={styles.emptyIcon} />
                                    <h3 className={styles.emptyTitle}>Ingen innhold ennå</h3>
                                    <p className={styles.emptyText}>
                                        Legg til innholdsblokker for å bygge opp leksjonen.
                                    </p>
                                </div>
                            ) : (
                                <div className={styles.blockList}>
                                    {blocks.map((block, idx) => (
                                        <div key={block.id} className={styles.blockCard}>
                                            <div className={styles.blockHeader}>
                                                <div className={styles.blockHeaderLeft}>
                                                    <GripVertical size={14} className={styles.gripIcon} />
                                                    <span className={styles.blockTypeBadge}>
                                                        {(() => {
                                                            const info = BLOCK_TYPE_INFO[block.type];
                                                            const Icon = info.icon;
                                                            return (
                                                                <>
                                                                    <Icon size={13} />
                                                                    {info.label}
                                                                </>
                                                            );
                                                        })()}
                                                    </span>
                                                    <span className={styles.blockPosition}>#{idx + 1}</span>
                                                </div>
                                                <div className={styles.blockActions}>
                                                    {isDraft && (
                                                        <>
                                                            <button
                                                                className={styles.iconBtn}
                                                                onClick={() => handleMoveBlock(block.id, 'up')}
                                                                disabled={idx === 0}
                                                                aria-label="Flytt opp"
                                                            >
                                                                <ChevronUp size={14} />
                                                            </button>
                                                            <button
                                                                className={styles.iconBtn}
                                                                onClick={() => handleMoveBlock(block.id, 'down')}
                                                                disabled={idx === blocks.length - 1}
                                                                aria-label="Flytt ned"
                                                            >
                                                                <ChevronDown size={14} />
                                                            </button>
                                                            <button
                                                                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                                                onClick={() => handleDeleteBlock(block.id)}
                                                                aria-label="Slett blokk"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            <div className={styles.blockBody}>
                                                {editingBlockId === block.id && isDraft ? (
                                                    <BlockEditor
                                                        block={block}
                                                        onChange={(newData) => updateLocalBlock(block.id, newData)}
                                                        onSave={() => handleSaveBlock(block)}
                                                        onCancel={() => {
                                                            setEditingBlockId(null);
                                                            loadBlocks(); // revert
                                                        }}
                                                        saving={saving}
                                                    />
                                                ) : (
                                                    <div
                                                        className={`${styles.blockPreview} ${isDraft ? styles.blockPreviewClickable : ''}`}
                                                        onClick={() => isDraft && setEditingBlockId(block.id)}
                                                    >
                                                        <BlockPreview block={block} />
                                                        {isDraft && (
                                                            <span className={styles.editHint}>Klikk for å redigere</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add block button */}
                            {isDraft && (
                                <div className={styles.addBlockArea}>
                                    <button
                                        className={styles.addBlockBtn}
                                        onClick={() => setShowAddMenu(!showAddMenu)}
                                        disabled={saving}
                                    >
                                        <Plus size={16} />
                                        Legg til innholdsblokk
                                    </button>

                                    {showAddMenu && (
                                        <div className={styles.addBlockMenu}>
                                            {(Object.keys(BLOCK_TYPE_INFO) as BlockType[]).map((type) => {
                                                const info = BLOCK_TYPE_INFO[type];
                                                const Icon = info.icon;
                                                return (
                                                    <button
                                                        key={type}
                                                        className={styles.addBlockOption}
                                                        onClick={() => handleAddBlock(type)}
                                                    >
                                                        <Icon size={18} />
                                                        <div>
                                                            <div className={styles.addBlockOptionLabel}>{info.label}</div>
                                                            <div className={styles.addBlockOptionDesc}>{info.description}</div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Toast */}
                {toast && (
                    <div className={styles.toast}>
                        <Save size={14} />
                        {toast}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Block Preview ───────────────────────────────────────────

function BlockPreview({ block }: { block: BlockData }) {
    const data = block.data;

    switch (block.type) {
        case 'TEXT': {
            const content = (data.content as string) || '';
            return (
                <div className={styles.previewText}>
                    {content ? (
                        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.length > 500 ? content.substring(0, 500) + '...' : content) }} />
                    ) : (
                        <span className={styles.previewEmpty}>Tom tekstblokk</span>
                    )}
                </div>
            );
        }
        case 'IMAGE': {
            const url = (data.url as string) || '';
            const alt = (data.alt as string) || '';
            return (
                <div className={styles.previewImage}>
                    {url ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={alt} className={styles.previewImg} />
                            {alt && <span className={styles.previewCaption}>{alt}</span>}
                        </>
                    ) : (
                        <span className={styles.previewEmpty}>
                            <Image size={16} /> Bilde ikke konfigurert
                        </span>
                    )}
                </div>
            );
        }
        case 'VIDEO': {
            const url = (data.url as string) || '';
            const title = (data.title as string) || '';
            return (
                <div className={styles.previewVideo}>
                    {url ? (
                        <span className={styles.previewLink}>
                            <Video size={16} /> {title || url}
                        </span>
                    ) : (
                        <span className={styles.previewEmpty}>
                            <Video size={16} /> Video ikke konfigurert
                        </span>
                    )}
                </div>
            );
        }
        case 'DOCUMENT': {
            const url = (data.url as string) || '';
            const title = (data.title as string) || '';
            return (
                <div className={styles.previewDocument}>
                    {url ? (
                        <span className={styles.previewLink}>
                            <FileText size={16} /> {title || url}
                        </span>
                    ) : (
                        <span className={styles.previewEmpty}>
                            <FileText size={16} /> Dokument ikke konfigurert
                        </span>
                    )}
                </div>
            );
        }
        case 'EMBED': {
            const code = (data.code as string) || '';
            const title = (data.title as string) || '';
            return (
                <div className={styles.previewEmbed}>
                    {code ? (
                        <span className={styles.previewLink}>
                            <Code size={16} /> {title || 'Embed-kode konfigurert'}
                        </span>
                    ) : (
                        <span className={styles.previewEmpty}>
                            <Code size={16} /> Embed ikke konfigurert
                        </span>
                    )}
                </div>
            );
        }
        case 'QUIZ': {
            const question = (data.question as string) || '';
            const options = (data.options as Array<{ text: string; isCorrect: boolean }>) || [];
            return (
                <div className={styles.previewQuiz}>
                    {question ? (
                        <>
                            <div className={styles.previewQuestion} dangerouslySetInnerHTML={{ __html: sanitizeHtml(question) }} />
                            <div className={styles.previewOptions}>
                                {options.map((opt, i) => (
                                    <span key={i} className={`${styles.previewOption} ${opt.isCorrect ? styles.previewOptionCorrect : ''}`}>
                                        {opt.text || `Alternativ ${i + 1}`}
                                    </span>
                                ))}
                            </div>
                        </>
                    ) : (
                        <span className={styles.previewEmpty}>
                            <HelpCircle size={16} /> Quiz ikke konfigurert
                        </span>
                    )}
                </div>
            );
        }
        case 'AUDIO': {
            const url = (data.url as string) || '';
            const title = (data.title as string) || '';
            return (
                <div className={styles.previewAudio}>
                    {url ? (
                        <span className={styles.previewLink}>
                            <Headphones size={16} /> {title || url}
                        </span>
                    ) : (
                        <span className={styles.previewEmpty}>
                            <Headphones size={16} /> Lydfil ikke konfigurert
                        </span>
                    )}
                </div>
            );
        }
        case 'CODE': {
            const code = (data.code as string) || '';
            const language = (data.language as string) || '';
            return (
                <div className={styles.previewCode}>
                    {code ? (
                        <>
                            {language && <span className={styles.previewCodeLang}>{language}</span>}
                            <pre className={styles.previewCodeBlock}>
                                <code>{code.length > 300 ? code.substring(0, 300) + '...' : code}</code>
                            </pre>
                        </>
                    ) : (
                        <span className={styles.previewEmpty}>
                            <Code2 size={16} /> Kodesnutt ikke konfigurert
                        </span>
                    )}
                </div>
            );
        }
        case 'CALLOUT': {
            const variant = (data.variant as string) || 'info';
            const title = (data.title as string) || '';
            const body = (data.body as string) || '';
            const variantIcons: Record<string, typeof Info> = { info: Info, tip: Lightbulb, warning: AlertTriangle, danger: ShieldAlert };
            const VariantIcon = variantIcons[variant] || Info;
            return (
                <div className={`${styles.previewCallout} ${styles[`previewCallout_${variant}`] || ''}`}>
                    <span className={styles.previewCalloutHeader}>
                        <VariantIcon size={16} />
                        {title || variant.charAt(0).toUpperCase() + variant.slice(1)}
                    </span>
                    {body ? (
                        <span className={styles.previewCalloutBody}>{body.length > 200 ? body.substring(0, 200) + '...' : body}</span>
                    ) : (
                        <span className={styles.previewEmpty}>Ingen innhold</span>
                    )}
                </div>
            );
        }
        case 'CHECKLIST': {
            const items = (data.items as Array<{ id: string; text: string; required: boolean }>) || [];
            const title = (data.title as string) || '';
            return (
                <div className={styles.previewChecklist}>
                    {title && <span className={styles.previewChecklistTitle}>{title}</span>}
                    {items.length > 0 ? (
                        <div className={styles.previewChecklistItems}>
                            {items.map((item, i) => (
                                <span key={item.id || i} className={styles.previewChecklistItem}>
                                    <ListChecks size={14} />
                                    {item.text || `Punkt ${i + 1}`}
                                    {item.required && <span className={styles.previewChecklistRequired}>*</span>}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <span className={styles.previewEmpty}>
                            <ListChecks size={16} /> Sjekkliste ikke konfigurert
                        </span>
                    )}
                </div>
            );
        }
        case 'OPEN_RESPONSE': {
            const prompt = (data.prompt as string) || '';
            const maxChars = (data.maxChars as number) || 3000;
            return (
                <div className={styles.previewOpenResponse}>
                    {prompt ? (
                        <>
                            <span className={styles.previewLink}>
                                <PenLine size={16} /> {prompt.length > 200 ? prompt.substring(0, 200) + '...' : prompt}
                            </span>
                            <span className={styles.previewMeta}>Maks {maxChars} tegn</span>
                        </>
                    ) : (
                        <span className={styles.previewEmpty}>
                            <PenLine size={16} /> Åpent svar ikke konfigurert
                        </span>
                    )}
                </div>
            );
        }
        case 'DIVIDER': {
            const divStyle = (data.style as string) || 'line';
            return (
                <div className={styles.previewDivider}>
                    <span className={styles.previewDividerLabel}>
                        <Minus size={14} />
                        Skillelinje ({divStyle === 'line' ? 'linje' : divStyle === 'dots' ? 'prikker' : 'mellomrom'})
                    </span>
                </div>
            );
        }
    }
}

// ── Block Editor (per type) ─────────────────────────────────

function BlockEditor({
    block,
    onChange,
    onSave,
    onCancel,
    saving,
}: {
    block: BlockData;
    onChange: (data: Record<string, unknown>) => void;
    onSave: () => void;
    onCancel: () => void;
    saving: boolean;
}) {
    const data = block.data;

    function updateField(field: string, value: unknown) {
        onChange({ ...data, [field]: value });
    }

    return (
        <div className={styles.editorForm}>
            {block.type === 'TEXT' && (
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Tekstinnhold</label>
                    <RichTextEditor
                        initialHtml={(data.content as string) || ''}
                        onChange={(html) => updateField('content', html)}
                        minHeight={200}
                        placeholder="Skriv tekstinnhold her..."
                    />
                </div>
            )}

            {block.type === 'IMAGE' && (
                <ImageBlockEditor data={data} onChange={onChange} />
            )}

            {block.type === 'VIDEO' && (
                <>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Video-URL *</label>
                        <input
                            className={styles.formInput}
                            type="url"
                            value={(data.url as string) || ''}
                            onChange={(e) => updateField('url', e.target.value)}
                            placeholder="https://youtube.com/watch?v=... eller Vimeo-lenke"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Tittel</label>
                        <input
                            className={styles.formInput}
                            type="text"
                            value={(data.title as string) || ''}
                            onChange={(e) => updateField('title', e.target.value)}
                            placeholder="Valgfri tittel for videoen"
                        />
                    </div>
                </>
            )}

            {block.type === 'DOCUMENT' && (
                <>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Dokument-URL *</label>
                        <input
                            className={styles.formInput}
                            type="url"
                            value={(data.url as string) || ''}
                            onChange={(e) => updateField('url', e.target.value)}
                            placeholder="https://example.com/document.pdf"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Tittel *</label>
                        <input
                            className={styles.formInput}
                            type="text"
                            value={(data.title as string) || ''}
                            onChange={(e) => updateField('title', e.target.value)}
                            placeholder="Dokumenttittel"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Beskrivelse</label>
                        <input
                            className={styles.formInput}
                            type="text"
                            value={(data.description as string) || ''}
                            onChange={(e) => updateField('description', e.target.value)}
                            placeholder="Valgfri beskrivelse"
                        />
                    </div>
                </>
            )}

            {block.type === 'EMBED' && (
                <>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Embed-kode *</label>
                        <textarea
                            className={styles.formTextarea}
                            rows={5}
                            value={(data.code as string) || ''}
                            onChange={(e) => updateField('code', e.target.value)}
                            placeholder='<iframe src="..." width="100%" height="400"></iframe>'
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Tittel</label>
                        <input
                            className={styles.formInput}
                            type="text"
                            value={(data.title as string) || ''}
                            onChange={(e) => updateField('title', e.target.value)}
                            placeholder="Valgfri tittel"
                        />
                    </div>
                </>
            )}

            {block.type === 'QUIZ' && (
                <QuizEditor data={data} onChange={onChange} />
            )}

            {block.type === 'AUDIO' && (
                <AudioBlockEditor data={data} onChange={onChange} />
            )}

            {block.type === 'CODE' && (
                <CodeBlockEditor data={data} onChange={onChange} />
            )}

            {block.type === 'CALLOUT' && (
                <CalloutEditor data={data} onChange={onChange} />
            )}

            {block.type === 'CHECKLIST' && (
                <ChecklistEditor data={data} onChange={onChange} />
            )}

            {block.type === 'OPEN_RESPONSE' && (
                <OpenResponseEditor data={data} onChange={onChange} />
            )}

            {block.type === 'DIVIDER' && (
                <DividerEditor data={data} onChange={onChange} />
            )}

            {/* Save / Cancel buttons */}
            <div className={styles.editorActions}>
                <button className={styles.btnSecondary} onClick={onCancel}>
                    Avbryt
                </button>
                <button className={styles.btnPrimary} onClick={onSave} disabled={saving}>
                    <Save size={14} />
                    {saving ? 'Lagrer...' : 'Lagre'}
                </button>
            </div>
        </div>
    );
}

// ── Image Block Editor (upload + URL) ───────────────────────

function ImageBlockEditor({
    data,
    onChange,
}: {
    data: Record<string, unknown>;
    onChange: (data: Record<string, unknown>) => void;
}) {
    const [mode, setMode] = useState<'url' | 'upload'>((data.url as string) ? 'url' : 'upload');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    function updateField(field: string, value: unknown) {
        onChange({ ...data, [field]: value });
    }

    async function handleFileUpload(file: File) {
        setUploading(true);
        setUploadError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'image');
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const json = await res.json();
            if (json.success) {
                updateField('url', json.url);
                setMode('url'); // Show the URL after upload
            } else {
                setUploadError(json.error || 'Opplasting feilet');
            }
        } catch {
            setUploadError('Nettverksfeil ved opplasting');
        }
        setUploading(false);
    }

    return (
        <>
            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Bildekilden</label>
                <div className={styles.imageModeTabs}>
                    <button
                        type="button"
                        className={`${styles.imageModeTab} ${mode === 'upload' ? styles.imageModeTabActive : ''}`}
                        onClick={() => setMode('upload')}
                    >
                        <Upload size={14} />
                        Last opp
                    </button>
                    <button
                        type="button"
                        className={`${styles.imageModeTab} ${mode === 'url' ? styles.imageModeTabActive : ''}`}
                        onClick={() => setMode('url')}
                    >
                        <Code size={14} />
                        URL
                    </button>
                </div>
            </div>

            {mode === 'upload' && (
                <div className={styles.formGroup}>
                    <div
                        className={styles.uploadDropzone}
                        onClick={() => fileRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const file = e.dataTransfer.files[0];
                            if (file) handleFileUpload(file);
                        }}
                    >
                        {uploading ? (
                            <span className={styles.uploadingText}>Laster opp...</span>
                        ) : (
                            <>
                                <Upload size={24} className={styles.uploadIcon} />
                                <span className={styles.uploadText}>Klikk eller dra bilde hit</span>
                                <span className={styles.uploadHint}>Maks 2MB — PNG, JPEG, WebP, SVG</span>
                            </>
                        )}
                    </div>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                        }}
                    />
                    {uploadError && <p className={styles.uploadError}>{uploadError}</p>}
                </div>
            )}

            {mode === 'url' && (
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Bilde-URL *</label>
                    <input
                        className={styles.formInput}
                        type="url"
                        value={(data.url as string) || ''}
                        onChange={(e) => updateField('url', e.target.value)}
                        placeholder="https://example.com/image.jpg"
                    />
                </div>
            )}

            {(data.url as string) && (
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Forhåndsvisning</label>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={data.url as string}
                        alt={(data.alt as string) || ''}
                        className={styles.imagePreviewThumb}
                    />
                </div>
            )}

            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Alt-tekst (tilgjengelighet)</label>
                <input
                    className={styles.formInput}
                    type="text"
                    value={(data.alt as string) || ''}
                    onChange={(e) => updateField('alt', e.target.value)}
                    placeholder="Beskriv bildet for skjermlesere"
                />
            </div>
            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Bildetekst</label>
                <input
                    className={styles.formInput}
                    type="text"
                    value={(data.caption as string) || ''}
                    onChange={(e) => updateField('caption', e.target.value)}
                    placeholder="Valgfri bildetekst under bildet"
                />
            </div>
        </>
    );
}

// ── Quiz Editor ─────────────────────────────────────────────

function QuizEditor({
    data,
    onChange,
}: {
    data: Record<string, unknown>;
    onChange: (data: Record<string, unknown>) => void;
}) {
    const question = (data.question as string) || '';
    const options = (data.options as Array<{ text: string; isCorrect: boolean }>) || [];
    const explanation = (data.explanation as string) || '';

    function updateQuestion(value: string) {
        onChange({ ...data, question: value });
    }

    function updateOption(index: number, field: 'text' | 'isCorrect', value: string | boolean) {
        const newOptions = [...options];
        newOptions[index] = { ...newOptions[index], [field]: value };
        // If setting isCorrect to true, set others to false
        if (field === 'isCorrect' && value === true) {
            newOptions.forEach((opt, i) => {
                if (i !== index) opt.isCorrect = false;
            });
        }
        onChange({ ...data, options: newOptions });
    }

    function addOption() {
        onChange({
            ...data,
            options: [...options, { text: '', isCorrect: false }],
        });
    }

    function removeOption(index: number) {
        if (options.length <= 2) return;
        const newOptions = options.filter((_, i) => i !== index);
        onChange({ ...data, options: newOptions });
    }

    return (
        <>
            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Spørsmål *</label>
                <RichTextEditor
                    initialHtml={question}
                    onChange={(html) => updateQuestion(html)}
                    minHeight={80}
                    placeholder="Skriv quizspørsmålet her..."
                    showToolbar={false}
                />
            </div>

            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Svaralternativer</label>
                <div className={styles.quizOptions}>
                    {options.map((opt, idx) => (
                        <div key={idx} className={styles.quizOption}>
                            <label className={styles.radioLabel}>
                                <input
                                    type="radio"
                                    checked={opt.isCorrect}
                                    onChange={() => updateOption(idx, 'isCorrect', true)}
                                    name="correctAnswer"
                                    className={styles.radioInput}
                                />
                                <span className={styles.radioCircle} />
                            </label>
                            <input
                                className={styles.formInput}
                                type="text"
                                value={opt.text}
                                onChange={(e) => updateOption(idx, 'text', e.target.value)}
                                placeholder={`Alternativ ${idx + 1}`}
                            />
                            {options.length > 2 && (
                                <button
                                    type="button"
                                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                    onClick={() => removeOption(idx)}
                                    aria-label="Fjern alternativ"
                                >
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                    ))}
                    <button
                        type="button"
                        className={styles.addOptionBtn}
                        onClick={addOption}
                    >
                        <Plus size={14} />
                        Legg til alternativ
                    </button>
                </div>
            </div>

            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Forklaring (vises etter svar)</label>
                <RichTextEditor
                    initialHtml={explanation}
                    onChange={(html) => onChange({ ...data, explanation: html })}
                    minHeight={60}
                    placeholder="Forklar det riktige svaret..."
                    showToolbar={false}
                />
            </div>

            <div className={styles.formGroup}>
                <label className={styles.checkboxLabelInline}>
                    <input
                        type="checkbox"
                        checked={!!(data.requireCompletion as boolean)}
                        onChange={(e) => onChange({ ...data, requireCompletion: e.target.checked })}
                    />
                    <span>Påkrevd — må besvares riktig for å markere leksjonen som fullført</span>
                </label>
            </div>
        </>
    );
}

// ── Audio Block Editor ──────────────────────────────────────

function AudioBlockEditor({
    data,
    onChange,
}: {
    data: Record<string, unknown>;
    onChange: (data: Record<string, unknown>) => void;
}) {
    const [mode, setMode] = useState<'url' | 'upload'>((data.url as string) ? 'url' : 'upload');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    function updateField(field: string, value: unknown) {
        onChange({ ...data, [field]: value });
    }

    async function handleFileUpload(file: File) {
        setUploading(true);
        setUploadError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'audio');
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const json = await res.json();
            if (json.success) {
                updateField('url', json.url);
                setMode('url');
            } else {
                setUploadError(json.error || 'Opplasting feilet');
            }
        } catch {
            setUploadError('Nettverksfeil ved opplasting');
        }
        setUploading(false);
    }

    return (
        <>
            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Lydkilde</label>
                <div className={styles.imageModeTabs}>
                    <button
                        type="button"
                        className={`${styles.imageModeTab} ${mode === 'upload' ? styles.imageModeTabActive : ''}`}
                        onClick={() => setMode('upload')}
                    >
                        <Upload size={14} />
                        Last opp
                    </button>
                    <button
                        type="button"
                        className={`${styles.imageModeTab} ${mode === 'url' ? styles.imageModeTabActive : ''}`}
                        onClick={() => setMode('url')}
                    >
                        <Code size={14} />
                        URL
                    </button>
                </div>
            </div>

            {mode === 'upload' && (
                <div className={styles.formGroup}>
                    <div
                        className={styles.uploadDropzone}
                        onClick={() => fileRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const file = e.dataTransfer.files[0];
                            if (file) handleFileUpload(file);
                        }}
                    >
                        {uploading ? (
                            <span className={styles.uploadingText}>Laster opp...</span>
                        ) : (
                            <>
                                <Upload size={24} className={styles.uploadIcon} />
                                <span className={styles.uploadText}>Klikk eller dra lydfil hit</span>
                                <span className={styles.uploadHint}>Maks 2MB — MP3, WAV, OGG, AAC</span>
                            </>
                        )}
                    </div>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="audio/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                        }}
                    />
                    {uploadError && <p className={styles.uploadError}>{uploadError}</p>}
                </div>
            )}

            {mode === 'url' && (
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Lyd-URL *</label>
                    <input
                        className={styles.formInput}
                        type="url"
                        value={(data.url as string) || ''}
                        onChange={(e) => updateField('url', e.target.value)}
                        placeholder="https://example.com/audio.mp3"
                    />
                </div>
            )}

            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tittel</label>
                <input
                    className={styles.formInput}
                    type="text"
                    value={(data.title as string) || ''}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="Valgfri tittel for lydfilen"
                />
            </div>

            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Transkripsjon (valgfri)</label>
                <textarea
                    className={styles.formTextarea}
                    rows={4}
                    value={(data.transcript as string) || ''}
                    onChange={(e) => updateField('transcript', e.target.value)}
                    placeholder="Legg inn transkripsjon for tilgjengelighet..."
                />
            </div>

            <div className={styles.formGroup}>
                <label className={styles.checkboxLabelInline}>
                    <input
                        type="checkbox"
                        checked={(data.allowSpeed as boolean) ?? true}
                        onChange={(e) => updateField('allowSpeed', e.target.checked)}
                    />
                    <span>Tillat hastighetsregulering</span>
                </label>
            </div>
        </>
    );
}

// ── Code Block Editor ───────────────────────────────────────

const CODE_LANGUAGES = [
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'csharp', label: 'C#' },
    { value: 'cpp', label: 'C++' },
    { value: 'go', label: 'Go' },
    { value: 'rust', label: 'Rust' },
    { value: 'ruby', label: 'Ruby' },
    { value: 'php', label: 'PHP' },
    { value: 'swift', label: 'Swift' },
    { value: 'kotlin', label: 'Kotlin' },
    { value: 'html', label: 'HTML' },
    { value: 'css', label: 'CSS' },
    { value: 'sql', label: 'SQL' },
    { value: 'bash', label: 'Bash / Shell' },
    { value: 'json', label: 'JSON' },
    { value: 'yaml', label: 'YAML' },
    { value: 'xml', label: 'XML' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'plaintext', label: 'Ren tekst' },
];

function CodeBlockEditor({
    data,
    onChange,
}: {
    data: Record<string, unknown>;
    onChange: (data: Record<string, unknown>) => void;
}) {
    function updateField(field: string, value: unknown) {
        onChange({ ...data, [field]: value });
    }

    return (
        <>
            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Programmeringsspråk</label>
                <select
                    className={styles.formInput}
                    value={(data.language as string) || 'javascript'}
                    onChange={(e) => updateField('language', e.target.value)}
                >
                    {CODE_LANGUAGES.map((lang) => (
                        <option key={lang.value} value={lang.value}>{lang.label}</option>
                    ))}
                </select>
            </div>

            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Kode *</label>
                <textarea
                    className={`${styles.formTextarea} ${styles.codeTextarea}`}
                    rows={10}
                    value={(data.code as string) || ''}
                    onChange={(e) => updateField('code', e.target.value)}
                    placeholder="Lim inn kode her..."
                    spellCheck={false}
                />
            </div>

            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Bildetekst (valgfri)</label>
                <input
                    className={styles.formInput}
                    type="text"
                    value={(data.caption as string) || ''}
                    onChange={(e) => updateField('caption', e.target.value)}
                    placeholder="Beskrivelse under kodesnutten"
                />
            </div>

            <div className={styles.formGroup}>
                <label className={styles.checkboxLabelInline}>
                    <input
                        type="checkbox"
                        checked={(data.lineNumbers as boolean) ?? true}
                        onChange={(e) => updateField('lineNumbers', e.target.checked)}
                    />
                    <span>Vis linjenumre</span>
                </label>
            </div>

            <div className={styles.formGroup}>
                <label className={styles.checkboxLabelInline}>
                    <input
                        type="checkbox"
                        checked={(data.copyButton as boolean) ?? true}
                        onChange={(e) => updateField('copyButton', e.target.checked)}
                    />
                    <span>Vis kopiér-knapp</span>
                </label>
            </div>
        </>
    );
}

// ── Callout Editor ──────────────────────────────────────────

const CALLOUT_VARIANTS = [
    { value: 'info', label: 'Info', icon: Info, color: 'var(--color-accent-blue)' },
    { value: 'tip', label: 'Tips', icon: Lightbulb, color: 'var(--color-success)' },
    { value: 'warning', label: 'Advarsel', icon: AlertTriangle, color: 'var(--color-warning)' },
    { value: 'danger', label: 'Fare', icon: ShieldAlert, color: 'var(--color-danger)' },
];

function CalloutEditor({
    data,
    onChange,
}: {
    data: Record<string, unknown>;
    onChange: (data: Record<string, unknown>) => void;
}) {
    function updateField(field: string, value: unknown) {
        onChange({ ...data, [field]: value });
    }

    return (
        <>
            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Type</label>
                <div className={styles.calloutVariants}>
                    {CALLOUT_VARIANTS.map((v) => {
                        const VIcon = v.icon;
                        const isActive = (data.variant as string) === v.value;
                        return (
                            <button
                                key={v.value}
                                type="button"
                                className={`${styles.calloutVariantBtn} ${isActive ? styles.calloutVariantBtnActive : ''}`}
                                onClick={() => updateField('variant', v.value)}
                                style={{ '--variant-color': v.color } as React.CSSProperties}
                            >
                                <VIcon size={16} />
                                {v.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tittel (valgfri)</label>
                <input
                    className={styles.formInput}
                    type="text"
                    value={(data.title as string) || ''}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="Valgfri overskrift"
                />
            </div>

            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Innhold *</label>
                <RichTextEditor
                    initialHtml={(data.body as string) || ''}
                    onChange={(html) => updateField('body', html)}
                    minHeight={100}
                    placeholder="Skriv innhold for merknaden..."
                />
            </div>
        </>
    );
}

// ── Checklist Editor ────────────────────────────────────────

function ChecklistEditor({
    data,
    onChange,
}: {
    data: Record<string, unknown>;
    onChange: (data: Record<string, unknown>) => void;
}) {
    const items = (data.items as Array<{ id: string; text: string; required: boolean }>) || [];

    function updateField(field: string, value: unknown) {
        onChange({ ...data, [field]: value });
    }

    function updateItem(index: number, field: 'text' | 'required', value: string | boolean) {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        onChange({ ...data, items: newItems });
    }

    function addItem() {
        onChange({
            ...data,
            items: [...items, { id: crypto.randomUUID(), text: '', required: false }],
        });
    }

    function removeItem(index: number) {
        if (items.length <= 1) return;
        const newItems = items.filter((_, i) => i !== index);
        onChange({ ...data, items: newItems });
    }

    return (
        <>
            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tittel (valgfri)</label>
                <input
                    className={styles.formInput}
                    type="text"
                    value={(data.title as string) || ''}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="F.eks. «Sjekkliste for oppstartsmøte»"
                />
            </div>

            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Punkter</label>
                <div className={styles.checklistItems}>
                    {items.map((item, idx) => (
                        <div key={item.id || idx} className={styles.checklistItem}>
                            <span className={styles.checklistItemNum}>{idx + 1}</span>
                            <input
                                className={styles.formInput}
                                type="text"
                                value={item.text}
                                onChange={(e) => updateItem(idx, 'text', e.target.value)}
                                placeholder={`Punkt ${idx + 1}`}
                            />
                            <label className={styles.checklistItemRequired} title="Påkrevd">
                                <input
                                    type="checkbox"
                                    checked={item.required}
                                    onChange={(e) => updateItem(idx, 'required', e.target.checked)}
                                />
                                <span>Påkrevd</span>
                            </label>
                            {items.length > 1 && (
                                <button
                                    type="button"
                                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                    onClick={() => removeItem(idx)}
                                    aria-label="Fjern punkt"
                                >
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                    ))}
                    <button type="button" className={styles.addOptionBtn} onClick={addItem}>
                        <Plus size={14} />
                        Legg til punkt
                    </button>
                </div>
            </div>

            <div className={styles.formGroup}>
                <label className={styles.checkboxLabelInline}>
                    <input
                        type="checkbox"
                        checked={(data.showProgress as boolean) ?? true}
                        onChange={(e) => updateField('showProgress', e.target.checked)}
                    />
                    <span>Vis fremdriftsindikator</span>
                </label>
            </div>
        </>
    );
}

// ── Open Response Editor ────────────────────────────────────

function OpenResponseEditor({
    data,
    onChange,
}: {
    data: Record<string, unknown>;
    onChange: (data: Record<string, unknown>) => void;
}) {
    function updateField(field: string, value: unknown) {
        onChange({ ...data, [field]: value });
    }

    return (
        <>
            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Oppgavetekst *</label>
                <RichTextEditor
                    initialHtml={(data.prompt as string) || ''}
                    onChange={(html) => updateField('prompt', html)}
                    minHeight={100}
                    placeholder="Skriv oppgaven eller spørsmålet her..."
                />
            </div>

            <div className={styles.formGroup}>
                <label className={styles.formLabel}>Maks antall tegn</label>
                <input
                    className={styles.formInput}
                    type="number"
                    min={100}
                    max={50000}
                    value={(data.maxChars as number) || 3000}
                    onChange={(e) => updateField('maxChars', parseInt(e.target.value) || 3000)}
                />
            </div>

            <div className={styles.formGroup}>
                <label className={styles.checkboxLabelInline}>
                    <input
                        type="checkbox"
                        checked={!!(data.required as boolean)}
                        onChange={(e) => updateField('required', e.target.checked)}
                    />
                    <span>Påkrevd — må ha svar for å fullføre leksjonen</span>
                </label>
            </div>
        </>
    );
}

// ── Divider Editor ──────────────────────────────────────────

const DIVIDER_STYLES = [
    { value: 'line', label: 'Linje' },
    { value: 'dots', label: 'Prikker' },
    { value: 'space', label: 'Mellomrom' },
];

function DividerEditor({
    data,
    onChange,
}: {
    data: Record<string, unknown>;
    onChange: (data: Record<string, unknown>) => void;
}) {
    return (
        <div className={styles.formGroup}>
            <label className={styles.formLabel}>Stil</label>
            <div className={styles.dividerStyles}>
                {DIVIDER_STYLES.map((s) => (
                    <button
                        key={s.value}
                        type="button"
                        className={`${styles.dividerStyleBtn} ${(data.style as string) === s.value ? styles.dividerStyleBtnActive : ''}`}
                        onClick={() => onChange({ ...data, style: s.value })}
                    >
                        {s.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
