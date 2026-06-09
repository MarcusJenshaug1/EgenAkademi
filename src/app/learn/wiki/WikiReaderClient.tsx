'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    BookText,
    FileText,
    Star,
    Search,
    ChevronRight,
    ChevronDown,
    Sparkles,
    X,
    Tag,
} from 'lucide-react';
import {
    getPublishedPage,
    searchWiki,
    type WikiReaderTreeNode,
    type WikiReaderPage,
    type WikiWhatsNewItem,
    type WikiPinnedItem,
    type WikiSearchHit,
} from '@/app/actions/wikiActions';
import { sanitizeHtml } from '@/lib/sanitize';
import styles from './wiki.module.css';

interface Props {
    initialTree: WikiReaderTreeNode[];
    initialWhatsNew: WikiWhatsNewItem[];
    initialPinned: WikiPinnedItem[];
}

export default function WikiReaderClient({ initialTree, initialWhatsNew, initialPinned }: Props) {
    const [tree] = useState<WikiReaderTreeNode[]>(initialTree);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const [activeSlug, setActiveSlug] = useState<string | null>(null);
    const [page, setPage] = useState<WikiReaderPage | null>(null);
    const [loadingPage, setLoadingPage] = useState(false);
    const [pageError, setPageError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [searchHits, setSearchHits] = useState<WikiSearchHit[] | null>(null);
    const [searching, setSearching] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const openPage = useCallback(async (slug: string) => {
        setActiveSlug(slug);
        setSearchHits(null);
        setLoadingPage(true);
        setPageError(null);
        const res = await getPublishedPage(slug);
        setLoadingPage(false);
        if ('page' in res) {
            setPage(res.page);
        } else if ('error' in res) {
            setPage(null);
            setPageError(res.error);
        } else {
            // locked — shouldn't happen here since the server gated already.
            setPage(null);
            setPageError('Ikke tilgjengelig.');
        }
    }, []);

    const toggleExpand = useCallback((id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Debounced search.
    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        const term = searchTerm.trim();
        if (term.length < 2) {
            setSearchHits(null);
            setSearching(false);
            return;
        }
        setSearching(true);
        searchTimer.current = setTimeout(async () => {
            const res = await searchWiki(term);
            setSearching(false);
            setSearchHits(res.hits);
        }, 300);
        return () => {
            if (searchTimer.current) clearTimeout(searchTimer.current);
        };
    }, [searchTerm]);

    const clearSearch = useCallback(() => {
        setSearchTerm('');
        setSearchHits(null);
    }, []);

    // ── Tree node rendering ──────────────────────────────────

    const renderNode = (node: WikiReaderTreeNode, depth: number) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expanded.has(node.id);
        const isActive = node.slug === activeSlug;
        return (
            <div key={node.id}>
                <div
                    className={`${styles.treeRow} ${isActive ? styles.treeRowActive : ''}`}
                    style={{ paddingLeft: `${6 + depth * 14}px` }}
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
                        onClick={() => openPage(node.slug)}
                    >
                        <FileText size={14} className={styles.treeIcon} />
                        <span className={styles.treeTitle}>{node.title}</span>
                        {node.pinned && (
                            <Star size={12} className={styles.treePin} aria-label="Festet" />
                        )}
                    </button>
                </div>
                {hasChildren && isExpanded && (
                    <div>{node.children.map((c) => renderNode(c, depth + 1))}</div>
                )}
            </div>
        );
    };

    const showHome = !activeSlug && !searchHits;

    return (
        <div className={styles.readerLayout}>
            {/* ── Sidebar ── */}
            <aside className={styles.sidebar}>
                <div className={styles.searchBox}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        type="search"
                        className={styles.searchInput}
                        placeholder="Søk i kunnskapsbasen…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            className={styles.searchClear}
                            onClick={clearSearch}
                            aria-label="Tøm søk"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                <button
                    type="button"
                    className={`${styles.homeLink} ${showHome ? styles.homeLinkActive : ''}`}
                    onClick={() => {
                        setActiveSlug(null);
                        setPage(null);
                        clearSearch();
                    }}
                >
                    <BookText size={15} /> Oversikt
                </button>

                <div className={styles.sidebarHeading}>Sider</div>
                <nav className={styles.tree}>
                    {tree.length === 0 ? (
                        <div className={styles.muted}>Ingen publiserte sider ennå.</div>
                    ) : (
                        tree.map((node) => renderNode(node, 0))
                    )}
                </nav>
            </aside>

            {/* ── Main ── */}
            <section className={styles.main}>
                {searchHits !== null ? (
                    <div className={styles.searchResults}>
                        <h2 className={styles.sectionTitle}>
                            <Search size={18} /> Søkeresultater
                        </h2>
                        {searching ? (
                            <p className={styles.muted}>Søker…</p>
                        ) : searchHits.length === 0 ? (
                            <p className={styles.muted}>Ingen treff på «{searchTerm}».</p>
                        ) : (
                            <ul className={styles.hitList}>
                                {searchHits.map((hit) => (
                                    <li key={hit.id}>
                                        <button
                                            type="button"
                                            className={styles.hitCard}
                                            onClick={() => openPage(hit.slug)}
                                        >
                                            <span className={styles.hitTitle}>
                                                <FileText size={15} /> {hit.title}
                                            </span>
                                            {hit.snippet && (
                                                <span className={styles.hitSnippet}>{hit.snippet}</span>
                                            )}
                                            {hit.tags.length > 0 && (
                                                <span className={styles.tagRow}>
                                                    {hit.tags.map((t) => (
                                                        <span key={t} className={styles.tagChip}>
                                                            <Tag size={11} /> {t}
                                                        </span>
                                                    ))}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : showHome ? (
                    <div className={styles.home}>
                        <div className={styles.homeHeader}>
                            <h1 className={styles.homeTitle}>
                                <BookText size={26} /> Kunnskapsbase
                            </h1>
                            <p className={styles.homeSubtitle}>
                                Finn rutiner, retningslinjer og veiledninger. Velg en side i menyen eller søk.
                            </p>
                        </div>

                        <div className={styles.homeGrid}>
                            <div className={styles.homeCard}>
                                <h2 className={styles.sectionTitle}>
                                    <Sparkles size={18} /> Nytt
                                </h2>
                                {initialWhatsNew.length === 0 ? (
                                    <p className={styles.muted}>Ingenting publisert ennå.</p>
                                ) : (
                                    <ul className={styles.feedList}>
                                        {initialWhatsNew.map((item) => (
                                            <li key={item.id}>
                                                <button
                                                    type="button"
                                                    className={styles.feedRow}
                                                    onClick={() => openPage(item.slug)}
                                                >
                                                    <FileText size={14} />
                                                    <span className={styles.feedTitle}>{item.title}</span>
                                                    {item.publishedAt && (
                                                        <span className={styles.feedDate}>
                                                            {new Date(item.publishedAt).toLocaleDateString(
                                                                'nb-NO'
                                                            )}
                                                        </span>
                                                    )}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div className={styles.homeCard}>
                                <h2 className={styles.sectionTitle}>
                                    <Star size={18} /> Festet
                                </h2>
                                {initialPinned.length === 0 ? (
                                    <p className={styles.muted}>Ingen festede sider.</p>
                                ) : (
                                    <ul className={styles.feedList}>
                                        {initialPinned.map((item) => (
                                            <li key={item.id}>
                                                <button
                                                    type="button"
                                                    className={styles.feedRow}
                                                    onClick={() => openPage(item.slug)}
                                                >
                                                    <Star size={14} className={styles.treePin} />
                                                    <span className={styles.feedTitle}>{item.title}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                ) : loadingPage ? (
                    <p className={styles.muted}>Laster side…</p>
                ) : pageError ? (
                    <div className={styles.pageError}>
                        <p>{pageError}</p>
                    </div>
                ) : page ? (
                    <article className={styles.article}>
                        <header className={styles.articleHeader}>
                            <h1 className={styles.articleTitle}>{page.title}</h1>
                            {page.tags.length > 0 && (
                                <div className={styles.tagRow}>
                                    {page.tags.map((t) => (
                                        <span key={t} className={styles.tagChip}>
                                            <Tag size={11} /> {t}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {page.publishedAt && (
                                <p className={styles.articleMeta}>
                                    Publisert {new Date(page.publishedAt).toLocaleDateString('nb-NO')}
                                </p>
                            )}
                        </header>
                        <div
                            className={styles.articleBody}
                            // Content is sanitized server-side and re-sanitized here as
                            // defence-in-depth before rendering.
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.contentHtml) }}
                        />
                    </article>
                ) : null}
            </section>
        </div>
    );
}
