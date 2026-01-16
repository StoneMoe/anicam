import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SeiData } from '../../types';
import { GEAR_LABELS, AUTOPILOT_LABELS } from '../../utils/constants';

interface TelemetryPanelProps {
    telemetry: SeiData | null;
    hasData: boolean;
    frameCount: number;
    isHidden: boolean;
}

// Steering Wheel Icon Component
function SteeringWheelIcon({ rotation }: { rotation: number }) {
    return (
        <svg
            className="steering-wheel-icon"
            viewBox="0 0 100 100"
            style={{ transform: `rotate(${rotation}deg)` }}
        >
            {/* Rim (filled ring) */}
            <path
                d="M50 5
                   A45 45 0 1 0 50 95
                   A45 45 0 1 0 50 5
                   Z
                   M50 13
                   A37 37 0 1 1 50 87
                   A37 37 0 1 1 50 13
                   Z"
                fill="currentColor"
                fillRule="evenodd"
            />
            {/* Center Hub & Spokes */}
            {/* Horizontal Spoke */}
            <rect x="15" y="44" width="70" height="12" rx="4" fill="currentColor" />
            {/* Bottom Spoke */}
            <path d="M44 50 L44 87 L56 87 L56 50 Z" fill="currentColor" />
            {/* Center Cap */}
            <circle cx="50" cy="50" r="14" fill="currentColor" />
            {/* Detail: Inner Cutout for Hub to make it look like a wheel assembly */}
            <circle cx="50" cy="50" r="6" fill="var(--color-bg-secondary)" />
        </svg>
    );
}

// Pedal Bar Component
interface PedalBarProps {
    label: string;
    value: number; // 0-100
    color: 'green' | 'red';
    active?: boolean;
}

function PedalBar({ label, value, color, active = true }: PedalBarProps) {
    const barColor = color === 'green' ? 'var(--color-success)' : 'var(--color-accent)';
    const displayValue = active ? value : 0;

    return (
        <div className="pedal-bar-container">
            <div className="pedal-bar-label">{label}</div>
            <div className="pedal-bar-track">
                <div
                    className="pedal-bar-fill"
                    style={{
                        height: `${displayValue}%`,
                        background: barColor,
                        boxShadow: displayValue > 0 ? `0 0 8px ${barColor}` : 'none'
                    }}
                />
            </div>
            <div className="pedal-bar-value">{displayValue.toFixed(0)}%</div>
        </div>
    );
}

function BlinkerArrow() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="blinker-svg">
            <path
                d="M15.41 16.09l-4.58-4.59 4.58-4.59C16.19 6.13 16.19 4.87 15.41 4.09 14.63 3.31 13.37 3.31 12.59 4.09l-6.41 6.41c-.78.78-.78 2.05 0 2.83l6.41 6.41c.78.78 2.05.78 2.83 0 .79-.78.79-2.05 0-2.83z"
            />
        </svg>
    );
}

export function TelemetryPanel({
    telemetry,
    hasData,
    frameCount,
    isHidden,
}: TelemetryPanelProps) {
    const { t } = useTranslation();
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Speed (m/s to km/h)
    const speedVal = telemetry?.vehicle_speed_mps !== undefined ? telemetry.vehicle_speed_mps * 3.6 : 0;
    const speedKmh = telemetry?.vehicle_speed_mps !== undefined
        ? (Math.abs(speedVal) < 0.05 ? 0 : speedVal).toFixed(1)
        : '--';

    // Gear
    const gear =
        telemetry?.gear_state !== undefined
            ? GEAR_LABELS[telemetry.gear_state] || '--'
            : '--';

    // Steering angle (already in degrees)
    const steeringDegNum = telemetry?.steering_wheel_angle ?? 0;
    const steeringDeg = telemetry?.steering_wheel_angle !== undefined
        ? (Math.abs(steeringDegNum) < 0.05 ? 0 : steeringDegNum).toFixed(1)
        : '--';

    // Accelerator (already 0-100)
    const acceleratorPct = telemetry?.accelerator_pedal_position ?? 0;

    // Brake (0-100 for display, ON/OFF for state)
    const brakeApplied = telemetry?.brake_applied ?? false;

    // Autopilot
    const autopilot =
        telemetry?.autopilot_state !== undefined
            ? (AUTOPILOT_LABELS[telemetry.autopilot_state] ? t(AUTOPILOT_LABELS[telemetry.autopilot_state]) : '--')
            : '--';

    // GPS
    const gps =
        telemetry?.latitude_deg !== undefined && telemetry?.longitude_deg !== undefined
            ? `${telemetry.latitude_deg.toFixed(5)}, ${telemetry.longitude_deg.toFixed(5)}`
            : '--';


    return (
        <div className={`telemetry-panel compact ${isHidden ? 'hidden' : ''}`}>
            <div className="telemetry-compact-row" style={{ position: 'relative' }}>
                {/* No Data Overlay */}
                {!hasData && (
                    <div className="telemetry-no-data-overlay">
                        <span>{t('telemetry.noDataAvailable')}</span>
                    </div>
                )}

                {/* Main Content (Faded if no data) */}
                <div className={`telemetry-content-wrapper ${!hasData ? 'faded' : ''}`}>
                    {/* Pedals Section (Left) */}
                    <div className="telemetry-section pedals-section" style={{ borderRight: 'none' }}>
                        {/* Brake Indicator (Boolean) */}
                        {/* Brake Bar */}
                        <PedalBar
                            label={t('telemetry.brk')}
                            value={brakeApplied ? 100 : 0}
                            color="red"
                            active={telemetry?.brake_applied !== undefined}
                        />
                        {/* Accelerator Bar */}
                        <PedalBar
                            label={t('telemetry.acc')}
                            value={acceleratorPct}
                            color="green"
                            active={telemetry?.accelerator_pedal_position !== undefined}
                        />
                    </div>

                    <div style={{ flex: 1 }} />

                    {/* Steering Section (Center) */}
                    <div className="telemetry-section steering-section" style={{ borderRight: 'none' }}>
                        <div className="steering-row">
                            <div className={`blinker-indicator left ${telemetry?.blinker_on_left ? 'active' : ''}`}>
                                <BlinkerArrow />
                            </div>
                            <SteeringWheelIcon rotation={steeringDegNum} />
                            <div className={`blinker-indicator right ${telemetry?.blinker_on_right ? 'active' : ''}`}>
                                <BlinkerArrow />
                            </div>
                        </div>
                        <div className="steering-value">{steeringDeg}°</div>
                    </div>

                    <div style={{ flex: 1 }} />

                    <div className="telemetry-section speed-section" style={{ borderRight: 'none' }}>
                        <div className="speed-display">
                            <span className="speed-value">{speedKmh}</span>
                            <span className="speed-unit">km/h</span>
                        </div>
                        <div className="gear-row">
                            <div className="gear-display">
                                <span className="gear-label">{t('telemetry.gear')}</span>
                                <span className="gear-value">{gear}</span>
                            </div>
                            <div className="status-separator">|</div>
                            <div className="status-display">
                                <span className="status-label">{t('telemetry.mode')}</span>
                                <span className={`status-value ${autopilot !== '--' && autopilot !== 'OFF' ? 'active' : ''}`}>
                                    {autopilot}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Toggle Advanced */}
                    <button
                        className={`toggle-advanced-btn ${showAdvanced ? 'active' : ''}`}
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        title={t('telemetry.advancedInfo')}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </button>
                </div> {/* End telemetry-content-wrapper */}
            </div> {/* End telemetry-compact-row */}

            {/* Advanced Info Row */}
            <div className={`telemetry-advanced-row ${showAdvanced ? 'visible' : ''}`}>
                {/* GPS Section */}
                <div className="telemetry-section gps-section">
                    <div className="gps-label">{t('telemetry.gps')}</div>
                    <div className="gps-value">{gps}</div>
                </div>

                {/* SEI Status */}
                <div className="telemetry-section sei-section">
                    <span className={`sei-badge ${hasData ? 'active' : ''}`}>
                        {hasData ? `${t('telemetry.sei')} (${frameCount})` : t('telemetry.noSei')}
                    </span>
                </div>
            </div>
        </div>
    );
}
