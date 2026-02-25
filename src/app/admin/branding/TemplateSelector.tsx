'use client';

import { useState, useEffect, useRef } from 'react';
import { Palette, Check, Moon, Sparkles, Sun, Mountain, TreePine } from 'lucide-react';
import styles from './templateSelector.module.css';

// ── Preset definitions ──────────────────────────────────────

export interface BrandingPreset {
    id: string;
    name: string;
    description: string;
    icon: keyof typeof ICON_MAP;
    colors: Record<string, string>;
}

const ICON_MAP = {
    moon: Moon,
    sparkles: Sparkles,
    sun: Sun,
    mountain: Mountain,
    tree: TreePine,
} as const;

export const PRESETS: BrandingPreset[] = [
    {
        id: 'midnatt',
        name: 'Midnatt',
        description: 'Elegant mørkt tema med blå aksent',
        icon: 'moon',
        colors: {
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
        },
    },
    {
        id: 'nordlys',
        name: 'Nordlys',
        description: 'Mørkt tema med aurora-grønn glød',
        icon: 'sparkles',
        colors: {
            colorBgPrimary: '#0a0f0d',
            colorBgSecondary: '#111a16',
            colorTextPrimary: '#e8f5e9',
            colorTextSecondary: '#81c784',
            colorBorder: '#1b3a2a',
            colorAccent: '#4ade80',
            colorButtonPrimary: '#22c55e',
            colorButtonText: '#052e16',
            colorSidebarBg: '#071209',
            colorSidebarText: '#6ee7a0',
            colorSidebarActive: '#4ade80',
            colorSuccess: '#34d399',
            colorWarning: '#fbbf24',
            colorDanger: '#f87171',
        },
    },
    {
        id: 'soloppgang',
        name: 'Soloppgang',
        description: 'Varmt lyst tema med korall-aksent',
        icon: 'sun',
        colors: {
            colorBgPrimary: '#fffbf5',
            colorBgSecondary: '#fff7ed',
            colorTextPrimary: '#1c1917',
            colorTextSecondary: '#78716c',
            colorBorder: '#e7e5e4',
            colorAccent: '#f97316',
            colorButtonPrimary: '#ea580c',
            colorButtonText: '#ffffff',
            colorSidebarBg: '#fef3e2',
            colorSidebarText: '#92400e',
            colorSidebarActive: '#ea580c',
            colorSuccess: '#16a34a',
            colorWarning: '#d97706',
            colorDanger: '#dc2626',
        },
    },
    {
        id: 'fjordblaa',
        name: 'Fjordblå',
        description: 'Rent lyst tema med dypblå toner',
        icon: 'mountain',
        colors: {
            colorBgPrimary: '#f8fafc',
            colorBgSecondary: '#f0f4f8',
            colorTextPrimary: '#0f172a',
            colorTextSecondary: '#64748b',
            colorBorder: '#cbd5e1',
            colorAccent: '#2563eb',
            colorButtonPrimary: '#1d4ed8',
            colorButtonText: '#ffffff',
            colorSidebarBg: '#e8eef6',
            colorSidebarText: '#334155',
            colorSidebarActive: '#2563eb',
            colorSuccess: '#16a34a',
            colorWarning: '#ea580c',
            colorDanger: '#dc2626',
        },
    },
    {
        id: 'skogsdyp',
        name: 'Skogsdyp',
        description: 'Dyp jordtone med varm gull-aksent',
        icon: 'tree',
        colors: {
            colorBgPrimary: '#0c0a09',
            colorBgSecondary: '#1c1917',
            colorTextPrimary: '#fafaf9',
            colorTextSecondary: '#a8a29e',
            colorBorder: '#292524',
            colorAccent: '#d97706',
            colorButtonPrimary: '#b45309',
            colorButtonText: '#fefce8',
            colorSidebarBg: '#0a0908',
            colorSidebarText: '#d6d3d1',
            colorSidebarActive: '#d97706',
            colorSuccess: '#22c55e',
            colorWarning: '#eab308',
            colorDanger: '#ef4444',
        },
    },
];

// ── Component ───────────────────────────────────────────────

interface TemplateSelectorProps {
    currentColors: Record<string, string>;
    defaults: Record<string, string>;
    onApply: (colors: Record<string, string>) => void;
}

export default function TemplateSelector({ currentColors, defaults, onApply }: TemplateSelectorProps) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const appliedAt = useRef(0);

    // Clear active when user makes manual color changes (but not from template apply)
    useEffect(() => {
        // Ignore color changes within 500ms of applying a template
        if (Date.now() - appliedAt.current < 500) return;
        if (activeId) setActiveId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentColors]);

    function handleApply(preset: BrandingPreset) {
        appliedAt.current = Date.now();
        setActiveId(preset.id);
        onApply(preset.colors);
    }

    return (
        <div className={styles.wrapper}>
            <div className={styles.header}>
                <div className={styles.headerIcon}>
                    <Palette size={18} />
                </div>
                <div>
                    <h3 className={styles.title}>Ferdige maler</h3>
                    <p className={styles.subtitle}>
                        Velg en mal som utgangspunkt — du kan tilpasse alle farger etterpå.
                    </p>
                </div>
            </div>

            <div className={styles.grid}>
                {PRESETS.map((preset) => {
                    const isActive = activeId === preset.id;
                    const Icon = ICON_MAP[preset.icon];
                    return (
                        <button
                            key={preset.id}
                            type="button"
                            className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
                            onClick={() => handleApply(preset)}
                        >
                            {/* Color preview strip */}
                            <div className={styles.previewStrip}>
                                <div
                                    className={styles.previewBg}
                                    style={{ backgroundColor: preset.colors.colorBgPrimary }}
                                >
                                    <div
                                        className={styles.previewSidebar}
                                        style={{ backgroundColor: preset.colors.colorSidebarBg }}
                                    >
                                        <div
                                            className={styles.previewDot}
                                            style={{ backgroundColor: preset.colors.colorSidebarActive }}
                                        />
                                        <div
                                            className={styles.previewLine}
                                            style={{ backgroundColor: preset.colors.colorSidebarText, opacity: 0.5 }}
                                        />
                                        <div
                                            className={styles.previewLine}
                                            style={{ backgroundColor: preset.colors.colorSidebarText, opacity: 0.3 }}
                                        />
                                    </div>
                                    <div className={styles.previewContent}>
                                        <div
                                            className={styles.previewTitle}
                                            style={{ backgroundColor: preset.colors.colorTextPrimary }}
                                        />
                                        <div
                                            className={styles.previewSubtext}
                                            style={{ backgroundColor: preset.colors.colorTextSecondary, opacity: 0.5 }}
                                        />
                                        <div className={styles.previewCards}>
                                            <div
                                                className={styles.previewMiniCard}
                                                style={{
                                                    backgroundColor: preset.colors.colorBgSecondary,
                                                    border: `1px solid ${preset.colors.colorBorder}`,
                                                }}
                                            />
                                            <div
                                                className={styles.previewMiniCard}
                                                style={{
                                                    backgroundColor: preset.colors.colorBgSecondary,
                                                    border: `1px solid ${preset.colors.colorBorder}`,
                                                }}
                                            />
                                        </div>
                                        <div
                                            className={styles.previewButton}
                                            style={{ backgroundColor: preset.colors.colorButtonPrimary }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Color dots */}
                            <div className={styles.colorDots}>
                                {[
                                    preset.colors.colorAccent,
                                    preset.colors.colorBgPrimary,
                                    preset.colors.colorBgSecondary,
                                    preset.colors.colorTextPrimary,
                                    preset.colors.colorSidebarBg,
                                ].map((c, i) => (
                                    <div
                                        key={i}
                                        className={styles.colorDot}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>

                            {/* Info */}
                            <div className={styles.cardInfo}>
                                <span className={styles.cardName}>
                                    <Icon size={13} className={styles.cardIcon} />
                                    {preset.name}
                                </span>
                                <span className={styles.cardDesc}>{preset.description}</span>
                            </div>

                            {/* Active indicator */}
                            {isActive && (
                                <div className={styles.activeBadge}>
                                    <Check size={12} />
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
