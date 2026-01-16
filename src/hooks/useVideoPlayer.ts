import { useState, useCallback, useRef, useEffect } from 'react';
import type { Camera } from '../types';
import { CAMERAS } from '../utils/constants';

interface UseVideoPlayerReturn {
    isPlaying: boolean;
    playbackRate: number;
    play: () => void;
    pause: () => void;
    togglePlayPause: () => void;
    setPlaybackRate: (rate: number) => void;

}

export function useVideoPlayer(
    videoRefs: Record<Camera, React.RefObject<HTMLVideoElement | null>>
): UseVideoPlayerReturn {
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackRate, setPlaybackRateState] = useState(1);

    // Keep track of play state to handle async play calls
    const playingRef = useRef(false);

    // Add robustness: auto-play when video becomes ready if isPlaying is true
    // Listen to canplay on ALL cameras to handle cases where any video finishes loading
    useEffect(() => {
        const cleanupFns: (() => void)[] = [];

        for (const cam of CAMERAS) {
            const video = videoRefs[cam]?.current;
            if (!video) continue;

            const handleReady = () => {
                if (playingRef.current && video.paused && video.src) {
                    video.play().catch(() => {
                        // Ignore autoplay errors
                    });
                }
            };

            // Handle when video recovers from stalled/waiting state
            const handleCanPlayThrough = () => {
                if (playingRef.current && video.paused && video.src) {
                    video.play().catch(() => { });
                }
            };

            video.addEventListener('canplay', handleReady);
            // Also listen to 'loadeddata' as a fallback - some browsers may not fire canplay reliably
            video.addEventListener('loadeddata', handleReady);
            // Handle recovery from buffering/stalled states
            video.addEventListener('canplaythrough', handleCanPlayThrough);

            // Also check if it's already ready
            if (video.readyState >= 2 && playingRef.current && video.paused && video.src) {
                video.play().catch(() => { });
            }

            cleanupFns.push(() => {
                video.removeEventListener('canplay', handleReady);
                video.removeEventListener('loadeddata', handleReady);
                video.removeEventListener('canplaythrough', handleCanPlayThrough);
            });
        }

        return () => cleanupFns.forEach(fn => fn());
    }, [videoRefs]);

    const play = useCallback(() => {
        playingRef.current = true;
        setIsPlaying(true);

        for (const cam of CAMERAS) {
            const video = videoRefs[cam]?.current;
            if (video && video.src) {
                video.play().catch(() => {
                    // Ignore autoplay errors
                });
            }
        }
    }, [videoRefs]);

    const pause = useCallback(() => {
        playingRef.current = false;
        setIsPlaying(false);

        for (const cam of CAMERAS) {
            const video = videoRefs[cam]?.current;
            if (video) {
                video.pause();
            }
        }
    }, [videoRefs]);

    const togglePlayPause = useCallback(() => {
        if (playingRef.current) {
            pause();
        } else {
            play();
        }
    }, [play, pause]);

    const setPlaybackRate = useCallback(
        (rate: number) => {
            setPlaybackRateState(rate);

            for (const cam of CAMERAS) {
                const video = videoRefs[cam]?.current;
                if (video) {
                    video.playbackRate = rate;
                }
            }
        },
        [videoRefs]
    );



    return {
        isPlaying,
        playbackRate,
        play,
        pause,
        togglePlayPause,
        setPlaybackRate,
    };
}
