/**
 * Format seconds to MM:SS display
 */
export function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format clip folder name to human-readable date
 * Input: "2024-01-15_14-30-25"
 * Output: "2024/01/15 14:30:25"
 */
export function formatClipDate(name: string): string {
    const match = name.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/);
    if (match) {
        const [, year, month, day, hour, minute, second] = match;
        return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
    }
    return name;
}

/**
 * Parse timestamp from clip folder name
 */
export function parseClipTimestamp(name: string): number {
    const match = name.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/);
    if (match) {
        const [, year, month, day, hour, minute, second] = match;
        return new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
        ).getTime();
    }
    return 0;
}

/**
 * Format event timestamp to human-readable string (removes the 'T')
 */
export function formatEventDate(timestamp: string): string {
    return timestamp.replace('T', ' ');
}
