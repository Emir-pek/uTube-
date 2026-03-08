# Timeout & Ban System with Custom Warnings - PRD

---

⚠️ **CRITICAL: READ THIS ENTIRE DOCUMENT BEFORE STARTING IMPLEMENTATION**

This PRD contains critical implementation details that MUST be followed exactly. Skipping sections or implementing "your way" will cause bugs and inconsistencies.

**BOOKMARK THESE SECTIONS - YOU WILL REFERENCE THEM CONSTANTLY:**
- [Section 2: Timeout Enforcement](#2-timeout-enforcement-mechanism) - How to actually prevent typing
- [Section 3: Custom Warning System](#3-custom-warning-dialog-system) - UI components, NOT browser alerts
- [Section 4: Ban Reason Flow](#4-ban-reason-input-flow) - Required before any ban
- [Section 7: Common Mistakes](#7-common-implementation-mistakes-and-how-to-avoid-them) - Read FIRST

---

## Document Overview

### What This Fixes
1. ❌ **BROKEN**: Timeout doesn't prevent typing
2. ❌ **BROKEN**: Using browser `alert()` for warnings
3. ❌ **BROKEN**: Ban messages stay in chat
4. ❌ **MISSING**: No ban reason input from moderator
5. ❌ **MISSING**: Banned user doesn't know why they were banned

### What We're Building
1. ✅ Timeout prevents message sending (input disabled + visual feedback)
2. ✅ Custom warning dialogs matching platform design (#00ffcc cyan theme)
3. ✅ Ban messages auto-delete from chat
4. ✅ Moderator enters ban reason before ban is applied
5. ✅ Banned user sees custom notification with reason

---

## 1. System Architecture Overview

### The Complete Flow (READ THIS CAREFULLY)

```
┌─────────────────────────────────────────────────────────────────┐
│ MODERATOR CLICKS "BAN USER"                                     │
└───────────────┬─────────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Show Ban Reason Dialog (Custom UI)                     │
│ - Moderator MUST enter reason                                   │
│ - Cannot proceed without reason                                 │
│ - Matches platform dark/cyan theme                              │
└───────────────┬─────────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: API Call to Backend                                    │
│ - POST /api/moderation/ban                                      │
│ - Include: userId, reason, duration, channelId                  │
│ - Backend validates permissions                                 │
└───────────────┬─────────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Backend Actions (Server-Side)                          │
│ - Save ban to database                                          │
│ - Add userId to banned_users set (Redis/memory)                 │
│ - Emit WebSocket event: "user.banned"                           │
│ - Delete ban announcement message                               │
└───────────────┬─────────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: All Clients Receive WebSocket Event                    │
│ - Update local banned users list                                │
│ - Remove user's messages from chat (optional)                   │
│ - If current user is banned: Show warning dialog                │
└───────────────┬─────────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Chat Input State Update                                │
│ - Check if current user is banned                               │
│ - If banned: Disable input + show warning                       │
│ - If timeout: Show countdown timer                              │
└─────────────────────────────────────────────────────────────────┘
```

⚠️ **WARNING**: Do NOT implement partial flows. The entire sequence must work together.

---

## 2. Timeout Enforcement Mechanism

⚠️ **CRITICAL SECTION - READ CAREFULLY**

### The Problem
Currently, timeout/ban does NOT prevent users from typing because:
1. Input field stays enabled
2. Message submission isn't blocked
3. No client-side enforcement
4. No server-side validation

### The Solution (Three-Layer Enforcement)

#### Layer 1: Client-Side UI (Immediate Feedback)

**Chat Input Component State**:
```javascript
// ⚠️ CHECK THIS STATE ON EVERY RENDER
const [isBanned, setIsBanned] = useState(false);
const [banInfo, setBanInfo] = useState(null); // { reason, expiresAt, bannedBy }
const [inputDisabled, setInputDisabled] = useState(false);

// ⚠️ THIS MUST RUN WHENEVER USER CHANGES OR BAN STATUS UPDATES
useEffect(() => {
  const checkBanStatus = () => {
    // Check if current user is in banned users list
    const currentUserId = getCurrentUser().id;
    const userBan = activeBans.find(b => b.userId === currentUserId);
    
    if (userBan) {
      setIsBanned(true);
      setBanInfo(userBan);
      setInputDisabled(true);
      
      // ⚠️ MUST SHOW WARNING - DO NOT SKIP THIS
      showBanWarning(userBan);
    } else {
      setIsBanned(false);
      setBanInfo(null);
      setInputDisabled(false);
    }
  };
  
  checkBanStatus();
}, [activeBans, currentUser]);
```

**Input Field**:
```jsx
{/* ⚠️ BOTH disabled AND readOnly ARE REQUIRED */}
<input
  type="text"
  disabled={inputDisabled}
  readOnly={inputDisabled}
  className={`chat-input ${inputDisabled ? 'banned-state' : ''}`}
  placeholder={
    isBanned 
      ? "You are banned from chatting" 
      : inputDisabled 
      ? "You are timed out" 
      : "Type a message..."
  }
/>

{/* ⚠️ SEND BUTTON MUST ALSO BE DISABLED */}
<button 
  disabled={inputDisabled}
  onClick={handleSendMessage}
>
  SEND
</button>
```

**CSS Styling** (Match Platform Theme):
```css
/* ⚠️ USE EXACT COLORS - DO NOT MODIFY */
.chat-input.banned-state {
  background: rgba(239, 68, 68, 0.05) !important; /* Red tint */
  border: 1px solid rgba(239, 68, 68, 0.3) !important;
  color: #9ca3af !important;
  cursor: not-allowed !important;
}

.chat-input.banned-state::placeholder {
  color: #ef4444 !important; /* Red */
  font-weight: 500;
}
```

#### Layer 2: Message Submission Guard

**⚠️ NEVER TRUST CLIENT-SIDE ONLY - ALWAYS VALIDATE**

```javascript
const handleSendMessage = async (message) => {
  // ⚠️ FIRST LINE OF DEFENSE - CHECK BEFORE SENDING
  if (isBanned || inputDisabled) {
    showWarningDialog({
      title: "Cannot Send Message",
      message: banInfo 
        ? `You are banned. Reason: ${banInfo.reason}`
        : "You are timed out from chatting.",
      type: "error"
    });
    return; // ⚠️ STOP EXECUTION HERE
  }
  
  // ⚠️ SECOND CHECK - VALIDATE MESSAGE
  if (!message || message.trim().length === 0) {
    return;
  }
  
  try {
    // Send to server
    const response = await sendMessage(message);
    
    // ⚠️ HANDLE SERVER-SIDE REJECTION
    if (response.error === "USER_BANNED") {
      setIsBanned(true);
      setInputDisabled(true);
      showBanWarning(response.banInfo);
    }
  } catch (error) {
    // ⚠️ ALWAYS HANDLE ERRORS
    if (error.code === 403) {
      showWarningDialog({
        title: "Message Blocked",
        message: "You do not have permission to send messages.",
        type: "error"
      });
    }
  }
};
```

#### Layer 3: Server-Side Validation

**⚠️ THIS IS THE MOST IMPORTANT LAYER - NEVER SKIP**

```python
# Backend message handler
@router.post("/api/chat/message")
async def send_message(
    message: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # ⚠️ CRITICAL: CHECK BAN STATUS FIRST
    active_ban = db.query(Ban).filter(
        Ban.user_id == current_user.id,
        Ban.channel_id == message.channel_id,
        or_(
            Ban.expires_at > datetime.now(),  # Timeout not expired
            Ban.expires_at.is_(None)  # Permanent ban
        )
    ).first()
    
    if active_ban:
        # ⚠️ REJECT MESSAGE - DO NOT SAVE TO DATABASE
        raise HTTPException(
            status_code=403,
            detail={
                "error": "USER_BANNED",
                "banInfo": {
                    "reason": active_ban.reason,
                    "expiresAt": active_ban.expires_at,
                    "bannedBy": active_ban.banned_by
                }
            }
        )
    
    # ⚠️ ONLY PROCEED IF NOT BANNED
    # Save message to database...
```

---

## 3. Custom Warning Dialog System

⚠️ **ABSOLUTELY NO BROWSER ALERTS - ONLY CUSTOM COMPONENTS**

### What NOT to Do
```javascript
// ❌ NEVER DO THIS
alert("You are banned!");
confirm("Are you sure?");
window.alert();
window.confirm();

// ❌ NEVER DO THIS EITHER
console.log("User banned"); // Not enough feedback
```

### What TO Do - Custom Warning Component

**Component: CustomWarningDialog.jsx**

```jsx
import React from 'react';
import { X, AlertCircle, Ban, Clock, Info, CheckCircle } from 'lucide-react';

const CustomWarningDialog = ({ 
  isOpen, 
  onClose, 
  type = 'info', // 'error', 'warning', 'info', 'success'
  title,
  message,
  details, // Additional info
  actions, // Array of { label, onClick, variant }
  autoClose = false,
  duration = 5000
}) => {
  if (!isOpen) return null;
  
  // ⚠️ AUTO-CLOSE LOGIC (FOR NON-CRITICAL WARNINGS)
  React.useEffect(() => {
    if (autoClose && duration) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [autoClose, duration, onClose]);
  
  // ⚠️ ICON AND COLOR BASED ON TYPE
  const config = {
    error: {
      icon: Ban,
      color: '#ef4444', // Red
      bgColor: 'rgba(239, 68, 68, 0.1)',
      borderColor: 'rgba(239, 68, 68, 0.3)'
    },
    warning: {
      icon: AlertCircle,
      color: '#f59e0b', // Orange
      bgColor: 'rgba(245, 158, 11, 0.1)',
      borderColor: 'rgba(245, 158, 11, 0.3)'
    },
    info: {
      icon: Info,
      color: '#00ffcc', // Cyan - Platform accent
      bgColor: 'rgba(0, 255, 204, 0.1)',
      borderColor: 'rgba(0, 255, 204, 0.3)'
    },
    success: {
      icon: CheckCircle,
      color: '#10b981', // Green
      bgColor: 'rgba(16, 185, 129, 0.1)',
      borderColor: 'rgba(16, 185, 129, 0.3)'
    }
  };
  
  const { icon: Icon, color, bgColor, borderColor } = config[type];
  
  return (
    <>
      {/* ⚠️ BACKDROP - MUST BLOCK INTERACTION */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      
      {/* ⚠️ DIALOG - EXACT PLATFORM STYLING */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md px-4">
        <div 
          className="rounded-lg overflow-hidden"
          style={{
            background: 'rgba(10, 10, 15, 0.95)',
            backdropFilter: 'blur(20px)',
            border: `1px solid ${borderColor}`,
            boxShadow: `0 0 40px ${color}33`
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
              <Icon style={{ color }} className="w-6 h-6" />
              <h3 className="font-bold text-lg text-white">{title}</h3>
            </div>
            {/* ⚠️ CLOSE BUTTON REQUIRED */}
            <button 
              onClick={onClose}
              className="hover:bg-white/10 p-2 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          
          {/* Content */}
          <div className="px-6 py-5">
            <p className="text-slate-300 text-sm leading-relaxed">
              {message}
            </p>
            
            {/* ⚠️ DETAILS SECTION (OPTIONAL BUT IMPORTANT) */}
            {details && (
              <div 
                className="mt-4 p-3 rounded-lg text-xs text-slate-400"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.02)',
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    action.variant === 'primary' 
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white'
                      : 'bg-white/5 hover:bg-white/10 text-slate-300'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CustomWarningDialog;
```

**⚠️ STYLING REQUIREMENTS**:
```css
/* These styles MUST be added to your global CSS */
.warning-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  z-index: 9998;
  animation: fadeIn 150ms ease-out;
}

.warning-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9999;
  animation: slideIn 200ms ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideIn {
  from { 
    opacity: 0; 
    transform: translate(-50%, -48%) scale(0.96);
  }
  to { 
    opacity: 1; 
    transform: translate(-50%, -50%) scale(1);
  }
}
```

---

## 4. Ban Reason Input Flow

⚠️ **CRITICAL: MODERATOR MUST PROVIDE REASON BEFORE BAN**

### The Flow (FOLLOW EXACTLY)

```
User clicks "Ban" button
    ↓
Show Ban Reason Dialog (BLOCKING)
    ↓
Moderator enters reason (REQUIRED)
    ↓
Moderator clicks "Confirm Ban"
    ↓
Validate reason (min 3 characters)
    ↓
Send ban request to server
    ↓
Server applies ban + deletes announcement
    ↓
Show success notification to moderator
    ↓
Show ban notification to banned user
```

### Component: BanReasonDialog.jsx

```jsx
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
  
  // ⚠️ VALIDATION BEFORE SUBMISSION
  const handleConfirm = async () => {
    // ⚠️ MINIMUM LENGTH CHECK
    if (reason.trim().length < 3) {
      setError('Reason must be at least 3 characters');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      // ⚠️ PASS REASON TO PARENT
      await onConfirm(reason);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to ban user');
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
      title={`Ban ${targetUser.username}?`}
      message={`You are about to ${
        duration === 'permanent' ? 'permanently ban' : 'timeout'
      } this user. Please provide a reason:`}
    >
      <div className="space-y-4">
        {/* ⚠️ REQUIRED INPUT FIELD */}
        <div>
          <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wider">
            Ban Reason *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Spam, Harassment, Inappropriate content..."
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none"
            rows={3}
            maxLength={200}
            autoFocus // ⚠️ AUTO-FOCUS ON REASON INPUT
          />
          <div className="flex justify-between mt-1">
            {error && (
              <span className="text-xs text-red-400">{error}</span>
            )}
            <span className="text-xs text-slate-500 ml-auto">
              {reason.length}/200
            </span>
          </div>
        </div>
        
        {/* ⚠️ BAN DETAILS */}
        <div className="bg-slate-900/50 rounded-lg p-3 text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-400">User:</span>
            <span className="text-white font-medium">{targetUser.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Duration:</span>
            <span className="text-white font-medium">
              {duration === 'permanent' 
                ? 'Permanent' 
                : formatDuration(duration)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Action:</span>
            <span className="text-red-400 font-medium">
              {duration === 'permanent' ? 'Permanent Ban' : 'Timeout'}
            </span>
          </div>
        </div>
        
        {/* ⚠️ ACTION BUTTONS */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || reason.trim().length < 3}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
          >
            {isSubmitting ? 'Banning...' : 'Confirm Ban'}
          </button>
        </div>
      </div>
    </CustomWarningDialog>
  );
};
```

### Usage in Quick Action Menu

```jsx
// ⚠️ REPLACE DIRECT BAN CALL WITH REASON DIALOG
const [showBanReasonDialog, setShowBanReasonDialog] = useState(false);
const [banDuration, setBanDuration] = useState(null);

const handleBanClick = (duration) => {
  // ⚠️ DON'T BAN IMMEDIATELY - SHOW REASON DIALOG
  setBanDuration(duration);
  setShowBanReasonDialog(true);
};

const handleBanConfirm = async (reason) => {
  // ⚠️ NOW CALL THE ACTUAL BAN API
  await banUser(selectedUser.id, {
    duration: banDuration,
    reason: reason,
    channelId: currentChannel.id
  });
  
  setShowBanReasonDialog(false);
  setSelectedUser(null);
};

// In render:
<>
  {/* Ban buttons */}
  <button onClick={() => handleBanClick('3600')}>
    Ban 1 hour
  </button>
  <button onClick={() => handleBanClick('permanent')}>
    Permanent Ban
  </button>
  
  {/* ⚠️ BAN REASON DIALOG */}
  <BanReasonDialog
    isOpen={showBanReasonDialog}
    onClose={() => setShowBanReasonDialog(false)}
    onConfirm={handleBanConfirm}
    targetUser={selectedUser}
    duration={banDuration}
  />
</>
```

---

## 5. Delete Ban Announcement from Chat

⚠️ **CRITICAL: BAN MESSAGES MUST BE REMOVED**

### The Problem
When someone is banned, a system message appears:
```
[System] Username has been banned for: Spam
```
This message stays in chat → BAD UX.

### The Solution

#### Backend (After Ban is Applied)

```python
@router.post("/api/moderation/ban")
async def ban_user(
    ban_data: BanCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    # ... permission checks ...
    
    # Apply ban
    ban = Ban(
        user_id=ban_data.user_id,
        banned_by=current_user.id,
        reason=ban_data.reason,
        duration=ban_data.duration,
        channel_id=ban_data.channel_id,
        issued_at=datetime.now(),
        expires_at=calculate_expiry(ban_data.duration)
    )
    db.add(ban)
    db.commit()
    
    # ⚠️ CRITICAL: EMIT EVENT WITHOUT MESSAGE
    await websocket_manager.broadcast_to_channel(
        channel_id=ban_data.channel_id,
        event={
            "type": "user.banned",
            "data": {
                "userId": ban_data.user_id,
                "bannedBy": current_user.username,
                "reason": ban_data.reason,
                "expiresAt": ban.expires_at,
                "duration": ban_data.duration
            }
        }
    )
    
    # ⚠️ DO NOT SEND SYSTEM MESSAGE TO CHAT
    # Old code (DELETE THIS):
    # await send_system_message(f"{username} has been banned")
    
    return {"success": True, "ban": ban}
```

#### Frontend (WebSocket Handler)

```javascript
// ⚠️ HANDLE BAN EVENT WITHOUT ADDING MESSAGE
socket.on('user.banned', (data) => {
  const { userId, reason, expiresAt, bannedBy } = data;
  
  // ⚠️ ADD TO BANNED USERS LIST
  setActiveBans(prev => [...prev, {
    userId,
    reason,
    expiresAt,
    bannedBy
  }]);
  
  // ⚠️ IF CURRENT USER IS BANNED, SHOW WARNING
  if (userId === currentUser.id) {
    showBanWarning({
      reason,
      expiresAt,
      bannedBy
    });
  }
  
  // ⚠️ OPTIONALLY: REMOVE ALL MESSAGES FROM BANNED USER
  if (REMOVE_BANNED_USER_MESSAGES) {
    setMessages(prev => prev.filter(msg => msg.userId !== userId));
  }
  
  // ⚠️ DO NOT ADD SYSTEM MESSAGE
  // Old code (DELETE THIS):
  // addSystemMessage(`${username} has been banned`);
});
```

---

## 6. User Ban Notification

⚠️ **BANNED USER MUST SEE WHY THEY WERE BANNED**

### Component: BanNotification.jsx

```jsx
const BanNotification = ({ banInfo, onAcknowledge }) => {
  const { reason, expiresAt, bannedBy, duration } = banInfo;
  const isPermanent = !expiresAt;
  
  // ⚠️ COUNTDOWN TIMER FOR TEMPORARY BANS
  const [timeRemaining, setTimeRemaining] = useState(
    expiresAt ? Math.floor((new Date(expiresAt) - new Date()) / 1000) : 0
  );
  
  useEffect(() => {
    if (!isPermanent && timeRemaining > 0) {
      const interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            // ⚠️ AUTO-UNBAN WHEN TIME EXPIRES
            window.location.reload(); // Or call unban handler
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [isPermanent, timeRemaining]);
  
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };
  
  return (
    <CustomWarningDialog
      isOpen={true}
      onClose={isPermanent ? null : onAcknowledge} // ⚠️ Permanent bans can't be dismissed
      type="error"
      title={isPermanent ? "You Have Been Banned" : "You Have Been Timed Out"}
      message={`You can no longer send messages in this chat.`}
      details={
        <div className="space-y-3">
          {/* ⚠️ SHOW REASON PROMINENTLY */}
          <div>
            <div className="text-xs text-slate-500 uppercase mb-1">Reason:</div>
            <div className="text-sm text-red-400 font-medium">{reason}</div>
          </div>
          
          {/* ⚠️ SHOW WHO BANNED THEM */}
          <div>
            <div className="text-xs text-slate-500 uppercase mb-1">Banned by:</div>
            <div className="text-sm text-slate-300">{bannedBy}</div>
          </div>
          
          {/* ⚠️ SHOW DURATION/COUNTDOWN */}
          <div>
            <div className="text-xs text-slate-500 uppercase mb-1">
              {isPermanent ? 'Duration:' : 'Time Remaining:'}
            </div>
            <div className="text-sm text-slate-300 font-mono">
              {isPermanent ? (
                <span className="text-red-400 font-bold">PERMANENT</span>
              ) : (
                <span className="text-yellow-400">{formatTime(timeRemaining)}</span>
              )}
            </div>
          </div>
          
          {/* ⚠️ APPEAL INFO (OPTIONAL) */}
          {isPermanent && (
            <div className="pt-3 border-t border-slate-700">
              <div className="text-xs text-slate-400">
                If you believe this ban was issued in error, you can{' '}
                <button className="text-cyan-400 hover:text-cyan-300 underline">
                  submit an appeal
                </button>
              </div>
            </div>
          )}
        </div>
      }
      actions={
        isPermanent 
          ? [] // ⚠️ No close button for permanent bans
          : [{
              label: 'I Understand',
              onClick: onAcknowledge,
              variant: 'primary'
            }]
      }
    />
  );
};
```

### When to Show

```javascript
// ⚠️ IN YOUR MAIN CHAT COMPONENT
const [showBanNotification, setShowBanNotification] = useState(false);
const [currentBan, setCurrentBan] = useState(null);

// ⚠️ WEBSOCKET HANDLER
socket.on('user.banned', (data) => {
  if (data.userId === currentUser.id) {
    setCurrentBan(data);
    setShowBanNotification(true);
  }
});

// ⚠️ IN RENDER
{showBanNotification && currentBan && (
  <BanNotification
    banInfo={currentBan}
    onAcknowledge={() => setShowBanNotification(false)}
  />
)}
```

---

## 7. Common Implementation Mistakes and How to Avoid Them

⚠️ **READ THIS SECTION BEFORE STARTING - THEN READ IT AGAIN AFTER YOU THINK YOU'RE DONE**

### Mistake #1: Using Browser Alerts
```javascript
// ❌ WRONG
alert("You are banned!");
confirm("Are you sure?");

// ✅ CORRECT
showCustomWarning({
  title: "You are banned",
  message: "...",
  type: "error"
});
```

**Why it's wrong**: Browser alerts don't match your platform design and can't be styled.

**How to fix**: ⚠️ **GO BACK TO [Section 3](#3-custom-warning-dialog-system)** and implement CustomWarningDialog.

---

### Mistake #2: Client-Side Only Enforcement
```javascript
// ❌ WRONG
const handleSendMessage = () => {
  if (isBanned) return; // Can be bypassed!
  sendMessage();
};

// ✅ CORRECT
const handleSendMessage = () => {
  if (isBanned) return; // Client-side check
  sendMessage(); // Server also checks ban status
};
```

**Why it's wrong**: Users can bypass client-side checks via browser console.

**How to fix**: ⚠️ **GO BACK TO [Section 2, Layer 3](#layer-3-server-side-validation)** and add server validation.

---

### Mistake #3: Forgetting to Disable Input
```javascript
// ❌ WRONG
<input disabled={isBanned} /> // Only disabled, not readOnly

// ✅ CORRECT
<input 
  disabled={isBanned} 
  readOnly={isBanned} 
  className={isBanned ? 'banned-state' : ''}
/>
```

**Why it's wrong**: Some browsers ignore `disabled` in certain cases.

**How to fix**: ⚠️ **GO BACK TO [Section 2, Layer 1](#layer-1-client-side-ui-immediate-feedback)** and add both attributes.

---

### Mistake #4: Not Deleting Ban Messages
```javascript
// ❌ WRONG - System messages stay in chat
socket.on('user.banned', (data) => {
  addSystemMessage(`${data.username} was banned`);
});

// ✅ CORRECT - No message added
socket.on('user.banned', (data) => {
  updateBannedUsersList(data);
  // No system message!
});
```

**Why it's wrong**: Creates clutter and poor UX.

**How to fix**: ⚠️ **GO BACK TO [Section 5](#5-delete-ban-announcement-from-chat)** and remove message emission.

---

### Mistake #5: Skipping Ban Reason
```javascript
// ❌ WRONG - Instant ban
const banUser = (userId, duration) => {
  api.post('/ban', { userId, duration });
};

// ✅ CORRECT - Require reason first
const banUser = (userId, duration) => {
  showBanReasonDialog({
    onConfirm: (reason) => {
      api.post('/ban', { userId, duration, reason });
    }
  });
};
```

**Why it's wrong**: Banned users don't know why, moderators can't track patterns.

**How to fix**: ⚠️ **GO BACK TO [Section 4](#4-ban-reason-input-flow)** and add reason dialog.

---

### Mistake #6: Poor State Synchronization
```javascript
// ❌ WRONG - State not updated
const banUser = async (userId) => {
  await api.post('/ban', { userId });
  // Forgot to update local state!
};

// ✅ CORRECT - Update all state
const banUser = async (userId) => {
  const response = await api.post('/ban', { userId });
  setActiveBans([...activeBans, response.ban]);
  setMessages(messages.filter(m => m.userId !== userId));
  if (userId === currentUser.id) {
    setIsBanned(true);
    setInputDisabled(true);
  }
};
```

**Why it's wrong**: UI doesn't reflect actual ban status.

**How to fix**: ⚠️ **GO BACK TO [Section 2](#2-timeout-enforcement-mechanism)** and check all state updates.

---

### Mistake #7: Not Handling Timeouts
```javascript
// ❌ WRONG - No countdown, no auto-unban
const Timeout = ({ expiresAt }) => {
  return <div>Timed out until {expiresAt}</div>;
};

// ✅ CORRECT - Live countdown and auto-unban
const Timeout = ({ expiresAt }) => {
  const [remaining, setRemaining] = useState(calcRemaining(expiresAt));
  
  useEffect(() => {
    const interval = setInterval(() => {
      const now = calcRemaining(expiresAt);
      setRemaining(now);
      if (now <= 0) {
        clearInterval(interval);
        handleTimeoutExpired();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  
  return <div>Time remaining: {formatTime(remaining)}</div>;
};
```

**Why it's wrong**: Users don't see countdown, timeout doesn't auto-expire.

**How to fix**: ⚠️ **GO BACK TO [Section 6](#6-user-ban-notification)** and check countdown logic.

---

## 8. Testing Checklist

⚠️ **DO NOT SKIP TESTING - CHECK EVERY ITEM**

### Manual Testing Steps

#### Test 1: Timeout Enforcement
- [ ] User gets timed out
- [ ] Input field becomes disabled
- [ ] Input field shows red border
- [ ] Placeholder text changes to "You are timed out"
- [ ] Send button is disabled
- [ ] Trying to send message shows custom warning (NOT browser alert)
- [ ] Timer counts down correctly
- [ ] Input re-enables when timeout expires
- [ ] Server rejects messages from timed-out users

#### Test 2: Ban Reason Flow
- [ ] Click "Ban User" button
- [ ] Custom dialog appears (NOT browser prompt)
- [ ] Dialog matches platform design (dark theme, cyan accents)
- [ ] Reason input is auto-focused
- [ ] Cannot submit with empty reason
- [ ] Cannot submit with reason < 3 characters
- [ ] Character count shows correctly (X/200)
- [ ] Cancel button closes dialog without banning
- [ ] Confirm button is disabled while submitting
- [ ] Success notification appears after ban

#### Test 3: Ban Notification to User
- [ ] Banned user sees custom warning dialog
- [ ] Dialog shows ban reason
- [ ] Dialog shows who banned them
- [ ] Dialog shows duration (permanent or countdown)
- [ ] Countdown updates every second
- [ ] Cannot close dialog (permanent ban)
- [ ] Can close dialog after acknowledging (timeout)
- [ ] Chat input is disabled after seeing notification

#### Test 4: Message Deletion
- [ ] Ban announcement does NOT appear in chat
- [ ] System message is NOT added to database
- [ ] WebSocket event does NOT include message
- [ ] Other users do NOT see ban announcement
- [ ] (Optional) Banned user's previous messages are removed

#### Test 5: Permission Checks
- [ ] Moderators can only timeout ≤10 minutes
- [ ] Moderators cannot ban permanently
- [ ] Broadcasters can ban permanently
- [ ] Users cannot ban themselves
- [ ] Users cannot ban equal/higher tier
- [ ] Server rejects invalid ban requests

#### Test 6: Real-time Updates
- [ ] All clients receive ban event
- [ ] Banned user's input disables on all devices
- [ ] Active bans list updates immediately
- [ ] Moderator panel shows new ban
- [ ] Action log shows ban entry

#### Test 7: Mobile Responsiveness
- [ ] Dialogs render correctly on mobile
- [ ] Touch interactions work
- [ ] Dialogs don't overflow screen
- [ ] Text is readable
- [ ] Buttons are tappable

#### Test 8: Edge Cases
- [ ] Ban user who's already banned (show error)
- [ ] Timeout expires while dialog is open
- [ ] Network failure during ban (show error, revert)
- [ ] Refresh page while banned (ban persists)
- [ ] Multiple moderators ban same user (handle conflict)

---

## 9. Implementation Order (FOLLOW THIS SEQUENCE)

⚠️ **DO NOT SKIP STEPS OR CHANGE ORDER**

### Step 1: Custom Warning Component (Day 1)
1. Create `CustomWarningDialog.jsx`
2. Add to component library
3. Test with dummy data
4. ✅ Checkpoint: Dialog shows correctly with all types (error, warning, info, success)

**Before continuing**: ⚠️ **GO BACK AND VERIFY [Section 3](#3-custom-warning-dialog-system)** is complete.

---

### Step 2: Ban Reason Dialog (Day 1-2)
1. Create `BanReasonDialog.jsx`
2. Add validation logic
3. Integrate with quick action menu
4. ✅ Checkpoint: Can open dialog, enter reason, see validation errors

**Before continuing**: ⚠️ **GO BACK AND VERIFY [Section 4](#4-ban-reason-input-flow)** is complete.

---

### Step 3: Backend Ban API (Day 2)
1. Update ban endpoint to require reason
2. Add server-side validation
3. Remove system message emission
4. Add WebSocket event for bans
5. ✅ Checkpoint: API accepts ban with reason, rejects without reason

**Before continuing**: ⚠️ **GO BACK AND VERIFY [Section 5](#5-delete-ban-announcement-from-chat)** is complete.

---

### Step 4: Input Enforcement (Day 3)
1. Add ban status check to chat component
2. Disable input when banned
3. Add CSS styling for disabled state
4. Add client-side submission guard
5. ✅ Checkpoint: Banned users cannot type or send messages

**Before continuing**: ⚠️ **GO BACK AND VERIFY [Section 2](#2-timeout-enforcement-mechanism)** all layers are implemented.

---

### Step 5: Ban Notification (Day 3-4)
1. Create `BanNotification.jsx`
2. Add countdown timer logic
3. Add WebSocket handler to show notification
4. Test with temporary and permanent bans
5. ✅ Checkpoint: Banned users see notification with reason

**Before continuing**: ⚠️ **GO BACK AND VERIFY [Section 6](#6-user-ban-notification)** is complete.

---

### Step 6: Testing & Bug Fixes (Day 4-5)
1. Run through entire testing checklist
2. Fix any bugs found
3. Test on different browsers
4. Test on mobile devices
5. ✅ Checkpoint: All tests pass

**Before continuing**: ⚠️ **GO BACK AND CHECK [Section 8](#8-testing-checklist)** - every item must be checked.

---

### Step 7: Code Review & Cleanup (Day 5)
1. Remove all `alert()`, `confirm()`, `console.log()`
2. Add error boundaries
3. Add loading states
4. Optimize performance
5. ✅ Checkpoint: Code is clean, no console errors

**Before continuing**: ⚠️ **GO BACK AND CHECK [Section 7](#7-common-implementation-mistakes-and-how-to-avoid-them)** - make sure you didn't make these mistakes.

---

## 10. Final Checklist (Before Deploying)

⚠️ **CHECK EVERY SINGLE ITEM - NO EXCEPTIONS**

### Code Quality
- [ ] No `alert()`, `confirm()`, or `prompt()` anywhere
- [ ] All dialogs use `CustomWarningDialog`
- [ ] All components match platform design (dark theme, #00ffcc cyan)
- [ ] No hardcoded colors (use CSS variables)
- [ ] No console.log statements (use proper logging)
- [ ] All errors are handled gracefully
- [ ] Loading states are shown during API calls

### Functionality
- [ ] Timeout prevents typing (client + server)
- [ ] Ban requires reason (minimum 3 characters)
- [ ] Ban notification shows reason, duration, who banned
- [ ] No ban announcements in chat
- [ ] Countdown timer works and auto-unbans
- [ ] All permission checks work correctly
- [ ] WebSocket events update all clients
- [ ] State synchronizes across components

### UX/UI
- [ ] All dialogs are responsive
- [ ] Touch interactions work on mobile
- [ ] Animations are smooth (no jank)
- [ ] Colors match platform exactly
- [ ] Fonts match platform exactly
- [ ] Spacing/padding matches platform
- [ ] No layout shifts

### Testing
- [ ] All manual tests pass (Section 8)
- [ ] Tested on Chrome, Firefox, Safari
- [ ] Tested on iOS and Android
- [ ] Tested with slow network
- [ ] Tested with network failure
- [ ] Tested edge cases

### Documentation
- [ ] Code is commented
- [ ] API endpoints documented
- [ ] Component props documented
- [ ] README updated

---

## 11. Troubleshooting Guide

⚠️ **IF SOMETHING ISN'T WORKING, CHECK THESE FIRST**

### Issue: Timeout doesn't prevent typing

**Possible causes**:
1. Input not actually disabled
2. Server not checking ban status
3. State not synchronized
4. WebSocket event not received

**How to debug**:
```javascript
console.log('Is banned:', isBanned);
console.log('Input disabled:', inputDisabled);
console.log('Active bans:', activeBans);
console.log('Current user:', currentUser);
```

**Fix**: ⚠️ **GO BACK TO [Section 2](#2-timeout-enforcement-mechanism)** and check all three layers.

---

### Issue: Browser alert still showing

**Possible causes**:
1. Using old code with `alert()`
2. Not using CustomWarningDialog
3. Error handling uses browser prompts

**How to debug**:
Search entire codebase for:
- `alert(`
- `confirm(`
- `prompt(`
- `window.alert`

**Fix**: ⚠️ **GO BACK TO [Section 3](#3-custom-warning-dialog-system)** and replace all browser alerts.

---

### Issue: Ban messages still appearing in chat

**Possible causes**:
1. Backend sending system message
2. WebSocket handler adding message
3. Old code not removed

**How to debug**:
Check backend logs for message emissions.

**Fix**: ⚠️ **GO BACK TO [Section 5](#5-delete-ban-announcement-from-chat)** and remove message creation.

---

### Issue: Ban succeeds without reason

**Possible causes**:
1. Validation not implemented
2. Validation bypassed
3. Server accepts empty reason

**How to debug**:
```javascript
console.log('Ban request:', { userId, duration, reason });
// Reason should never be empty
```

**Fix**: ⚠️ **GO BACK TO [Section 4](#4-ban-reason-input-flow)** and add validation.

---

### Issue: Banned user doesn't see notification

**Possible causes**:
1. WebSocket event not received
2. UserId comparison failing
3. Dialog component not rendered
4. Z-index too low

**How to debug**:
```javascript
socket.on('user.banned', (data) => {
  console.log('Ban event:', data);
  console.log('Current user:', currentUser.id);
  console.log('Match:', data.userId === currentUser.id);
});
```

**Fix**: ⚠️ **GO BACK TO [Section 6](#6-user-ban-notification)** and check event handler.

---

## 12. Quick Reference

### Color Codes (MEMORIZE THESE)
```
Platform Accent: #00ffcc (cyan)
Background Dark: #0a0a0f
Background Light: #1a1a1f
Text Primary: #ffffff
Text Secondary: #9ca3af
Error: #ef4444 (red)
Warning: #f59e0b (orange)
Success: #10b981 (green)
Info: #00ffcc (cyan)
```

### Z-Index Hierarchy
```
Video Player: 10
Chat Panel: 20
Quick Action Menu: 100
Moderation Panel: 100
Warning Dialog Backdrop: 9998
Warning Dialog: 9999
```

### Animation Timings
```
Dialog Open: 200ms
Dialog Close: 150ms
Panel Slide: 250ms
Button Hover: 100ms
Toast Notification: 200ms
```

### Minimum Requirements
```
Ban Reason: 3 characters
Timeout Duration: 60 seconds
Ban Duration: 3600 seconds (1 hour)
Character Limit (Reason): 200
```

---

## Final Notes

⚠️ **THIS PRD IS YOUR BIBLE - REFERENCE IT CONSTANTLY**

### When to Re-Read This Document

1. **Before starting** - Read entire document
2. **Before each component** - Read relevant section
3. **When stuck** - Check troubleshooting guide
4. **Before testing** - Read testing checklist
5. **Before deploying** - Read final checklist
6. **When bugs appear** - Check common mistakes

### Red Flags (Stop and Re-Read)

If you see any of these, **STOP AND GO BACK**:
- Browser alert() appearing
- Ban messages in chat
- Can type while banned
- No ban reason required
- Server accepts bans without validation
- Colors don't match platform
- Using inline styles instead of CSS
- No error handling

### Success Indicators

You're done when:
- ✅ All checkboxes in Section 10 are checked
- ✅ All tests in Section 8 pass
- ✅ No console errors
- ✅ UI matches platform exactly
- ✅ Banned users cannot type
- ✅ All warnings are custom (no browser alerts)
- ✅ Moderators provide reasons for bans
- ✅ Banned users see why they were banned

---

**Document Version**: 1.0  
**Last Updated**: March 8, 2026  
**Status**: Implementation Required  
**Estimated Time**: 5 days  
**Complexity**: Medium-High  

⚠️ **DO NOT SKIP ANY SECTIONS**  
⚠️ **READ WARNINGS CAREFULLY**  
⚠️ **TEST EVERYTHING**  
⚠️ **MATCH THE DESIGN EXACTLY**
