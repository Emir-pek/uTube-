import React, { useState } from 'react';
import CustomWarningDialog from './CustomWarningDialog';

const BanReasonDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  targetUser,
  duration // '60', '3600', 'permanent', etc.
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  const formatDuration = (d) => {
    if (d === 'permanent') return 'Permanent';
    const secs = parseInt(d);
    if (secs < 3600) return `${Math.floor(secs / 60)} minutes`;
    if (secs < 86400) return `${Math.floor(secs / 3600)} hours`;
    return `${Math.floor(secs / 86400)} days`;
  };

  const handleConfirm = async () => {
    if (reason.trim().length < 3) {
      setError('Reason must be at least 3 characters');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      await onConfirm(reason);
      setReason(''); // Reset
      onClose();
    } catch (err) {
      setError(typeof err === 'string' ? err : (err.response?.data?.detail || 'Failed to ban user'));
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <CustomWarningDialog
      isOpen={isOpen}
      onClose={onClose}
      type="warning"
      title={duration === 'permanent' ? 'Permanent Ban' : 'Timed Out Notification'}
      message={`You are about to ${
        duration === 'permanent' ? 'permanently ban' : 'timeout'
      } ${targetUser?.username}. Please provide a valid reason:`}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] text-slate-500 mb-2 uppercase tracking-[0.1em] font-bold font-jet">
            Moderation Reason *
          </label>
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (e.target.value.trim().length >= 3) setError('');
            }}
            placeholder="e.g., Spamming, Harassment, Inappropriate Behavior..."
            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:bg-black/60 transition-all resize-none shadow-inner"
            rows={3}
            maxLength={200}
            autoFocus
          />
          <div className="flex justify-between mt-2 px-1">
            <span className="text-[11px] text-red-400 font-jet">{error}</span>
            <span className={`text-[10px] font-jet ${reason.length >= 180 ? 'text-yellow-500' : 'text-slate-600'}`}>
              {reason.length}/200
            </span>
          </div>
        </div>
        
        <div className="bg-white/[0.02] rounded-xl p-4 border border-white/5 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Target User:</span>
            <span className="text-cyan-400 font-bold">{targetUser?.username}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Action Type:</span>
            <span className={duration === 'permanent' ? 'text-red-400 font-bold' : 'text-yellow-400 font-bold'}>
              {duration === 'permanent' ? 'Permanent Ban' : 'Timeout'}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Duration:</span>
            <span className="text-slate-300 font-jet">{formatDuration(duration)}</span>
          </div>
        </div>
        
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-semibold text-slate-400 hover:text-white transition-all border border-white/5"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || reason.trim().length < 3}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all shadow-lg ${
              duration === 'permanent' 
                ? 'bg-red-600 hover:bg-red-500 shadow-red-600/20' 
                : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/20'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              duration === 'permanent' ? 'Confirm Permanent Ban' : 'Confirm Timeout'
            )}
          </button>
        </div>
      </div>
    </CustomWarningDialog>
  );
};

export default BanReasonDialog;
