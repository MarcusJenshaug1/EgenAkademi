'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Upload, Check, X, Type, Trash2 } from 'lucide-react';
import styles from './fontPicker.module.css';

// ── Google Fonts katalog ──────────────────────────────
interface GoogleFont {
    name: string;
    category: 'Sans-Serif' | 'Serif' | 'Display' | 'Monospace';
}

const GOOGLE_FONTS: GoogleFont[] = [
    // Sans-Serif
    { name: 'Inter', category: 'Sans-Serif' },
    { name: 'Roboto', category: 'Sans-Serif' },
    { name: 'Open Sans', category: 'Sans-Serif' },
    { name: 'Lato', category: 'Sans-Serif' },
    { name: 'Montserrat', category: 'Sans-Serif' },
    { name: 'Poppins', category: 'Sans-Serif' },
    { name: 'Nunito', category: 'Sans-Serif' },
    { name: 'Nunito Sans', category: 'Sans-Serif' },
    { name: 'Raleway', category: 'Sans-Serif' },
    { name: 'Ubuntu', category: 'Sans-Serif' },
    { name: 'Source Sans 3', category: 'Sans-Serif' },
    { name: 'Noto Sans', category: 'Sans-Serif' },
    { name: 'Work Sans', category: 'Sans-Serif' },
    { name: 'Rubik', category: 'Sans-Serif' },
    { name: 'Mulish', category: 'Sans-Serif' },
    { name: 'DM Sans', category: 'Sans-Serif' },
    { name: 'Outfit', category: 'Sans-Serif' },
    { name: 'Manrope', category: 'Sans-Serif' },
    { name: 'Plus Jakarta Sans', category: 'Sans-Serif' },
    { name: 'Space Grotesk', category: 'Sans-Serif' },
    { name: 'Figtree', category: 'Sans-Serif' },
    { name: 'Albert Sans', category: 'Sans-Serif' },
    { name: 'Lexend', category: 'Sans-Serif' },
    { name: 'Onest', category: 'Sans-Serif' },
    { name: 'Sora', category: 'Sans-Serif' },
    { name: 'Quicksand', category: 'Sans-Serif' },
    { name: 'Barlow', category: 'Sans-Serif' },
    { name: 'Karla', category: 'Sans-Serif' },
    { name: 'Cabin', category: 'Sans-Serif' },
    { name: 'Exo 2', category: 'Sans-Serif' },
    // Serif
    { name: 'Merriweather', category: 'Serif' },
    { name: 'Playfair Display', category: 'Serif' },
    { name: 'Lora', category: 'Serif' },
    { name: 'PT Serif', category: 'Serif' },
    { name: 'Noto Serif', category: 'Serif' },
    { name: 'Source Serif 4', category: 'Serif' },
    { name: 'Libre Baskerville', category: 'Serif' },
    { name: 'Crimson Text', category: 'Serif' },
    { name: 'EB Garamond', category: 'Serif' },
    { name: 'Cormorant Garamond', category: 'Serif' },
    // Display
    { name: 'Oswald', category: 'Display' },
    { name: 'Bebas Neue', category: 'Display' },
    { name: 'Anton', category: 'Display' },
    { name: 'Fredoka', category: 'Display' },
    { name: 'Righteous', category: 'Display' },
    { name: 'Titan One', category: 'Display' },
    // Monospace
    { name: 'JetBrains Mono', category: 'Monospace' },
    { name: 'Fira Code', category: 'Monospace' },
    { name: 'Source Code Pro', category: 'Monospace' },
    { name: 'IBM Plex Mono', category: 'Monospace' },
    { name: 'Space Mono', category: 'Monospace' },
    { name: 'Roboto Mono', category: 'Monospace' },
];

const CATEGORIES = ['Alle', 'Sans-Serif', 'Serif', 'Display', 'Monospace'] as const;

// ── Font loader ──────────────────────────────────────
const loadedFonts = new Set<string>();

function loadGoogleFonts(fonts: string[]) {
    const toLoad = fonts.filter(f => !loadedFonts.has(f));
    if (toLoad.length === 0) return;

    const families = toLoad.map(f => f.replace(/ /g, '+')).join('&family=');
    const link = document.createElement('link');
    link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    toLoad.forEach(f => loadedFonts.add(f));
}

// ── Props ──────────────────────────────────────────────
interface FontPickerProps {
    currentFont: string;
    currentSource: string; // 'google' | 'custom' | ''
    customFontUrl: string;
    onFontChange: (fontFamily: string, source: string, customFontUrl: string) => void;
}

export default function FontPicker({
    currentFont,
    currentSource,
    customFontUrl: initialCustomFontUrl,
    onFontChange,
}: FontPickerProps) {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<string>('Alle');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [customFontName, setCustomFontName] = useState(
        currentSource === 'custom' ? currentFont : ''
    );
    const [customUrl, setCustomUrl] = useState(initialCustomFontUrl || '');
    const [showCustomUpload, setShowCustomUpload] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filtrerte fonter
    const filteredFonts = useMemo(() => {
        let fonts = GOOGLE_FONTS;

        if (category !== 'Alle') {
            fonts = fonts.filter(f => f.category === category);
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            fonts = fonts.filter(f => f.name.toLowerCase().includes(q));
        }

        return fonts;
    }, [search, category]);

    // Last inn Google Fonts for synlige fonter
    useEffect(() => {
        const fontNames = filteredFonts.slice(0, 30).map(f => f.name);
        if (fontNames.length > 0) {
            loadGoogleFonts(fontNames);
        }
    }, [filteredFonts]);

    // Last inn valgt font
    useEffect(() => {
        if (currentFont && currentSource === 'google') {
            loadGoogleFonts([currentFont]);
        }
    }, [currentFont, currentSource]);

    const handleSelectFont = useCallback((font: GoogleFont) => {
        onFontChange(font.name, 'google', '');
    }, [onFontChange]);

    const handleClearFont = useCallback(() => {
        onFontChange('', '', '');
        setCustomFontName('');
        setCustomUrl('');
    }, [onFontChange]);

    // ── Custom font upload ──
    const handleFontUpload = useCallback(async (file: File) => {
        setUploading(true);
        setUploadError('');

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'font');

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                setUploadError(data.error || 'Opplastingsfeil');
                return;
            }

            // Utled fontnavn fra filnavn
            const rawName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
            const fontName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

            setCustomUrl(data.url);
            setCustomFontName(fontName);

            // Generer @font-face og last fonten
            const fontFace = new FontFace(fontName, `url(${data.url})`);
            await fontFace.load();
            document.fonts.add(fontFace);

            onFontChange(fontName, 'custom', data.url);
        } catch (e: any) {
            setUploadError(e.message || 'Noe gikk galt');
        } finally {
            setUploading(false);
        }
    }, [onFontChange]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFontUpload(file);
    }, [handleFontUpload]);

    const handleCustomNameChange = useCallback((name: string) => {
        setCustomFontName(name);
        if (customUrl) {
            onFontChange(name, 'custom', customUrl);
        }
    }, [customUrl, onFontChange]);

    const handleRemoveCustom = useCallback(() => {
        setCustomUrl('');
        setCustomFontName('');
        onFontChange('', '', '');
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [onFontChange]);

    // Last custom font ved mount
    useEffect(() => {
        if (currentSource === 'custom' && initialCustomFontUrl && currentFont) {
            const fontFace = new FontFace(currentFont, `url(${initialCustomFontUrl})`);
            fontFace.load().then(() => document.fonts.add(fontFace)).catch(() => {});
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const isSelected = (fontName: string) => currentFont === fontName && currentSource === 'google';

    return (
        <div className={styles.fontPicker}>
            {/* Valgt font indikator */}
            {currentFont && (
                <div className={styles.selectedBar}>
                    <div className={styles.selectedInfo}>
                        <Check size={14} className={styles.selectedCheck} />
                        <span
                            className={styles.selectedName}
                            style={{ fontFamily: currentSource === 'google' ? `'${currentFont}', sans-serif` : currentFont }}
                        >
                            {currentFont}
                        </span>
                        <span className={styles.selectedSource}>
                            {currentSource === 'google' ? 'Google Fonts' : currentSource === 'custom' ? 'Egen font' : 'System'}
                        </span>
                    </div>
                    <button type="button" className={styles.clearBtn} onClick={handleClearFont}>
                        <X size={14} />
                        Fjern
                    </button>
                </div>
            )}

            {/* Tabs: Google Fonts / Egen font */}
            <div className={styles.tabRow}>
                <button
                    type="button"
                    className={`${styles.tab} ${!showCustomUpload ? styles.tabActive : ''}`}
                    onClick={() => setShowCustomUpload(false)}
                >
                    <Type size={14} />
                    Google Fonts
                </button>
                <button
                    type="button"
                    className={`${styles.tab} ${showCustomUpload ? styles.tabActive : ''}`}
                    onClick={() => setShowCustomUpload(true)}
                >
                    <Upload size={14} />
                    Egen font
                </button>
            </div>

            {!showCustomUpload ? (
                <>
                    {/* Soek */}
                    <div className={styles.searchWrapper}>
                        <Search size={16} className={styles.searchIcon} />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className={styles.searchInput}
                            placeholder="Soek blant 50+ fonter..."
                        />
                        {search && (
                            <button
                                type="button"
                                className={styles.searchClear}
                                onClick={() => setSearch('')}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Kategori-filter */}
                    <div className={styles.categoryRow}>
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat}
                                type="button"
                                className={`${styles.categoryPill} ${category === cat ? styles.categoryActive : ''}`}
                                onClick={() => setCategory(cat)}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* Font-grid */}
                    <div className={styles.fontGrid}>
                        {filteredFonts.length === 0 && (
                            <p className={styles.emptyMsg}>Ingen fonter matcher soeket ditt.</p>
                        )}
                        {filteredFonts.slice(0, 30).map((font) => (
                            <button
                                key={font.name}
                                type="button"
                                className={`${styles.fontCard} ${isSelected(font.name) ? styles.fontCardSelected : ''}`}
                                onClick={() => handleSelectFont(font)}
                            >
                                <span
                                    className={styles.fontPreview}
                                    style={{ fontFamily: `'${font.name}', sans-serif` }}
                                >
                                    Aa
                                </span>
                                <div className={styles.fontCardInfo}>
                                    <span className={styles.fontName}>{font.name}</span>
                                    <span className={styles.fontCategory}>{font.category}</span>
                                </div>
                                {isSelected(font.name) && (
                                    <div className={styles.fontCardCheck}>
                                        <Check size={14} />
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>

                    {filteredFonts.length > 30 && (
                        <p className={styles.moreHint}>
                            Viser 30 av {filteredFonts.length} fonter. Bruk soek for aa finne flere.
                        </p>
                    )}
                </>
            ) : (
                /* ── Egen font upload ── */
                <div className={styles.customSection}>
                    {customUrl ? (
                        <div className={styles.customPreview}>
                            <div className={styles.customPreviewCard}>
                                <span
                                    className={styles.customPreviewText}
                                    style={{ fontFamily: `'${customFontName}', sans-serif` }}
                                >
                                    AaBbCcDd 123
                                </span>
                            </div>
                            <div className={styles.customFields}>
                                <label className={styles.customLabel}>Fontnavn</label>
                                <input
                                    type="text"
                                    value={customFontName}
                                    onChange={(e) => handleCustomNameChange(e.target.value)}
                                    className={styles.customInput}
                                    placeholder="Mitt fontnavn"
                                />
                                <span className={styles.customHint}>
                                    Dette navnet brukes i CSS font-family.
                                </span>
                            </div>
                            <div className={styles.customActions}>
                                <button
                                    type="button"
                                    className={styles.customReplaceBtn}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Upload size={14} />
                                    Bytt fontfil
                                </button>
                                <button
                                    type="button"
                                    className={styles.customRemoveBtn}
                                    onClick={handleRemoveCustom}
                                >
                                    <Trash2 size={14} />
                                    Fjern
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div
                            className={styles.fontDropzone}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload size={28} className={styles.dropzoneIcon} />
                            <span className={styles.dropzoneTitle}>Last opp fontfil</span>
                            <span className={styles.dropzoneHint}>
                                WOFF2, WOFF, TTF eller OTF (maks 2MB)
                            </span>
                        </div>
                    )}

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
                        onChange={handleFileSelect}
                        className={styles.fileInput}
                    />

                    {uploading && (
                        <div className={styles.uploadBar}>Laster opp font...</div>
                    )}
                    {uploadError && (
                        <div className={styles.uploadError}>{uploadError}</div>
                    )}
                </div>
            )}
        </div>
    );
}
