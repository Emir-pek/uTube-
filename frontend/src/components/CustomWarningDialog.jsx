import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
const XIcon = ({ className, style }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const AlertIcon = ({ className, style }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const BanIcon = ({ className, style }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
  </svg>
);

const ClockIcon = ({ className, style }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const InfoIcon = ({ className, style }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CheckIcon = ({ className, style }) => (
  <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const CustomWarningDialog = ({ 
  isOpen, 
  onClose, 
  type = 'info', // 'error', 'warning', 'info', 'success'
  title,
  message,
  details, // Additional info (ReactNode)
  actions, // Array of { label, onClick, variant }
  autoClose = false,
  duration = 5000,
  children // To allow custom content like forms
}) => {
  // AUTO-CLOSE LOGIC (FOR NON-CRITICAL WARNINGS)
  React.useEffect(() => {
    if (isOpen && autoClose && duration) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoClose, duration, onClose]);
  
  // ICON AND COLOR BASED ON TYPE
  const config = {
    error: {
      icon: BanIcon,
      color: '#ef4444', // Red
      bgColor: 'rgba(239, 68, 68, 0.1)',
      borderColor: 'rgba(239, 68, 68, 0.3)',
      shadow: '0 0 30px rgba(239, 68, 68, 0.2)'
    },
    warning: {
      icon: AlertIcon,
      color: '#f59e0b', // Orange
      bgColor: 'rgba(245, 158, 11, 0.1)',
      borderColor: 'rgba(245, 158, 11, 0.3)',
      shadow: '0 0 30px rgba(245, 158, 11, 0.2)'
    },
    info: {
      icon: InfoIcon,
      color: '#00ffcc', // Cyan - Platform accent
      bgColor: 'rgba(0, 255, 204, 0.1)',
      borderColor: 'rgba(0, 255, 204, 0.3)',
      shadow: '0 0 30px rgba(0, 255, 204, 0.2)'
    },
    success: {
      icon: CheckIcon,
      color: '#10b981', // Green
      bgColor: 'rgba(16, 185, 129, 0.1)',
      borderColor: 'rgba(16, 185, 129, 0.3)',
      shadow: '0 0 30px rgba(16, 185, 129, 0.2)'
    }
  };
  
  const { icon: Icon, color, bgColor, borderColor, shadow } = config[type] || config.info;
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* BACKDROP - MUST BLOCK INTERACTION */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9998]"
            onClick={onClose}
          />
          
          {/* DIALOG - EXACT PLATFORM STYLING */}
          <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 pointer-events-none">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="w-full max-w-md pointer-events-auto"
            >
              <div 
                className="rounded-2xl overflow-hidden shadow-2xl"
                style={{
                  background: 'rgba(10, 10, 15, 0.95)',
                  backdropFilter: 'blur(20px)',
                  border: `1px solid ${borderColor}`,
                  boxShadow: shadow
                }}
              >
                {/* Header */}
                <div 
                  className="px-6 py-4 border-b flex items-center justify-between"
                  style={{ 
                    borderColor: 'rgba(255, 255, 255, 0.05)',
                    background: bgColor
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-black/20">
                      <Icon style={{ color }} className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-lg text-white font-jet tracking-tight">{title}</h3>
                  </div>
                  <button 
                    onClick={onClose}
                    className="hover:bg-white/10 p-2 rounded-lg transition-colors group"
                  >
                    <XIcon className="w-5 h-5 text-slate-400 group-hover:text-white" />
                  </button>
                </div>
                
                {/* Content */}
                <div className="px-6 py-6 overflow-y-auto max-h-[70vh]">
                  {message && (
                    <p className="text-slate-300 text-sm leading-relaxed mb-4">
                      {message}
                    </p>
                  )}
                  
                  {children}
                  
                  {details && (
                    <div 
                      className="mt-4 p-4 rounded-xl text-xs text-slate-400 font-jet"
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      {details}
                    </div>
                  )}
                </div>
                
                {/* Actions */}
                {actions && actions.length > 0 && (
                  <div className="px-6 py-4 border-t flex gap-3 justify-end"
                    style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}
                  >
                    {actions.map((action, index) => (
                      <button
                        key={index}
                        onClick={action.onClick}
                        className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                          action.variant === 'primary' 
                            ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20'
                            : (action.variant === 'danger'
                                ? 'bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/30 transition-all'
                                : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10'
                              )
                        }`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CustomWarningDialog;
