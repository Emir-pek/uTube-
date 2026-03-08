import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (s) => {
    if (!isFinite(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const PlayIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M8 5v14l11-7z" />
    </svg>
);
const PauseIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
);
const ReplayIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    </svg>
);
const VolumeHighIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
);
const VolumeMutedIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
);
const VolumeLowIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
    </svg>
);
const FullscreenIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
);
const ExitFullscreenIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
    </svg>
);
const SettingsIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
);

const SkipAnimationIcon = ({ direction, amount }) => (
    <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-1">
            {direction === 'back' ? (
                <>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 rotate-180"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
                    <span className="text-xl font-black">{amount}</span>
                </>
            ) : (
                <>
                    <span className="text-xl font-black">{amount}</span>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
                </>
            )}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">seconds</span>
    </div>
);

const Tip = ({ label, children }) => (
    <div className="group/tip relative flex items-center">
        {children}
        <div className="pointer-events-none absolute bottom-full mb-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/90 text-white text-[10px] font-bold px-2 py-1.5 rounded-md opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50 shadow-xl">
            {label}
        </div>
    </div>
);

const ControlButton = ({ onClick, children, label, extraClass = "" }) => (
    <Tip label={label}>
        <button
            onClick={onClick}
            className={`w-11 h-11 p-2.5 text-white/95 hover:text-white bg-white/5 hover:bg-white/10 backdrop-blur-md rounded-full transition-all duration-200 border border-white/5 flex items-center justify-center ${extraClass}`}
        >
            {children}
        </button>
    </Tip>
);

const VideoPlayer = ({ src, poster, onError, availableResolutions, transcodeStatus, title, channelName, onEnded: onEndedProp }) => {
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const progressRef = useRef(null);
    const progressRedRef = useRef(null);
    const thumbRef = useRef(null);
    const idleTimerRef = useRef(null);

    const [playing, setPlaying] = useState(false);
    const [ended, setEnded] = useState(false);
    const [buffering, setBuffering] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [isIdle, setIsIdle] = useState(false);
    const [seeking, setSeeking] = useState(false);
    const [hoverTime, setHoverTime] = useState(null);
    const [hoverX, setHoverX] = useState(0);
    const [settingsMenuState, setSettingsMenuState] = useState('closed');
    const [playbackRate, setPlaybackRate] = useState(1);
    const [quality, setQuality] = useState('Auto');
    const [showVolume, setShowVolume] = useState(false);

    // ── Autoplay Persisted State ──
    const [autoplay, setAutoplay] = useState(() => {
        const saved = localStorage.getItem('utube_autoplay');
        return saved !== null ? JSON.parse(saved) : true;
    });

    const updateAutoplay = (val) => {
        setAutoplay(val);
        localStorage.setItem('utube_autoplay', JSON.stringify(val));
    };

    const [skipAnimation, setSkipAnimation] = useState(null);

    const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

    // ── Fixed Quality Options per User Request ──
    const QUALITIES = React.useMemo(() => {
        const base = ['Auto'];
        const requested = [1080, 720, 480, 144];

        // If we have actual resolutions from backend, we map them.
        // Even if some are missing, we show the requested list as fixed items.
        return [...base, ...requested.map(q => `${q}p`)];
    }, []);

    const IDLE_DELAY_MS = 2500;
    const settingsMenuClosedRef = useRef(true);
    settingsMenuClosedRef.current = settingsMenuState === 'closed';

    const startIdleTimer = useCallback(() => {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
            if (settingsMenuClosedRef.current) setIsIdle(true);
        }, IDLE_DELAY_MS);
    }, []);

    const handleActivity = useCallback(() => {
        setIsIdle(false);
        startIdleTimer();
    }, [startIdleTimer]);

    useEffect(() => {
        return () => clearTimeout(idleTimerRef.current);
    }, []);

    useEffect(() => {
        if (playing) startIdleTimer();
        else setIsIdle(false);
    }, [playing, startIdleTimer]);

    const showOverlays = !isIdle || !playing;

    // ── Smooth Progress Loop (rAF) ──
    useEffect(() => {
        let frameId;
        const updateSmoothly = () => {
            const v = videoRef.current;
            if (v && !v.paused && v.duration > 0) {
                const pct = (v.currentTime / v.duration) * 100;
                if (progressRedRef.current) progressRedRef.current.style.width = `${pct}%`;
                if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
            }
            frameId = requestAnimationFrame(updateSmoothly);
        };

        if (playing) {
            frameId = requestAnimationFrame(updateSmoothly);
        } else {
            const v = videoRef.current;
            if (v && v.duration > 0) {
                const pct = (v.currentTime / v.duration) * 100;
                if (progressRedRef.current) progressRedRef.current.style.width = `${pct}%`;
                if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
            }
        }
        return () => cancelAnimationFrame(frameId);
    }, [playing]);

    // ── Robust Autoplay Trigger & Signal ──
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;

        const attemptPlay = () => {
            if (autoplay) {
                v.play().catch(e => {
                    console.warn("Autoplay still blocked:", e);
                });
            }
        };

        const handlePlayInternal = () => { setPlaying(true); setEnded(false); setBuffering(false); };
        const handlePauseInternal = () => setPlaying(false);
        const handleEndedInternal = () => {
            setPlaying(false);
            setEnded(true);
            setBuffering(false);
            // Call the prop signal to trigger "Next Video" in Parent
            if (onEndedProp) onEndedProp();
        };
        const handleTimeUpdateInternal = () => {
            setCurrentTime(v.currentTime);
            if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
        };
        const handleDurationChangeInternal = () => setDuration(v.duration);
        const handleLoadedMetadataInternal = () => {
            setDuration(v.duration);
            setCurrentTime(v.currentTime);
            attemptPlay();
        };
        const handleVolumeChangeInternal = () => { setVolume(v.volume); setMuted(v.muted); };
        const handleWaitingInternal = () => setBuffering(true);
        const handleCanPlayInternal = () => { setBuffering(false); attemptPlay(); };

        v.addEventListener('play', handlePlayInternal);
        v.addEventListener('pause', handlePauseInternal);
        v.addEventListener('ended', handleEndedInternal);
        v.addEventListener('timeupdate', handleTimeUpdateInternal);
        v.addEventListener('durationchange', handleDurationChangeInternal);
        v.addEventListener('loadedmetadata', handleLoadedMetadataInternal);
        v.addEventListener('volumechange', handleVolumeChangeInternal);
        v.addEventListener('waiting', handleWaitingInternal);
        v.addEventListener('canplay', handleCanPlayInternal);

        if (v.readyState >= 2) attemptPlay();

        return () => {
            v.removeEventListener('play', handlePlayInternal);
            v.removeEventListener('pause', handlePauseInternal);
            v.removeEventListener('ended', handleEndedInternal);
            v.removeEventListener('timeupdate', handleTimeUpdateInternal);
            v.removeEventListener('durationchange', handleDurationChangeInternal);
            v.removeEventListener('loadedmetadata', handleLoadedMetadataInternal);
            v.removeEventListener('volumechange', handleVolumeChangeInternal);
            v.removeEventListener('waiting', handleWaitingInternal);
            v.removeEventListener('canplay', handleCanPlayInternal);
        };
    }, [src, autoplay, onEndedProp]);

    useEffect(() => {
        const onChange = () => setFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
            const v = videoRef.current; if (!v) return;
            handleActivity();
            switch (e.key.toLowerCase()) {
                case ' ': case 'k': e.preventDefault(); v.paused ? v.play() : v.pause(); break;
                case 'l': v.currentTime = Math.min(v.duration, v.currentTime + 10); setSkipAnimation({ direction: 'fwd', amount: 10, key: Date.now() }); break;
                case 'j': v.currentTime = Math.max(0, v.currentTime - 10); setSkipAnimation({ direction: 'back', amount: 10, key: Date.now() }); break;
                case 'arrowright': v.currentTime = Math.min(v.duration, v.currentTime + 5); setSkipAnimation({ direction: 'fwd', amount: 5, key: Date.now() }); break;
                case 'arrowleft': v.currentTime = Math.max(0, v.currentTime - 5); setSkipAnimation({ direction: 'back', amount: 5, key: Date.now() }); break;
                case 'arrowup': v.volume = Math.min(1, v.volume + 0.1); break;
                case 'arrowdown': v.volume = Math.max(0, v.volume - 0.1); break;
                case 'm': v.muted = !v.muted; break;
                case 'f': toggleFullscreen(); break;
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleActivity]);

    const togglePlay = () => {
        const v = videoRef.current; if (!v) return;
        if (ended) v.currentTime = 0;
        v.paused ? v.play() : v.pause();
    };

    const toggleFullscreen = async () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) await containerRef.current.requestFullscreen();
        else document.exitFullscreen();
    };

    const toggleMute = () => { if (!videoRef.current) return; videoRef.current.muted = !videoRef.current.muted; };

    const setSpeed = (rate) => {
        if (!videoRef.current) return;
        videoRef.current.playbackRate = rate; setPlaybackRate(rate); setSettingsMenuState('closed');
    };

    const changeQuality = (q) => {
        setQuality(q); setSettingsMenuState('closed');
        let newSrc = src;
        const cleanQ = q.replace('p', '');
        if (q !== 'Auto' && availableResolutions && availableResolutions[cleanQ]) {
            const mediaBase = import.meta.env.VITE_MEDIA_BASE_URL || '';
            const resPath = availableResolutions[cleanQ];
            newSrc = resPath.startsWith('http') ? resPath : `${mediaBase}${resPath}`;
        }

        const v = videoRef.current; if (!v) return;
        const currentSrc = v.currentSrc || v.src || '';
        if (currentSrc.endsWith(newSrc) || currentSrc === newSrc) return;

        const savedTime = v.currentTime;
        const wasPlaying = !v.paused;
        v.src = newSrc; v.load();
        const onReady = () => {
            v.currentTime = savedTime;
            if (wasPlaying) v.play().catch(() => { });
            v.removeEventListener('loadedmetadata', onReady);
        };
        v.addEventListener('loadedmetadata', onReady);
    };

    const getSeekTime = (e) => {
        const rect = progressRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        return (x / rect.width) * duration;
    };

    const onProgressClick = (e) => { const t = getSeekTime(e); videoRef.current.currentTime = t; setCurrentTime(t); };
    const onProgressMouseMove = (e) => {
        const rect = progressRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        setHoverX(x); setHoverTime((x / rect.width) * duration);
    };
    const onProgressMouseDown = (e) => {
        setSeeking(true); const wasPlaying = !videoRef.current.paused; if (wasPlaying) videoRef.current.pause();
        const onMove = (ev) => { const t = getSeekTime(ev); videoRef.current.currentTime = t; setCurrentTime(t); };
        const onUp = () => {
            setSeeking(false); if (wasPlaying) videoRef.current.play();
            window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        onMove(e);
    };

    const onVolumeChange = (e) => {
        const v = videoRef.current; const val = parseFloat(e.target.value);
        v.volume = val; v.muted = val === 0;
    };

    const VolumeIcon = muted || volume === 0 ? VolumeMutedIcon : volume < 0.5 ? VolumeLowIcon : VolumeHighIcon;
    const progress = duration ? (currentTime / duration) * 100 : 0;
    const bufferedPct = duration ? (buffered / duration) * 100 : 0;

    return (
        <div
            ref={containerRef}
            className={`relative w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 select-none group transition-[cursor] duration-300 ${isIdle ? 'cursor-none' : ''}`}
            onMouseMove={handleActivity}
            onDoubleClick={toggleFullscreen}
        >
            <video
                ref={videoRef} key={src} src={src} poster={poster} crossOrigin="anonymous"
                className="w-full h-full object-contain" onClick={togglePlay} onError={onError}
                playsInline autoPlay={autoplay}
            />

            <AnimatePresence>
                {skipAnimation && (
                    <motion.div
                        key={skipAnimation.key} initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }}
                        onAnimationComplete={() => setSkipAnimation(null)}
                        className={`absolute top-1/2 -translate-y-1/2 pointer-events-none z-30 flex flex-col items-center justify-center w-28 h-28 rounded-full bg-black/40 backdrop-blur-xl border border-white/20 text-white shadow-2xl ${skipAnimation.direction === 'back' ? 'left-6' : 'right-6'}`}
                    >
                        <SkipAnimationIcon direction={skipAnimation.direction} amount={skipAnimation.amount} />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {buffering && playing && (
                    <motion.div
                        key="buffering" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                    >
                        <div className="w-20 h-20 text-white/50 animate-spin">
                            <svg className="w-full h-full" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {(!playing || ended) && !buffering && (
                    <motion.div
                        key={ended ? 'centreReplay' : 'centrePlay'}
                        initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                        <div className="w-28 h-28 rounded-full bg-black/30 backdrop-blur-2xl flex items-center justify-center border border-white/20 shadow-2xl">
                            <div className="w-12 h-12 text-white/90">
                                {ended ? <ReplayIcon /> : <PlayIcon />}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showOverlays && fullscreen && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="absolute inset-x-0 top-0 p-8 pt-10 pointer-events-none z-30"
                        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)' }}
                    >
                        <h2 className="text-white text-xl md:text-2xl font-bold drop-shadow-lg max-w-[80%] line-clamp-1 tracking-tight">
                            {title}
                        </h2>
                    </motion.div>
                )}
            </AnimatePresence>

            <div
                className={`absolute inset-x-0 bottom-0 px-6 pb-6 pt-8 flex flex-col gap-5 transition-opacity duration-300 ease-in-out ${showOverlays ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center w-full">
                    <div
                        ref={progressRef} className="relative flex-1 h-1.5 group/bar cursor-pointer"
                        style={{ paddingBlock: '8px', marginBlock: '-8px' }}
                        onClick={onProgressClick} onMouseMove={onProgressMouseMove} onMouseLeave={() => setHoverTime(null)} onMouseDown={onProgressMouseDown}
                    >
                        <div className="absolute inset-0 top-[calc(50%-2.5px)] h-[5px] rounded-full bg-white/20 overflow-hidden backdrop-blur-sm">
                            <div className="absolute left-0 top-0 h-full bg-white/30" style={{ width: `${bufferedPct}%` }} />
                            <div ref={progressRedRef} className="absolute left-0 top-0 h-full bg-[#ff0000] shadow-[0_0_8px_rgba(255,0,0,0.4)]" style={{ width: `${progress}%` }} />
                        </div>
                        {hoverTime !== null && (
                            <div className="absolute bottom-6 -translate-x-1/2 bg-black/95 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg pointer-events-none border border-white/10 shadow-2xl" style={{ left: hoverX }}>
                                {fmt(hoverTime)}
                            </div>
                        )}
                        <div ref={thumbRef} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#ff0000] opacity-0 group-hover/bar:opacity-100 shadow-lg border border-white/20" style={{ left: `${progress}%`, opacity: seeking ? 1 : undefined }} />
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <ControlButton onClick={togglePlay} label={playing ? 'Pause (k)' : 'Play (k)'} extraClass="!w-12 !h-12">
                            {ended ? <ReplayIcon /> : playing ? <PauseIcon /> : <PlayIcon />}
                        </ControlButton>
                        <div className="flex items-center gap-2 group/vol" onMouseEnter={() => setShowVolume(true)} onMouseLeave={() => setShowVolume(false)}>
                            <ControlButton onClick={toggleMute} label={muted ? 'Unmute (m)' : 'Mute (m)'}>
                                <VolumeIcon />
                            </ControlButton>
                            <AnimatePresence>
                                {showVolume && (
                                    <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 80, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="overflow-hidden">
                                        <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume} onChange={onVolumeChange} className="volume-slider w-20 h-1.5" style={{ '--vol': `${(muted ? 0 : volume) * 100}%` }} />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <span className="text-white/90 text-xs font-bold font-mono tracking-tight ml-2">
                            {fmt(currentTime)}<span className="text-white/40 mx-1.5">/</span>{fmt(duration)}
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2.5 bg-white/5 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/5 h-9.5">
                            <span className="text-white/95 text-[11px] font-bold select-none">Autoplay</span>
                            <div
                                onClick={() => updateAutoplay(!autoplay)}
                                className={`relative w-9 h-5 rounded-full cursor-pointer transition-colors duration-300 ${autoplay ? 'bg-white/95' : 'bg-white/10'}`}
                            >
                                <motion.div
                                    animate={{ left: autoplay ? 'calc(100% - 18px)' : '2px' }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                    className={`absolute top-0.5 w-4 h-4 rounded-full shadow-sm ${autoplay ? 'bg-black' : 'bg-white/80'}`}
                                />
                            </div>
                        </div>

                        <div className="relative">
                            <ControlButton onClick={() => setSettingsMenuState(prev => prev === 'closed' ? 'main' : 'closed')} label="Settings">
                                <SettingsIcon />
                                <div className="absolute -top-1 -right-1 bg-white text-black text-[8px] font-black px-1 rounded-sm border border-black/10">HD</div>
                            </ControlButton>
                            <AnimatePresence>
                                {settingsMenuState !== 'closed' && (
                                    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 15 }} className="absolute bottom-full right-0 mb-6 bg-black/90 backdrop-blur-3xl border border-white/15 rounded-2xl py-2 min-w-[240px] z-[100] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
                                        {settingsMenuState === 'main' && (
                                            <>
                                                <button onClick={() => setSettingsMenuState('speed')} className="w-full flex items-center justify-between px-5 py-3.5 text-[13px] font-bold text-white/90 hover:bg-white/10 transition-colors"><span>Playback speed</span><span className="text-white/50">{playbackRate === 1 ? 'Normal' : `${playbackRate}×`}</span></button>
                                                <button onClick={() => setSettingsMenuState('quality')} className="w-full flex items-center justify-between px-5 py-3.5 text-[13px] font-bold text-white/90 hover:bg-white/10 transition-colors"><span>Quality</span><span className="text-white/50">{quality}</span></button>
                                            </>
                                        )}
                                        {settingsMenuState === 'speed' && (
                                            <>
                                                <button onClick={() => setSettingsMenuState('main')} className="w-full text-left px-5 py-2.5 text-[11px] font-bold text-white/40 border-b border-white/10 tracking-widest uppercase">← Back</button>
                                                <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                                    {SPEEDS.map(s => (<button key={s} onClick={() => setSpeed(s)} className={`w-full text-left px-5 py-3 text-[13px] font-bold ${playbackRate === s ? 'text-white bg-white/10' : 'text-white/70 hover:bg-white/10 transition-colors'}`}>{s === 1 ? 'Normal' : s.toFixed(2)}</button>))}
                                                </div>
                                            </>
                                        )}
                                        {settingsMenuState === 'quality' && (
                                            <>
                                                <button onClick={() => setSettingsMenuState('main')} className="w-full text-left px-5 py-2.5 text-[11px] font-bold text-white/40 border-b border-white/10 tracking-widest uppercase">← Back</button>
                                                <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                                    {QUALITIES.map(q => (<button key={q} onClick={() => changeQuality(q)} className={`w-full text-left px-5 py-3 text-[13px] font-bold ${quality === q ? 'text-white bg-white/10' : 'text-white/70 hover:bg-white/10 transition-colors'}`}>{q}</button>))}
                                                </div>
                                            </>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <ControlButton onClick={toggleFullscreen} label="Fullscreen (f)">
                            {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
                        </ControlButton>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VideoPlayer;
