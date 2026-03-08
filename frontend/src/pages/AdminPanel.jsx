import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import ApiClient from '../utils/ApiClient';
import { UTUBE_USER } from '../utils/authConstants';

// ── Section Tabs ──────────────────────────────────────────────────
const TABS = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'videos', label: '🎥 Videos' },
    { id: 'users', label: '👤 Users' },
    { id: 'comments', label: '💬 Comments' },
    { id: 'warnings', label: '⚠️ Warnings' },
    { id: 'audit', label: '📋 Audit Log' },
];

// ── Shared UI Primitives ──────────────────────────────────────────
const PillBadge = ({ children, color = 'gray' }) => {
    const colors = {
        red: 'bg-red-500/20 text-red-400 border border-red-500/30',
        green: 'bg-green-500/20 text-green-400 border border-green-500/30',
        blue: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
        yellow: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
        orange: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
        gray: 'bg-white/10 text-white/60 border border-white/10',
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${colors[color]}`}>{children}</span>;
};

/** Styled action button matching the pill badge aesthetic */
const ActionBtn = ({ onClick, children, variant = 'danger', disabled = false, size = 'sm' }) => {
    const variants = {
        danger: 'bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30',
        warning: 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/30',
        success: 'bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30',
        default: 'bg-white/10 border border-white/15 text-white/70 hover:bg-white/20',
        solid: 'bg-red-600 border border-red-500 text-white hover:bg-red-500',
    };
    const sizes = {
        sm: 'px-3 py-1 text-[11px] rounded-lg',
        md: 'px-4 py-2 text-sm rounded-xl',
    };
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`font-semibold transition-all ${variants[variant]} ${sizes[size]} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
            {children}
        </button>
    );
};

const SearchBar = ({ value, onChange, placeholder }) => (
    <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full max-w-sm bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-red-500/50 transition-colors"
    />
);

const ConfirmModal = ({ message, onConfirm, onCancel }) => (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center" onClick={onCancel}>
        <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-white text-sm mb-5 leading-relaxed">{message}</p>
            <div className="flex gap-3 justify-end">
                <ActionBtn onClick={onCancel} variant="default">Cancel</ActionBtn>
                <ActionBtn onClick={onConfirm} variant="solid">Confirm</ActionBtn>
            </div>
        </div>
    </div>
);

// ── Dark Select — fixes white dropdown background bug ─────────────
const DarkSelect = ({ value, onChange, options }) => (
    <select
        value={value}
        onChange={onChange}
        style={{ background: '#1a1a2e', color: 'white' }}
        className="text-xs rounded-lg px-2 py-1 border border-white/15 outline-none cursor-pointer"
    >
        {options.map(o => (
            <option key={o.value} value={o.value} style={{ background: '#1a1a2e', color: 'white' }}>
                {o.label}
            </option>
        ))}
    </select>
);

// ── Stat Card ─────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, gradient }) => (
    <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-5 shadow-lg`}>
        <div className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-1">{label}</div>
        <div className="text-white text-3xl font-black mb-0.5">{value ?? '—'}</div>
        {sub && <div className="text-white/50 text-xs">{sub}</div>}
    </div>
);

// ─────────────────────────────────────────────────────────────────
// DASHBOARD TAB — platform overview + per-user drill-down
// ─────────────────────────────────────────────────────────────────
const DashboardTab = () => {
    const [allUsers, setAllUsers] = useState([]);
    const [allVideos, setAllVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [userSearch, setUserSearch] = useState('');
    const [userStats, setUserStats] = useState(null);
    const [statLoading, setStatLoading] = useState(false);

    useEffect(() => {
        const fetch = async () => {
            try {
                const [u, v] = await Promise.all([
                    ApiClient.get('/admin/users?page_size=100'),
                    ApiClient.get('/admin/videos?page_size=100'),
                ]);
                setAllUsers(u.data);
                setAllVideos(v.data);
            } catch { toast.error('Failed to load stats'); }
            finally { setLoading(false); }
        };
        fetch();
    }, []);

    const loadUserStats = async (userId) => {
        setStatLoading(true);
        try {
            const res = await ApiClient.get(`/admin/stats/channel/${userId}`);
            setUserStats(res.data);
        } catch { toast.error('Failed to load user stats'); }
        finally { setStatLoading(false); }
    };

    const handleUserSelect = (u) => {
        setSelectedUser(u);
        setUserStats(null);
        loadUserStats(u.id);
    };

    if (loading) return <div className="text-white/40 text-sm py-16 text-center">Loading stats…</div>;

    const totalViews = allVideos.reduce((s, v) => s + (v.view_count || 0), 0);
    const bannedCount = allUsers.filter(u => u.upload_banned).length;

    const platformCards = [
        { label: 'Total Users', value: allUsers.length, gradient: 'from-blue-700 to-blue-900' },
        { label: 'Total Videos', value: allVideos.length, gradient: 'from-red-700 to-red-900' },
        { label: 'Upload Banned', value: bannedCount, gradient: 'from-orange-700 to-orange-900' },
        { label: 'Total Views', value: totalViews.toLocaleString(), gradient: 'from-purple-700 to-purple-900' },
    ];

    const filtered = allUsers.filter(u =>
        u.username.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase())
    );

    return (
        <div className="space-y-8">
            {/* Platform Overview */}
            <div>
                <h2 className="text-white/50 text-xs font-bold uppercase tracking-widest mb-3">Platform Overview</h2>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {platformCards.map(c => <StatCard key={c.label} {...c} />)}
                </div>
            </div>

            {/* User Dashboard Drill-Down */}
            <div>
                <h2 className="text-white/50 text-xs font-bold uppercase tracking-widest mb-3">User Dashboard</h2>
                <div className="flex flex-col lg:flex-row gap-4">
                    {/* User picker */}
                    <div className="w-full lg:w-64 shrink-0">
                        <input
                            type="text"
                            value={userSearch}
                            onChange={e => setUserSearch(e.target.value)}
                            placeholder="Search user…"
                            className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-red-500/50 mb-2"
                        />
                        <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
                            {filtered.map(u => (
                                <button
                                    key={u.id}
                                    onClick={() => handleUserSelect(u)}
                                    className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all ${selectedUser?.id === u.id ? 'bg-red-600 text-white' : 'text-white/70 hover:bg-white/10'}`}
                                >
                                    <span className="font-semibold">@{u.username}</span>
                                    {u.is_admin && <span className="ml-2 text-[10px] text-blue-400">[admin]</span>}
                                </button>
                            ))}
                            {filtered.length === 0 && <div className="text-white/30 text-xs text-center py-4">No users</div>}
                        </div>
                    </div>

                    {/* Stats panel */}
                    <div className="flex-1 min-h-[420px]">
                        {!selectedUser && (
                            <div className="h-full flex items-center justify-center text-white/30 text-sm border border-dashed border-white/10 rounded-2xl py-16">
                                ← Select a user to view their dashboard
                            </div>
                        )}
                        {selectedUser && statLoading && (
                            <div className="text-white/40 text-sm py-16 text-center">Loading…</div>
                        )}
                        {selectedUser && !statLoading && userStats && (() => {
                            const engRate = userStats.total_views > 0
                                ? (userStats.total_likes / userStats.total_views) * 100
                                : 0;
                            const engStr = userStats.total_views > 0 ? `${engRate.toFixed(2)}%` : '—';
                            const widgets = [
                                {
                                    label: 'Subscribers', value: userStats.subscriber_count.toLocaleString(), accent: '#3b82f6',
                                    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m4-4a4 4 0 100-8 4 4 0 000 8z" /></svg>,
                                },
                                {
                                    label: 'Videos', value: userStats.video_count.toLocaleString(), accent: '#ef4444',
                                    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
                                },
                                {
                                    label: 'Total Views', value: userStats.total_views.toLocaleString(), accent: '#a855f7',
                                    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
                                },
                                {
                                    label: 'Total Likes', value: userStats.total_likes.toLocaleString(), accent: '#ec4899',
                                    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" /></svg>,
                                },
                                {
                                    label: 'Member Since', value: new Date(userStats.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), accent: '#64748b',
                                    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
                                },
                            ];
                            return (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-7 bg-red-500 rounded-full shrink-0" />
                                        <div>
                                            <div className="text-white font-black text-xl leading-tight">@{userStats.username}</div>
                                            <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                                {userStats.upload_banned && <PillBadge color="red">Upload Banned</PillBadge>}
                                                {userStats.is_live && <PillBadge color="green">🔴 Live</PillBadge>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {widgets.map(w => (
                                            <div key={w.label} className="relative bg-black/30 backdrop-blur-sm border border-white/8 rounded-2xl p-4 overflow-hidden" style={{ borderLeft: `3px solid ${w.accent}` }}>
                                                <div className="absolute top-0 left-0 w-20 h-20 rounded-full blur-2xl opacity-15 pointer-events-none" style={{ background: w.accent }} />
                                                <div className="relative z-10">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{w.label}</span>
                                                        <span style={{ color: w.accent }}>{w.icon}</span>
                                                    </div>
                                                    <div className="text-white text-2xl font-black leading-none">{w.value}</div>
                                                </div>
                                            </div>
                                        ))}
                                        {/* Engagement — full-width with visual bar */}
                                        <div className="relative bg-black/30 backdrop-blur-sm border border-white/8 rounded-2xl p-4 overflow-hidden sm:col-span-3 col-span-2" style={{ borderLeft: '3px solid #10b981' }}>
                                            <div className="absolute top-0 left-0 w-32 h-32 rounded-full blur-3xl opacity-10 pointer-events-none" style={{ background: '#10b981' }} />
                                            <div className="relative z-10">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Engagement Rate</span>
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                                </div>
                                                <div className="flex items-end gap-3">
                                                    <div className="text-white text-3xl font-black">{engStr}</div>
                                                    <div className="text-white/30 text-xs mb-1">likes ÷ views</div>
                                                </div>
                                                <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(engRate * 5, 100)}%`, background: 'linear-gradient(90deg,#10b981,#34d399)' }} />
                                                </div>
                                                <div className="text-white/20 text-[10px] mt-1">bar scaled — 20% = full bar</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// VIDEOS TAB — with video ID column and fixed visibility dropdown
// ─────────────────────────────────────────────────────────────────
const VideosTab = () => {
    const [videos, setVideos] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [confirm, setConfirm] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page_size: 50 });
            if (search) params.append('search', search);
            const res = await ApiClient.get(`/admin/videos?${params}`);
            setVideos(res.data);
        } catch { toast.error('Failed to load videos'); }
        finally { setLoading(false); }
    }, [search]);

    useEffect(() => { load(); }, [load]);

    const deleteVideo = (id, title) => {
        setConfirm({
            message: `Delete "${title}" permanently? This cannot be undone.`,
            action: async () => {
                try {
                    await ApiClient.delete(`/admin/videos/${id}`);
                    toast.success('Video deleted');
                    load();
                } catch { toast.error('Failed to delete video'); }
            }
        });
    };

    const setVisibility = async (id, visibility) => {
        try {
            await ApiClient.patch(`/admin/videos/${id}/visibility`, { visibility });
            toast.success(`Visibility → ${visibility}`);
            load();
        } catch { toast.error('Failed to update visibility'); }
    };

    const visOpts = [
        { value: 'public', label: '🌍 Public' },
        { value: 'unlisted', label: '🔗 Unlisted' },
        { value: 'private', label: '🔒 Private' },
    ];

    return (
        <div className="space-y-4">
            {confirm && <ConfirmModal {...confirm} onConfirm={() => { confirm.action(); setConfirm(null); }} onCancel={() => setConfirm(null)} />}
            <SearchBar value={search} onChange={setSearch} placeholder="Search title…" />
            {loading ? <div className="text-white/50 text-sm py-10 text-center">Loading…</div> : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-sm text-white">
                        <thead>
                            <tr className="bg-white/5 text-white/40 text-[11px] uppercase tracking-wider">
                                <th className="px-3 py-3 text-left w-12">ID</th>
                                <th className="px-3 py-3 text-left">Title</th>
                                <th className="px-3 py-3 text-left">Author</th>
                                <th className="px-3 py-3 text-left">Status</th>
                                <th className="px-3 py-3 text-left">Views</th>
                                <th className="px-3 py-3 text-left">Visibility</th>
                                <th className="px-3 py-3 text-left">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {videos.map(v => (
                                <tr key={v.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                                    <td className="px-3 py-3">
                                        <span className="text-white/30 text-xs font-mono bg-white/5 px-1.5 py-0.5 rounded">#{v.id}</span>
                                    </td>
                                    <td className="px-3 py-3 max-w-[180px] truncate font-medium text-white/90">{v.title}</td>
                                    <td className="px-3 py-3 text-white/50 text-xs">{v.author_username}</td>
                                    <td className="px-3 py-3">
                                        <PillBadge color={v.status === 'published' ? 'green' : 'yellow'}>{v.status}</PillBadge>
                                    </td>
                                    <td className="px-3 py-3 text-white/60 text-xs">{(v.view_count || 0).toLocaleString()}</td>
                                    <td className="px-3 py-3">
                                        <DarkSelect
                                            value={v.visibility || 'public'}
                                            onChange={e => setVisibility(v.id, e.target.value)}
                                            options={visOpts}
                                        />
                                    </td>
                                    <td className="px-3 py-3">
                                        <ActionBtn onClick={() => deleteVideo(v.id, v.title)} variant="danger">Delete</ActionBtn>
                                    </td>
                                </tr>
                            ))}
                            {videos.length === 0 && (
                                <tr><td colSpan={7} className="text-center text-white/30 py-10">No videos found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// USERS TAB — with engagement ranking and improved action buttons
// ─────────────────────────────────────────────────────────────────
const UsersTab = () => {
    const [users, setUsers] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [confirm, setConfirm] = useState(null);
    const [banModal, setBanModal] = useState(null);
    const [banReason, setBanReason] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page_size: 100 });
            if (search) params.append('search', search);
            const res = await ApiClient.get(`/admin/users?${params}`);
            // Sort by engagement (likes / views), descending
            const sorted = res.data.sort((a, b) => {
                const engA = a.total_views > 0 ? a.total_likes / a.total_views : 0;
                const engB = b.total_views > 0 ? b.total_likes / b.total_views : 0;
                return engB - engA;
            });
            setUsers(sorted);
        } catch { toast.error('Failed to load users'); }
        finally { setLoading(false); }
    }, [search]);

    useEffect(() => { load(); }, [load]);

    const confirmBan = async () => {
        try {
            await ApiClient.post(`/admin/users/${banModal.userId}/ban-upload`, { reason: banReason });
            toast.success(`@${banModal.username} upload banned`);
            setBanModal(null);
            load();
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to ban'); }
    };

    const unban = (userId, username) => {
        setConfirm({
            message: `Lift upload ban for @${username}?`,
            action: async () => {
                try {
                    await ApiClient.delete(`/admin/users/${userId}/ban-upload`);
                    toast.success('Upload ban lifted');
                    load();
                } catch { toast.error('Failed to unban'); }
            }
        });
    };

    return (
        <div className="space-y-4">
            {confirm && <ConfirmModal {...confirm} onConfirm={() => { confirm.action(); setConfirm(null); }} onCancel={() => setConfirm(null)} />}

            {/* Ban reason modal */}
            {banModal && (
                <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center">
                    <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4 shadow-2xl">
                        <h3 className="text-white font-bold">Ban <span className="text-red-400">@{banModal.username}</span> from uploading</h3>
                        <textarea
                            value={banReason}
                            onChange={e => setBanReason(e.target.value)}
                            placeholder="Optional reason shown to the user…"
                            className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-red-500/50 h-24 resize-none"
                        />
                        <div className="flex gap-3 justify-end">
                            <ActionBtn onClick={() => setBanModal(null)} variant="default">Cancel</ActionBtn>
                            <ActionBtn onClick={confirmBan} variant="danger">Confirm Ban</ActionBtn>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-4">
                <SearchBar value={search} onChange={setSearch} placeholder="Search username or email…" />
                <span className="text-white/30 text-xs">Ranked by engagement ratio</span>
            </div>
            {loading ? <div className="text-white/50 text-sm py-10 text-center">Loading…</div> : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-sm text-white">
                        <thead>
                            <tr className="bg-white/5 text-white/40 text-[11px] uppercase tracking-wider">
                                <th className="px-3 py-3 text-left w-8">#</th>
                                <th className="px-3 py-3 text-left">User</th>
                                <th className="px-3 py-3 text-left">Subs</th>
                                <th className="px-3 py-3 text-left">Videos</th>
                                <th className="px-3 py-3 text-left">Views</th>
                                <th className="px-3 py-3 text-left">Likes</th>
                                <th className="px-3 py-3 text-left">Engagement</th>
                                <th className="px-3 py-3 text-left">Status</th>
                                <th className="px-3 py-3 text-left">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u, idx) => {
                                const engagement = u.total_views > 0
                                    ? ((u.total_likes / u.total_views) * 100).toFixed(2) + '%'
                                    : '—';
                                const rankColors = ['text-yellow-400', 'text-slate-300', 'text-orange-400'];
                                return (
                                    <tr key={u.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                                        <td className="px-3 py-3">
                                            <span className={`text-sm font-black ${rankColors[idx] || 'text-white/25'}`}>
                                                {idx + 1}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="font-semibold text-white/90">@{u.username}</div>
                                            <div className="text-[10px] text-white/30">{u.email}</div>
                                            {u.is_admin && <PillBadge color="blue">Admin</PillBadge>}
                                        </td>
                                        <td className="px-3 py-3 text-white/60 text-xs">{u.subscriber_count.toLocaleString()}</td>
                                        <td className="px-3 py-3 text-white/60 text-xs">{u.video_count}</td>
                                        <td className="px-3 py-3 text-white/60 text-xs">{u.total_views.toLocaleString()}</td>
                                        <td className="px-3 py-3 text-white/60 text-xs">{u.total_likes.toLocaleString()}</td>
                                        <td className="px-3 py-3">
                                            <span className={`text-xs font-bold ${u.total_views > 0 ? 'text-emerald-400' : 'text-white/30'}`}>
                                                {engagement}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3">
                                            {u.upload_banned
                                                ? <PillBadge color="red">Banned</PillBadge>
                                                : <PillBadge color="green">Active</PillBadge>}
                                        </td>
                                        <td className="px-3 py-3">
                                            {!u.is_admin && (
                                                u.upload_banned
                                                    ? <ActionBtn onClick={() => unban(u.id, u.username)} variant="success">Unban Upload</ActionBtn>
                                                    : <ActionBtn onClick={() => setBanModal({ userId: u.id, username: u.username })} variant="warning">Ban Upload</ActionBtn>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {users.length === 0 && (
                                <tr><td colSpan={9} className="text-center text-white/30 py-10">No users found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// COMMENTS TAB — improved: left panel shows all videos for ID lookup
// ─────────────────────────────────────────────────────────────────
const CommentsTab = () => {
    const [videos, setVideos] = useState([]);
    const [videoSearch, setVideoSearch] = useState('');
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [confirm, setConfirm] = useState(null);

    // Load video list on mount for the ID lookup panel
    useEffect(() => {
        ApiClient.get('/admin/videos?page_size=100').then(r => setVideos(r.data)).catch(() => { });
    }, []);

    const loadComments = async (vid) => {
        setSelectedVideo(vid);
        setComments([]);
        setLoading(true);
        try {
            const res = await ApiClient.get(`/videos/${vid.id}/comments`);
            setComments(res.data);
        } catch { toast.error('Failed to load comments'); }
        finally { setLoading(false); }
    };

    const deleteComment = (id) => {
        setConfirm({
            message: 'Delete this comment permanently?',
            action: async () => {
                try {
                    await ApiClient.delete(`/admin/comments/${id}`);
                    toast.success('Comment deleted');
                    setComments(prev => prev.filter(c => c.id !== id));
                } catch { toast.error('Failed to delete comment'); }
            }
        });
    };

    const filteredVideos = videos.filter(v =>
        v.title.toLowerCase().includes(videoSearch.toLowerCase()) ||
        String(v.id).includes(videoSearch)
    );

    return (
        <div className="space-y-4">
            {confirm && <ConfirmModal {...confirm} onConfirm={() => { confirm.action(); setConfirm(null); }} onCancel={() => setConfirm(null)} />}

            <div className="flex flex-col lg:flex-row gap-4">
                {/* Video picker panel */}
                <div className="w-full lg:w-72 shrink-0">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                        <div className="text-white/50 text-[10px] uppercase font-bold tracking-widest mb-3">Select a Video</div>
                        <input
                            type="text"
                            value={videoSearch}
                            onChange={e => setVideoSearch(e.target.value)}
                            placeholder="Search title or ID…"
                            className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-red-500/50 mb-2"
                        />
                        <div className="max-h-[480px] overflow-y-auto space-y-1 custom-scrollbar">
                            {filteredVideos.map(v => (
                                <button
                                    key={v.id}
                                    onClick={() => loadComments(v)}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${selectedVideo?.id === v.id ? 'bg-red-600 text-white' : 'text-white/70 hover:bg-white/10'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded shrink-0">#{v.id}</span>
                                        <span className="text-xs font-medium truncate">{v.title}</span>
                                    </div>
                                    <div className="text-[10px] text-white/40 mt-0.5 ml-0.5">{v.author_username}</div>
                                </button>
                            ))}
                            {filteredVideos.length === 0 && <div className="text-white/30 text-xs text-center py-4">No videos found</div>}
                        </div>
                    </div>
                </div>

                {/* Comments panel */}
                <div className="flex-1 min-w-0">
                    {!selectedVideo && (
                        <div className="h-full flex items-center justify-center text-white/30 text-sm border border-dashed border-white/10 rounded-2xl py-20">
                            ← Select a video to see its comments
                        </div>
                    )}
                    {selectedVideo && (
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded text-white/50">#{selectedVideo.id}</span>
                                        <span className="text-white font-bold text-sm">{selectedVideo.title}</span>
                                    </div>
                                    <div className="text-white/40 text-xs mt-0.5">by {selectedVideo.author_username}</div>
                                </div>
                                <PillBadge color="gray">{comments.length} comment{comments.length !== 1 ? 's' : ''}</PillBadge>
                            </div>
                            {loading ? (
                                <div className="text-white/40 text-sm py-8 text-center">Loading comments…</div>
                            ) : comments.length === 0 ? (
                                <div className="text-white/30 text-sm text-center py-8">No comments on this video</div>
                            ) : (
                                <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                                    {comments.map(c => (
                                        <div key={c.id} className="flex items-start justify-between gap-3 p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/8 transition-colors">
                                            <div className="min-w-0">
                                                <div className="text-xs text-white/40 mb-1 flex items-center gap-1.5">
                                                    <span className="font-semibold text-white/60">{c.author?.username || 'Unknown'}</span>
                                                    <span className="text-white/20">·</span>
                                                    <span className="font-mono text-[10px] bg-white/5 px-1 rounded">#{c.id}</span>
                                                </div>
                                                <div className="text-sm text-white/80 leading-relaxed">{c.text}</div>
                                            </div>
                                            <ActionBtn onClick={() => deleteComment(c.id)} variant="danger">Delete</ActionBtn>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// WARNINGS TAB — improved 2-column layout with recent warnings log
// ─────────────────────────────────────────────────────────────────
const WarningsTab = () => {
    const [users, setUsers] = useState([]);
    const [targetUser, setTargetUser] = useState('');
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [recentWarnings, setRecentWarnings] = useState([]);

    useEffect(() => {
        ApiClient.get('/admin/users?page_size=100').then(r => setUsers(r.data)).catch(() => { });
        ApiClient.get('/admin/audit-log?page_size=10').then(r => {
            setRecentWarnings(r.data.filter(l => l.action_type === 'SEND_WARNING'));
        }).catch(() => { });
    }, []);

    const send = async () => {
        const found = users.find(u =>
            u.username.toLowerCase() === targetUser.toLowerCase() || String(u.id) === targetUser
        );
        if (!found) { toast.error('User not found'); return; }
        if (!title.trim() || !message.trim()) { toast.error('Title and message required'); return; }
        setSending(true);
        try {
            await ApiClient.post('/admin/warnings', { target_user_id: found.id, title, message });
            toast.success(`⚠️ Warning sent to @${found.username}`);
            setRecentWarnings(prev => [{ id: Date.now(), admin_username: 'You', detail: title, created_at: new Date().toISOString() }, ...prev].slice(0, 10));
            setTargetUser(''); setTitle(''); setMessage('');
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to send warning'); }
        finally { setSending(false); }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6">
            {/* Compose panel */}
            <div className="flex-1">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                    <div className="text-white/50 text-[10px] uppercase font-bold tracking-widest">Compose Warning</div>
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-yellow-400 text-xs leading-relaxed">
                        ⚠️ Warnings appear in the user's Notifications page and are logged in the Audit Log.
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-white/40 text-xs font-semibold uppercase tracking-wider block mb-1">Target User</label>
                            <input
                                list="warn-users"
                                value={targetUser}
                                onChange={e => setTargetUser(e.target.value)}
                                placeholder="@username or user ID"
                                className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-yellow-500/50"
                            />
                            <datalist id="warn-users">
                                {users.map(u => <option key={u.id} value={u.username} />)}
                            </datalist>
                        </div>
                        <div>
                            <label className="text-white/40 text-xs font-semibold uppercase tracking-wider block mb-1">Warning Title</label>
                            <input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="e.g. Community Guidelines Violation"
                                className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-yellow-500/50"
                            />
                        </div>
                        <div>
                            <label className="text-white/40 text-xs font-semibold uppercase tracking-wider block mb-1">Detailed Message</label>
                            <textarea
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                placeholder="Explain the violation and any consequences…"
                                rows={6}
                                className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-yellow-500/50 resize-none"
                            />
                        </div>
                        <ActionBtn onClick={send} variant="warning" size="md" disabled={sending}>
                            {sending ? '⏳ Sending…' : '⚠️ Send Warning'}
                        </ActionBtn>
                    </div>
                </div>
            </div>

            {/* Recent warnings side panel */}
            <div className="w-full lg:w-72 shrink-0">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                    <div className="text-white/50 text-[10px] uppercase font-bold tracking-widest mb-3">Recent Warnings</div>
                    {recentWarnings.length === 0 ? (
                        <div className="text-white/30 text-xs text-center py-8">No warnings sent yet</div>
                    ) : (
                        <div className="space-y-2">
                            {recentWarnings.map(w => (
                                <div key={w.id} className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                                    <div className="text-yellow-400 text-xs font-semibold truncate">{w.detail}</div>
                                    <div className="text-white/30 text-[10px] mt-1">
                                        by {w.admin_username} · {new Date(w.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// AUDIT LOG TAB
// ─────────────────────────────────────────────────────────────────
const AuditTab = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await ApiClient.get(`/admin/audit-log?page=${page}&page_size=30`);
            setLogs(res.data);
        } catch { toast.error('Failed to load audit log'); }
        finally { setLoading(false); }
    }, [page]);

    useEffect(() => { load(); }, [load]);

    const actionColor = (type) => {
        if (/DELETE/.test(type)) return 'red';
        if (/BAN/.test(type) && !/UNBAN/.test(type)) return 'orange';
        if (/UNBAN/.test(type)) return 'green';
        if (/WARNING/.test(type)) return 'yellow';
        return 'gray';
    };

    return (
        <div className="space-y-3">
            {loading ? <div className="text-white/50 text-sm py-10 text-center">Loading…</div> : (
                <>
                    {logs.map(l => (
                        <div key={l.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white/5 rounded-xl border border-white/5">
                            <div className="flex items-center gap-3 flex-wrap">
                                <PillBadge color={actionColor(l.action_type)}>{l.action_type}</PillBadge>
                                <span className="text-white/60 text-xs">by <span className="text-white font-semibold">{l.admin_username}</span></span>
                                {l.detail && <span className="text-white/30 text-xs truncate max-w-[220px]">{l.detail}</span>}
                            </div>
                            <div className="text-white/25 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</div>
                        </div>
                    ))}
                    {logs.length === 0 && <div className="text-white/30 text-sm text-center py-8">No audit records</div>}
                    <div className="flex gap-3 justify-center pt-2">
                        <ActionBtn onClick={() => setPage(p => Math.max(1, p - 1))} variant="default" disabled={page === 1}>← Prev</ActionBtn>
                        <span className="text-white/40 text-sm self-center">Page {page}</span>
                        <ActionBtn onClick={() => setPage(p => p + 1)} variant="default" disabled={logs.length < 30}>Next →</ActionBtn>
                    </div>
                </>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────
export default function AdminPanel() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('dashboard');

    useEffect(() => {
        try {
            const user = JSON.parse(localStorage.getItem(UTUBE_USER) || '{}');
            if (!user.is_admin) navigate('/');
        } catch { navigate('/'); }
    }, [navigate]);

    const renderTab = () => {
        switch (activeTab) {
            case 'dashboard': return <DashboardTab />;
            case 'videos': return <VideosTab />;
            case 'users': return <UsersTab />;
            case 'comments': return <CommentsTab />;
            case 'warnings': return <WarningsTab />;
            case 'audit': return <AuditTab />;
            default: return null;
        }
    };

    return (
        <div className="min-h-screen text-white pt-20 pb-10 px-4 sm:px-8 max-w-7xl mx-auto">
            {/* Page header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-2 h-8 bg-red-500 rounded-full" />
                    <h1 className="text-3xl font-black tracking-tight">Admin Panel</h1>
                </div>
                <p className="text-white/40 text-sm ml-5">Platform management &amp; moderation</p>
            </div>

            {/* Tab nav */}
            <div className="flex flex-wrap gap-2 mb-6 p-1 bg-white/5 rounded-2xl border border-white/10 w-fit">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.id
                            ? 'bg-red-600 text-white shadow-lg'
                            : 'text-white/50 hover:text-white hover:bg-white/10'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 min-h-[500px]">
                {renderTab()}
            </div>
        </div>
    );
}
