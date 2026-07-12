import React, { useState, useEffect, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import ApiClient from '../utils/ApiClient';
import { UTUBE_USER, UTUBE_TOKEN } from '../utils/authConstants';
import { getAvatarUrl } from '../utils/urlHelper';
import toast from 'react-hot-toast';



const EditProfile = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const [formData, setFormData] = useState({
        username: '',
        email: '',
        currentPassword: '',
        password: '',
        confirmPassword: ''
    });

    const [usernameTaken, setUsernameTaken] = useState(false);

    const [profileImage, setProfileImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [verificationStep, setVerificationStep] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [confirmRemovePP, setConfirmRemovePP] = useState(false);
    const [removingPP, setRemovingPP] = useState(false);

    const safeProfilePreview = useMemo(() => {
        const rawUrl = imagePreview || (user ? getAvatarUrl(user.profile_image, user.username) : '');
        return DOMPurify.sanitize(rawUrl, { ALLOWED_URI_REGEXP: /^(?:http:|https:|blob:)/ });
    }, [imagePreview, user]);

    useEffect(() => {
        try {
            const userData = localStorage.getItem(UTUBE_USER);
            if (userData) {
                const parsedUser = JSON.parse(userData);
                setUser(parsedUser);
                setFormData({
                    username: parsedUser.username || '',
                    email: parsedUser.email || '',
                    currentPassword: '',
                    password: '',
                    confirmPassword: ''
                });
            } else {
                navigate('/login');
            }
        } catch (e) {
            navigate('/login');
        }
    }, [navigate]);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (imagePreview) URL.revokeObjectURL(imagePreview);
            setProfileImage(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleRemoveProfilePicture = async () => {
        setRemovingPP(true);
        try {
            const res = await ApiClient.delete('/auth/me/profile-picture');
            localStorage.setItem(UTUBE_USER, JSON.stringify(res.data));
            setUser(res.data);
            setImagePreview(null);
            setProfileImage(null);
            window.dispatchEvent(new Event('authChange'));
            toast.success('Profile picture removed!');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to remove profile picture');
        } finally {
            setRemovingPP(false);
            setConfirmRemovePP(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setLoading(true);

        // Validation
        if (formData.password && formData.password !== formData.confirmPassword) {
            setError("Passwords do not match");
            setLoading(false);
            return;
        }

        try {
            const submitData = new FormData();
            submitData.append('username', formData.username);
            submitData.append('email', formData.email);
            if (formData.password) {
                if (!formData.currentPassword) {
                    setError("Current password is required to set a new password");
                    setLoading(false);
                    return;
                }
                submitData.append('password', formData.password);
                submitData.append('current_password', formData.currentPassword);
            }
            if (profileImage) {
                submitData.append('file', profileImage);
            }

            const response = await ApiClient.put('/auth/me', submitData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (response.data.status === 'verification_required') {
                setVerificationStep(true);
                setSuccess("Check your new email inbox. We've sent a 6-digit verification code to confirm the change.");
                setLoading(false);
                return;
            }

            // Update local storage with new user data
            const updatedUser = response.data;
            localStorage.setItem(UTUBE_USER, JSON.stringify(updatedUser));
            setUser(updatedUser);
            window.dispatchEvent(new Event('authChange'));

            setSuccess("Profile updated successfully!");
            setTimeout(() => navigate('/profile'), 1500);

        } catch (err) {
            console.warn('Profile update failed.');
            const errorMsg = err.response?.data?.detail || "Failed to update profile";

            if (err.response?.status === 400 && errorMsg === "Username is already taken.") {
                setUsernameTaken(true);
            } else {
                setError(errorMsg);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyEmail = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setLoading(true);

        try {
            const response = await ApiClient.post('/auth/verify-email-change', {
                code: verificationCode
            });

            // Update local storage and context with verified user data
            const updatedUser = response.data;
            localStorage.setItem(UTUBE_USER, JSON.stringify(updatedUser));
            setUser(updatedUser);
            window.dispatchEvent(new Event('authChange'));

            setSuccess("Email successfully verified and updated!");
            setTimeout(() => navigate('/profile'), 1500);
        } catch (err) {
            console.warn('Email verification failed.');
            setError(err.response?.data?.detail || "Invalid or expired verification code.");
        } finally {
            setLoading(false);
        }
    };

    if (!user) return null;

    return (
        <div className="min-h-screen pt-24 pb-12 px-4 md:px-8 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-neutral-900 to-black text-white flex items-center justify-center">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-2xl bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                <h1 className="text-3xl font-black tracking-tighter mb-8 text-center">Edit Profile</h1>

                <AnimatePresence>
                    {error && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl mb-6 text-center text-sm font-medium">
                            {error}
                        </motion.div>
                    )}
                    {success && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-green-500/10 border border-green-500/50 text-green-200 px-4 py-3 rounded-xl mb-6 text-center text-sm font-medium">
                            {success}
                        </motion.div>
                    )}
                </AnimatePresence>

                {!verificationStep ? (
                    <form onSubmit={handleSubmit} className="space-y-6 relative z-10">

                        {/* Profile Picture Upload */}
                        <div className="flex flex-col items-center gap-4 mb-8">
                            <div className="relative group cursor-pointer">
                                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white/10 bg-black shadow-xl group-hover:border-white/30 transition-colors">
                                    {safeProfilePreview && (
                                        <img
                                            src={safeProfilePreview}
                                            alt="Profile"
                                            className="w-full h-full object-cover"
                                        />
                                    )}
                                </div>
                                <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer">
                                    <span className="text-xs font-bold uppercase tracking-wider">Change</span>
                                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                                </label>
                            </div>
                            <p className="text-xs text-white/40 uppercase tracking-widest font-bold">Profile Picture</p>
                            {/* Remove Profile Picture Button */}
                            {user?.profile_image && !imagePreview && (
                                <div className="mt-2">
                                    {!confirmRemovePP ? (
                                        <button
                                            type="button"
                                            onClick={() => setConfirmRemovePP(true)}
                                            className="flex items-center gap-1.5 text-xs font-bold text-red-400/70 hover:text-red-400 transition-colors"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            Remove Photo
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                            <span className="text-xs text-red-300 font-medium">Remove photo?</span>
                                            <button
                                                type="button"
                                                onClick={handleRemoveProfilePicture}
                                                disabled={removingPP}
                                                className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                                            >
                                                {removingPP ? 'Removing...' : 'Yes'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setConfirmRemovePP(false)}
                                                className="text-xs font-bold text-white/50 hover:text-white/70 transition-colors"
                                            >
                                                No
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Inputs */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-white/60 uppercase tracking-widest ml-1">Username</label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => {
                                        setFormData({ ...formData, username: e.target.value });
                                        if (usernameTaken) setUsernameTaken(false);
                                    }}
                                    className={`w-full bg-white/5 border ${usernameTaken ? 'border-red-500/50 focus:shadow-[0_0_15px_rgba(229,9,20,0.15)]' : 'border-white/10 focus:border-primary/50'} rounded-xl px-4 py-3 outline-none focus:bg-white/10 transition-all font-medium`}
                                    required
                                />
                                {usernameTaken && (
                                    <p className="text-red-500 text-xs mt-1 ml-1 font-medium">This username is already taken. Please choose another.</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-white/60 uppercase tracking-widest ml-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:bg-white/10 transition-all font-medium"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2 pt-4 border-t border-white/10">
                            <label className="text-xs font-bold text-white/60 uppercase tracking-widest ml-1">New Password (Optional)</label>
                            <input
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                placeholder="Leave blank to keep current password"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:bg-white/10 transition-all font-medium"
                            />
                        </div>

                        {formData.password && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-white/60 uppercase tracking-widest ml-1">Current Password</label>
                                    <input
                                        type="password"
                                        value={formData.currentPassword}
                                        onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:bg-white/10 transition-all font-medium"
                                        required
                                    />
                                    <p className="text-xs text-white/40 ml-1">Required to confirm password change</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-white/60 uppercase tracking-widest ml-1">Confirm New Password</label>
                                    <input
                                        type="password"
                                        value={formData.confirmPassword}
                                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:bg-white/10 transition-all font-medium"
                                        required
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex gap-4 pt-6">
                            <button
                                type="button"
                                onClick={() => navigate('/profile')}
                                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 py-3 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/80 hover:to-purple-600/80 text-white font-bold rounded-xl shadow-lg transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? "Saving..." : "Save Changes"}
                            </button>
                        </div>

                    </form>
                ) : (
                    <motion.form
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        onSubmit={handleVerifyEmail}
                        className="space-y-6 relative z-10"
                    >
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/50">
                                <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Verify Your Email</h2>
                            <p className="text-white/60 text-sm">
                                We've sent a 6-digit verification code to <span className="text-white font-bold">{formData.email}</span>
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-white/60 uppercase tracking-widest ml-1">6-Digit Code</label>
                                <input
                                    type="text"
                                    maxLength="6"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                                    placeholder="000000"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 outline-none focus:border-primary/50 focus:bg-white/10 transition-all font-mono text-center text-3xl tracking-[1em]"
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex gap-4 pt-6">
                            <button
                                type="button"
                                onClick={() => {
                                    setVerificationStep(false);
                                    setVerificationCode('');
                                    setError(null);
                                    setSuccess(null);
                                }}
                                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all"
                            >
                                Back
                            </button>
                            <button
                                type="submit"
                                disabled={loading || verificationCode.length !== 6}
                                className="flex-1 py-3 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/80 hover:to-purple-600/80 text-white font-bold rounded-xl shadow-lg transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? "Verifying..." : "Confirm Email"}
                            </button>
                        </div>
                    </motion.form>
                )}
            </motion.div>
        </div>
    );
};

export default EditProfile;
