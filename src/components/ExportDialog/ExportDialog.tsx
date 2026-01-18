import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LayoutMode, ExportProgress } from '../../types';
import styles from './ExportDialog.module.css';

export type ExportScope = 'segment' | 'full';

interface ExportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onStartExport: (layout: LayoutMode, scope: ExportScope) => void;
    onCancelExport: () => void;
    isExporting: boolean;
    progress: ExportProgress | null;
    logs: string[];
    layout: LayoutMode; // Current/Default layout
    hasMultipleSegments: boolean;
    isWebCodecsAvailable: boolean;
}

export function ExportDialog({
    isOpen,
    onClose,
    onStartExport,
    onCancelExport,
    isExporting,
    progress,
    logs,
    layout: initialLayout,
    hasMultipleSegments,
    isWebCodecsAvailable
}: ExportDialogProps) {
    const { t } = useTranslation();
    const [selectedLayout, setSelectedLayout] = useState<LayoutMode>(initialLayout);
    const [scope, setScope] = useState<ExportScope>('full');
    const logEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll logs
    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    // Reset layout on open
    useEffect(() => {
        if (isOpen) {
            setSelectedLayout(initialLayout);
            setScope('full'); // Default to full clip if multiple segments, or logic below
        }
    }, [isOpen, initialLayout]);

    if (!isOpen) return null;

    const progressPercent = progress?.percent ?? 0;
    const phase = progress?.phase;

    return (
        <div className={styles.overlay}>
            <div className={styles.content}>
                <div className={styles.header}>
                    <h2 className={styles.title}>{t('controls.export')}</h2>
                    {!isExporting && (
                        <button
                            onClick={onClose}
                            className={styles.closeButton}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18" />
                                <path d="M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className={styles.body}>
                    {/* Layout Selection */}
                    <div className={styles.formGroup}>
                        <label className={styles.label}>
                            {t('controls.toggleLayout')}
                        </label>
                        <div className={styles.buttonGroup}>
                            <button
                                onClick={() => setSelectedLayout('3x2')}
                                disabled={isExporting}
                                className={`${styles.optionButton} ${selectedLayout === '3x2' ? styles.optionButtonActive : ''}`}
                            >
                                {t('controls.layoutGrid3x2') || 'Grid (3x2)'}
                            </button>
                            <button
                                onClick={() => setSelectedLayout('2x2')}
                                disabled={isExporting}
                                className={`${styles.optionButton} ${selectedLayout === '2x2' ? styles.optionButtonActive : ''}`}
                            >
                                {t('controls.layoutGrid2x2') || 'Grid (2x2)'}
                            </button>
                            <button
                                onClick={() => setSelectedLayout('single')}
                                disabled={isExporting}
                                className={`${styles.optionButton} ${selectedLayout === 'single' ? styles.optionButtonActive : ''}`}
                            >
                                {t('controls.layoutSingle') || 'Single'}
                            </button>
                        </div>
                    </div>

                    {/* Scope Selection */}
                    {hasMultipleSegments && (
                        <div className={styles.formGroup}>
                            <label className={styles.label}>
                                {t('controls.exportScope') || 'Export Scope'}
                            </label>
                            <div className={styles.buttonGroup}>
                                <button
                                    onClick={() => setScope('full')}
                                    disabled={isExporting}
                                    className={`${styles.optionButton} ${scope === 'full' ? styles.optionButtonActive : ''}`}
                                >
                                    {t('controls.fullClip') || 'Full Clip'}
                                </button>
                                <button
                                    onClick={() => setScope('segment')}
                                    disabled={isExporting}
                                    className={`${styles.optionButton} ${scope === 'segment' ? styles.optionButtonActive : ''}`}
                                >
                                    {t('controls.currentSegment') || 'Current Segment'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Progress */}
                    {isExporting && (
                        <div className={styles.progressContainer}>
                            <div className={styles.progressHeader}>
                                <span>
                                    {phase === 'encoding' ? 'Encoding...' :
                                        phase === 'preparing' ? 'Preparing...' :
                                            'Exporting...'}
                                </span>
                                <span>{progressPercent.toFixed(1)}%</span>
                            </div>
                            <div className={styles.progressBarTrack}>
                                <div
                                    className={styles.progressBarFill}
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Logs */}
                    <div className={styles.logs}>
                        {logs.length === 0 ? (
                            <div className={styles.logEmpty}>
                                Ready to export...
                            </div>
                        ) : (
                            logs.map((log, i) => (
                                <div key={i} className={styles.logItem}>
                                    <span className={styles.logPrefix}>&gt;</span>
                                    {log}
                                </div>
                            ))
                        )}
                        <div ref={logEndRef} />
                    </div>
                </div>

                {!isWebCodecsAvailable && !isExporting && (
                    <div className={styles.warning}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <span>
                            {t('warnings.legacyExport')}
                        </span>
                    </div>
                )}

                <div className={styles.footer}>
                    {!isExporting ? (
                        <>
                            <button
                                onClick={onClose}
                                className={styles.cancelButton}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={() => onStartExport(selectedLayout, hasMultipleSegments ? scope : 'segment')}
                                className={styles.primaryButton}
                            >
                                {t('controls.startExport')}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onCancelExport}
                            className={styles.dangerButton}
                        >
                            {t('common.cancel')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
