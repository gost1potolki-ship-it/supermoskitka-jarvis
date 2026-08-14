
import React from 'react';
import { ProductType } from '../types';
import { 
  ShoppingCart,
  ChevronRight,
  Wrench,
  Lock,
} from 'lucide-react';

interface HomeScreenProps {
  onSelectType: (type: ProductType) => void;
  onOpenCart: () => void;
  cartCount: number;
}

const IconFrame = ({ className, size }: { className?: string, size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="4" y="3" width="16" height="18" />
    <path d="M4 7h16M4 11h16M4 15h16M8 3v18M12 3v18M16 3v18" strokeOpacity="0.1" />
  </svg>
);

const IconWing = ({ className, size }: { className?: string, size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="2" width="20" height="20" />
    <rect x="5" y="5" width="14" height="14" />
    <path d="M5 8h14M5 11h14M5 14h14M8 5v14M11 5v14" strokeOpacity="0.05" />
  </svg>
);

const IconRoller = ({ className, size }: { className?: string, size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="2" width="18" height="4" fill="currentColor" fillOpacity="0.2" />
    <path d="M4 6v13c0 1 1 2 2 2h12c1 0 2-1 2-2V6" />
    <path d="M12 18v-4m-2 2l2-2 2 2" />
    <path d="M4 9h16M4 12h16" strokeOpacity="0.1" />
  </svg>
);

const IconDoor = ({ className, size }: { className?: string, size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 2h12v20H6z" />
    <path d="M6 6h1M6 11h1M6 16h1" strokeWidth="3" />
    <circle cx="15" cy="11" r="1.5" fill="currentColor" />
    <path d="M9 2v20M12 2v20M15 2v20M6 5h12M6 9h12M6 13h12" strokeOpacity="0.05" />
  </svg>
);

const IconPlisse = ({ className, size }: { className?: string, size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="3" width="18" height="18" />
    <path d="M6 3l2 18l2-18l2 18l2-18" />
    <path d="M16 12l2 0" strokeWidth="3" />
    <path d="M19 12l2 0" />
    <path d="M17 12l-1.5-1.5M17 12l-1.5 1.5" />
  </svg>
);

const IconPlisseBlinds = ({ className, size, framed = true }: { className?: string, size?: number, framed?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {framed && <rect x="4" y="3" width="16" height="18" />}
    <path d="M6 6h12M6 9h12M6 12h12M6 15h12M6 18h12" />
    {!framed && <path d="M5 3h14M5 21h14" strokeWidth="3" strokeOpacity="0.2" />}
    <path d="M6 6l1 1.5L6 9l1 1.5L6 12l1 1.5L6 15" strokeOpacity="0.2" />
  </svg>
);

const IconInsideInsert = ({ className, size }: { className?: string, size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <rect x="6" y="6" width="12" height="12" strokeOpacity="0.4" />
    <path d="M9 12h6M12 9v6" strokeOpacity="0.2" />
    <path d="M3 3l3 3M21 3l-3 3M3 21l3-3M21 21l-3-3" strokeOpacity="0.3" />
  </svg>
);

const IconSeal = ({ className, size }: { className?: string, size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="8" strokeOpacity="0.2" />
    <path d="M12 4a8 8 0 1 0 8 8 8 8 0 0 0-8-8zm0 2a6 6 0 1 1-6 6 6 6 0 0 1 6-6zm0 2a4 4 0 1 0 4 4 4 4 0 0 0-4-4z" />
    <path d="M12 4v4M12 16v4M4 12h4M16 12h4" strokeOpacity="0.3" />
  </svg>
);

const IconComb = ({ className, size }: { className?: string, size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 12h16" />
    <path d="M4 12v4M8 12v4M12 12v4M16 12v4M20 12v4" />
    <circle cx="2" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

const IconCozy = ({ className, size }: { className?: string, size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 4h16v16H4z" />
    <path d="M8 4v16M12 4v16M16 4v16" strokeOpacity="0.2" />
    <path d="M4 8h16M4 12h16M4 16h16" strokeOpacity="0.1" />
  </svg>
);

const HomeScreen: React.FC<HomeScreenProps> = ({ onSelectType, onOpenCart, cartCount }) => {
  const mosquitoNets = [
    { type: ProductType.FRAME, icon: <IconFrame />, desc: 'Обычные оконные сетки' },
    { type: ProductType.WING, icon: <IconWing />, desc: 'Сетка в проем' },
    { type: ProductType.INSIDE_INSERT, icon: <IconInsideInsert />, desc: 'Внутрисветовые (VSH)' },
    { type: ProductType.DOOR, icon: <IconDoor />, desc: 'Сетки на петлях' },
    { type: ProductType.ROLL, icon: <IconRoller />, desc: 'Автоматические сетки' },
    { type: ProductType.PLISSE_NET, icon: <IconPlisse />, desc: 'Сетки гармошкой' },
  ];

  const pleatedBlinds = [
    { type: ProductType.JALOUSIE_CLASSIC, icon: <IconPlisseBlinds framed={true} />, desc: 'Шторы плиссе ПОРТАЛ' },
    { type: ProductType.JALOUSIE_LIGHT, icon: <IconPlisseBlinds framed={false} />, desc: 'ШТОРЫ плиссе ЛАЙТ' },
    { type: ProductType.JALOUSIE_COZY, icon: <IconCozy />, desc: 'вставная/накладная' },
  ];

  const maintenance = [
    { type: ProductType.SEAL, icon: <IconSeal />, desc: 'Замена уплотнителя' },
    { type: ProductType.COMB, icon: <IconComb />, desc: 'Ограничитель открывания' },
    { type: ProductType.CHILD_LOCK, icon: <Lock />, desc: 'Детский замок' },
    { type: ProductType.ADJUSTMENT, icon: <Wrench />, desc: 'Окна и двери' },
  ];

  const renderSection = (title: string, items: any[]) => (
    <div className="space-y-3">
      <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 px-2">{title}</h2>
      <div className="grid grid-cols-2 gap-3">
        {items.map((p) => (
          <button
            key={p.type}
            onClick={() => onSelectType(p.type)}
            className="flex flex-col items-center justify-center p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:border-[#f39200] active:scale-95 transition-all text-center gap-2 h-32"
          >
            <div className="text-[#f39200]">
              {React.cloneElement(p.icon as React.ReactElement<any>, { 
                size: 28, 
                className: "w-8 h-8" 
              })}
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-[12px] text-gray-800 leading-tight">{p.type}</span>
              <span className="text-[9px] text-gray-400 mt-0.5">{p.desc}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-8">
      {renderSection('Москитные сетки', mosquitoNets)}
      {renderSection('Шторы ПЛИССЕ', pleatedBlinds)}
      {renderSection('Обслуживание окон', maintenance)}

      {cartCount > 0 && (
        <button
          onClick={onOpenCart}
          className="w-full mt-4 bg-[#f39200] text-white p-4 rounded-xl flex items-center justify-between shadow-lg shadow-orange-100 sticky bottom-4 z-10"
        >
          <div className="flex items-center gap-3">
            <ShoppingCart size={20} />
            <span className="font-bold uppercase tracking-widest text-xs">В корзину ({cartCount})</span>
          </div>
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
};

export default HomeScreen;
