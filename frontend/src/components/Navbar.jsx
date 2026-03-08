import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getAvatarUrl, getMediaUrl, THUMBNAIL_FALLBACK } from '../utils/urlHelper';
import { UTUBE_TOKEN, UTUBE_USER } from '../utils/authConstants';
import ApiClient from '../utils/ApiClient';
import { useSidebar } from '../context/SidebarContext';


const Navbar = () => {
    // Read from disk during initialization
    const [user, setUser] = useState(() => {
        try {
            const data = localStorage.getItem(UTUBE_USER);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    });

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');

    useEffect(() => {
        setSearchQuery(searchParams.get('search') || '');
    }, [searchParams]);

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/?search=${encodeURIComponent(searchQuery.trim())}`);
        } else {
            navigate('/');
        }
    };

    // ── Notification State ──
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [notifLoading, setNotifLoading] = useState(false);
    const [hasNew, setHasNew] = useState(false);
    const [unreadWarnings, setUnreadWarnings] = useState(0);
    const notifRef = useRef(null);
    const bellRef = useRef(null);

    const checkAuth = () => {
        try {
            const data = localStorage.getItem(UTUBE_USER);
            setUser(data ? JSON.parse(data) : null);
        } catch (e) {
            setUser(null);
        }
    };

    useEffect(() => {
        // Real-time Reactivity: Listen for internal dispatch
        window.addEventListener('authChange', checkAuth);

        // External Reactivity: Listen for storage changes (other tabs)
        const handleStorageChange = (e) => {
            if (e.key === UTUBE_TOKEN || e.key === UTUBE_USER) {
                checkAuth();
            }
        };
        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('authChange', checkAuth);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    // ── Close dropdowns on outside click ──
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (notifRef.current && !notifRef.current.contains(e.target) &&
                bellRef.current && !bellRef.current.contains(e.target)) {
                setIsNotifOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ── Fetch subscription feed when bell is opened ──
    const fetchNotifications = useCallback(async () => {
        if (!user) return;
        setNotifLoading(true);
        try {
            const res = await ApiClient.get('/feed/subscriptions', { params: { limit: 10 } });
            setNotifications(res.data);
            setHasNew(false); // Mark as read once opened
        } catch (err) {
            console.warn('Failed to load subscription feed:', err);
        } finally {
            setNotifLoading(false);
        }
    }, [user]);

    // ── Check for new subscription videos periodically ──
    useEffect(() => {
        if (!user) return;

        const checkNew = async (retries = 3) => {
            try {
                const res = await ApiClient.get('/feed/subscriptions', { params: { limit: 1 } });
                if (res.data.length > 0) {
                    setHasNew(true);
                }
            } catch (err) {
                // Determine if it is a network error/proxy error
                const isNetworkError = err.code === 'ERR_NETWORK' || !err.response;
                if (isNetworkError && retries > 0) {
                    console.warn(`Feed fetch failed. Retrying... (${retries} left)`);
                    setTimeout(() => checkNew(retries - 1), 2000);
                } else {
                    // Silently fail after retries
                    console.error("Feed feed definitive failure:", err.message);
                }
            }
        };

        // Delay initial check slightly to allow python backend to boot
        const startupTimeout = setTimeout(checkNew, 2000);

        const interval = setInterval(() => checkNew(), 60000); // Check every 60s

        return () => {
            clearTimeout(startupTimeout);
            clearInterval(interval);
        };
    }, [user]);

    // ── Poll admin warnings unread count ──
    useEffect(() => {
        if (!user) return;
        const fetchUnread = async () => {
            try {
                const res = await ApiClient.get('/notifications/unread-count');
                setUnreadWarnings(res.data.unread_count || 0);
            } catch { /* silent */ }
        };
        fetchUnread();
        const interval = setInterval(fetchUnread, 60000);
        return () => clearInterval(interval);
    }, [user]);

    const handleBellClick = () => {
        const newState = !isNotifOpen;
        setIsNotifOpen(newState);
        setIsMenuOpen(false); // Close profile menu
        if (newState) {
            fetchNotifications();
        }
    };

    const handleLogout = () => {
        localStorage.removeItem(UTUBE_TOKEN);
        localStorage.removeItem(UTUBE_USER);
        setUser(null);
        setIsMenuOpen(false);
        window.location.href = '/';
    };

    // ── Time ago helper ──
    const timeAgo = (dateStr) => {
        const now = new Date();
        // Ensure the date string is treated as UTC
        const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
        const date = new Date(utcStr);
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHrs = Math.floor(diffMins / 60);
        if (diffHrs < 24) return `${diffHrs}h ago`;
        const diffDays = Math.floor(diffHrs / 24);
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    return (
        <nav className="absolute top-0 left-0 right-0 z-50 glass border-b border-white/5 h-16 sm:h-20 flex items-center px-4 sm:px-8">
            <div className="flex items-center justify-between w-full max-w-[1800px] mx-auto">
                {/* Logo Section */}
                <div className="flex items-center gap-3 sm:gap-5">
                    <Link to="/" className="flex items-center gap-2 group">
                        <motion.div
                            whileHover={{ rotate: -10, scale: 1.1 }}
                            className="w-28 sm:w-32"
                        >
                            <img src="/utube.png" alt="uTube" className="w-full h-auto object-contain drop-shadow-[0_0_10px_rgba(255,0,0,0.5)]" />
                        </motion.div>
                    </Link>
                </div>

                {/* Search Bar - Center */}
                <div className="flex-1 max-w-2xl mx-4 sm:mx-8 hidden md:block">
                    <form onSubmit={handleSearch} className="relative group">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="search anything you want..."
                            className="w-full bg-black/40 border border-white/10 rounded-full px-6 py-2.5 sm:py-3 focus:outline-none focus:border-primary/50 focus:shadow-[0_0_15px_rgba(255,0,0,0.3)] transition-all text-sm group-hover:bg-black/60"
                        />
                        <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/80 group-hover:text-white/40 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </button>
                    </form>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-3 sm:gap-6">
                    {user ? (
                        <div className="flex items-center gap-4">
                            {/* Go Live Button */}
                            <Link to="/live">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="flex items-center justify-center bg-white/5 border border-white/10 w-10 h-10 rounded-xl hover:bg-white/10 transition-all shadow-lg"
                                    title="Go Live"
                                >
                                    <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                                </motion.button>
                            </Link>

                            {/* Upload Button */}
                            <Link to="/upload">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full hover:bg-white/10 transition-all font-bold text-sm"
                                >
                                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    <span className="hidden xs:inline">Upload</span>
                                </motion.button>
                            </Link>

                            {/* Welcome Text */}
                            <span className="hidden sm:block text-sm font-black text-white italic bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
                                Welcome, <span className="text-primary truncate max-w-[150px] inline-block align-bottom">{user?.username || 'User'}</span>
                            </span>

                            {/* ── Notification Bell (functional) ── */}
                            <div
                                className="relative"
                                onMouseEnter={() => { setIsNotifOpen(true); setIsMenuOpen(false); fetchNotifications(); }}
                                onMouseLeave={() => setIsNotifOpen(false)}
                            >
                                <motion.button
                                    ref={bellRef}
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={handleBellClick}
                                    className={`relative p-2 rounded-full transition-colors ${isNotifOpen ? 'bg-white/10' : 'hover:bg-white/10'
                                        }`}
                                    title="Subscription Feed"
                                >
                                    <svg className={`w-5 h-5 ${isNotifOpen ? 'text-white' : 'text-white/70'}`} fill={isNotifOpen ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                    </svg>
                                    {(hasNew || unreadWarnings > 0) && (
                                        <motion.span
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-[var(--bg-primary)]"
                                        />
                                    )}
                                </motion.button>

                                {/* Notification Dropdown */}
                                <AnimatePresence>
                                    {isNotifOpen && (
                                        <motion.div
                                            ref={notifRef}
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute right-0 mt-3 w-80 sm:w-96 rounded-2xl glass border border-white/10 shadow-2xl overflow-hidden"
                                        >
                                            {/* Header */}
                                            <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between bg-white/5">
                                                <h3 className="font-bold text-sm">Subscriptions</h3>
                                                <span className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Latest uploads</span>
                                            </div>

                                            {/* Content */}
                                            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                                {notifLoading ? (
                                                    <div className="p-4 space-y-3">
                                                        {[...Array(4)].map((_, i) => (
                                                            <div key={i} className="flex gap-3 animate-pulse">
                                                                <div className="w-28 aspect-video bg-white/5 rounded-lg shrink-0" />
                                                                <div className="flex-1 space-y-2 py-1">
                                                                    <div className="h-3 bg-white/5 rounded w-full" />
                                                                    <div className="h-2 bg-white/5 rounded w-2/3" />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : notifications.length > 0 ? (
                                                    <div>
                                                        {notifications.map((video) => (
                                                            <Link
                                                                key={video.id}
                                                                to={`/video/${video.id}`}
                                                                className="flex gap-3 px-4 py-3 hover:bg-white/5 transition-colors group"
                                                                onClick={() => setIsNotifOpen(false)}
                                                            >
                                                                {/* Thumbnail */}
                                                                <div className="w-28 aspect-video rounded-lg overflow-hidden shrink-0 ring-1 ring-white/5">
                                                                    <img
                                                                        src={getMediaUrl(video.thumbnail_url) || THUMBNAIL_FALLBACK}
                                                                        alt={video.title}
                                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                                        onError={(e) => { e.target.src = THUMBNAIL_FALLBACK; }}
                                                                    />
                                                                </div>
                                                                {/* Info */}
                                                                <div className="flex-1 min-w-0 py-0.5">
                                                                    <p className="text-xs font-bold line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                                                                        {video.title}
                                                                    </p>
                                                                    <p className="text-[10px] text-white/40 mt-1 truncate">
                                                                        {video.author?.username}
                                                                    </p>
                                                                    <p className="text-[10px] text-white/30 mt-0.5">
                                                                        {timeAgo(video.upload_date)} · {video.view_count?.toLocaleString()} views
                                                                    </p>
                                                                </div>
                                                            </Link>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="py-12 px-6 text-center">
                                                        <svg className="w-10 h-10 mx-auto mb-3 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                        </svg>
                                                        <p className="text-white/30 text-sm font-medium">No new videos</p>
                                                        <p className="text-white/15 text-xs mt-1">Subscribe to channels to see their latest uploads here</p>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div
                                className="relative"
                                onMouseEnter={() => { setIsMenuOpen(true); setIsNotifOpen(false); }}
                                onMouseLeave={() => setIsMenuOpen(false)}
                            >
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => { setIsMenuOpen(!isMenuOpen); setIsNotifOpen(false); }}
                                    className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-surface relative group shadow-lg"
                                >
                                    <img
                                        src={getAvatarUrl(user?.profile_image, user?.username)}
                                        alt={user?.username || 'User'}
                                        className="w-full h-full object-cover"
                                    />
                                </motion.button>

                                <AnimatePresence>
                                    {isMenuOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="absolute right-0 mt-4 w-60 p-2 rounded-2xl glass border border-white/10 shadow-2xl overflow-hidden"
                                        >
                                            <div className="px-4 py-4 border-b border-white/5 mb-2 bg-white/5">
                                                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5 align-middle flex items-center gap-1.5">
                                                    <span className="w-1 h-1 bg-primary rounded-full"></span>
                                                    Signed in as
                                                </p>
                                                <p className="font-bold text-white truncate text-sm">@{user?.username || 'Member'}</p>

                                            </div>

                                            <Link
                                                to="/profile"
                                                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-white/70 hover:text-white font-bold text-sm transition-colors"
                                                onClick={() => setIsMenuOpen(false)}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                </svg>
                                                My Profile
                                            </Link>

                                            <Link
                                                to="/my-channel"
                                                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-white/70 hover:text-white font-bold text-sm transition-colors"
                                                onClick={() => setIsMenuOpen(false)}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                                My Channel
                                            </Link>

                                            <Link
                                                to="/dashboard"
                                                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-white/70 hover:text-white font-bold text-sm transition-colors"
                                                onClick={() => setIsMenuOpen(false)}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                </svg>
                                                Dashboard
                                            </Link>

                                            {/* Admin Panel link — visible only to admins */}
                                            {user?.is_admin && (
                                                <Link
                                                    to="/admin"
                                                    className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 text-red-400 font-bold text-sm transition-colors"
                                                    onClick={() => setIsMenuOpen(false)}
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                    </svg>
                                                    Admin Panel
                                                </Link>
                                            )}

                                            {/* Notifications link */}
                                            <Link
                                                to="/notifications"
                                                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-white/70 hover:text-white font-bold text-sm transition-colors"
                                                onClick={() => setIsMenuOpen(false)}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                                                </svg>
                                                Notice
                                                {unreadWarnings > 0 && (
                                                    <span className="ml-auto bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadWarnings}</span>
                                                )}
                                            </Link>

                                            <button
                                                onClick={handleLogout}
                                                className="w-full text-left px-4 py-3 rounded-xl hover:bg-red-500/10 text-red-400 font-bold text-sm transition-colors flex items-center gap-2 group/logout"
                                            >
                                                <svg className="w-4 h-4 transition-transform group-hover/logout:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                                </svg>
                                                Sign Out
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <Link to="/login" className="text-sm font-bold text-white/60 hover:text-white transition-colors">
                                Sign In
                            </Link>
                            <Link to="/register">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="bg-primary px-6 py-2.5 rounded-full text-sm font-black text-white shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                                >
                                    Register
                                </motion.button>
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
