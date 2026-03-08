import React, { useState, useEffect } from 'react';
import CustomWarningDialog from './CustomWarningDialog';

const BanNotification = ({ banInfo, onAcknowledge }) => {
  if (!banInfo) return null;
  const { reason, expires_at, banned_by, duration, type } = banInfo;
  
  // A ban is permanent if expires_at is null or not provided
  const isPermanent = !expires_at;
  
  // Calculate remaining seconds
  const calculateRemaining = () => {
    if (isPermanent) return 0;
    const diff = new Date(expires_at) - new Date();
    return Math.max(0, Math.floor(diff / 1000));
  };

  const [timeRemaining, setTimeRemaining] = useState(calculateRemaining());
  
  useEffect(() => {
    if (isPermanent || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setTimeRemaining(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
        // We could trigger a refresh or just hide the modal
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [expires_at, isPermanent]);
  
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };
  
  return (
    <CustomWarningDialog
      isOpen={true}
      onClose={isPermanent ? undefined : onAcknowledge}
      type="error"
      title={isPermanent ? "Access Revoked" : "Chat Restrictions Applied"}
      message={isPermanent 
        ? "You have been permanently banned from this channel. You can no longer participate in the chat." 
        : `You have been temporarily timed out. Your ability to chat will be restored in ${formatTime(timeRemaining)}.`
      }
    >
      <div className="space-y-4">
        <div className="bg-red-500/5 rounded-xl border border-red-500/10 overflow-hidden">
          <div className="px-5 py-4 space-y-3">
            <div>
              <div className="text-[10px] text-red-400/60 uppercase tracking-widest font-bold mb-1">Moderator Reason</div>
              <div className="text-sm text-red-200 font-medium leading-relaxed italic">
                "{reason || 'No specific reason provided'}"
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-red-500/10">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Moderator</div>
                <div className="text-xs text-slate-300 font-semibold">{banned_by || 'System'}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Status</div>
                <div className="text-xs text-red-400 font-bold">
                  {isPermanent ? 'PERMANENT' : 'TEMPORARY'}
                </div>
              </div>
            </div>
            
            {!isPermanent && timeRemaining > 0 && (
              <div className="pt-2">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Time Remaining</div>
                <div className="text-xl font-jet font-bold text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.3)]">
                  {formatTime(timeRemaining)}
                </div>
              </div>
            )}
          </div>
        </div>

        {isPermanent ? (
          <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 text-[11px] text-slate-400 leading-relaxed">
            <span className="text-cyan-400 font-bold block mb-1 uppercase tracking-tighter">Appeal Information</span>
            If you believe this action was in error, please contact the channel administrators directly or follow the platform's community guidelines appeal process.
          </div>
        ) : (
          <button
            onClick={onAcknowledge}
            className="w-full py-4 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold text-white transition-all border border-white/10 shadow-lg"
          >
            I Understand
          </button>
        )}
      </div>
    </CustomWarningDialog>
  );
};

export default BanNotification;
