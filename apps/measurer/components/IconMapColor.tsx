import React from 'react';

/** Цветная иконка «Карта»: булавка на карте. Чтобы откатить — в UpcomingScreen снова использовать MapPin из lucide-react. */
interface IconMapColorProps {
  size?: number;
  className?: string;
}

const IconMapColor: React.FC<IconMapColorProps> = ({ size = 48, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden
  >
    {/* Сложенная карта (фон) — зелёные/жёлтые области */}
    <path
      d="M8 12v24l12-6 14 7 10-5V14l-10 5-14-7L8 12z"
      fill="url(#map-green)"
    />
    <path
      d="M20 18l14 7v14l-14-7V18z"
      fill="url(#map-yellow)"
    />
    <defs>
      <linearGradient id="map-green" x1="8" y1="12" x2="34" y2="36" gradientUnits="userSpaceOnUse">
        <stop stopColor="#66BB6A" />
        <stop offset="1" stopColor="#43A047" />
      </linearGradient>
      <linearGradient id="map-yellow" x1="20" y1="18" x2="34" y2="32" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFB74D" />
        <stop offset="1" stopColor="#FFA726" />
      </linearGradient>
    </defs>
    {/* Дороги на карте */}
    <path d="M12 20h8M12 26h12M20 32h6" stroke="#fff" strokeWidth="1.2" strokeOpacity="0.9" strokeLinecap="round" />
    <path d="M24 18v14M30 22v10" stroke="#fff" strokeWidth="1.2" strokeOpacity="0.9" strokeLinecap="round" />
    {/* Малая оранжевая булавка на карте */}
    <circle cx="28" cy="24" r="3" fill="#FF9800" stroke="#fff" strokeWidth="1.2" />
    {/* Большая красная булавка (теардроп) */}
    <path
      d="M22 14c0-4.4 3.6-8 8-8s8 3.6 8 8c0 6-8 14-8 14s-8-8-8-14z"
      fill="url(#pin-red)"
      stroke="#fff"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <circle cx="30" cy="14" r="3" fill="#fff" fillOpacity="0.5" />
    <defs>
      <linearGradient id="pin-red" x1="22" y1="6" x2="38" y2="28" gradientUnits="userSpaceOnUse">
        <stop stopColor="#EF5350" />
        <stop offset="1" stopColor="#C62828" />
      </linearGradient>
    </defs>
  </svg>
);

export default IconMapColor;
