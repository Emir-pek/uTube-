import { useState, useEffect } from 'react';
import ApiClient from '../utils/ApiClient';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

export default function Notifications() {
    const [warnings, setWarnings] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWarnings = async () => {
            try {
                const res = await ApiClient.get('/notifications');
                setWarnings(res.data);
            } catch {
                toast.error('Failed to load notifications');
            } finally {
                setLoading(false);
            }
        };
        fetchWarnings();
    }, []);

    const markRead = async (id) => {
        try {
            await ApiClient.post(`/notifications/${id}/read`);
            setWarnings(prev => prev.map(w => w.id === id ? { ...w, is_read: true } : w));
        } catch {
            toast.error('Failed to mark as read');
        }
    };

    const unreadCount = warnings.filter(w => !w.is_read).length;

    return (
        <div className="min-h-screen text-white pt-20 pb-10 px-4 sm:px-8 max-w-3xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-2 h-8 bg-red-500 rounded-full" />
                    <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                        Notifications
                        {unreadCount > 0 && (
                            <span className="bg-red-600 text-white text-sm font-bold px-3 py-0.5 rounded-full">
                                {unreadCount} new
                            </span>
                        )}
                    </h1>
                </div>
                <p className="text-white/40 text-sm ml-5">Admin notices and platform alerts</p>
            </div>

            {loading && (
                <div className="text-white/40 text-sm text-center py-20">Loading notifications…</div>
            )}

            {!loading && warnings.length === 0 && (
                <div className="text-center py-20">
                    <div className="text-6xl mb-4">🔔</div>
                    <p className="text-white/40">No notifications yet</p>
                </div>
            )}

            <AnimatePresence>
                {warnings.map((w, i) => (
                    <motion.div
                        key={w.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`mb-4 p-5 rounded-2xl border transition-all ${w.is_read
                                ? 'bg-white/5 border-white/5'
                                : 'bg-red-900/20 border-red-500/40 shadow-lg shadow-red-900/10'
                            }`}
                    >
                        {/* Admin badge */}
                        <div className="flex items-center gap-2 mb-2">
                            <span className="bg-red-600/30 border border-red-500/40 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                ⚠️ Admin Notice
                            </span>
                            {!w.is_read && (
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            )}
                            <span className="text-white/30 text-xs ml-auto">
                                {new Date(w.created_at).toLocaleString()}
                            </span>
                        </div>

                        <h3 className={`font-bold text-base mb-2 ${w.is_read ? 'text-white/70' : 'text-white'}`}>
                            {w.title}
                        </h3>
                        <p className="text-white/60 text-sm leading-relaxed">{w.message}</p>

                        {!w.is_read && (
                            <button
                                onClick={() => markRead(w.id)}
                                className="mt-4 text-xs text-white/40 hover:text-white/70 transition-colors underline underline-offset-2"
                            >
                                Mark as read
                            </button>
                        )}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
