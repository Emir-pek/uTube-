import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import ApiClient from '../utils/ApiClient';
import { FLV_BASE_URL, WS_BASE_URL, getAvatarUrl, getValidUrl, THUMBNAIL_FALLBACK } from '../utils/urlHelper';
import { UTUBE_TOKEN, UTUBE_USER } from '../utils/authConstants';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import flvjs from 'flv.js';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import CustomWarningDialog from '../components/CustomWarningDialog';
import BanReasonDialog from '../components/BanReasonDialog';
import BanNotification from '../components/BanNotification';

const API_BASE = 'http://' + window.location.hostname + ':8000/api/v1';

const getAuthHeaders = () => {
    const token = localStorage.getItem(UTUBE_TOKEN);
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};
// ═══════════════════════════════════════════════════════════════════════════════
// WatchPage — Production-Ready Live Stream Viewer
// ═══════════════════════════════════════════════════════════════════════════════
// Architecture:
//   - Metadata:   GET /auth/profile/{username} (public)
//   - Subscribe:  POST|DELETE /auth/subscribe/{user_id}
//   - FLV Player: Proxied via Vite (/live → :8080) in dev
//   - Chat:       WebSocket at /api/v1/ws/chat/{username} with JWT handshake
//   - History:    GET /api/v1/chat/history/{username}
//   - Sidebar:    GET /recommendations/recommended
// ═══════════════════════════════════════════════════════════════════════════════

const WatchPage = () => {
    const { username } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const flvPlayerRef = useRef(null);
    const chatEndRef = useRef(null);
    const wsRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const reconnectCountRef = useRef(0);
    const MAX_RECONNECT = 5;

    // ── Core State ───────────────────────────────────────────────────────
    const [isLive, setIsLive] = useState(false);
    const [stream, setStream] = useState(null);
    const [pageState, setPageState] = useState('loading'); // 'loading' | 'ready' | 'not_found' | 'error'
    const [streamMetadata, setStreamMetadata] = useState({
        userId: null,
        title: '',
        category: null,
        profileImage: null,
        subscriberCount: 0,
    });

    // ── Interaction State ────────────────────────────────────────────────
    const [isLiked, setIsLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const [likeLoading, setLikeLoading] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [subLoading, setSubLoading] = useState(false);

    // ── Chat State (WebSocket-powered) ──────────────────────────────────
    const [chatInput, setChatInput] = useState('');
    const [chatMessages, setChatMessages] = useState([]);
    const [wsStatus, setWsStatus] = useState('disconnected'); // 'connecting' | 'connected' | 'disconnected'
    
    // Moderation States
    const [isCurrentUserMod, setIsCurrentUserMod] = useState(false);
    const [currentUserTier, setCurrentUserTier] = useState(1);
    const [currentUserRole, setCurrentUserRole] = useState(null);
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState(null);
    const [showModeratorPanel, setShowModeratorPanel] = useState(false);
    const [moderators, setModerators] = useState([]);
    const [bannedUsers, setBannedUsers] = useState([]);
    const [isRefreshingModData, setIsRefreshingModData] = useState(false);

    const fetchModerationData = useCallback(async () => {
        if (!username) return;
        setIsRefreshingModData(true);
        try {
            const modsRes = await ApiClient.get(`/moderator/${username}/list`);
            setModerators(modsRes.data);
            const bansRes = await ApiClient.get(`/moderator/${username}/bans`);
            setBannedUsers(bansRes.data);
        } catch (error) {
            console.error("Failed to fetch moderation data:", error);
        } finally {
            setIsRefreshingModData(false);
        }
    }, [username]);

    useEffect(() => {
        if (showModeratorPanel) {
            fetchModerationData();
        }
    }, [showModeratorPanel, fetchModerationData]);

    // ── Poll State ────────────────────────────────────────────────────────
    const [activePoll, setActivePoll] = useState(null);
    const [hasVoted, setHasVoted] = useState(false);
    const [pollTimeLeft, setPollTimeLeft] = useState(0);
    const [pollPhase, setPollPhase] = useState('none'); // 'none' | 'active' | 'results'

    // ── Moderation Enforcement (Current User) ───────────────────────────
    const [showBanNotification, setShowBanNotification] = useState(false);
    const [currentBanInfo, setCurrentBanInfo] = useState(null);
    const [isBannedLocal, setIsBannedLocal] = useState(false);
    const [timeoutExpiryLocal, setTimeoutExpiryLocal] = useState(null);
    
    // Moderator UI States
    const [showBanReasonModal, setShowBanReasonModal] = useState(false);
    const [pendingModAction, setPendingModAction] = useState({ action: '', duration: null, targetUser: null });


    // ── Sidebar State ────────────────────────────────────────────────────
    const [recommendedVideos, setRecommendedVideos] = useState([]);

    // ── Category Icon Map ────────────────────────────────────────────────
    // ── Auth & Ownership ───────────────────────────────────────────────
    const currentUser = JSON.parse(localStorage.getItem(UTUBE_USER) || 'null');
    const isOwnChannel = currentUser?.username === username;

    const categoryIcons = {
        Gaming: '🎮', Education: '🎓', Technology: '💻', 'Just Chatting': '💬',
        Music: '🎵', Entertainment: '🎬', Sports: '🏀', News: '📰',
        Science: '🔬', Art: '🎨', Cooking: '🍳', Travel: '✈️',
    };
    
    // ── Components ────────────────────────────────────────────────────────
    const UserBadge = ({ tier, isCreator }) => {
        if (isCreator || tier === 5) return <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/50 px-1 py-0.5 rounded uppercase tracking-wider font-bold">Broadcaster</span>;
        if (tier === 4) return <span className="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/40 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider backdrop-blur-sm shadow-[0_0_8px_rgba(168,85,247,0.2)]">Admin</span>;
        if (tier === 3) return <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/40 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider backdrop-blur-sm shadow-[0_0_8px_rgba(59,130,246,0.2)]">Sr Mod</span>;
        if (tier === 2) return <span className="text-[10px] bg-[#00ffcc]/15 text-[#00ffcc] border border-[#00ffcc]/30 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider backdrop-blur-sm shadow-[0_0_8px_rgba(0,255,204,0.15)]">Mod</span>;
        return null;
    };

    // ════════════════════════════════════════════════════════════════════════
    // DATA FETCHING
    // ════════════════════════════════════════════════════════════════════════

    // ── 1. Fetch Stream Metadata ─────────────────────────────────────────
    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        toast.success("Link copied to clipboard!", { icon: '🔗' });
    };

    // ── 1. Fetch Stream Metadata with Polling (Heartbeat) ────────────────
    useEffect(() => {
        const fetchStream = async () => {
            try {
                const API_BASE_8000 = 'http://' + window.location.hostname + ':8000/api/v1';
                const response = await axios.get(`${API_BASE_8000}/streams/${username}`);
                const streamData = response.data;
                setStream(streamData);

                // Keep other state in sync
                const serverLive = streamData.is_live === true || streamData.stream_status === 'live';
                setIsLive(serverLive);

                setStreamMetadata({
                    userId: streamData.id,
                    title: streamData.stream_title || `${username}'s Live Stream`,
                    category: streamData.stream_category || null,
                    profileImage: streamData.profile_image || null,
                    subscriberCount: streamData.subscriber_count || 0,
                    streamKey: streamData.stream_key
                });
                setPageState('ready');
            } catch (error) {
                // GRACEFUL 404 HANDLING: If the channel doesn't exist, don't spam errors
                if (error.response?.status === 404) {
                    console.warn(`[WatchPage] Stream metadata for "${username}" not found (404).`);
                    setStream({ is_live: false });
                    setPageState('not_found');
                } else {
                    console.error("Stream fetch error:", error);
                    setStream({ is_live: false }); // Graceful fallback
                }
            }
        };

        if (username) {
            fetchStream();
            const interval = setInterval(fetchStream, 5000); // 5s Heartbeat
            return () => clearInterval(interval);
        } else {
            setPageState('error');
        }
    }, [username]);

    // ── 2. Check Subscription Status (only if logged in) ────────────────
    useEffect(() => {
        const token = localStorage.getItem(UTUBE_TOKEN);
        if (!token) return; // Skip if not logged in — prevents 401 redirect

        const checkSubscription = async () => {
            try {
                const response = await axios.get(`${API_BASE}/auth/subscriptions`, getAuthHeaders());
                const subscriptions = response.data;
                const isSubbed = subscriptions.some(user => user.username === username);
                setIsSubscribed(isSubbed);
            } catch {
                // Auth failed or error — default to not subscribed
                setIsSubscribed(false);
            }
        };

        checkSubscription();
    }, [username]);

    // ── 3. Fetch Recommended Videos (Sidebar) ───────────────────────────
    useEffect(() => {
        const fetchRecommended = async () => {
            try {
                const response = await axios.get(`${API_BASE}/recommendations/recommended`);
                setRecommendedVideos(response.data?.slice(0, 8) || []);
            } catch (error) {
                // Silently catch 404 so it never breaks the render cycle
                setRecommendedVideos([]);
            }
        };

        fetchRecommended();
    }, []);

    // ════════════════════════════════════════════════════════════════════════
    // FLV PLAYER
    // ════════════════════════════════════════════════════════════════════════

    const destroyPlayer = useCallback(() => {
        if (flvPlayerRef.current) {
            try {
                flvPlayerRef.current.pause();
                flvPlayerRef.current.unload();
                flvPlayerRef.current.detachMediaElement();
                flvPlayerRef.current.destroy();
            } catch { /* cleanup errors are safe to ignore */ }
            flvPlayerRef.current = null;
        }
    }, []);

    // ── Strict FLV Player Initialization with Live Sync ──────────────────
    useEffect(() => {
        // 1. Guard clauses: Wait for everything to be perfectly ready
        if (!stream || !stream.is_live || !stream.stream_key || !videoRef.current) {
            return;
        }

        let player = null;

        if (flvjs.isSupported()) {
            // 2. Build the exact NMS URL
            const videoUrl = `http://${window.location.hostname}:8080/live/${stream.stream_key}.flv`;
            console.log("Attempting to play FLV from:", videoUrl);

            player = flvjs.createPlayer({
                type: 'flv',
                isLive: true,
                url: videoUrl
            }, {
                enableWorker: false,
                enableStashBuffer: false
            });

            player.attachMediaElement(videoRef.current);
            player.load();
            player.play().catch(err => console.error("FLV Play Error:", err));

            // ENFORCE LIVE EDGE SYNC (Background Tab Fix)
            const handleVisibilitySync = () => {
                if (!document.hidden && videoRef.current && videoRef.current.buffered.length > 0) {
                    try {
                        const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
                        // Force real-time edge
                        videoRef.current.currentTime = bufferedEnd;
                        console.log("Joined live edge after tab visibility change");
                    } catch (e) { console.warn("Live edge sync failed:", e); }
                }
            };
            document.addEventListener('visibilitychange', handleVisibilitySync);

            // 3. Cleanup on unmount or stream end
            return () => {
                document.removeEventListener('visibilitychange', handleVisibilitySync);
                if (player) {
                    player.pause();
                    player.unload();
                    player.detachMediaElement();
                    player.destroy();
                }
            };
        }
    }, [stream?.is_live, stream?.stream_key]); // Strict Dependency Array



    // ════════════════════════════════════════════════════════════════════════
    // INTERACTION HANDLERS
    // ════════════════════════════════════════════════════════════════════════

    const handleLike = async () => {
        if (likeLoading) return;
        if (!localStorage.getItem(UTUBE_TOKEN)) {
            toast.error('Please log in to like');
            return;
        }
        setLikeLoading(true);

        // Optimistic UI update
        const previousState = isLiked;
        setIsLiked(!isLiked);
        setLikeCount(prev => previousState ? Math.max(0, prev - 1) : prev + 1);

        try {
            const response = await axios.post(`${API_BASE}/auth/live/like/${username}`, {}, getAuthHeaders());
            // Sync with server truth
            setIsLiked(response.data.liked);
            setLikeCount(response.data.new_like_count);
            toast.success(response.data.liked ? 'Stream liked! ❤️' : 'Like removed');
        } catch (err) {
            // Revert optimistic update on failure
            setIsLiked(previousState);
            setLikeCount(prev => previousState ? prev + 1 : Math.max(0, prev - 1));
            if (err.response?.status === 401) {
                toast.error('Please log in to like');
            } else if (err.response?.status === 400) {
                toast.error("You can't like your own stream");
            } else {
                toast.error('Could not process like');
            }
        } finally {
            setLikeLoading(false);
        }
    };

    const handleSubscribe = async () => {
        if (subLoading || !streamMetadata.userId) return;
        if (!localStorage.getItem(UTUBE_TOKEN)) {
            toast.error('Please log in to subscribe');
            return;
        }
        setSubLoading(true);

        const previousState = isSubscribed;
        setIsSubscribed(!isSubscribed); // Optimistic

        try {
            if (previousState) {
                await axios.delete(`${API_BASE}/auth/subscribe/${streamMetadata.userId}`, getAuthHeaders());
                toast.success('Unsubscribed');
                setStreamMetadata(prev => ({
                    ...prev,
                    subscriberCount: Math.max(0, prev.subscriberCount - 1)
                }));
            } else {
                await axios.post(`${API_BASE}/auth/subscribe/${streamMetadata.userId}`, {}, getAuthHeaders());
                toast.success('Subscribed! 🔔');
                setStreamMetadata(prev => ({
                    ...prev,
                    subscriberCount: prev.subscriberCount + 1
                }));
            }
        } catch (err) {
            // Revert optimistic update on failure
            setIsSubscribed(previousState);
            if (err.response?.status === 401) {
                toast.error('Please log in to subscribe');
            } else if (err.response?.status === 400) {
                toast.error("You can't subscribe to yourself");
            } else {
                toast.error('Something went wrong');
            }
        } finally {
            setSubLoading(false);
        }
    };

    const handlePollVote = (optionIndex) => {
        if (!localStorage.getItem(UTUBE_TOKEN)) {
            toast.error('Log in to vote');
            return;
        }
        if (hasVoted || !activePoll || wsStatus !== 'connected' || !wsRef.current) return;

        wsRef.current.send(JSON.stringify({
            type: 'POLL_VOTE',
            optionIndex: optionIndex
        }));

        setHasVoted(true);
        toast.success(`Vote submitted!`);
    };

    // ── Chat: Fetch History on Join ───────────────────────────────────────
    useEffect(() => {
        if (!username || pageState !== 'ready') return;

        const fetchChatHistory = async () => {
            try {
                const response = await ApiClient.get(`/history/${username}?limit=30`);
                if (response.data && Array.isArray(response.data)) {
                    setChatMessages(response.data);
                }
            } catch (error) {
                console.error('[Chat] Failed to fetch chat history:', error);
            }
        };

        fetchChatHistory();
    }, [username, pageState]);
    // ── Chat: WebSocket Lifecycle ─────────────────────────────────────────
    useEffect(() => {
        if (pageState !== 'ready' || !username) return;

        const connectWs = () => {
            // Build WS URL with optional JWT token
            const token = localStorage.getItem(UTUBE_TOKEN);
            const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
            const wsUrl = `${WS_BASE_URL}/api/v1/ws/chat/${username}${tokenParam}`;

            setWsStatus('connecting');
            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                setWsStatus('connected');
                reconnectCountRef.current = 0;
                console.log('[Chat] WebSocket connected');
            };

            ws.onmessage = (event) => {
                try {
                    const parsedMessage = JSON.parse(event.data);
                    switch (parsedMessage.type) {
                        case 'chat':
                        case 'system':
                            setChatMessages(prev => [...prev, parsedMessage]);
                            // Detect if the server tells us we are a mod upon connecting
                            if (parsedMessage.user === 'System' && parsedMessage.text.includes('Connected')) {
                                setIsCurrentUserMod(!!parsedMessage.isMod);
                                setCurrentUserTier(parsedMessage.tier || 1);
                                setCurrentUserRole(parsedMessage.role || null);
                            }
                            break;
                        case 'message.deleted':
                            setChatMessages(prev => prev.filter(m => m.id !== parsedMessage.msg_id));
                            break;
                        case 'user.banned':
                            if (parsedMessage.userId === currentUser?.id || parsedMessage.username === currentUser?.username) {
                                setCurrentBanInfo(parsedMessage);
                                setShowBanNotification(true);
                                setIsBannedLocal(true);
                                setChatMessages(prev => prev.filter(m => m.user !== parsedMessage.username));
                            } else {
                                setChatMessages(prev => prev.filter(m => m.user !== parsedMessage.username));
                            }
                            break;
                        case 'user.timedout':
                            if (parsedMessage.userId === currentUser?.id || parsedMessage.username === currentUser?.username) {
                                setCurrentBanInfo(parsedMessage);
                                setShowBanNotification(true);
                                setTimeoutExpiryLocal(parsedMessage.expires_at);
                                // No need to clear messages for timeout usually
                            } else {
                                // Optional: system message for others if not suppressed
                            }
                            break;
                        case 'POLL_START':
                            setActivePoll(parsedMessage.data);
                            setPollTimeLeft(parsedMessage.data.duration);
                            setPollPhase('active');
                            setHasVoted(false);
                            break;
                        case 'POLL_VOTE':
                            // Update vote counts
                            setActivePoll(prev => {
                                if (!prev) return prev;
                                const newOptions = [...prev.options];
                                if (parsedMessage.optionIndex !== undefined && newOptions[parsedMessage.optionIndex]) {
                                    newOptions[parsedMessage.optionIndex].votes = (newOptions[parsedMessage.optionIndex].votes || 0) + 1;
                                }
                                return { ...prev, options: newOptions };
                            });
                            break;
                        case 'POLL_END':
                            setActivePoll(null);
                            setHasVoted(false);
                            setPollPhase('none');
                            setPollTimeLeft(0);
                            break;
                        case 'status_update':
                            // Handle real-time push from backend webhooks
                            const newLiveStatus = !!parsedMessage.is_live;
                            setIsLive(newLiveStatus);
                            setStream(prev => prev ? { ...prev, is_live: newLiveStatus } : { is_live: newLiveStatus });

                            if (!newLiveStatus) {
                                // If stream went offline, clear state immediately
                                setChatMessages([]);
                                setActivePoll(null);
                                setPollPhase('none');
                                toast('Stream ended', { icon: '🛑' });
                            } else {
                                toast.success('Stream is now LIVE!', { id: 'live-notif' });
                            }
                            break;
                        default:
                            break;
                    }
                } catch (err) {
                    console.error("[Chat] Error parsing message:", err);
                }
            };

            ws.onclose = () => {
                setWsStatus('disconnected');
                wsRef.current = null;

                if (reconnectCountRef.current < MAX_RECONNECT) {
                    reconnectCountRef.current += 1;
                    const delay = 3000 + Math.random() * 2000;
                    console.log(`[Chat] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectCountRef.current}/${MAX_RECONNECT})`);
                    reconnectTimerRef.current = setTimeout(connectWs, delay);
                } else {
                    console.warn('[Chat] Max reconnect attempts reached');
                }
            };

            ws.onerror = () => {
                // onclose will fire after this
            };

            wsRef.current = ws;
        };

        connectWs();

        return () => {
            reconnectCountRef.current = MAX_RECONNECT;
            clearTimeout(reconnectTimerRef.current);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [pageState, username]);

    // ── Chat: Send Message via WebSocket ──────────────────────────────────
    const handleSendChat = (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        
        // Layer 1 & 2: Client-side enforcement
        if (isBannedLocal) {
            toast.error('You are banned from this channel.');
            return;
        }
        
        if (timeoutExpiryLocal && new Date() < new Date(timeoutExpiryLocal)) {
            const secs = Math.ceil((new Date(timeoutExpiryLocal) - new Date()) / 1000);
            toast.error(`You are timed out. Wait ${secs}s.`);
            return;
        }

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            toast.error('Chat not connected');
            return;
        }
        if (!localStorage.getItem(UTUBE_TOKEN)) {
            toast.error('Please log in to chat');
            return;
        }

        wsRef.current.send(JSON.stringify({ text: chatInput.trim() }));
        setChatInput('');
    };

    // ── Moderation Action Handlers ───────────────────────────────────────
    const handleModAction = (action, duration = null) => {
        if (!selectedMessage) return;
        
        if (action === 'delete_message') {
            if (!wsRef.current) return;
            wsRef.current.send(JSON.stringify({
                type: 'command',
                action: 'delete_message',
                msg_id: selectedMessage.id
            }));
            setIsActionModalOpen(false);
            setSelectedMessage(null);
            return;
        }

        // For ban/timeout, show the reason dialog
        setPendingModAction({
            action: action,
            duration: duration,
            targetUser: { username: selectedMessage.user }
        });
        setIsActionModalOpen(false);
        setShowBanReasonModal(true);
    };

    const confirmModerationAction = async (reason) => {
        if (!pendingModAction.targetUser) return;
        
        try {
            const endpoint = pendingModAction.action === 'ban_user' ? '/moderation/ban' : '/moderation/timeout';
            const payload = {
                username: pendingModAction.targetUser.username,
                reason: reason,
                duration: pendingModAction.duration
            };

            const response = await ApiClient.post(endpoint, payload);
            
            if (response.data.success) {
                toast.success(response.data.message);
                setShowBanReasonModal(false);
                setPendingModAction({ action: '', duration: null, targetUser: null });
                setSelectedMessage(null);
                fetchModerationData(); // Refresh mod lists
            }
        } catch (error) {
            console.error("Moderation action failed:", error);
            toast.error(error.response?.data?.detail || "Action failed");
        }
    };

    // ── Auto-scroll Chat ─────────────────────────────────────────────────
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    // ── Poll Timer Countdown ──────────────────────────────────────────────
    useEffect(() => {
        if (!activePoll || pollPhase !== 'active') return;
        const timer = setInterval(() => {
            setPollTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setPollPhase('results');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [activePoll, pollPhase]);

    const formatPollTime = (seconds) => {
        if (isNaN(seconds) || seconds == null) return '00:00';
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };



    // ════════════════════════════════════════════════════════════════════════
    // RENDER — ERROR & LOADING STATES
    // ════════════════════════════════════════════════════════════════════════

    if (pageState === 'loading') {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white mt-10">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-zinc-700 border-t-red-500 rounded-full animate-spin"></div>
                    <p className="text-zinc-400 text-sm font-mono tracking-wider uppercase">Loading stream...</p>
                </div>
            </div>
        );
    }

    if (pageState === 'not_found') {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white mt-10">
                <div className="flex flex-col items-center gap-6 text-center">
                    <svg className="w-24 h-24 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    <h1 className="text-3xl font-bold text-zinc-300">Channel Not Found</h1>
                    <p className="text-zinc-500 max-w-md">The channel "{username}" doesn't exist or has been removed.</p>
                    <Link to="/" className="mt-4 px-6 py-2.5 bg-red-600 hover:bg-red-500 rounded-full text-sm font-bold transition-colors">
                        Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    if (pageState === 'error') {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white mt-10">
                <div className="flex flex-col items-center gap-6 text-center">
                    <svg className="w-24 h-24 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-1.333-2.694-1.333-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <h1 className="text-3xl font-bold text-zinc-300">Something Went Wrong</h1>
                    <p className="text-zinc-500">Could not load this stream. Please try again later.</p>
                    <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-full text-sm font-bold transition-colors border border-zinc-700">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════════════
    // RENDER — MAIN PAGE
    // ════════════════════════════════════════════════════════════════════════

    return (
        <div className="min-h-screen bg-[#0a0a0a] pt-24 px-4 sm:px-6 pb-6 text-white mt-10">
            <div className="max-w-[1920px] mx-auto flex flex-col xl:flex-row gap-6 h-full items-start">

                {/* ── LEFT: Video + Info (expanding) ─────────────────────── */}
                <div className="w-full xl:flex-1 flex flex-col gap-6 min-w-0">

                    {/* Video Container */}
                    <div className="w-full max-w-4xl mx-auto aspect-video bg-black rounded-xl overflow-hidden relative border border-zinc-700/50 shadow-2xl ring-1 ring-zinc-800">
                        <video
                            ref={videoRef}
                            autoPlay
                            controls
                            muted
                            playsInline
                            className="w-full h-full object-contain block"
                        />


                        {/* Offline Overlay */}
                        {!isLive && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-sm z-40">
                                <div className="relative mb-8">
                                    <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full animate-pulse"></div>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-24 h-24 text-zinc-600 drop-shadow-[0_0_15px_rgba(255,255,255,0.05)] relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <p className="text-zinc-500 font-bold tracking-[0.3em] uppercase mb-4 text-xs">Stream Offline</p>
                                <p className="text-zinc-400 text-sm">{username} is currently not live.</p>
                            </div>
                        )}

                        {/* Live/Offline Badge */}
                        <div className={`absolute top-6 left-6 px-4 py-2 flex items-center gap-3 rounded-lg backdrop-blur-md text-xs tracking-[0.2em] uppercase font-bold border transition-all duration-500 z-20 ${isLive
                            ? 'bg-black/70 text-white border-red-500/50'
                            : 'bg-black/50 text-gray-500 border-gray-800'
                            }`}>
                            <div className="relative flex h-2.5 w-2.5 items-center justify-center">
                                {isLive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>}
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${isLive ? 'bg-red-500' : 'bg-gray-600'}`}></span>
                            </div>
                            {isLive ? 'LIVE' : 'OFFLINE'}
                        </div>

                        {/* ── ACTIVE POLL HUD (MOVED INSIDE VIDEO) ── */}
                        {isLive && activePoll && pollPhase === 'active' && (
                            <div className="absolute top-4 left-4 z-[9999] bg-zinc-900/90 border border-zinc-700/50 rounded-xl p-3 w-64 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in duration-300">
                                <div className="flex items-center justify-between mb-2 border-b border-zinc-800 pb-1.5">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-red-500 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                                        Live Poll
                                    </span>
                                    <span className={`text-[10px] font-mono font-bold ${pollTimeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-zinc-400'}`}>
                                        {formatPollTime(pollTimeLeft)}
                                    </span>
                                </div>
                                <p className="text-xs font-bold text-white mb-2 leading-tight">{activePoll.question}</p>
                                <div className="space-y-1.5">
                                    {activePoll.options?.map((opt, i) => {
                                        const optName = typeof opt === 'object' ? opt.text : opt;
                                        const votes = typeof opt === 'object' ? (opt.votes || 0) : 0;
                                        const total = activePoll.options.reduce((sum, o) => sum + (o.votes || 0), 0);
                                        const pct = total > 0 ? Math.round((votes / total) * 100) : 0;

                                        return (
                                            <button
                                                key={i}
                                                onClick={() => handlePollVote(i)}
                                                disabled={hasVoted}
                                                className="relative w-full text-left bg-zinc-950/50 border border-zinc-800 hover:border-zinc-600 rounded-lg overflow-hidden transition-all group"
                                            >
                                                <div className="absolute top-0 left-0 h-full bg-red-500/20 transition-all duration-500" style={{ width: `${pct}%` }} />
                                                <div className="relative px-2.5 py-1.5 flex justify-between items-center z-10">
                                                    <span className="text-[10px] font-medium text-zinc-200 group-hover:text-white truncate pr-2">{optName}</span>
                                                    {hasVoted && <span className="text-[10px] font-mono font-bold text-zinc-400">{pct}%</span>}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                {!hasVoted && <p className="text-[9px] text-zinc-500 text-center mt-2 italic">Click to vote</p>}
                            </div>
                        )}
                    </div>

                    {/* Stream Info & Actions */}
                    <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-2xl p-6 shadow-xl">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex items-start gap-4 min-w-0">
                                <img
                                    src={getAvatarUrl(streamMetadata.profileImage, username)}
                                    alt={username}
                                    className="w-12 h-12 rounded-full border-2 border-zinc-700 object-cover shrink-0"
                                />
                                <div className="min-w-0">
                                    <h1 className="text-xl sm:text-2xl font-bold mb-1 truncate">{streamMetadata.title}</h1>
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <span className="text-zinc-400 text-sm font-semibold">{username}</span>

                                        {streamMetadata.subscriberCount > 0 && (
                                            <span className="text-zinc-500 text-xs">{streamMetadata.subscriberCount.toLocaleString()} subscribers</span>
                                        )}

                                        {streamMetadata.category && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-800/80 border border-zinc-700 rounded-full text-xs font-bold text-zinc-300 uppercase tracking-wider">
                                                <span>{categoryIcons[streamMetadata.category] || '📁'}</span>
                                                {streamMetadata.category}
                                            </span>
                                        )}

                                        {isLive && (
                                            <span className="flex items-center gap-1.5 text-red-400 font-mono text-xs font-bold">
                                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                                                LIVE NOW
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <div className="flex gap-2">
                                    {isOwnChannel ? (
                                        <button
                                            onClick={() => navigate('/profile')}
                                            className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-full transition-all border border-zinc-700"
                                        >
                                            Edit Profile
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleSubscribe}
                                            disabled={subLoading}
                                            className={`px-6 py-2 text-sm font-bold rounded-full transition-all shadow-lg disabled:opacity-50 ${isSubscribed
                                                ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
                                                : 'bg-white text-black hover:bg-zinc-200'
                                                }`}
                                        >
                                            {subLoading ? '...' : (isSubscribed ? 'Subscribed ✓' : 'Subscribe')}
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center bg-zinc-800/50 rounded-full border border-zinc-700 overflow-hidden">
                                    <button
                                        onClick={handleLike}
                                        disabled={likeLoading}
                                        className={`px-4 py-2.5 hover:bg-zinc-700 transition-colors flex items-center gap-2 text-sm font-semibold border-r border-zinc-700 disabled:opacity-50 ${isLiked ? 'text-red-500' : 'text-zinc-300 hover:text-white'}`}
                                    >
                                        <svg className={`w-5 h-5 transition-transform ${isLiked ? 'scale-110' : ''}`} fill={isLiked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                                        </svg>
                                        Like{likeCount > 0 && ` ${likeCount}`}
                                    </button>
                                    <button
                                        onClick={handleShare}
                                        title="Share"
                                        className="px-4 py-2.5 hover:bg-zinc-700 transition-colors text-zinc-300 hover:text-white group"
                                    >
                                        <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Recommended Videos (Below Video) ─────────────── */}
                    {recommendedVideos.length > 0 && (
                        <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-2xl p-6 shadow-xl">
                            <h2 className="text-sm font-bold tracking-widest uppercase text-zinc-400 mb-4">Recommended</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {recommendedVideos.map(video => (
                                    <div
                                        key={video.id}
                                        className="group rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-all bg-zinc-900/50 hover:bg-zinc-800/50"
                                    >
                                        <Link to={`/video/${video.id}`} className="block aspect-video relative overflow-hidden">
                                            <img
                                                src={getValidUrl(video.thumbnail_url, THUMBNAIL_FALLBACK)}
                                                alt={video.title}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                onError={(e) => { e.target.src = THUMBNAIL_FALLBACK; }}
                                            />
                                            {video.view_count !== undefined && (
                                                <span className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[10px] text-zinc-300 font-mono">
                                                    {video.view_count.toLocaleString()} views
                                                </span>
                                            )}
                                        </Link>
                                        <div className="p-3">
                                            <Link to={`/video/${video.id}`}>
                                                <p className="text-sm font-semibold text-zinc-200 line-clamp-2 group-hover:text-white transition-colors">{video.title}</p>
                                            </Link>
                                            {video.author?.id ? (
                                                <Link
                                                    to={`/channel/${video.author.id}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-xs text-zinc-500 mt-1 hover:text-zinc-300 transition-colors block"
                                                >
                                                    {video.author?.username || 'Unknown'}
                                                </Link>
                                            ) : (
                                                <p className="text-xs text-zinc-500 mt-1">{video.author?.username || 'Unknown'}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── RIGHT: Live Chat (fixed width) ────────────────────── */}
                <div className="w-full xl:w-[360px] flex flex-col bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-xl h-[calc(100vh-180px)] overflow-hidden shrink-0 xl:sticky xl:top-28">
                    <div className="flex border-b border-zinc-800 shrink-0 bg-white/5">
                        <div className="flex-1 px-4 py-4 text-xs font-bold tracking-widest uppercase text-white border-b-2 border-red-500 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                Live Chat
                                {(isCurrentUserMod || isOwnChannel) && (
                                    <button 
                                        onClick={() => setShowModeratorPanel(true)}
                                        className={`p-1.5 rounded-lg border transition-all ${showModeratorPanel ? 'bg-[#00ffcc]/20 border-[#00ffcc]/40 text-[#00ffcc]' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'}`}
                                        title="Moderator Panel"
                                    >
                                        🛡️
                                    </button>
                                )}
                            </span>
                            <span className={`flex items-center gap-1.5 text-[10px] font-mono ${wsStatus === 'connected' ? 'text-green-400' :
                                wsStatus === 'connecting' ? 'text-yellow-400' : 'text-zinc-500'
                                }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'connected' ? 'bg-green-500' :
                                    wsStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-zinc-600'
                                    }`}></span>
                                {wsStatus === 'connected' ? 'CONNECTED' :
                                    wsStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="flex flex-col h-full bg-zinc-950/50">
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                                {chatMessages.length === 0 && (
                                    <p className="text-zinc-600 text-xs text-center py-8">No messages yet. Be the first to chat!</p>
                                )}
                                {chatMessages.map(msg => (
                                    <div 
                                        key={msg.id} 
                                        className={`group relative text-sm leading-relaxed px-2 py-1 -mx-2 rounded transition-colors duration-150 ${
                                            msg.type === 'system' ? 'text-zinc-500 italic text-xs' : 'hover:bg-[#00ffcc]/[0.03]'
                                        }`}
                                    >
                                        <span 
                                            className={`font-bold inline-flex items-center gap-1.5 align-middle mr-2 ${msg.type !== 'system' ? 'cursor-pointer' : ''}`}
                                            onClick={(e) => {
                                                if (msg.type !== 'system' && isCurrentUserMod) {
                                                    setSelectedMessage(msg);
                                                    setIsActionModalOpen(true);
                                                }
                                            }}
                                        >
                                            <UserBadge tier={msg.tier} isCreator={msg.isCreator} />
                                            <span className={msg.isCreator ? 'text-red-400/90' : (msg.tier >= 2 ? 'text-[#00ffcc]/90' : 'text-blue-400/90')}>
                                                {msg.user}
                                            </span>
                                        </span>
                                        <span className="text-zinc-300 align-middle">{msg.text}</span>
                                        
                                        {/* Action Dots */}
                                        {isCurrentUserMod && msg.type !== 'system' && (
                                            <button 
                                                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded-full transition-all text-zinc-400 hover:text-white"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedMessage(msg);
                                                    setIsActionModalOpen(true);
                                                }}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>

                            <div className="p-3 bg-zinc-900/80 border-t border-zinc-800 shrink-0">
                                <form onSubmit={handleSendChat} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        placeholder={
                                            !localStorage.getItem(UTUBE_TOKEN) ? 'Log in to chat' :
                                                wsStatus !== 'connected' ? 'Connecting...' : 'Send a message...'
                                        }
                                        disabled={wsStatus !== 'connected' || !localStorage.getItem(UTUBE_TOKEN)}
                                        className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    />
                                    <button
                                        type="submit"
                                        disabled={wsStatus !== 'connected' || !chatInput.trim() || !localStorage.getItem(UTUBE_TOKEN)}
                                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold tracking-widest uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Send
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* ═══ QUICK ACTION MODAL OVERLAY ═══ */}
            {isActionModalOpen && selectedMessage && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                    onClick={() => setIsActionModalOpen(false)}
                >
                    <div 
                        className="bg-zinc-950/95 border border-[#00ffcc]/20 w-full max-w-[280px] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.5)] overflow-hidden scale-100 opacity-100 transition-all origin-center"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800 bg-white/5">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-white flex items-center gap-1">
                                    👤 {selectedMessage.user}
                                    <UserBadge tier={selectedMessage.tier} isCreator={selectedMessage.user === username} />
                                </span>
                            </div>
                            <button onClick={() => setIsActionModalOpen(false)} className="text-zinc-400 hover:text-white p-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        
                        {/* Actions */}
                        <div className="p-2 space-y-1">
                            {/* Delete specific msg */}
                            <button 
                                onClick={() => handleModAction('delete_message')}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/10 hover:text-white rounded flex items-center gap-2 transition-colors"
                            >
                                <span>🗑️</span> Delete this message
                            </button>
                            
                            <hr className="border-zinc-800 my-1" />
                            
                             {/* Timeout Section */}
                             {currentUserTier >= 2 && (
                                 <div className="px-2 py-1">
                                     <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-2">Timeout (Silent)</span>
                                     <div className="flex gap-1">
                                         <button onClick={() => handleModAction('timeout_user', 60)} className="flex-1 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded text-xs font-semibold transition-colors">1m</button>
                                         <button onClick={() => handleModAction('timeout_user', 300)} className="flex-1 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded text-xs font-semibold transition-colors">5m</button>
                                         <button onClick={() => handleModAction('timeout_user', 600)} className="flex-1 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded text-xs font-semibold transition-colors">10m</button>
                                     </div>
                                 </div>
                             )}

                             {/* Ban Section */}
                             {currentUserTier >= 3 && (
                                 <div className="px-2 py-1">
                                     <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-2 mt-1">Permanent Actions</span>
                                     <button 
                                         onClick={() => handleModAction('ban_user')}
                                         className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded text-xs font-bold transition-colors shadow-[0_0_10px_rgba(239,68,68,0.1)]"
                                     >
                                         BAN USER FOREVER
                                     </button>
                                 </div>
                             )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ FULLSCREEN RESULTS MODAL OVERRIDE ═══ */}
            {activePoll && pollPhase === 'results' && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md">
                    <div className="bg-gray-900 border border-cyan-500 p-8 rounded-2xl w-full max-w-2xl text-center shadow-[0_0_50px_rgba(6,182,212,0.5)]">
                        <h2 className="text-4xl font-bold text-cyan-400 mb-6 uppercase tracking-wider">📊 Poll Results</h2>
                        <h3 className="text-2xl text-white mb-8">{activePoll.question}</h3>
                        <div className="space-y-4 mb-8 text-left">
                            {activePoll.options.map((opt, i) => {
                                const total = activePoll.options.reduce((sum, o) => sum + (o.votes || 0), 0);
                                const pct = total > 0 ? Math.round(((opt.votes || 0) / total) * 100) : 0;
                                const isWinner = opt.votes > 0 && opt.votes === Math.max(...activePoll.options.map(o => o.votes || 0));
                                return (
                                    <div key={i} className="relative p-4 bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
                                        <div className="absolute top-0 left-0 h-full bg-cyan-600/50 transition-all duration-1000" style={{ width: `${pct}%` }}></div>
                                        <div className="relative z-10 flex justify-between text-xl text-white font-bold">
                                            <span>{opt.text} {isWinner && '👑 WINNER'}</span>
                                            <span>{pct}% ({opt.votes || 0})</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <button onClick={() => { setActivePoll(null); setPollPhase(null); }} className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-xl transition-colors">
                            CLOSE RESULTS
                        </button>
                    </div>
                </div>
            )}
            {/* ── Moderator Panel (Slide-in) ── */}
            <AnimatePresence>
                {showModeratorPanel && (
                    <div className="fixed inset-0 z-[150] overflow-hidden">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowModeratorPanel(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-[#0a0a0f] border-l border-white/10 shadow-2xl flex flex-col pt-24"
                        >
                            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                                <h2 className="text-xl font-black text-white tracking-[0.2em] uppercase flex items-center gap-3">
                                    <span className="text-[#00ffcc] shadow-[0_0_15px_#00ffcc]">🛡️</span> Mod Tools
                                </h2>
                                <button onClick={() => setShowModeratorPanel(false)} className="p-2 hover:bg-white/10 rounded-full transition-all text-white/40 hover:text-white">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-white/10">
                                {/* Section: My Status */}
                                <section>
                                    <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em] mb-4">My Status</h3>
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                        <div className="flex items-center gap-3 mb-3">
                                            <UserBadge role={currentUserRole || (isOwnChannel ? 'creator' : 'user')} isCreator={isOwnChannel} />
                                            <span className="text-xs font-bold text-white/70">Session Active</span>
                                        </div>
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-2 text-[10px] text-white/40"><span className="text-emerald-500">✓</span> Timeout (≤10min)</div>
                                            <div className="flex items-center gap-2 text-[10px] text-white/40"><span className="text-emerald-500">✓</span> Delete messages</div>
                                            {isOwnChannel && <div className="flex items-center gap-2 text-[10px] text-white/40"><span className="text-emerald-500">✓</span> Manage Moderators</div>}
                                        </div>
                                    </div>
                                </section>

                                {/* Section: Active Bans (Visible to Mods) */}
                                <section>
                                    <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em] mb-4">Active Bans</h3>
                                    <div className="space-y-2">
                                        {bannedUsers.length === 0 ? (
                                            <div className="p-4 rounded-xl border border-dashed border-white/5 text-center text-[10px] text-white/20 italic">No active bans in this quadrant.</div>
                                        ) : (
                                            bannedUsers.map(ban => (
                                                <div key={ban.username} className="flex justify-between items-center p-3 bg-white/[0.02] rounded-xl border border-white/5">
                                                    <p className="text-sm font-bold text-white/80">{ban.username}</p>
                                                    <button 
                                                        onClick={async () => {
                                                            try {
                                                                await ApiClient.delete(`/moderator/${username}/unban/${ban.username}`);
                                                                toast.success(`Unbanned ${ban.username}`);
                                                                fetchModerationData();
                                                            } catch (e) { toast.error("Failed to unban"); }
                                                        }}
                                                        className="text-[10px] font-bold text-[#00ffcc]/50 hover:text-[#00ffcc] uppercase tracking-widest"
                                                    >Unban</button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </section>
                            </div>
                            
                            <div className="p-6 border-t border-white/10 bg-black/40">
                                <button onClick={fetchModerationData} className="w-full py-3 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
                                    Refresh Security Matrix
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* ═══ MODERATION REASON DIALOG ═══ */}
            <BanReasonDialog
                isOpen={showBanReasonModal}
                onClose={() => {
                    setShowBanReasonModal(false);
                    setPendingModAction({ action: '', duration: null, targetUser: null });
                }}
                onConfirm={confirmModerationAction}
                username={pendingModAction.targetUser?.username}
                actionType={pendingModAction.action === 'ban_user' ? 'ban' : 'timeout'}
                duration={pendingModAction.duration}
            />

            {/* ═══ BAN/TIMEOUT NOTIFICATION ═══ */}
            <BanNotification
                isOpen={showBanNotification}
                onClose={() => setShowBanNotification(false)}
                banInfo={currentBanInfo}
            />
        </div>
    );
};

export default WatchPage;
