import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import ApiClient from '../utils/ApiClient';
import { VideoCard, VideoMenu, getBlockedChannels, getBlockedVideosData } from '../components/VideoGrid';
import VideoPlayer from '../components/VideoPlayer';
import HoverVideoPreview from '../components/HoverVideoPreview';
import { getMediaUrl, getAvatarUrl, THUMBNAIL_FALLBACK, AVATAR_FALLBACK, VIDEO_FALLBACK } from '../utils/urlHelper';
import { UTUBE_USER } from '../utils/authConstants';
import SaveToPlaylistModal from '../components/SaveToPlaylistModal';



const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    // Ensure the date string is treated as UTC
    const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const diff = Math.max(0, Date.now() - new Date(utcStr).getTime());
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m} minutes ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hours ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} days ago`;
    if (d < 30) return `${Math.floor(d / 7)} weeks ago`;
    if (d < 365) return `${Math.floor(d / 30)} months ago`;
    return `${Math.floor(d / 365)} years ago`;
};

const fmtViews = (n) => {
    if (!n && n !== 0) return '0';
    if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1)).toString()}M`;
    if (n >= 1_000) return `${Number((n / 1_000).toFixed(1)).toString()}K`;
    return n.toString();
};

const SidebarSkeleton = () => (
    <div className="space-y-4">
        {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-32 xl:w-40 aspect-video bg-white/5 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 bg-white/5 rounded w-full" />
                    <div className="h-2 bg-white/5 rounded w-2/3" />
                </div>
            </div>
        ))}
    </div>
);

// ── Duration Formatter Helper ──────────────────────────────────────────────
const fmtDuration = (s) => {
    if (!s || !isFinite(s)) return '';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

const VideoDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const listId = searchParams.get('list'); // null when not in a playlist

    const [video, setVideo] = useState(null);
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [recLoading, setRecLoading] = useState(false);
    const [hoveredRec, setHoveredRec] = useState(null);
    const hoverRecTimeout = useRef(null);

    const viewTracked = useRef(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [subLoading, setSubLoading] = useState(false);

    // ── Playlist State ──
    const [playlistData, setPlaylistData] = useState(null);
    const [playlistLoading, setPlaylistLoading] = useState(false);

    // ── Like State ──
    const [likeCount, setLikeCount] = useState(0);
    const [userHasLiked, setUserHasLiked] = useState(false);
    const [likeLoading, setLikeLoading] = useState(false);
    const [dislikeCount, setDislikeCount] = useState(0);
    const [userHasDisliked, setUserHasDisliked] = useState(false);
    const [dislikeLoading, setDislikeLoading] = useState(false);

    // ── Comment State ──
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [commentLoading, setCommentLoading] = useState(false);
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [commentCount, setCommentCount] = useState(0);
    const [replyingTo, setReplyingTo] = useState(null); // { id, username }
    const [replyText, setReplyText] = useState('');
    const [expandedReplies, setExpandedReplies] = useState({});
    const [replySubmitting, setReplySubmitting] = useState(false);

    // ── Resolution State ──
    const [availableResolutions, setAvailableResolutions] = useState(null);
    const [transcodeStatus, setTranscodeStatus] = useState('pending');

    // ── Description Expand State ──
    const [isExpanded, setIsExpanded] = useState(false);
    // ── Channel Subscriber Count (author) ──
    const [authorSubCount, setAuthorSubCount] = useState(null);

    // ── Save to Playlist Modal ──
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

    // Get current user from localStorage (called once, used throughout)
    const getCurrentUser = () => {
        try {
            const data = localStorage.getItem(UTUBE_USER);
            return data ? JSON.parse(data) : null;
        } catch { return null; }
    };
    const currentUser = getCurrentUser();
    const isOwnChannel = currentUser && video?.author && currentUser.id === video.author.id;

    // ══════════════════════════════════════════════════
    // Fetch Video Data
    // ══════════════════════════════════════════════════
    useEffect(() => {

        const fetchRecommendations = async (currentVideo) => {
            try {
                const recResponse = await ApiClient.get('/feed/recommended', {
                    params: {
                        author_id: currentVideo.author?.id,
                        category: currentVideo.category,
                        exclude_id: id,
                        limit: 10
                    }
                });

                // Get blocked items from LocalStorage and SessionStorage
                const blockedChannelsSet = new Set(getBlockedChannels());

                // For videos, if they are blocked totally but not this session, hide them completely.
                // If they are session blocked, we could blur them, but for sidebar we'll just hide them directly to be clean.
                const blockedVideos = getBlockedVideosData();

                // Double-safety: Filter on frontend too (status AND block lists)
                const validRecs = recResponse.data.filter(v => {
                    if (v.status !== 'published') return false;
                    if (blockedChannelsSet.has(v.author?.id)) return false;
                    if (blockedVideos.some(bv => bv.id === v.id)) return false;
                    return true;
                });

                setRecommendations(validRecs);
            } catch (error) {
                console.error('Failed to fetch recommendations:', error);
            }
        };

        const fetchVideoData = async () => {
            setLoading(true);
            setRecLoading(true); // Reset sidebar state
            try {
                // Fetch main video data
                const videoResponse = await ApiClient.get(`/videos/${id}`);
                const videoData = videoResponse.data;
                setVideo(videoData);
                setLikeCount(videoData.like_count || 0);
                setLoading(false); // Show main content as soon as it's ready

                // Use Ref Guard to prevent StrictMode double-triggers
                if (!viewTracked.current) {
                    viewTracked.current = true;
                    incrementView(id);
                    addToHistory(id);
                }

                // Initial Recommendation Fetch
                await fetchRecommendations(videoData);

                await fetchRecommendations(videoData);

            } catch (error) {
                console.error('Failed to fetch video details:', error);
                setFetchError(error.message + (error.response ? ` (Status: ${error.response.status})` : ''));
                setLoading(false);
            } finally {
                setRecLoading(false);
            }
        };

        const incrementView = async (videoId) => {
            try {
                await ApiClient.post(`/videos/${videoId}/view`);
                setVideo(prev => ({
                    ...prev,
                    view_count: (prev?.view_count || 0) + 1
                }));
            } catch (err) {
                // Fail silently
                console.warn('View tracking failed silently:', err);
            }
        };

        const addToHistory = async (videoId) => {
            const user = getCurrentUser();
            if (!user) return;
            try {
                await ApiClient.post(`/videos/${videoId}/history`);
            } catch (err) {
                console.warn('History tracking failed silently:', err);
            }
        };

        fetchVideoData();
        window.scrollTo(0, 0);

        // Reset tracking on ID change
        return () => {
            viewTracked.current = false;
        };
    }, [id]);

    // ══════════════════════════════════════════════════
    // Fetch Author Stats (subscriber_count)
    // ══════════════════════════════════════════════════
    useEffect(() => {
        const fetchAuthorStats = async () => {
            if (!video?.author?.username) return;
            try {
                const res = await ApiClient.get(`/auth/profile/${encodeURIComponent(video.author.username)}`);
                setAuthorSubCount(res.data.subscriber_count ?? 0);
            } catch (err) {
                console.warn('Could not fetch author stats:', err);
            }
        };

        fetchAuthorStats();
    }, [video]);

    // ══════════════════════════════════════════════════
    // Fetch Like/Dislike Status (requires auth)
    // ══════════════════════════════════════════════════
    useEffect(() => {
        const fetchLikeStatus = async () => {
            const user = getCurrentUser();
            if (!user) return;

            try {
                const res = await ApiClient.get(`/videos/${id}/likes`);
                setLikeCount(res.data.like_count);
                setUserHasLiked(res.data.user_has_liked);
                setDislikeCount(res.data.dislike_count);
                setUserHasDisliked(res.data.user_has_disliked);
            } catch (err) {
                console.warn('Could not fetch like status:', err);
            }
        };

        if (video) fetchLikeStatus();
    }, [video, id]);

    // ══════════════════════════════════════════════════
    // Fetch Comments
    // ══════════════════════════════════════════════════
    useEffect(() => {
        const fetchComments = async () => {
            setCommentLoading(true);
            try {
                const res = await ApiClient.get(`/videos/${id}/comments`);
                setComments(res.data);
                // Count all comments including replies
                const totalCount = res.data.reduce((s, c) => s + 1 + (c.replies?.length || 0), 0);
                setCommentCount(totalCount);
            } catch (err) {
                console.warn('Could not fetch comments:', err);
            } finally {
                setCommentLoading(false);
            }
        };

        if (video) fetchComments();
    }, [video, id]);

    // ══════════════════════════════════════════════════
    // Check Subscription
    // ══════════════════════════════════════════════════
    useEffect(() => {
        const checkSubscription = async () => {
            const userStr = localStorage.getItem(UTUBE_USER);
            if (!userStr || !video?.author) return;

            try {
                const response = await ApiClient.get('/auth/subscriptions');
                const subs = response.data;
                const isSub = subs.some(sub => sub.id === video.author.id);
                setIsSubscribed(isSub);
            } catch (error) {
                console.error("Failed to check subscription:", error);
            }
        };

        if (video) {
            checkSubscription();
        }
    }, [video]);

    // ══════════════════════════════════════════════════
    // Fetch Playlist Data (when ?list= param is present)
    // ══════════════════════════════════════════════════
    useEffect(() => {
        if (!listId) {
            setPlaylistData(null);
            return;
        }
        setPlaylistLoading(true);

        if (listId === 'watch_later' || listId === 'watch-later') {
            ApiClient.get('/users/watch-later')
                .then(res => {
                    setPlaylistData({
                        title: 'Watch Later',
                        videos: res.data
                    });
                })
                .catch(err => {
                    console.error('Watch later fetch error:', err);
                    setPlaylistData(null);
                })
                .finally(() => setPlaylistLoading(false));
            return;
        }

        ApiClient.get(`/playlists/${listId}`)
            .then(res => setPlaylistData(res.data))
            .catch(err => {
                console.error('Playlist fetch error:', err);
                setPlaylistData(null);
            })
            .finally(() => setPlaylistLoading(false));
    }, [listId]);

    // ══════════════════════════════════════════════════
    // Listen for Block Events 
    // ══════════════════════════════════════════════════
    useEffect(() => {
        const handleBlockEvent = () => {
            // Re-filter recommendations if a block event occurs
            const blockedChannelsSet = new Set(getBlockedChannels());
            const blockedVideos = getBlockedVideosData();

            setRecommendations(prev => prev.filter(v => {
                if (blockedChannelsSet.has(v.author?.id)) return false;
                if (blockedVideos.some(bv => bv.id === v.id)) return false;
                return true;
            }));
        };

        window.addEventListener('utube_channel_blocked', handleBlockEvent);
        window.addEventListener('utube_video_blocked', handleBlockEvent);

        return () => {
            window.removeEventListener('utube_channel_blocked', handleBlockEvent);
            window.removeEventListener('utube_video_blocked', handleBlockEvent);
        };
    }, []);

    // ══════════════════════════════════════════════════
    // Fetch Resolutions (with polling while transcoding)
    // ══════════════════════════════════════════════════
    useEffect(() => {
        if (!video) return;
        let resPollInterval;

        const fetchResolutions = async () => {
            try {
                const res = await ApiClient.get(`/videos/${id}/resolutions`);
                setAvailableResolutions(res.data.resolutions || null);
                setTranscodeStatus(res.data.status);

                // Stop polling once transcoding is done
                if (res.data.status !== 'processing' && resPollInterval) {
                    clearInterval(resPollInterval);
                    resPollInterval = null;
                }
            } catch (err) {
                console.warn('Could not fetch resolutions:', err);
            }
        };

        fetchResolutions();
        // Poll every 10s while transcoding
        resPollInterval = setInterval(fetchResolutions, 10000);

        return () => {
            if (resPollInterval) clearInterval(resPollInterval);
        };
    }, [video, id]);

    // ══════════════════════════════════════════════════
    // Text Parser (URLs & Hashtags)
    // ══════════════════════════════════════════════════
    const formatText = (text) => {
        if (!text) return null;
        const regex = /(https?:\/\/[^\s]+|#[^\s]+)/g;
        const parts = text.split(regex);
        return parts.map((part, i) => {
            if (part.match(/^https?:\/\//)) {
                return (
                    <a
                        key={i}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-500 hover:text-red-400 underline decoration-red-500/30 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {part}
                    </a>
                );
            } else if (part.match(/^#/)) {
                return (
                    <span
                        key={i}
                        className="text-red-500 font-medium cursor-pointer hover:text-red-400 transition-colors"
                    >
                        {part}
                    </span>
                );
            }
            return part;
        });
    };

    // ══════════════════════════════════════════════════
    // Handlers
    // ══════════════════════════════════════════════════

    const handleSubscribe = async () => {
        const userStr = localStorage.getItem(UTUBE_USER);
        if (!userStr) {
            toast.error('Abone olmak için giriş yapın');
            return;
        }
        if (!video?.author) return;

        // Frontend guard: prevent self-subscribe
        if (isOwnChannel) {
            toast.error('Kendi kanalınıza abone olamazsınız!');
            return;
        }

        setSubLoading(true);
        try {
            if (isSubscribed) {
                await ApiClient.delete(`/auth/subscribe/${video.author.id}`);
                setIsSubscribed(false);
                setAuthorSubCount(prev =>
                    prev == null ? prev : Math.max(0, prev - 1)
                );
                toast.success('Abonelikten çıkıldı');
            } else {
                await ApiClient.post(`/auth/subscribe/${video.author.id}`);
                setIsSubscribed(true);
                setAuthorSubCount(prev =>
                    prev == null ? prev : prev + 1
                );
                toast.success('Abone olundu!');
            }
        } catch (error) {
            console.error("Subscription action failed:", error);
            const detail = error.response?.data?.detail;
            if (detail === 'SELF_SUBSCRIPTION_NOT_ALLOWED') {
                toast.error('Kendi kanalınıza abone olamazsınız!');
            } else if (detail === 'Already subscribed') {
                setIsSubscribed(true);
            } else {
                toast.error('Abonelik işlemi başarısız oldu');
            }
        } finally {
            setSubLoading(false);
        }
    };

    const handleToggleLike = async () => {
        const user = getCurrentUser();
        if (!user) {
            alert("Please sign in to like videos");
            return;
        }

        setLikeLoading(true);
        try {
            const res = await ApiClient.post(`/videos/${id}/like`);
            setLikeCount(res.data.like_count);
            setUserHasLiked(res.data.user_has_liked);
            setDislikeCount(res.data.dislike_count);
            setUserHasDisliked(res.data.user_has_disliked);
        } catch (err) {
            console.error("Like toggle failed:", err);
        } finally {
            setLikeLoading(false);
        }
    };

    const handleToggleDislike = async () => {
        const user = getCurrentUser();
        if (!user) {
            alert("Please sign in to dislike videos");
            return;
        }

        setDislikeLoading(true);
        try {
            const res = await ApiClient.post(`/videos/${id}/dislike`);
            setLikeCount(res.data.like_count);
            setUserHasLiked(res.data.user_has_liked);
            setDislikeCount(res.data.dislike_count);
            setUserHasDisliked(res.data.user_has_disliked);
        } catch (err) {
            console.error("Dislike toggle failed:", err);
        } finally {
            setDislikeLoading(false);
        }
    };

    const handleSubmitComment = async (e) => {
        e.preventDefault();
        const user = getCurrentUser();
        if (!user) {
            alert("Please sign in to comment");
            return;
        }
        if (!newComment.trim()) return;

        setCommentSubmitting(true);
        try {
            const res = await ApiClient.post(`/videos/${id}/comments`, { text: newComment.trim() });
            setComments(prev => [res.data, ...prev]);
            setCommentCount(prev => prev + 1);
            setNewComment('');
        } catch (err) {
            console.error("Comment submission failed:", err);
            let msg = "Failed to post comment";
            if (err.response?.data?.detail) {
                msg = typeof err.response.data.detail === 'string'
                    ? err.response.data.detail
                    : JSON.stringify(err.response.data.detail);
            } else if (err.message) {
                msg = `Network or Code Error: ${err.message}`;
            }
            alert(`Error placing comment: ${msg}`);
        } finally {
            setCommentSubmitting(false);
        }
    };

    const handleSubmitReply = async (e, parentId) => {
        e.preventDefault();
        const user = getCurrentUser();
        if (!user) { alert('Please sign in to reply'); return; }
        if (!replyText.trim()) return;

        setReplySubmitting(true);
        try {
            const res = await ApiClient.post(`/videos/${id}/comments`, {
                text: replyText.trim(),
                parent_id: parentId
            });
            // Optimistically add reply to correct parent
            setComments(prev => prev.map(c =>
                c.id === parentId
                    ? { ...c, replies: [...(c.replies || []), res.data] }
                    : c
            ));
            setCommentCount(prev => prev + 1);
            setReplyText('');
            setReplyingTo(null);
            // Auto-expand replies for this comment
            setExpandedReplies(prev => ({ ...prev, [parentId]: true }));
        } catch (err) {
            console.error('Reply submission failed:', err);
            alert(err.response?.data?.detail || 'Failed to post reply');
        } finally {
            setReplySubmitting(false);
        }
    };

    const handleCommentLike = async (commentId) => {
        const user = getCurrentUser();
        if (!user) { alert('Please sign in to like comments'); return; }
        try {
            const res = await ApiClient.post(`/comments/${commentId}/like`);
            setComments(prev => prev.map(c => c.id === commentId ? {
                ...c,
                like_count: res.data.like_count,
                dislike_count: res.data.dislike_count,
                user_has_liked: res.data.user_has_liked,
                user_has_disliked: res.data.user_has_disliked
            } : c));
        } catch (err) { console.error('Comment like failed:', err); }
    };

    const handleCommentDislike = async (commentId) => {
        const user = getCurrentUser();
        if (!user) { alert('Please sign in to dislike comments'); return; }
        try {
            const res = await ApiClient.post(`/comments/${commentId}/dislike`);
            setComments(prev => prev.map(c => c.id === commentId ? {
                ...c,
                like_count: res.data.like_count,
                dislike_count: res.data.dislike_count,
                user_has_liked: res.data.user_has_liked,
                user_has_disliked: res.data.user_has_disliked
            } : c));
        } catch (err) { console.error('Comment dislike failed:', err); }
    };

    const handleDeleteComment = async (commentId) => {
        try {
            await ApiClient.delete(`/comments/${commentId}`);
            setComments(prev => prev.filter(c => c.id !== commentId));
            setCommentCount(prev => prev - 1);
        } catch (err) {
            console.error("Delete comment failed:", err);
            alert(err.response?.data?.detail || "Failed to delete comment");
        }
    };

    // ══════════════════════════════════════════════════
    // Render: Loading & Error States
    // ══════════════════════════════════════════════════

    if (loading && !video) {
        return (
            <div className="pt-24 px-4 md:px-8 max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
                <div className="flex-1">
                    <div className="aspect-video bg-surface rounded-2xl animate-pulse mb-6" />
                    <div className="h-8 bg-surface rounded w-3/4 animate-pulse mb-4" />
                    <div className="h-4 bg-surface rounded w-1/4 animate-pulse mb-8" />
                </div>
                <div className="lg:w-80 xl:w-96">
                    <SidebarSkeleton />
                </div>
            </div>
        );
    }

    if (!video) return (
        <div className="pt-24 text-center">
            <h1 className="text-2xl font-bold mb-4">Video not found</h1>
            <p className="text-white/50 mb-2">Requested ID: {id}</p>
            {fetchError && <p className="text-red-500 font-mono text-sm bg-black/50 inline-block px-4 py-2 rounded">{fetchError}</p>}
        </div>
    );

    // Rotating Fallback Strategy to demonstrate dynamic playback
    const EVEN_FALLBACK = "https://vjs.zencdn.net/v/oceans.mp4";
    const ODD_FALLBACK = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
    const DYNAMIC_FALLBACK = (parseInt(id) % 2 === 0) ? EVEN_FALLBACK : ODD_FALLBACK;

    // Fail-Safe Playback: Priority to real backend URL, fallback to rotating test clips
    const videoSrc = (video.video_url && video.video_url !== "" && !video.video_url.includes('synthetic'))
        ? getMediaUrl(video.video_url)
        : DYNAMIC_FALLBACK;

    const handleVideoEnd = () => {
        const autoplaySaved = localStorage.getItem('utube_autoplay');
        const isAutoplayEnabled = autoplaySaved !== null ? JSON.parse(autoplaySaved) : true;
        if (!isAutoplayEnabled) return;

        // ── Playlist-aware auto-play: navigate to next video in playlist ──
        if (listId && playlistData?.videos?.length > 0) {
            const currentIndex = playlistData.videos.findIndex(v => v.id === parseInt(id));
            const nextVideo = currentIndex >= 0 ? playlistData.videos[currentIndex + 1] : null;
            if (nextVideo) {
                toast.success(`Up next: ${nextVideo.title}`, { icon: '▶️' });
                navigate(`/video/${nextVideo.id}?list=${listId}`);
                return;
            }
            // Reached end of playlist — fall through to recommendation autoplay
        }

        // ── Fallback: recommendation-based autoplay ──
        if (recommendations.length > 0) {
            const nextVideo = recommendations[0];
            if (nextVideo?.id) {
                toast.success(`Autoplay: Playing ${nextVideo.title}`);
                navigate(`/video/${nextVideo.id}`);
            }
        }
    };

    // ── Derive current index in the playlist ──
    const currentPlaylistIndex = playlistData?.videos?.findIndex(v => v.id === parseInt(id)) ?? -1;


    return (
        <motion.div
            key={id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pt-24 pb-12 px-4 md:px-8 max-w-[1600px] mx-auto"
        >

            {/* ── Layout: 70/30 split in playlist mode, standard 8/4 otherwise ── */}
            <div className={`grid grid-cols-1 gap-8 ${listId ? 'xl:grid-cols-[1fr_360px]' : 'lg:grid-cols-12'}`}>
                {/* Main Content */}
                <div className={listId ? '' : 'lg:col-span-8'}>
                    {/* Video Player */}
                    <div className="mb-6">
                        <VideoPlayer
                            src={videoSrc}
                            poster={getMediaUrl(video.thumbnail_url) || THUMBNAIL_FALLBACK}
                            onError={(e) => {
                                if (e.target.src !== DYNAMIC_FALLBACK) {
                                    e.target.src = DYNAMIC_FALLBACK;
                                }
                            }}
                            availableResolutions={availableResolutions}
                            transcodeStatus={transcodeStatus}
                            title={video.title}
                            channelName={video.author?.username}
                            onEnded={handleVideoEnd}
                        />
                    </div>

                    {/* Video Info */}
                    <h1 className="text-2xl md:text-3xl font-bold mb-2 tracking-tight">{video.title}</h1>
                    <div className="flex flex-col md:flex-row md:items-center justify-between py-4 border-b border-white/10 mb-6 gap-4">
                        <div className="flex items-center gap-4">
                            <Link
                                to={`/channel/${video.author?.id}`}
                                className="w-12 h-12 rounded-full overflow-hidden border border-white/10 bg-surface shrink-0 hover:ring-2 hover:ring-white/30 transition-all"
                            >
                                <img
                                    src={getAvatarUrl(video.author?.profile_image, video.author?.username)}
                                    alt={video.author?.username}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${video.author?.username || 'User'}&background=random&color=fff`; }}
                                />
                            </Link>

                            <Link
                                to={`/channel/${video.author?.id}`}
                                className="hover:underline underline-offset-2"
                            >
                                <p className="font-bold">{video.author?.username}</p>
                                <p className="text-white/40 text-xs">
                                    {(authorSubCount ?? 0).toLocaleString()} subscribers
                                </p>
                            </Link>
                            {isOwnChannel ? (
                                <Link
                                    to="/edit-profile"
                                    className="ml-4 px-6 py-2 rounded-full font-bold text-sm transition-all active:scale-95 bg-white/10 text-white hover:bg-white/20 border border-white/5 inline-block"
                                >
                                    Edit Profile
                                </Link>
                            ) : (
                                <button
                                    onClick={handleSubscribe}
                                    disabled={subLoading}
                                    className={`ml-4 px-6 py-2 rounded-full font-bold text-sm transition-all active:scale-95 ${isSubscribed
                                        ? "bg-white/10 text-white hover:bg-white/20 border border-white/5"
                                        : "bg-white text-black hover:bg-white/90"
                                        }`}
                                >
                                    {subLoading ? "..." : isSubscribed ? "Subscribed" : "Subscribe"}
                                </button>
                            )}
                        </div>



                        <div className="flex items-center gap-2">
                            <div className="flex bg-white/10 rounded-full overflow-hidden glass">
                                {/* ── Like Button (wired to API) ── */}
                                <button
                                    onClick={handleToggleLike}
                                    disabled={likeLoading}
                                    className={`flex items-center gap-2 px-4 py-2 transition-colors border-r border-white/10 ${userHasLiked
                                        ? 'bg-primary/20 text-primary hover:bg-primary/30'
                                        : 'hover:bg-white/10 text-white'
                                        }`}
                                >
                                    <svg className="w-5 h-5" fill={userHasLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21H4a1 1 0 01-1-1v-8a1 1 0 011-1h3l2.31-6.925A1.847 1.847 0 0111.153 3 2.847 2.847 0 0114 5.847V10z" />
                                    </svg>
                                    <span className="text-sm font-bold">{likeCount}</span>
                                </button>
                                {/* ── Dislike Button (wired to API) ── */}
                                <button
                                    onClick={handleToggleDislike}
                                    disabled={dislikeLoading}
                                    className={`flex items-center gap-2 px-4 py-2 transition-colors ${userHasDisliked
                                        ? 'bg-primary/20 text-primary hover:bg-primary/30'
                                        : 'hover:bg-white/10 text-white'
                                        }`}
                                >
                                    <svg className="w-5 h-5 rotate-180" fill={userHasDisliked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21H4a1 1 0 01-1-1v-8a1 1 0 011-1h3l2.31-6.925A1.847 1.847 0 0111.153 3 2.847 2.847 0 0114 5.847V10z" />
                                    </svg>
                                </button>
                            </div>
                            <button className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-5 py-2 rounded-full transition-colors glass font-bold text-sm">
                                Share
                            </button>
                            {/* ── Save to Playlist Button ── */}
                            <button
                                onClick={() => {
                                    const user = getCurrentUser();
                                    if (!user) {
                                        toast.error('Sign in to save videos');
                                        return;
                                    }
                                    setIsSaveModalOpen(true);
                                }}
                                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-5 py-2 rounded-full transition-colors glass font-bold text-sm"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                </svg>
                                Save
                            </button>
                        </div>
                    </div>

                    {/* ══════════════════════════════════════════════════ */}
                    {/* Expandable Description Box                       */}
                    {/* ══════════════════════════════════════════════════ */}
                    <div
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="bg-white/5 hover:bg-white/10 transition-colors rounded-xl p-3 cursor-pointer mt-4 flex flex-col"
                    >
                        <p className="font-bold text-sm text-white/90 mb-2">
                            {video.view_count || 0} views
                            {video.upload_date && (
                                <>
                                    <span className="mx-1">•</span>
                                    {new Date(video.upload_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </>
                            )}
                        </p>

                        <div className={`text-sm text-white/80 whitespace-pre-wrap ${!isExpanded ? 'line-clamp-2' : ''}`}>
                            {formatText(video.description)}
                        </div>

                        {/* Centered Indicator inside the box */}
                        <div className="mt-2 pt-1 flex justify-center w-full">
                            <span className="text-xs font-bold text-white/50 uppercase tracking-wider hover:text-white transition-colors">
                                {isExpanded ? "Show less ▲" : "Show more ▼"}
                            </span>
                        </div>
                    </div>



                    {/* ══════════════════════════════════════════════════ */}
                    {/* Comment Section (fully wired to API) */}
                    {/* ══════════════════════════════════════════════════ */}
                    <div className="mt-8">
                        <h3 className="text-xl font-bold mb-6">
                            {commentCount} Comment{commentCount !== 1 ? 's' : ''}
                        </h3>

                        {/* Comment Input */}
                        <form onSubmit={handleSubmitComment} className="flex gap-4 mb-8">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-surface shrink-0 border border-white/10">
                                {currentUser ? (
                                    <img
                                        src={getAvatarUrl(currentUser.profile_image, currentUser.username)}
                                        alt={currentUser.username}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-white/5" />
                                )}
                            </div>
                            <div className="flex-1">
                                <input
                                    type="text"
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder={currentUser ? "Add a comment..." : "Sign in to comment..."}
                                    disabled={!currentUser}
                                    className="w-full bg-transparent border-b border-white/20 pb-2 focus:outline-none focus:border-white transition-all placeholder:text-white/20 disabled:opacity-40"
                                />
                                <AnimatePresence>
                                    {newComment.trim() && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="flex justify-end gap-2 mt-3"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setNewComment('')}
                                                className="px-4 py-1.5 rounded-full text-sm font-bold text-white/60 hover:bg-white/10 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={commentSubmitting}
                                                className="px-4 py-1.5 rounded-full text-sm font-bold bg-primary text-white hover:bg-primary/80 transition-colors disabled:opacity-50"
                                            >
                                                {commentSubmitting ? "Posting..." : "Comment"}
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </form>

                        {/* Comment List */}
                        {commentLoading ? (
                            <div className="space-y-6">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className="flex gap-4 animate-pulse">
                                        <div className="w-10 h-10 rounded-full bg-white/5 shrink-0" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-3 bg-white/5 rounded w-1/4" />
                                            <div className="h-3 bg-white/5 rounded w-3/4" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : comments.length > 0 ? (
                            <div className="space-y-6">
                                <AnimatePresence>
                                    {comments.map((comment) => (
                                        <motion.div
                                            key={comment.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, x: -50 }}
                                            className="flex gap-4 group"
                                        >
                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-surface shrink-0 border border-white/10">
                                                <img
                                                    src={getAvatarUrl(comment.author?.profile_image, comment.author?.username)}
                                                    alt={comment.author?.username}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${comment.author?.username || 'U'}&background=random&color=fff&size=40`; }}
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-sm">@{comment.author?.username || 'Unknown'}</span>
                                                    <span className="text-white/30 text-xs">
                                                        {new Date(comment.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </span>
                                                </div>
                                                <p className="text-white/80 text-sm leading-relaxed break-words">{comment.text}</p>

                                                {/* Comment Actions: Like / Dislike / Reply / Delete */}
                                                <div className="flex items-center gap-1 mt-2">
                                                    {/* Like */}
                                                    <button
                                                        onClick={() => handleCommentLike(comment.id)}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${comment.user_has_liked
                                                            ? 'text-primary bg-primary/10'
                                                            : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                                                            }`}
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill={comment.user_has_liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21H4a1 1 0 01-1-1v-8a1 1 0 011-1h3l2.31-6.925A1.847 1.847 0 0111.153 3 2.847 2.847 0 0114 5.847V10z" />
                                                        </svg>
                                                        {comment.like_count > 0 && <span>{comment.like_count}</span>}
                                                    </button>
                                                    {/* Dislike */}
                                                    <button
                                                        onClick={() => handleCommentDislike(comment.id)}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${comment.user_has_disliked
                                                            ? 'text-primary bg-primary/10'
                                                            : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                                                            }`}
                                                    >
                                                        <svg className="w-3.5 h-3.5 rotate-180" fill={comment.user_has_disliked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21H4a1 1 0 01-1-1v-8a1 1 0 011-1h3l2.31-6.925A1.847 1.847 0 0111.153 3 2.847 2.847 0 0114 5.847V10z" />
                                                        </svg>
                                                        {comment.dislike_count > 0 && <span>{comment.dislike_count}</span>}
                                                    </button>

                                                    {/* Reply Button */}
                                                    <button
                                                        onClick={() => {
                                                            if (replyingTo?.id === comment.id) {
                                                                setReplyingTo(null);
                                                                setReplyText('');
                                                            } else {
                                                                setReplyingTo({ id: comment.id, username: comment.author?.username });
                                                                setReplyText('');
                                                            }
                                                        }}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-colors ${replyingTo?.id === comment.id ? 'text-[var(--gold)] bg-[var(--gold)]/10' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`}
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                        </svg>
                                                        Reply
                                                    </button>

                                                    {/* Delete — own comments only */}
                                                    {currentUser && currentUser.id === comment.author?.id && (
                                                        <button
                                                            onClick={() => handleDeleteComment(comment.id)}
                                                            className="ml-2 text-xs text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            Delete
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Inline Reply Form */}
                                                <AnimatePresence>
                                                    {replyingTo?.id === comment.id && (
                                                        <motion.form
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: 'auto' }}
                                                            exit={{ opacity: 0, height: 0 }}
                                                            onSubmit={(e) => handleSubmitReply(e, comment.id)}
                                                            className="mt-3 flex gap-3 items-start"
                                                        >
                                                            <div className="w-7 h-7 rounded-full overflow-hidden bg-surface shrink-0 border border-white/10">
                                                                <img
                                                                    src={getAvatarUrl(getCurrentUser()?.profile_image, getCurrentUser()?.username)}
                                                                    alt="You"
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="relative">
                                                                    <span className="text-[var(--gold)] text-xs font-bold mr-1">@{replyingTo.username}</span>
                                                                    <input
                                                                        type="text"
                                                                        autoFocus
                                                                        value={replyText}
                                                                        onChange={(e) => setReplyText(e.target.value)}
                                                                        placeholder="Write a reply..."
                                                                        className="w-full bg-transparent border-b border-white/10 focus:border-[var(--gold)]/50 outline-none text-sm py-1 text-white placeholder-white/30 transition-colors"
                                                                    />
                                                                </div>
                                                                <div className="flex justify-end gap-2 mt-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => { setReplyingTo(null); setReplyText(''); }}
                                                                        className="px-3 py-1 rounded-full text-xs font-bold text-white/50 hover:bg-white/10 transition-colors"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                    <button
                                                                        type="submit"
                                                                        disabled={replySubmitting || !replyText.trim()}
                                                                        className="px-3 py-1 rounded-full text-xs font-black transition-colors disabled:opacity-40"
                                                                        style={{ background: 'var(--gold)', color: 'black' }}
                                                                    >
                                                                        {replySubmitting ? 'Posting…' : 'Reply'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </motion.form>
                                                    )}
                                                </AnimatePresence>

                                                {/* Nested Replies */}
                                                {comment.replies && comment.replies.length > 0 && (
                                                    <div className="mt-3">
                                                        <button
                                                            onClick={() => setExpandedReplies(prev => ({ ...prev, [comment.id]: !prev[comment.id] }))}
                                                            className="flex items-center gap-1.5 text-xs font-black mb-3 transition-colors"
                                                            style={{ color: 'var(--gold)' }}
                                                        >
                                                            <svg className={`w-3.5 h-3.5 transition-transform ${expandedReplies[comment.id] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                            {expandedReplies[comment.id]
                                                                ? `Hide ${comment.replies.length} ${comment.replies.length === 1 ? 'reply' : 'replies'}`
                                                                : `${comment.replies.length} ${comment.replies.length === 1 ? 'reply' : 'replies'}`
                                                            }
                                                        </button>

                                                        <AnimatePresence>
                                                            {expandedReplies[comment.id] && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, height: 0 }}
                                                                    animate={{ opacity: 1, height: 'auto' }}
                                                                    exit={{ opacity: 0, height: 0 }}
                                                                    className="space-y-4 pl-4 border-l-2 border-white/5"
                                                                >
                                                                    {comment.replies.map((reply) => (
                                                                        <div key={reply.id} className="flex gap-3 group/reply">
                                                                            <div className="w-7 h-7 rounded-full overflow-hidden bg-surface shrink-0 border border-white/10">
                                                                                <img
                                                                                    src={getAvatarUrl(reply.author?.profile_image, reply.author?.username)}
                                                                                    alt={reply.author?.username}
                                                                                    className="w-full h-full object-cover"
                                                                                    onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${reply.author?.username || 'U'}&background=random&color=fff&size=40`; }}
                                                                                />
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center gap-2 mb-0.5">
                                                                                    <span className="font-bold text-xs">@{reply.author?.username}</span>
                                                                                    <span className="text-white/20 text-[10px]">
                                                                                        {new Date(reply.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                                                    </span>
                                                                                </div>
                                                                                <p className="text-white/70 text-xs leading-relaxed break-words">{reply.text}</p>
                                                                                {currentUser && currentUser.id === reply.author?.id && (
                                                                                    <button
                                                                                        onClick={() => handleDeleteComment(reply.id)}
                                                                                        className="mt-1 text-[10px] text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover/reply:opacity-100"
                                                                                    >
                                                                                        Delete
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        ) : (
                            <div className="py-12 text-center">
                                <p className="text-white/30 text-sm">No comments.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Sidebar: Playlist or Recommendations ── */}
                <div className={listId ? '' : 'lg:col-span-4'}>

                    {/* ════════════════════════════════════════════════════
                        PLAYLIST SIDEBAR — shown when ?list= param exists
                    ════════════════════════════════════════════════════ */}
                    {listId ? (
                        <div className="bg-zinc-900/70 border border-white/8 rounded-2xl overflow-hidden flex flex-col xl:sticky xl:top-24 xl:max-h-[calc(100vh-8rem)]">
                            {/* Header */}
                            <div className="px-4 pt-4 pb-3 border-b border-white/8 shrink-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <svg className="w-4 h-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
                                    </svg>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-red-500">Playlist</span>
                                </div>
                                {playlistLoading ? (
                                    <div className="h-5 w-48 bg-white/5 rounded animate-pulse" />
                                ) : (
                                    <h2 className="font-bold text-sm text-white leading-tight line-clamp-1">
                                        {playlistData?.title || 'Playlist Not Found'}
                                    </h2>
                                )}
                                {playlistData && (
                                    <p className="text-[11px] text-white/40 mt-0.5">
                                        {currentPlaylistIndex >= 0 ? currentPlaylistIndex + 1 : '–'}
                                        &nbsp;/&nbsp;
                                        {playlistData.videos?.length ?? 0}
                                    </p>
                                )}
                            </div>

                            {/* Scrollable Video List */}
                            <div className="overflow-y-auto flex-1 py-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent' }}>
                                {playlistLoading ? (
                                    <div className="space-y-2 px-3 py-2">
                                        {[...Array(5)].map((_, i) => (
                                            <div key={i} className="flex gap-2 animate-pulse">
                                                <div className="w-28 aspect-video bg-white/5 rounded-lg shrink-0" />
                                                <div className="flex-1 space-y-1.5 py-1">
                                                    <div className="h-2.5 bg-white/5 rounded w-full" />
                                                    <div className="h-2 bg-white/5 rounded w-2/3" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : playlistData?.videos?.length > 0 ? (
                                    playlistData.videos.map((pv, idx) => {
                                        const isActive = pv.id === parseInt(id);
                                        return (
                                            <Link
                                                key={pv.id}
                                                to={`/video/${pv.id}?list=${listId}`}
                                                className={`flex gap-2.5 px-3 py-2 transition-all group relative ${isActive
                                                    ? 'bg-white/10 ring-1 ring-inset ring-red-500/40'
                                                    : 'hover:bg-white/5'
                                                    }`}
                                            >
                                                {/* Index / Playing indicator */}
                                                <div className="w-5 flex items-center justify-center shrink-0">
                                                    {isActive ? (
                                                        <div className="flex gap-[2px] items-end h-3.5">
                                                            <span className="w-[3px] bg-red-500 rounded-full animate-[equalize_0.8s_ease-in-out_infinite]" style={{ height: '60%' }} />
                                                            <span className="w-[3px] bg-red-500 rounded-full animate-[equalize_0.8s_ease-in-out_0.2s_infinite]" style={{ height: '100%' }} />
                                                            <span className="w-[3px] bg-red-500 rounded-full animate-[equalize_0.8s_ease-in-out_0.4s_infinite]" style={{ height: '40%' }} />
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-white/30 font-bold">{idx + 1}</span>
                                                    )}
                                                </div>

                                                {/* Thumbnail */}
                                                <div className="w-28 aspect-video rounded-lg overflow-hidden shrink-0 bg-zinc-800 relative">
                                                    <img
                                                        src={pv.thumbnail_url || THUMBNAIL_FALLBACK}
                                                        alt={pv.title}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => { e.target.src = THUMBNAIL_FALLBACK; }}
                                                    />
                                                    {pv.duration && (
                                                        <div className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[9px] font-bold px-1 rounded">
                                                            {fmtDuration(pv.duration)}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Info */}
                                                <div className="flex-1 min-w-0 py-0.5">
                                                    <p className={`text-xs font-bold leading-tight line-clamp-2 mb-1 ${isActive ? 'text-white' : 'text-white/80 group-hover:text-white'
                                                        } transition-colors`}>
                                                        {pv.title}
                                                    </p>
                                                    <p className="text-[10px] text-white/40 truncate">{pv.author?.username}</p>
                                                    <p className="text-[10px] text-white/30">{fmtViews(pv.view_count)} views</p>
                                                </div>
                                            </Link>
                                        );
                                    })
                                ) : (
                                    <div className="py-10 text-center">
                                        <p className="text-white/20 text-xs">Playlist is empty</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* ════════════════════════════════════════════════════
                           RECOMMENDATIONS SIDEBAR — default when no playlist
                        ════════════════════════════════════════════════════ */
                        <div>
                            <h2 className="font-bold mb-6 text-lg tracking-tight flex items-center gap-2">
                                <span className="w-1 h-6 bg-primary rounded-full" />
                                Up Next
                            </h2>

                            <div className="space-y-4">
                                {recLoading ? (
                                    <SidebarSkeleton />
                                ) : recommendations.length > 0 ? (
                                    recommendations.map((rec) => (
                                        rec.status === 'published' && (
                                            <div
                                                key={rec.id}
                                                className="cursor-pointer group relative"
                                                onMouseEnter={() => {
                                                    hoverRecTimeout.current = setTimeout(() => {
                                                        setHoveredRec(rec.id);
                                                    }, 1000);
                                                }}
                                                onMouseLeave={() => {
                                                    if (hoverRecTimeout.current) clearTimeout(hoverRecTimeout.current);
                                                    setHoveredRec(null);
                                                }}
                                            >
                                                <Link to={`/video/${rec.id}`} className="flex gap-2 relative z-0 group-hover:z-10 rounded-xl pr-2 transition-colors group-hover:bg-white/5">
                                                    <div className="w-[168px] aspect-video rounded-xl overflow-hidden shrink-0 relative transition-transform duration-500 group-hover:scale-105 group-hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)] bg-neutral-900/50">
                                                        <img
                                                            src={getMediaUrl(rec.thumbnail_url) || THUMBNAIL_FALLBACK}
                                                            alt={rec.title}
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => { e.target.src = THUMBNAIL_FALLBACK; }}
                                                        />
                                                        {(hoveredRec === rec.id) && (
                                                            <div className="absolute inset-0 z-20 pointer-events-none bg-black">
                                                                <AnimatePresence>
                                                                    <motion.div
                                                                        initial={{ opacity: 0 }}
                                                                        animate={{ opacity: 1 }}
                                                                        exit={{ opacity: 0 }}
                                                                        transition={{ duration: 0.3 }}
                                                                        className="w-full h-full"
                                                                    >
                                                                        <HoverVideoPreview video={rec} isGridMode={true} />
                                                                    </motion.div>
                                                                </AnimatePresence>
                                                            </div>
                                                        )}
                                                        {!(hoveredRec === rec.id) && rec.duration && (
                                                            <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-bold px-1 rounded z-10">
                                                                {Math.floor(rec.duration / 60)}:{(rec.duration % 60).toString().padStart(2, '0')}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0 pr-2 py-1 flex flex-col justify-start">
                                                        <h3 className="font-bold text-sm leading-tight text-white line-clamp-2 mb-1 pr-4">
                                                            {rec.title}
                                                        </h3>
                                                        <p className="text-[#AAAAAA] text-xs hover:text-white transition-colors truncate">
                                                            {rec.author?.username}
                                                        </p>
                                                        <p className="text-[#AAAAAA] text-xs">
                                                            {fmtViews(rec.view_count)} views • {timeAgo(rec.upload_date || rec.created_at)}
                                                        </p>
                                                    </div>
                                                    <div
                                                        className="absolute top-0 right-0 p-1 text-white hover:text-white/80 transition-colors z-20"
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                    >
                                                        <VideoMenu
                                                            video={rec}
                                                            onHide={(type, id) => {
                                                                setRecommendations(prev => prev.filter(r => r.id !== rec.id));
                                                            }}
                                                        />
                                                    </div>
                                                </Link>
                                            </div>
                                        )
                                    ))
                                ) : (
                                    <div className="py-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                                        <p className="text-white/20 text-sm italic">No recommendations found</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Save to Playlist Modal ── */}
            <SaveToPlaylistModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                videoId={parseInt(id)}
            />
        </motion.div>
    );
};

export default VideoDetail;
