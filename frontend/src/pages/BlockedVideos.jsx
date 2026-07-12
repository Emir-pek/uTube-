import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getBlockedVideosData, unblockVideo } from '../components/VideoGrid';
import { getMediaUrl, getAvatarUrl, THUMBNAIL_FALLBACK } from '../utils/urlHelper';
import { Link } from 'react-router-dom';

const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    // Ensure the date string is treated as UTC
    const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const diff = Math.max(0, Date.now() - new Date(utcStr).getTime());
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    if (d < 30) return `${Math.floor(d / 7)}w ago`;
    if (d < 365) return `${Math.floor(d / 30)}mo ago`;
    return `${Math.floor(d / 365)}y ago`;
};

const fmtViews = (n) => {
    if (!n && n !== 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
};

const BlockedVideoCard = ({ video }) => {
    const duration = video.duration
        ? `${Math.floor(video.duration / 60)}:${(video.duration % 60).toString().padStart(2, '0')}`
        : null;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="video-card-hover group relative"
        >
            <div className="relative aspect-video rounded-xl overflow-hidden mb-3 ring-1 ring-white/10 group-hover:ring-white/20 transition-all">
                <img
                    src={getMediaUrl(video.thumbnail_url) || THUMBNAIL_FALLBACK}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-60 grayscale-[50%]"
                    onError={(e) => { e.target.src = THUMBNAIL_FALLBACK; }}
                />

                {/* Red Overlay to signify Blocked */}
                <div className="absolute inset-0 bg-gradient-to-t from-red-900/50 via-black/20 to-transparent pointer-events-none" />

                {duration && (
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                        {duration}
                    </div>
                )}

                {/* Undo overlay that appears on hover */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4">
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            unblockVideo(video.id);
                        }}
                        className="px-5 py-2 bg-white text-black hover:bg-gray-200 rounded-full text-sm font-bold transition-transform hover:scale-105 active:scale-95 shadow-xl flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        Undo Block
                    </button>
                    <p className="text-white/70 text-[10px] mt-2 font-medium">Restore to your feed</p>
                </div>
            </div>

            <div className="flex gap-2.5">
                <div className="shrink-0 grayscale opacity-80">
                    <div className="w-8 h-8 rounded-full bg-surface overflow-hidden border border-white/10">
                        <img
                            src={getAvatarUrl(video.author?.profile_image, video.author?.username)}
                            alt={video.author?.username}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                e.target.src = `https://ui-avatars.com/api/?name=${video.author?.username || 'U'}&background=random&color=fff`;
                            }}
                        />
                    </div>
                </div>

                <div className="flex-1 min-w-0 flex gap-1">
                    <div className="flex-1 min-w-0 opacity-80">
                        <h3 className="font-bold text-xs sm:text-sm line-clamp-2 leading-tight">
                            {video.title}
                        </h3>
                        <p className="text-white/40 text-[11px] mt-0.5 truncate">
                            {video.author?.username}
                        </p>
                        <div className="flex items-center gap-1 text-white/30 text-[10px] mt-0.5">
                            <span>{fmtViews(video.view_count)} views</span>
                            <span>·</span>
                            <span>{timeAgo(video.upload_date)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

const BlockedVideos = () => {
    const [blockedVideos, setBlockedVideos] = useState([]);

    useEffect(() => {
        const syncBlocked = () => {
            setBlockedVideos(getBlockedVideosData());
        };

        syncBlocked();
        window.addEventListener('utube_video_blocked', syncBlocked);
        return () => window.removeEventListener('utube_video_blocked', syncBlocked);
    }, []);

    return (
        <div className="min-h-screen pt-24 px-4 md:px-8 max-w-[1800px] mx-auto">
            <div className="flex items-center gap-4 mb-8 border-b border-white/10 pb-6">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight mb-1">Hidden Videos</h1>
                    <p className="text-white/50 text-sm">Videos you've marked as "Not interested". They won't appear in your main feed.</p>
                </div>
            </div>

            {blockedVideos.length === 0 ? (
                <div className="py-20 text-center text-white/50 w-full flex flex-col items-center justify-center">
                    <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <p className="text-lg font-bold">No hidden videos</p>
                    <p className="text-sm mt-1 max-w-sm">When you mark a video as "Not interested", it will show up here.</p>
                    <Link to="/" className="mt-6 px-6 py-2 bg-white/10 hover:bg-white/20 transition-colors rounded-full text-sm font-bold">
                        Browse Home
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
                    <AnimatePresence>
                        {blockedVideos.map(video => (
                            <BlockedVideoCard key={video.id} video={video} />
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};

export default BlockedVideos;
