import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getMediaUrl } from '../utils/urlHelper';

// Helper to accurately cap preview and slide loop lengths based on video length
const getSlideDuration = (video) => {
    if (!video || !video.duration) return 8;
    const dur = parseFloat(video.duration);
    if (isNaN(dur) || dur <= 0) return 8;
    return Math.min(dur, 8);
};

export const HoverVideoPreview = ({
    video,
    onHoverChange,
    // If true, removes the giant 'Preview' button overlay meant for HeroSection
    isGridMode = false
}) => {
    const [isHovered, setIsHovered] = useState(isGridMode ? true : false);
    const [progress, setProgress] = useState(0);
    const videoRef = useRef(null);

    const videoUrl = getMediaUrl(video.video_url || video.file_url);

    useEffect(() => {
        const v = videoRef.current;
        if (!v || !isHovered) return;

        const handleTimeUpdate = () => {
            const duration = video.duration || v.duration;
            if (!duration) return;

            // Loop at whichever comes first: 7 seconds, or 1.5 seconds before the video ends.
            const loopPoint = Math.min(7, Math.max(0.5, duration - 1.5));

            if (v.currentTime >= loopPoint) {
                v.currentTime = 0.05;
                v.play().catch(e => console.log(e));
                setProgress(0);
            } else {
                setProgress((v.currentTime / loopPoint) * 100);
            }
        };

        v.addEventListener('timeupdate', handleTimeUpdate);

        v.currentTime = 0;
        setProgress(0);
        v.play().catch(e => console.log('Autoplay prevented:', e));

        return () => {
            v.removeEventListener('timeupdate', handleTimeUpdate);
            v.pause();
        };
    }, [isHovered, video.duration]);

    if (!videoUrl) return null;

    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none rounded-xl overflow-hidden group/preview-btn">
            <div
                className="relative w-full h-full pointer-events-auto"
                onMouseEnter={() => {
                    if (!isGridMode) {
                        setIsHovered(true);
                        onHoverChange && onHoverChange(true);
                    }
                }}
                onMouseLeave={() => {
                    if (!isGridMode) {
                        setIsHovered(false);
                        onHoverChange && onHoverChange(false);
                    }
                }}
            >
                {/* Hero Section specific 'Preview' Button with progress bar */}
                {!isGridMode && (
                    <div className={`absolute inset-0 flex items-center justify-center z-50 transition-opacity duration-300 ${isHovered ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                        <div className="relative overflow-hidden backdrop-blur-md px-5 py-2.5 rounded-full border border-white/20 text-white font-bold text-sm tracking-widest uppercase flex items-center gap-2 shadow-[0_0_30px_rgba(0,0,0,0.8)] group-hover/preview-btn:scale-110 transition-transform">
                            <div className="absolute inset-0 bg-black/80 z-0"></div>
                            <motion.div
                                key={`preview-fill-${video.id}`}
                                initial={{ width: '0%' }}
                                animate={{ width: '100%' }}
                                transition={{ duration: getSlideDuration(video), ease: 'linear' }}
                                className="absolute inset-y-0 left-0 bg-primary/70 z-0"
                            />
                            <div className="relative z-10 flex items-center gap-2 pointer-events-none">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                Preview
                            </div>
                        </div>
                    </div>
                )}

                {/* The Video Element */}
                {isHovered && (
                    <div className="absolute inset-0 bg-black/95 z-40">
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            muted
                            playsInline
                            loop
                            className="w-full h-full object-cover pointer-events-none animate-in fade-in duration-300"
                        />
                        {isGridMode && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-50">
                                <div
                                    className="h-full bg-red-600 transition-all duration-[250ms] ease-linear"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default HoverVideoPreview;
