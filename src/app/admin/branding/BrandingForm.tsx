'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { updateBranding, resetBranding } from '@/app/actions/brandingActions';
import { RotateCcw, Check, AlertTriangle, Eye, Save } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import styles from './branding.module.css';
import LogoUploader from './LogoUploader';
import FontPicker from './FontPicker';
import BrandDetector from './BrandDetector';
import ManualAssistant from './ManualAssistant';
import ColorFieldTip, { type TipData } from './ColorFieldTip';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
    hexToRgb,
    relativeLuminance,
    contrastRatio,
    getContrastLevel,
    normalizeHexInput,
    isValidHex,
} from '@/lib/colorUtils';
import {
    deriveBrandingSuggestionsFromRoles,
    type BrandingRoles,
    type GeneratorResult,
} from '@/lib/brandingGenerator';

// Standardverdier (matcher globals.css)
const DEFAULTS: Record<string, string> = {
    colorBgPrimary: '#050505',
    colorBgSecondary: '#0f0f11',
    colorTextPrimary: '#ffffff',
    colorTextSecondary: '#9ca3af',
    colorBorder: '#1a1a2e',
    colorAccent: '#3b82f6',
    colorButtonPrimary: '#3b82f6',
    colorButtonText: '#ffffff',
    colorSidebarBg: '#0a0a0a',
    colorSidebarText: '#a1a1aa',
    colorSidebarActive: '#3b82f6',
    colorSuccess: '#22c55e',
    colorWarning: '#f97316',
    colorDanger: '#ef4444',
};

interface FieldDef {
    key: string;
    label: string;
    hint: string;
    contrastAgainst?: string;
}

interface SectionDef {
    title: string;
    description: string;
    fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
    {
        title: 'Bakgrunner',
        description: 'Kontroller bakgrunnsfargene i hele plattformen.',
        fields: [
            { key: 'colorBgPrimary', label: 'Hovedbakgrunn', hint: 'Brukes som bakgrunn for hele siden' },
            { key: 'colorBgSecondary', label: 'Sekundær bakgrunn', hint: 'Brukes i kort, paneler og sidebar' },
        ],
    },
    {
        title: 'Tekst',
        description: 'Alle tekstfarger. Kontrast mot bakgrunn sjekkes automatisk (WCAG AA).',
        fields: [
            { key: 'colorTextPrimary', label: 'Hovedtekst', hint: 'Overskrifter og brødtekst', contrastAgainst: 'colorBgPrimary' },
            { key: 'colorTextSecondary', label: 'Sekundærtekst', hint: 'Labels, hjelpetekst, metadata', contrastAgainst: 'colorBgPrimary' },
        ],
    },
    {
        title: 'Rammer og skillelinjer',
        description: 'Kanter på kort, inputfelter og separatorer.',
        fields: [
            { key: 'colorBorder', label: 'Border', hint: 'Brukes på alle rammer og skillelinjer' },
        ],
    },
    {
        title: 'Aksentfarge',
        description: 'Merkevarefargen brukt på lenker, fokusmarkering og viktige UI-elementer.',
        fields: [
            { key: 'colorAccent', label: 'Accent', hint: 'Lenker, fokusringer, valgte elementer', contrastAgainst: 'colorBgPrimary' },
        ],
    },
    {
        title: 'Knapper',
        description: 'Farger for primærknapper.',
        fields: [
            { key: 'colorButtonPrimary', label: 'Knapp bakgrunn', hint: 'Bakgrunnsfargen for primærknapper' },
            { key: 'colorButtonText', label: 'Knapp tekst', hint: 'Tekstfargen inne i knappen', contrastAgainst: 'colorButtonPrimary' },
        ],
    },
    {
        title: 'Sidebar / Navigasjon',
        description: 'Farger brukt i admin-sidebaren.',
        fields: [
            { key: 'colorSidebarBg', label: 'Sidebar bakgrunn', hint: 'Bakgrunn for navigasjonspanelet' },
            { key: 'colorSidebarText', label: 'Sidebar tekst', hint: 'Menypunkter i sidebaren', contrastAgainst: 'colorSidebarBg' },
            { key: 'colorSidebarActive', label: 'Aktiv lenke', hint: 'Markering av valgt menyelement', contrastAgainst: 'colorSidebarBg' },
        ],
    },
    {
        title: 'Statusfarger',
        description: 'Farger for suksess, advarsel og feilmeldinger.',
        fields: [
            { key: 'colorSuccess', label: 'Suksess', hint: 'Brukes ved vellykkede handlinger' },
            { key: 'colorWarning', label: 'Advarsel', hint: 'Brukes for advarsler og påminnelser' },
            { key: 'colorDanger', label: 'Feil', hint: 'Brukes for feil og destruktive handlinger' },
        ],
    },
];

// -- Kontrastberegning importert fra @/lib/colorUtils --

// -- Normaliser farge-input importert fra @/lib/colorUtils --

function isValidHex6(v: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(v);
}

// -- Fargefelt-komponent med react-colorful --
function ColorField({
    fieldKey, label, hint, value, defaultValue, contrastValue, onChange, tip,
}: {
    fieldKey: string;
    label: string;
    hint: string;
    value: string;
    defaultValue: string;
    contrastValue?: string;
    onChange: (key: string, val: string) => void;
    tip?: TipData | null;
}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    const closePopover = useCallback(() => setPickerOpen(false), []);

    useEffect(() => {
        if (!pickerOpen) return;
        function handleClick(e: MouseEvent) {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                closePopover();
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [pickerOpen, closePopover]);

    const contrast = useMemo(() => {
        if (!contrastValue) return null;
        try {
            const ratio = contrastRatio(value || defaultValue, contrastValue);
            return getContrastLevel(ratio);
        } catch {
            return null;
        }
    }, [value, defaultValue, contrastValue]);

    const isCustom = value && value !== defaultValue;
    const resolvedColor = isValidHex6(value) ? value : defaultValue;

    return (
        <div className={styles.colorField}>
            <div className={styles.colorFieldHeader}>
                <label className={styles.label}>{label}</label>
                {isCustom && (
                    <button
                        type="button"
                        className={styles.resetFieldButton}
                        onClick={() => onChange(fieldKey, '')}
                        title="Tilbakestill til standard"
                    >
                        <RotateCcw size={12} />
                    </button>
                )}
            </div>
            {tip && (
                <ColorFieldTip tip={tip} onApply={() => { onChange(fieldKey, tip.value); }} />
            )}
            <div className={styles.colorInputWrapper}>
                {/* Clickable swatch that opens the picker */}
                <div className={styles.pickerAnchor}>
                    <button
                        type="button"
                        className={styles.colorSwatchBtn}
                        style={{ backgroundColor: resolvedColor }}
                        onClick={() => setPickerOpen(!pickerOpen)}
                        aria-label="Velg farge"
                    />
                    {pickerOpen && (
                        <div ref={popoverRef} className={styles.pickerPopover}>
                            <HexColorPicker
                                color={resolvedColor}
                                onChange={(c) => onChange(fieldKey, c)}
                            />
                        </div>
                    )}
                </div>
                <input
                    type="text"
                    name={fieldKey}
                    value={value}
                    onChange={(e) => onChange(fieldKey, e.target.value)}
                    onBlur={(e) => {
                        const normalized = normalizeHexInput(e.target.value);
                        if (normalized && normalized !== value) {
                            onChange(fieldKey, normalized);
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            const normalized = normalizeHexInput((e.target as HTMLInputElement).value);
                            if (normalized) onChange(fieldKey, normalized);
                        }
                    }}
                    className={`${styles.input} ${styles.colorHex}`}
                    placeholder={defaultValue}
                />
            </div>
            {contrast && (
                <div className={`${styles.contrastBadge} ${styles[`contrast_${contrast.level}`]}`}>
                    {contrast.level === 'pass' && <Check size={12} />}
                    {contrast.level === 'warn' && <AlertTriangle size={12} />}
                    {contrast.level === 'fail' && <AlertTriangle size={12} />}
                    <span>{contrast.label}</span>
                </div>
            )}
            <span className={styles.hint}>{hint}</span>
        </div>
    );
}

// -- Props --
export interface BrandingData {
    tenantName: string;
    colorBgPrimary: string;
    colorBgSecondary: string;
    colorTextPrimary: string;
    colorTextSecondary: string;
    colorBorder: string;
    colorAccent: string;
    colorButtonPrimary: string;
    colorButtonText: string;
    colorSidebarBg: string;
    colorSidebarText: string;
    colorSidebarActive: string;
    colorSuccess: string;
    colorWarning: string;
    colorDanger: string;
    logoUrl: string;
    logoSvgContent: string;
    logoSvgModified: string;
    faviconUrl: string;
    faviconSvgContent: string;
    faviconSvgModified: string;
    fontFamily: string;
    fontHeading: string;
    fontSource: string;
    customFontUrl: string;
}

interface BrandingFormProps {
    initial: BrandingData;
}

// -- Hovedkomponent --
export default function BrandingForm({ initial }: BrandingFormProps) {
    const router = useRouter();
    const [tenantName, setTenantName] = useState(initial.tenantName || '');
    const [colors, setColors] = useState<Record<string, string>>({
        colorBgPrimary: initial.colorBgPrimary || '',
        colorBgSecondary: initial.colorBgSecondary || '',
        colorTextPrimary: initial.colorTextPrimary || '',
        colorTextSecondary: initial.colorTextSecondary || '',
        colorBorder: initial.colorBorder || '',
        colorAccent: initial.colorAccent || '',
        colorButtonPrimary: initial.colorButtonPrimary || '',
        colorButtonText: initial.colorButtonText || '',
        colorSidebarBg: initial.colorSidebarBg || '',
        colorSidebarText: initial.colorSidebarText || '',
        colorSidebarActive: initial.colorSidebarActive || '',
        colorSuccess: initial.colorSuccess || '',
        colorWarning: initial.colorWarning || '',
        colorDanger: initial.colorDanger || '',
    });
    const [logoUrl, setLogoUrl] = useState(initial.logoUrl || '');
    const [logoSvgContent, setLogoSvgContent] = useState(initial.logoSvgContent || '');
    const [logoSvgModified, setLogoSvgModified] = useState(initial.logoSvgModified || '');
    const [faviconUrl, setFaviconUrl] = useState(initial.faviconUrl || '');
    const [faviconSvgContent, setFaviconSvgContent] = useState(initial.faviconSvgContent || '');
    const [faviconSvgModified, setFaviconSvgModified] = useState(initial.faviconSvgModified || '');
    const [fontFamily, setFontFamily] = useState(initial.fontFamily || '');
    const [fontHeading, setFontHeading] = useState(initial.fontHeading || '');
    const [fontSource, setFontSource] = useState(initial.fontSource || '');
    const [customFontUrl, setCustomFontUrl] = useState(initial.customFontUrl || '');
    const [loading, setLoading] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [showPreview, setShowPreview] = useState(true);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // ── Tip-system state ──────────────────────────────────────
    const [manualSuggestions, setManualSuggestions] = useState<GeneratorResult | null>(null);
    const [detectorSuggestions, setDetectorSuggestions] = useState<Record<string, string> | null>(null);
    const [detectedRoles, setDetectedRoles] = useState<BrandingRoles | null>(null);
    const [dismissedTipFields, setDismissedTipFields] = useState<Set<string>>(new Set());

    // Baseline: auto-derive suggestions from current role colours
    const baselineSuggestions = useMemo(() => {
        const resolve = (key: string) => colors[key] || DEFAULTS[key] || '#000000';
        const roles: BrandingRoles = {
            brand: resolve('colorAccent'),
            bgPrimary: resolve('colorBgPrimary'),
            bgSecondary: resolve('colorBgSecondary'),
            textPrimary: resolve('colorTextPrimary'),
            sidebarBg: resolve('colorSidebarBg'),
        };
        return deriveBrandingSuggestionsFromRoles(roles, 'standard');
    }, [colors]);

    // Initial roles for ManualAssistant (computed from current form)
    const initialRoles = useMemo((): BrandingRoles => {
        const resolve = (key: string) => colors[key] || DEFAULTS[key] || '#000000';
        return {
            brand: resolve('colorAccent'),
            bgPrimary: resolve('colorBgPrimary'),
            bgSecondary: resolve('colorBgSecondary'),
            textPrimary: resolve('colorTextPrimary'),
            sidebarBg: resolve('colorSidebarBg'),
        };
    }, [colors]);

    /**
     * Get the highest-priority tip for a given field.
     * Priority: Manual > Detektor > Baseline.
     * Only returns a tip if the suggested value differs from current.
     */
    function getTipForField(field: string): TipData | null {
        // Skip tips for fields where user already applied a suggestion
        if (dismissedTipFields.has(field)) return null;

        const currentValue = (colors[field] || DEFAULTS[field] || '#000000').toLowerCase();

        // Priority 1: Manual
        if (manualSuggestions?.suggestions[field]) {
            const val = manualSuggestions.suggestions[field].toLowerCase();
            if (val !== currentValue) {
                const detail = manualSuggestions.details.find(d => d.field === field);
                return {
                    value: manualSuggestions.suggestions[field],
                    source: 'manual',
                    reasoning: detail?.reasoning,
                    adjusted: detail?.adjusted,
                    contrastRatio: detail?.contrastRatio,
                };
            }
        }

        // Priority 2: Detektor
        if (detectorSuggestions?.[field]) {
            const val = detectorSuggestions[field].toLowerCase();
            if (val !== currentValue) {
                return {
                    value: detectorSuggestions[field],
                    source: 'detektor',
                };
            }
        }

        // Priority 3: Baseline
        if (baselineSuggestions?.suggestions[field]) {
            const val = baselineSuggestions.suggestions[field].toLowerCase();
            if (val !== currentValue) {
                const detail = baselineSuggestions.details.find(d => d.field === field);
                return {
                    value: baselineSuggestions.suggestions[field],
                    source: 'baseline',
                    reasoning: detail?.reasoning,
                    adjusted: detail?.adjusted,
                    contrastRatio: detail?.contrastRatio,
                };
            }
        }

        return null;
    }

    function handleDetectionComplete(roles: BrandingRoles, rawSuggestions: Record<string, string>) {
        setDetectedRoles(roles);
        setDetectorSuggestions(rawSuggestions);
        setDismissedTipFields(new Set()); // Reset so new suggestions can show
    }

    function handleManualGenerate(result: GeneratorResult | null) {
        setManualSuggestions(result);
        setDismissedTipFields(new Set()); // Reset so new suggestions can show
    }

    function handleColorChange(key: string, value: string) {
        // Bare lagre verdien som den er - normalisering skjer kun på blur/Enter
        setColors(prev => ({ ...prev, [key]: value }));        // Dismiss tips for this field so other sources don't pop up
        setDismissedTipFields(prev => {
            const next = new Set(prev);
            next.add(key);
            return next;
        });    }

    function resolveColor(key: string): string {
        return colors[key] || DEFAULTS[key] || '#000000';
    }

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        setMessage({ type: '', text: '' });
        formData.set('tenantName', tenantName);
        formData.set('logoUrl', logoUrl);
        formData.set('logoSvgContent', logoSvgContent);
        formData.set('logoSvgModified', logoSvgModified);
        formData.set('faviconUrl', faviconUrl);
        formData.set('faviconSvgContent', faviconSvgContent);
        formData.set('faviconSvgModified', faviconSvgModified);
        formData.set('fontFamily', fontFamily);
        formData.set('fontHeading', fontHeading);
        formData.set('fontSource', fontSource);
        formData.set('customFontUrl', customFontUrl);

        const result = await updateBranding(formData);
        if (result.success) {
            setMessage({ type: 'success', text: 'Branding lagret! Oppdaterer siden...' });
            setTimeout(() => window.location.reload(), 800);
        } else {
            setMessage({ type: 'error', text: result.error || 'Noe gikk galt.' });
        }
        setLoading(false);
    }

    async function handleReset() {
        setShowResetConfirm(false);
        setResetting(true);
        setMessage({ type: '', text: '' });

        const result = await resetBranding();
        if (result.success) {
            setMessage({ type: 'success', text: 'Tilbakestilt! Oppdaterer siden...' });
            setTimeout(() => window.location.reload(), 800);
        } else {
            setMessage({ type: 'error', text: result.error || 'Noe gikk galt.' });
        }
        setResetting(false);
    }

    const hasCustomValues = Object.values(colors).some(v => !!v) || !!logoUrl || !!logoSvgContent || !!faviconUrl || !!faviconSvgContent || !!fontFamily || !!fontHeading || !!customFontUrl;

    const hasUnsavedChanges = useMemo(() => {
        if (tenantName !== (initial.tenantName || '')) return true;
        for (const key of Object.keys(colors)) {
            if (colors[key] !== ((initial as unknown as Record<string, string>)[key] || '')) return true;
        }
        if (logoUrl !== (initial.logoUrl || '')) return true;
        if (logoSvgContent !== (initial.logoSvgContent || '')) return true;
        if (logoSvgModified !== (initial.logoSvgModified || '')) return true;
        if (faviconUrl !== (initial.faviconUrl || '')) return true;
        if (faviconSvgContent !== (initial.faviconSvgContent || '')) return true;
        if (faviconSvgModified !== (initial.faviconSvgModified || '')) return true;
        if (fontFamily !== (initial.fontFamily || '')) return true;
        if (fontHeading !== (initial.fontHeading || '')) return true;
        if (fontSource !== (initial.fontSource || '')) return true;
        if (customFontUrl !== (initial.customFontUrl || '')) return true;
        return false;
    }, [tenantName, colors, logoUrl, logoSvgContent, logoSvgModified, faviconUrl, faviconSvgContent, faviconSvgModified, fontFamily, fontHeading, fontSource, customFontUrl, initial]);

    function handleRevert() {
        setTenantName(initial.tenantName || '');
        setColors({
            colorBgPrimary: initial.colorBgPrimary || '',
            colorBgSecondary: initial.colorBgSecondary || '',
            colorTextPrimary: initial.colorTextPrimary || '',
            colorTextSecondary: initial.colorTextSecondary || '',
            colorBorder: initial.colorBorder || '',
            colorAccent: initial.colorAccent || '',
            colorButtonPrimary: initial.colorButtonPrimary || '',
            colorButtonText: initial.colorButtonText || '',
            colorSidebarBg: initial.colorSidebarBg || '',
            colorSidebarText: initial.colorSidebarText || '',
            colorSidebarActive: initial.colorSidebarActive || '',
            colorSuccess: initial.colorSuccess || '',
            colorWarning: initial.colorWarning || '',
            colorDanger: initial.colorDanger || '',
        });
        setLogoUrl(initial.logoUrl || '');
        setLogoSvgContent(initial.logoSvgContent || '');
        setLogoSvgModified(initial.logoSvgModified || '');
        setFaviconUrl(initial.faviconUrl || '');
        setFaviconSvgContent(initial.faviconSvgContent || '');
        setFaviconSvgModified(initial.faviconSvgModified || '');
        setFontFamily(initial.fontFamily || '');
        setFontHeading(initial.fontHeading || '');
        setFontSource(initial.fontSource || '');
        setCustomFontUrl(initial.customFontUrl || '');
        setMessage({ type: '', text: '' });
    }

    function handleBrandSuggestAll(suggestions: Record<string, string>) {
        const colorUpdates: Record<string, string> = {};
        for (const [field, value] of Object.entries(suggestions)) {
            if (field.startsWith('color')) {
                colorUpdates[field] = value;
            }
        }
        setColors(prev => ({ ...prev, ...colorUpdates }));
    }

    function handleBrandFavicon(url: string) {
        setFaviconUrl(url);
    }

    function handleBrandLogo(url: string, svgContent?: string) {
        setLogoUrl(url);
        if (svgContent) {
            setLogoSvgContent(svgContent);
            setLogoSvgModified('');
        }
    }

    function handleBrandFont(font: string, source: string, role: 'body' | 'heading') {
        if (role === 'heading') {
            setFontHeading(font);
        } else {
            setFontFamily(font);
        }
        setFontSource(source);
        if (role === 'body') setCustomFontUrl('');
    }

    return (
        <div className={styles.brandingLayout}>
            {/* Venstre: Skjema */}
            <form action={handleSubmit} className={styles.form}>
                {/* URL Brand Detector */}
                <div className={styles.section}>
                    <BrandDetector
                        onApplyAll={handleBrandSuggestAll}
                        onApplyFavicon={handleBrandFavicon}
                        onApplyLogo={handleBrandLogo}
                        onApplyFont={handleBrandFont}
                        onDetectionComplete={handleDetectionComplete}
                    />
                </div>

                {/* Manual Color Assistant */}
                <div className={styles.section}>
                    <ManualAssistant
                        initialRoles={initialRoles}
                        detectedRoles={detectedRoles}
                        onGenerate={handleManualGenerate}
                        onApplyAll={handleBrandSuggestAll}
                    />
                </div>

                {/* Organisasjonsnavn */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Organisasjon</h2>
                        <p className={styles.sectionDesc}>Navnet som vises i sidebaren, dashboardet og andre steder i plattformen.</p>
                    </div>
                    <div className={styles.nameFieldWrapper}>
                        <label className={styles.label} htmlFor="tenantName">Organisasjonsnavn</label>
                        <input
                            id="tenantName"
                            type="text"
                            className={styles.nameInput}
                            value={tenantName}
                            onChange={(e) => setTenantName(e.target.value)}
                            placeholder="Skriv inn organisasjonsnavn"
                            minLength={2}
                            maxLength={100}
                        />
                    </div>
                </div>

                {SECTIONS.map((section) => (
                    <div key={section.title} className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>{section.title}</h2>
                            <p className={styles.sectionDesc}>{section.description}</p>
                        </div>
                        <div className={styles.fieldsGrid}>
                            {section.fields.map((field) => (
                                <ColorField
                                    key={field.key}
                                    fieldKey={field.key}
                                    label={field.label}
                                    hint={field.hint}
                                    value={colors[field.key] || ''}
                                    defaultValue={DEFAULTS[field.key] || '#000000'}
                                    contrastValue={
                                        field.contrastAgainst
                                            ? resolveColor(field.contrastAgainst)
                                            : undefined
                                    }
                                    onChange={handleColorChange}
                                    tip={getTipForField(field.key)}
                                />
                            ))}
                        </div>
                    </div>
                ))}

                {/* Logo */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Logo</h2>
                        <p className={styles.sectionDesc}>Last opp organisasjonens logo. SVG-filer lar deg endre farger direkte.</p>
                    </div>
                    <LogoUploader
                        variant="logo"
                        currentUrl={logoUrl}
                        currentSvgContent={logoSvgContent}
                        currentSvgModified={logoSvgModified}
                        bgColor={resolveColor('colorSidebarBg')}
                        onFileChange={(url, svgContent, svgModified) => {
                            setLogoUrl(url);
                            setLogoSvgContent(svgContent);
                            setLogoSvgModified(svgModified);
                        }}
                    />
                </div>

                {/* Favicon */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Favicon</h2>
                        <p className={styles.sectionDesc}>Nettleserikonet for plattformen. SVG-favicons støtter fargeredigering.</p>
                    </div>
                    <LogoUploader
                        variant="favicon"
                        currentUrl={faviconUrl}
                        currentSvgContent={faviconSvgContent}
                        currentSvgModified={faviconSvgModified}
                        bgColor={resolveColor('colorBgPrimary')}
                        onFileChange={(url, svgContent, svgModified) => {
                            setFaviconUrl(url);
                            setFaviconSvgContent(svgContent);
                            setFaviconSvgModified(svgModified);
                        }}
                    />
                </div>

                {/* Typografi */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Typografi</h2>
                        <p className={styles.sectionDesc}>Velg fonter for overskrifter og brødtekst. Anbefalt: maks 2 fonter for best ytelse og lesbarhet.</p>
                    </div>
                    <div className={styles.fontDualSection}>
                        <div className={styles.fontSlot}>
                            <span className={styles.fontSlotLabel}>Overskrifter (h1-h3)</span>
                            <FontPicker
                                currentFont={fontHeading}
                                currentSource={fontSource}
                                customFontUrl=""
                                onFontChange={(font, source, _url) => {
                                    setFontHeading(font);
                                    setFontSource(source);
                                }}
                            />
                        </div>
                        <div className={styles.fontSlot}>
                            <span className={styles.fontSlotLabel}>Brødtekst</span>
                            <FontPicker
                                currentFont={fontFamily}
                                currentSource={fontSource}
                                customFontUrl={customFontUrl}
                                onFontChange={(font, source, url) => {
                                    setFontFamily(font);
                                    setFontSource(source);
                                    setCustomFontUrl(url);
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Melding */}
                {message.text && (
                    <div className={message.type === 'success' ? styles.successCard : styles.errorCard}>
                        {message.type === 'success' && <Check size={16} />}
                        {message.type === 'error' && <AlertTriangle size={16} />}
                        <span>{message.text}</span>
                    </div>
                )}

                {/* Tilbakestill-knapp (alltid synlig) */}
                {hasCustomValues && (
                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.resetButton}
                            onClick={() => setShowResetConfirm(true)}
                            disabled={resetting}
                        >
                            <RotateCcw size={16} />
                            {resetting ? 'Tilbakestiller...' : 'Tilbakestill alt til standard'}
                        </button>
                    </div>
                )}

                {/* Sticky save/revert bar */}
                {hasUnsavedChanges && (
                    <div className={styles.stickyBar}>
                        <div className={styles.stickyBarContent}>
                            <span className={styles.stickyBarText}>
                                <AlertTriangle size={14} />
                                Du har ulagrede endringer
                            </span>
                            <div className={styles.stickyBarActions}>
                                <button
                                    type="button"
                                    className={styles.stickyRevertButton}
                                    onClick={handleRevert}
                                >
                                    <RotateCcw size={14} />
                                    Angre
                                </button>
                                <button
                                    type="submit"
                                    className={styles.stickySaveButton}
                                    disabled={loading}
                                >
                                    <Save size={14} />
                                    {loading ? 'Lagrer...' : 'Lagre endringer'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </form>

            {/* Tilbakestill-dialog */}
            <ConfirmDialog
                open={showResetConfirm}
                variant="danger"
                title="Tilbakestill all branding?"
                description="Alle farger, logo, favicon og typografi tilbakestilles til standardverdiene. Denne handlingen kan ikke angres."
                confirmText="Ja, tilbakestill alt"
                cancelText="Avbryt"
                onConfirm={handleReset}
                onCancel={() => setShowResetConfirm(false)}
            />

            {/* Høyre: Live forhåndsvisning */}
            <div className={styles.previewPanel}>
                <div className={styles.previewHeader}>
                    {faviconUrl && (
                        <img
                            src={faviconUrl}
                            alt=""
                            className={styles.previewFavicon}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    )}
                    <Eye size={16} />
                    <span>Live forhåndsvisning</span>
                    <button
                        type="button"
                        className={styles.previewToggle}
                        onClick={() => setShowPreview(!showPreview)}
                    >
                        {showPreview ? 'Skjul' : 'Vis'}
                    </button>
                </div>

                {showPreview && (
                    <div
                        className={styles.previewContainer}
                        style={{
                            backgroundColor: resolveColor('colorBgPrimary'),
                            color: resolveColor('colorTextPrimary'),
                            fontFamily: fontFamily || undefined,
                        }}
                    >
                        {/* Mini sidebar */}
                        <div className={styles.previewSidebar} style={{ backgroundColor: resolveColor('colorSidebarBg') }}>
                            {(logoUrl || logoSvgContent) && (
                                <img
                                    src={
                                        logoSvgModified
                                            ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(logoSvgModified)))}`
                                            : logoSvgContent
                                                ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(logoSvgContent)))}`
                                                : logoUrl
                                    }
                                    alt="Logo"
                                    className={styles.previewLogo}
                                />
                            )}
                            <div
                                className={styles.previewNavItem}
                                style={{ color: resolveColor('colorSidebarActive'), borderLeft: `2px solid ${resolveColor('colorSidebarActive')}` }}
                            >
                                Dashboard
                            </div>
                            <div className={styles.previewNavItem} style={{ color: resolveColor('colorSidebarText') }}>
                                Brukere
                            </div>
                            <div className={styles.previewNavItem} style={{ color: resolveColor('colorSidebarText') }}>
                                Kurs
                            </div>
                        </div>

                        {/* Mini main content */}
                        <div className={styles.previewMain}>
                            <h3 style={{ color: resolveColor('colorTextPrimary'), margin: '0 0 4px 0', fontSize: '14px', fontFamily: fontHeading || fontFamily || undefined }}>
                                Oversikt
                            </h3>
                            <p style={{ color: resolveColor('colorTextSecondary'), margin: '0 0 12px 0', fontSize: '11px' }}>
                                Sanntidsdata for din organisasjon
                            </p>

                            {/* Mini stat cards */}
                            <div className={styles.previewStats}>
                                <div
                                    className={styles.previewStatCard}
                                    style={{
                                        backgroundColor: resolveColor('colorBgSecondary'),
                                        border: `1px solid ${resolveColor('colorBorder')}`,
                                    }}
                                >
                                    <span style={{ color: resolveColor('colorTextSecondary'), fontSize: '9px' }}>Brukere</span>
                                    <span style={{ color: resolveColor('colorTextPrimary'), fontSize: '16px', fontWeight: 600 }}>42</span>
                                </div>
                                <div
                                    className={styles.previewStatCard}
                                    style={{
                                        backgroundColor: resolveColor('colorBgSecondary'),
                                        border: `1px solid ${resolveColor('colorBorder')}`,
                                    }}
                                >
                                    <span style={{ color: resolveColor('colorTextSecondary'), fontSize: '9px' }}>Fristbrudd</span>
                                    <span style={{ color: resolveColor('colorDanger'), fontSize: '16px', fontWeight: 600 }}>2</span>
                                </div>
                            </div>

                            {/* Button preview */}
                            <div className={styles.previewButtons}>
                                <button
                                    type="button"
                                    className={styles.previewBtn}
                                    style={{
                                        backgroundColor: resolveColor('colorButtonPrimary'),
                                        color: resolveColor('colorButtonText'),
                                    }}
                                >
                                    Hovedknapp
                                </button>
                                <a
                                    href="#"
                                    onClick={(e) => e.preventDefault()}
                                    style={{ color: resolveColor('colorAccent'), fontSize: '12px' }}
                                >
                                    Lenketekst
                                </a>
                            </div>

                            {/* Status badges */}
                            <div className={styles.previewBadges}>
                                <span className={styles.previewBadgeItem} style={{ backgroundColor: `${resolveColor('colorSuccess')}20`, color: resolveColor('colorSuccess'), border: `1px solid ${resolveColor('colorSuccess')}40` }}>
                                    Suksess
                                </span>
                                <span className={styles.previewBadgeItem} style={{ backgroundColor: `${resolveColor('colorWarning')}20`, color: resolveColor('colorWarning'), border: `1px solid ${resolveColor('colorWarning')}40` }}>
                                    Advarsel
                                </span>
                                <span className={styles.previewBadgeItem} style={{ backgroundColor: `${resolveColor('colorDanger')}20`, color: resolveColor('colorDanger'), border: `1px solid ${resolveColor('colorDanger')}40` }}>
                                    Feil
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
