import React, { useEffect, useRef } from 'react';
import flvjs from 'flv.js';

const FlvPlayer = ({ streamKey }) => {
    const videoRef = useRef(null);
    const flvPlayerRef = useRef(null);

    useEffect(() => {
        if (!streamKey || !videoRef.current) return;
        
        console.log("[FLV PLAYER] Mounting new instance for stream:", streamKey);
        const flvPlayer = flvjs.createPlayer({
            type: 'flv',
            isLive: true,
            url: `http://localhost:8080/live/${streamKey}.flv`,
            cors: true,
            hasAudio: true,
            hasVideo: true,
            stashInitialSize: 384,
            enableStashBuffer: true,
            lazyLoad: false
        });

        flvPlayerRef.current = flvPlayer;

        // SAFE CATCH-UP LOGIC: Hard reload on tab wake if drift > 2s to flush throttled MSE buffer
        const handleVisibilityChange = () => {
            if (!document.hidden && flvPlayerRef.current && videoRef.current) {
                const video = videoRef.current;
                const buffered = video.buffered;
                if (buffered.length > 0) {
                    const end = buffered.end(buffered.length - 1);
                    const drift = end - video.currentTime;
                    
                    if (drift > 2) {
                        console.log(`[FLV PLAYER] Tab active. Drift detected (${drift.toFixed(2)}s). Reloading live edge...`);
                        try {
                            flvPlayerRef.current.pause();
                            flvPlayerRef.current.unload(); 
                            flvPlayerRef.current.load();   
                            flvPlayerRef.current.play().catch(e => console.warn("[FLV PLAYER] Autoplay blocked on wake", e));
                        } catch (err) {
                            console.error("[FLV PLAYER] Error recovering from background state:", err);
                        }
                    } else {
                        console.log(`[FLV PLAYER] Tab active. Drift within limits (${drift.toFixed(2)}s). No reload needed.`);
                    }
                }
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        flvPlayer.attachMediaElement(videoRef.current);
        flvPlayer.load();
        flvPlayer.play().catch(e => console.warn("[FLV PLAYER] Autoplay blocked", e));

        return () => {
            console.log("[FLV PLAYER] Unmounting instance");
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            const player = flvPlayerRef.current;
            if (player) {
                try {
                    player.pause();
                    player.unload();
                    player.detachMediaElement();
                    player.destroy();
                } catch (e) {
                    console.error("[FLV PLAYER] Cleanup error", e);
                }
                flvPlayerRef.current = null;
            }
        };
    }, [streamKey]);

    return (
        <video 
            ref={videoRef} 
            muted={true} 
            autoPlay={true} 
            playsInline={true} 
            controls={false} 
            disablePictureInPicture={true}
            preload="auto"
            className="w-full h-full object-cover bg-black" 
        />
    );
};

export default FlvPlayer;
