'use client';

import { useState } from 'react';
import {
    Globe,
    Loader2,
    Check,
    Sparkles,
    RotateCcw,
    AlertTriangle,
    Image,
    Type,
    Palette,
    Sun,
    Moon,
} from 'lucide-react';
import styles from './brandDetector.module.css';
import { ROLE_LABELS, type BrandingRoles } from '@/lib/brandingGenerator';

/* ── Types ── */
interface DetectedColor {
    hex: string;
    sources: string[];
    importance: number;
    category: string;
}

interface DetectedRoles {
    brand: string;
    bgPrimary: string;
    bgSecondary: string;
    textPrimary: string;
    sidebarBg: string;
}

interface DetectionResult {
    url: string;
    title?: string;
    colors: DetectedColor[];
    suggestions: Record<string, string>;
    detectedRoles?: DetectedRoles;
    faviconUrl?: string;
    logoUrl?: string;
    logoSvgContent?: string;
    googleFonts?: string[];
    detectedFonts?: string[];
    siteTheme?: 'light' | 'dark';
}

interface BrandDetectorProps {
    onApplyAll: (suggestions: Record<string, string>) => void;
    onApplyFavicon?: (url: string) => void;
    onApplyLogo?: (url: string, svgContent?: string) => void;
    onApplyFont?: (fontFamily: string, source: string, role: 'body' | 'heading') => void;
    onDetectionComplete?: (roles: DetectedRoles, suggestions: Record<string, string>) => void;
    onPickAccent?: (hex: string) => void;
    onSetMode?: (mode: 'light' | 'dark') => void;
}

/* ── Component ── */
export default function BrandDetector({ onApplyAll, onApplyFavicon, onApplyLogo, onApplyFont, onDetectionComplete, onPickAccent, onSetMode }: BrandDetectorProps) {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<DetectionResult | null>(null);
    const [faviconApplied, setFaviconApplied] = useState(false);
    const [logoApplied, setLogoApplied] = useState(false);
    const [allColorsApplied, setAllColorsApplied] = useState(false);
    const [fontAppliedRoles, setFontAppliedRoles] = useState<Record<string, Set<string>>>({});
    // Aksentfargen brukeren har valgt fra paletten (markerer aktiv fargeprøve).
    const [pickedAccent, setPickedAccent] = useState<string | null>(null);
    // Lys/mørk-modus for den avledede paletten (initieres fra oppdaget tema).
    const [mode, setMode] = useState<'light' | 'dark'>('light');

    async function handleDetect() {
        if (!url.trim()) return;
        setLoading(true);
        setError('');
        setResult(null);

        try {
            const res = await fetch('/api/detect-brand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim() }),
            });
            const data = await res.json();
            if (data.error) {
                setError(data.error);
            } else {
                setResult(data);
                setMode(data.siteTheme === 'dark' ? 'dark' : 'light');
                setPickedAccent(data.detectedRoles?.brand ?? null);
                if (data.detectedRoles) {
                    onDetectionComplete?.(data.detectedRoles, data.suggestions || {});
                }
            }
        } catch {
            setError('Kunne ikke analysere siden. Sjekk URL og prøv igjen.');
        }
        setLoading(false);
    }

    /** Assign a role to a font exclusively — removes that role from all other fonts */
    function assignFontRole(font: string, role: 'heading' | 'body', source: string) {
        onApplyFont?.(font, source, role);
        setFontAppliedRoles(prev => {
            const next: Record<string, Set<string>> = {};
            // Remove this role from all other fonts
            for (const [f, roles] of Object.entries(prev)) {
                const updated = new Set(roles);
                if (f !== font) updated.delete(role);
                if (updated.size > 0) next[f] = updated;
            }
            // Add this role to the target font
            if (!next[font]) next[font] = new Set();
            next[font].add(role);
            return next;
        });
    }

    function handleNewAnalysis() {
        setResult(null);
        setFaviconApplied(false);
        setLogoApplied(false);
        setAllColorsApplied(false);
        setFontAppliedRoles({});
        setPickedAccent(null);
        setMode('light');
        setError('');
    }

    /** Velg en oppdaget farge som aksent — avleder hele paletten på nytt i skjemaet. */
    function handlePickAccent(hex: string) {
        setPickedAccent(hex);
        onPickAccent?.(hex);
    }

    /** Bytt lys/mørk modus — avleder paletten på nytt mens aksenten beholdes. */
    function handleSetMode(next: 'light' | 'dark') {
        setMode(next);
        onSetMode?.(next);
    }

    // Normaliser hex for sammenligning (markering av aktiv fargeprøve).
    function isActiveAccent(hex: string): boolean {
        return !!pickedAccent && pickedAccent.toLowerCase() === hex.toLowerCase();
    }

    const hasAssets = result && (result.logoUrl || result.faviconUrl ||
        (result.googleFonts && result.googleFonts.length > 0) ||
        (result.detectedFonts && result.detectedFonts.length > 0));

    return (
        <div className={styles.detector}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerIcon}>
                    <Globe size={18} />
                </div>
                <div>
                    <h3 className={styles.headerTitle}>Hent farger fra nettside</h3>
                    <p className={styles.headerDesc}>
                        {result
                            ? <>Farger oppdaget fra <strong>{result.title || result.url}</strong> — se paletten under, eller bruk dem direkte.</>
                            : 'Lim inn en URL for å automatisk oppdage merkevarefarger, logo og fonter.'}
                    </p>
                </div>
            </div>

            {/* URL input */}
            <div className={styles.inputRow}>
                <div className={styles.inputWrapper}>
                    <Globe size={16} className={styles.inputIcon} />
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="example.com"
                        className={styles.urlInput}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (!loading) handleDetect();
                            }
                        }}
                        disabled={loading}
                    />
                </div>
                <button
                    type="button"
                    className={styles.detectButton}
                    onClick={handleDetect}
                    disabled={loading || !url.trim()}
                >
                    {loading ? (
                        <>
                            <Loader2 size={16} className={styles.spin} />
                            Analyserer...
                        </>
                    ) : (
                        <>
                            <Sparkles size={16} />
                            Analyser
                        </>
                    )}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className={styles.errorMessage}>
                    <AlertTriangle size={14} />
                    <span>{error}</span>
                </div>
            )}

            {/* Results: only assets (logo/favicon/fonts) — colors flow via Fargeassistent */}
            {result && (
                <div className={styles.results}>
                    {/* Detection success confirmation */}
                    {result.detectedRoles && (
                        <div className={styles.detectionSuccess}>
                            <Check size={14} />
                            <span>Farger oppdaget — se paletten under, eller bruk dem direkte.</span>
                        </div>
                    )}

                    {/* Detected colours palette */}
                    {(result.detectedRoles || result.colors.length > 0) && (
                        <div className={styles.paletteSection}>
                            <span className={styles.sectionLabel}>Oppdagede farger</span>

                            {/* Lys/Mørk modus-bryter — avleder paletten på nytt i valgt modus */}
                            <div className={styles.modeRow}>
                                <span className={styles.modeRowLabel}>Modus:</span>
                                <div className={styles.modeToggle} role="group" aria-label="Velg modus">
                                    <button
                                        type="button"
                                        className={`${styles.modeButton} ${mode === 'light' ? styles.modeButtonActive : ''}`}
                                        onClick={() => handleSetMode('light')}
                                        aria-pressed={mode === 'light'}
                                    >
                                        <Sun size={14} />
                                        Lyst
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.modeButton} ${mode === 'dark' ? styles.modeButtonActive : ''}`}
                                        onClick={() => handleSetMode('dark')}
                                        aria-pressed={mode === 'dark'}
                                    >
                                        <Moon size={14} />
                                        Mørkt
                                    </button>
                                </div>
                            </div>

                            <span className={styles.pickHint}>Klikk en farge for å bruke den som aksent.</span>

                            {/* Role mapping — the 5 fetched roles (clickable to set accent) */}
                            {result.detectedRoles && (
                                <div className={styles.roleGrid}>
                                    {(Object.keys(result.detectedRoles) as Array<keyof BrandingRoles>).map((role) => {
                                        const hex = result.detectedRoles![role];
                                        const active = isActiveAccent(hex);
                                        return (
                                            <button
                                                key={role}
                                                type="button"
                                                className={`${styles.roleItem} ${styles.roleItemButton} ${active ? styles.roleItemActive : ''}`}
                                                onClick={() => handlePickAccent(hex)}
                                                title="Sett som aksentfarge"
                                            >
                                                <span
                                                    className={`${styles.roleSwatch} ${active ? styles.swatchActive : ''}`}
                                                    style={{ backgroundColor: hex }}
                                                    aria-hidden="true"
                                                >
                                                    {active && <Check size={14} className={styles.swatchCheck} />}
                                                </span>
                                                <span className={styles.roleInfo}>
                                                    <span className={styles.roleLabel}>{ROLE_LABELS[role]}</span>
                                                    <span className={styles.roleHex}>{hex}</span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Compact strip of the top raw colours found (clickable to set accent) */}
                            {result.colors.length > 0 && (
                                <div className={styles.rawColors}>
                                    {result.colors.slice(0, 8).map((c, i) => {
                                        const active = isActiveAccent(c.hex);
                                        return (
                                            <button
                                                key={`${c.hex}-${i}`}
                                                type="button"
                                                className={`${styles.rawSwatch} ${styles.rawSwatchButton} ${active ? styles.swatchActive : ''}`}
                                                style={{ backgroundColor: c.hex }}
                                                title="Sett som aksentfarge"
                                                onClick={() => handlePickAccent(c.hex)}
                                            >
                                                {active && <Check size={12} className={styles.swatchCheck} />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Apply all detected colours directly to the form */}
                            {allColorsApplied ? (
                                <div className={styles.allColorsApplied}>
                                    <Check size={16} />
                                    <span>Alle farger er brukt i skjemaet</span>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    className={styles.applyAllButton}
                                    onClick={() => {
                                        onApplyAll(result.suggestions);
                                        setAllColorsApplied(true);
                                    }}
                                >
                                    <Palette size={16} />
                                    Bruk alle farger
                                </button>
                            )}
                        </div>
                    )}

                    {/* No data found at all */}
                    {result.colors.length === 0 && !result.faviconUrl && !result.logoUrl && (!result.googleFonts || result.googleFonts.length === 0) && (!result.detectedFonts || result.detectedFonts.length === 0) && (
                        <div className={styles.emptyState}>
                            Ingen merkevaredata ble funnet på denne siden. Prøv en annen URL.
                        </div>
                    )}

                    {/* Logo */}
                    {result.logoUrl && (
                        <div className={styles.assetSection}>
                            <span className={styles.sectionLabel}>Logo</span>
                            <div className={`${styles.assetCard} ${logoApplied ? styles.assetApplied : ''}`}>
                                <div className={styles.assetPreview}>
                                    <Image size={14} className={styles.assetIcon} />
                                    <img
                                        src={result.logoUrl}
                                        alt="Logo"
                                        className={styles.logoPreview}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                    <span className={styles.assetUrl}>
                                        {result.logoUrl.startsWith('data:') ? 'Inline SVG' : result.logoUrl.split('/').pop()?.split('?')[0]}
                                    </span>
                                </div>
                                {logoApplied ? (
                                    <span className={styles.appliedBadge}>
                                        <Check size={12} />
                                        Brukt
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        className={styles.applyButton}
                                        onClick={() => {
                                            onApplyLogo?.(result.logoUrl!, result.logoSvgContent);
                                            setLogoApplied(true);
                                        }}
                                    >
                                        Bruk
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Favicon */}
                    {result.faviconUrl && (
                        <div className={styles.assetSection}>
                            <span className={styles.sectionLabel}>Favicon</span>
                            <div className={`${styles.assetCard} ${faviconApplied ? styles.assetApplied : ''}`}>
                                <div className={styles.assetPreview}>
                                    <Image size={14} className={styles.assetIcon} />
                                    <img
                                        src={result.faviconUrl}
                                        alt="Favicon"
                                        className={styles.faviconPreview}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                    <span className={styles.assetUrl}>{result.faviconUrl.split('/').pop()}</span>
                                </div>
                                {faviconApplied ? (
                                    <span className={styles.appliedBadge}>
                                        <Check size={12} />
                                        Brukt
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        className={styles.applyButton}
                                        onClick={() => {
                                            onApplyFavicon?.(result.faviconUrl!);
                                            setFaviconApplied(true);
                                        }}
                                    >
                                        Bruk
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Google Fonts */}
                    {result.googleFonts && result.googleFonts.length > 0 && (
                        <div className={styles.assetSection}>
                            <span className={styles.sectionLabel}>Google Fonts</span>
                            <div className={styles.fontsList}>
                                {result.googleFonts.slice(0, 12).map((font) => {
                                    const roles = fontAppliedRoles[font];
                                    const appliedHeading = roles?.has('heading');
                                    const appliedBody = roles?.has('body');
                                    const appliedBoth = appliedHeading && appliedBody;
                                    const hasAny = appliedHeading || appliedBody;

                                    return (
                                    <div
                                        key={font}
                                        className={`${styles.assetCard} ${hasAny ? styles.assetApplied : ''}`}
                                    >
                                        <div className={styles.assetPreview}>
                                            <Type size={14} className={styles.assetIcon} />
                                            <span
                                                className={styles.fontName}
                                                style={{ fontFamily: `"${font}", sans-serif` }}
                                            >
                                                {font}
                                            </span>
                                            <span className={styles.fontSample}>Aa Bb Cc 123</span>
                                        </div>
                                        {appliedBoth ? (
                                            <span className={styles.appliedBadge}>
                                                <Check size={12} />
                                                Begge
                                            </span>
                                        ) : (
                                            <div className={styles.fontRoleButtons}>
                                                {appliedHeading ? (
                                                    <span className={styles.appliedBadge}>
                                                        <Check size={10} />
                                                        Overskrift
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className={styles.applyButton}
                                                        onClick={() => assignFontRole(font, 'heading', 'google')}
                                                    >
                                                        Overskrift
                                                    </button>
                                                )}
                                                {appliedBody ? (
                                                    <span className={styles.appliedBadge}>
                                                        <Check size={10} />
                                                        Brødtekst
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className={styles.applyButton}
                                                        onClick={() => assignFontRole(font, 'body', 'google')}
                                                    >
                                                        Brødtekst
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Detected CSS Fonts */}
                    {result.detectedFonts && result.detectedFonts.length > 0 && (
                        <div className={styles.assetSection}>
                            <span className={styles.sectionLabel}>Fonter fra CSS</span>
                            <div className={styles.fontsList}>
                                {result.detectedFonts.slice(0, 12).map((font) => {
                                    const roles = fontAppliedRoles[font];
                                    const appliedHeading = roles?.has('heading');
                                    const appliedBody = roles?.has('body');
                                    const appliedBoth = appliedHeading && appliedBody;
                                    const hasAny = appliedHeading || appliedBody;

                                    return (
                                    <div
                                        key={font}
                                        className={`${styles.assetCard} ${hasAny ? styles.assetApplied : ''}`}
                                    >
                                        <div className={styles.assetPreview}>
                                            <Type size={14} className={styles.assetIcon} />
                                            <span className={styles.fontName}>
                                                {font}
                                            </span>
                                        </div>
                                        {appliedBoth ? (
                                            <span className={styles.appliedBadge}>
                                                <Check size={12} />
                                                Begge
                                            </span>
                                        ) : (
                                            <div className={styles.fontRoleButtons}>
                                                {appliedHeading ? (
                                                    <span className={styles.appliedBadge}>
                                                        <Check size={10} />
                                                        Overskrift
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className={styles.applyButton}
                                                        onClick={() => assignFontRole(font, 'heading', 'custom')}
                                                    >
                                                        Overskrift
                                                    </button>
                                                )}
                                                {appliedBody ? (
                                                    <span className={styles.appliedBadge}>
                                                        <Check size={10} />
                                                        Brødtekst
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className={styles.applyButton}
                                                        onClick={() => assignFontRole(font, 'body', 'custom')}
                                                    >
                                                        Brødtekst
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* New analysis button */}
                    <div className={styles.footerActions}>
                        <button
                            type="button"
                            className={styles.newAnalysisButton}
                            onClick={handleNewAnalysis}
                        >
                            <RotateCcw size={14} />
                            Ny analyse
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
