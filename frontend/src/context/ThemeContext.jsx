import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => { } });

const THEME_KEY = 'utube_theme';

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() => {
        try {
            return localStorage.getItem(THEME_KEY) || 'dark';
        } catch {
            return 'dark';
        }
    });

    // Apply theme attribute to <html> so CSS vars cascade globally
    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-theme', theme);

        if (theme === 'light') {
            document.body.style.background = [
                'radial-gradient(ellipse at 25% 0%, rgba(212, 160, 23, 0.12) 0%, transparent 50%)',
                'radial-gradient(circle at 50% 0%, #fff4e0 0%, #faf7f2 100%)'
            ].join(', ');
            document.body.style.color = '#1a1008';
        } else {
            document.body.style.background = [
                'radial-gradient(ellipse at 20% 0%, rgba(212, 160, 23, 0.04) 0%, transparent 50%)',
                'radial-gradient(circle at 50% 0%, #450a0a 0%, #000000 100%)'
            ].join(', ');
            document.body.style.color = '#ffffff';
        }

        try { localStorage.setItem(THEME_KEY, theme); } catch { }
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
