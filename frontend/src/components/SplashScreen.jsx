import React, { useEffect, useState } from 'react';
import '../SplashStyles.css';

const SplashScreen = ({ onComplete }) => {
    const [isFadingOut, setIsFadingOut] = useState(false);

    useEffect(() => {
        // Star fade out sequence slightly before unmounting
        const fadeTimer = setTimeout(() => {
            setIsFadingOut(true);
        }, 5000); // 5 seconds of animation

        // Unmount the component and return to normal app
        const unmountTimer = setTimeout(() => {
            if (onComplete) onComplete();
        }, 6000); // giving 1 second for the fade out

        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(unmountTimer);
        };
    }, [onComplete]);

    const letters = ['A', 'M', 'O', 'R', 'I'];

    return (
        <div className={`splash-container ${isFadingOut ? 'fade-out-splash' : ''}`}>
            <div className="bookshelf">
                {letters.map((letter, index) => (
                    <div key={index} className="book-wrapper">
                        <div className="book-spine"></div>
                        <div className="book-pages">
                            <span className="book-letter">{letter}</span>
                        </div>
                        <div className="book-cover"></div>
                    </div>
                ))}
            </div>
            <div className="welcome-text">Iniciando experiencia</div>
        </div>
    );
};

export default SplashScreen;
