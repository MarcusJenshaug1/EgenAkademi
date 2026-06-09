'use client';

import { useState, useMemo, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { updateBranding, resetBranding } from '@/app/actions/brandingActions';
import {
    RotateCcw, Check, AlertTriangle, Eye, Save, Tag, Wand2, Maximize2, X,
    LayoutDashboard, Users, UsersRound, Shield, BookOpen, Calendar, Files,
    Palette, Plug, BarChart3, HelpCircle, CheckCircle2, LogIn,
} from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import styles from './branding.module.css';
import LogoUploader from './LogoUploader';
import FontPicker from './FontPicker';
import BrandDetector from './BrandDetector';
import ManualAssistant from './ManualAssistant';
import TemplateSelector from './TemplateSelector';
import ColorFieldTip, { type TipData } from './ColorFieldTip';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
    contrastRatio,
    getContrastLevel,
    normalizeHexInput,
    ensureContrast,
} from '@/lib/colorUtils';
import { buildBrandingVars } from '@/lib/brandingVars';
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
        description: 'Lagene som alt annet hviler på — fra hele siden ned til enkeltkort.',
        fields: [
            { key: 'colorBgPrimary', label: 'Sidebakgrunn', hint: 'Den dypeste bakgrunnsfargen bak hele innholdsområdet.' },
            { key: 'colorBgSecondary', label: 'Kort og paneler', hint: 'Bakgrunn for kort, paneler, modaler og dropdowns som ligger oppå hovedbakgrunnen.' },
        ],
    },
    {
        title: 'Tekst',
        description: 'Tekstfargene. Kontrasten mot bakgrunnen sjekkes automatisk (WCAG AA).',
        fields: [
            { key: 'colorTextPrimary', label: 'Hovedtekst', hint: 'Overskrifter og brødtekst — den teksten øynene leser mest.', contrastAgainst: 'colorBgPrimary' },
            { key: 'colorTextSecondary', label: 'Dempet tekst', hint: 'Etiketter, hjelpetekst, metadata og mindre viktig informasjon.', contrastAgainst: 'colorBgPrimary' },
        ],
    },
    {
        title: 'Rammer og skillelinjer',
        description: 'De tynne linjene som avgrenser og strukturerer grensesnittet.',
        fields: [
            { key: 'colorBorder', label: 'Kantlinjer', hint: 'Rammer rundt kort og inputfelter, samt skillelinjer mellom seksjoner.' },
        ],
    },
    {
        title: 'Merkevarefarge',
        description: 'Signaturfargen som binder grensesnittet til merkevaren din.',
        fields: [
            { key: 'colorAccent', label: 'Merkevarefarge', hint: 'Lenker, fokusring og valgte elementer.', contrastAgainst: 'colorBgPrimary' },
        ],
    },
    {
        title: 'Knapper',
        description: 'Utseendet på de viktigste handlingsknappene.',
        fields: [
            { key: 'colorButtonPrimary', label: 'Knappefarge', hint: 'Fyllfargen bak primærknapper som «Lagre» og «Opprett».' },
            { key: 'colorButtonText', label: 'Knappetekst', hint: 'Teksten oppå primærknapper.', contrastAgainst: 'colorButtonPrimary' },
        ],
    },
    {
        title: 'Sidemeny',
        description: 'Navigasjonspanelet til venstre i admin-grensesnittet.',
        fields: [
            { key: 'colorSidebarBg', label: 'Menybakgrunn', hint: 'Bakgrunnsflaten bak hele sidemenyen.' },
            { key: 'colorSidebarText', label: 'Menytekst', hint: 'Tekst på menypunkter som ikke er valgt.', contrastAgainst: 'colorSidebarBg' },
            { key: 'colorSidebarActive', label: 'Aktivt menypunkt', hint: 'Markeringen av siden du står på akkurat nå.', contrastAgainst: 'colorSidebarBg' },
        ],
    },
    {
        title: 'Statusfarger',
        description: 'Signalfargene som forteller om noe gikk bra, krever oppmerksomhet eller feilet.',
        fields: [
            { key: 'colorSuccess', label: 'Suksess', hint: 'Bekreftelser og vellykkede handlinger.' },
            { key: 'colorWarning', label: 'Advarsel', hint: 'Advarsler, påminnelser og ting som nærmer seg en frist.' },
            { key: 'colorDanger', label: 'Feil', hint: 'Feilmeldinger og destruktive handlinger som sletting.' },
        ],
    },
];

// Norsk visningsnavn per fargefelt — brukes i previewens etiketter og kontrastbanneret.
const FIELD_LABELS: Record<string, string> = {};
for (const section of SECTIONS) {
    for (const field of section.fields) {
        FIELD_LABELS[field.key] = field.label;
    }
}

// Hvilken bakgrunn hvert felt sjekkes mot (for kontrastbanneret).
const CONTRAST_AGAINST: Record<string, string> = {};
for (const section of SECTIONS) {
    for (const field of section.fields) {
        if (field.contrastAgainst) CONTRAST_AGAINST[field.key] = field.contrastAgainst;
    }
}

// -- Kontrastberegning importert fra @/lib/colorUtils --

// -- Normaliser farge-input importert fra @/lib/colorUtils --

function isValidHex6(v: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(v);
}

// -- Fargefelt-komponent med react-colorful --
function ColorField({
    fieldKey, label, hint, value, defaultValue, contrastValue, onChange, tip, onHighlight, onAutoFix,
}: {
    fieldKey: string;
    label: string;
    hint: string;
    value: string;
    defaultValue: string;
    contrastValue?: string;
    onChange: (key: string, val: string) => void;
    tip?: TipData | null;
    onHighlight?: (fields: string[] | null) => void;
    onAutoFix?: (fieldKey: string) => void;
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
        <div
            className={styles.colorField}
            onMouseEnter={() => onHighlight?.([fieldKey])}
            onMouseLeave={() => onHighlight?.(null)}
            onFocusCapture={() => onHighlight?.([fieldKey])}
            onBlurCapture={() => onHighlight?.(null)}
        >
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
                <div className={styles.contrastRow}>
                    <div className={`${styles.contrastBadge} ${styles[`contrast_${contrast.level}`]}`}>
                        {contrast.level === 'pass' && <Check size={12} />}
                        {contrast.level === 'warn' && <AlertTriangle size={12} />}
                        {contrast.level === 'fail' && <AlertTriangle size={12} />}
                        <span>{contrast.label}</span>
                    </div>
                    {contrast.level !== 'pass' && contrastValue && onAutoFix && (
                        <button
                            type="button"
                            className={styles.fixContrastButton}
                            onClick={() => onAutoFix(fieldKey)}
                            title="Juster fargen automatisk til lesbar kontrast"
                        >
                            <Wand2 size={12} />
                            <span>Fiks kontrast</span>
                        </button>
                    )}
                </div>
            )}
            <span className={styles.hint}>{hint}</span>
        </div>
    );
}

// -- Preview-region: rammer inn en del av previewen og kobler den til feltet(ene) som styrer den --
function PreviewRegion({
    fields, label, highlight, showLabels, onHover, onRegionClick, children, className,
}: {
    fields: string[];
    label: string;
    highlight: string[] | null;
    showLabels: boolean;
    onHover: (fields: string[] | null) => void;
    onRegionClick?: (field: string) => void;
    children: ReactNode;
    className?: string;
}) {
    const isHighlighted =
        !!highlight && highlight.some((h) => fields.includes(h));
    const showLabel = isHighlighted || showLabels;
    const clickable = !!onRegionClick;

    // onMouseOver BOBLER (i motsetning til onMouseEnter), så stopPropagation lar
    // den innerste regionen under markøren «vinne» — ingen flimring mellom nestede
    // regioner. Root-containeren nullstiller highlight når markøren forlater hele
    // previewen (onMouseLeave på root).
    return (
        <div
            className={`${styles.previewRegion} ${isHighlighted ? styles.previewRegionActive : ''} ${showLabels ? styles.previewRegionShowLabel : ''} ${clickable ? styles.previewRegionClickable : ''} ${className || ''}`}
            onMouseOver={(e) => { e.stopPropagation(); onHover(fields); }}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? (e) => { e.stopPropagation(); onRegionClick(fields[0]); } : undefined}
            onKeyDown={
                clickable
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              onRegionClick(fields[0]);
                          }
                      }
                    : undefined
            }
        >
            {showLabel && <span className={styles.previewRegionLabel}>{label}</span>}
            {children}
        </div>
    );
}

// -- Gjenbrukbar preview-mini-app: én sannhetskilde for både sidepanelet og fullskjerm --
function BrandingPreview({
    previewVars, resolve, logoUrl, logoSvgContent, logoSvgModified,
    fontFamily, fontHeading, highlight, showLabels, onHover, onRegionClick, large,
    tenantName,
}: {
    previewVars: React.CSSProperties;
    resolve: (key: string) => string;
    logoUrl: string;
    logoSvgContent: string;
    logoSvgModified: string;
    fontFamily: string;
    fontHeading: string;
    highlight: string[] | null;
    showLabels: boolean;
    onHover: (f: string[] | null) => void;
    onRegionClick?: (field: string) => void;
    large?: boolean;
    tenantName: string;
}) {
    // resolve/fontFamily/fontHeading er en del av kontrakten (sikrer at kallere alltid
    // sender resolverte verdier); previewVars bærer de faktiske CSS-variablene.
    void resolve;
    void fontFamily;
    void fontHeading;

    const logoSrc = logoSvgModified
        ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(logoSvgModified)))}`
        : logoSvgContent
            ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(logoSvgContent)))}`
            : logoUrl;
    const hasLogo = !!(logoUrl || logoSvgContent);
    const displayName = tenantName || 'Din organisasjon';
    const initials = displayName
        .split(/\s+/)
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'EA';

    return (
        <div
            className={`${styles.previewRoot} ${large ? styles.previewRootLarge : ''}`}
            style={{ ...previewVars }}
            onMouseLeave={() => onHover(null)}
        >
            <div className={styles.previewApp}>
                {/* ── Sidemeny (speiler den ekte admin-sidebaren) ── */}
                <PreviewRegion
                    fields={['colorSidebarBg']}
                    label="Sidebar"
                    highlight={highlight}
                    showLabels={showLabels}
                    onHover={onHover}
                    onRegionClick={onRegionClick}
                    className={styles.previewSidebar}
                >
                    <div className={styles.previewSidebarHeader}>
                        {hasLogo ? (
                            <img src={logoSrc} alt="Logo" className={styles.previewLogo} />
                        ) : (
                            <span className={styles.previewSidebarBrand}>{displayName}</span>
                        )}
                    </div>

                    <nav className={styles.previewNav}>
                        {/* Aktivt menypunkt: Dashboard */}
                        <PreviewRegion
                            fields={['colorSidebarActive']}
                            label="Aktivt menypunkt"
                            highlight={highlight}
                            showLabels={showLabels}
                            onHover={onHover}
                            onRegionClick={onRegionClick}
                        >
                            <div className={`${styles.previewNavItem} ${styles.previewNavItemActive}`}>
                                <LayoutDashboard className={styles.previewNavIcon} aria-hidden="true" />
                                <span>Dashboard</span>
                            </div>
                        </PreviewRegion>

                        <div className={styles.previewNavSection}>Brukere &amp; Tilgang</div>

                        {/* Normale menypunkter (sidebar-tekst) */}
                        <PreviewRegion
                            fields={['colorSidebarText']}
                            label="Sidebar-tekst"
                            highlight={highlight}
                            showLabels={showLabels}
                            onHover={onHover}
                            onRegionClick={onRegionClick}
                        >
                            <div className={styles.previewNavItem}>
                                <Users className={styles.previewNavIcon} aria-hidden="true" />
                                <span>Brukere</span>
                            </div>
                        </PreviewRegion>

                        {/* Permanent hover-tilstand: Grupper */}
                        <PreviewRegion
                            fields={['colorSidebarText']}
                            label="Sidebar hover"
                            highlight={highlight}
                            showLabels={showLabels}
                            onHover={onHover}
                            onRegionClick={onRegionClick}
                        >
                            <div className={`${styles.previewNavItem} ${styles.previewNavItemHover}`}>
                                <UsersRound className={styles.previewNavIcon} aria-hidden="true" />
                                <span>Grupper</span>
                                <span className={styles.previewStateTag}>hover</span>
                            </div>
                        </PreviewRegion>

                        <div className={styles.previewNavItem}>
                            <Shield className={styles.previewNavIcon} aria-hidden="true" />
                            <span>Roller</span>
                        </div>

                        <div className={styles.previewNavSection}>Læring</div>
                        <div className={styles.previewNavItem}>
                            <BookOpen className={styles.previewNavIcon} aria-hidden="true" />
                            <span>Kurs</span>
                        </div>
                        <div className={styles.previewNavItem}>
                            <Calendar className={styles.previewNavIcon} aria-hidden="true" />
                            <span>Sesjoner</span>
                        </div>
                        <div className={styles.previewNavItem}>
                            <Files className={styles.previewNavIcon} aria-hidden="true" />
                            <span>Innhold</span>
                        </div>

                        <div className={styles.previewNavSection}>Plattform</div>
                        <div className={styles.previewNavItem}>
                            <Palette className={styles.previewNavIcon} aria-hidden="true" />
                            <span>Branding</span>
                        </div>
                        <div className={styles.previewNavItem}>
                            <Plug className={styles.previewNavIcon} aria-hidden="true" />
                            <span>Integrasjoner</span>
                        </div>
                        <div className={styles.previewNavItem}>
                            <BarChart3 className={styles.previewNavIcon} aria-hidden="true" />
                            <span>Rapporter</span>
                        </div>
                    </nav>
                </PreviewRegion>

                {/* ── Hovedområde (topbar + dashboard) ── */}
                <div className={styles.previewMainContent}>
                    {/* Topbar */}
                    <PreviewRegion
                        fields={['colorBgPrimary', 'colorTextPrimary']}
                        label="Topbar (avledet)"
                        highlight={highlight}
                        showLabels={showLabels}
                        onHover={onHover}
                        onRegionClick={onRegionClick}
                        className={styles.previewTopbar}
                    >
                        <span className={styles.previewTopbarTitle}>Administrasjon</span>
                        <div className={styles.previewTopbarRight}>
                            <span className={styles.previewHelpPill}>
                                <HelpCircle className={styles.previewTopbarIcon} aria-hidden="true" />
                                <span>Hjelp</span>
                            </span>
                            <span className={styles.previewAvatar} aria-hidden="true">{initials}</span>
                        </div>
                    </PreviewRegion>

                    {/* Dashboard-innhold */}
                    <PreviewRegion
                        fields={['colorBgPrimary']}
                        label="Hovedbakgrunn"
                        highlight={highlight}
                        showLabels={showLabels}
                        onHover={onHover}
                        onRegionClick={onRegionClick}
                        className={styles.previewMain}
                    >
                        <div className={styles.previewDashHeader}>
                            <PreviewRegion
                                fields={['colorTextPrimary']}
                                label="Hovedtekst"
                                highlight={highlight}
                                showLabels={showLabels}
                                onHover={onHover}
                                onRegionClick={onRegionClick}
                            >
                                <h3 className={styles.previewHeading}>Oversikt</h3>
                            </PreviewRegion>
                            <PreviewRegion
                                fields={['colorTextSecondary']}
                                label="Sekundærtekst"
                                highlight={highlight}
                                showLabels={showLabels}
                                onHover={onHover}
                                onRegionClick={onRegionClick}
                            >
                                <p className={styles.previewLead}>
                                    Sanntidsdata for {displayName}
                                </p>
                            </PreviewRegion>
                        </div>

                        {/* Advarselstripe */}
                        <PreviewRegion
                            fields={['colorWarning']}
                            label="Advarsel"
                            highlight={highlight}
                            showLabels={showLabels}
                            onHover={onHover}
                            onRegionClick={onRegionClick}
                            className={styles.previewWarningStrip}
                        >
                            <AlertTriangle className={styles.previewWarningIcon} aria-hidden="true" />
                            <span>2 fristbrudd krever oppfølging</span>
                        </PreviewRegion>

                        {/* Statistikk-kort (2x2 / 4-kolonner) */}
                        <PreviewRegion
                            fields={['colorBgSecondary', 'colorBorder']}
                            label="Kort og rammer"
                            highlight={highlight}
                            showLabels={showLabels}
                            onHover={onHover}
                            onRegionClick={onRegionClick}
                            className={styles.previewStatsGrid}
                        >
                            <div className={styles.previewStatCard}>
                                <span className={styles.previewStatLabel}>Aktive Brukere</span>
                                <span className={styles.previewStatValue}>42</span>
                            </div>
                            <div className={styles.previewStatCard}>
                                <span className={styles.previewStatLabel}>Pågående Tildelinger</span>
                                <span className={styles.previewStatValue}>18</span>
                            </div>
                            <div className={styles.previewStatCard}>
                                <span className={styles.previewStatLabel}>Fristbrudd</span>
                                <PreviewRegion
                                    fields={['colorDanger']}
                                    label="Feil"
                                    highlight={highlight}
                                    showLabels={showLabels}
                                    onHover={onHover}
                                    onRegionClick={onRegionClick}
                                >
                                    <span className={styles.previewStatValueDanger}>2</span>
                                </PreviewRegion>
                            </div>
                            <div className={styles.previewStatCard}>
                                <span className={styles.previewStatLabel}>Fullføringsgrad</span>
                                <PreviewRegion
                                    fields={['colorSuccess']}
                                    label="Suksess"
                                    highlight={highlight}
                                    showLabels={showLabels}
                                    onHover={onHover}
                                    onRegionClick={onRegionClick}
                                >
                                    <span className={styles.previewStatValueSuccess}>84%</span>
                                </PreviewRegion>
                            </div>
                        </PreviewRegion>

                        {/* Innholdsgrid: to paneler */}
                        <div className={styles.previewContentGrid}>
                            <div className={styles.previewDashPanel}>
                                <h4 className={styles.previewDashPanelTitle}>Nylige hendelser</h4>
                                <div className={styles.previewEventList}>
                                    <div className={styles.previewEventRow}>
                                        <span className={styles.previewEventIcon}>
                                            <CheckCircle2 className={styles.previewEventIconSuccess} aria-hidden="true" />
                                        </span>
                                        <div className={styles.previewEventDetails}>
                                            <span className={styles.previewEventTitle}>
                                                Ola Nordmann fullførte &quot;Sikkerhet OHS&quot;
                                            </span>
                                            <span className={styles.previewEventMeta}>For 2 timer siden</span>
                                        </div>
                                    </div>
                                    <div className={styles.previewEventRow}>
                                        <span className={styles.previewEventIcon}>
                                            <LogIn className={styles.previewEventIconMuted} aria-hidden="true" />
                                        </span>
                                        <div className={styles.previewEventDetails}>
                                            <span className={styles.previewEventTitle}>
                                                Kari Svendsen logget inn
                                            </span>
                                            <span className={styles.previewEventMeta}>For 4 timer siden</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.previewDashPanel}>
                                <h4 className={styles.previewDashPanelTitle}>Hurtighandlinger</h4>
                                <div className={styles.previewActionList}>
                                    <PreviewRegion
                                        fields={['colorButtonPrimary', 'colorButtonText']}
                                        label="Primærknapp"
                                        highlight={highlight}
                                        showLabels={showLabels}
                                        onHover={onHover}
                                        onRegionClick={onRegionClick}
                                    >
                                        <button type="button" className={styles.previewBtnPrimary}>
                                            <Users className={styles.previewBtnIcon} aria-hidden="true" />
                                            Administrer brukere
                                        </button>
                                    </PreviewRegion>
                                    <PreviewRegion
                                        fields={['colorAccent']}
                                        label="Merkevarefarge / lenke"
                                        highlight={highlight}
                                        showLabels={showLabels}
                                        onHover={onHover}
                                        onRegionClick={onRegionClick}
                                    >
                                        <button type="button" className={styles.previewBtnGhost}>
                                            <BookOpen className={styles.previewBtnIcon} aria-hidden="true" />
                                            Opprett kurs
                                        </button>
                                    </PreviewRegion>
                                </div>
                            </div>
                        </div>
                    </PreviewRegion>
                </div>
            </div>
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

    // ── Preview-kobling: hvilke felt som er uthevet, og om alle etiketter vises ──
    const [highlight, setHighlight] = useState<string[] | null>(null);
    const [showLabels, setShowLabels] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);

    // ── Fullskjerm-preview ──────────────────────────────────────
    const [fullscreen, setFullscreen] = useState(false);
    const [selectedField, setSelectedField] = useState<string | null>(null);

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

    // Auto-juster én farge til lesbar kontrast (>= 4.5:1) mot sin referansebakgrunn.
    const handleAutoFix = useCallback((field: string) => {
        const against = CONTRAST_AGAINST[field];
        if (!against) return;
        const current = colors[field] || DEFAULTS[field] || '#000000';
        const bg = colors[against] || DEFAULTS[against] || '#000000';
        if (!isValidHex6(current) || !isValidHex6(bg)) return;
        const fixed = ensureContrast(current, bg, 4.5);
        setColors(prev => ({ ...prev, [field]: fixed }));
        setDismissedTipFields(prev => {
            const next = new Set(prev);
            next.add(field);
            return next;
        });
    }, [colors]);

    // Resolvert fargeobjekt (alle 14 + font) → bygg de samme CSS-variablene som produksjon bruker.
    const previewVars = useMemo(() => {
        const resolved: Record<string, string> = {};
        for (const key of Object.keys(DEFAULTS)) {
            resolved[key] = colors[key] || DEFAULTS[key];
        }
        const heading = fontHeading || fontFamily;
        return buildBrandingVars({
            ...resolved,
            fontFamily: fontFamily || heading || undefined,
        });
    }, [colors, fontFamily, fontHeading]);

    // Felter som per nå feiler kontrastkravet (WCAG AA) — driver varselbanneret.
    const failingFields = useMemo(() => {
        const fails: string[] = [];
        for (const [field, against] of Object.entries(CONTRAST_AGAINST)) {
            const fg = colors[field] || DEFAULTS[field] || '#000000';
            const bg = colors[against] || DEFAULTS[against] || '#000000';
            if (!isValidHex6(fg) || !isValidHex6(bg)) continue;
            try {
                if (getContrastLevel(contrastRatio(fg, bg)).level === 'fail') {
                    fails.push(field);
                }
            } catch {
                /* hopp over ugyldige verdier */
            }
        }
        return fails;
    }, [colors]);

    function handleFixAll() {
        setColors(prev => {
            const next = { ...prev };
            for (const field of failingFields) {
                const against = CONTRAST_AGAINST[field];
                if (!against) continue;
                const current = next[field] || DEFAULTS[field] || '#000000';
                const bg = next[against] || DEFAULTS[against] || '#000000';
                if (!isValidHex6(current) || !isValidHex6(bg)) continue;
                next[field] = ensureContrast(current, bg, 4.5);
            }
            return next;
        });
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

    // Ctrl/Cmd+S lagrer skjemaet (kun når det finnes ulagrede endringer).
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (hasUnsavedChanges && !loading) {
                    formRef.current?.requestSubmit();
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hasUnsavedChanges, loading]);

    // Fullskjerm: lukk på Escape og lås body-scroll mens overlayet er åpent.
    useEffect(() => {
        if (!fullscreen) return;
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                e.preventDefault();
                setFullscreen(false);
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [fullscreen]);

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

    // Bygg de 5 rollefargene fra gjeldende skjematilstand (med standardverdier som fallback).
    function rolesFromForm(): BrandingRoles {
        const resolve = (key: string) => colors[key] || DEFAULTS[key] || '#000000';
        return {
            brand: resolve('colorAccent'),
            bgPrimary: resolve('colorBgPrimary'),
            bgSecondary: resolve('colorBgSecondary'),
            textPrimary: resolve('colorTextPrimary'),
            sidebarBg: resolve('colorSidebarBg'),
        };
    }

    // Velg en oppdaget farge som aksent: avled en full, kontrastsikker palett
    // rundt den valgte fargen og legg den inn i skjemaet via den vanlige flyten.
    function handlePickAccent(hex: string) {
        const roles: BrandingRoles = { ...rolesFromForm(), brand: hex };
        const result = deriveBrandingSuggestionsFromRoles(roles, 'standard');
        handleBrandSuggestAll(result.suggestions);
    }

    // Bytt lys/mørk modus: behold valgt aksent, men bruk nøytrale bakgrunner/tekst
    // for modusen, og avled resten av paletten kontrastsikkert.
    function handleSetMode(mode: 'light' | 'dark') {
        const accent = colors.colorAccent || DEFAULTS.colorAccent || '#000000';
        const roles: BrandingRoles =
            mode === 'light'
                ? {
                      brand: accent,
                      bgPrimary: '#ffffff',
                      bgSecondary: '#f4f4f5',
                      textPrimary: '#111111',
                      sidebarBg: '#111111',
                  }
                : {
                      brand: accent,
                      bgPrimary: '#0a0a0a',
                      bgSecondary: '#15151a',
                      textPrimary: '#f5f5f5',
                      sidebarBg: '#0a0a0a',
                  };
        const result = deriveBrandingSuggestionsFromRoles(roles, 'standard');
        handleBrandSuggestAll(result.suggestions);
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
            <form ref={formRef} action={handleSubmit} className={styles.form}>
                {/* URL Brand Detector */}
                <div className={styles.section}>
                    <BrandDetector
                        onApplyAll={handleBrandSuggestAll}
                        onApplyFavicon={handleBrandFavicon}
                        onApplyLogo={handleBrandLogo}
                        onApplyFont={handleBrandFont}
                        onDetectionComplete={handleDetectionComplete}
                        onPickAccent={handlePickAccent}
                        onSetMode={handleSetMode}
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

                {/* Ferdige maler */}
                <div className={styles.section}>
                    <TemplateSelector
                        currentColors={colors}
                        defaults={DEFAULTS}
                        onApply={handleBrandSuggestAll}
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

                {/* Kontrastvarsel: vises kun når minst ett felt feiler WCAG AA */}
                {failingFields.length > 0 && (
                    <div className={styles.contrastBanner}>
                        <div className={styles.contrastBannerIcon}>
                            <AlertTriangle size={18} />
                        </div>
                        <div className={styles.contrastBannerBody}>
                            <strong className={styles.contrastBannerTitle}>
                                {failingFields.length === 1
                                    ? '1 farge har for lav kontrast'
                                    : `${failingFields.length} farger har for lav kontrast`}
                            </strong>
                            <p className={styles.contrastBannerText}>
                                Disse fargene er vanskelige å lese (under WCAG AA):{' '}
                                {failingFields.map((f) => FIELD_LABELS[f] || f).join(', ')}.
                            </p>
                        </div>
                        <button
                            type="button"
                            className={styles.contrastBannerButton}
                            onClick={handleFixAll}
                        >
                            <Wand2 size={14} />
                            Fiks alle
                        </button>
                    </div>
                )}

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
                                    onHighlight={setHighlight}
                                    onAutoFix={field.contrastAgainst ? handleAutoFix : undefined}
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
                    <div className={styles.previewHeaderActions}>
                        <button
                            type="button"
                            className={`${styles.previewLabelToggle} ${showLabels ? styles.previewLabelToggleActive : ''}`}
                            onClick={() => setShowLabels((v) => !v)}
                            aria-pressed={showLabels}
                            title="Vis hvilke felt som styrer hver region"
                        >
                            <Tag size={12} />
                            Vis etiketter
                        </button>
                        <button
                            type="button"
                            className={styles.previewLabelToggle}
                            onClick={() => setFullscreen(true)}
                            title="Åpne forhåndsvisning i fullskjerm og rediger farger direkte"
                        >
                            <Maximize2 size={12} />
                            Fullskjerm
                        </button>
                        <button
                            type="button"
                            className={styles.previewToggle}
                            onClick={() => setShowPreview(!showPreview)}
                        >
                            {showPreview ? 'Skjul' : 'Vis'}
                        </button>
                    </div>
                </div>

                {showPreview && (
                    <BrandingPreview
                        previewVars={previewVars as React.CSSProperties}
                        resolve={resolveColor}
                        logoUrl={logoUrl}
                        logoSvgContent={logoSvgContent}
                        logoSvgModified={logoSvgModified}
                        fontFamily={fontFamily}
                        fontHeading={fontHeading}
                        highlight={highlight}
                        showLabels={showLabels}
                        onHover={setHighlight}
                        tenantName={tenantName}
                    />
                )}
            </div>

            {/* Fullskjerm-preview med direkte fargeredigering */}
            {fullscreen && (
                <div className={styles.fullscreenOverlay} role="dialog" aria-modal="true" aria-label="Forhåndsvisning i fullskjerm">
                    <div className={styles.fsHeader}>
                        <Eye size={18} />
                        <span className={styles.fsTitle}>Forhåndsvisning</span>
                        <div className={styles.fsHeaderActions}>
                            <button
                                type="button"
                                className={`${styles.previewLabelToggle} ${showLabels ? styles.previewLabelToggleActive : ''}`}
                                onClick={() => setShowLabels((v) => !v)}
                                aria-pressed={showLabels}
                                title="Vis hvilke felt som styrer hver region"
                            >
                                <Tag size={12} />
                                Vis etiketter
                            </button>
                            <button
                                type="button"
                                className={styles.fsCloseButton}
                                onClick={() => setFullscreen(false)}
                                aria-label="Lukk fullskjerm"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                    <div className={styles.fsBody}>
                        <div className={styles.fsPreviewArea}>
                            <BrandingPreview
                                previewVars={previewVars as React.CSSProperties}
                                resolve={resolveColor}
                                logoUrl={logoUrl}
                                logoSvgContent={logoSvgContent}
                                logoSvgModified={logoSvgModified}
                                fontFamily={fontFamily}
                                fontHeading={fontHeading}
                                highlight={highlight}
                                showLabels={showLabels}
                                onHover={setHighlight}
                                onRegionClick={(field) => setSelectedField(field)}
                                large
                                tenantName={tenantName}
                            />
                        </div>
                        <div className={styles.fsEditor}>
                            <p className={styles.fsEditorHint}>
                                Klikk et område i forhåndsvisningen eller en fargeprøve under for å redigere fargen direkte.
                            </p>
                            {SECTIONS.map((section) => (
                                <div key={section.title} className={styles.fsEditorSection}>
                                    <h3 className={styles.fsEditorSectionTitle}>{section.title}</h3>
                                    <div className={styles.fsSwatchList}>
                                        {section.fields.map((field) => {
                                            const isSelected = selectedField === field.key;
                                            const resolved = resolveColor(field.key);
                                            const swatchColor = isValidHex6(resolved)
                                                ? resolved
                                                : DEFAULTS[field.key] || '#000000';
                                            let contrast: ReturnType<typeof getContrastLevel> | null = null;
                                            if (field.contrastAgainst) {
                                                try {
                                                    contrast = getContrastLevel(
                                                        contrastRatio(swatchColor, resolveColor(field.contrastAgainst)),
                                                    );
                                                } catch {
                                                    contrast = null;
                                                }
                                            }
                                            return (
                                                <div key={field.key} className={styles.fsSwatchRow}>
                                                    <button
                                                        type="button"
                                                        className={`${styles.fsSwatchRowMain} ${isSelected ? styles.fsSwatchRowActive : ''}`}
                                                        onClick={() =>
                                                            setSelectedField((cur) => (cur === field.key ? null : field.key))
                                                        }
                                                        onMouseEnter={() => setHighlight([field.key])}
                                                        onMouseLeave={() => setHighlight(null)}
                                                        aria-expanded={isSelected}
                                                    >
                                                        <span
                                                            className={styles.fsSwatch}
                                                            style={{ backgroundColor: swatchColor }}
                                                            aria-hidden="true"
                                                        />
                                                        <span className={styles.fsSwatchLabel}>{field.label}</span>
                                                        {contrast && (
                                                            <span
                                                                className={`${styles.contrastBadge} ${styles[`contrast_${contrast.level}`]}`}
                                                            >
                                                                {contrast.level === 'pass' && <Check size={12} />}
                                                                {contrast.level !== 'pass' && <AlertTriangle size={12} />}
                                                                <span>{contrast.label}</span>
                                                            </span>
                                                        )}
                                                        <span className={styles.fsSwatchHex}>{swatchColor}</span>
                                                    </button>
                                                    {isSelected && (
                                                        <div className={styles.fsPickerWrap}>
                                                            <HexColorPicker
                                                                color={swatchColor}
                                                                onChange={(c) => handleColorChange(field.key, c)}
                                                            />
                                                            <input
                                                                type="text"
                                                                value={colors[field.key] || ''}
                                                                onChange={(e) => handleColorChange(field.key, e.target.value)}
                                                                onBlur={(e) => {
                                                                    const normalized = normalizeHexInput(e.target.value);
                                                                    if (normalized && normalized !== colors[field.key]) {
                                                                        handleColorChange(field.key, normalized);
                                                                    }
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        const normalized = normalizeHexInput(
                                                                            (e.target as HTMLInputElement).value,
                                                                        );
                                                                        if (normalized) handleColorChange(field.key, normalized);
                                                                    }
                                                                }}
                                                                className={`${styles.input} ${styles.colorHex} ${styles.fsHexInput}`}
                                                                placeholder={DEFAULTS[field.key] || '#000000'}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
