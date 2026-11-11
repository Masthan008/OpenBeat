import { useEffect, useState } from 'react';
import { LogoMark } from '@/components/icons/LogoMark';

interface OpeningAnimationProps {
  onComplete?: () => void;
  minDurationMs?: number;
}

export function OpeningAnimation({ onComplete, minDurationMs = 1800 }: OpeningAnimationProps) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return !sessionStorage.getItem('openblast_splash_seen');
    } catch {
      return true;
    }
  });

  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!visible) {
      if (onComplete) onComplete();
      return;
    }

    try {
      sessionStorage.setItem('openblast_splash_seen', 'true');
    } catch {}

    const timer = setTimeout(() => {
      setFading(true);
      const removeTimer = setTimeout(() => {
        setVisible(false);
        if (onComplete) onComplete();
      }, 500);
      return () => clearTimeout(removeTimer);
    }, minDurationMs);

    return () => clearTimeout(timer);
  }, [visible, minDurationMs, onComplete]);

  const handleDismiss = () => {
    if (fading) return;
    setFading(true);
    setTimeout(() => {
      setVisible(false);
      if (onComplete) onComplete();
    }, 300);
  };

  if (!visible) return null;

  return (
    <div
      onClick={handleDismiss}
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#090a0f] text-white select-none cursor-pointer overflow-hidden transition-all duration-500 ease-out ${
        fading ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
      aria-label="OpenBlast Loading"
    >
      {/* Ambient background glows */}
      <div className="absolute w-[450px] h-[450px] rounded-full bg-gradient-to-tr from-rose-600/20 via-orange-500/15 to-amber-400/10 blur-[100px] animate-pulse pointer-events-none" />
      <div className="absolute w-[300px] h-[300px] rounded-full bg-red-600/15 blur-[80px] pointer-events-none" />

      {/* Radiant concentric sound rings */}
      <div className="relative flex items-center justify-center">
        <div className="absolute w-36 h-36 rounded-full border border-rose-500/20 animate-ping [animation-duration:2.5s]" />
        <div className="absolute w-48 h-48 rounded-full border border-orange-500/15 animate-ping [animation-duration:3s]" />
        <div className="absolute w-60 h-60 rounded-full border border-amber-500/10 animate-ping [animation-duration:3.5s]" />

        {/* Logo Badge Container with Glass Effect */}
        <div className="relative z-10 flex items-center justify-center w-24 h-24 rounded-3xl bg-white/[0.04] border border-white/10 shadow-[0_0_50px_rgba(244,63,94,0.25)] backdrop-blur-xl transition-transform duration-300 hover:scale-105">
          <LogoMark size={52} className="text-white drop-shadow-[0_2px_12px_rgba(255,255,255,0.4)]" />
        </div>
      </div>

      {/* Typography: Brand Title & Animated Spectrum */}
      <div className="mt-8 flex flex-col items-center gap-3 z-10 text-center px-4">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-wider bg-gradient-to-r from-white via-rose-100 to-orange-200 bg-clip-text text-transparent">
          OPEN<span className="text-rose-500">BLAST</span>
        </h1>

        {/* Equalizer Sound Bars */}
        <div className="flex items-end gap-1.5 h-4 my-1">
          <span className="w-1 bg-rose-500 rounded-full animate-[bounce_1s_infinite_100ms] h-2" />
          <span className="w-1 bg-rose-400 rounded-full animate-[bounce_1s_infinite_300ms] h-4" />
          <span className="w-1 bg-orange-400 rounded-full animate-[bounce_1s_infinite_200ms] h-3" />
          <span className="w-1 bg-amber-400 rounded-full animate-[bounce_1s_infinite_400ms] h-3.5" />
          <span className="w-1 bg-rose-500 rounded-full animate-[bounce_1s_infinite_250ms] h-2.5" />
        </div>

        <p className="text-xs sm:text-sm font-medium tracking-wide text-zinc-400">
          Pure High-Fidelity Music · Zero Ads
        </p>
      </div>

      {/* Subtle Progress Bar */}
      <div className="absolute bottom-12 w-36 h-1 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400 rounded-full animate-[progress_1.6s_ease-in-out_forwards]" />
      </div>

      {/* Quick Skip Hint */}
      <span className="absolute bottom-5 text-[11px] font-mono text-zinc-500 tracking-wider">
        Click anywhere to skip
      </span>
    </div>
  );
}
