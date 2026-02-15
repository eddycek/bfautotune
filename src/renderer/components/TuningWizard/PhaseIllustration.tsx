import React from 'react';

interface PhaseIllustrationProps {
  title: string;
  size?: number;
}

const STROKE = '#4dabf7';

function HoverSVG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* Drone X shape */}
      <line x1="14" y1="14" x2="34" y2="34" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      <line x1="34" y1="14" x2="14" y2="34" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      {/* Center body */}
      <circle cx="24" cy="24" r="4" stroke={STROKE} strokeWidth="1.5" />
      {/* Propeller circles */}
      <circle cx="14" cy="14" r="5" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      <circle cx="34" cy="14" r="5" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      <circle cx="14" cy="34" r="5" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      <circle cx="34" cy="34" r="5" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      {/* Hover stability ring */}
      <circle
        cx="24"
        cy="24"
        r="20"
        stroke={STROKE}
        strokeWidth="1.5"
        strokeDasharray="3 3"
        opacity="0.4"
      />
    </svg>
  );
}

function RollSVG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* Top-down drone */}
      <line x1="16" y1="16" x2="32" y2="32" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="16" x2="16" y2="32" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="24" r="3" stroke={STROKE} strokeWidth="1.5" />
      <circle cx="16" cy="16" r="4" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      <circle cx="32" cy="16" r="4" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      <circle cx="16" cy="32" r="4" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      <circle cx="32" cy="32" r="4" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      {/* Nose marker */}
      <polygon points="24,11 22,14 26,14" fill={STROKE} opacity="0.7" />
      {/* Left arrow */}
      <line x1="2" y1="24" x2="9" y2="24" stroke={STROKE} strokeWidth="1.5" strokeLinecap="round" />
      <polyline
        points="5,21 2,24 5,27"
        stroke={STROKE}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right arrow */}
      <line
        x1="39"
        y1="24"
        x2="46"
        y2="24"
        stroke={STROKE}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline
        points="43,21 46,24 43,27"
        stroke={STROKE}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PitchSVG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* Top-down drone */}
      <line x1="16" y1="16" x2="32" y2="32" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="16" x2="16" y2="32" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="24" r="3" stroke={STROKE} strokeWidth="1.5" />
      <circle cx="16" cy="16" r="4" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      <circle cx="32" cy="16" r="4" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      <circle cx="16" cy="32" r="4" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      <circle cx="32" cy="32" r="4" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      {/* Nose marker */}
      <polygon points="24,11 22,14 26,14" fill={STROKE} opacity="0.7" />
      {/* Forward arrow */}
      <line x1="24" y1="2" x2="24" y2="9" stroke={STROKE} strokeWidth="1.5" strokeLinecap="round" />
      <polyline
        points="21,5 24,2 27,5"
        stroke={STROKE}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Backward arrow */}
      <line
        x1="24"
        y1="39"
        x2="24"
        y2="46"
        stroke={STROKE}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline
        points="21,43 24,46 27,43"
        stroke={STROKE}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function YawSVG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* Drone X shape — top-down */}
      <line x1="16" y1="16" x2="32" y2="32" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="16" x2="16" y2="32" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      {/* Center body */}
      <circle cx="24" cy="24" r="3.5" stroke={STROKE} strokeWidth="1.5" />
      {/* Circular rotation arrow */}
      <path
        d="M 24 6 A 18 18 0 1 1 8 18"
        stroke={STROKE}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Arrowhead */}
      <polyline
        points="5,14 8,18 12,15"
        stroke={STROKE}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThrottleSVG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* Drone body — side view */}
      <line x1="14" y1="24" x2="34" y2="24" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      {/* Left motor */}
      <circle cx="14" cy="24" r="4" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      {/* Right motor */}
      <circle cx="34" cy="24" r="4" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      {/* Center body */}
      <circle cx="24" cy="24" r="3" stroke={STROKE} strokeWidth="1.5" />
      {/* Vertical double arrow (throttle up/down) */}
      <line
        x1="24"
        y1="6"
        x2="24"
        y2="42"
        stroke={STROKE}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="3 2"
      />
      <polyline
        points="21,10 24,6 27,10"
        stroke={STROKE}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="21,38 24,42 27,38"
        stroke={STROKE}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LandSVG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* Ground line */}
      <line
        x1="8"
        y1="40"
        x2="40"
        y2="40"
        stroke={STROKE}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Drone body — side view */}
      <line x1="16" y1="18" x2="32" y2="18" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      {/* Motors */}
      <circle cx="16" cy="18" r="4" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      <circle cx="32" cy="18" r="4" stroke={STROKE} strokeWidth="1.5" opacity="0.6" />
      {/* Center body */}
      <circle cx="24" cy="18" r="3" stroke={STROKE} strokeWidth="1.5" />
      {/* Down arrow */}
      <line
        x1="24"
        y1="25"
        x2="24"
        y2="36"
        stroke={STROKE}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline
        points="21,33 24,36 27,33"
        stroke={STROKE}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getIllustration(title: string): React.FC<{ size: number }> | null {
  const lower = title.toLowerCase();
  if (lower.includes('hover') || lower.includes('take off')) return HoverSVG;
  if (lower.includes('roll')) return RollSVG;
  if (lower.includes('pitch')) return PitchSVG;
  if (lower.includes('yaw')) return YawSVG;
  if (lower.includes('throttle')) return ThrottleSVG;
  if (lower.includes('land')) return LandSVG;
  return null;
}

export function PhaseIllustration({ title, size = 48 }: PhaseIllustrationProps) {
  const Component = getIllustration(title);
  if (!Component) return null;
  return (
    <span className="flight-guide-phase-illustration">
      <Component size={size} />
    </span>
  );
}
