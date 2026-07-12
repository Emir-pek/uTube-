import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import ApiClient from '../utils/ApiClient';
import { UTUBE_USER } from '../utils/authConstants';
import { getMediaUrl, THUMBNAIL_FALLBACK } from '../utils/urlHelper';

// ─── Mini bar chart component ──────────────────────────────────────────────
const MiniBar = ({ value, max, color = 'var(--accent)' }) => {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    return (
        <div className="relative h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <motion.div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{ background: color }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
            />
        </div>
    );
};

// ─── Stat card component ────────────────────────────────────────────────────
const StatCard = ({ label, value, icon, color, delay = 0 }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay }}
        className="glass rounded-2xl p-6 border border-white/5 relative overflow-hidden group hover:border-white/10 transition-colors"
    >
        <div
            className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity"
            style={{ background: color }}
        />
        <div className="flex items-start justify-between mb-4 relative">
            <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-black font-black"
                style={{ background: color }}
            >
                {icon}
            </div>
        </div>
        <p className="text-3xl font-black tracking-tight mb-1 relative">{value}</p>
        <p className="text-white/40 text-xs font-bold uppercase tracking-widest relative">{label}</p>
    </motion.div>
);

// ─── Visibility badge component ─────────────────────────────────────────────
const VisibilityBadge = ({ status }) => {
    const map = {
        published: { label: 'Published', color: 'bg-emerald-500/20 text-emerald-400' },
        processing: { label: 'Processing', color: 'bg-yellow-500/20 text-yellow-400' },
        private: { label: 'Private', color: 'bg-white/10 text-white/40' },
        draft: { label: 'Draft', color: 'bg-white/10 text-white/40' },
    };
    const v = map[status] || map.draft;
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${v.color}`}>
            {v.label}
        </span>
    );
};

const Dashboard = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('upload_date'); // 'upload_date' | 'view_count' | 'like_count'
    const [sortDir, setSortDir] = useState('desc');

    useEffect(() => {
        const load = async () => {
            try {
                const meRes = await ApiClient.get('/auth/me');
                setUser(meRes.data);
                localStorage.setItem(UTUBE_USER, JSON.stringify(meRes.data));

                const vidRes = await ApiClient.get(`/videos/user/${meRes.data.id}`);
                setVideos(vidRes.data);
            } catch (e) {
                console.error('Dashboard load error:', e);
                navigate('/login');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [navigate]);

    const handleSort = (col) => {
        if (sortBy === col) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        } else {
            setSortBy(col);
            setSortDir('desc');
        }
    };

    const handleDeleteVideo = async (videoId) => {
        if (window.confirm("Are you sure you want to delete this video? This action cannot be undone.")) {
            try {
                await ApiClient.delete(`/videos/${videoId}`);
                setVideos(videos.filter(v => v.id !== videoId));
            } catch (err) {
                console.error("Error deleting video:", err);
                alert("Failed to delete video. Please try again.");
            }
        }
    };

    const sortedVideos = [...videos].sort((a, b) => {
        let av = a[sortBy], bv = b[sortBy];
        if (sortBy === 'upload_date') { av = new Date(av); bv = new Date(bv); }
        return sortDir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
    });

    const maxViews = Math.max(...videos.map(v => v.view_count || 0), 1);
    const maxLikes = Math.max(...videos.map(v => v.like_count || 0), 1);

    const SortIcon = ({ col }) => (
        <svg
            className={`w-3.5 h-3.5 transition-transform ${sortBy === col && sortDir === 'asc' ? 'rotate-180' : ''} ${sortBy === col ? '' : 'opacity-20'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
    );

    if (loading) {
        return (
            <div className="min-h-screen pt-24 px-4 md:px-8 max-w-6xl mx-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="glass rounded-2xl p-6 border border-white/5 animate-pulse h-28" />
                    ))}
                </div>
                <div className="glass rounded-2xl border border-white/5 animate-pulse h-64" />
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen pt-24 pb-16 px-4 md:px-8 max-w-6xl mx-auto"
        >
            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
                <div>
                    <p className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: 'var(--accent)' }}>
                        Creator Studio
                    </p>
                    <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                        Analytics Dashboard
                    </h1>
                    <p className="text-white/40 text-sm mt-1">Welcome back, <span className="text-white font-bold">@{user?.username}</span></p>
                </div>
                <div className="flex gap-3">
                    <Link to="/upload">
                        <button
                            style={{ background: 'var(--accent)', boxShadow: '0 0 20px var(--accent-glow)' }}
                            className="px-5 py-2.5 rounded-xl text-black font-black text-sm flex items-center gap-2 hover:brightness-110 transition-all active:scale-95"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            Upload Video
                        </button>
                    </Link>
                    <Link to="/profile">
                        <button className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 font-bold text-sm transition-all">
                            My Profile
                        </button>
                    </Link>
                </div>
            </div>

            {/* ── Stat Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
                <StatCard
                    label="Total Views"
                    value={(user?.total_views || 0).toLocaleString()}
                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                    color="var(--accent)"
                    delay={0}
                />
                <StatCard
                    label="Subscribers"
                    value={(user?.subscriber_count || 0).toLocaleString()}
                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                    color="#a855f7"
                    delay={0.05}
                />
                <StatCard
                    label="Videos"
                    value={(user?.video_count || 0).toLocaleString()}
                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
                    color="#3b82f6"
                    delay={0.1}
                />
                <StatCard
                    label="Total Likes"
                    value={videos.reduce((s, v) => s + (v.like_count || 0), 0).toLocaleString()}
                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21H4a1 1 0 01-1-1v-8a1 1 0 011-1h3l2.31-6.925A1.847 1.847 0 0111.153 3 2.847 2.847 0 0114 5.847V10z" /></svg>}
                    color="#ef4444"
                    delay={0.15}
                />
            </div>

            {/* ── Videos Table ── */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="glass rounded-2xl border border-white/5 overflow-hidden"
            >
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                    <h2 className="font-black text-lg tracking-tight flex items-center gap-2">
                        <span className="w-1 h-5 rounded-full" style={{ background: 'var(--accent)' }} />
                        Your Videos
                    </h2>
                    <span className="text-white/30 text-xs font-bold">{videos.length} total</span>
                </div>

                {sortedVideos.length === 0 ? (
                    <div className="py-20 text-center">
                        <p className="text-white/20 font-bold">No videos yet.</p>
                        <Link to="/upload" className="text-sm mt-2 inline-block font-bold" style={{ color: 'var(--accent)' }}>
                            Upload your first video →
                        </Link>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/5 text-white/30 text-xs font-black uppercase tracking-widest">
                                    <th className="px-6 py-3 text-left w-[40%]">Video</th>
                                    <th
                                        className="px-4 py-3 text-left cursor-pointer hover:text-white transition-colors select-none"
                                        onClick={() => handleSort('view_count')}
                                    >
                                        <span className="flex items-center gap-1">Views <SortIcon col="view_count" /></span>
                                    </th>
                                    <th
                                        className="px-4 py-3 text-left cursor-pointer hover:text-white transition-colors select-none"
                                        onClick={() => handleSort('like_count')}
                                    >
                                        <span className="flex items-center gap-1">Likes <SortIcon col="like_count" /></span>
                                    </th>
                                    <th className="px-4 py-3 text-left">Status</th>
                                    <th
                                        className="px-4 py-3 text-left cursor-pointer hover:text-white transition-colors select-none hidden md:table-cell"
                                        onClick={() => handleSort('upload_date')}
                                    >
                                        <span className="flex items-center gap-1">Date <SortIcon col="upload_date" /></span>
                                    </th>
                                    <th className="px-4 py-3 text-left">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                                {sortedVideos.map((video, idx) => (
                                    <motion.tr
                                        key={video.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.02 * idx }}
                                        className="hover:bg-white/[0.03] transition-colors group"
                                    >
                                        {/* Thumbnail + title */}
                                        <td className="px-6 py-4">
                                            <Link to={`/video/${video.id}`} className="flex items-center gap-3">
                                                <div className="w-20 aspect-video rounded-lg overflow-hidden shrink-0 bg-black ring-1 ring-white/5">
                                                    <img
                                                        src={getMediaUrl(video.thumbnail_url) || THUMBNAIL_FALLBACK}
                                                        alt={video.title}
                                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                        onError={(e) => { e.target.src = THUMBNAIL_FALLBACK; }}
                                                    />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm line-clamp-2 leading-snug group-hover:text-[var(--accent)] transition-colors">
                                                        {video.title}
                                                    </p>
                                                    {video.category && (
                                                        <p className="text-[10px] text-white/30 mt-0.5 uppercase tracking-wider font-bold">{video.category}</p>
                                                    )}
                                                </div>
                                            </Link>
                                        </td>

                                        {/* Views */}
                                        <td className="px-4 py-4">
                                            <p className="font-bold mb-1">{(video.view_count || 0).toLocaleString()}</p>
                                            <MiniBar value={video.view_count || 0} max={maxViews} color="var(--accent)" />
                                        </td>

                                        {/* Likes */}
                                        <td className="px-4 py-4">
                                            <p className="font-bold mb-1">{(video.like_count || 0).toLocaleString()}</p>
                                            <MiniBar value={video.like_count || 0} max={maxLikes} color="#ef4444" />
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-4">
                                            <VisibilityBadge status={video.status === 'published' ? 'published' : (video.visibility === 'private' ? 'private' : video.status)} />
                                        </td>

                                        {/* Date */}
                                        <td className="px-4 py-4 text-white/30 text-xs hidden md:table-cell">
                                            {new Date(video.upload_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>

                                        {/* Actions */}
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-2">
                                                <Link to={`/video/${video.id}`}>
                                                    <button className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors" title="Watch">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </button>
                                                </Link>
                                                <button
                                                    onClick={() => handleDeleteVideo(video.id)}
                                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/10 text-white/50 hover:text-red-500 transition-colors"
                                                    title="Delete Video"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </motion.div>

            {/* ── Top Performers ── */}
            {videos.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6"
                >
                    {/* Top by views */}
                    <div className="glass rounded-2xl border border-white/5 p-6">
                        <h3 className="font-black mb-4 flex items-center gap-2">
                            <svg className="w-4 h-4" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                            Top Videos by Views
                        </h3>
                        <div className="space-y-3">
                            {[...videos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 5).map((v, i) => (
                                <Link key={v.id} to={`/video/${v.id}`} className="flex items-center gap-3 group">
                                    <span
                                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                                        style={{ background: i === 0 ? 'var(--accent)' : 'rgba(255,255,255,0.08)', color: i === 0 ? 'black' : 'rgba(255,255,255,0.4)' }}
                                    >
                                        {i + 1}
                                    </span>
                                    <p className="text-sm font-bold truncate flex-1 group-hover:text-[var(--accent)] transition-colors">{v.title}</p>
                                    <span className="text-white/40 text-xs font-bold shrink-0">{(v.view_count || 0).toLocaleString()}</span>
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Top by likes */}
                    <div className="glass rounded-2xl border border-white/5 p-6">
                        <h3 className="font-black mb-4 flex items-center gap-2">
                            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21H4a1 1 0 01-1-1v-8a1 1 0 011-1h3l2.31-6.925A1.847 1.847 0 0111.153 3 2.847 2.847 0 0114 5.847V10z" />
                            </svg>
                            Top Videos by Likes
                        </h3>
                        <div className="space-y-3">
                            {[...videos].sort((a, b) => (b.like_count || 0) - (a.like_count || 0)).slice(0, 5).map((v, i) => (
                                <Link key={v.id} to={`/video/${v.id}`} className="flex items-center gap-3 group">
                                    <span
                                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                                        style={{ background: i === 0 ? '#ef4444' : 'rgba(255,255,255,0.08)', color: i === 0 ? 'white' : 'rgba(255,255,255,0.4)' }}
                                    >
                                        {i + 1}
                                    </span>
                                    <p className="text-sm font-bold truncate flex-1 group-hover:text-red-400 transition-colors">{v.title}</p>
                                    <span className="text-white/40 text-xs font-bold shrink-0">{(v.like_count || 0).toLocaleString()}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
};

export default Dashboard;
