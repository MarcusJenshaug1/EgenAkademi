'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    BookText,
    FileText,
    Star,
    History,
    Send,
    Globe,
    Lock,
    Plus,
    Save,
    Trash2,
    ChevronRight,
    ChevronDown,
    EyeOff,
    RotateCcw,
    X,
    AlertCircle,
    CheckCircle2,
} from 'lucide-react';
import { RichTextEditor } from '@/components/LexicalEditor';
import {
    listPagesTree,
    getPage,
    createPage,
    updatePage,
    submitForReview,
    publishPage,
    unpublishPage,
    deletePage,
    listVersions,
    restoreVersion,
    type WikiTreeNode,
    type WikiPageDetail,
    type WikiVersionItem,
} from '@/app/actions/wikiActions';
import { sanitizeHtml } from '@/lib/sanitize';
import styles from './wiki.module.css';

// ── Status metadata ─────────────────────────────────────────

const STATUS_META: Record<string, { label: string; className: string }> = {
    DRAFT: { label: 'Utkast', className: styles.badgeDraft },
    PENDING_REVIEW: { label: 'Til gjennomgang', className: styles.badgePending },
    PUBLISHED: { label: 'Publisert', className: styles.badgePublished },
};

// Flatten the tree into a parent-select list with indentation, excluding a
// subtree (so a page cannot be parented under itself / its descendants).
function flattenForSelect(
    nodes: WikiTreeNode[],
    excludeId: string | null,
    depth = 0,
    acc: { id: string; label: string }[] = []
): { id: string; label: string }[] {
    for (const node of nodes) {
        if (node.id === excludeId) continue; // skips the node and its children
        acc.push({ id: node.id, label: `${'  '.repeat(depth)}${node.title}` });
        flattenForSelect(node.children, excludeId, depth + 1, acc);
    }
    return acc;
}

export default function WikiAdminClient() {
    const [tree, setTree] = useState<WikiTreeNode[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<WikiPageDetail | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const [loadingTree, setLoadingTree] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [saving, setSaving] = useState(false);
    const [busyAction, setBusyAction] = useState<string | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // Editor field state (controlled).
    const [title, setTitle] = useState('');
    const [contentHtml, setContentHtml] = useState('');
    const [parentPageId, setParentPageId] = useState<string>('');
    const [accessLevel, setAccessLevel] = useState<'all' | 'admins'>('all');
    const [tagsInput, setTagsInput] = useState('');
    const [pinned, setPinned] = useState(false);

    // Versions panel.
    const [versionsOpen, setVersionsOpen] = useState(false);
    const [versions, setVersions] = useState<WikiVersionItem[]>([]);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [previewVersion, setPreviewVersion] = useState<WikiVersionItem | null>(null);

    // Used to remount the editor when switching pages so initialHtml re-applies.
    const editorKeyRef = useRef(0);

    const flashNotice = useCallback((msg: string) => {
        setNotice(msg);
        window.setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 3000);
    }, []);

    const refreshTree = useCallback(async () => {
        const res = await listPagesTree();
        if ('error' in res) {
            setError(res.error);
            return;
        }
        setTree(res.tree);
    }, []);

    useEffect(() => {
        (async () => {
            setLoadingTree(true);
            await refreshTree();
            setLoadingTree(false);
        })();
    }, [refreshTree]);

    const loadDetail = useCallback(async (id: string) => {
        setLoadingDetail(true);
        setError(null);
        setVersionsOpen(false);
        setPreviewVersion(null);
        const res = await getPage(id);
        setLoadingDetail(false);
        if ('error' in res) {
            setError(res.error);
            setDetail(null);
            return;
        }
        const p = res.page;
        setDetail(p);
        setTitle(p.title);
        setContentHtml(p.contentHtml);
        setParentPageId(p.parentPageId ?? '');
        setAccessLevel(p.accessLevel === 'admins' ? 'admins' : 'all');
        setTagsInput(p.tags.join(', '));
        setPinned(p.pinned);
        editorKeyRef.current += 1;
    }, []);

    const selectPage = useCallback(
        (id: string) => {
            setSelectedId(id);
            loadDetail(id);
        },
        [loadDetail]
    );

    const toggleExpand = useCallback((id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // ── Mutations ────────────────────────────────────────────

    const handleCreate = useCallback(async () => {
        setBusyAction('create');
        setError(null);
        const res = await createPage({ title: 'Ny side', parentPageId: selectedId ?? null });
        setBusyAction(null);
        if ('error' in res) {
            setError(res.error);
            return;
        }
        await refreshTree();
        if (selectedId) {
            setExpanded((prev) => new Set(prev).add(selectedId));
        }
        flashNotice('Side opprettet');
        selectPage(res.pageId);
    }, [selectedId, refreshTree, selectPage, flashNotice]);

    const handleSave = useCallback(async () => {
        if (!detail) return;
        setSaving(true);
        setError(null);
        const tags = tagsInput
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
        const res = await updatePage(detail.id, {
            title,
            contentHtml,
            parentPageId: parentPageId || null,
            tags,
            accessLevel,
            pinned,
        });
        setSaving(false);
        if ('error' in res) {
            setError(res.error);
            return;
        }
        await refreshTree();
        await loadDetail(detail.id);
        flashNotice('Lagret');
    }, [detail, title, contentHtml, parentPageId, accessLevel, pinned, tagsInput, refreshTree, loadDetail, flashNotice]);

    const runStatusAction = useCallback(
        async (
            key: string,
            fn: () => Promise<{ success: true } | { error: string }>,
            successMsg: string
        ) => {
            if (!detail) return;
            setBusyAction(key);
            setError(null);
            const res = await fn();
            setBusyAction(null);
            if ('error' in res) {
                setError(res.error);
                return;
            }
            await refreshTree();
            await loadDetail(detail.id);
            flashNotice(successMsg);
        },
        [detail, refreshTree, loadDetail, flashNotice]
    );

    const handleDelete = useCallback(async () => {
        if (!detail) return;
        if (!window.confirm(`Slette siden "${detail.title}"? Underordnede sider flyttes opp ett nivå.`)) {
            return;
        }
        setBusyAction('delete');
        setError(null);
        const res = await deletePage(detail.id);
        setBusyAction(null);
        if ('error' in res) {
            setError(res.error);
            return;
        }
        setSelectedId(null);
        setDetail(null);
        await refreshTree();
        flashNotice('Side slettet');
    }, [detail, refreshTree, flashNotice]);

    // ── Versions ─────────────────────────────────────────────

    const openVersions = useCallback(async () => {
        if (!detail) return;
        setVersionsOpen(true);
        setLoadingVersions(true);
        const res = await listVersions(detail.id);
        setLoadingVersions(false);
        if ('error' in res) {
            setError(res.error);
            return;
        }
        setVersions(res.versions);
    }, [detail]);

    const handleRestore = useCallback(
        async (versionId: string) => {
            if (!detail) return;
            if (!window.confirm('Gjenopprette denne versjonen? Gjeldende innhold lagres som en ny versjon.')) {
                return;
            }
            setBusyAction(`restore-${versionId}`);
            const res = await restoreVersion(detail.id, versionId);
            setBusyAction(null);
            if ('error' in res) {
                setError(res.error);
                return;
            }
            setPreviewVersion(null);
            await refreshTree();
            await loadDetail(detail.id);
            await openVersions();
            flashNotice('Versjon gjenopprettet');
        },
        [detail, refreshTree, loadDetail, openVersions, flashNotice]
    );

    const parentOptions = useMemo(
        () => flattenForSelect(tree, detail?.id ?? null),
        [tree, detail?.id]
    );

    // ── Tree rendering ───────────────────────────────────────

    const renderNode = (node: WikiTreeNode, depth: number) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expanded.has(node.id);
        const isSelected = node.id === selectedId;
        const status = STATUS_META[node.status] ?? STATUS_META.DRAFT;
        return (
            <div key={node.id}>
                <div
                    className={`${styles.treeRow} ${isSelected ? styles.treeRowActive : ''}`}
                    style={{ paddingLeft: `${8 + depth * 16}px` }}
                >
                    <button
                        type="button"
                        className={styles.treeToggle}
                        onClick={() => hasChildren && toggleExpand(node.id)}
                        aria-label={hasChildren ? (isExpanded ? 'Skjul' : 'Vis') : undefined}
                        disabled={!hasChildren}
                    >
                        {hasChildren ? (
                            isExpanded ? (
                                <ChevronDown size={14} />
                            ) : (
                                <ChevronRight size={14} />
                            )
                        ) : (
                            <span className={styles.treeToggleSpacer} />
                        )}
                    </button>
                    <button
                        type="button"
                        className={styles.treeLabel}
                        onClick={() => selectPage(node.id)}
                    >
                        <FileText size={14} className={styles.treeIcon} />
                        <span className={styles.treeTitle}>{node.title}</span>
                        {node.pinned && (
                            <Star size={12} className={styles.treePin} aria-label="Festet" />
                        )}
                        {node.accessLevel === 'admins' && (
                            <Lock size={12} className={styles.treeLockIcon} aria-label="Kun administratorer" />
                        )}
                        <span className={`${styles.badge} ${status.className}`}>{status.label}</span>
                    </button>
                </div>
                {hasChildren && isExpanded && (
                    <div>{node.children.map((c) => renderNode(c, depth + 1))}</div>
                )}
            </div>
        );
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>
                        <BookText size={26} /> Kunnskapsbase
                    </h1>
                    <p className={styles.subtitle}>
                        Bygg en intern wiki med hierarkiske sider, versjonshistorikk og gjennomgangsflyt.
                    </p>
                </div>
                <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleCreate}
                    disabled={busyAction === 'create'}
                >
                    <Plus size={16} /> Ny side
                </button>
            </div>

            {error && (
                <div className={styles.errorBanner} role="alert">
                    <AlertCircle size={16} /> {error}
                </div>
            )}
            {notice && (
                <div className={styles.noticeBanner} role="status">
                    <CheckCircle2 size={16} /> {notice}
                </div>
            )}

            <div className={styles.layout}>
                {/* ── Left: tree ── */}
                <aside className={styles.treePanel}>
                    <div className={styles.treePanelHeader}>Sider</div>
                    <div className={styles.treeScroll}>
                        {loadingTree ? (
                            <div className={styles.muted}>Laster…</div>
                        ) : tree.length === 0 ? (
                            <div className={styles.muted}>Ingen sider ennå. Opprett den første.</div>
                        ) : (
                            tree.map((node) => renderNode(node, 0))
                        )}
                    </div>
                </aside>

                {/* ── Right: editor ── */}
                <section className={styles.editorPanel}>
                    {!detail ? (
                        <div className={styles.emptyState}>
                            <BookText size={40} />
                            <p>Velg en side fra listen, eller opprett en ny.</p>
                        </div>
                    ) : loadingDetail ? (
                        <div className={styles.muted}>Laster side…</div>
                    ) : (
                        <>
                            <div className={styles.editorToolbar}>
                                <div className={styles.editorStatus}>
                                    <span
                                        className={`${styles.badge} ${
                                            (STATUS_META[detail.status] ?? STATUS_META.DRAFT).className
                                        }`}
                                    >
                                        {(STATUS_META[detail.status] ?? STATUS_META.DRAFT).label}
                                    </span>
                                    <span className={styles.slugHint}>/{detail.slug}</span>
                                </div>
                                <div className={styles.actionRow}>
                                    <button
                                        type="button"
                                        className={styles.primaryButton}
                                        onClick={handleSave}
                                        disabled={saving}
                                    >
                                        <Save size={15} /> {saving ? 'Lagrer…' : 'Lagre'}
                                    </button>
                                    {detail.status === 'DRAFT' && (
                                        <button
                                            type="button"
                                            className={styles.secondaryButton}
                                            onClick={() =>
                                                runStatusAction(
                                                    'submit',
                                                    () => submitForReview(detail.id),
                                                    'Sendt til gjennomgang'
                                                )
                                            }
                                            disabled={busyAction === 'submit'}
                                        >
                                            <Send size={15} /> Send til gjennomgang
                                        </button>
                                    )}
                                    {detail.status !== 'PUBLISHED' && (
                                        <button
                                            type="button"
                                            className={styles.successButton}
                                            onClick={() =>
                                                runStatusAction(
                                                    'publish',
                                                    () => publishPage(detail.id),
                                                    'Publisert'
                                                )
                                            }
                                            disabled={busyAction === 'publish'}
                                        >
                                            <Globe size={15} /> Publiser
                                        </button>
                                    )}
                                    {detail.status === 'PUBLISHED' && (
                                        <button
                                            type="button"
                                            className={styles.secondaryButton}
                                            onClick={() =>
                                                runStatusAction(
                                                    'unpublish',
                                                    () => unpublishPage(detail.id),
                                                    'Avpublisert'
                                                )
                                            }
                                            disabled={busyAction === 'unpublish'}
                                        >
                                            <EyeOff size={15} /> Avpubliser
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className={styles.secondaryButton}
                                        onClick={openVersions}
                                    >
                                        <History size={15} /> Versjoner
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.dangerButton}
                                        onClick={handleDelete}
                                        disabled={busyAction === 'delete'}
                                    >
                                        <Trash2 size={15} /> Slett
                                    </button>
                                </div>
                            </div>

                            <div className={styles.fieldsGrid}>
                                <label className={styles.field}>
                                    <span className={styles.fieldLabel}>Tittel</span>
                                    <input
                                        type="text"
                                        className={styles.input}
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Sidetittel"
                                    />
                                </label>

                                <label className={styles.field}>
                                    <span className={styles.fieldLabel}>Overordnet side</span>
                                    <select
                                        className={styles.input}
                                        value={parentPageId}
                                        onChange={(e) => setParentPageId(e.target.value)}
                                    >
                                        <option value="">(Toppnivå)</option>
                                        {parentOptions.map((o) => (
                                            <option key={o.id} value={o.id}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className={styles.field}>
                                    <span className={styles.fieldLabel}>Tilgang</span>
                                    <select
                                        className={styles.input}
                                        value={accessLevel}
                                        onChange={(e) =>
                                            setAccessLevel(e.target.value === 'admins' ? 'admins' : 'all')
                                        }
                                    >
                                        <option value="all">Alle brukere</option>
                                        <option value="admins">Kun administratorer</option>
                                    </select>
                                </label>

                                <label className={styles.field}>
                                    <span className={styles.fieldLabel}>Etiketter (kommaseparert)</span>
                                    <input
                                        type="text"
                                        className={styles.input}
                                        value={tagsInput}
                                        onChange={(e) => setTagsInput(e.target.value)}
                                        placeholder="f.eks. rutiner, HR, onboarding"
                                    />
                                </label>

                                <label className={styles.checkboxField}>
                                    <input
                                        type="checkbox"
                                        checked={pinned}
                                        onChange={(e) => setPinned(e.target.checked)}
                                    />
                                    <Star size={14} /> Fest siden
                                </label>
                            </div>

                            <div className={styles.editorField}>
                                <span className={styles.fieldLabel}>Innhold</span>
                                <RichTextEditor
                                    key={editorKeyRef.current}
                                    initialHtml={detail.contentHtml}
                                    onChange={setContentHtml}
                                    minHeight={300}
                                    placeholder="Skriv innholdet til denne wiki-siden…"
                                />
                            </div>
                        </>
                    )}
                </section>
            </div>

            {/* ── Versions drawer ── */}
            {versionsOpen && (
                <div className={styles.drawerOverlay} onClick={() => setVersionsOpen(false)}>
                    <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.drawerHeader}>
                            <span className={styles.drawerTitle}>
                                <History size={16} /> Versjoner
                            </span>
                            <button
                                type="button"
                                className={styles.iconButton}
                                onClick={() => setVersionsOpen(false)}
                                aria-label="Lukk"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className={styles.drawerBody}>
                            {loadingVersions ? (
                                <div className={styles.muted}>Laster versjoner…</div>
                            ) : versions.length === 0 ? (
                                <div className={styles.muted}>Ingen tidligere versjoner.</div>
                            ) : (
                                versions.map((v) => (
                                    <div key={v.id} className={styles.versionRow}>
                                        <div className={styles.versionInfo}>
                                            <span className={styles.versionTitle}>{v.title}</span>
                                            <span className={styles.versionMeta}>
                                                {new Date(v.createdAt).toLocaleString('nb-NO')}
                                                {v.editorName ? ` · ${v.editorName}` : ''}
                                            </span>
                                        </div>
                                        <div className={styles.versionActions}>
                                            <button
                                                type="button"
                                                className={styles.secondaryButton}
                                                onClick={() => setPreviewVersion(v)}
                                            >
                                                Forhåndsvis
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.secondaryButton}
                                                onClick={() => handleRestore(v.id)}
                                                disabled={busyAction === `restore-${v.id}`}
                                            >
                                                <RotateCcw size={14} /> Gjenopprett
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Version preview modal ── */}
            {previewVersion && (
                <div className={styles.drawerOverlay} onClick={() => setPreviewVersion(null)}>
                    <div className={styles.previewModal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.drawerHeader}>
                            <span className={styles.drawerTitle}>
                                <FileText size={16} /> {previewVersion.title}
                            </span>
                            <button
                                type="button"
                                className={styles.iconButton}
                                onClick={() => setPreviewVersion(null)}
                                aria-label="Lukk"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div
                            className={styles.previewBody}
                            dangerouslySetInnerHTML={{
                                __html: sanitizeHtml(previewVersion.contentHtml),
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
