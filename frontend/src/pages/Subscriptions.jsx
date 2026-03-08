import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import ApiClient from '../utils/ApiClient';
import { getAvatarUrl } from '../utils/urlHelper';

const Subscriptions = () => {
    const [channels, setChannels] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        ApiClient.get('/feed/subscriptions', { params: { limit: 200 } })
            .then(r => {
                const seen = new Set();
                const data = Array.isArray(r.data) ? r.data : [];
                const unique = data.filter(v => {
                    const id = v.author?.id;
                    if (!id || seen.has(id)) return false;
                    seen.add(id);
                    return true;
                });
                setChannels(unique);
            })
            .catch(() => setChannels([]))
            .finally(() => setLoading(false));
    }, []);

    const unsubscribe = async (authorId) => {
        try {
            await ApiClient.delete(`/auth/subscribe/${authorId}`);
            setChannels(prev => prev.filter(v => v.author?.id !== authorId));
            window.dispatchEvent(new Event('utube_subscription_changed'));
        } catch { /* noop */ }
    };

    return (
        <div className="min-h-screen pt-24 px-4 md:px-8 max-w-[900px] mx-auto">
            <div className="flex items-center gap-4 mb-8 border-b border-white/10 pb-6">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight mb-1">Subscriptions</h1>
                    <p className="text-white/50 text-sm">Channels you're subscribed to.</p>
                </div>
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 animate-pulse">
                            <div className="w-12 h-12 rounded-full bg-white/10 shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="h-3 bg-white/10 rounded w-1/3" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : channels.length === 0 ? (
                <div className="py-20 text-center flex flex-col items-center">
                    <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-lg font-bold text-white/50">No subscriptions yet</p>
                    <p className="text-sm text-white/30 mt-1">Subscribe to channels to see them here.</p>
                    <Link to="/" className="mt-6 px-6 py-2 bg-white/10 hover:bg-white/20 transition-colors rounded-full text-sm font-bold">
                        Browse Home
                    </Link>
                </div>
            ) : (
                <div className="space-y-2">
                    {channels.map(v => {
                        const u = v.author;
                        return (
                            <motion.div
                                key={u?.id}
                                layout
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/8 transition-colors group"
                            >
                                <Link to={`/channel/${u?.id}`} className="w-12 h-12 rounded-full overflow-hidden border border-white/10 shrink-0">
                                    <img
                                        src={getAvatarUrl(u?.profile_image, u?.username)}
                                        alt={u?.username}
                                        className="w-full h-full object-cover"
                                        onError={e => { e.target.src = `https://ui-avatars.com/api/?name=${u?.username || 'U'}&background=random&color=fff`; }}
                                    />
                                </Link>
                                <div className="flex-1 min-w-0">
                                    <Link to={`/channel/${u?.id}`}>
                                        <p className="font-bold text-sm text-white/80 group-hover:text-white transition-colors">@{u?.username}</p>
                                    </Link>
                                </div>
                                <button
                                    onClick={() => unsubscribe(u?.id)}
                                    className="px-4 py-1.5 rounded-full border border-white/15 text-white/50 hover:border-red-500/50 hover:text-red-400 text-xs font-bold transition-all"
                                >
                                    Unsubscribe
                                </button>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Subscriptions;
