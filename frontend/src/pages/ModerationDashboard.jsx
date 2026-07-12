import React, { useState, useEffect } from 'react';
import ApiClient from '../utils/ApiClient';
import { toast } from 'react-hot-toast';

const ModerationDashboard = () => {
    const [activeTab, setActiveTab] = useState('bans');
    const [bans, setBans] = useState([]);
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const currentUser = JSON.parse(localStorage.getItem('user') || 'null');

    useEffect(() => {
        if (!currentUser) return;
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            if (activeTab === 'bans') {
                const res = await ApiClient.get('/api/moderation/bans/active');
                setBans(res.data);
            } else {
                const res = await ApiClient.get('/api/moderation/actions');
                setLogs(res.data);
            }
        } catch (error) {
            toast.error("Failed to fetch moderation data");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUnban = async (username) => {
        try {
            await ApiClient.post('/api/moderation/unban', { username });
            toast.success(`Unbanned ${username}`);
            fetchData();
        } catch (error) {
            toast.error("Failed to unban user");
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto min-h-screen">
            <header className="mb-10">
                <h1 className="text-4xl font-black text-white tracking-tighter flex items-center gap-4">
                    <span className="text-[#00ffcc] drop-shadow-[0_0_15px_#00ffcc]">🛡️</span>
                    MODERATION CENTRAL
                </h1>
                <p className="text-zinc-500 mt-2 font-medium tracking-wide">Secure our platform. Enforce the tiers.</p>
            </header>

            <div className="flex gap-4 mb-8">
                <button 
                    onClick={() => setActiveTab('bans')}
                    className={`px-8 py-3 rounded-xl font-bold transition-all ${activeTab === 'bans' ? 'bg-[#00ffcc] text-black shadow-[0_0_20px_rgba(0,255,204,0.3)]' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}
                >
                    ACTIVE BANS
                </button>
                <button 
                    onClick={() => setActiveTab('logs')}
                    className={`px-8 py-3 rounded-xl font-bold transition-all ${activeTab === 'logs' ? 'bg-[#00ffcc] text-black shadow-[0_0_20px_rgba(0,255,204,0.3)]' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}
                >
                    ACTION LOGS
                </button>
            </div>

            <div className="bg-zinc-950/50 border border-zinc-900 rounded-3xl overflow-hidden backdrop-blur-xl">
                {isLoading ? (
                    <div className="p-20 text-center">
                        <div className="inline-block w-8 h-8 border-4 border-[#00ffcc] border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : activeTab === 'bans' ? (
                    <table className="w-full text-left">
                        <thead className="bg-white/[0.02] border-b border-zinc-900">
                            <tr>
                                <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">User</th>
                                <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Reason</th>
                                <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Banned By</th>
                                <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900">
                            {bans.length === 0 ? (
                                <tr><td colSpan="4" className="p-10 text-center text-zinc-600 font-medium italic">No active bans found.</td></tr>
                            ) : (
                                bans.map(ban => (
                                    <tr key={ban.username} className="hover:bg-white/[0.01] transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="text-white font-bold">{ban.username}</span>
                                        </td>
                                        <td className="px-6 py-4 text-zinc-400 text-sm">{ban.reason || 'No reason provided'}</td>
                                        <td className="px-6 py-4 text-zinc-400 text-sm">{ban.banned_by}</td>
                                        <td className="px-6 py-4">
                                            <button 
                                                onClick={() => handleUnban(ban.username)}
                                                className="px-4 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg text-xs font-bold hover:bg-red-500/20 transition-all"
                                            >
                                                UNBAN
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-white/[0.02] border-b border-zinc-900">
                            <tr>
                                <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Action</th>
                                <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Target</th>
                                <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Moderator</th>
                                <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900">
                            {logs.length === 0 ? (
                                <tr><td colSpan="4" className="p-10 text-center text-zinc-600 font-medium italic">No logs found.</td></tr>
                            ) : (
                                logs.map(log => (
                                    <tr key={log.id} className="hover:bg-white/[0.01] transition-colors">
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${
                                                log.action_type === 'ban' ? 'bg-red-500/10 text-red-500' : 
                                                log.action_type === 'timeout' ? 'bg-orange-500/10 text-orange-500' : 'bg-[#00ffcc]/10 text-[#00ffcc]'
                                            }`}>
                                                {log.action_type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-white font-bold">{log.target_username}</td>
                                        <td className="px-6 py-4 text-zinc-400 text-sm">{log.performed_by_username}</td>
                                        <td className="px-6 py-4 text-zinc-500 text-xs font-mono">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default ModerationDashboard;
