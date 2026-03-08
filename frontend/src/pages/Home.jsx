import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import ApiClient from '../utils/ApiClient';
import HeroSection from '../components/HeroSection';
import VideoGrid, { getBlockedChannels, getBlockedVideosData } from '../components/VideoGrid';

import CategoryBar from '../components/CategoryBar';
import ChannelSearchCard from '../components/ChannelSearchCard';

const Home = () => {
    const [videos, setVideos] = useState([]);
    const [channels, setChannels] = useState([]);
    const [trendingVideos, setTrendingVideos] = useState([]);
    const [liveStreams, setLiveStreams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState("All");
    const [heroOpacity, setHeroOpacity] = useState(1);
    const [blockedChannels, setBlockedChannels] = useState(() => new Set(getBlockedChannels()));
    const [blockedVideos, setBlockedVideos] = useState(() => getBlockedVideosData());
    const [searchParams] = useSearchParams();
    const searchQuery = searchParams.get('search') || '';

    useEffect(() => {
        const fetchVideos = async () => {
            setLoading(true);
            try {
                let response;
                let liveResponse;

                if (searchQuery) {
                    response = await ApiClient.get('/videos/semantic-search', {
                        params: { query: searchQuery }
                    });
                    setVideos(response.data.videos || []);
                    setChannels(response.data.channels || []);
                } else {
                    let trendingResponse;
                    [response, liveResponse, trendingResponse] = await Promise.all([
                        ApiClient.get('/videos/'),
                        ApiClient.get('/auth/active-live-streams'),
                        ApiClient.get('/videos/trending', { params: { limit: 5 } })
                    ]);

                    setVideos(response.data);
                    setLiveStreams(liveResponse.data);
                    setTrendingVideos(trendingResponse.data);
                }
            } catch (error) {
                console.error('Failed to fetch videos/streams:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchVideos();

        const handleBlock = () => {
            setBlockedChannels(new Set(getBlockedChannels()));
            setBlockedVideos(getBlockedVideosData());
        };
        window.addEventListener('utube_channel_blocked', handleBlock);
        window.addEventListener('utube_video_blocked', handleBlock);
        return () => {
            window.removeEventListener('utube_channel_blocked', handleBlock);
            window.removeEventListener('utube_video_blocked', handleBlock);
        };
    }, [searchQuery]);

    // Scroll-driven fade for Hero section
    useEffect(() => {
        if (searchQuery) return;

        let ticking = false;
        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(() => {
                const raw = 1 - Math.min(window.scrollY / 400, 1);
                const rounded = Math.round(raw * 100) / 100;
                setHeroOpacity(prev => (prev !== rounded ? rounded : prev));
                ticking = false;
            });
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [searchQuery]);

    // Apply global channel and video block filters first
    const visibleVideos = React.useMemo(() => videos.filter(v =>
        !blockedChannels.has(v.author?.id) &&
        !blockedVideos.some(bv => bv.id === v.id)
    ), [videos, blockedChannels, blockedVideos]);

    const visibleLiveStreams = React.useMemo(() => liveStreams.filter(stream =>
        !blockedChannels.has(stream.id) &&
        !blockedVideos.some(bv => bv.id === stream.id)
    ), [liveStreams, blockedChannels, blockedVideos]);

    const visibleTrendingVideos = React.useMemo(() => trendingVideos.filter(v =>
        !blockedChannels.has(v.author?.id) &&
        !blockedVideos.some(bv => bv.id === v.id)
    ), [trendingVideos, blockedChannels, blockedVideos]);

    const visibleChannels = React.useMemo(() => channels.filter(c => !blockedChannels.has(c.id)), [channels, blockedChannels]);

    const filteredVideos = React.useMemo(() => (
        selectedCategory === "All"
            ? visibleVideos
            : visibleVideos.filter(video => video.category === selectedCategory)
    ), [selectedCategory, visibleVideos]);

    return (
        <div className="min-h-screen pt-16 sm:pt-20">
            {!searchQuery && (
                <div
                    style={{
                        opacity: heroOpacity,
                        pointerEvents: heroOpacity === 0 ? 'none' : 'auto',
                    }}
                >
                    <CategoryBar
                        selectedCategory={selectedCategory}
                        onSelectCategory={setSelectedCategory}
                    />

                    {selectedCategory === "All" && visibleTrendingVideos.length > 0 && (
                        <div className="pt-2">
                            <HeroSection videos={visibleTrendingVideos} />
                        </div>
                    )}
                </div>
            )}

            <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1800px] mx-auto">
                <h2 className="text-lg md:text-xl font-bold mb-4 tracking-tight flex items-center gap-2">
                    {searchQuery ? (
                        <>Search results for <span className="text-primary break-words max-w-full">"{searchQuery}"</span></>
                    ) : selectedCategory === "All" ? (
                        "Recommended for you"
                    ) : (
                        `${selectedCategory} Videos`
                    )}
                </h2>

                {/* Live Streams Section */}
                {!searchQuery && selectedCategory === "All" && visibleLiveStreams.length > 0 && (
                    <div className="mb-8">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                            <h3 className="text-xl font-bold">Live Now</h3>
                        </div>
                        <div className="flex overflow-x-auto pb-4 gap-4 snap-x no-scrollbar">
                            {visibleLiveStreams.map(stream => (
                                <Link
                                    key={stream.id}
                                    to={`/watch/${encodeURIComponent(stream.username)}`}
                                    className="snap-start shrink-0 w-72 md:w-80 group"
                                >
                                    <div className="relative aspect-video rounded-xl overflow-hidden mb-3 bg-white/5 ring-1 ring-white/10">
                                        <img
                                            src={stream.profile_image ? (import.meta.env.VITE_MEDIA_BASE_URL + '/uploads/avatars/' + stream.profile_image) : 'https://ui-avatars.com/api/?name=' + stream.username}
                                            alt={stream.stream_title || `${stream.username}'s Stream`}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-60"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                                        <div className="absolute top-2 left-2 flex items-center gap-2">
                                            <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shadow-lg">Live</span>
                                            {stream.viewer_count > 0 && (
                                                <span className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                    {stream.viewer_count}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-3 pr-4">
                                        <div className="w-10 h-10 rounded-full bg-white/10 shrink-0 overflow-hidden outline outline-2 outline-offset-2 outline-red-500/50">
                                            <img
                                                src={stream.profile_image ? (import.meta.env.VITE_MEDIA_BASE_URL + '/uploads/avatars/' + stream.profile_image) : 'https://ui-avatars.com/api/?name=' + stream.username}
                                                alt={stream.username}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-white/90 text-sm line-clamp-2 leading-tight group-hover:text-white transition-colors">
                                                {stream.stream_title || `${stream.username} is Live!`}
                                            </h3>
                                            <p className="text-white/50 text-xs mt-1 truncate hover:text-white/80">{stream.username}</p>
                                            <p className="text-white/40 text-[11px] mt-0.5">{stream.stream_category || 'Just Chatting'}</p>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {filteredVideos.length === 0 && visibleChannels.length === 0 && !loading ? (
                    <div className="py-20 text-center text-white/50 w-full col-span-full">
                        <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <p className="text-lg font-bold">No results found</p>
                        <p className="text-sm mt-1">Try adjusting your search terms</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        {searchQuery && visibleChannels.length > 0 && (
                            <div className="flex flex-col gap-4 mb-4">
                                {visibleChannels.map(channel => (
                                    <ChannelSearchCard key={channel.id} channel={channel} />
                                ))}
                            </div>
                        )}
                        {searchQuery && visibleChannels.length > 0 && filteredVideos.length > 0 && (
                            <hr className="my-6 border-gray-700" />
                        )}
                        {filteredVideos.length > 0 && (
                            <VideoGrid videos={filteredVideos} loading={loading} isListLayout={!!searchQuery} />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Home;
