import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import ApiClient from '../utils/ApiClient';
import { getAvatarUrl } from '../utils/urlHelper';
import toast from 'react-hot-toast';
import { UTUBE_USER } from '../utils/authConstants';

const ChannelSearchCard = ({ channel }) => {
    // Assuming simple optimistic UI for Subscribe here
    // A full implementation would check initial sub status if available
    const [subCount, setSubCount] = useState(channel.subscriber_count || 0);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);

    const currentUserStr = localStorage.getItem(UTUBE_USER);
    const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
    const isOwnChannel = currentUser && currentUser.id === channel.id;

    const handleSubscribeToggle = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentUser) {
            toast.error('Please log in to subscribe');
            return;
        }

        setLoading(true);
        try {
            if (isSubscribed) {
                await ApiClient.delete(`/channel/${channel.id}/subscribe`);
                setIsSubscribed(false);
                setSubCount(prev => Math.max(0, prev - 1));
                toast.success(`Unsubscribed from ${channel.username}`);
            } else {
                await ApiClient.post(`/channel/${channel.id}/subscribe`);
                setIsSubscribed(true);
                setSubCount(prev => prev + 1);
                toast.success(`Subscribed to ${channel.username}`);

                // Trigger notification check for sidebar
                window.dispatchEvent(new Event('utube_subscription_change'));
            }
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Action failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors w-full max-w-4xl">
            <Link to={`/channel/${channel.id}`} className="shrink-0">
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-black/40 ring-4 ring-white/5">
                    <img
                        src={getAvatarUrl(channel.profile_image, channel.username)}
                        alt={channel.username}
                        className="w-full h-full object-cover"
                    />
                </div>
            </Link>

            <div className="flex-1 min-w-0 flex flex-col justify-center text-center sm:text-left h-full py-2">
                <Link to={`/channel/${channel.id}`}>
                    <h3 className="text-xl sm:text-2xl font-bold text-white hover:text-primary transition-colors truncate">
                        {channel.username}
                    </h3>
                </Link>
                <div className="text-white/60 text-sm mt-1 whitespace-nowrap">
                    <span>{subCount.toLocaleString()} subscriber{subCount !== 1 && 's'}</span>
                    <span className="mx-2">•</span>
                    <span>{channel.video_count || 0} video{channel.video_count !== 1 && 's'}</span>
                </div>
            </div>

            <div className="mt-2 sm:mt-0 sm:self-center shrink-0">
                {!isOwnChannel && (
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleSubscribeToggle}
                        disabled={loading}
                        className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all focus:outline-none ${isSubscribed
                                ? 'bg-white/10 text-white hover:bg-white/20'
                                : 'bg-white text-black hover:bg-white/90'
                            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isSubscribed ? 'Subscribed' : 'Subscribe'}
                    </motion.button>
                )}
            </div>
        </div>
    );
};

export default ChannelSearchCard;
