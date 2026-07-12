import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getMediaUrl, THUMBNAIL_FALLBACK } from '../utils/urlHelper';
import { Link } from 'react-router-dom';
import ApiClient from '../utils/ApiClient';
import HoverVideoPreview from './HoverVideoPreview';

// ── Title Animation handled by Framer Motion ───────────────
// Helper to accurately cap preview and slide loop lengths based on video length
const getSlideDuration = (video) => {
    if (!video || !video.duration) return 8;
    const dur = parseFloat(video.duration);
    if (isNaN(dur) || dur <= 0) return 8;
    return Math.min(dur, 8);
};



// ── HeroSection ──────────────────────────────────────────────────────────────
const HeroSection = ({ videos }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showIndicators, setShowIndicators] = useState(true);
    const [topComment, setTopComment] = useState(null);
    const [isPreviewActive, setIsPreviewActive] = useState(false);

    // Auto-rotate videos with dynamic duration up to 8s max
    useEffect(() => {
        if (!videos || videos.length === 0 || isPreviewActive) return;

        const currentVideo = videos[currentIndex];
        const timeout = setTimeout(() => {
            setCurrentIndex(prev => (prev + 1) % videos.length);
        }, (getSlideDuration(currentVideo) + 0.5) * 1000);

        return () => clearTimeout(timeout);
    }, [videos, currentIndex, isPreviewActive]);

    // Fetch top comment for current video
    useEffect(() => {
        const video = videos?.[currentIndex];
        if (!video?.id) return;

        setTopComment(null); // reset while loading
        ApiClient.get(`/videos/${video.id}/comments`, { params: { limit: 50 } })
            .then(res => {
                const comments = res.data || [];
                if (comments.length === 0) {
                    setTopComment('no-comments');
                    return;
                }
                const best = comments.reduce((top, c) => {
                    const topLikes = top?.like_count || 0;
                    const cLikes = c?.like_count || 0;
                    if (cLikes > topLikes) return c;
                    if (cLikes === topLikes) {
                        return new Date(c.created_at) > new Date(top.created_at) ? c : top;
                    }
                    return top;
                }, comments[0]);
                setTopComment(best);
            })
            .catch(() => setTopComment(null));
    }, [currentIndex, videos]);

    if (!videos || videos.length === 0) {
        return (
            <div className="h-[60vh] w-full bg-neutral-900 animate-pulse flex items-center justify-center">
                <span className="text-white/20 text-4xl font-black italic">uTube Premium</span>
            </div>
        );
    }

    const currentVideo = videos[currentIndex];

    // Perimeters mapping for "Inter Black" font size 500px to ensure the LED loop is seamless for every digit
    const perimeters = {
        1: 1100, 2: 1700, 3: 1900, 4: 1900, 5: 2000,
        6: 2100, 7: 1300, 8: 2400, 9: 2200, 10: 3000
    };
    const currentNum = currentIndex + 1;
    const baseP = perimeters[currentNum] || 2000;
    const animDuration = `${(baseP / 250).toFixed(1)}s`;

    return (
        <div className="relative w-full max-w-[95%] mx-auto mt-4 rounded-3xl overflow-hidden h-[55vh] bg-black shadow-[0_0_50px_rgba(239,68,68,0.15)] border border-primary/20">

            {/* ── TOP-LEFT: Trending Badge (fixed, above motion layer) ── */}
            <div className="absolute top-6 left-6 z-30 flex flex-col items-start gap-1.5">
                <AnimatePresence mode="wait">
                    <motion.span
                        key={currentIndex}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.3 }}
                        className="bg-primary text-white text-sm font-black px-4 py-2 rounded-lg inline-flex items-center gap-2 tracking-widest uppercase shadow-[0_0_20px_rgba(255,0,0,0.6)]"
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                        Trending #{currentIndex + 1}
                    </motion.span>
                </AnimatePresence>

                {/* Category label */}
                <AnimatePresence mode="wait">
                    {currentVideo.category && (
                        <motion.span
                            key={`cat-${currentIndex}`}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 6 }}
                            transition={{ duration: 0.3, delay: 0.1 }}
                            className="text-white/60 text-[11px] font-semibold uppercase tracking-widest pl-1"
                        >
                            {currentVideo.category}
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Background Tracking Number (extracted so it doesn't fade to black during gap) ── */}
            <div className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden">
                <AnimatePresence mode="popLayout">
                    <motion.div
                        key={`bg-num-${currentIndex}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.05 }}
                        transition={{ duration: 0.8 }}
                        className="absolute inset-0"
                    >
                        {/* 1) Original CSS Number Design (Solid Background) */}
                        <div className="absolute inset-0 flex items-center justify-center -translate-x-12 lg:-translate-x-24 text-[200px] md:text-[350px] lg:text-[500px] font-black tracking-tighter text-primary/30" style={{ textShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
                            {currentIndex + 1}
                        </div>

                        {/* 2) Animated SVG Number Outline Overlay */}
                        <svg className="absolute inset-0 w-full h-full -translate-x-12 lg:-translate-x-24 pointer-events-none z-10 overflow-visible">
                            <defs>
                                <filter id="glow-red">
                                    <feGaussianBlur stdDeviation="15" result="coloredBlur" />
                                    <feMerge>
                                        <feMergeNode in="coloredBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                                <style>
                                    {`
                                        @keyframes dash {
                                            to {
                                                stroke-dashoffset: calc(var(--p) * -1);
                                            }
                                        }
                                        @keyframes ledColorChange {
                                            0%, 100% { stroke: #991b1b; } /* Burgundy / Tailwind red-800 */
                                            33%      { stroke: #ef4444; } /* Red / Tailwind red-500 */
                                            66%      { stroke: #ffffff; } /* White */
                                        }
                                        .animated-led-number {
                                            --p: calc(var(--base-p) * var(--scale) * 1px);
                                            stroke-dasharray: calc(var(--p) * 0.2) calc(var(--p) * 0.8);
                                            stroke-dashoffset: 0;
                                            animation: 
                                                dash var(--anim-duration) linear infinite,
                                                ledColorChange 8s ease-in-out infinite;
                                        }
                                        .responsive-svg-text {
                                            font-size: 200px;
                                            --scale: 0.4;
                                        }
                                        @media (min-width: 768px) {
                                            .responsive-svg-text { font-size: 350px; --scale: 0.7; }
                                        }
                                        @media (min-width: 1024px) {
                                            .responsive-svg-text { font-size: 500px; --scale: 1; }
                                        }
                                    `}
                                </style>
                            </defs>
                            <text
                                x="50%"
                                y="50%"
                                dominantBaseline="central"
                                textAnchor="middle"
                                className="font-black tracking-tighter animated-led-number responsive-svg-text"
                                style={{
                                    '--base-p': baseP,
                                    '--anim-duration': animDuration,
                                    fill: "transparent",
                                    strokeWidth: "6px",
                                    filter: "url(#glow-red)"
                                }}
                            >
                                {currentIndex + 1}
                            </text>
                        </svg>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* ── Main slide area ── */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentVideo.uniqueKey || currentVideo.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0 flex cursor-grab active:cursor-grabbing z-10"
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.2}
                    onDragEnd={(e, { offset }) => {
                        const swipe = offset.x;
                        if (swipe < -50) {
                            setCurrentIndex(prev => (prev + 1) % videos.length);
                        } else if (swipe > 50) {
                            setCurrentIndex(prev => (prev - 1 + videos.length) % videos.length);
                        }
                    }}
                >

                    {/* LEFT: content */}
                    {/* Increased width percentage to push the video further right */}
                    <div
                        className="w-1/2 md:w-[60%] relative flex flex-col p-8 md:p-12 z-20 pointer-events-auto"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        {/* Text content */}
                        <div className="relative mt-auto">
                            {/* Animated title — typewriter */}
                            <TypewriterTitle text={currentVideo.title} />

                            {/* Actions row */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-6">
                                <Link to={`/video/${currentVideo.id}`}>
                                    <div className="relative group/watch-btn z-10">
                                        {/* Volumetric Smoky Aura (Tightly hugging the button) */}
                                        <div className="absolute -inset-1.5 opacity-40 group-hover/watch-btn:opacity-80 transition-opacity duration-500 pointer-events-none mix-blend-screen">
                                            {/* Slow moving thick smoke */}
                                            <motion.div
                                                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                                                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/70 to-transparent bg-[length:300%_auto] blur-md"
                                            />

                                            {/* Faster moving wispy smoke layer */}
                                            <motion.div
                                                animate={{ backgroundPosition: ["100% 50%", "0% 50%", "100% 50%"] }}
                                                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                                                className="absolute inset-0 bg-gradient-to-l from-transparent via-white/40 to-transparent bg-[length:250%_auto] blur-sm"
                                            />
                                        </div>

                                        {/* Foregound Glass Button */}
                                        <button className="relative bg-black/60 backdrop-blur-xl px-6 py-2.5 rounded-xl flex items-center gap-2 border border-white/20 group-hover/watch-btn:bg-black/40 group-hover/watch-btn:border-white/40 transition-all duration-300 shadow-[0_0_20px_-5px_rgba(255,255,255,0.4)] hover:scale-105 active:scale-95 w-full">
                                            <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center shadow-[0_0_10px_rgba(255,0,0,0.5)]">
                                                <svg className="w-3 h-3 translate-x-px fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                            </div>
                                            <span className="text-white font-bold tracking-wide text-sm drop-shadow-sm group-hover/watch-btn:text-primary transition-colors">Watch Now</span>
                                        </button>
                                    </div>
                                </Link>

                                {/* Top Comment chip — linked to real comments */}
                                <TopCommentChip
                                    comment={topComment}
                                    videoId={currentVideo.id}
                                />
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: thumbnail */}
                    {/* Decreased width percentage so it takes up less space and sits further right */}
                    <div className="w-1/2 md:w-[40%] relative h-full pr-12 lg:pr-16 flex items-center justify-center">
                        {/* 16:9 Aspect Ratio Container for both image and hover preview */}
                        <div className="w-full relative aspect-video rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] ring-1 ring-white/10 group/preview-btn cursor-pointer bg-neutral-900/50">
                            {/* Base Image */}
                            <img
                                src={getMediaUrl(currentVideo.thumbnail_url) || THUMBNAIL_FALLBACK}
                                alt={currentVideo.title}
                                className="absolute inset-0 w-full h-full object-cover rounded-xl"
                                onError={(e) => { e.target.src = THUMBNAIL_FALLBACK; }}
                                draggable={false}
                            />

                            {/* Bottom Red Glow Overlay (applies to the static image) */}
                            <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent rounded-xl z-10 pointer-events-none transition-opacity duration-500 opacity-70 group-hover/preview-btn:opacity-100" />

                            {/* HoverVideoPreview inserted strictly inside the bounds of the image container, above the blur */}
                            <HoverVideoPreview video={currentVideo} onHoverChange={setIsPreviewActive} />
                        </div>

                        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black via-transparent to-transparent z-10" />
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* ── Carousel Indicators — toggleable ── */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 z-50">
                <motion.div
                    initial={false}
                    animate={{
                        width: showIndicators ? 6 : 0,
                        opacity: showIndicators ? 1 : 0,
                        marginRight: showIndicators ? 0 : -8
                    }}
                    transition={{ duration: 0.25 }}
                    className="flex flex-col gap-3 overflow-hidden pointer-events-auto"
                    style={{ pointerEvents: showIndicators ? 'auto' : 'none' }}
                >
                    {videos.slice(0, 5).map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentIndex(idx)}
                            className={`relative w-1.5 shrink-0 rounded-full overflow-hidden transition-all duration-300 ${idx === currentIndex
                                ? 'h-16 bg-white/10'
                                : 'h-12 bg-white/20 hover:bg-white/40'
                                }`}
                        >
                            {idx === currentIndex && (
                                <motion.div
                                    key={`indicator-${currentIndex}`}
                                    initial={{ height: '0%' }}
                                    animate={{ height: '100%' }}
                                    transition={{ duration: getSlideDuration(videos[currentIndex]), delay: 0.5, ease: 'linear' }}
                                    className="absolute top-0 left-0 w-full bg-primary shadow-[0_0_10px_rgba(255,0,0,0.8)] rounded-full"
                                />
                            )}
                        </button>
                    ))}
                </motion.div>

                {/* Toggle chevron */}
                <button
                    onClick={() => setShowIndicators(v => !v)}
                    className="w-5 h-5 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors shrink-0"
                    title={showIndicators ? 'Hide navigation' : 'Show navigation'}
                >
                    <motion.svg
                        animate={{ rotate: showIndicators ? 0 : 180 }}
                        transition={{ duration: 0.2 }}
                        className="w-3 h-3 text-white/60"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </motion.svg>
                </button>
            </div>
        </div>
    );
};

// ── Typewriter title sub-component ──────────────────────────────────────────
const TypewriterTitle = ({ text }) => {
    if (!text) return null;

    // Per user request, treat the entire string as characters (including spaces)
    // and strictly truncate it if it exceeds the limit (e.g., 18 characters).
    let displayStr = text.trim();
    if (displayStr.length > 18) {
        displayStr = displayStr.slice(0, 18) + '...';
    }

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            // The exact gentle, fast stagger you liked.
            transition: { staggerChildren: 0.06, delayChildren: 0.1 }
        }
    };

    const item = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { duration: 0.3 } }
    };

    const isTruncated = displayStr !== text.trim();

    return (
        <div className="relative group/title inline-flex flex-col items-start">
            <motion.h1
                key={text}
                variants={container}
                initial="hidden"
                animate="show"
                className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight tracking-tight drop-shadow-md min-h-[1.2em] cursor-default"
            >
                {displayStr.split('').map((char, index) => (
                    <motion.span key={index} variants={item}>
                        {char}
                    </motion.span>
                ))}
            </motion.h1>

            {/* Custom Hover Tooltip */}
            {isTruncated && (
                <div className="absolute top-full left-0 mt-2 w-max max-w-[280px] sm:max-w-[400px] z-50 pointer-events-none opacity-0 group-hover/title:opacity-100 transition-opacity duration-300">
                    <div className="bg-neutral-900/90 backdrop-blur-md border border-white/10 text-white/90 text-sm font-medium py-2.5 px-3.5 rounded-xl shadow-2xl whitespace-normal leading-snug">
                        {text}
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Top Comment chip sub-component ──────────────────────────────────────────
const TopCommentChip = ({ comment, videoId }) => {
    // Infrastructure: comment object comes from the parent's API fetch.
    if (!comment) return null;

    if (comment === 'no-comments') {
        return (
            <Link
                to={`/video/${videoId}#comments`}
                className="relative overflow-hidden bg-neutral-900/60 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-xl max-w-[240px] hidden lg:flex flex-col gap-1 hover:border-white/20 hover:bg-neutral-800/80 transition-all duration-300 group shadow-lg"
            >
                <div className="flex items-center gap-1.5 mb-0.5">
                    <svg className="w-3 h-3 text-white/40" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                    </svg>
                    <p className="text-[9px] text-white/40 uppercase font-black tracking-wider">Comments</p>
                </div>
                <p className="text-xs text-white/50 italic group-hover:text-white/80 transition-colors">
                    No comments yet.
                </p>
            </Link>
        );
    }

    const authorName = comment.author?.username || 'Anonymous';
    const commentText = comment.text || '';

    return (
        <Link
            to={`/video/${videoId}#comments`}
            className="relative overflow-hidden bg-neutral-900/60 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-xl lg:max-w-[280px] xl:max-w-[320px] hidden lg:flex flex-col hover:border-primary/50 hover:bg-neutral-800/80 transition-all duration-300 group shadow-lg"
        >
            <div className="flex items-center justify-between w-full mb-1">
                <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-primary" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                        </svg>
                    </div>
                    <p className="text-[9px] text-primary/90 uppercase font-bold tracking-wider">Top Comment</p>
                </div>
                {comment.like_count > 0 && (
                    <span className="text-[9px] font-bold text-white/50 border border-white/10 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        {comment.like_count} <span className="text-primary text-[9px]">♥</span>
                    </span>
                )}
            </div>

            <p className="text-[13px] text-white/90 leading-snug line-clamp-2 group-hover:text-white transition-colors font-medium mb-1">
                "{commentText}"
            </p>

            <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-neutral-600 to-neutral-800 flex items-center justify-center">
                    <span className="text-[7px] text-white/60 font-bold uppercase">{authorName.charAt(0)}</span>
                </div>
                <p className="text-[10px] text-white/40 tracking-wide">
                    @{authorName}
                </p>
            </div>
        </Link>
    );
};

export default HeroSection;
