import React, { createContext, useContext, useState, useEffect } from 'react';
import ApiClient from '../utils/ApiClient';

const WatchLaterContext = createContext();

export const WatchLaterProvider = ({ children }) => {
    const [isWatchLaterOpen, setWatchLaterOpen] = useState(false);
    const [watchLaterVideos, setWatchLaterVideos] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchWatchLaterVideos = async () => {
        setLoading(true);
        try {
            const response = await ApiClient.get('/users/watch-later');
            setWatchLaterVideos(Array.isArray(response.data) ? response.data : (response.data?.videos || []));
        } catch (error) {
            console.error("Failed to fetch watch later videos", error);
        } finally {
            setLoading(false);
        }
    };

    // Refetch when drawer opens
    useEffect(() => {
        if (isWatchLaterOpen) {
            fetchWatchLaterVideos();
        }
    }, [isWatchLaterOpen]);

    const value = {
        isWatchLaterOpen,
        setWatchLaterOpen,
        watchLaterVideos,
        setWatchLaterVideos,
        fetchWatchLaterVideos,
        loading
    };

    return (
        <WatchLaterContext.Provider value={value}>
            {children}
        </WatchLaterContext.Provider>
    );
};

export const useWatchLater = () => useContext(WatchLaterContext);
