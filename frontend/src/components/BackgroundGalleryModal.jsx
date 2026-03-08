import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import ApiClient from '../utils/ApiClient';
import { toast } from 'react-hot-toast';

const VideoThumbnail = ({ src, bgName, isActive, onSelect, onDelete }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);

    return (
        <div onClick={onSelect}
            className={`relative aspect-video rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${isActive ? 'border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'border-white/5 hover:border-white/20'}`}>

            {!isLoaded && !hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/5">
                    <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}

            {hasError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/10 border-red-500/20">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-400/50 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-[10px] font-jet text-red-400/50 uppercase">Broken Link</span>
                </div>
            )}

            <video
                src={src}
                crossOrigin="anonymous"
                preload="metadata"
                playsInline
                muted
                className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                loop
                onLoadedData={() => setIsLoaded(true)}
                onError={() => setHasError(true)}
                onMouseEnter={e => isLoaded && e.target.play().catch(() => { })}
                onMouseLeave={e => { if (isLoaded) { e.target.pause(); e.target.currentTime = 0.1; } }}
            />
            {bgName && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 flex justify-between items-center">
                    <p className="text-[10px] font-bold text-white/90 truncate mr-2" style={{ textShadow: "0 0 6px black" }}>{bgName}</p>
                    {onDelete && (
                        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-white/30 hover:text-red-400 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    )}
                </div>
            )}
            {!bgName && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <p className="text-xs font-bold text-white/90">Default Cyber-Noir</p>
                </div>
            )}
        </div>
    );
};

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#0a0a0a] border border-red-500/30 rounded-2xl w-full max-w-sm overflow-hidden flex flex-col shadow-[0_0_30px_rgba(239,68,68,0.15)] neon-panel relative z-10 p-6 items-center text-center">

                <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </div>

                <h3 className="text-lg font-bold text-white mb-2 font-jet tracking-wider uppercase">Delete Background?</h3>
                <p className="text-xs text-white/50 mb-8 font-jet leading-relaxed">This action cannot be undone. The video file will be permanently removed.</p>

                <div className="flex w-full gap-3">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all font-jet text-[10px] uppercase font-bold tracking-wider border border-white/10">
                        Cancel
                    </button>
                    <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/60 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all font-jet text-[10px] uppercase font-bold tracking-widest relative overflow-hidden group">
                        <span className="relative z-10 w-full h-full flex items-center justify-center">Delete Permanently</span>
                        <div className="absolute inset-0 bg-red-500/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0"></div>
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const BackgroundGalleryModal = ({
    isOpen,
    onClose,
    activeBgUrl,
    onBackgroundSelect,
    getBgUrl,
    customBackgrounds,
    setCustomBackgrounds
}) => {
    const fileInputRef = useRef(null);
    const [selectedBgFile, setSelectedBgFile] = useState(null);
    const [previewBgUrl, setPreviewBgUrl] = useState(null);
    const [bgNameInput, setBgNameInput] = useState("");
    const [isUploadingBg, setIsUploadingBg] = useState(false);
    const [pendingDelete, setPendingDelete] = useState(null);

    if (!isOpen) return null;

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 1. Strict MIME type validation
        const allowedTypes = ['video/mp4', 'video/webm'];
        if (!allowedTypes.includes(file.type)) {
            toast.error("Only MP4 and WebM videos are supported.");
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        // 2. Size validation (50MB limit)
        const MAX_SIZE = 50 * 1024 * 1024; // 50MB
        if (file.size > MAX_SIZE) {
            toast.error("File too large! Maximum size is 50MB.");
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        // 3. Metadata check using isolated video object
        const video = document.createElement('video');
        video.preload = 'metadata';
        const objectUrl = URL.createObjectURL(file);

        video.onloadedmetadata = function () {
            window.URL.revokeObjectURL(objectUrl);
            if (video.duration > 30) {
                toast.error("Video too long! Maximum duration is 30 seconds.");
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }
            setSelectedBgFile(file);
            setPreviewBgUrl(URL.createObjectURL(file));
            setBgNameInput(file.name.replace(/\.[^/.]+$/, "")); // Pre-fill name without extension
        };

        video.onerror = function () {
            window.URL.revokeObjectURL(objectUrl);
            toast.error("Invalid or corrupted video file.");
            if (fileInputRef.current) fileInputRef.current.value = '';
        };

        video.src = objectUrl;
    };

    const handleCancelUpload = () => {
        setSelectedBgFile(null);
        if (previewBgUrl) URL.revokeObjectURL(previewBgUrl);
        setPreviewBgUrl(null);
        setBgNameInput("");
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSaveBackground = async () => {
        if (!selectedBgFile) return;
        setIsUploadingBg(true);
        const formData = new FormData();
        formData.append('file', selectedBgFile);
        if (bgNameInput.trim()) formData.append('name', bgNameInput.trim());
        try {
            // Remove manual Content-Type set to let Axios auto-set boundary for FormData
            const res = await ApiClient.post('/auth/upload-background', formData);
            setCustomBackgrounds(prev => [res.data, ...prev]);

            // Auto Select
            onBackgroundSelect(res.data.id, res.data.file_path);

            handleCancelUpload(); // Reset form
            toast.success("Background uploaded & applied!");
        } catch {
            toast.error("Failed to upload background.");
        } finally {
            setIsUploadingBg(false);
        }
    };

    const requestDelete = (bgId, filePath) => {
        setPendingDelete({ id: bgId, path: filePath });
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        const { id, path } = pendingDelete;
        try {
            await ApiClient.delete(`/auth/backgrounds/${id}`);
            setCustomBackgrounds(prev => prev.filter(b => b.id !== id));
            if (activeBgUrl === path) {
                onBackgroundSelect('default', '');
            }
            toast.success("Background deleted");
        } catch {
            toast.error("Delete failed");
        } finally {
            setPendingDelete(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl neon-panel relative z-10">

                <div className="p-6 border-b border-white/[0.04] flex justify-between items-center bg-white/[0.02]">
                    <h2 className="text-xl font-bold text-white/90 neon-text">Background Library</h2>
                    <button onClick={() => { handleCancelUpload(); onClose(); }} className="text-white/40 hover:text-red-400 transition-colors p-2 rounded-full hover:bg-white/5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Default Cyber-Noir */}
                        <VideoThumbnail
                            src="/videos/default_bg.mp4#t=0.1"
                            isActive={!activeBgUrl || activeBgUrl === 'default' || activeBgUrl === '/videos/default_bg.mp4'}
                            onSelect={() => onBackgroundSelect('default', '')}
                        />

                        {/* Custom Backgrounds */}
                        {customBackgrounds.map(bg => (
                            <VideoThumbnail
                                key={bg.id}
                                src={getBgUrl(bg.file_path)}
                                bgName={bg.name || "Custom Video"}
                                isActive={activeBgUrl === bg.file_path}
                                onSelect={() => onBackgroundSelect(bg.id, bg.file_path)}
                                onDelete={() => requestDelete(bg.id, bg.file_path)}
                            />
                        ))}

                        {/* Upload Card */}
                        <div className="p-6 bg-white/[0.02] border-t border-white/5 rounded-xl col-span-2 lg:col-span-3 mt-4 flex flex-col items-center justify-center min-h-[200px]">

                            {!selectedBgFile ? (
                                // Phase 1: File Selection
                                <div onClick={() => fileInputRef.current?.click()}
                                    className="w-full max-w-sm aspect-[4/1] rounded-xl border-2 border-dashed border-white/20 hover:border-cyan-400 hover:bg-white/[0.02] cursor-pointer flex flex-col items-center justify-center transition-all group">
                                    <input type="file" ref={fileInputRef} accept="video/mp4,video/webm" className="hidden" onChange={handleFileSelect} />
                                    <div className="flex flex-row items-center gap-3">
                                        <span className="text-2xl text-white/20 group-hover:text-cyan-400 transition-all">+</span>
                                        <span className="text-[10px] font-jet uppercase text-white/30 group-hover:text-cyan-400 transition-colors">Select Video File</span>
                                    </div>
                                </div>
                            ) : (
                                // Phase 2 & 3 & 4: Preview, Naming, Upload
                                <div className="w-full max-w-sm flex flex-col items-center gap-4">
                                    {/* Phase 2: Preview Window */}
                                    <div className="relative aspect-video rounded-xl overflow-hidden border-2 border-cyan-400 w-full shadow-[0_0_15px_rgba(6,182,212,0.3)] bg-black">
                                        <video src={previewBgUrl} className="w-full h-full object-contain" autoPlay muted loop playsInline />
                                        <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-[9px] uppercase font-jet text-white tracking-wider border border-white/10 backdrop-blur">Preview</div>
                                    </div>

                                    {/* Phase 3: Name Input (Appears only after file is picked) */}
                                    <div className="w-full space-y-2">
                                        <label className="text-[10px] font-jet uppercase text-cyan-400/80 pl-1">Name this Background:</label>
                                        <input type="text" placeholder="e.g. Neon Room" value={bgNameInput}
                                            onChange={(e) => setBgNameInput(e.target.value)}
                                            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-3 text-[11px] text-white/90 outline-none focus:border-cyan-500/50 font-jet transition-all placeholder:text-white/20 neon-input" />
                                    </div>

                                    {/* Phase 4: Upload Button (Only clickable if named) */}
                                    <div className="flex w-full gap-3 mt-2">
                                        <button onClick={handleCancelUpload} disabled={isUploadingBg} className="flex-1 py-2 rounded-lg bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all font-jet text-[10px] uppercase font-bold tracking-wider disabled:opacity-50 border border-white/10">Cancel</button>

                                        {bgNameInput.trim().length > 0 ? (
                                            <button onClick={handleSaveBackground} disabled={isUploadingBg} className="flex-1 py-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:border-cyan-500/60 shadow-[0_0_10px_rgba(6,182,212,0.2)] transition-all font-jet text-[10px] uppercase font-bold tracking-wider disabled:opacity-50 flex justify-center items-center hover:bg-cyan-500/20">
                                                {isUploadingBg ? <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div> : 'Save to Library'}
                                            </button>
                                        ) : (
                                            <button disabled className="flex-1 py-2 rounded-lg bg-white/5 text-white/20 border border-white/5 transition-all font-jet text-[10px] uppercase font-bold tracking-wider cursor-not-allowed">
                                                Enter Name to Save
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Custom Neon Delete Modal */}
            <DeleteConfirmModal
                isOpen={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                onConfirm={confirmDelete}
            />
        </div>
    );
};

export default BackgroundGalleryModal;
