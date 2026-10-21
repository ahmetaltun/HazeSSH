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
 * Implements the Minimalist Monoline Nexus ('H') aesthetic with Violet / Cyan / Magenta accents.
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
        viewBox="0 0 64 64"
        width={pixelSize}
        height={pixelSize}
        fill="none"
        role="img"
        aria-label="Haze SSH Glyph"
        className={`shrink-0 ${pulse ? "animate-pulse" : ""} ${className}`}
      >
        <defs>
          <linearGradient id="glyphGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#BD93F9" />
            <stop offset="50%" stop-color="#FF79C6" />
            <stop offset="100%" stop-color="#00F0FF" />
          </linearGradient>
        </defs>

        <rect x="14" y="14" width="6" height="36" rx="3" fill="url(#glyphGrad)" />
        <rect x="44" y="14" width="6" height="36" rx="3" fill="url(#glyphGrad)" />
        <path
          d="M 20 25 L 30 32 L 20 39"
          stroke="url(#glyphGrad)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M 30 32 L 44 32" stroke="#FF79C6" strokeWidth="5" strokeLinecap="round" />
        <path d="M 33 39 L 41 39" stroke="#00F0FF" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="30" cy="32" r="2" fill="#FFFFFF" />
      </svg>
    );
  }

  // Standalone Squircle Mark
  const markElement = (
    <svg
      viewBox="0 0 64 64"
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
        <linearGradient id="markBrandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#BD93F9" />
          <stop offset="45%" stopColor="#FF79C6" />
          <stop offset="100%" stopColor="#00F0FF" />
        </linearGradient>
        <linearGradient id="markBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#BD93F9" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#00F0FF" stopOpacity="0.6" />
        </linearGradient>
      </defs>

      {/* Rounded Squircle Container */}
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="15"
        fill="#0E111A"
        stroke="url(#markBorderGrad)"
        strokeWidth="1.5"
      />

      {/* Left Pillar (Local Terminal Client) */}
      <rect x="15" y="15" width="5.5" height="34" rx="2.75" fill="url(#markBrandGrad)" />

      {/* Right Pillar (Remote Host / Hardware) */}
      <rect x="43.5" y="15" width="5.5" height="34" rx="2.75" fill="url(#markBrandGrad)" />

      {/* Terminal Prompt Chevron */}
      <path
        d="M 20.5 25.5 L 29.5 32 L 20.5 38.5"
        stroke="url(#markBrandGrad)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Encrypted Nexus Bridge */}
      <path
        d="M 29.5 32 L 43.5 32"
        stroke="#FF79C6"
        strokeWidth="4.5"
        strokeLinecap="round"
      />

      {/* Terminal Cursor Underline */}
      <path
        d="M 33 38.5 L 40.5 38.5"
        stroke="#00F0FF"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Center Data Pulse Node */}
      <circle cx="29.5" cy="32" r="2" fill="#FFFFFF" />
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
          <span className="font-extrabold tracking-tight text-base bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            SSH
          </span>
        </div>
        {showTagline && (
          <span className="text-[9px] uppercase tracking-widest font-mono font-semibold text-primary/70 mt-1">
            Privacy-First
          </span>
        )}
      </div>
    </div>
  );
};
