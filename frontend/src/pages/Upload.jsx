import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useBlocker } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ApiClient from '../utils/ApiClient';
import { getMediaUrl } from '../utils/urlHelper';
import { UTUBE_TOKEN } from '../utils/authConstants';
import DOMPurify from 'dompurify';

// --- XSS SECURITY HELPERS ---

/**
 * Recursive sanitizer: strips HTML tags, dangerous protocols, and inline event handlers.
 * Uses do...while loop to prevent recursive bypass attacks (e.g., "jav<script>ascript:").
 * Keeps running until the output stabilizes (no more changes).
 */
const sanitizeText = (input) => {
    if (typeof input !== 'string') return input;
    let sanitized = input;
    let previous;
    do {
        previous = sanitized;
        sanitized = sanitized
            // 1. İskeleti Kır: Break HTML skeletons
            .replace(/[<>]/g, '')
            // 2. Mıknatıs Etkisini Boz: Replace dangerous protocols with space ' '
            .replace(/(?:javascript|data|vbscript):/gi, ' ')
            // 3. Event Handler'ları Boz: Replace 'on=' parts with space ' '
            .replace(/on\w*\s*=/gi, ' ')
            .trim();
    } while (sanitized !== previous);
    return sanitized;
};


/** Safe fallback for broken preview frames — 1px transparent grey, zero markup */
const FALLBACK_THUMBNAIL = 'data:image/gif;base64,R0lGODlhAQABAIAAABEREQAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

// --- CUSTOM COMPONENTS ---

const CustomSelect = ({ label, options, value, onChange, placeholder }) => {
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

    const selectedOption = options.find(opt => opt.value === value);

    return (
        <div className="space-y-3 group" ref={containerRef}>
            <label className="text-sm font-bold text-gray-400 group-hover:text-[#e50914] transition-colors uppercase tracking-wider ml-1">
                {label} <span className="text-[#e50914]">*</span>
            </label>
            <div className="relative">
                <div
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full bg-white/5 border ${isOpen ? 'border-[#e50914] shadow-[0_0_15px_rgba(229,9,20,0.2)]' : 'border-gray-800 hover:border-gray-600'} text-white p-5 text-lg cursor-pointer transition-all duration-300 rounded-2xl backdrop-blur-xl flex items-center justify-between`}
                >
                    <span className={selectedOption ? 'text-white' : 'text-gray-600'}>
                        {selectedOption ? (
                            <span className="flex items-center gap-3">
                                <span className="text-2xl">{selectedOption.icon}</span>
                                {selectedOption.label}
                            </span>
                        ) : placeholder}
                    </span>
                    <span className={`text-[#e50914] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                </div>

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-gray-700 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-60 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#e50914] [&::-webkit-scrollbar-thumb]:rounded-full"
                        >
                            {options.map((option) => (
                                <div
                                    key={option.value}
                                    onClick={() => {
                                        onChange(option.value);
                                        setIsOpen(false);
                                    }}
                                    className="p-4 hover:bg-white/10 cursor-pointer flex items-center gap-3 transition-colors border-b border-white/5 last:border-0"
                                >
                                    <span className="text-2xl">{option.icon}</span>
                                    <span className="text-white font-medium">{option.label}</span>
                                    {value === option.value && (
                                        <span className="ml-auto text-[#e50914] font-bold">✓</span>
                                    )}
                                </div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

// --- HELPER COMPONENTS ---

const VideoWallBackground = ({ videoUrl }) => {
    const videoRef = useRef(null);
    const [videoSource, setVideoSource] = useState('/static/ambient/studio_live.mp4');
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [videoPreview, setVideoPreview] = useState(null);
    // videoPreview değiştiğinde, onu güvenli protokolden geçirip yeni bir değişkene atıyoruz
    const safeLocalPreview = useMemo(() => DOMPurify.sanitize(videoPreview, { ALLOWED_URI_REGEXP: /^(?:http:|https:|blob:)/ }), [videoPreview]);

    useEffect(() => {
        if (videoUrl) {
            setVideoSource(videoUrl);
        } else {
            // Default to local ambient file
            setVideoSource('/static/ambient/studio_live.mp4');
        }
    }, [videoUrl]);

    // Force Play Effect
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.play().catch(() => { });
        }
    }, [videoSource]);

    const handleTimeUpdate = () => {
        // Task 3: User Video Override - Disable loop logic if user video selected
        if (videoUrl) return;

        const video = videoRef.current;
        // Strict Loop Safety
        if (video && video.duration && !isNaN(video.duration) && video.duration > 4) {
            const timeLeft = video.duration - video.currentTime;

            // Trigger Fade Out (3.5s before end)
            if (timeLeft <= 3.5 && !isTransitioning) {
                setIsTransitioning(true);
            }

            // Trigger Jump & Fade In (3.0s before end)
            if (timeLeft <= 3.0 && isTransitioning) {
                video.currentTime = 0; // Jump to start (0s)

                // Wait 500ms (hold black), then Fade In
                setTimeout(() => {
                    setIsTransitioning(false);
                }, 500);
            }
        }
    };

    const handleVideoError = async (e) => {
        if (videoSource === '/static/ambient/studio_live.mp4') {
            try {
                // Pathing: Include trailing slash
                const response = await ApiClient.get('/videos/');
                if (response.data && response.data.length > 0) {
                    setVideoSource(getMediaUrl(response.data[0].video_url));
                } else {
                    setVideoSource(null);
                }
            } catch (err) {
                setVideoSource(null);
            }
        }
    };



    // 2. In your component, sanitize the source before rendering
    const safeVideoSource = useMemo(() => DOMPurify.sanitize(videoSource, { ALLOWED_URI_REGEXP: /^(?:http:|https:|blob:)/ }), [videoSource]);

    return (
        <>
            {/* LAYER 0: VIDEO (Bottom) */}
            <div
                className="fixed inset-0 w-full h-full z-0 overflow-hidden"
                style={{ background: 'radial-gradient(circle at top, #251010 0%, #0f0f0f 100%)' }} // Fallback
            >
                {/* 3. KISIM BURASI: videoSource yerine safeVideoSource kullanıyoruz */}
                {safeVideoSource && (
                    <video
                        ref={videoRef}
                        key={safeVideoSource} // Key değiştiğinde React videoyu güvenle yeniden yükler
                        src={safeVideoSource} // CodeQL'in beklediği güvenli veri (Sink)
                        className="absolute inset-0 w-full h-full object-cover opacity-100"
                        autoPlay muted loop playsInline
                        onTimeUpdate={handleTimeUpdate}
                        onError={handleVideoError}
                    />
                )}
            </div>

            {/* LAYER 5: TRANSITION CURTAIN (Middle - Behind Logic) */}
            <div
                className={`fixed inset-0 w-full h-full bg-black z-5 pointer-events-none transition-opacity duration-500 ease-in-out ${isTransitioning ? 'opacity-100' : 'opacity-0'}`}
            />

            {/* LAYER 10: CINEMATIC OVERLAY (Middle - Front) */}
            <div className={`fixed inset-0 w-full h-full z-10 pointer-events-none backdrop-blur-md`}>
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/10" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] via-transparent to-black/40" />
            </div>
        </>
    );
};

// --- MAIN COMPONENT ---

const Upload = () => {
    const [currentStep, setCurrentStep] = useState(1);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    // Task 1: Shake Animation State
    const [isShaking, setIsShaking] = useState(false);

    const [formData, setFormData] = useState({
        videoFile: null,
        title: '',
        description: '',
        category: '',
        tags: [],
        thumbnailFile: null, visibility: 'public', scheduledAt: '', language: 'English', isMadeForKids: false,
    });

    const [videoPreview, setVideoPreview] = useState(null);
    const [videoDuration, setVideoDuration] = useState(null);
    const [videoProcessing, setVideoProcessing] = useState(false);
    const [uploadedVideoId, setUploadedVideoId] = useState(null);
    const [thumbnailPreview, setThumbnailPreview] = useState(null);
    const [previewFrames, setPreviewFrames] = useState([]);
    const [selectedPreviewFrame, setSelectedPreviewFrame] = useState(null);
    const [uploadTimestamp, setUploadTimestamp] = useState(Date.now());
    const [showResetModal, setShowResetModal] = useState(false);

    // Task 3: Implement Sanitized Proxies via useMemo
    const safeVideoPreview = useMemo(() => DOMPurify.sanitize(videoPreview, { ALLOWED_URI_REGEXP: /^(?:http:|https:|blob:)/ }), [videoPreview]);
    const safeThumbnailPreview = useMemo(() => DOMPurify.sanitize(thumbnailPreview, { ALLOWED_URI_REGEXP: /^(?:http:|https:|blob:)/ }), [thumbnailPreview]);

    const navigate = useNavigate();
    const abortControllerRef = useRef(null);
    const videoRef = useRef(null);

    // ── Auth check on mount ──
    useEffect(() => {
        const token = localStorage.getItem(UTUBE_TOKEN);
        if (!token) { navigate('/login'); return; }

        return () => {
            if (videoPreview) URL.revokeObjectURL(videoPreview);
            if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
            if (abortControllerRef.current) abortControllerRef.current.abort();
        };
    }, [navigate]);

    const updateFormData = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const [tagInput, setTagInput] = useState('');
    const handleTagInputKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (tagInput.trim() && formData.tags.length < 10) {
                const sanitizedTag = sanitizeText(tagInput);
                if (sanitizedTag) {
                    updateFormData('tags', [...formData.tags, sanitizedTag]);
                }
                setTagInput('');
            }
        }
    };
    const removeTag = (indexToRemove) => {
        updateFormData('tags', formData.tags.filter((_, index) => index !== indexToRemove));
    };

    const handleVideoChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
        if (!allowedVideoTypes.includes(file.type)) { setError('Invalid video format. Please upload MP4, WebM, or MOV.'); return; }
        const maxVideoSize = 500 * 1024 * 1024;
        if (file.size > maxVideoSize) { setError('Video file too large. Max size is 500MB.'); return; }

        // Clean slate: revoke old preview, reset ALL metadata for the new file
        if (videoPreview) URL.revokeObjectURL(videoPreview);
        if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
        setFormData({
            videoFile: file,
            title: '',
            description: '',
            category: '',
            tags: [],
            thumbnailFile: null, visibility: 'public', scheduledAt: '', language: 'English', isMadeForKids: false,
        });
        setVideoPreview(URL.createObjectURL(file));
        setThumbnailPreview(null);
        setSelectedPreviewFrame(null);
        setPreviewFrames([]);
        setUploadedVideoId(null);
        setError(null);
        // Jump to Step 2 IMMEDIATELY — upload runs async in the background
        setCurrentStep(2);
        startVideoProcessing(file);
    };

    const handleMetadataLoaded = (e) => {
        const duration = e.target.duration;
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        setVideoDuration(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    const startVideoProcessing = async (videoFile) => {
        setVideoProcessing(true);
        setUploadProgress(0);
        setProcessingProgress(0);
        const processData = new FormData();
        processData.append('video_file', videoFile);
        processData.append('title', formData.title || 'Untitled');
        processData.append('description', formData.description || '');
        processData.append('category', formData.category || '');

        try {
            const response = await ApiClient.post('/videos/', processData, {
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(percentCompleted);
                    // Map upload progress to processing progress (0-90%)
                    setProcessingProgress(Math.round(percentCompleted * 0.9));
                },
            });
            setUploadProgress(100);
            setProcessingProgress(100);
            setUploadedVideoId(response.data.id);
            if (response.data.preview_frames && response.data.preview_frames.length > 0) {
                setPreviewFrames(response.data.preview_frames);
            }
            setVideoProcessing(false);
        } catch (err) {
            const errorDetail = err.response?.data?.detail;
            let errorMsg = 'Failed to process video';
            if (typeof errorDetail === 'string') errorMsg = errorDetail;
            else if (Array.isArray(errorDetail) && errorDetail.length > 0) errorMsg = errorDetail[0]?.msg || JSON.stringify(errorDetail[0]);
            else if (errorDetail && typeof errorDetail === 'object') errorMsg = errorDetail.msg || JSON.stringify(errorDetail);
            setError(`Upload failed: ${errorMsg}`);
            setVideoProcessing(false);
            setUploadProgress(0);
            setProcessingProgress(0);
        }
    };

    const handleThumbnailChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
            updateFormData('thumbnailFile', file);
            setThumbnailPreview(URL.createObjectURL(file));
            setSelectedPreviewFrame(null);
        }
    };

    // Task 1: Smart Step Validation
    const validateStep = (step) => {
        if (step === 1) return formData.videoFile !== null || uploadedVideoId !== null;
        if (step === 2) return formData.title.trim() !== '' && formData.category !== '';
        return true;
    };

    const triggerShake = () => {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
    };

    const goToStep = (step) => {
        // Allow strictly backward navigation without validation
        if (step < currentStep) {
            setCurrentStep(step);
            return;
        }

        // Prevent skipping steps (e.g., 1 to 3) or moving forward if current invalid
        if (step > currentStep) {
            // Check if we are trying to skip a step (e.g. 1 -> 3)
            if (step > currentStep + 1) {
                triggerShake();
                return;
            }

            // Validate CURRENT step before moving to NEXT
            if (!validateStep(currentStep)) {
                triggerShake();
                // Optional: Show hint
                if (currentStep === 1) setError("Please upload a video first.");
                if (currentStep === 2) setError("Title and Category are required.");
                return;
            }

            setCurrentStep(step);
        }
    };

    // Kept for compatibility with button states, but goToStep is the primary guard now
    const canNavigateToStep = (targetStep) => {
        // This function is less critical now that goToStep handles logic, 
        // but used for visual styling of bubbles (grayscale etc)
        if (targetStep < currentStep) return true;
        if (targetStep === currentStep + 1) return validateStep(currentStep);
        return false;
    };

    // ── Aggressive Cleanup: Delete video from backend on cancel ──
    const deleteUploadedVideo = async () => {
        if (uploadedVideoId) {
            try {
                await ApiClient.delete(`/videos/${uploadedVideoId}`);
                console.log('[Cleanup] Deleted abandoned video:', uploadedVideoId);
            } catch (err) {
                console.warn('[Cleanup] Failed to delete video:', err);
            }
        }
    };

    const confirmReset = async () => {
        await deleteUploadedVideo();
        if (videoPreview) URL.revokeObjectURL(videoPreview);
        if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
        setFormData({ videoFile: null, title: '', description: '', category: '', tags: [], thumbnailFile: null, visibility: 'public', scheduledAt: '', language: 'English', isMadeForKids: false });
        setVideoPreview(null); setVideoDuration(null); setVideoProcessing(false); setUploadedVideoId(null);
        setPreviewFrames([]); setSelectedPreviewFrame(null); setProcessingProgress(0); setUploadProgress(0); setError(null); setCurrentStep(1);
        setUploadTimestamp(Date.now()); setShowResetModal(false); setThumbnailPreview(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsUploading(true);
        setError(null);
        try {
            if (!uploadedVideoId) throw new Error('No video uploaded');

            // Defer sanitization to submission time to prevent intercepting keystrokes like spacebar
            const finalTitle = formData.title ? sanitizeText(formData.title.trim()) : '';
            if (!finalTitle) throw new Error('Title cannot be empty');
            const finalDescription = formData.description ? sanitizeText(formData.description.trim()) : '';

            const updatePayload = {
                title: finalTitle,
                description: finalDescription,
                category: formData.category,
                tags: formData.tags,
                visibility: formData.visibility,
                scheduled_at: formData.scheduledAt || null,
                selected_preview_frame: selectedPreviewFrame || null,
            };
            const response = await ApiClient.patch(`/videos/${uploadedVideoId}/`, updatePayload);

            if (formData.thumbnailFile) {
                const thumbData = new FormData();
                thumbData.append('thumbnail_file', formData.thumbnailFile);
                // DO NOT set Content-Type manually — Axios must auto-set the multipart boundary
                await ApiClient.post(`/videos/${uploadedVideoId}/thumbnail`, thumbData);
            }

            if (response.status === 200 || response.status === 201) {
                setSuccess(true);
                setTimeout(() => navigate(`/video/${uploadedVideoId}`), 1500);
            }
        } catch (err) {
            if (err.response?.status === 401) {
                setError('🔒 Session Expired - Please log in again to continue');
                setTimeout(() => { localStorage.removeItem(UTUBE_TOKEN); navigate('/login'); }, 3000);
            } else {
                const errorMsg = err.response?.data?.detail || err.message || 'Failed to publish video';
                setError(errorMsg);
            }
        } finally { setIsUploading(false); }
    };

    const pageVariants = {
        initial: { opacity: 0, y: 30 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
        exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
    };

    const categoryOptions = [
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
    const languageOptions = [
        { value: 'English', label: 'English', icon: '🇺🇸' },
        { value: 'Spanish', label: 'Spanish', icon: '🇪🇸' },
        { value: 'French', label: 'French', icon: '🇫🇷' },
        { value: 'German', label: 'German', icon: '🇩🇪' },
        { value: 'Turkish', label: 'Turkish', icon: '🇹🇷' },
        { value: 'Other', label: 'Other', icon: '🌍' },
    ];

    // --- UPLOAD GUARD (Prevent accidental navigation) ---

    // 1. Browser Level (Tab Close/Refresh)
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (currentStep > 1 && !success) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [currentStep, success]);

    // 2. React Router Level (Internal Navigation)
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            currentStep > 1 && !success && currentLocation.pathname !== nextLocation.pathname
    );

    return (
        <div className="relative min-h-screen bg-transparent text-white font-sans selection:bg-red-500/30">
            {/* NAVIGATION GUARD MODAL (Custom UI for internal navigation attempts) */}
            <AnimatePresence>
                {blocker.state === "blocked" && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4 backdrop-blur-md"
                        onClick={() => blocker.reset()}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#141414] border border-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden"
                        >
                            {/* Top accent line */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#e50914] to-transparent opacity-50" />

                            {/* Icon */}
                            <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
                                <span className="text-3xl">⚠️</span>
                            </div>

                            {/* Title & Description */}
                            <h3 className="text-2xl font-bold text-white mb-3 text-center">Discard Upload?</h3>
                            <p className="text-gray-400 mb-8 leading-relaxed text-center text-sm">
                                You have an upload in progress. If you leave, your video will be <strong className="text-red-400">permanently deleted</strong> and all progress will be lost.
                            </p>

                            {/* Buttons */}
                            <div className="flex justify-center gap-4">
                                <button
                                    onClick={() => blocker.reset()}
                                    className="px-8 py-3 text-white hover:bg-white/10 rounded-xl transition-all font-bold border border-gray-700 hover:border-gray-500"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        await deleteUploadedVideo();
                                        blocker.proceed();
                                    }}
                                    className="px-8 py-3 bg-[#e50914] text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-900/30 hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    Delete & Leave
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ASYNC UPLOAD PROGRESS INDICATOR */}
            {currentStep > 1 && uploadProgress < 100 && uploadProgress > 0 && (
                <div className="fixed top-20 right-6 z-[999] bg-[#141414] border border-gray-800 rounded-xl px-5 py-3 shadow-2xl flex items-center gap-3 min-w-[200px]">
                    <div className="w-5 h-5 border-2 border-gray-700 border-t-[#e50914] rounded-full animate-spin" />
                    <div className="flex-1">
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Uploading</p>
                        <div className="h-1.5 bg-gray-800 rounded-full mt-1.5 overflow-hidden">
                            <div className="h-full bg-[#e50914] transition-all duration-300 rounded-full shadow-[0_0_8px_#e50914]" style={{ width: `${uploadProgress}%` }} />
                        </div>
                    </div>
                    <span className="text-sm font-mono text-[#e50914] font-bold">{uploadProgress}%</span>
                </div>
            )}
            {currentStep > 1 && uploadProgress === 100 && !success && (
                <div className="fixed top-20 right-6 z-[999] bg-green-950/80 border border-green-500/30 rounded-xl px-5 py-3 shadow-2xl flex items-center gap-3">
                    <span className="text-lg">✓</span>
                    <span className="text-sm font-bold text-green-400">Upload Complete</span>
                </div>
            )}

            {/* BACKGROUND LAYERS (Z-0 and Z-10) */}
            <div className="min-h-screen bg-[#0f0f0f] text-white font-sans selection:bg-[#e50914] selection:text-white relative overflow-hidden flex items-center justify-center p-4">

                {/* Dynamic Background */}
                <VideoWallBackground videoUrl={videoPreview} />

                {/* Task 1: Apply Shake Animation to Main Container */}
                <motion.div
                    animate={{ x: isShaking ? [-10, 10, -10, 10, 0] : 0 }}
                    transition={{ duration: 0.4 }}
                    className="relative w-full max-w-5xl max-h-[85vh] mx-auto bg-gradient-to-br from-[#1a1a1a]/90 to-[#251010]/90 rounded-3xl border border-red-900/30 shadow-2xl shadow-black/90 flex flex-col overflow-hidden ring-1 ring-white/5 mt-16 z-10 backdrop-blur-sm"
                >
                    <div className="absolute inset-0 bg-gradient-to-b from-[#e50914]/5 to-transparent pointer-events-none z-0" />
                    <div className="relative px-8 pt-8 pb-6 border-b border-white/5 bg-black/40 backdrop-blur-md z-30 shrink-0">
                        <div className="flex justify-between items-center max-w-lg mx-auto relative cursor-default select-none">
                            <div className="absolute top-1/2 left-0 w-full h-[2px] bg-gray-800 -z-10 transform -translate-y-1/2 rounded-full" />
                            {[{ num: 1, icon: '🎬', label: 'Upload' }, { num: 2, icon: '📝', label: 'Details' }, { num: 3, icon: '🖼️', label: 'Finish' }].map((step) => (
                                <div key={step.num} className="relative flex flex-col items-center group">
                                    <div className="relative">
                                        {currentStep === step.num && <div className="absolute inset-0 bg-[#e50914] blur-xl opacity-60 rounded-full scale-150 animate-pulse" />}
                                        <button onClick={() => goToStep(step.num)} className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-500 ease-out ${currentStep >= step.num ? 'text-white shadow-[0_0_25px_#e50914]' : 'text-gray-600 bg-[#1a1a1a] border-2 border-gray-700'} ${currentStep >= step.num || canNavigateToStep(step.num) ? 'cursor-pointer hover:scale-110' : 'cursor-not-allowed grayscale opacity-70'}`}>
                                            <span className="relative z-20 drop-shadow-md">{step.icon}</span>
                                            {currentStep === step.num && (
                                                <motion.div layoutId="stepper-ball" className="absolute inset-0 rounded-full bg-[#1a1a1a] border-2 border-[#e50914] z-10 shadow-[0_0_15px_#e50914]" transition={{ type: "spring", stiffness: 800, damping: 25, mass: 0.8 }} layout>
                                                    <div className="absolute inset-0 rounded-full bg-[#e50914]/20 animate-pulse" />
                                                </motion.div>
                                            )}
                                            {currentStep > step.num && <div className="absolute inset-0 rounded-full bg-[#1a1a1a] border-2 border-[#e50914] z-0" />}
                                        </button>
                                    </div>
                                    <span className={`text-xs mt-3 font-bold tracking-widest uppercase transition-colors duration-300 ${currentStep >= step.num ? 'text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]' : 'text-gray-600'}`}>{step.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 md:p-12 relative z-10 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#e50914] [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-red-600">
                        <AnimatePresence>
                            {error && (
                                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-red-900/20 border-l-4 border-[#e50914] text-red-100 px-6 py-4 rounded-r-md mb-8 flex items-center justify-between backdrop-blur-sm shadow-lg sticky top-0 z-40">
                                    <span className="flex items-center gap-3 font-medium"><span className="text-xl">⚠️</span>{error}</span>
                                    <button onClick={() => setError(null)} className="text-red-300 hover:text-white transition-colors text-xl font-bold">×</button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <AnimatePresence>
                            {success && (
                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="bg-green-900/20 border-l-4 border-green-500 text-green-100 px-6 py-4 rounded-r-md mb-8 text-center font-bold text-lg backdrop-blur-sm flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(0,255,0,0.2)] sticky top-0 z-40">
                                    <span className="text-2xl">🎉</span>Video Published Successfully! Redirecting...
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <AnimatePresence mode="wait">
                            {currentStep === 1 && (
                                <motion.div key="step1" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="w-full max-w-3xl mx-auto">
                                    {formData.videoFile && videoPreview ? (
                                        <div className="bg-black/40 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm shadow-2xl">
                                            <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-800 mb-6 relative group">
                                                {safeVideoPreview && <video ref={videoRef} src={safeVideoPreview} key={safeVideoPreview} controls onLoadedMetadata={handleMetadataLoaded} className="w-full h-full object-contain" />}
                                            </div>
                                            <div className="flex flex-col md:flex-row gap-4 mb-6 bg-white/5 p-4 rounded-xl border border-white/10">
                                                <div className="flex-1"><p className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-1">File Name</p><p className="text-white font-mono truncate">{formData.videoFile.name}</p></div>
                                                <div className="flex-1 md:text-right"><p className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-1">Duration & Size</p><p className="text-white font-mono">{videoDuration || '--:--'} • {(formData.videoFile.size / (1024 * 1024)).toFixed(2)} MB</p></div>
                                            </div>
                                            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                                                <div className="flex-1 w-full">
                                                    {processingProgress < 100 ? (
                                                        <div className="space-y-3">
                                                            <div className="flex justify-between text-sm text-gray-400 font-medium"><span>Processing SD Version...</span><span className="text-[#e50914] font-bold">{Math.round(processingProgress)}%</span></div>
                                                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-[#e50914] transition-all duration-300 shadow-[0_0_10px_#e50914]" style={{ width: `${processingProgress}%` }} /></div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center text-green-400 space-x-2 bg-green-900/20 px-4 py-2 rounded-lg border border-green-500/30 w-fit animate-pulse"><span className="text-xl">✓</span><span className="font-bold">Ready for Details</span></div>
                                                    )}
                                                </div>
                                                <div className="flex space-x-4 w-full md:w-auto">
                                                    <button onClick={() => setShowResetModal(true)} className="px-6 py-3 text-gray-400 hover:text-white transition-colors hover:bg-white/5 rounded-lg font-medium">Replace</button>
                                                    <button onClick={() => setCurrentStep(2)} disabled={processingProgress < 100} className="px-8 py-3 bg-[#e50914] text-white font-bold rounded-lg hover:bg-red-700 transition-all shadow-lg hover:shadow-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transform active:scale-95">Continue</button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <label className="block group cursor-pointer relative">
                                            <div className="border-2 border-dashed border-gray-700 bg-black/20 rounded-2xl p-20 text-center transition-all duration-500 group-hover:border-[#e50914] group-hover:bg-[#e50914]/5 relative overflow-hidden shadow-inner">
                                                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-[#e50914]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                                <div className="relative z-10 flex flex-col items-center justify-center space-y-8">
                                                    <div className="w-24 h-24 rounded-full bg-[#1a1a1a] flex items-center justify-center group-hover:scale-110 transition-transform duration-500 shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-gray-800 group-hover:border-[#e50914]/50 group-hover:shadow-[0_0_20px_rgba(229,9,20,0.2)]"><span className="text-4xl group-hover:scale-110 transition-transform duration-300 drop-shadow-lg">☁️</span></div>
                                                    <div><h3 className="text-3xl font-bold text-white mb-3 tracking-tight group-hover:text-[#e50914] transition-colors">Upload Video</h3><p className="text-gray-400 text-lg group-hover:text-gray-300">Drag & drop or click to browse</p><p className="text-gray-600 text-sm mt-4 font-mono">MP4, WebM, MOV up to 500MB</p></div>
                                                </div>
                                            </div>
                                            <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideoChange} className="hidden" />
                                        </label>
                                    )}
                                </motion.div>
                            )}
                            {currentStep === 2 && (
                                <motion.div key="step2" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                        <div className="lg:col-span-2 space-y-8">
                                            <div className="bg-black/20 p-8 rounded-2xl border border-gray-800/50 space-y-8 backdrop-blur-sm shadow-xl">
                                                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3 pb-4 border-b border-gray-800/50"><div className="w-1 h-8 bg-[#e50914] rounded-full shadow-[0_0_10px_#e50914]" />Video Details</h2>
                                                <div className="space-y-3 group">
                                                    <label className="text-sm font-bold text-gray-400 group-focus-within:text-[#e50914] transition-colors uppercase tracking-wider ml-1">Title <span className="text-[#e50914]">*</span></label>
                                                    <input type="text" value={formData.title} onChange={(e) => updateFormData('title', e.target.value)} placeholder="Add a catchy title..." className="w-full bg-white/5 border border-gray-800 text-white p-5 text-lg outline-none focus:border-[#e50914] focus:bg-white/10 focus:shadow-[0_0_15px_rgba(229,9,20,0.1)] transition-all duration-300 rounded-2xl placeholder-gray-600 backdrop-blur-xl" required />
                                                </div>
                                                <div className="space-y-3 group">
                                                    <label className="text-sm font-bold text-gray-400 group-focus-within:text-[#e50914] transition-colors uppercase tracking-wider ml-1">Description</label>
                                                    <textarea value={formData.description} onChange={(e) => updateFormData('description', e.target.value)} placeholder="Tell your viewers what this video is about..." rows="6" className="w-full bg-white/5 border border-gray-800 text-white p-5 outline-none focus:border-[#e50914] focus:bg-white/10 focus:shadow-[0_0_15px_rgba(229,9,20,0.1)] transition-all duration-300 rounded-2xl resize-none placeholder-gray-600 backdrop-blur-xl" />
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <CustomSelect label="Category" options={categoryOptions} value={formData.category} onChange={(val) => updateFormData('category', val)} placeholder="Select Category" />
                                                    <div className="space-y-3 group">
                                                        <label className="text-sm font-bold text-gray-400 group-focus-within:text-[#e50914] transition-colors uppercase tracking-wider ml-1">Tags</label>
                                                        <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagInputKeyDown} placeholder="Press Enter to add" className="w-full bg-white/5 border border-gray-800 text-white p-5 outline-none focus:border-[#e50914] focus:bg-white/10 focus:shadow-[0_0_15px_rgba(229,9,20,0.1)] transition-all duration-300 rounded-2xl placeholder-gray-600 backdrop-blur-xl" />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                                                    <CustomSelect label="Language" options={languageOptions} value={formData.language} onChange={(val) => updateFormData('language', val)} placeholder="Select Language" />
                                                    <div className="mt-8 bg-white/5 border border-gray-800 rounded-2xl p-5 flex items-center justify-between group hover:border-[#e50914]/50 transition-colors h-[86px]">
                                                        <div><p className="text-white font-bold mb-1">Made for Kids?</p><p className="text-gray-500 text-xs">Is this content COPPA compliant?</p></div>
                                                        <button onClick={() => updateFormData('isMadeForKids', !formData.isMadeForKids)} className={`w-14 h-8 rounded-full relative transition-colors duration-300 ${formData.isMadeForKids ? 'bg-[#e50914]' : 'bg-gray-700'}`}><div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 shadow-md ${formData.isMadeForKids ? 'left-7' : 'left-1'}`} /></button>
                                                    </div>
                                                </div>
                                                {formData.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 pt-2 animate-fadeIn p-2 bg-black/20 rounded-xl border border-white/5">
                                                        {formData.tags.map((tag, index) => (
                                                            <span key={index} className="bg-[#1a1a1a] text-gray-200 px-4 py-1.5 rounded-full text-sm flex items-center gap-2 border border-gray-700 shadow-sm hover:border-[#e50914]/50 transition-colors cursor-default">#{tag}<button onClick={() => removeTag(index)} className="hover:text-[#e50914] font-bold text-gray-500 transition-colors w-5 h-5 flex items-center justify-center hover:bg-white/10 rounded-full">×</button></span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="lg:col-span-1">
                                            <div className="sticky top-8 space-y-6">
                                                <div className="bg-black/40 rounded-2xl overflow-hidden border border-gray-800 shadow-2xl backdrop-blur-sm group hover:border-gray-700 transition-colors">
                                                    <div className="aspect-video bg-black relative">
                                                        {safeVideoPreview && <video src={safeVideoPreview} key={safeVideoPreview} className="w-full h-full object-cover" controls />}
                                                        <div className="absolute top-2 right-2 bg-[#e50914] px-2 py-1 rounded text-[10px] text-white font-bold tracking-widest shadow-lg">PREVIEW</div>
                                                    </div>
                                                    <div className="p-5 space-y-4">
                                                        <div><h4 className="text-white font-bold line-clamp-1 text-lg">{formData.title || 'Untitled Video'}</h4><p className="text-gray-500 text-sm line-clamp-2 mt-1">{formData.description || 'No description added yet.'}</p></div>
                                                        <div className="pt-4 border-t border-gray-800/50"><p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 font-bold">Direct Link</p><p className="text-[#3ea6ff] text-xs font-mono truncate cursor-pointer hover:underline opacity-80 hover:opacity-100 transition-opacity">{window.location.origin}/video/{uploadedVideoId || '...'}</p></div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-3">
                                                    <button onClick={() => setCurrentStep(3)} disabled={!formData.title || !formData.category} className="w-full py-4 bg-[#e50914] text-white font-bold rounded-xl shadow-[0_4px_14px_0_rgba(229,9,20,0.39)] hover:bg-red-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:shadow-none disabled:transform-none">Next: Thumbnails →</button>
                                                    <button onClick={() => setCurrentStep(1)} className="w-full py-3 text-gray-500 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider hover:bg-white/5 rounded-xl">← Back to Upload</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                            {currentStep === 3 && (
                                <motion.div key="step3" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="w-full">
                                    <div className="text-center mb-10"><h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Select a Thumbnail</h2><p className="text-gray-400 text-lg">Choose a frame that best represents your video.</p></div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12 px-4 pb-10">
                                        {previewFrames.map((frame, index) => (
                                            <motion.div
                                                key={index}
                                                whileHover={{ scale: 1.8, zIndex: 50 }}
                                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                                onClick={() => { setSelectedPreviewFrame(frame); updateFormData('thumbnailFile', null); if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview); setThumbnailPreview(null); }}
                                                className={`relative group cursor-pointer aspect-video bg-black rounded-xl overflow-hidden border-2 transition-all duration-300 shadow-xl ${selectedPreviewFrame === frame ? 'border-[#e50914] z-10 shadow-[0_0_20px_rgba(229,9,20,0.5)] ring-2 ring-[#e50914]/30' : 'border-transparent hover:border-gray-600 hover:shadow-2xl hover:shadow-red-900/40'} ${index === 0 ? 'origin-left' : (index === previewFrames.length - 1 ? 'origin-right' : 'origin-center')}`}
                                            >
                                                <div className="absolute top-0 left-0 w-full bg-black/80 text-white text-[10px] text-center py-1 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest font-bold z-20">Click to Select</div>
                                                <img src={DOMPurify.sanitize(getMediaUrl(`/storage/uploads/previews/${encodeURIComponent(frame.split('/').pop())}?t=${uploadTimestamp}`), { ALLOWED_URI_REGEXP: /^(?:http:|https:|blob:)/ })} alt={`Frame ${index + 1}`} className="w-full h-full object-cover" onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_THUMBNAIL; }} />
                                                {selectedPreviewFrame === frame && <div className="absolute inset-0 bg-[#e50914]/20 flex items-center justify-center backdrop-blur-[1px]"><div className="bg-[#e50914] text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg transform scale-110 border border-white/20">Selected</div></div>}
                                                <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-[10px] text-white font-mono opacity-0 group-hover:opacity-100 transition-opacity border border-white/10">FRAME {index + 1}</div>
                                            </motion.div>
                                        ))}
                                        <label className={`relative group cursor-pointer aspect-video bg-[#0a0a0a] rounded-xl overflow-hidden border-2 border-dashed border-gray-700 hover:border-[#e50914] transition-all duration-300 flex flex-col items-center justify-center hover:bg-[#111] shadow-inner ${thumbnailPreview ? 'border-solid border-[#e50914]' : ''} origin-right`}>
                                            {safeThumbnailPreview ? (<><img src={safeThumbnailPreview} className="w-full h-full object-cover" alt="Custom" /><div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm"><span className="text-white font-bold bg-[#e50914] px-4 py-2 rounded-full shadow-lg transform hover:scale-105 transition-transform">Change Poster</span></div></>) : (<><div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-800 to-black flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-lg border border-gray-700 group-hover:border-[#e50914] group-hover:shadow-[0_0_15px_rgba(229,9,20,0.3)]"><span className="text-2xl text-gray-400 group-hover:text-white transition-colors font-bold">+</span></div><span className="text-sm text-gray-400 group-hover:text-white font-bold transition-colors uppercase tracking-wide">Upload Custom</span><span className="text-[10px] text-gray-600 mt-1">1280x720 recommended</span></>)}
                                            <input type="file" accept="image/*" onChange={handleThumbnailChange} className="hidden" />
                                        </label>
                                    </div>
                                    <div className="flex justify-center gap-6 border-t border-gray-800/50 pt-10">
                                        <button onClick={() => setCurrentStep(2)} className="px-8 py-4 text-gray-400 hover:text-white transition-colors font-bold uppercase tracking-wider hover:bg-white/5 rounded-xl text-sm">← Back to Details</button>
                                        <button onClick={handleSubmit} disabled={isUploading || uploadProgress < 100 || (!selectedPreviewFrame && !formData.thumbnailFile)} className="px-12 py-4 bg-[#e50914] text-white font-bold text-lg rounded-xl shadow-[0_0_25px_rgba(229,9,20,0.4)] hover:bg-red-700 hover:shadow-[0_0_40px_rgba(229,9,20,0.6)] hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none">{isUploading ? <span className="flex items-center gap-2"><span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>Publishing...</span> : '🚀 Publish Video'}</button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <AnimatePresence>
                            {showResetModal && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-md" onClick={() => setShowResetModal(false)}>
                                    <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} onClick={(e) => e.stopPropagation()} className="bg-[#141414] border border-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#e50914] to-transparent opacity-50" />
                                        <h3 className="text-2xl font-bold text-white mb-2">Discard Upload?</h3>
                                        <p className="text-gray-400 mb-8 leading-relaxed">Are you sure you want to cancel? This action cannot be undone and your current progress will be lost permanently.</p>
                                        <div className="flex justify-end gap-3"><button onClick={() => setShowResetModal(false)} className="px-6 py-2.5 text-white hover:bg-gray-800 rounded-lg transition-colors font-medium border border-transparent hover:border-gray-700">Keep Editing</button><button onClick={confirmReset} className="px-6 py-2.5 bg-[#e50914] text-white font-bold rounded-lg hover:bg-red-700 transition-colors shadow-lg shadow-red-900/20">Discard Video</button></div>
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default Upload;
