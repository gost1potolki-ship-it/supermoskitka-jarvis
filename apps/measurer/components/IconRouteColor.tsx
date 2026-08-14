import React from 'react';

/** Цветная иконка «Маршрут»: объёмная оранжевая стрелка на фоне. Чтобы откатить — в UpcomingScreen снова использовать Route из lucide-react. */
interface IconRouteColorProps {
  size?: number;
  className?: string;
}

const IconRouteColor: React.FC<IconRouteColorProps> = ({ size = 48, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden
  >
    {/* Фон с полосками (карта/дороги) */}
    <rect width="48" height="48" rx="10" fill="#F5F0E8" />
    <path d="M0 12h48M0 24h48M0 36h48" stroke="#E8E0D5" strokeWidth="2" strokeOpacity="0.8" />
    <path d="M12 0v48M24 0v48M36 0v48" stroke="#E8E0D5" strokeWidth="1.5" strokeOpacity="0.6" />
    {/* Объёмная оранжевая стрелка (указатель маршрута) — градиент для 3D-эффекта */}
    <g transform="translate(24 24) rotate(-45)">
      <path
        d="M-12 -16 L12 0 L-12 16 L-8 0 Z"
        fill="url(#arrow-main)"
        stroke="#E65100"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </g>
    <defs>
      <linearGradient id="arrow-main" x1="-12" y1="-16" x2="12" y2="0" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFB74D" />
        <stop offset="0.5" stopColor="#FF9800" />
        <stop offset="1" stopColor="#E65100" />
      </linearGradient>
    </defs>
  </svg>
);

export default IconRouteColor;
