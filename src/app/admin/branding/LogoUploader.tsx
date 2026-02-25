'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Upload, Image, Trash2, Palette, RotateCcw, Pencil, ArrowRight, Check, AlertTriangle, Sun, Moon, Monitor } from 'lucide-react';
import styles from './logoUploader.module.css';

// ── SVG farge-ekstraksjon ──────────────────────────────
const HEX_REGEX = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;
const RGB_REGEX = /rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/g;
const NAMED_COLORS = [
    'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
    'pink', 'gray', 'grey', 'brown', 'cyan', 'magenta', 'navy', 'teal',
    'maroon', 'olive', 'silver', 'lime', 'aqua', 'fuchsia',
];

const NAMED_TO_HEX: Record<string, string> = {
    black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000',
    blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
    pink: '#ffc0cb', gray: '#808080', grey: '#808080', brown: '#a52a2a',
    cyan: '#00ffff', magenta: '#ff00ff', navy: '#000080', teal: '#008080',
    maroon: '#800000', olive: '#808000', silver: '#c0c0c0', lime: '#00ff00',
    aqua: '#00ffff', fuchsia: '#ff00ff',
};

function rgbToHex(rgb: string): string {
    const match = rgb.match(/\d+/g);
    if (!match || match.length < 3) return '#000000';
    const [r, g, b] = match.map(Number);
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function normalizeHex(hex: string): string {
    const clean = hex.replace('#', '');
    if (clean.length === 3) {
        return '#' + clean.split('').map(c => c + c).join('');
    }
    return '#' + clean.toLowerCase();
}

interface DetectedColor {
    original: string;
    hex: string;
    count: number;
    newHex: string;
}

/**
 * Resolve a CSS var() expression to a concrete colour.
 * Handles nested vars and infers from variable names as last resort.
 * e.g. var(--notion-logo-fill, var(--color-black)) → #000000
 */
function resolveVarColor(expr: string): string | null {
    // 1. Direct hex inside the expression
    const hexM = expr.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/);
    if (hexM) return normalizeHex(hexM[0]);

    // 2. rgb() inside the expression
    const rgbM = expr.match(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/);
    if (rgbM) return rgbToHex(rgbM[0]);

    // 3. Named colour as a standalone fallback value
    //    e.g. var(--x, black) or var(--x, var(--y, red))
    for (const name of NAMED_COLORS) {
        const re = new RegExp(`,\\s*${name}\\s*\\)`, 'i');
        if (re.test(expr)) return NAMED_TO_HEX[name];
    }

    // 4. Infer from CSS variable names (--color-black → black)
    const varNames = [...expr.matchAll(/--([a-z0-9-]+)/gi)].map(m => m[1].toLowerCase());
    for (const vn of varNames) {
        for (const name of NAMED_COLORS) {
            if (vn === name || vn.endsWith(`-${name}`)) {
                return NAMED_TO_HEX[name];
            }
        }
    }

    return null;
}

function extractSvgColors(svgContent: string): DetectedColor[] {
    const colorMap = new Map<string, DetectedColor>();

    function addColor(original: string, hex: string) {
        const normHex = normalizeHex(hex);
        if (normHex === '#none' || original === 'none' || original === 'transparent' || original === 'currentColor') return;

        const existing = colorMap.get(normHex);
        if (existing) {
            existing.count++;
        } else {
            colorMap.set(normHex, { original, hex: normHex, count: 1, newHex: '' });
        }
    }

    const hexMatches = svgContent.match(HEX_REGEX) || [];
    for (const m of hexMatches) addColor(m, m);

    const rgbMatches = svgContent.match(RGB_REGEX) || [];
    for (const m of rgbMatches) addColor(m, rgbToHex(m));

    // Named colours in fill/stroke attributes
    const attrRegex = /(?:fill|stroke|color|stop-color)\s*[:=]\s*["']?(\w+)["']?/gi;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(svgContent)) !== null) {
        const name = attrMatch[1].toLowerCase();
        if (NAMED_COLORS.includes(name) && NAMED_TO_HEX[name]) {
            addColor(name, NAMED_TO_HEX[name]);
        }
    }

    // CSS var() custom properties in fill/stroke/color attributes
    // e.g. fill="var(--brand-color, #ff0000)" or fill="var(--x, var(--color-black))"
    const varAttrRegex = /(?:fill|stroke|color|stop-color)\s*=\s*["'](var\([^"']+\))["']/gi;
    let varMatch;
    while ((varMatch = varAttrRegex.exec(svgContent)) !== null) {
        const varExpr = varMatch[1];
        const resolved = resolveVarColor(varExpr);
        if (resolved) {
            addColor(varExpr, resolved);
        }
    }

    return Array.from(colorMap.values()).sort((a, b) => b.count - a.count);
}

function replaceSvgColors(svgContent: string, colorChanges: DetectedColor[]): string {
    let result = svgContent;

    for (const color of colorChanges) {
        if (!color.newHex || color.newHex === color.hex) continue;

        const patterns: string[] = [];

        // If original is a var() expression, replace the entire var(...) call
        if (color.original.startsWith('var(')) {
            patterns.push(color.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        } else {
            const shortHex = color.hex.replace('#', '');
            patterns.push(color.hex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            if (shortHex.length === 6) {
                if (shortHex[0] === shortHex[1] && shortHex[2] === shortHex[3] && shortHex[4] === shortHex[5]) {
                    const short3 = '#' + shortHex[0] + shortHex[2] + shortHex[4];
                    patterns.push(short3.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                }
            }

            if (NAMED_COLORS.includes(color.original.toLowerCase())) {
                patterns.push(`(?<=(?:fill|stroke|color|stop-color)\\s*[:=]\\s*["']?)${color.original}(?=["']?[\\s;>/])`);
            }

            if (color.original !== color.hex && !NAMED_COLORS.includes(color.original.toLowerCase())) {
                patterns.push(color.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            }
        }

        for (const pattern of patterns) {
            try {
                const regex = new RegExp(pattern, 'gi');
                result = result.replace(regex, color.newHex);
            } catch {
                // Ignorer ugyldige regex
            }
        }
    }

    return result;
}

// ── WCAG Kontrastberegning ─────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
    const clean = hex.replace('#', '');
    const full = clean.length === 3
        ? clean.split('').map(c => c + c).join('')
        : clean;
    return [
        parseInt(full.substring(0, 2), 16),
        parseInt(full.substring(2, 4), 16),
        parseInt(full.substring(4, 6), 16),
    ];
}

function relativeLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
    try {
        const l1 = relativeLuminance(...hexToRgb(hex1));
        const l2 = relativeLuminance(...hexToRgb(hex2));
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
    } catch {
        return 0;
    }
}

function getContrastLevel(ratio: number): { level: 'pass' | 'warn' | 'fail'; label: string } {
    if (ratio >= 4.5) return { level: 'pass', label: `${ratio.toFixed(1)}:1 AA OK` };
    if (ratio >= 3) return { level: 'warn', label: `${ratio.toFixed(1)}:1 Kun store tekster` };
    return { level: 'fail', label: `${ratio.toFixed(1)}:1 For lav kontrast` };
}

// ── Props ──────────────────────────────────────────────
interface LogoUploaderProps {
    variant: 'logo' | 'favicon';
    currentUrl: string;
    currentSvgContent: string;
    currentSvgModified: string;
    bgColor?: string;
    onFileChange: (url: string, svgContent: string, svgModified: string) => void;
}

const LABELS = {
    logo: {
        title: 'Last opp logo',
        change: 'Bytt logo',
        remove: 'Fjern logo',
        hint: 'SVG, PNG, JPEG eller WebP (maks 2MB)',
        svgNote: 'SVG-filer lar deg endre farger direkte!',
        accept: 'image/svg+xml,image/png,image/jpeg,image/webp',
        editorSubject: 'Logoen',
    },
    favicon: {
        title: 'Last opp favicon',
        change: 'Bytt favicon',
        remove: 'Fjern favicon',
        hint: 'SVG, PNG eller ICO (maks 2MB, anbefalt 32x32px)',
        svgNote: 'SVG-favicons lar deg endre farger!',
        accept: 'image/svg+xml,image/png,image/x-icon,image/vnd.microsoft.icon',
        editorSubject: 'Faviconet',
    },
};

export default function LogoUploader({
    variant,
    currentUrl,
    currentSvgContent,
    currentSvgModified,
    bgColor,
    onFileChange,
}: LogoUploaderProps) {
    const labels = LABELS[variant];
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [svgContent, setSvgContent] = useState(currentSvgContent || '');
    const [svgModified, setSvgModified] = useState(currentSvgModified || '');
    const [fileUrl, setFileUrl] = useState(currentUrl || '');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync ekstern URL fra parent (f.eks. fra brand detector)
    useEffect(() => {
        const urlChanged = currentUrl !== fileUrl;
        const svgChanged = currentSvgContent !== svgContent && !!currentSvgContent;

        if (urlChanged) {
            setFileUrl(currentUrl || '');
        }

        if (urlChanged || svgChanged) {
            // Prioriter eksplisitt svgContent fra parent
            if (currentSvgContent) {
                setSvgContent(currentSvgContent);
                setSvgModified(currentSvgModified || '');
                setColorOverrides({});
            }
            // Dekod data:image/svg+xml;base64,... URI automatisk
            else if (currentUrl?.startsWith('data:image/svg+xml;base64,')) {
                try {
                    const b64 = currentUrl.split(',')[1];
                    let decoded = decodeURIComponent(escape(atob(b64)));
                    // Pre-resolve any remaining var() in fill/stroke to concrete hex
                    decoded = decoded.replace(
                        /((?:fill|stroke|color|stop-color)\s*=\s*["'])(var\([^"']+\))(["'])/gi,
                        (_match, prefix, varExpr, suffix) => {
                            const resolved = resolveVarColor(varExpr);
                            return resolved ? `${prefix}${resolved}${suffix}` : `${prefix}${varExpr}${suffix}`;
                        }
                    );
                    setSvgContent(decoded);
                    setSvgModified('');
                    setColorOverrides({});
                } catch {
                    setSvgContent('');
                    setSvgModified('');
                }
            }
            // Ekstern ikke-SVG URL — nullstill
            else if (currentUrl && !currentSvgContent) {
                setSvgContent('');
                setSvgModified('');
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUrl, currentSvgContent]);

    const isSvg = useMemo(() => {
        return !!svgContent || fileUrl.endsWith('.svg') || fileUrl.startsWith('data:image/svg+xml');
    }, [svgContent, fileUrl]);

    const detectedColors = useMemo(() => {
        if (!svgContent) return [];
        return extractSvgColors(svgContent);
    }, [svgContent]);

    const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});

    const handleUpload = useCallback(async (file: File) => {
        setUploading(true);
        setError('');

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', variant);

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Opplastingsfeil');
                return;
            }

            setFileUrl(data.url);
            if (data.isSvg && data.svgContent) {
                setSvgContent(data.svgContent);
                setSvgModified('');
                setColorOverrides({});
                onFileChange(data.url, data.svgContent, '');
            } else {
                setSvgContent('');
                setSvgModified('');
                setColorOverrides({});
                onFileChange(data.url, '', '');
            }
        } catch (e: any) {
            setError(e.message || 'Noe gikk galt');
        } finally {
            setUploading(false);
        }
    }, [onFileChange, variant]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleUpload(file);
    }, [handleUpload]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleUpload(file);
    }, [handleUpload]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleRemove = useCallback(() => {
        setFileUrl('');
        setSvgContent('');
        setSvgModified('');
        setColorOverrides({});
        onFileChange('', '', '');
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [onFileChange]);

    const handleSvgColorChange = useCallback((originalHex: string, newHex: string) => {
        const newOverrides = { ...colorOverrides, [originalHex]: newHex };
        setColorOverrides(newOverrides);

        const colorsWithChanges = detectedColors.map(c => ({
            ...c,
            newHex: newOverrides[c.hex] || '',
        }));

        const modified = replaceSvgColors(svgContent, colorsWithChanges);
        setSvgModified(modified);
        onFileChange(fileUrl, svgContent, modified);
    }, [colorOverrides, detectedColors, svgContent, fileUrl, onFileChange]);

    const handleResetSingleColor = useCallback((hex: string) => {
        const newOverrides = { ...colorOverrides };
        delete newOverrides[hex];
        setColorOverrides(newOverrides);

        const colorsWithChanges = detectedColors.map(c => ({
            ...c,
            newHex: newOverrides[c.hex] || '',
        }));

        const modified = Object.keys(newOverrides).length > 0
            ? replaceSvgColors(svgContent, colorsWithChanges)
            : '';
        setSvgModified(modified);
        onFileChange(fileUrl, svgContent, modified);
    }, [colorOverrides, detectedColors, svgContent, fileUrl, onFileChange]);

    const handleResetAllColors = useCallback(() => {
        setColorOverrides({});
        setSvgModified('');
        onFileChange(fileUrl, svgContent, '');
    }, [fileUrl, svgContent, onFileChange]);

    const previewContent = useMemo(() => {
        if (svgModified) {
            return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgModified)))}`;
        }
        if (svgContent) {
            return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgContent)))}`;
        }
        return fileUrl;
    }, [svgModified, svgContent, fileUrl]);

    // ── Adaptive preview background ──
    type PreviewBgMode = 'auto' | 'dark' | 'light';
    const [previewBgMode, setPreviewBgMode] = useState<PreviewBgMode>('auto');

    const autoBgIsLight = useMemo(() => {
        // Determine if the logo is predominantly dark → show light bg, or vice versa
        const colors = detectedColors.length > 0 ? detectedColors : [];
        if (colors.length === 0) return true; // default: light background

        // Weighted average luminance (by usage count)
        let totalWeight = 0;
        let totalLum = 0;
        for (const c of colors) {
            try {
                const [r, g, b] = hexToRgb(c.newHex || c.hex);
                const lum = relativeLuminance(r, g, b);
                totalLum += lum * c.count;
                totalWeight += c.count;
            } catch { /* skip */ }
        }
        if (totalWeight === 0) return true;
        const avgLum = totalLum / totalWeight;
        // If logo is light (lum > 0.5) → dark bg; if dark → light bg
        return avgLum <= 0.5;
    }, [detectedColors]);

    const previewBgColor = useMemo(() => {
        const isLight = previewBgMode === 'auto' ? autoBgIsLight : previewBgMode === 'light';
        return isLight ? '#f0f0f0' : '#1a1a1a';
    }, [previewBgMode, autoBgIsLight]);

    const hasColorChanges = Object.values(colorOverrides).some(v => !!v);

    return (
        <div className={styles.uploader}>
            {/* Dropzone / Preview */}
            {!fileUrl ? (
                <div
                    className={`${styles.dropzone} ${isDragging ? styles.dropzoneDragging : ''}`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Upload size={32} className={styles.dropzoneIcon} />
                    <span className={styles.dropzoneTitle}>{labels.title}</span>
                    <span className={styles.dropzoneHint}>{labels.hint}</span>
                    <span className={styles.dropzoneSvgNote}>
                        <Palette size={14} />
                        {labels.svgNote}
                    </span>
                </div>
            ) : (
                <div className={styles.previewArea}>
                    <div className={styles.previewBox} style={{ background: previewBgColor }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewContent} alt={`${variant} preview`} className={styles.previewImg} />
                    </div>
                    <div className={styles.previewActions}>
                        <div className={styles.bgToggle}>
                            <button
                                type="button"
                                className={`${styles.bgToggleBtn} ${previewBgMode === 'auto' ? styles.bgToggleBtnActive : ''}`}
                                onClick={() => setPreviewBgMode('auto')}
                                title="Automatisk bakgrunn"
                            >
                                <Monitor size={13} />
                            </button>
                            <button
                                type="button"
                                className={`${styles.bgToggleBtn} ${previewBgMode === 'light' ? styles.bgToggleBtnActive : ''}`}
                                onClick={() => setPreviewBgMode('light')}
                                title="Lys bakgrunn"
                            >
                                <Sun size={13} />
                            </button>
                            <button
                                type="button"
                                className={`${styles.bgToggleBtn} ${previewBgMode === 'dark' ? styles.bgToggleBtnActive : ''}`}
                                onClick={() => setPreviewBgMode('dark')}
                                title="Mørk bakgrunn"
                            >
                                <Moon size={13} />
                            </button>
                        </div>
                        <button type="button" className={styles.changeButton} onClick={() => fileInputRef.current?.click()}>
                            <Image size={14} />
                            {labels.change}
                        </button>
                        <button type="button" className={styles.removeButton} onClick={handleRemove}>
                            <Trash2 size={14} />
                            {labels.remove}
                        </button>
                    </div>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept={labels.accept}
                onChange={handleFileSelect}
                className={styles.fileInput}
            />

            {uploading && (
                <div className={styles.uploadingBar}>
                    <div className={styles.uploadingProgress} />
                    <span>Laster opp...</span>
                </div>
            )}

            {error && <div className={styles.errorMsg}>{error}</div>}

            {/* ── SVG Fargerediger ── */}
            {isSvg && detectedColors.length > 0 && (
                <div className={styles.svgEditor}>
                    <div className={styles.editorHeader}>
                        <div className={styles.editorTitleArea}>
                            <div className={styles.editorIconBox}>
                                <Palette size={18} />
                            </div>
                            <div>
                                <h3 className={styles.editorTitle}>Rediger SVG-farger</h3>
                                <p className={styles.editorSubtitle}>
                                    {labels.editorSubject} inneholder {detectedColors.length} {detectedColors.length === 1 ? 'unik farge' : 'unike farger'}.
                                    Velg en ny farge for å oppdatere alle forekomster.
                                </p>
                            </div>
                        </div>
                        {hasColorChanges && (
                            <button type="button" className={styles.resetAllBtn} onClick={handleResetAllColors}>
                                <RotateCcw size={13} />
                                Tilbakestill alle
                            </button>
                        )}
                    </div>

                    <div className={styles.colorCards}>
                        {detectedColors.map((color) => {
                            const activeColor = colorOverrides[color.hex] || color.hex;
                            const isModified = !!colorOverrides[color.hex];
                            const contrast = bgColor ? contrastRatio(activeColor, bgColor) : null;
                            const contrastLevel = contrast ? getContrastLevel(contrast) : null;

                            return (
                                <div
                                    key={color.hex}
                                    className={`${styles.colorCard} ${isModified ? styles.colorCardModified : ''}`}
                                >
                                    <div className={styles.colorCardTop}>
                                        {/* Fargeswatches */}
                                        <div className={styles.swatchGroup}>
                                            <div
                                                className={styles.swatchLarge}
                                                style={{ backgroundColor: color.hex }}
                                                title={`Original: ${color.hex}`}
                                            />
                                            {isModified && (
                                                <>
                                                    <ArrowRight size={14} className={styles.swatchArrow} />
                                                    <div
                                                        className={styles.swatchLarge}
                                                        style={{ backgroundColor: colorOverrides[color.hex] }}
                                                        title={`Ny: ${colorOverrides[color.hex]}`}
                                                    />
                                                </>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className={styles.colorCardInfo}>
                                            <span className={styles.colorHex}>
                                                {isModified ? colorOverrides[color.hex] : color.hex}
                                            </span>
                                            <span className={styles.colorCount}>
                                                Brukes {color.count} {color.count === 1 ? 'gang' : 'ganger'}
                                            </span>
                                        </div>

                                        {/* Handlinger */}
                                        <div className={styles.colorCardActions}>
                                            <label className={styles.editColorBtn}>
                                                <Pencil size={13} />
                                                <span>Endre farge</span>
                                                <input
                                                    type="color"
                                                    value={colorOverrides[color.hex] || color.hex}
                                                    onChange={(e) => handleSvgColorChange(color.hex, e.target.value)}
                                                    className={styles.colorInputHidden}
                                                />
                                            </label>
                                            {isModified && (
                                                <button
                                                    type="button"
                                                    className={styles.resetSingleBtn}
                                                    onClick={() => handleResetSingleColor(color.hex)}
                                                    title="Tilbakestill denne fargen"
                                                >
                                                    <RotateCcw size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* WCAG kontrast */}
                                    {contrastLevel && (
                                        <div className={`${styles.contrastRow} ${styles[`contrast_${contrastLevel.level}`]}`}>
                                            {contrastLevel.level === 'pass' ? <Check size={12} /> : <AlertTriangle size={12} />}
                                            <span>{contrastLevel.label} mot bakgrunn</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
