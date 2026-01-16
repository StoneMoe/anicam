import { useEffect } from 'react';

type KeyboardHandler = (event: KeyboardEvent) => void;

interface UseKeyboardShortcutsOptions {
    onPlayPause?: () => void;
    onSkipForward?: () => void;
    onSkipBack?: () => void;
    onNextSegment?: () => void;
    onPrevSegment?: () => void;
    onToggleLayout?: () => void;
    onToggleTelemetry?: () => void;
    onEscape?: () => void;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions): void {
    useEffect(() => {
        const handleKeyDown: KeyboardHandler = (e) => {
            // Ignore if typing in an input
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLSelectElement ||
                e.target instanceof HTMLTextAreaElement
            ) {
                return;
            }

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    options.onPlayPause?.();
                    break;
                case 'ArrowLeft':
                    options.onSkipBack?.();
                    break;
                case 'ArrowRight':
                    options.onSkipForward?.();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    options.onPrevSegment?.();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    options.onNextSegment?.();
                    break;
                case 'f':
                    options.onToggleLayout?.();
                    break;
                case 't':
                    options.onToggleTelemetry?.();
                    break;
                case 'Escape':
                    options.onEscape?.();
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [options]);
}
