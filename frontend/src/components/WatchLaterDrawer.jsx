import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useWatchLater } from '../context/WatchLaterContext';
import { getValidUrl, THUMBNAIL_FALLBACK } from '../utils/urlHelper';

const WatchLaterDrawer = () => {
    const { isWatchLaterOpen, setWatchLaterOpen, watchLaterVideos, loading } = useWatchLater();
    const navigate = useNavigate();

    // Close on outside click is handled by an overlay if desired, but we'll do a simple X button
    // or overlay background

    const handleClose = () => {
        setWatchLaterOpen(false);
    };

    const handlePlayAll = () => {
        setWatchLaterOpen(false);
        if (watchLaterVideos.length > 0) {
            navigate(`/video/${watchLaterVideos[0].id}?list=watch_later`);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <AnimatePresence>
                {isWatchLaterOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="fixed inset-0 bg-black/50 z-[90] backdrop-blur-sm"
                    />
                )}
            </AnimatePresence>

            {/* Drawer */}
            <div
                className={`fixed top-0 right-0 h-full w-80 sm:w-96 bg-gray-900 z-[100] transform transition-transform duration-300 ease-in-out shadow-[0_0_40px_rgba(0,0,0,0.8)] border-l border-white/10 flex flex-col ${isWatchLaterOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <span>🕒</span>
                        Watch Later
                    </h2>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Actions */}
                <div className="px-4 py-3 border-b border-white/5 shrink-0 bg-white/[0.02]">
                    <button
                        onClick={handlePlayAll}
                        disabled={watchLaterVideos.length === 0}
                        className="w-full py-2 bg-white text-black font-bold rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                        Play All
                    </button>
                    <div className="mt-2 text-xs text-white/50 text-center font-medium">
                        {watchLaterVideos.length} video{watchLaterVideos.length !== 1 ? 's' : ''} saved
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-3">
                    {loading ? (
                        <div className="text-center py-10 text-white/50 animate-pulse text-sm">
                            Loading...
                        </div>
                    ) : watchLaterVideos.length === 0 ? (
                        <div className="text-center py-10 text-white/40 text-sm flex flex-col items-center gap-3">
                            <svg className="w-12 h-12 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p>Your Watch Later list is empty</p>
                        </div>
                    ) : (
                        watchLaterVideos.map((video) => (
                            <Link
                                key={video.id}
                                to={`/video/${video.id}?list=watch_later`}
                                onClick={handleClose}
                                className="flex gap-3 group rounded-lg hover:bg-white/5 p-1 transition-colors"
                            >
                                {/* Thumbnail */}
                                <div className="relative w-[120px] aspect-video rounded-lg overflow-hidden shrink-0 bg-white/5">
                                    <img
                                        src={getValidUrl(video.stream_thumbnail || video.thumbnail_url, THUMBNAIL_FALLBACK)}
                                        alt={video.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                        onError={(e) => { e.target.src = THUMBNAIL_FALLBACK; }}
                                    />
                                    {video.duration && (
                                        <div className="absolute bottom-1 right-1 bg-black/80 text-[10px] font-bold px-1 rounded text-white">
                                            {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                                        </div>
                                    )}
                                </div>
                                {/* Info */}
                                <div className="flex-1 min-w-0 py-0.5">
                                    <h3 className="text-sm font-semibold text-white/90 group-hover:text-white line-clamp-2 leading-tight">
                                        {video.title}
                                    </h3>
                                    <p className="text-xs text-white/50 mt-1 truncate">
                                        {video.author?.username || video.username}
                                    </p>
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </div>
        </>
    );
};

export default WatchLaterDrawer;
