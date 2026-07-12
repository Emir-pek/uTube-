import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { UTUBE_USER } from '../utils/authConstants';
import { getAvatarUrl, getValidUrl, THUMBNAIL_FALLBACK } from '../utils/urlHelper';
import ApiClient from '../utils/ApiClient';
import toast from 'react-hot-toast';
import DOMPurify from 'dompurify';

// ─── Category Options (shared with Upload page) ─────────────────────────────
const CATEGORY_OPTIONS = [
    { value: 'Education', label: 'Education', icon: '🎓' },
    { value: 'Entertainment', label: 'Entertainment', icon: '🎬' },
    { value: 'Gaming', label: 'Gaming', icon: '🎮' },
    { value: 'Music', label: 'Music', icon: '🎵' },
    { value: 'News', label: 'News', icon: '📰' },
    { value: 'Sports', label: 'Sports', icon: '🏀' },
    { value: 'Technology', label: 'Technology', icon: '💻' },
    { value: 'Vlog', label: 'Vlog', icon: '🤳' },
    { value: 'Food', label: 'Food', icon: '🍔' },
    { value: 'Travel', label: 'Travel', icon: '✈️' },
];

const VISIBILITY_OPTIONS = [
    {
        value: 'public', label: 'Public', icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        )
    },
    {
        value: 'unlisted', label: 'Unlisted', icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
        )
    },
    {
        value: 'private', label: 'Private', icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        )
    },
];

// ─── Inline Category Select ─────────────────────────────────────────────────
const CategorySelect = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selected = CATEGORY_OPTIONS.find(opt => opt.value === value);

    return (
        <div className="relative" ref={containerRef}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full bg-white/5 border ${isOpen ? 'border-primary/50' : 'border-white/10 hover:border-white/20'} rounded-xl px-4 py-3 cursor-pointer transition-all font-medium flex items-center justify-between`}
            >
                <span className={selected ? 'text-white flex items-center gap-2' : 'text-white/40'}>
                    {selected ? (<><span className="text-lg">{selected.icon}</span>{selected.label}</>) : 'Select Category'}
                </span>
                <span className={`text-primary text-xs transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 right-0 mt-1.5 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-48 overflow-y-auto"
                    >
                        {CATEGORY_OPTIONS.map((option) => (
                            <div
                                key={option.value}
                                onClick={() => { onChange(option.value); setIsOpen(false); }}
                                className="px-4 py-2.5 hover:bg-white/10 cursor-pointer flex items-center gap-2.5 transition-colors text-sm"
                            >
                                <span className="text-lg">{option.icon}</span>
                                <span className="text-white font-medium">{option.label}</span>
                                {value === option.value && <span className="ml-auto text-primary font-bold">✓</span>}
                            </div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ─── Edit Video Modal ───────────────────────────────────────────────────────
const EditVideoModal = ({ video, onClose, onSaved }) => {
    const [title, setTitle] = useState(video.title || '');
    const [description, setDescription] = useState(video.description || '');
    const [category, setCategory] = useState(video.category || '');
    const [visibility, setVisibility] = useState(video.visibility || 'public');
    const [saving, setSaving] = useState(false);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!title.trim()) return toast.error('Title is required');
        setSaving(true);
        try {
            const res = await ApiClient.put(`/videos/${video.id}/`, {
                title: title.trim(),
                description: description.trim(),
                category: category.trim() || null,
                visibility,
            });
            toast.success('Video updated!');
            onSaved(res.data);
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to update video');
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-lg bg-[#111] border border-white/10 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-xl font-black tracking-tight mb-6 flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Edit Video
                </h2>
                <form onSubmit={handleSave} className="space-y-5">
                    <div>
                        <label className="text-xs font-bold text-white/50 uppercase tracking-widest mb-1.5 block">Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/50 transition-all font-medium"
                            required
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-white/50 uppercase tracking-widest mb-1.5 block">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/50 transition-all font-medium resize-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-white/50 uppercase tracking-widest mb-1.5 block">Category</label>
                        <CategorySelect value={category} onChange={setCategory} />
                    </div>

                    {/* ── Visibility Toggle ─────────────────────────── */}
                    <div>
                        <label className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2 block">Visibility</label>
                        <div className="flex gap-2">
                            {VISIBILITY_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setVisibility(opt.value)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all border ${visibility === opt.value
                                        ? 'bg-primary/15 border-primary/40 text-white'
                                        : 'bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                                        }`}
                                >
                                    {opt.icon}
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} className="flex-1 py-3 bg-gradient-to-r from-primary to-red-600 hover:from-primary/80 hover:to-red-600/80 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50">
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
};

// ─── Edit Channel Modal ─────────────────────────────────────────────────────
const EditChannelModal = ({ user, onClose, onSaved }) => {
    const [description, setDescription] = useState(user?.channel_description || '');
    const [bannerFile, setBannerFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [bannerPosition, setBannerPosition] = useState(user?.banner_position ?? 50);
    const [saving, setSaving] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [removing, setRemoving] = useState(false);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setBannerFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('description', description.trim());
            formData.append('banner_position', bannerPosition.toString());
            if (bannerFile) {
                formData.append('banner_image', bannerFile);
            }

            const res = await ApiClient.put('/auth/me/channel', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            localStorage.setItem(UTUBE_USER, JSON.stringify(res.data));
            window.dispatchEvent(new Event('authChange'));
            toast.success('Channel updated!');
            onSaved(res.data);
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to update channel');
        } finally {
            setSaving(false);
        }
    };

    // Use current banner URL or fallback if no live preview
    const currentBannerUrl = user?.channel_banner_url
        ? getValidUrl(`/storage/uploads/banners/${user.channel_banner_url}`)
        : null;

    const handleRemoveBanner = async () => {
        setRemoving(true);
        try {
            const res = await ApiClient.delete('/auth/me/banner');
            localStorage.setItem(UTUBE_USER, JSON.stringify(res.data));
            window.dispatchEvent(new Event('authChange'));
            toast.success('Banner removed!');
            onSaved(res.data);
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to remove banner');
        } finally {
            setRemoving(false);
            setConfirmRemove(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-lg bg-[#111] border border-white/10 rounded-2xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-xl font-black tracking-tight mb-6 flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Customise Channel
                </h2>
                <form onSubmit={handleSave} className="space-y-6">
                    {/* Banner Image Upload */}
                    <div>
                        <label className="text-xs font-bold text-white/50 uppercase tracking-widest mb-1.5 block">Channel Banner</label>
                        <div className="relative h-32 md:h-40 rounded-xl overflow-hidden bg-white/5 border-2 border-dashed border-white/20 hover:border-white/40 transition-colors group">
                            {(previewUrl || currentBannerUrl) ? (
                                <img
                                    src={DOMPurify.sanitize(previewUrl || currentBannerUrl)}
                                    alt="Banner Preview"
                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-50 transition-opacity"
                                    style={{ objectPosition: `center ${bannerPosition}%` }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 group-hover:text-white/70 transition-colors">
                                    <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                    <span className="text-sm font-bold">Upload Banner (16:9)</span>
                                </div>
                            )}
                            <input
                                type="file"
                                accept="image/jpeg, image/png, image/webp"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            {/* Overlay icon when hovering a populated banner */}
                            {(previewUrl || currentBannerUrl) && (
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <div className="bg-black/60 p-3 rounded-full backdrop-blur-sm">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] text-white/40 mt-1.5 ml-1">JPEG, PNG or WEBP. At least 1024x288px recommended.</p>

                        {/* Banner Position Slider */}
                        {(previewUrl || currentBannerUrl) && (
                            <div className="mt-3 bg-white/5 border border-white/10 rounded-xl p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Focal Point</label>
                                    <span className="text-[10px] font-mono text-primary font-bold">{bannerPosition}%</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={bannerPosition}
                                    onChange={(e) => setBannerPosition(Number(e.target.value))}
                                    className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(229,9,20,0.5)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/30 [&::-webkit-slider-thumb]:cursor-pointer"
                                />
                                <div className="flex justify-between text-[9px] text-white/30 mt-1">
                                    <span>Top</span>
                                    <span>Center</span>
                                    <span>Bottom</span>
                                </div>
                            </div>
                        )}
                        {/* Remove Banner Button */}
                        {user?.channel_banner_url && !previewUrl && (
                            <div className="mt-2">
                                {!confirmRemove ? (
                                    <button
                                        type="button"
                                        onClick={() => setConfirmRemove(true)}
                                        className="flex items-center gap-1.5 text-xs font-bold text-red-400/70 hover:text-red-400 transition-colors ml-1"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Remove Banner
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                        <span className="text-xs text-red-300 font-medium">Remove banner?</span>
                                        <button
                                            type="button"
                                            onClick={handleRemoveBanner}
                                            disabled={removing}
                                            className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                                        >
                                            {removing ? 'Removing...' : 'Yes'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmRemove(false)}
                                            className="text-xs font-bold text-white/50 hover:text-white/70 transition-colors"
                                        >
                                            No
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Description Textarea */}
                    <div>
                        <label className="text-xs font-bold text-white/50 uppercase tracking-widest mb-1.5 block">Channel Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                            placeholder="Tell viewers about your channel..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/50 transition-all font-medium resize-none"
                        />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={onClose} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} className="flex-1 py-3 bg-gradient-to-r from-primary to-red-600 hover:from-primary/80 hover:to-red-600/80 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50">
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
};

// ─── Delete Confirm Modal ───────────────────────────────────────────────────
const DeleteConfirmModal = ({ video, onClose, onConfirm, deleting }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
        onClick={onClose}
    >
        <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-sm bg-[#111] border border-red-500/20 rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="text-center">
                <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                    <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </div>
                <h3 className="text-lg font-bold mb-2">Delete Video?</h3>
                <p className="text-white/50 text-sm mb-6">
                    "<span className="text-white/80 font-medium">{video.title}</span>" will be permanently deleted. This action cannot be undone.
                </p>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all">
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={deleting}
                        className="flex-1 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl font-bold transition-all border border-red-500/20 disabled:opacity-50"
                    >
                        {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                </div>
            </div>
        </motion.div>
    </motion.div>
);


// ─── Video Card ─────────────────────────────────────────────────────────────
const VideoCard = ({ video, onEdit, onDelete }) => {
    const statusColors = {
        published: 'text-green-400 bg-green-500/10 border-green-500/20',
        processing: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
        failed: 'text-red-400 bg-red-500/10 border-red-500/20',
    };
    const visibilityIcons = {
        public: (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
        private: (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
        ),
        unlisted: (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
        ),
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="group bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 rounded-2xl overflow-hidden transition-all duration-300"
        >
            {/* Thumbnail */}
            <Link to={`/video/${video.id}`} className="block relative aspect-video bg-black">
                <img
                    src={DOMPurify.sanitize(getValidUrl(video.thumbnail_url, THUMBNAIL_FALLBACK))}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => { e.target.src = THUMBNAIL_FALLBACK; }}
                />
                {video.duration && (
                    <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        {formatDuration(video.duration)}
                    </span>
                )}
            </Link>

            {/* Info */}
            <div className="p-4">
                <Link to={`/video/${video.id}`}>
                    <h3 className="font-bold text-sm line-clamp-2 leading-snug mb-2 group-hover:text-primary transition-colors">
                        {video.title}
                    </h3>
                </Link>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/40 mb-3">
                    <span className={`flex items-center gap-1 font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border text-[10px] ${video.visibility === 'private' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' : video.visibility === 'unlisted' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'}`}>
                        {visibilityIcons[video.visibility] || visibilityIcons.public}
                        {video.visibility}
                    </span>
                    <span className={`font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border text-[10px] ${statusColors[video.status] || statusColors.processing}`}>
                        {video.status}
                    </span>
                    <span>{video.view_count?.toLocaleString()} views</span>
                    {video.category && (
                        <>
                            <span>•</span>
                            <span className="truncate">{video.category}</span>
                        </>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={() => onEdit(video)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold transition-all group/btn"
                    >
                        <svg className="w-3.5 h-3.5 text-white/40 group-hover/btn:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        Edit
                    </button>
                    <button
                        onClick={() => onDelete(video)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500/5 hover:bg-red-500/15 text-red-400/70 hover:text-red-400 rounded-lg text-xs font-bold transition-all"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                    </button>
                </div>
            </div>
        </motion.div>
    );
};


// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

const MyChannel = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modals
    const [editingVideo, setEditingVideo] = useState(null);
    const [deletingVideo, setDeletingVideo] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [showChannelEdit, setShowChannelEdit] = useState(false);

    // Load user + videos
    useEffect(() => {
        const load = async () => {
            try {
                const userRes = await ApiClient.get('/auth/me');
                setUser(userRes.data);
                localStorage.setItem(UTUBE_USER, JSON.stringify(userRes.data));
                window.dispatchEvent(new Event('authChange'));
            } catch {
                try {
                    const data = localStorage.getItem(UTUBE_USER);
                    if (data) setUser(JSON.parse(data));
                    else navigate('/login');
                } catch {
                    navigate('/login');
                }
            }
        };
        load();
    }, [navigate]);

    const fetchVideos = useCallback(async () => {
        setLoading(true);
        try {
            const res = await ApiClient.get('/auth/me/videos');
            setVideos(res.data);
        } catch (err) {
            console.error('Failed to fetch videos:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user) fetchVideos();
    }, [user, fetchVideos]);

    // ─── Handlers ─────────────────────────────────────────────────────
    const handleVideoSaved = (updatedVideo) => {
        setVideos(prev => prev.map(v =>
            v.id === updatedVideo.id
                ? { ...v, ...updatedVideo }
                : v
        ));
    };

    const handleDeleteConfirm = async () => {
        if (!deletingVideo) return;
        setDeleteLoading(true);
        try {
            await ApiClient.delete(`/videos/${deletingVideo.id}`);
            setVideos(prev => prev.filter(v => v.id !== deletingVideo.id));
            toast.success('Video deleted');
            setDeletingVideo(null);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to delete video');
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleChannelSaved = (updatedUser) => {
        setUser(updatedUser);
    };

    if (!user) return null;

    const publishedCount = videos.filter(v => v.status === 'published').length;

    return (
        <div className="min-h-screen pt-24 pb-16 px-4 md:px-8 text-white">
            <div className="max-w-6xl mx-auto">

                {/* ─── Channel Header ─────────────────────────────────────── */}
                <div className="mb-12">
                    {/* Banner Image or Fallback Gradient */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="h-48 md:h-72 w-full rounded-3xl overflow-hidden relative p-[2px] z-0"
                    >
                        {/* Spinning LED Border Effect */}
                        <div className="absolute inset-[-100%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#00000000_50%,#ff0000_100%)]" />

                        <div className="absolute inset-[2px] rounded-[calc(1.5rem-2px)] overflow-hidden bg-gradient-to-r from-primary/30 via-red-600/20 to-primary/10">
                            {user.channel_banner_url ? (
                                <img
                                    src={DOMPurify.sanitize(getValidUrl(`/storage/uploads/banners/${user.channel_banner_url}`))}
                                    alt={`${user.username}'s banner`}
                                    className="w-full h-full object-cover relative z-10"
                                    style={{
                                        objectPosition: `center ${user.banner_position ?? 50}%`,
                                        imageRendering: '-webkit-optimize-contrast',
                                        transform: 'translateZ(0)',
                                        backfaceVisibility: 'hidden'
                                    }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            ) : (
                                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgMGg2MHY2MEgweiIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjMwIiBjeT0iMzAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZykiLz48L3N2Zz4=')] opacity-50 relative z-10" />
                            )}

                            {/* Inner glow to make the LED pop */}
                            <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(255,0,0,0.2)] pointer-events-none z-20" />
                        </div>
                    </motion.div>

                    {/* Profile Info (Framed container) */}
                    <div className="mx-0 md:mx-4 flex flex-col md:flex-row items-center md:items-start gap-6 relative z-10 bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8 mt-2 shadow-2xl backdrop-blur-sm">
                        {/* Avatar, overlaps banner slightly */}
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            className="w-32 h-32 md:w-40 md:h-40 rounded-full p-1.5 bg-[#111] shadow-xl -mt-20 md:-mt-24 md:-ml-2 shrink-0 relative z-20"
                        >
                            <div className="w-full h-full rounded-full overflow-hidden bg-black">
                                <img
                                    src={DOMPurify.sanitize(getAvatarUrl(user.profile_image, user.username))}
                                    alt={user.username}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        </motion.div>

                        {/* Name + Stats */}
                        <div className="flex-1 min-w-0 text-center md:text-left mt-2 border-b border-white/5 pb-8 md:border-none md:pb-0">
                            <h1 className="text-3xl md:text-4xl font-black tracking-tight truncate">{user.username}</h1>

                            <div className="flex flex-wrap items-center gap-2 mt-2 justify-center md:justify-start text-white/70 text-sm">
                                <span className="text-white font-medium">@{user.username}</span>
                                <span className="text-white/30">•</span>
                                <span>{user.subscriber_count ?? 0} subscriber{(user.subscriber_count ?? 0) !== 1 ? 's' : ''}</span>
                                <span className="text-white/30">•</span>
                                <span>{videos.length} video{videos.length !== 1 ? 's' : ''}</span>
                                <span className="text-white/30">•</span>
                                <span>{(user.total_views ?? 0).toLocaleString()} view{(user.total_views ?? 0) !== 1 ? 's' : ''}</span>
                            </div>

                            {user.channel_description && (
                                <div className="mt-4 text-white/70 text-sm max-w-[calc(100vw-32px)] md:max-w-3xl mx-auto md:mx-0 whitespace-pre-wrap leading-relaxed relative group cursor-pointer break-words">
                                    <div className="line-clamp-2 md:line-clamp-3 group-hover:line-clamp-none transition-all duration-300">
                                        {user.channel_description}
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
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setShowChannelEdit(true)}
                                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-sm transition-all flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Edit Channel
                            </motion.button>
                            <Link to="/upload" className="w-full sm:w-auto">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="w-full px-5 py-2.5 bg-gradient-to-r from-primary to-red-600 hover:from-primary/80 hover:to-red-600/80 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Upload
                                </motion.button>
                            </Link>
                        </div>
                    </div>
                </div>


                {/* ─── Video Stats Bar ────────────────────────────────────── */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                        <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Your Videos
                        <span className="text-white/30 text-base font-medium ml-1">({videos.length})</span>
                    </h2>
                    <div className="flex items-center gap-2 text-xs text-white/40">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-400 rounded-full border border-green-500/20 font-bold">
                            {publishedCount} Published
                        </span>
                        {videos.length - publishedCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500/10 text-yellow-400 rounded-full border border-yellow-500/20 font-bold">
                                {videos.length - publishedCount} Other
                            </span>
                        )}
                    </div>
                </div>


                {/* ─── Video Grid ─────────────────────────────────────────── */}
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="animate-pulse rounded-2xl overflow-hidden border border-white/5">
                                <div className="aspect-video bg-white/5" />
                                <div className="p-4 space-y-3">
                                    <div className="h-4 bg-white/5 rounded w-3/4" />
                                    <div className="h-3 bg-white/5 rounded w-1/2" />
                                    <div className="flex gap-2">
                                        <div className="h-8 bg-white/5 rounded-lg flex-1" />
                                        <div className="h-8 bg-white/5 rounded-lg flex-1" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : videos.length > 0 ? (
                    <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <AnimatePresence mode="popLayout">
                            {videos.map(video => (
                                <VideoCard
                                    key={video.id}
                                    video={video}
                                    onEdit={setEditingVideo}
                                    onDelete={setDeletingVideo}
                                />
                            ))}
                        </AnimatePresence>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center justify-center py-20 text-center"
                    >
                        <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/5">
                            <svg className="w-12 h-12 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-white/60 mb-2">No videos yet</h3>
                        <p className="text-white/30 text-sm mb-6 max-w-xs">Upload your first video to start building your channel!</p>
                        <Link to="/upload">
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="px-8 py-3 bg-gradient-to-r from-primary to-red-600 rounded-xl font-bold text-sm shadow-lg shadow-primary/20"
                            >
                                Upload Your First Video
                            </motion.button>
                        </Link>
                    </motion.div>
                )}
            </div>

            {/* ── Modals ────────────────────────────────────────────────── */}
            <AnimatePresence>
                {editingVideo && (
                    <EditVideoModal
                        video={editingVideo}
                        onClose={() => setEditingVideo(null)}
                        onSaved={handleVideoSaved}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {deletingVideo && (
                    <DeleteConfirmModal
                        video={deletingVideo}
                        onClose={() => setDeletingVideo(null)}
                        onConfirm={handleDeleteConfirm}
                        deleting={deleteLoading}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showChannelEdit && (
                    <EditChannelModal
                        user={user}
                        onClose={() => setShowChannelEdit(false)}
                        onSaved={handleChannelSaved}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default MyChannel;
