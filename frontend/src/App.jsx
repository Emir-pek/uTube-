import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import VideoDetail from './pages/VideoDetail'
import Login from './pages/Login'
import Register from './pages/Register'
import Upload from './pages/Upload'
import Profile from './pages/Profile'
import EditProfile from './pages/EditProfile'
import LiveStudio from './pages/LiveStudio'
import WatchPage from './pages/WatchPage';
import Dashboard from './pages/Dashboard';
import ModerationDashboard from './pages/ModerationDashboard';
import BlockedVideos from './pages/BlockedVideos';
import MyChannel from './pages/MyChannel';
import Channel from './pages/Channel';
import { UTUBE_TOKEN } from './utils/authConstants'
import { SidebarProvider, useSidebar } from './context/SidebarContext';

// Utility component to strictly guard routes
const ProtectedRoute = ({ children }) => {
    const isAuthenticated = !!localStorage.getItem(UTUBE_TOKEN);
    return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// Floating Sidebar Trigger
const SidebarHoverTrigger = () => {
    const { handleSidebarEnter } = useSidebar();
    const location = useLocation();

    if (location.pathname !== '/') {
        return null;
    }

    return (
        <div
            onMouseEnter={handleSidebarEnter}
            className="fixed left-0 top-1/2 -translate-y-1/2 w-8 h-24 z-50 flex items-center justify-start cursor-pointer drop-shadow-[2px_0_4px_rgba(0,0,0,0.8)]"
        >
            <div className="w-5 h-14 flex items-center justify-center">
                <svg
                    className="w-6 h-6 text-red-500"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    style={{ transform: 'rotate(90deg)' }}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
                </svg>
            </div>
        </div>
    );
};

// Inner layout that can render sidebar state
const AppLayout = () => {
    const { isSidebarOpen } = useSidebar();
    return (
        <div className="min-h-screen text-white">
            <Toaster
                position="top-center"
                toastOptions={{
                    duration: 3500,
                    style: {
                        background: '#1a1a1a',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: '600',
                    },
                    error: { style: { border: '1px solid rgba(239,68,68,0.3)' } },
                    success: { style: { border: '1px solid rgba(34,197,94,0.3)' } },
                }}
            />
            <Navbar />
            <SidebarHoverTrigger />
            <Sidebar />
            <main>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/video/:id" element={<VideoDetail />} />
                    <Route path="/watch/:username" element={<WatchPage />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />

                    {/* Protected Routes */}
                    <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
                    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                    <Route path="/edit-profile" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
                    <Route path="/live" element={<ProtectedRoute><LiveStudio /></ProtectedRoute>} />
                    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                    <Route path="/dashboard/moderation" element={<ProtectedRoute><ModerationDashboard /></ProtectedRoute>} />
                    <Route path="/blocked" element={<ProtectedRoute><BlockedVideos /></ProtectedRoute>} />
                    <Route path="/my-channel" element={<ProtectedRoute><MyChannel /></ProtectedRoute>} />
                    <Route path="/channel/:id" element={<Channel />} />
                </Routes>
            </main>
        </div>
    );
};

function App() {
    console.log('App: Initializing main layout...');
    return (
        <SidebarProvider>
            <AppLayout />
        </SidebarProvider>
    );
}

export default App
