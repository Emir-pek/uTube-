import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ApiClient from '../utils/ApiClient';
import { getMediaUrl, getAvatarUrl, THUMBNAIL_FALLBACK } from '../utils/urlHelper';
import { UTUBE_USER } from '../utils/authConstants';

const fmtViews = (n) => {
    if (!n && n !== 0) return '0';
    if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`;
    if (n >= 1_000) return `${Number((n / 1_000).toFixed(1))}K`;
    return n.toString();
};

const fmtDuration = (s) => {
    if (!s || !isFinite(s)) return '';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const diff = Math.max(0, Date.now() - new Date(utcStr).getTime());
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    if (d < 365) return `${Math.floor(d / 30)}mo ago`;
    return `${Math.floor(d / 365)}y ago`;
};

const PlaylistView = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [playlist, setPlaylist] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const currentUser = (() => {
        try {
            return JSON.parse(localStorage.getItem(UTUBE_USER) || 'null');
        } catch { return null; }
    })();

    useEffect(() => {
        const fetchPlaylist = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await ApiClient.get(`/playlists/${id}`);
                setPlaylist(res.data);
            } catch (err) {
                setError(err.response?.status === 404 ? 'Playlist not found' : err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchPlaylist();
        window.scrollTo(0, 0);
    }, [id]);

    const handlePlayAll = () => {
        if (!playlist?.videos?.length) return;
        const first = playlist.videos[0];
        navigate(`/video/${first.id}?list=${id}`);
    };

    const handlePlayVideo = (videoId) => {
        navigate(`/video/${videoId}?list=${id}`);
    };

    // ── Loading State ──
    if (loading) {
        return (
            <div className="min-h-screen pt-24 pb-16 px-4 md:px-8">
                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8">
                    <div className="space-y-4">
                        <div className="aspect-video bg-white/5 rounded-2xl animate-pulse" />
                        <div className="h-8 bg-white/5 rounded w-3/4 animate-pulse" />
                        <div className="h-4 bg-white/5 rounded w-1/2 animate-pulse" />
                        <div className="h-12 bg-white/5 rounded-xl animate-pulse mt-6" />
                    </div>
                    <div className="space-y-3">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="flex gap-3 animate-pulse">
                                <div className="w-40 aspect-video bg-white/5 rounded-lg shrink-0" />
                                <div className="flex-1 space-y-2 py-1">
                                    <div className="h-3 bg-white/5 rounded w-full" />
                                    <div className="h-2 bg-white/5 rounded w-2/3" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ── Error State ──
    if (error || !playlist) {
        return (
            <div className="min-h-screen pt-24 pb-16 px-4 flex flex-col items-center justify-center text-center">
                <svg className="w-16 h-16 text-white/10 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <h1 className="text-2xl font-bold text-white/80 mb-2">Playlist Not Found</h1>
                <p className="text-white/50 mb-6">{error || 'This playlist does not exist or is private.'}</p>
                <Link to="/" className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-bold transition-colors">
                    Back to Home
                </Link>
            </div>
        );
    }

    const totalDuration = playlist.videos?.reduce((s, v) => s + (v.duration || 0), 0) || 0;
    const heroThumb = playlist.videos?.[0]?.thumbnail_url
        ? getMediaUrl(playlist.videos[0].thumbnail_url)
        : THUMBNAIL_FALLBACK;

    return (
        <div className="min-h-screen pt-24 pb-16 px-4 md:px-8 text-white">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8"
                >
                    {/* ═══════════════════════════════════════════════
                        LEFT PANEL — Playlist Info & Play All
                    ═══════════════════════════════════════════════ */}
                    <div className="lg:sticky lg:top-24 lg:self-start">
                        <div className="bg-gradient-to-b from-red-950/40 via-zinc-900/80 to-zinc-900 rounded-2xl overflow-hidden border border-white/8">
                            {/* Hero Thumbnail */}
                            <div
                                className="relative aspect-video cursor-pointer group"
                                onClick={handlePlayAll}
                            >
                                <img
                                    src={heroThumb}
                                    alt={playlist.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.target.src = THUMBNAIL_FALLBACK; }}
                                />
                                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                    <div className="w-16 h-16 rounded-full bg-red-600/90 group-hover:bg-red-500 group-hover:scale-110 flex items-center justify-center shadow-xl transition-all">
                                        <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Info */}
                            <div className="p-5">
                                <h1 className="text-xl font-black tracking-tight mb-2 line-clamp-2">
                                    {playlist.title}
                                </h1>

                                {playlist.description && (
                                    <p className="text-white/50 text-sm mb-3 line-clamp-3">{playlist.description}</p>
                                )}

                                <div className="flex items-center gap-2 text-xs text-white/40 mb-5">
                                    {playlist.owner && (
                                        <Link
                                            to={`/channel/${playlist.owner.id || playlist.user_id}`}
                                            className="font-bold text-white/60 hover:text-white transition-colors"
                                        >
                                            {playlist.owner.username}
                                        </Link>
                                    )}
                                    <span>•</span>
                                    <span>{playlist.videos?.length ?? 0} video{(playlist.videos?.length ?? 0) !== 1 ? 's' : ''}</span>
                                    {totalDuration > 0 && (
                                        <>
                                            <span>•</span>
                                            <span>{fmtDuration(totalDuration)}</span>
                                        </>
                                    )}
                                </div>

                                {/* Play All Button */}
                                <button
                                    onClick={handlePlayAll}
                                    disabled={!playlist.videos?.length}
                                    className="w-full flex items-center justify-center gap-2.5 px-6 py-3 bg-white text-black hover:bg-white/90 disabled:bg-white/10 disabled:text-white/30 rounded-full font-black text-sm transition-all active:scale-95"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                    Play All
                                </button>

                                {/* Shuffle Button */}
                                <button
                                    onClick={() => {
                                        if (!playlist.videos?.length) return;
                                        const rand = playlist.videos[Math.floor(Math.random() * playlist.videos.length)];
                                        navigate(`/video/${rand.id}?list=${id}`);
                                    }}
                                    disabled={!playlist.videos?.length}
                                    className="w-full flex items-center justify-center gap-2.5 px-6 py-3 bg-white/10 hover:bg-white/15 disabled:bg-white/5 disabled:text-white/20 rounded-full font-bold text-sm transition-all active:scale-95 mt-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h3l2 5-2 5H4M20 4h-3l-2 5 2 5h3M4 20h3l2-5-2-5H4M20 20h-3l-2-5 2-5h3" />
                                    </svg>
                                    Shuffle
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ═══════════════════════════════════════════════
                        RIGHT PANEL — Video List
                    ═══════════════════════════════════════════════ */}
                    <div>
                        {playlist.videos?.length > 0 ? (
                            <div className="space-y-1">
                                {playlist.videos.map((video, idx) => (
                                    <motion.div
                                        key={video.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.03 }}
                                        onClick={() => handlePlayVideo(video.id)}
                                        className="flex gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition-all group"
                                    >
                                        {/* Index */}
                                        <div className="w-6 flex items-center justify-center shrink-0">
                                            <span className="text-xs text-white/30 font-bold group-hover:text-white/60 transition-colors">
                                                {idx + 1}
                                            </span>
                                        </div>

                                        {/* Thumbnail */}
                                        <div className="w-40 md:w-44 aspect-video rounded-lg overflow-hidden shrink-0 bg-zinc-800 relative">
                                            <img
                                                src={video.thumbnail_url ? getMediaUrl(video.thumbnail_url) : THUMBNAIL_FALLBACK}
                                                alt={video.title}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                onError={(e) => { e.target.src = THUMBNAIL_FALLBACK; }}
                                            />
                                            {video.duration && (
                                                <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-bold px-1 rounded">
                                                    {fmtDuration(video.duration)}
                                                </div>
                                            )}
                                            {/* Hover play icon */}
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                                                <svg className="w-8 h-8 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M8 5v14l11-7z" />
                                                </svg>
                                            </div>
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0 py-0.5">
                                            <h3 className="font-bold text-sm leading-tight line-clamp-2 text-white/90 group-hover:text-white transition-colors mb-1">
                                                {video.title}
                                            </h3>
                                            <p className="text-xs text-white/40 truncate">{video.author?.username}</p>
                                            <p className="text-xs text-white/30 mt-0.5">
                                                {fmtViews(video.view_count)} views
                                                {video.upload_date && ` • ${timeAgo(video.upload_date)}`}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-20 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                                <svg className="w-12 h-12 mx-auto text-white/10 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <p className="text-white/30 font-medium">This playlist has no videos yet</p>
                                <p className="text-white/20 text-sm mt-1">Add some from any video page using the Save button</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default PlaylistView;
