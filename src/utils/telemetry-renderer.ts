import { SeiData } from '../types';
import { AUTOPILOT_LABELS, GEAR_LABELS } from './constants';

const TELEMETRY_HEIGHT = 80;

/**
 * Draw telemetry overlay onto the given canvas context
 */
export function drawTelemetry(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    telemetry: SeiData,
    width: number,
    height: number
): void {
    const y = height - TELEMETRY_HEIGHT;
    const h = TELEMETRY_HEIGHT;

    // Background
    ctx.fillStyle = 'rgba(18, 18, 26, 0.95)';
    ctx.fillRect(0, y, width, h);

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    if (!telemetry) {
        // No data message
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No Drive Data', width / 2, y + h / 2 + 6);
        return;
    }

    ctx.textAlign = 'center';

    // Speed
    const speedMps = telemetry.vehicle_speed_mps ?? 0;
    const speedKmh = Math.abs(speedMps * 3.6) < 0.05 ? 0 : speedMps * 3.6;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`${speedKmh.toFixed(0)}`, width / 2, y + 45);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('km/h', width / 2, y + 65);

    // Gear
    const gear = telemetry.gear_state !== undefined
        ? GEAR_LABELS[telemetry.gear_state] || '--'
        : '--';

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Gear', width / 2 + 80, y + 35);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(gear, width / 2 + 80, y + 55);

    // Autopilot
    const autopilot = telemetry.autopilot_state !== undefined
        ? (AUTOPILOT_LABELS[telemetry.autopilot_state]?.replace('autopilot.', '').toUpperCase() || '--')
        : '--';

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('Mode', width / 2 + 140, y + 35);
    ctx.fillStyle = autopilot !== 'OFF' && autopilot !== '--' ? '#00d26a' : 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(autopilot, width / 2 + 140, y + 55);

    // Steering
    const steeringAngle = telemetry.steering_wheel_angle ?? 0;
    ctx.save();
    ctx.translate(width / 2 - 100, y + 40);
    ctx.rotate((steeringAngle * Math.PI) / 180);

    // Simple steering wheel circle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.stroke();

    // Steering indicator line
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(0, -10);
    ctx.stroke();
    ctx.restore();

    // Pedal bars (left side)
    const pedalY = y + 15;
    const pedalH = 50;
    const barW = 25;

    // Brake bar
    const brakeOn = telemetry.brake_applied ?? false;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(50, pedalY, barW, pedalH);
    if (brakeOn) {
        ctx.fillStyle = '#e82127';
        ctx.fillRect(50, pedalY, barW, pedalH);
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BRK', 50 + barW / 2, pedalY + pedalH + 12);

    // Accelerator bar
    const accelPct = telemetry.accelerator_pedal_position ?? 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(90, pedalY, barW, pedalH);
    if (accelPct > 0) {
        const fillH = (accelPct / 100) * pedalH;
        ctx.fillStyle = '#00d26a';
        ctx.fillRect(90, pedalY + pedalH - fillH, barW, fillH);
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('ACC', 90 + barW / 2, pedalY + pedalH + 12);

    // Blinkers
    const blinkerY = y + 40;
    const blinkerSize = 12;

    // Left blinker
    if (telemetry.blinker_on_left) {
        ctx.fillStyle = '#ffc107';
        ctx.beginPath();
        ctx.moveTo(width / 2 - 150, blinkerY);
        ctx.lineTo(width / 2 - 150 - blinkerSize, blinkerY - blinkerSize / 2);
        ctx.lineTo(width / 2 - 150 - blinkerSize, blinkerY + blinkerSize / 2);
        ctx.closePath();
        ctx.fill();
    }

    // Right blinker
    if (telemetry.blinker_on_right) {
        ctx.fillStyle = '#ffc107';
        ctx.beginPath();
        ctx.moveTo(width / 2 - 50, blinkerY);
        ctx.lineTo(width / 2 - 50 + blinkerSize, blinkerY - blinkerSize / 2);
        ctx.lineTo(width / 2 - 50 + blinkerSize, blinkerY + blinkerSize / 2);
        ctx.closePath();
        ctx.fill();
    }

    // GPS coordinates (right side)
    if (telemetry.latitude_deg !== undefined && telemetry.longitude_deg !== undefined) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(
            `${telemetry.latitude_deg.toFixed(5)}, ${telemetry.longitude_deg.toFixed(5)}`,
            width - 20,
            y + h / 2 + 4
        );
    }
}
