
import React from 'react';
import { Calculator, Archive, Settings, Ruler, LogOut } from 'lucide-react';

interface MenuScreenProps {
  onCreate: () => void;
  onViewArchive: () => void;
  onViewUpcoming: () => void;
  onOpenAdmin: () => void;
  userDisplayName?: string;
  userRole?: string;
  onLogout?: () => void;
}

const LogoIcon = ({ className = "w-12 h-12" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {[
      { x: 28, y: 15 }, { x: 56, y: 15 },
      { x: 14, y: 38 }, { x: 42, y: 38 }, { x: 70, y: 38 },
      { x: 28, y: 61 }, { x: 56, y: 61 }
    ].map((pos, i) => (
      <path
        key={i}
        d={`M${pos.x} ${pos.y} L${pos.x + 16} ${pos.y + 12} L${pos.x} ${pos.y + 24} L${pos.x + 6} ${pos.y + 12} Z`}
        fill="#f39200"
      />
    ))}
  </svg>
);

const MenuScreen: React.FC<MenuScreenProps> = ({
  onCreate,
  onViewArchive,
  onViewUpcoming,
  onOpenAdmin,
  userDisplayName,
  userRole,
  onLogout,
}) => {
  const roleLabel = userRole === 'admin' ? 'Администратор' : userRole === 'measurer' ? 'Замерщик' : userRole;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 bg-gray-50 relative">
      {userDisplayName && (
        <div className="w-full max-w-xs text-center -mb-2">
          <p className="text-sm font-bold text-gray-700">{userDisplayName}</p>
          {roleLabel && (
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mt-1">{roleLabel}</p>
          )}
        </div>
      )}
      <div className="w-full max-w-xs space-y-4">
        {/* Кнопка "Заявки на замер" — раскладка как у "Калькулятор продукции": иконка по центру, текст под ней */}
        <button
          onClick={onViewUpcoming}
          className="w-full bg-white border border-gray-200 p-4 rounded-2xl shadow-sm hover:shadow-md active:scale-95 transition-all flex flex-col items-center gap-2 group border-b-2 border-b-gray-200"
        >
          <div className="bg-orange-50 p-2.5 rounded-xl text-[#f39200]">
            <Ruler size={24} />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Замеры</h2>
            <p className="text-sm text-gray-400 mt-1 font-medium">ожидание мастера</p>
          </div>
        </button>

        <button
          onClick={onViewArchive}
          className="w-full bg-white border border-gray-200 p-4 rounded-2xl shadow-sm hover:shadow-md active:scale-95 transition-all flex flex-col items-center gap-2 group border-b-2 border-b-gray-200"
        >
          <div className="bg-orange-50 p-2.5 rounded-xl text-[#f39200] group-hover:bg-[#f39200] group-hover:text-white transition-colors">
            <Archive size={24} />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Заказы в работе</h2>
            <p className="text-sm text-gray-400 mt-1 font-medium">активные заказы</p>
          </div>
        </button>

        {/* Калькулятор — дополнительный раздел, ниже основных кнопок */}
        <div className="pt-8">
          <button
            onClick={onCreate}
            className="w-full bg-white border-2 border-[#f39200] p-3.5 rounded-2xl shadow-sm hover:shadow-md active:scale-95 transition-all flex flex-col items-center gap-2 group"
          >
            <div className="bg-gray-100 p-2 rounded-xl text-gray-500 group-hover:bg-[#f39200] group-hover:text-white transition-colors">
              <Calculator size={22} />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold text-[#f39200]">КАЛЬКУЛЯТОР</h2>
              <p className="text-xs text-gray-400 mt-0.5 font-medium">новый расчет изделий</p>
            </div>
          </button>
        </div>

      </div>

      <div className="mt-12 flex flex-col items-center gap-3 select-none">
        <div className="flex items-center gap-3">
          <LogoIcon className="w-10 h-10" />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-gray-600 uppercase leading-none tracking-tight">СУПЕР</span>
            <span className="text-lg font-black text-[#f39200] uppercase leading-none tracking-tight">МОСКИТКА</span>
          </div>
        </div>
        <p className="text-[9px] uppercase tracking-widest text-gray-300 font-bold">
          Изготовление и монтаж
        </p>
      </div>

      <button 
        onClick={(e) => {
          e.preventDefault();
          onOpenAdmin();
        }}
        className="absolute bottom-2 right-2 p-6 text-gray-200 hover:text-gray-400 active:text-gray-500 transition-colors z-50 rounded-full"
        title="Admin Settings"
      >
        <Settings size={20} strokeWidth={1.5} />
      </button>

      {onLogout && (
        <button
          onClick={(e) => {
            e.preventDefault();
            onLogout();
          }}
          className="absolute bottom-2 left-2 px-4 py-3 flex items-center gap-1.5 text-gray-400 hover:text-red-500 active:text-red-600 transition-colors z-50 rounded-full text-xs font-bold uppercase tracking-wide"
          title="Выйти"
        >
          <LogOut size={16} strokeWidth={2} />
          Выйти
        </button>
      )}
    </div>
  );
};

export default MenuScreen;
