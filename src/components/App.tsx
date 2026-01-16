import { useState, useEffect } from 'react';
import { useClipManager } from '../hooks/useClipManager';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { Header } from './Header/Header';
import { Sidebar } from './Sidebar/Sidebar';
import { Player } from './Player/Player';
import { WelcomeScreen } from './WelcomeScreen';

export function App() {
    const {
        clips,
        currentClip,
        isLoading,
        loadingProgress,
        error,
        warning,
        dismissWarning,
        selectFolder,
        selectClip,
        hasClips,
        fileInputRef,
        handleFileChange,
    } = useClipManager();

    // Sidebar state
    // Default to open on desktop (> 768px), closed on mobile
    const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth > 768 : false
    );

    // Auto-open sidebar when clips are loaded
    useEffect(() => {
        if (hasClips) {
            setIsSidebarOpen(true);
        }
    }, [clips, hasClips]);

    // Keyboard shortcuts (basic navigation without player context)
    useKeyboardShortcuts({
        // Player-specific shortcuts are handled within the Player component
    });

    return (
        <div id="app">
            <Header
                onSelectFolder={selectFolder}
                onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            />

            <main className="app-main">
                <Sidebar
                    clips={clips}
                    currentClip={currentClip}
                    onSelectClip={(clip) => {
                        selectClip(clip);
                        setIsSidebarOpen(false); // Close sidebar on selection on mobile
                    }}
                    hasClips={hasClips}
                    isOpen={isSidebarOpen}
                    onClose={() => setIsSidebarOpen(false)}
                />

                <div className="content">
                    {currentClip ? (
                        <Player clip={currentClip} />
                    ) : (
                        <WelcomeScreen onSelectFolder={selectFolder} />
                    )}
                </div>
            </main>

            {/* Error display */}
            {error && (
                <div className="error-toast">
                    {error}
                </div>
            )}

            {/* Warning display */}
            {warning && (
                <div className="warning-toast">
                    <span>{warning}</span>
                    <button className="toast-dismiss" onClick={dismissWarning} title="Dismiss">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Loading indicator with progress */}
            {isLoading && (
                <div className="loading-overlay">
                    <div className="loading-spinner" />
                    {loadingProgress && (
                        <div className="loading-message">{loadingProgress.message}</div>
                    )}
                </div>
            )}

            {/* Fallback file input for non-supported browsers (e.g. iOS Safari) */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                multiple
                // @ts-expect-error directory selection is non-standard but supported by most browsers
                webkitdirectory=""
                directory=""
            />
        </div>
    );
}
