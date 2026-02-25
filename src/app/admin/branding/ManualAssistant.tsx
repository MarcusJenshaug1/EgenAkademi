'use client';

import { useState, useRef, useEffect } from 'react';
import {
    Palette,
    Sparkles,
    Check,
    RotateCcw,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import {
    deriveBrandingSuggestionsFromRoles,
    PRESETS,
    ROLE_LABELS,
    ROLE_HINTS,
    FIELD_LABELS,
    type BrandingRoles,
    type GeneratorResult,
} from '@/lib/brandingGenerator';
import { isValidHex, normalizeHexInput } from '@/lib/colorUtils';
import styles from './manualAssistant.module.css';

// ── Props ───────────────────────────────────────────────────

interface ManualAssistantProps {
    initialRoles: BrandingRoles;
    detectedRoles?: BrandingRoles | null;
    onGenerate: (result: GeneratorResult | null) => void;
    onApplyAll: (suggestions: Record<string, string>) => void;
}

// ── Role keys in display order ──────────────────────────────

const ROLE_KEYS: (keyof BrandingRoles)[] = [
    'brand',
    'bgPrimary',
    'bgSecondary',
    'textPrimary',
    'sidebarBg',
];

// ── Component ───────────────────────────────────────────────

export default function ManualAssistant({
    initialRoles,
    detectedRoles,
    onGenerate,
    onApplyAll,
}: ManualAssistantProps) {
    const [expanded, setExpanded] = useState(false);
    const [roles, setRoles] = useState<BrandingRoles>({ ...initialRoles });
    const [preset, setPreset] = useState('standard');
    const [result, setResult] = useState<GeneratorResult | null>(null);
    const [activePickerRole, setActivePickerRole] = useState<keyof BrandingRoles | null>(null);
    const pickerRef = useRef<HTMLDivElement>(null);

    // When detected roles arrive, pre-fill, expand, and auto-generate
    useEffect(() => {
        if (!detectedRoles) return;
        setRoles({ ...detectedRoles });
        setExpanded(true);
        // Auto-generate with detected roles
        const validRoles = { ...detectedRoles };
        for (const key of ROLE_KEYS) {
            if (!isValidHex(validRoles[key])) {
                validRoles[key] = initialRoles[key];
            }
        }
        const gen = deriveBrandingSuggestionsFromRoles(validRoles, preset);
        setResult(gen);
        onGenerate(gen);
    }, [detectedRoles]); // eslint-disable-line react-hooks/exhaustive-deps

    // Close picker when clicking outside
    useEffect(() => {
        if (!activePickerRole) return;
        function handleClick(e: MouseEvent) {
            if (
                pickerRef.current &&
                !pickerRef.current.contains(e.target as Node)
            ) {
                setActivePickerRole(null);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [activePickerRole]);

    function handleRoleChange(role: keyof BrandingRoles, value: string) {
        setRoles((prev) => ({ ...prev, [role]: value }));
    }

    function handleRoleBlur(role: keyof BrandingRoles, raw: string) {
        const norm = normalizeHexInput(raw);
        if (norm && norm !== roles[role]) {
            setRoles((prev) => ({ ...prev, [role]: norm }));
        }
    }

    function handleGenerate() {
        // Validate — fall back to initial for invalid inputs
        const validRoles = { ...roles };
        for (const key of ROLE_KEYS) {
            if (!isValidHex(validRoles[key])) {
                validRoles[key] = initialRoles[key];
            }
        }
        const gen = deriveBrandingSuggestionsFromRoles(validRoles, preset);
        setResult(gen);
        onGenerate(gen);
    }

    function handleApplyAll() {
        if (!result) return;
        onApplyAll(result.suggestions);
    }

    function handleReset() {
        setRoles({ ...initialRoles });
        setResult(null);
        onGenerate(null);
    }

    // ── Collapsed view ──────────────────────────────────────

    if (!expanded) {
        return (
            <div className={styles.container}>
                <button
                    type="button"
                    className={styles.toggleBtn}
                    onClick={() => setExpanded(true)}
                >
                    <Palette size={16} />
                    <span>Fargeassistent</span>
                    <ChevronDown size={14} />
                </button>
            </div>
        );
    }

    // ── Expanded view ───────────────────────────────────────

    return (
        <div className={styles.container}>
            <button
                type="button"
                className={styles.toggleBtn}
                onClick={() => setExpanded(false)}
            >
                <Palette size={16} />
                <span>Fargeassistent</span>
                <ChevronUp size={14} />
            </button>

            <p className={styles.description}>
                Velg 5 nøkkelfarger og generer en komplett fargepalett med
                kontrastsikring.
            </p>

            {/* ── Role inputs ──────────────────────────────── */}
            <div className={styles.rolesGrid}>
                {ROLE_KEYS.map((role) => (
                    <div key={role} className={styles.roleField}>
                        <label className={styles.roleLabel}>
                            {ROLE_LABELS[role]}
                        </label>
                        <div className={styles.roleInputWrapper}>
                            <div className={styles.pickerAnchor}>
                                <button
                                    type="button"
                                    className={styles.roleSwatch}
                                    style={{
                                        backgroundColor: isValidHex(roles[role])
                                            ? roles[role]
                                            : '#666',
                                    }}
                                    onClick={() =>
                                        setActivePickerRole(
                                            activePickerRole === role
                                                ? null
                                                : role,
                                        )
                                    }
                                    aria-label={`Velg ${ROLE_LABELS[role]}`}
                                />
                                {activePickerRole === role && (
                                    <div
                                        ref={pickerRef}
                                        className={styles.pickerPopover}
                                    >
                                        <HexColorPicker
                                            color={
                                                isValidHex(roles[role])
                                                    ? roles[role]
                                                    : '#666666'
                                            }
                                            onChange={(c) =>
                                                handleRoleChange(role, c)
                                            }
                                        />
                                    </div>
                                )}
                            </div>
                            <input
                                type="text"
                                className={styles.roleInput}
                                value={roles[role]}
                                onChange={(e) =>
                                    handleRoleChange(role, e.target.value)
                                }
                                onBlur={(e) =>
                                    handleRoleBlur(role, e.target.value)
                                }
                                placeholder={initialRoles[role]}
                            />
                        </div>
                        <span className={styles.roleHint}>
                            {ROLE_HINTS[role]}
                        </span>
                    </div>
                ))}
            </div>

            {/* ── Preset selector ──────────────────────────── */}
            <div className={styles.presetRow}>
                <label className={styles.presetLabel}>Kontrastnivå:</label>
                <select
                    className={styles.presetSelect}
                    value={preset}
                    onChange={(e) => setPreset(e.target.value)}
                >
                    {Object.entries(PRESETS).map(([key, p]) => (
                        <option key={key} value={key}>
                            {p.label}
                        </option>
                    ))}
                </select>
            </div>
            {PRESETS[preset] && (
                <p className={styles.presetDesc}>
                    {PRESETS[preset].description}
                </p>
            )}

            {/* ── Action buttons ───────────────────────────── */}
            <div className={styles.actions}>
                <button
                    type="button"
                    className={styles.generateBtn}
                    onClick={handleGenerate}
                >
                    <Sparkles size={14} />
                    Generer palett
                </button>
                {result && (
                    <button
                        type="button"
                        className={styles.applyAllBtn}
                        onClick={handleApplyAll}
                    >
                        <Check size={14} />
                        Bruk alle
                    </button>
                )}
                <button
                    type="button"
                    className={styles.resetBtn}
                    onClick={handleReset}
                >
                    <RotateCcw size={14} />
                    Nullstill
                </button>
            </div>

            {/* ── Generated palette results ────────────────── */}
            {result && (
                <div className={styles.results}>
                    <h4 className={styles.resultsTitle}>
                        Generert palett ({PRESETS[preset]?.label || preset})
                    </h4>
                    <div className={styles.resultsList}>
                        {result.details.map((d) => (
                            <div key={d.field} className={styles.resultRow}>
                                <div
                                    className={styles.resultSwatch}
                                    style={{ backgroundColor: d.value }}
                                />
                                <span className={styles.resultField}>
                                    {FIELD_LABELS[d.field] || d.field}
                                </span>
                                <span className={styles.resultValue}>
                                    {d.value}
                                </span>
                                {d.adjusted && (
                                    <span className={styles.adjustedBadge}>
                                        justert
                                    </span>
                                )}
                                {d.contrastRatio != null && (
                                    <span className={styles.contrastInfo}>
                                        {d.contrastRatio}:1
                                    </span>
                                )}
                                <span className={styles.resultReasoning}>
                                    {d.reasoning}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
