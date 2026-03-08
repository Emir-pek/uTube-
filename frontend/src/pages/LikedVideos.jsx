import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import ApiClient from '../utils/ApiClient';
import { getMediaUrl, getAvatarUrl, THUMBNAIL_FALLBACK } from '../utils/urlHelper';

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
    if (d < 7) return `${d}d ago`;
    if (d < 30) return `${Math.floor(d / 7)}w ago`;
    if (d < 365) return `${Math.floor(d / 30)}mo ago`;
    return `${Math.floor(d / 365)}y ago`;
};

const fmtDuration = (s) => {
    if (!s) return null;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
};

const fmtViews = (n) => {
    if (!n && n !== 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
};

const LikedVideos = () => {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        ApiClient.get('/videos/liked', { params: { limit: 200 } })
            .then(r => setVideos(Array.isArray(r.data) ? r.data : r.data?.videos || []))
            .catch(() => setVideos([]))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="min-h-screen pt-24 px-4 md:px-8 max-w-[1200px] mx-auto">
            <div className="flex items-center gap-4 mb-8 border-b border-white/10 pb-6">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                    </svg>
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight mb-1">Liked Videos</h1>
                    <p className="text-white/50 text-sm">Videos you've given a thumbs up.</p>
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="animate-pulse">
                            <div className="aspect-video rounded-xl bg-white/5 mb-3" />
                            <div className="flex gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-white/5 shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3 bg-white/5 rounded w-full" />
                                    <div className="h-2 bg-white/5 rounded w-2/3" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : videos.length === 0 ? (
                <div className="py-20 text-center flex flex-col items-center">
                    <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                    </svg>
                    <p className="text-lg font-bold text-white/50">No liked videos yet</p>
                    <p className="text-sm text-white/30 mt-1">Videos you like will appear here.</p>
                    <Link to="/" className="mt-6 px-6 py-2 bg-white/10 hover:bg-white/20 transition-colors rounded-full text-sm font-bold">
                        Browse Home
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
                    {videos.map(v => {
                        const dur = fmtDuration(v.duration);
                        return (
                            <motion.div
                                key={v.id}
                                layout
                                initial={{ opacity: 0, scale: 0.97 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="group"
                            >
                                <Link to={`/video/${v.id}`} className="block relative aspect-video rounded-xl overflow-hidden mb-3 ring-1 ring-white/10 group-hover:ring-white/25 transition-all">
                                    <img
                                        src={getMediaUrl(v.thumbnail_url) || THUMBNAIL_FALLBACK}
                                        alt={v.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        onError={e => { e.target.src = THUMBNAIL_FALLBACK; }}
                                    />
                                    {dur && (
                                        <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                                            {dur}
                                        </span>
                                    )}
                                </Link>
                                <div className="flex gap-2.5">
                                    <Link to={`/channel/${v.author?.id}`} className="w-8 h-8 rounded-full overflow-hidden border border-white/10 shrink-0">
                                        <img
                                            src={getAvatarUrl(v.author?.profile_image, v.author?.username)}
                                            alt={v.author?.username}
                                            className="w-full h-full object-cover"
                                            onError={e => { e.target.src = `https://ui-avatars.com/api/?name=${v.author?.username || 'U'}&background=random&color=fff`; }}
                                        />
                                    </Link>
                                    <div className="flex-1 min-w-0">
                                        <Link to={`/video/${v.id}`}>
                                            <h3 className="font-bold text-xs sm:text-sm line-clamp-2 leading-tight group-hover:text-red-400 transition-colors">{v.title}</h3>
                                        </Link>
                                        <p className="text-white/40 text-[11px] mt-0.5 truncate">{v.author?.username}</p>
                                        <div className="flex items-center gap-1 text-white/30 text-[10px] mt-0.5">
                                            <span>{fmtViews(v.view_count)} views</span>
                                            <span>·</span>
                                            <span>{timeAgo(v.upload_date)}</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default LikedVideos;
