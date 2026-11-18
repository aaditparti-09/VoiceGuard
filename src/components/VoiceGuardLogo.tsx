interface VoiceGuardLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  subtitle?: string;
}

export function VoiceGuardLogo({ size = 'md', showText = true, subtitle }: VoiceGuardLogoProps) {
  const boxSize = size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'lg' ? 'w-10 h-10 rounded-xl' : 'w-9 h-9 rounded-lg';
  const iconDim = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';
  const textSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base';

  return (
    <div className="inline-flex items-center gap-2.5 shrink-0 select-none text-left">
      <div
        className={`${boxSize} border border-cyan-500/40 bg-cyan-500/10 flex items-center justify-center shrink-0`}
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={iconDim}
          aria-hidden="true"
        >
          <path
            d="M16 3.5L6 7.8V15.8C6 22.1 10.28 27.8 16 29.5C21.72 27.8 26 22.1 26 15.8V7.8L16 3.5Z"
            stroke="#22D3EE"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
          <path
            d="M11.5 16H13L14.5 12.5L16.5 19.5L18.2 14.2L19.5 16H20.8"
            stroke="#67E8F9"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {showText && (
        <div className="min-w-0">
          <span className={`block font-display font-bold tracking-tight text-white whitespace-nowrap leading-tight ${textSize}`}>
            VOICEGUARD AI
          </span>
          {subtitle && (
            <span className="block text-[10.5px] text-slate-400 whitespace-nowrap leading-tight mt-0.5">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
