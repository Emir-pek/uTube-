import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import ApiClient from '../utils/ApiClient';
import { UTUBE_USER } from '../utils/authConstants';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import VideoGrid from '../components/VideoGrid';
import { useSidebar } from '../context/SidebarContext';

const WatchLaterView = () => {
    const { isSidebarOpen } = useSidebar();
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const currentUser = (() => {
        try {
            return JSON.parse(localStorage.getItem(UTUBE_USER) || 'null');
        } catch { return null; }
    })();

    useEffect(() => {
        const fetchWatchLater = async () => {
            if (!currentUser) return;
            try {
                const res = await ApiClient.get('/users/watch-later');
                setVideos(res.data || []);
            } catch (err) {
                console.error("Failed to load Watch Later:", err);
                setError(err.response?.data?.detail || "Failed to load Watch Later");
            } finally {
                setLoading(false);
            }
        };

        fetchWatchLater();
    }, [currentUser]);

    // Format duration for display
    const formatDuration = (seconds) => {
        if (!seconds) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    return (
        <div className="min-h-screen bg-[#0F0F0F] text-white flex flex-col pt-16">
            <Navbar />

            <div className="flex flex-1 overflow-hidden relative">
                <Sidebar />

                <main className={`flex-1 transition-all duration-300 overflow-y-auto ${isSidebarOpen ? 'ml-60' : 'ml-20'}`}>
                    {/* Fixed Hero Header aligned with PlaylistView design */}
                    <div className="relative w-full h-auto min-h-[30vh] bg-gradient-to-b from-red-900/30 to-[#0F0F0F] border-b border-white/10 flex items-center mb-8">
                        <div className="max-w-[1800px] w-full mx-auto px-6 py-10 lg:px-10 flex flex-col md:flex-row gap-8 items-center md:items-start relative z-10">

                            {/* Playlist Thumbnail Grid (like YouTube) */}
                            <div className="relative w-full max-w-sm aspect-video md:w-80 md:aspect-square flex-shrink-0 rounded-2xl overflow-hidden shadow-2xl bg-[#222]">
                                {videos.length > 0 ? (
                                    <div className="absolute inset-0">
                                        <img
                                            src={videos[0].thumbnail_url}
                                            alt="Watch Later Thumbnail"
                                            className="w-full h-full object-cover blur-sm opacity-50 absolute inset-0 mix-blend-overlay"
                                        />
                                        <img
                                            src={videos[0].thumbnail_url}
                                            alt="Watch Later"
                                            className="w-full h-full object-contain relative z-10 p-4"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-white/50">
                                        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <p>No videos</p>
                                    </div>
                                )}

                                {/* Overlay gradient */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-20" />

                                {/* Overlay Play Indicator */}
                                {videos.length > 0 && (
                                    <Link
                                        to={`/video/${videos[0].id}?list=watch_later`}
                                        className="absolute inset-0 z-30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40 group"
                                    >
                                        <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <svg className="w-8 h-8 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                        </div>
                                    </Link>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex flex-col flex-1 h-full pt-2">
                                <h1 className="text-4xl md:text-5xl font-black mb-4 tracking-tight drop-shadow-lg">Watch Later</h1>

                                <div className="flex items-center gap-2 mb-4">
                                    <p className="font-semibold text-lg">{currentUser?.username}</p>
                                </div>

                                <div className="flex items-center gap-3 text-white/70 text-sm font-medium mb-8">
                                    <span className="bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">Private</span>
                                    <span>{videos.length} videos</span>
                                    <span>Updated today</span>
                                </div>

                                {/* Actions */}
                                {videos.length > 0 && (
                                    <div className="flex gap-4 mt-auto">
                                        <Link
                                            to={`/video/${videos[0].id}?list=watch_later`}
                                            className="px-8 py-3 bg-red-600 hover:bg-red-500 rounded-full font-bold text-white transition-all shadow-lg shadow-red-600/20 flex items-center gap-2 hover:scale-105"
                                        >
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                            Play all
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Videos List */}
                    <div className="max-w-[1800px] w-full mx-auto px-6 pb-20 lg:px-10">
                        {error && (
                            <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 mb-8 max-w-2xl mx-auto text-center">
                                {error}
                            </div>
                        )}

                        {loading ? (
                            <div className="flex justify-center py-20">
                                <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : videos.length === 0 ? (
                            <div className="text-center py-20">
                                <div className="w-24 h-24 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-6">
                                    <svg className="w-12 h-12 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <h3 className="text-2xl font-bold mb-2">Your Watch Later list is empty</h3>
                                <p className="text-white/50 text-lg mb-8 max-w-sm mx-auto">
                                    Click the 3-dot menu on any video and select "Watch Later" to save it here.
                                </p>
                                <Link to="/" className="text-red-500 font-bold hover:text-red-400 p-3 bg-red-500/10 rounded-xl">
                                    Explore videos
                                </Link>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <AnimatePresence>
                                    {videos.map((video, index) => (
                                        <motion.div
                                            key={video.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ delay: index * 0.05 }}
                                            className="group flex flex-col sm:flex-row gap-4 p-3 pr-4 rounded-xl hover:bg-white/5 transition-colors items-center"
                                        >
                                            {/* Index */}
                                            <span className="text-white/40 w-6 text-center font-medium hidden sm:block shrink-0">
                                                {index + 1}
                                            </span>

                                            {/* Thumbnail */}
                                            <Link to={`/video/${video.id}?list=watch_later&index=${index}`} className="relative h-24 sm:w-40 sm:h-[90px] rounded-lg overflow-hidden shrink-0 w-full bg-[#111]">
                                                <img
                                                    src={video.thumbnail_url}
                                                    alt={video.title}
                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                    onError={(e) => { e.target.src = '/storage/uploads/thumbnails/placeholder.jpg'; }}
                                                />
                                                <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                                                <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs font-bold px-1 rounded">
                                                    {formatDuration(video.duration)}
                                                </div>
                                            </Link>

                                            {/* Details */}
                                            <div className="flex-1 min-w-0 flex flex-col py-1">
                                                <Link to={`/video/${video.id}?list=watch_later&index=${index}`}>
                                                    <h3 className="text-base font-semibold line-clamp-2 leading-tight mb-1 group-hover:text-blue-400 transition-colors">
                                                        {video.title}
                                                    </h3>
                                                </Link>
                                                <div className="text-sm text-white/60 flex items-center gap-2">
                                                    <Link to={`/channel/${video.author?.id}`} className="hover:text-white transition-colors">
                                                        {video.author?.username}
                                                    </Link>
                                                    <span>•</span>
                                                    <span>{video.view_count.toLocaleString()} views</span>
                                                </div>
                                            </div>

                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default WatchLaterView;
