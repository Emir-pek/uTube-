import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import HoverVideoPreview from './HoverVideoPreview';
import { FastAverageColor } from 'fast-average-color';
import { getMediaUrl, getAvatarUrl, getValidUrl, THUMBNAIL_FALLBACK } from '../utils/urlHelper';
import toast from 'react-hot-toast';
import ApiClient from '../utils/ApiClient';
import { useWatchLater } from '../context/WatchLaterContext';

// Instantiate once globally for performance
const fac = new FastAverageColor();

// ── Time-ago helper ───────────────────────────────────────────────────────────
const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    // Ensure the date string is treated as UTC
    const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const diff = Math.max(0, Date.now() - new Date(utcStr).getTime());
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m} minutes ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hours ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} days ago`;
    if (d < 30) return `${Math.floor(d / 7)} weeks ago`;
    if (d < 365) return `${Math.floor(d / 30)} months ago`;
    return `${Math.floor(d / 365)} years ago`;
};

const fmtViews = (n) => {
    if (!n && n !== 0) return '0';
    if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1)).toString()}M`;
    if (n >= 1_000) return `${Number((n / 1_000).toFixed(1)).toString()}K`;
    return n.toString();
};

// ── Three-dot menu ────────────────────────────────────────────────────────────
// ── Per-user blocked channel storage ────────────────────────────────────────
export const getStorageKey = () => {
    try {
        const user = JSON.parse(localStorage.getItem('utube_user_data') || 'null');
        return user?.id ? `utube_blocked_channels_${user.id}` : 'utube_blocked_channels_guest';
    } catch { return 'utube_blocked_channels_guest'; }
};

export const getBlockedChannelsData = () => {
    try {
        const data = JSON.parse(localStorage.getItem(getStorageKey()) || '[]');
        // Filter out legacy integer IDs so only rich author objects are returned
        return data.filter(item => typeof item === 'object' && item !== null);
    } catch { return []; }
};

export const getBlockedChannels = () => {
    return getBlockedChannelsData().map(c => typeof c === 'object' ? c.id : c);
};

export const blockChannel = (author) => {
    const existing = getBlockedChannelsData();
    const id = author.id || author;
    if (!existing.some(c => (c.id || c) === id)) {
        localStorage.setItem(getStorageKey(), JSON.stringify([...existing, author]));
        window.dispatchEvent(new Event('utube_channel_blocked'));
    }
};

export const unblockChannel = (authorId) => {
    const existing = getBlockedChannelsData();
    const filtered = existing.filter(c => (c.id || c) !== authorId);
    localStorage.setItem(getStorageKey(), JSON.stringify(filtered));
    window.dispatchEvent(new Event('utube_channel_blocked'));
};

const getBlockedVideoKey = () => {
    try {
        const user = JSON.parse(localStorage.getItem('utube_user_data') || 'null');
        return user?.id ? `utube_blocked_videos_${user.id}` : 'utube_blocked_videos_guest';
    } catch { return 'utube_blocked_videos_guest'; }
};

export const getBlockedVideosData = () => {
    try {
        return JSON.parse(localStorage.getItem(getBlockedVideoKey()) || '[]');
    } catch { return []; }
};

export const blockVideo = (video) => {
    const existing = getBlockedVideosData();
    if (!existing.some(v => v.id === video.id)) {
        localStorage.setItem(getBlockedVideoKey(), JSON.stringify([...existing, video]));

        // Also add to session storage so we know it was blocked THIS session (and should be blurred)
        const sessionBlocked = JSON.parse(sessionStorage.getItem('utube_session_blocked_videos') || '[]');
        if (!sessionBlocked.includes(video.id)) {
            sessionStorage.setItem('utube_session_blocked_videos', JSON.stringify([...sessionBlocked, video.id]));
        }

        window.dispatchEvent(new Event('utube_video_blocked'));
    }
};

export const unblockVideo = (videoId) => {
    const existing = getBlockedVideosData();
    const filtered = existing.filter(v => v.id !== videoId);
    localStorage.setItem(getBlockedVideoKey(), JSON.stringify(filtered));

    // Remove from session
    const sessionBlocked = JSON.parse(sessionStorage.getItem('utube_session_blocked_videos') || '[]');
    sessionStorage.setItem('utube_session_blocked_videos', JSON.stringify(sessionBlocked.filter(id => id !== videoId)));

    window.dispatchEvent(new Event('utube_video_blocked'));
};

export const VideoMenu = ({ video, onHide }) => {
    const { setWatchLaterOpen, fetchWatchLaterVideos } = useWatchLater();
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleDownload = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = getMediaUrl(video.video_url || video.file_url) || null;
        if (!url) { alert('No download link available for this video.'); return; }
        const a = document.createElement('a');
        a.href = url;
        a.download = `${video.title || 'video'}.mp4`;
        a.click();
        setOpen(false);
    };

    const handleShare = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const link = `${window.location.origin}/video/${video.id}`;
        navigator.clipboard.writeText(link).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
        setOpen(false);
    };

    const handleNotInterested = (e) => {
        e.preventDefault();
        e.stopPropagation();
        blockVideo(video); // This handles both storage and session tracking
        setOpen(false);
    };

    const handleBlockChannel = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (video.author?.id) {
            blockChannel(video.author);
            onHide('channel', video.author.id);
        }
        setOpen(false);
    };

    const handleWatchLater = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await ApiClient.post(`/users/watch-later/${video.id}`);
            toast.success('Added to Watch Later');
        } catch (error) {
            if (error.response?.status === 409) {
                toast.success('Already in Watch Later');
            } else {
                toast.error('Failed to add to Watch Later');
                return; // Don't open drawer on real failures
            }
        }
        console.log('Watch Later triggered, setting state to true');
        setWatchLaterOpen(true);
        fetchWatchLaterVideos();
        setOpen(false);
    };

    const handleSaveToPlaylist = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        if (typeof onHide === 'function') {
            onHide('saveToPlaylist', video.id); // Hack: reuse onHide to bubble up to grid
        }
    };

    const items = [
        {
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            label: 'Watch Later',
            action: handleWatchLater,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
            ),
            label: 'Save to Playlist',
            action: handleSaveToPlaylist,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            ),
            label: 'Download',
            action: handleDownload,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
            ),
            label: copied ? 'Link Copied!' : 'Share',
            action: handleShare,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
            ),
            label: 'Not Interested',
            action: handleNotInterested,
            danger: true,
        },
        {
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
            ),
            label: 'Don\'t Recommend Channel',
            action: handleBlockChannel,
            danger: true,
        },
    ];

    return (
        <div ref={ref} className="relative" onClick={e => e.preventDefault()}>
            {/* Three-dot trigger */}
            <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v); }}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors text-white/50 hover:text-white"
                title="More options"
            >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                </svg>
            </button>

            {/* Dropdown */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-8 z-50 w-52 rounded-xl border border-white/10 shadow-2xl overflow-hidden"
                        style={{ background: 'rgba(18,18,18,0.97)', backdropFilter: 'blur(16px)' }}
                    >
                        {items.map(({ icon, label, action, danger }) => (
                            <button
                                key={label}
                                onClick={action}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-colors text-left
                                    ${danger
                                        ? 'text-red-400 hover:bg-red-500/10'
                                        : 'text-white/70 hover:bg-white/8 hover:text-white'
                                    }`}
                            >
                                {icon}
                                {label}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const VideoCard = ({ video, onHide, isSessionBlocked, isListLayout = false }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [dominantColor, setDominantColor] = useState('transparent');
    const hoverTimeout = useRef(null);

    const handleMouseEnter = () => {
        setIsHovered(true);
        hoverTimeout.current = setTimeout(() => {
            setShowPreview(true);
        }, 1000);
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        setShowPreview(false);
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    };

    useEffect(() => {
        return () => {
            if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        };
    }, []);

    const duration = video.duration
        ? `${Math.floor(video.duration / 60)}:${(video.duration % 60).toString().padStart(2, '0')}`
        : null;

    if (isSessionBlocked) {
        return (
            <motion.div className="relative group rounded-xl overflow-hidden aspect-video bg-white/5 border border-white/10">
                {/* Heavily Blurred Background Thumbnail */}
                <div className="absolute inset-0 z-0">
                    <img
                        src={getValidUrl(video.stream_thumbnail || video.thumbnail_url, THUMBNAIL_FALLBACK)}
                        alt="Blocked video"
                        className="w-full h-full object-cover blur-xl opacity-30 scale-110"
                    />
                </div>

                {/* Overlay Content */}
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 bg-black/60">
                    <svg className="w-8 h-8 text-white/30 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                    <p className="text-white/60 text-xs font-bold text-center mb-3">You won't see this video again.</p>
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            unblockVideo(video.id);
                        }}
                        className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-bold transition-colors"
                    >
                        Undo
                    </button>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            className={`group/card cursor-pointer relative flex ${isListLayout ? 'flex-col sm:flex-row gap-4' : 'flex-col'}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Dynamically colored full-card background that expands on hover */}
            {isHovered && dominantColor !== 'transparent' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.15 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute -top-3 -bottom-3 -left-3 -right-3 rounded-2xl z-[-1] pointer-events-none"
                    style={{ backgroundColor: dominantColor }}
                />
            )}

            {/* Thumbnail — full clickable */}
            <Link to={`/video/${video.id}`} className={`block relative z-0 group-hover/card:z-10 shrink-0 ${isListLayout ? 'w-full sm:w-[360px] md:w-[400px]' : ''}`}>

                <div
                    className={`relative aspect-video rounded-xl overflow-hidden transition-[transform,box-shadow] duration-300 group-hover/card:scale-105 group-hover/card:shadow-[0_10px_30px_rgba(0,0,0,0.5)] ${isListLayout ? '' : 'mb-3'}`}
                    style={isHovered && dominantColor !== 'transparent' ? { boxShadow: `0 10px 40px ${dominantColor}66` } : {}}
                >
                    <img
                        crossOrigin="anonymous"
                        src={(video.stream_thumbnail || video.thumbnail_url) ? getValidUrl(video.stream_thumbnail || video.thumbnail_url) : getAvatarUrl(video.author?.profile_image || video.profile_image, video.author?.username || video.username)}
                        alt={video.title || video.stream_title}
                        className="w-full h-full object-cover"
                        onLoad={(e) => {
                            fac.getColorAsync(e.target, { algorithm: 'dominant' })
                                .then(color => setDominantColor(color.hex))
                                .catch(e => console.log('FAC Error:', e));
                        }}
                        onError={(e) => { e.target.src = THUMBNAIL_FALLBACK; }}
                    />

                    {/* Hover Preview Overlay */}
                    {showPreview && (
                        <div className="absolute inset-0 z-20 pointer-events-none bg-black">
                            <AnimatePresence>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="w-full h-full"
                                >
                                    <HoverVideoPreview video={video} isGridMode={!isListLayout} />
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    )}

                    {!showPreview && duration && (
                        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded z-10">
                            {duration}
                        </div>
                    )}
                </div>
            </Link>

            {/* Info row */}
            <div className={`flex gap-3 pr-2 ${isListLayout ? 'flex-1 mt-2 sm:mt-0' : 'mt-3'}`}>
                {/* Avatar */}
                {!isListLayout && (
                    <Link
                        to={`/channel/${video.author?.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 mt-0.5"
                    >
                        <div className="w-[36px] h-[36px] rounded-full bg-surface overflow-hidden border border-white/5">
                            <img
                                src={getAvatarUrl(video.author?.profile_image, video.author?.username)}
                                alt={video.author?.username}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    e.target.src = `https://ui-avatars.com/api/?name=${video.author?.username || 'U'}&background=random&color=fff`;
                                }}
                            />
                        </div>
                    </Link>
                )}

                {/* Text + three-dot row */}
                <div className="flex-1 min-w-0 flex items-start justify-between">
                    <div className="flex-1 min-w-0 pr-2">
                        <Link to={`/video/${video.id}`} className="block">
                            <h3 className={`font-semibold text-[#f1f1f1] line-clamp-2 leading-snug transition-colors ${isListLayout ? 'text-[17px] md:text-lg mb-1' : 'text-[15px] sm:text-base'}`}>
                                {video.title}
                            </h3>
                        </Link>
                        <div className={`text-[#AAAAAA] text-[13px] mt-1 flex flex-col gap-0.5 ${isListLayout ? 'mb-2' : ''}`}>
                            {!isListLayout && (
                                <Link
                                    to={`/channel/${video.author?.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 hover:text-white transition-colors w-max"
                                >
                                    <span>{video.author?.username}</span>
                                    <svg className="w-3.5 h-3.5 text-[#AAAAAA]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" /></svg>
                                </Link>
                            )}
                            <div className="flex items-center gap-1">
                                <span>{fmtViews(video.view_count)} views</span>
                                <span className="text-[10px] mx-0.5">•</span>
                                <span>{timeAgo(video.upload_date)}</span>
                            </div>
                        </div>

                        {/* Avatar and Channel Name inline for List Layout */}
                        {isListLayout && (
                            <div className="mt-2 flex flex-col gap-3">
                                <Link
                                    to={`/channel/${video.author?.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-2 hover:text-white transition-colors w-max text-[#AAAAAA] text-[13px] group/author"
                                >
                                    <div className="w-6 h-6 rounded-full bg-surface overflow-hidden border border-white/5 shrink-0">
                                        <img
                                            src={getAvatarUrl(video.author?.profile_image, video.author?.username)}
                                            alt={video.author?.username}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                e.target.src = `https://ui-avatars.com/api/?name=${video.author?.username || 'U'}&background=random&color=fff`;
                                            }}
                                        />
                                    </div>
                                    <span className="group-hover/author:text-white transition-colors">{video.author?.username}</span>
                                    <svg className="w-3.5 h-3.5 text-[#AAAAAA]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" /></svg>
                                </Link>
                                {video.description && (
                                    <p className="hidden sm:block text-[#AAAAAA] text-[13px] line-clamp-2 pr-4 leading-relaxed">
                                        {video.description}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ⋮ Menu */}
                    {onHide && (
                        <div className="shrink-0 -mt-1 -mr-2">
                            <VideoMenu video={video} onHide={onHide} />
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

import SaveToPlaylistModal from './SaveToPlaylistModal';

const VideoGrid = ({ videos: initialVideos, loading, isListLayout = false }) => {
    // hidden will only be used directly via UI iteration now (mostly let storage handle it)
    const [blockedChannelsSet, setBlockedChannelsSet] = useState(() => new Set(getBlockedChannels()));

    // We maintain a list of all historically blocked videos
    const [blockedVideos, setBlockedVideos] = useState(() => getBlockedVideosData());

    // State for modal
    const [saveVideoId, setSaveVideoId] = useState(null);

    // We maintain a list of videos blocked only in THIS session (F5 clears this logically, but sessionStorage persists F5, so F5 keeps blur)
    // Wait, by user request: "If the user presses F5, it shouldn't reappear... remain blurred until they close the homepage. If they log out and back in, it shouldn't appear again at all."
    // `sessionStorage` survives F5 but dies on tab close. This perfectly matches the user description.
    const [sessionBlockedIds, setSessionBlockedIds] = useState(() => {
        try {
            return new Set(JSON.parse(sessionStorage.getItem('utube_session_blocked_videos') || '[]'));
        } catch { return new Set(); }
    });

    // Listen to local storage events to keep state synced across components/tabs
    useEffect(() => {
        const handleBlockEvent = () => {
            setBlockedChannelsSet(new Set(getBlockedChannels()));
            setBlockedVideos(getBlockedVideosData());

            try {
                setSessionBlockedIds(new Set(JSON.parse(sessionStorage.getItem('utube_session_blocked_videos') || '[]')));
            } catch { setSessionBlockedIds(new Set()); }
        };

        window.addEventListener('utube_channel_blocked', handleBlockEvent);
        window.addEventListener('utube_video_blocked', handleBlockEvent);

        return () => {
            window.removeEventListener('utube_channel_blocked', handleBlockEvent);
            window.removeEventListener('utube_video_blocked', handleBlockEvent);
        };
    }, []);

    // Derive visible list:
    // A video is visible if it's NOT blocked, OR if it IS blocked but it was blocked THIS SESSION (meaning we want to show it heavily blurred).
    // If it's blocked from a previous session (not in session blocked IDs), completely hide it.
    const visible = (initialVideos || []).filter(v => {
        if (blockedChannelsSet.has(v.author?.id)) return false;

        const isBlockedTotal = blockedVideos.some(bv => bv.id === v.id);
        const isBlockedThisSession = sessionBlockedIds.has(v.id);

        if (isBlockedTotal && !isBlockedThisSession) {
            // Blocked from previous session - completely hide
            return false;
        }

        // Otherwise show it (either entirely visible or blurred)
        return true;
    });

    const handleHide = useCallback((type, id) => {
        if (type === 'saveToPlaylist') {
            setSaveVideoId(id);
            return;
        }
        if (type === 'channel') {
            // Already handled in the VideoMenu via blockChannel
        }
        // blockVideo is also handled in VideoMenu, which dispatches the event that triggers our useEffect sync
    }, []);

    if (loading) {
        return (
            <div className={isListLayout ? "flex flex-col gap-6 max-w-5xl mx-auto w-full flex-1" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"}>
                {[...Array(isListLayout ? 4 : 8)].map((_, i) => (
                    <div key={i} className={`animate-pulse ${isListLayout ? "flex flex-col sm:flex-row gap-4" : ""}`}>
                        <div className={`bg-surface rounded-xl shrink-0 ${isListLayout ? "w-full sm:w-[360px] md:w-[400px] aspect-video" : "aspect-video mb-3"}`} />
                        <div className={`flex gap-3 ${isListLayout ? "flex-1 mt-2 sm:mt-0" : ""}`}>
                            {!isListLayout && <div className="w-10 h-10 rounded-full bg-surface shrink-0" />}
                            <div className={`flex-1 py-1 space-y-2 ${isListLayout ? "sm:space-y-3" : ""}`}>
                                <div className={`h-4 bg-surface rounded ${isListLayout ? "w-full" : "w-3/4"}`} />
                                <div className={`h-3 bg-surface rounded ${isListLayout ? "w-2/3" : "w-1/2"}`} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className={isListLayout ? "flex flex-col gap-6 max-w-5xl mx-auto w-full flex-1" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10"}>
            <AnimatePresence>
                {visible.map(video => (
                    <VideoCard
                        key={video.uniqueKey || video.id}
                        video={video}
                        onHide={handleHide}
                        isSessionBlocked={sessionBlockedIds.has(video.id)}
                        isListLayout={isListLayout}
                    />
                ))}
            </AnimatePresence>
            {saveVideoId && (
                <SaveToPlaylistModal
                    videoId={saveVideoId}
                    isOpen={true}
                    onClose={() => setSaveVideoId(null)}
                />
            )}
        </div>
    );
};

export default VideoGrid;
