import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import ApiClient from '../utils/ApiClient';
import { UTUBE_USER } from '../utils/authConstants';

// ═══════════════════════════════════════════════════════════════════════════
// SaveToPlaylistModal — YouTube-style "Save to Playlist" modal
// ═══════════════════════════════════════════════════════════════════════════

const SaveToPlaylistModal = ({ isOpen, onClose, videoId }) => {
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [videoInPlaylists, setVideoInPlaylists] = useState(new Set()); // Set of playlist IDs that contain this video
    const [toggling, setToggling] = useState(new Set()); // IDs currently being toggled (for loading spinners)

    // ── Create New Playlist ──
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [creating, setCreating] = useState(false);
    const inputRef = useRef(null);
    const modalRef = useRef(null);

    const currentUser = (() => {
        try {
            return JSON.parse(localStorage.getItem(UTUBE_USER) || 'null');
        } catch { return null; }
    })();

    // ── Fetch playlists and determine which contain the current video ──
    const fetchPlaylists = useCallback(async () => {
        if (!currentUser?.id) return;
        setLoading(true);
        try {
            const res = await ApiClient.get(`/users/${currentUser.id}/playlists`);
            const userPlaylists = res.data || [];
            setPlaylists(userPlaylists);

            // Check which playlists contain the current video
            const containsVideo = new Set();
            await Promise.all(
                userPlaylists.map(async (pl) => {
                    try {
                        const detail = await ApiClient.get(`/playlists/${pl.id}`);
                        const videos = detail.data?.videos || [];
                        if (videos.some(v => v.id === videoId)) {
                            containsVideo.add(pl.id);
                        }
                    } catch {
                        // Silently skip errors for individual playlist fetches
                    }
                })
            );
            setVideoInPlaylists(containsVideo);
        } catch (err) {
            console.error('Failed to fetch playlists:', err);
            toast.error('Failed to load playlists');
        } finally {
            setLoading(false);
        }
    }, [currentUser?.id, videoId]);

    useEffect(() => {
        if (isOpen) {
            fetchPlaylists();
            setShowCreateForm(false);
            setNewTitle('');
        }
    }, [isOpen, fetchPlaylists]);

    // ── Focus input when create form appears ──
    useEffect(() => {
        if (showCreateForm && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [showCreateForm]);

    // ── Close on outside click ──
    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (e) => {
            if (modalRef.current && !modalRef.current.contains(e.target)) {
                onClose();
            }
        };
        // Delay to prevent the opening click from immediately closing
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClick);
        }, 100);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClick);
        };
    }, [isOpen, onClose]);

    // ── Close on Escape ──
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    // ── Toggle Video in Playlist (add/remove) ──
    const handleToggle = async (playlistId) => {
        if (toggling.has(playlistId)) return;

        setToggling(prev => new Set(prev).add(playlistId));
        const isCurrentlyIn = videoInPlaylists.has(playlistId);

        try {
            if (isCurrentlyIn) {
                // Remove video from playlist
                await ApiClient.delete(`/playlists/${playlistId}/videos/${videoId}`);
                setVideoInPlaylists(prev => {
                    const next = new Set(prev);
                    next.delete(playlistId);
                    return next;
                });
                toast.success('Removed from playlist');
            } else {
                // Add video to playlist
                await ApiClient.post(`/playlists/${playlistId}/videos`, { video_id: videoId });
                setVideoInPlaylists(prev => new Set(prev).add(playlistId));
                toast.success('Added to playlist');
            }
        } catch (err) {
            const detail = err.response?.data?.detail || 'Action failed';
            if (detail === 'Video is already in this playlist') {
                // Sync state — it was already added
                setVideoInPlaylists(prev => new Set(prev).add(playlistId));
            } else {
                toast.error(detail);
            }
        } finally {
            setToggling(prev => {
                const next = new Set(prev);
                next.delete(playlistId);
                return next;
            });
        }
    };

    // ── Create New Playlist + Auto-add Video ──
    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newTitle.trim() || creating) return;
        setCreating(true);

        try {
            // 1. Create the playlist
            const createRes = await ApiClient.post('/playlists/', { title: newTitle.trim() });
            const newPlaylist = createRes.data;

            // 2. Add the current video to it
            await ApiClient.post(`/playlists/${newPlaylist.id}/videos`, { video_id: videoId });

            toast.success(`Created "${newPlaylist.title}" and added video`);

            // 3. Refresh playlists list
            setNewTitle('');
            setShowCreateForm(false);
            await fetchPlaylists();
        } catch (err) {
            const detail = err.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Failed to create playlist');
        } finally {
            setCreating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                >
                    <motion.div
                        ref={modalRef}
                        initial={{ opacity: 0, scale: 0.92, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 20 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                        className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-[380px] max-w-[90vw] max-h-[70vh] flex flex-col overflow-hidden"
                    >
                        {/* ── Header ── */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/8">
                            <h3 className="text-base font-bold text-white tracking-tight">Save video to...</h3>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* ── Playlist List ── */}
                        <div className="flex-1 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent' }}>
                            {loading ? (
                                <div className="space-y-2 px-3 py-3">
                                    {[...Array(4)].map((_, i) => (
                                        <div key={i} className="flex items-center gap-3 animate-pulse">
                                            <div className="w-5 h-5 bg-white/5 rounded" />
                                            <div className="h-3.5 bg-white/5 rounded flex-1" />
                                        </div>
                                    ))}
                                </div>
                            ) : playlists.length > 0 ? (
                                playlists.map((pl) => {
                                    const isChecked = videoInPlaylists.has(pl.id);
                                    const isLoading = toggling.has(pl.id);
                                    return (
                                        <button
                                            key={pl.id}
                                            onClick={() => handleToggle(pl.id)}
                                            disabled={isLoading}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all group text-left"
                                        >
                                            {/* Checkbox */}
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${isChecked
                                                    ? 'bg-red-500 border-red-500'
                                                    : 'border-white/25 group-hover:border-white/50'
                                                }`}>
                                                {isLoading ? (
                                                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : isChecked ? (
                                                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                                    </svg>
                                                ) : null}
                                            </div>

                                            {/* Playlist Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-white/90 truncate group-hover:text-white transition-colors">
                                                    {pl.title}
                                                </p>
                                                <p className="text-[10px] text-white/30 mt-0.5">
                                                    {pl.visibility === 'private' ? '🔒 Private' : '🌐 Public'}
                                                    {pl.video_count != null && ` · ${pl.video_count} video${pl.video_count !== 1 ? 's' : ''}`}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })
                            ) : (
                                <div className="py-8 text-center">
                                    <svg className="w-10 h-10 mx-auto text-white/10 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                    <p className="text-white/30 text-xs">No playlists yet</p>
                                    <p className="text-white/20 text-[10px] mt-1">Create one below</p>
                                </div>
                            )}
                        </div>

                        {/* ── Create New Playlist Section ── */}
                        <div className="border-t border-white/8 px-4 pt-3 pb-4">
                            <AnimatePresence mode="wait">
                                {!showCreateForm ? (
                                    <motion.button
                                        key="create-btn"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0, height: 0 }}
                                        onClick={() => setShowCreateForm(true)}
                                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-white/80 hover:text-white hover:bg-white/5 transition-all group"
                                    >
                                        <div className="w-6 h-6 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center transition-colors">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </div>
                                        Create new playlist
                                    </motion.button>
                                ) : (
                                    <motion.form
                                        key="create-form"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        onSubmit={handleCreate}
                                        className="space-y-3"
                                    >
                                        <div>
                                            <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5 block">
                                                Playlist name
                                            </label>
                                            <input
                                                ref={inputRef}
                                                type="text"
                                                value={newTitle}
                                                onChange={(e) => setNewTitle(e.target.value)}
                                                placeholder="Enter playlist title..."
                                                maxLength={200}
                                                className="w-full bg-zinc-800 border border-white/10 focus:border-red-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none transition-colors"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="submit"
                                                disabled={creating || !newTitle.trim()}
                                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/30 disabled:text-white/30 text-white rounded-lg text-sm font-bold transition-colors"
                                            >
                                                {creating ? (
                                                    <span className="flex items-center justify-center gap-2">
                                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        Creating...
                                                    </span>
                                                ) : 'Create'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setShowCreateForm(false); setNewTitle(''); }}
                                                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg text-sm font-bold transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </motion.form>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default SaveToPlaylistModal;
