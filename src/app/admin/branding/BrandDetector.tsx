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
} from 'lucide-react';
import styles from './brandDetector.module.css';

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
}

/* ── Component ── */
export default function BrandDetector({ onApplyAll, onApplyFavicon, onApplyLogo, onApplyFont, onDetectionComplete }: BrandDetectorProps) {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<DetectionResult | null>(null);
    const [faviconApplied, setFaviconApplied] = useState(false);
    const [logoApplied, setLogoApplied] = useState(false);
    const [fontAppliedRoles, setFontAppliedRoles] = useState<Record<string, Set<string>>>({});

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
                if (data.detectedRoles) {
                    onDetectionComplete?.(data.detectedRoles, data.suggestions || {});
                }
            }
        } catch {
            setError('Kunne ikke analysere siden. Sjekk URL og proev igjen.');
        }
        setLoading(false);
    }

    function handleNewAnalysis() {
        setResult(null);
        setFaviconApplied(false);
        setLogoApplied(false);
        setFontAppliedRoles({});
        setError('');
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
                            ? <>Farger oppdaget fra <strong>{result.title || result.url}</strong> — sendt til Fargeassistenten nedenfor.</>
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
                            <span>Farger oppdaget og sendt til Fargeassistenten</span>
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
                                                        onClick={() => {
                                                            onApplyFont?.(font, 'google', 'heading');
                                                            setFontAppliedRoles(prev => {
                                                                const next = { ...prev };
                                                                next[font] = new Set(prev[font] || []);
                                                                next[font].add('heading');
                                                                return next;
                                                            });
                                                        }}
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
                                                        onClick={() => {
                                                            onApplyFont?.(font, 'google', 'body');
                                                            setFontAppliedRoles(prev => {
                                                                const next = { ...prev };
                                                                next[font] = new Set(prev[font] || []);
                                                                next[font].add('body');
                                                                return next;
                                                            });
                                                        }}
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
                                                        onClick={() => {
                                                            onApplyFont?.(font, 'custom', 'heading');
                                                            setFontAppliedRoles(prev => {
                                                                const next = { ...prev };
                                                                next[font] = new Set(prev[font] || []);
                                                                next[font].add('heading');
                                                                return next;
                                                            });
                                                        }}
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
                                                        onClick={() => {
                                                            onApplyFont?.(font, 'custom', 'body');
                                                            setFontAppliedRoles(prev => {
                                                                const next = { ...prev };
                                                                next[font] = new Set(prev[font] || []);
                                                                next[font].add('body');
                                                                return next;
                                                            });
                                                        }}
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
