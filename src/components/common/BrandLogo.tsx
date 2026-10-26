import type { FC } from "react";

export type BrandLogoVariant = "mark" | "horizontal" | "glyph";
export type BrandLogoSize = "sm" | "md" | "lg" | "xl" | number;

export interface BrandLogoProps {
  readonly variant?: BrandLogoVariant;
  readonly size?: BrandLogoSize;
  readonly showTagline?: boolean;
  readonly pulse?: boolean;
  readonly className?: string;
}

const SIZE_MAP: Record<"sm" | "md" | "lg" | "xl", number> = {
  sm: 24,
  md: 32,
  lg: 44,
  xl: 64,
};

/**
 * BrandLogo — Official vector brand mark & typography lockup for Haze SSH.
 * Implements the official warm Ember brand aesthetic (Folded 'H' with terminal chevron).
 */
export const BrandLogo: FC<BrandLogoProps> = ({
  variant = "mark",
  size = "md",
  showTagline = true,
  pulse = false,
  className = "",
}) => {
  const pixelSize = typeof size === "number" ? size : SIZE_MAP[size] || 32;

  // Glyph only (unbounded)
  if (variant === "glyph") {
    return (
      <svg
        viewBox="260 240 504 530"
        width={pixelSize}
        height={pixelSize}
        fill="none"
        role="img"
        aria-label="Haze SSH Glyph"
        className={`shrink-0 ${pulse ? "animate-pulse" : ""} ${className}`}
      >
        <defs>
          <linearGradient id="glyphSymbolGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFE1AC" />
            <stop offset="100%" stopColor="#FF825D" />
          </linearGradient>
        </defs>

        <path
          d="M290 713V310C290 292 304 278 322 278H342C360 278 374 292 374 310V462H650V310C650 292 664 278 682 278H704C722 278 736 292 736 310V713C736 731 722 745 704 745H682C664 745 650 731 650 713V560H374V713C374 731 360 745 342 745H322C304 745 290 731 290 713Z"
          fill="url(#glyphSymbolGrad)"
        />
        <path
          d="M511 462L558 511L511 560"
          fill="none"
          stroke="#2F222B"
          strokeWidth="45"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // Standalone Squircle Mark
  const markElement = (
    <svg
      viewBox="0 0 1024 1024"
      width={pixelSize}
      height={pixelSize}
      fill="none"
      role="img"
      aria-label="Haze SSH Mark"
      className={`shrink-0 transition-transform duration-200 select-none ${
        pulse ? "animate-pulse" : ""
      }`}
    >
      <defs>
        <linearGradient id="markBackground" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#382630" />
          <stop offset="100%" stopColor="#181922" />
        </linearGradient>
        <linearGradient id="markSymbol" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE1AC" />
          <stop offset="100%" stopColor="#FF825D" />
        </linearGradient>
        <radialGradient id="markAura" cx=".36" cy=".26" r=".84">
          <stop offset="0%" stopColor="#F17766" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#F17766" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Rounded Squircle Container */}
      <rect x="48" y="48" width="928" height="928" rx="228" fill="url(#markBackground)" />
      <rect x="48" y="48" width="928" height="928" rx="228" fill="url(#markAura)" />
      <rect
        x="49.5"
        y="49.5"
        width="925"
        height="925"
        rx="226.5"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.08"
        strokeWidth="3"
      />

      {/* Folded 'H' Symbol */}
      <path
        d="M290 713V310C290 292 304 278 322 278H342C360 278 374 292 374 310V462H650V310C650 292 664 278 682 278H704C722 278 736 292 736 310V713C736 731 722 745 704 745H682C664 745 650 731 650 713V560H374V713C374 731 360 745 342 745H322C304 745 290 731 290 713Z"
        fill="url(#markSymbol)"
      />

      {/* Terminal Chevron */}
      <path
        d="M511 462L558 511L511 560"
        fill="none"
        stroke="#2F222B"
        strokeWidth="45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (variant === "mark") {
    return <div className={`inline-flex items-center justify-center ${className}`}>{markElement}</div>;
  }

  // Horizontal Lockup (Icon + Typography)
  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {markElement}
      <div className="flex flex-col">
        <div className="flex items-center gap-1 leading-none">
          <span className="font-extrabold tracking-tight text-base font-sans text-base-content">
            Haze
          </span>
          <span className="font-extrabold tracking-tight text-base bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400 bg-clip-text text-transparent">
            SSH
          </span>
        </div>
        {showTagline && (
          <span className="text-[9px] uppercase tracking-widest font-mono font-semibold text-orange-400/80 mt-1">
            Privacy-First
          </span>
        )}
      </div>
    </div>
  );
};
