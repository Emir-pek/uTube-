import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import DOMPurify from 'dompurify';
import ApiClient from '../utils/ApiClient';
import { getAvatarUrl, getMediaUrl, getValidUrl, THUMBNAIL_FALLBACK } from '../utils/urlHelper';
import { VideoCard } from '../components/VideoGrid';
import { UTUBE_USER, UTUBE_TOKEN } from '../utils/authConstants';
import toast from 'react-hot-toast';

const Channel = () => {
    const { id } = useParams();
    const [channel, setChannel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [subLoading, setSubLoading] = useState(false);
    const [subscriberCount, setSubscriberCount] = useState(0);

    const currentUser = (() => {
        try {
            const data = localStorage.getItem(UTUBE_USER);
            return data ? JSON.parse(data) : null;
        } catch { return null; }
    })();
    const isOwnChannel = currentUser && channel && currentUser.id === channel.id;

    useEffect(() => {
        const fetchChannel = async () => {
            if (!id) return;
            setLoading(true);
            setError(null);
            try {
                const res = await ApiClient.get(`/channel/${id}`);
                setChannel(res.data);
                setSubscriberCount(res.data.subscriber_count ?? 0);
            } catch (err) {
                setError(err.response?.status === 404 ? 'Channel not found' : err.message || 'Failed to load channel');
                setChannel(null);
            } finally {
                setLoading(false);
            }
        };
        fetchChannel();
    }, [id]);

    useEffect(() => {
        const checkSubscription = async () => {
            if (!currentUser || !channel) return;
            try {
                const res = await ApiClient.get('/auth/subscriptions');
                const subs = res.data;
                const subbed = subs.some(u => u.id === channel.id);
                setIsSubscribed(subbed);
            } catch { setIsSubscribed(false); }
        };
        checkSubscription();
    }, [currentUser, channel]);

    const handleSubscribe = async () => {
        if (!currentUser) {
            toast.error('Please log in to subscribe');
            return;
        }
        if (isOwnChannel) {
            toast.error("You can't subscribe to your own channel");
            return;
        }
        if (!channel) return;

        setSubLoading(true);
        try {
            if (isSubscribed) {
                await ApiClient.delete(`/auth/subscribe/${channel.id}`);
                setIsSubscribed(false);
                setSubscriberCount(prev => Math.max(0, prev - 1));
                toast.success('Unsubscribed');
            } else {
                await ApiClient.post(`/auth/subscribe/${channel.id}`);
                setIsSubscribed(true);
                setSubscriberCount(prev => prev + 1);
                toast.success('Subscribed!');
            }
        } catch (err) {
            const detail = err.response?.data?.detail;
            if (detail === 'SELF_SUBSCRIPTION_NOT_ALLOWED') {
                toast.error("You can't subscribe to your own channel");
            } else {
                toast.error(detail || 'Subscription failed');
            }
        } finally {
            setSubLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen pt-24 pb-12 px-4 md:px-8">
                <div className="max-w-6xl mx-auto">
                    <div className="h-48 md:h-64 bg-white/5 rounded-2xl animate-pulse mb-8" />
                    <div className="flex gap-6 items-end -mt-16 relative z-10 px-4">
                        <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-white/10 animate-pulse shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-8 bg-white/10 rounded w-48 animate-pulse" />
                            <div className="h-4 bg-white/5 rounded w-24 animate-pulse" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-12">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="aspect-video bg-white/5 rounded-xl animate-pulse" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error || !channel) {
        return (
            <div className="min-h-screen pt-24 pb-12 px-4 flex flex-col items-center justify-center text-center">
                <h1 className="text-2xl font-bold text-white/80 mb-2">Channel Not Found</h1>
                <p className="text-white/50 mb-6">{error || 'This channel does not exist or has been removed.'}</p>
                <Link to="/" className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-bold transition-colors">
                    Back to Home
                </Link>
            </div>
        );
    }

    const bannerUrl = channel.banner_url
        ? getValidUrl(`/storage/uploads/banners/${channel.banner_url}`)
        : null;

    return (
        <div className="min-h-screen pt-24 pb-16 px-4 md:px-8 text-white">
            <div className="max-w-6xl mx-auto">
                <div className="mb-12">
                    {/* ─── Banner ───────────────────────────────────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="relative h-48 md:h-72 w-full rounded-2xl overflow-hidden p-[2px] z-0 bg-neutral-900"
                    >
                        {/* Spinning LED Border Effect */}
                        <div className="absolute inset-[-100%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#00000000_50%,#ff0000_100%)] z-[-1]" />

                        <div className="absolute inset-[2px] rounded-[calc(1rem-2px)] overflow-hidden bg-gradient-to-r from-primary/30 via-red-600/20 to-primary/10">
                            {bannerUrl ? (
                                <img
                                    src={bannerUrl}
                                    alt={`${channel.username}'s banner`}
                                    className="w-full h-full object-cover relative z-10"
                                    style={{
                                        objectPosition: `center ${channel.banner_position ?? 50}%`,
                                        imageRendering: '-webkit-optimize-contrast',
                                        transform: 'translateZ(0)',
                                        backfaceVisibility: 'hidden'
                                    }}
                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling?.classList.remove('hidden'); }}
                                />
                            ) : null}
                            <div
                                className={`absolute inset-0 bg-gradient-to-br from-primary/40 via-purple-600/30 to-primary/20 relative z-20 ${bannerUrl ? 'hidden' : ''}`}
                            />
                            {/* Inner glow to make the LED pop */}
                            <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(255,0,0,0.2)] pointer-events-none z-30" />
                        </div>
                    </motion.div>

                    {/* ─── Profile Info (Framed container) ─────────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="mx-0 md:mx-4 flex flex-col md:flex-row items-center md:items-start gap-6 relative z-10 bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8 mt-2 shadow-2xl backdrop-blur-sm"
                    >
                        {/* Avatar, overlaps banner slightly */}
                        <div className="w-32 h-32 md:w-40 md:h-40 rounded-full p-1.5 bg-[#111] shadow-xl -mt-20 md:-mt-24 md:-ml-2 shrink-0 relative z-20">
                            <div className="w-full h-full rounded-full overflow-hidden bg-black">
                                <img
                                    src={DOMPurify.sanitize(getAvatarUrl(channel.avatar_url || channel.profile_image, channel.username))}
                                    alt={channel.username}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        </div>

                        {/* Name + Stats */}
                        <div className="flex-1 min-w-0 text-center md:text-left mt-2 border-b border-white/5 pb-8 md:border-none md:pb-0">
                            <h1 className="text-3xl md:text-4xl font-black tracking-tight truncate">{channel.username}</h1>

                            <div className="flex flex-wrap items-center gap-2 mt-2 justify-center md:justify-start text-white/70 text-sm">
                                <span className="text-white font-medium">@{channel.username}</span>
                                <span className="text-white/30">•</span>
                                <span>{subscriberCount.toLocaleString()} subscriber{subscriberCount !== 1 ? 's' : ''}</span>
                                <span className="text-white/30">•</span>
                                <span>{channel.videos?.length || 0} video{(channel.videos?.length || 0) !== 1 ? 's' : ''}</span>
                                <span className="text-white/30">•</span>
                                <span>{(channel.total_views ?? 0).toLocaleString()} view{(channel.total_views ?? 0) !== 1 ? 's' : ''}</span>
                            </div>

                            {channel.channel_description && (
                                <div className="mt-4 text-white/70 text-sm max-w-[calc(100vw-32px)] md:max-w-3xl mx-auto md:mx-0 whitespace-pre-wrap leading-relaxed relative group cursor-pointer break-words">
                                    <div className="line-clamp-2 md:line-clamp-3 group-hover:line-clamp-none transition-all duration-300">
                                        {channel.channel_description}
                                    </div>
                                    <div className="mt-1 text-white/40 group-hover:opacity-0 transition-opacity duration-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1 justify-center md:justify-start">
                                        <span>Show more</span>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 shrink-0 mt-4 md:mt-2 w-full md:w-auto justify-center md:justify-end">
                            {isOwnChannel ? (
                                <Link
                                    to="/my-channel"
                                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-full font-bold text-sm transition-all border border-white/10"
                                >
                                    Manage Channel
                                </Link>
                            ) : (
                                <button
                                    onClick={handleSubscribe}
                                    disabled={subLoading}
                                    className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all disabled:opacity-50 ${isSubscribed
                                        ? 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                                        : 'bg-white text-black hover:bg-gray-200'
                                        }`}
                                >
                                    {subLoading ? '...' : isSubscribed ? 'Subscribed' : 'Subscribe'}
                                </button>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* ─── Video Grid ───────────────────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="mt-12"
                >
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Videos
                            <span className="text-white/30 text-base font-medium ml-1">({channel.videos?.length || 0})</span>
                        </h2>
                    </div>
                    {channel.videos && channel.videos.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {channel.videos.map((video) => (
                                <VideoCard key={video.id} video={video} />
                            ))}
                        </div>
                    ) : (
                        <div className="py-16 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                            <p className="text-white/40 font-medium">No videos yet</p>
                            <p className="text-white/30 text-sm mt-1">This channel hasn't uploaded any videos.</p>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
};

export default Channel;
