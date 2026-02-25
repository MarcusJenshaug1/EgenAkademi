'use client';

import { Lightbulb } from 'lucide-react';
import styles from './colorFieldTip.module.css';

// ── Shared tip data type ────────────────────────────────────

export interface TipData {
    value: string;
    source: 'manual' | 'detektor' | 'baseline';
    reasoning?: string;
    adjusted?: boolean;
    contrastRatio?: number;
}

// ── Source label map ────────────────────────────────────────

const SOURCE_LABELS: Record<TipData['source'], string> = {
    manual: 'Manual',
    detektor: 'Detektor',
    baseline: 'Baseline',
};

const SOURCE_STYLE: Record<TipData['source'], string> = {
    manual: styles.sourceManual,
    detektor: styles.sourceDetektor,
    baseline: styles.sourceBaseline,
};

// ── Component ───────────────────────────────────────────────

interface ColorFieldTipProps {
    tip: TipData;
    onApply: () => void;
}

export default function ColorFieldTip({ tip, onApply }: ColorFieldTipProps) {
    return (
        <div className={styles.tipRow}>
            <Lightbulb size={12} style={{ color: '#60a5fa', flexShrink: 0 }} />
            <span className={`${styles.sourceBadge} ${SOURCE_STYLE[tip.source]}`}>
                {SOURCE_LABELS[tip.source]}
            </span>
            <div
                className={styles.tipSwatch}
                style={{ backgroundColor: tip.value }}
            />
            <span className={styles.tipValue}>{tip.value}</span>
            {tip.adjusted && (
                <span className={styles.adjustedDot} title="Justert for kontrast" />
            )}
            {tip.reasoning && (
                <span className={styles.tipReasoning} title={tip.reasoning}>
                    {tip.reasoning}
                </span>
            )}
            <button
                type="button"
                className={styles.tipApplyBtn}
                onClick={onApply}
            >
                Bruk&thinsp;▸
            </button>
        </div>
    );
}
