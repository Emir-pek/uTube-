import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { UTUBE_USER, UTUBE_TOKEN } from '../utils/authConstants';
import { getAvatarUrl, getMediaUrl, THUMBNAIL_FALLBACK } from '../utils/urlHelper';
import ApiClient from '../utils/ApiClient';

const Profile = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [subscriptions, setSubscriptions] = useState([]);
    const [myVideos, setMyVideos] = useState([]);
    const [myVideosLoading, setMyVideosLoading] = useState(true);

    useEffect(() => {
        const loadProfile = async () => {
            try {
                // Always fetch fresh profile from server (includes real profile_image)
                const res = await ApiClient.get('/auth/me');
                setUser(res.data);
                // Sync to localStorage so Navbar/other components pick up changes
                localStorage.setItem(UTUBE_USER, JSON.stringify(res.data));
                window.dispatchEvent(new Event('authChange'));
            } catch {
                // If /me fails (expired token, etc.), fall back to localStorage
                try {
                    const data = localStorage.getItem(UTUBE_USER);
                    if (data) {
                        setUser(JSON.parse(data));
                    } else {
                        navigate('/login');
                    }
                } catch {
                    navigate('/login');
                }
            }
        };
        loadProfile();
    }, [navigate]);

    useEffect(() => {
        const fetchSubscriptions = async () => {
            if (!user) return;
            try {
                const response = await ApiClient.get('/auth/subscriptions');
                setSubscriptions(response.data);
            } catch (error) {
                console.error('Failed to fetch subscriptions:', error);
            }
        };

        fetchSubscriptions();
    }, [user]);

    // Fetch user's uploaded videos
    useEffect(() => {
        const fetchMyVideos = async () => {
            if (!user) return;
            setMyVideosLoading(true);
            try {
                const response = await ApiClient.get(`/videos/user/${user.id}`);
                setMyVideos(response.data);
            } catch (error) {
                console.error('Failed to fetch my videos:', error);
            } finally {
                setMyVideosLoading(false);
            }
        };
        fetchMyVideos();
    }, [user]);

    const handleLogout = () => {
        localStorage.removeItem(UTUBE_TOKEN);
        localStorage.removeItem(UTUBE_USER);
        window.dispatchEvent(new Event('authChange'));
        navigate('/');
    };

    if (!user) return null;

    return (
        <div className="min-h-screen pt-24 pb-12 px-4 md:px-8 text-white">
            <div className="max-w-4xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="glass rounded-3xl p-8 border border-white/10 shadow-2xl relative overflow-hidden"
                >
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                    <div className="flex flex-col md:flex-row gap-8 items-start relative z-10">
                        {/* Avatar Section */}
                        <div className="flex-shrink-0 mx-auto md:mx-0">
                            <motion.div
                                whileHover={{ scale: 1.05 }}
                                className="w-40 h-40 rounded-full p-1 bg-gradient-to-br from-primary to-red-600 shadow-xl"
                            >
                                <div className="w-full h-full rounded-full overflow-hidden border-4 border-black/50 bg-black">
                                    <img
                                        src={getAvatarUrl(user.profile_image, user.username)}
                                        alt={user.username}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            </motion.div>
                        </div>

                        {/* Info Section */}
                        <div className="flex-1 w-full text-center md:text-left">
                            <div className="mb-6">
                                <h1 className="text-4xl font-black tracking-tighter mb-2">{user.username}</h1>
                                <p className="text-white/60 font-medium">Member since {new Date(user.created_at).toLocaleDateString()}</p>
                            </div>

                            <div className="grid gap-4 max-w-lg">
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                                    <p className="text-xs font-black text-white/40 uppercase tracking-widest mb-1">Email</p>
                                    <p className="font-medium text-lg truncate">{user.email || 'No email provided'}</p>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                                    <p className="text-xs font-black text-white/40 uppercase tracking-widest mb-1">Username</p>
                                    <p className="font-medium text-lg truncate">@{user.username}</p>
                                </div>
                            </div>

                            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
                                <button
                                    onClick={() => navigate('/edit-profile')}
                                    className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-all border border-white/5 flex items-center justify-center gap-2 group"
                                >
                                    <svg className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    Edit Profile
                                </button>
                                <button
                                    onClick={() => navigate('/my-channel')}
                                    className="px-6 py-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl font-bold transition-all border border-primary/20 flex items-center justify-center gap-2 group"
                                    style={{ color: 'var(--primary)' }}
                                >
                                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    My Channel
                                </button>
                                <button
                                    onClick={handleLogout}
                                    className="px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-bold transition-all border border-red-500/10 flex items-center justify-center gap-2 group"
                                >
                                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Additional Content / Placeholder */}
                <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="glass rounded-3xl p-8 border border-white/10"
                    >
                        <h3 className="text-xl font-bold mb-4">My Uploads</h3>
                        {myVideosLoading ? (
                            <div className="grid grid-cols-2 gap-3">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="animate-pulse">
                                        <div className="aspect-video bg-white/5 rounded-lg mb-2" />
                                        <div className="h-3 bg-white/5 rounded w-3/4 mb-1" />
                                        <div className="h-2 bg-white/5 rounded w-1/2" />
                                    </div>
                                ))}
                            </div>
                        ) : myVideos.length > 0 ? (
                            <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
                                {myVideos.map(video => (
                                    <Link
                                        key={video.id}
                                        to={`/video/${video.id}`}
                                        className="group rounded-xl overflow-hidden hover:ring-1 hover:ring-white/20 transition-all"
                                    >
                                        <div className="aspect-video bg-black rounded-lg overflow-hidden mb-2">
                                            <img
                                                src={getMediaUrl(video.thumbnail_url) || THUMBNAIL_FALLBACK}
                                                alt={video.title}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                onError={(e) => { e.target.src = THUMBNAIL_FALLBACK; }}
                                            />
                                        </div>
                                        <p className="text-sm font-bold truncate px-1">{video.title}</p>
                                        <div className="flex items-center gap-2 px-1 pb-2">
                                            <span className="text-[10px] text-white/40">{video.view_count} views</span>
                                            <span className="text-[10px] text-white/40">•</span>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider ${video.status === 'published' ? 'text-green-400' : 'text-yellow-400'}`}>
                                                {video.status}
                                            </span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-8 h-8 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <p className="text-white/40 font-medium">No videos uploaded yet</p>
                                <Link to="/upload" className="mt-4 text-primary font-bold text-sm hover:underline">
                                    Upload your first video
                                </Link>
                            </div>
                        )}
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="glass rounded-3xl p-8 border border-white/10"
                    >
                        <h3 className="text-xl font-bold mb-4">Account Stats</h3>
                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <div className="bg-white/5 rounded-xl p-4">
                                <p className="text-2xl font-black">{user.subscriber_count ?? 0}</p>
                                <p className="text-xs text-white/40 uppercase tracking-wider font-bold">Subscribers</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4">
                                <p className="text-2xl font-black">{user.video_count ?? 0}</p>
                                <p className="text-xs text-white/40 uppercase tracking-wider font-bold">Videos</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4">
                                <p className="text-2xl font-black">{(user.total_views ?? 0).toLocaleString()}</p>
                                <p className="text-xs text-white/40 uppercase tracking-wider font-bold">Total Views</p>
                            </div>
                        </div>

                        <h3 className="text-xl font-bold mb-4">Subscribed Channels</h3>
                        {subscriptions.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {subscriptions.map(sub => (
                                    <div key={sub.id} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl hover:bg-white/10 transition-colors">
                                        <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-black">
                                            <img
                                                src={getAvatarUrl(sub.profile_image, sub.username)}
                                                alt={sub.username}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-sm truncate">{sub.username}</p>
                                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Subscribed</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-white/40 text-sm">You haven't subscribed to anyone yet.</p>
                        )}
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
