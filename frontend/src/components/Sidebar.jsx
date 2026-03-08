import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSidebar } from '../context/SidebarContext';
import { UTUBE_USER } from '../utils/authConstants';
import ApiClient from '../utils/ApiClient';
import { getMediaUrl, getAvatarUrl, THUMBNAIL_FALLBACK } from '../utils/urlHelper';
import { getBlockedChannelsData, unblockChannel, getBlockedVideosData, unblockVideo } from './VideoGrid';

// ── Duration formatter ──
const fmtDuration = (s) => {
    if (!s) return null;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
};

// ── Time ago helper ──
const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    // Ensure the date string is treated as UTC
    const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const diff = Date.now() - new Date(utcStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(utcStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// ── Section Header — matches the navbar dropdown label style  ──
const SectionHeader = ({ icon, title, tag }) => (
    <div className="flex items-center justify-between px-4 pt-2 pb-1.5">
        <div className="flex items-center gap-2">
            <span className="w-1 h-1 bg-primary rounded-full" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5">
                {icon}
                {title}
            </span>
        </div>
        {tag && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-primary/60 bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                {tag}
            </span>
        )}
    </div>
);

// ── Skeleton loaders ──
const SkeletonVideo = () => (
    <div className="flex gap-2.5 px-3 py-2 animate-pulse">
        <div className="w-[72px] aspect-video rounded-xl bg-white/5 shrink-0" />
        <div className="flex-1 space-y-1.5 py-0.5">
            <div className="h-2.5 bg-white/8 rounded w-full" />
            <div className="h-2 bg-white/5 rounded w-2/3" />
            <div className="h-2 bg-white/5 rounded w-1/3" />
        </div>
    </div>
);

const SkeletonChannel = () => (
    <div className="flex items-center gap-3 px-4 py-2 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-white/8 shrink-0" />
        <div className="flex-1 space-y-1.5">
            <div className="h-2.5 bg-white/8 rounded w-3/4" />
        </div>
    </div>
);

// ── Sign-in placeholder ──
const SignInPlaceholder = ({ label }) => (
    <div className="mx-3 my-1 px-3 py-3 rounded-xl border border-white/5 bg-white/[0.02] text-center">
        <p className="text-white/25 text-[11px] leading-relaxed">{label}</p>
    </div>
);

// ── Empty state ──
const EmptyState = ({ label }) => (
    <div className="mx-3 my-1 px-3 py-3 rounded-xl border border-white/5 bg-white/[0.02] text-center">
        <p className="text-white/20 text-[11px]">{label}</p>
    </div>
);

// ── Video Item — mirrors VideoCard from VideoGrid ──
const VideoItem = ({ video, onAction, actionTitle }) => {
    const dur = fmtDuration(video.duration);
    return (
        <div className="flex items-start gap-2.5 px-3 py-2 mx-1 rounded-xl hover:bg-white/[0.06] transition-colors group relative cursor-pointer">
            <Link to={`/video/${video.id}`} className="absolute inset-0 z-0" />

            {/* Thumbnail with duration badge */}
            <div className="relative w-[72px] aspect-video rounded-xl overflow-hidden shrink-0 ring-1 ring-white/5 z-0">
                <img
                    src={getMediaUrl(video.thumbnail_url) || THUMBNAIL_FALLBACK}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={e => { e.target.src = THUMBNAIL_FALLBACK; }}
                />
                {dur && (
                    <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[8px] font-bold px-1 py-0.5 rounded leading-none">
                        {dur}
                    </span>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 flex items-start gap-2 py-0.5 z-10 pointer-events-none">
                <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                        {video.title}
                    </p>
                    <p className="text-[10px] text-white/40 mt-0.5 truncate hover:text-white/60 transition-colors">
                        {video.author?.username || video.username}
                    </p>
                    <div className="flex items-center gap-1 text-[9px] text-white/25 mt-0.5">
                        {video.view_count !== undefined && (
                            <span>{(video.view_count || 0).toLocaleString()} views</span>
                        )}
                        {video.view_count !== undefined && video.upload_date && (
                            <span>•</span>
                        )}
                        {video.upload_date && (
                            <span>{timeAgo(video.upload_date)}</span>
                        )}
                    </div>
                </div>

                {/* Red accent arrow on hover acting as an action button */}
                {onAction && (
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (video.id) onAction(video.id);
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-primary/0 group-hover:text-primary transition-colors shrink-0 -mt-1 pointer-events-auto outline-none"
                        title={actionTitle || "Action"}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
};

// ── Channel Item — mirrors avatar style from VideoCard ──
const ChannelItem = ({ channel, onAction, actionTitle }) => {
    const username = channel.author?.username;
    const channelId = channel.author?.id;
    return (
        <div className="flex items-center gap-3 px-4 py-2 mx-1 rounded-xl hover:bg-white/[0.06] transition-colors group cursor-default">
            {/* Avatar — link to channel */}
            {channelId ? (
                <Link to={`/channel/${channelId}`} className="w-8 h-8 rounded-full bg-surface shrink-0 overflow-hidden border border-white/10 block">
                    <img
                        src={getAvatarUrl(channel.author?.profile_image, username)}
                        alt={username}
                        className="w-full h-full object-cover"
                        onError={e => {
                            e.target.src = `https://ui-avatars.com/api/?name=${username || 'U'}&background=random&color=fff`;
                        }}
                    />
                </Link>
            ) : (
                <div className="w-8 h-8 rounded-full bg-surface shrink-0 overflow-hidden border border-white/10">
                    <img
                        src={getAvatarUrl(channel.author?.profile_image, username)}
                        alt={username}
                        className="w-full h-full object-cover"
                        onError={e => {
                            e.target.src = `https://ui-avatars.com/api/?name=${username || 'U'}&background=random&color=fff`;
                        }}
                    />
                </div>
            )}

            {/* Name — link to channel */}
            <div className="flex-1 min-w-0">
                {channelId ? (
                    <Link to={`/channel/${channelId}`} className="block">
                        <p className="text-[11px] font-bold text-white/70 group-hover:text-white transition-colors truncate">
                            {username || 'Unknown'}
                        </p>
                    </Link>
                ) : (
                    <p className="text-[11px] font-bold text-white/70 group-hover:text-white transition-colors truncate">
                        {username || 'Unknown'}
                    </p>
                )}
            </div>

            {/* Red accent arrow on hover acting as an action button */}
            {onAction && (
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (channel.author?.id) onAction(channel.author.id);
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-primary/0 group-hover:text-primary transition-colors shrink-0 outline-none"
                    title={actionTitle || "Action"}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                </button>
            )}
            {!onAction && (
                <svg
                    className="w-3 h-3 text-primary/0 group-hover:text-primary/60 transition-colors shrink-0"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
            )}
        </div>
    );
};

// ── Divider ──
const Divider = () => (
    <div className="mx-4 mt-3 border-t border-white/[0.06]" />
);

// ── Main Sidebar ──
const Sidebar = () => {
    const { isSidebarOpen, handleSidebarEnter, handleSidebarLeave } = useSidebar();

    const [user, setUser] = useState(() => {
        try {
            const d = localStorage.getItem(UTUBE_USER);
            return d ? JSON.parse(d) : null;
        } catch { return null; }
    });

    const [subs, setSubs] = useState([]);
    const [history, setHistory] = useState([]);
    const [liked, setLiked] = useState([]);
    const [blocked, setBlocked] = useState([]);
    const [blockedVideos, setBlockedVideos] = useState([]);
    const [loading, setLoading] = useState({ subs: false, history: false, liked: false, blocked: false });

    // Sync user with auth events
    useEffect(() => {
        const sync = () => {
            try {
                const d = localStorage.getItem(UTUBE_USER);
                setUser(d ? JSON.parse(d) : null);
            } catch { setUser(null); }
        };
        window.addEventListener('authChange', sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener('authChange', sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    // Fetch when sidebar opens
    useEffect(() => {
        if (!isSidebarOpen || !user) return;
        setLoading(p => ({ ...p, history: true }));

        ApiClient.get('/videos/history', { params: { limit: 8 } })
            .then(r => setHistory(Array.isArray(r.data) ? r.data : r.data?.videos || []))
            .catch(() => setHistory([]))
            .finally(() => setLoading(p => ({ ...p, history: false })));

        // Fetch sub count for badge
        ApiClient.get('/feed/subscriptions', { params: { limit: 100 } })
            .then(r => {
                const seen = new Set();
                const unique = (Array.isArray(r.data) ? r.data : []).filter(v => {
                    const id = v.author?.id;
                    if (!id || seen.has(id)) return false;
                    seen.add(id);
                    return true;
                });
                setSubs(unique);
            })
            .catch(() => setSubs([]))
            .finally(() => setLoading(p => ({ ...p, subs: false })));

        ApiClient.get('/videos/liked', { params: { limit: 100 } })
            .then(r => setLiked(Array.isArray(r.data) ? r.data : r.data?.videos || []))
            .catch(() => setLiked([]))
            .finally(() => setLoading(p => ({ ...p, liked: false })));

    }, [isSidebarOpen, user]);

    // Sync blocked channels and videos from local storage and listen for block events
    useEffect(() => {
        const syncBlocked = () => {
            const data = getBlockedChannelsData();
            setBlocked(data.map(c => {
                // Return in ChannelItem format: { author: { username, profile_image } }
                if (typeof c === 'object') return { author: c };
                return { author: { id: c, username: `ID: ${c}` } };
            }));

            setBlockedVideos(getBlockedVideosData());
        };

        // Initial sync when sidebar opens/user changes
        if (isSidebarOpen) {
            syncBlocked();
        }

        window.addEventListener('utube_channel_blocked', syncBlocked);
        window.addEventListener('utube_video_blocked', syncBlocked);
        return () => {
            window.removeEventListener('utube_channel_blocked', syncBlocked);
            window.removeEventListener('utube_video_blocked', syncBlocked);
        };
    }, [isSidebarOpen, user]);

    // Deduplicated subscription channels
    const channels = (() => {
        const seen = new Set();
        return subs.filter(v => {
            const id = v.author?.id;
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    })();

    const handleUnsubscribe = async (authorId) => {
        try {
            await ApiClient.delete(`/auth/subscribe/${authorId}`);
            // Optimistically update the UI by filtering out the unsubscribed channel
            setSubs(prev => prev.filter(v => v.author?.id !== authorId));
            // Trigger a global event so other components (like VideoDetail) can update their state
            window.dispatchEvent(new Event('utube_subscription_changed'));
        } catch (error) {
            console.error("Failed to unsubscribe:", error);
            // In a real app, maybe show a toast notification here
        }
    };

    return (
        <AnimatePresence>
            {isSidebarOpen && (
                <motion.aside
                    key="sidebar"
                    onMouseEnter={handleSidebarEnter}
                    onMouseLeave={handleSidebarLeave}
                    initial={{ x: -260, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -260, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 340, damping: 36 }}
                    className="fixed left-0 top-0 bottom-0 pt-16 sm:pt-20 w-60 z-[60] flex flex-col border-r border-white/[0.06] shadow-[10px_0_30px_rgba(0,0,0,0.5)]"
                    style={{
                        background: 'rgba(8, 8, 8, 0.95)',
                        backdropFilter: 'blur(30px)',
                        WebkitBackdropFilter: 'blur(30px)',
                    }}
                >
                    {/* Top gradient accent */}
                    <div
                        className="absolute top-0 left-0 right-0 h-32 pointer-events-none z-0"
                        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(139,0,0,0.18) 0%, transparent 70%)' }}
                    />

                    {/* Scrollable content (pulled up via negative margin to occupy navbar space) */}
                    <div className="flex-1 overflow-y-auto sidebar-scroll pb-10 relative z-10 -mt-14 pt-4">

                        {/* ── Logo ── (Now scrolls with content) */}
                        <div className="flex justify-center pb-8 pt-2 relative shrink-0">
                            {/* Rotating Red LED Glow */}
                            <motion.div
                                animate={{ opacity: [0.3, 0.7, 0.3], scale: [0.9, 1.1, 0.9], rotate: 360 }}
                                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-20 bg-primary/20 blur-xl rounded-full pointer-events-none"
                            />
                            <Link to="/" onClick={handleSidebarLeave} className="flex items-center gap-2 group relative z-10">
                                {/* Static Logo with hover tilt */}
                                <motion.div
                                    whileHover={{ rotate: -10, scale: 1.1 }}
                                    className="w-16 sm:w-20"
                                >
                                    <img src="/utube.png" alt="uTube" className="w-full h-auto object-contain drop-shadow-[0_0_15px_rgba(255,0,0,0.8)]" />
                                </motion.div>
                            </Link>
                        </div>

                        {/* ── Subscriptions ── */}
                        <SectionHeader
                            icon={
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            }
                            title="Subscriptions"
                            tag="Channels"
                        />

                        {!user ? (
                            <SignInPlaceholder label="Sign in to see your subscriptions" />
                        ) : (
                            <Link
                                to="/subscriptions"
                                className="flex items-center gap-3 px-4 py-2 mx-1 rounded-xl hover:bg-white/[0.06] transition-colors group"
                            >
                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 text-white/40 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-[11px] font-bold text-white/70 group-hover:text-white transition-colors">Manage Subscriptions</p>
                                    {subs.length > 0 && (
                                        <p className="text-[9px] text-white/40">{subs.length} channel{subs.length !== 1 ? 's' : ''}</p>
                                    )}
                                </div>
                                <svg className="w-3 h-3 text-white/0 group-hover:text-white/40 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                            </Link>
                        )}

                        <Divider />

                        {/* ── Watch History ── */}
                        <SectionHeader
                            icon={
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            }
                            title="Watch History"
                            tag="Recent"
                        />

                        {!user ? (
                            <SignInPlaceholder label="Sign in to see your watch history" />
                        ) : loading.history ? (
                            [...Array(3)].map((_, i) => <SkeletonVideo key={i} />)
                        ) : history.length > 0 ? (
                            history.map(v => <VideoItem key={v.id} video={v} />)
                        ) : (
                            <EmptyState label="No watch history yet" />
                        )}

                        <Divider />

                        {/* ── Liked Videos ── */}
                        <SectionHeader
                            icon={
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                                </svg>
                            }
                            title="Liked Videos"
                            tag="All"
                        />

                        {!user ? (
                            <SignInPlaceholder label="Sign in to see your liked videos" />
                        ) : (
                            <Link
                                to="/liked"
                                className="flex items-center gap-3 px-4 py-2 mx-1 rounded-xl hover:bg-white/[0.06] transition-colors group"
                            >
                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 text-white/40 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-[11px] font-bold text-white/70 group-hover:text-white transition-colors">Browse Liked Videos</p>
                                    {liked.length > 0 && (
                                        <p className="text-[9px] text-white/40">{liked.length} video{liked.length !== 1 ? 's' : ''}</p>
                                    )}
                                </div>
                                <svg className="w-3 h-3 text-white/0 group-hover:text-white/40 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                            </Link>
                        )}

                        {/* ── Watch Later ── */}
                        {user && (
                            <Link
                                to="/watch-later"
                                className="flex items-center gap-3 px-4 py-2 mx-1 rounded-xl hover:bg-white/[0.06] transition-colors group"
                            >
                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 text-white/40 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-[11px] font-bold text-white/70 group-hover:text-white transition-colors">Watch Later</p>
                                </div>
                                <svg className="w-3 h-3 text-white/0 group-hover:text-white/40 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                            </Link>
                        )}
                        <Divider />

                        {/* ── Creator Tools ── */}
                        {
                            user && (
                                <>
                                    <SectionHeader
                                        icon={<span className="text-[10px]">🛠️</span>}
                                        title="Creator Tools"
                                        tag="Admin"
                                    />
                                    <Link
                                        to="/dashboard/moderation"
                                        className="flex items-center gap-3 px-4 py-2 mx-1 rounded-xl hover:bg-white/[0.06] transition-colors group"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-[#00ffcc]/10 border border-[#00ffcc]/20 flex items-center justify-center shrink-0">
                                            <span className="text-[14px] text-[#00ffcc]/40 group-hover:text-[#00ffcc] transition-colors">🛡️</span>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[11px] font-bold text-white/70 group-hover:text-white transition-colors">Moderation Center</p>
                                            <p className="text-[9px] text-[#00ffcc]/40 uppercase tracking-tighter">Security Matrix</p>
                                        </div>
                                        <svg
                                            className="w-3 h-3 text-white/0 group-hover:text-white/40 transition-colors shrink-0"
                                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </Link>
                                    <Divider />
                                </>
                            )
                        }

                        {/* ── Blocked Videos ── */}
                        <SectionHeader
                            icon={
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                            }
                            title="Not interested"
                            tag="History"
                        />

                        {
                            !user ? (
                                <SignInPlaceholder label="Sign in to view" />
                            ) : (
                                <Link
                                    to="/blocked"
                                    className="flex items-center gap-3 px-4 py-2 mx-1 rounded-xl hover:bg-white/[0.06] transition-colors group"
                                >
                                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                                        <svg className="w-4 h-4 text-white/40 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[11px] font-bold text-white/70 group-hover:text-white transition-colors">Manage Hidden Videos</p>
                                        {blockedVideos.length > 0 && (
                                            <p className="text-[9px] text-white/40">{blockedVideos.length} videos</p>
                                        )}
                                    </div>
                                    <svg
                                        className="w-3 h-3 text-white/0 group-hover:text-white/40 transition-colors shrink-0"
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                    </svg>
                                </Link>
                            )
                        }

                        <Divider />

                        {/* ── Blocked Channels ── */}
                        <SectionHeader
                            icon={
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                            }
                            title="Don't recommend"
                            tag="Channels"
                        />

                        {
                            !user ? (
                                <SignInPlaceholder label="Sign in to see blocked channels" />
                            ) : loading.blocked ? (
                                [...Array(2)].map((_, i) => <SkeletonChannel key={i} />)
                            ) : blocked.length > 0 ? (
                                blocked.map(c => (
                                    <ChannelItem
                                        key={c.author.username}
                                        channel={c}
                                        onAction={unblockChannel}
                                        actionTitle="Undo Recommend Block"
                                    />
                                ))
                            ) : (
                                <EmptyState label="No blocked channels" />
                            )}
                    </div>

                    {/* Bottom fade mask */}
                    <div
                        className="h-10 shrink-0 pointer-events-none"
                        style={{ background: 'linear-gradient(to top, rgba(8,8,8,0.95), transparent)' }}
                    />
                </motion.aside>
            )
            }
        </AnimatePresence >
    );
};

export default Sidebar;
