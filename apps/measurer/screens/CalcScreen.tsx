
import React, { useState, useMemo, useEffect } from 'react';
import { ProductType, ColorType, MeshType, PlisseOpening, PlisseThreshold, CartItem, MountType, CornerType, HandleType } from '../types';
import { calculatePrice } from '../logic/calculations';
import { COLOR_LABELS, MESH_LABELS, OPENING_LABELS, THRESHOLD_LABELS, MOUNT_LABELS, CORNER_LABELS, HANDLE_LABELS, PRICES as DEFAULT_PRICES } from '../constants';
import { Save, Plus, Minus, Maximize2, Palette, Layers, MousePointer2, ShieldAlert, Box, Fingerprint, ChevronDown, ChevronUp, Scissors, Sun, Moon, Wrench, Lock } from 'lucide-react';

interface CalcScreenProps {
  type: ProductType;
  initialItem?: CartItem | null;
  onAddToCart: (item: CartItem) => void;
  onCancel: () => void;
  prices: typeof DEFAULT_PRICES;
}

const CalcSection: React.FC<{ title: string; icon: any; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-1">
      <Icon size={14} className="text-gray-400" /> {title}
    </h3>
    {children}
  </div>
);

const CalcScreen: React.FC<CalcScreenProps> = ({ type, initialItem, onAddToCart, onCancel, prices }) => {
  const [width, setWidth] = useState<string>(initialItem?.width?.toString() || '');
  const [height, setHeight] = useState<string>(initialItem?.height?.toString() || '');
  const [quantity, setQuantity] = useState<number>(initialItem?.quantity || 1);
  const [color, setColor] = useState<ColorType>(initialItem?.color || 'white');
  const [mesh, setMesh] = useState<MeshType>(initialItem?.mesh || 'standard');
  const [mount, setMount] = useState<MountType>(initialItem?.mount || 'z_metal');
  const [cornerType, setCornerType] = useState<CornerType>(initialItem?.cornerType || 'plastic');
  const [handleType, setHandleType] = useState<HandleType>(initialItem?.handleType || 'plastic');
  const [frameProfile, setFrameProfile] = useState<'25' | '32'>(initialItem?.frameProfile || '25');
  const [doorProfile, setDoorProfile] = useState<'32' | '42'>(initialItem?.doorProfile || '42');
  const [hingesCount, setHingesCount] = useState<number>(initialItem?.hingesCount || 3);
  const [hasLatch, setHasLatch] = useState<boolean>(initialItem?.hasLatch !== undefined ? initialItem.hasLatch : true);
  const [hasBolt, setHasBolt] = useState<boolean>(initialItem?.hasBolt || false);
  const [subType, setSubType] = useState<'window' | 'door' | 'pvc' | 'alu'>(initialItem?.subType || 'window');
  
  const [opening, setOpening] = useState<PlisseOpening>(initialItem?.opening || 'side');
  const [threshold, setThreshold] = useState<PlisseThreshold>(initialItem?.threshold || 'standard');
  const [handles, setHandles] = useState<number>(initialItem?.handles || 1);
  
  // Состояние для раскрывающегося списка тканей
  const [isFabricExpanded, setIsFabricExpanded] = useState(false);

  const isMaintenance = [
    ProductType.SEAL,
    ProductType.COMB,
    ProductType.CHILD_LOCK,
    ProductType.ADJUSTMENT
  ].includes(type);

  const isFrame = type === ProductType.FRAME;
  const isDoor = type === ProductType.DOOR;
  const isPlisseNet = type === ProductType.PLISSE_NET;
  const isJalousie = type === ProductType.JALOUSIE_CLASSIC || type === ProductType.JALOUSIE_LIGHT || type === ProductType.JALOUSIE_COZY;
  const isPortal = type === ProductType.JALOUSIE_CLASSIC;

  // Эффект для установки полотна по умолчанию при смене типа изделия
  useEffect(() => {
    if (!initialItem) {
      if (isJalousie) {
        setMesh('fb1601');
      } else {
        setMesh('standard');
      }
    }
  }, [type, initialItem]);

  // Эффект для настройки дефолтных ручек при смене типа открывания (только для новых изделий Плиссе)
  useEffect(() => {
    if (!initialItem && (isPlisseNet || isPortal)) {
      if (opening === 'counter') {
        setHandles(4);
      } else if (opening === 'up') {
        setHandles(1);
      } else {
        setHandles(2);
      }
    }
  }, [opening, isPlisseNet, isPortal, initialItem]);

  // RAL = порошковая покраска в камере: пластик плавится → только металл (уголки алюминий, ручки металл, крепление Z-металл)
  const isClassicFrame = isFrame || type === ProductType.WING || type === ProductType.INSIDE_INSERT || isDoor;
  useEffect(() => {
    if (color === 'ral' && isClassicFrame) {
      setCornerType('aluminum');
      setHandleType('metal');
      if (mount === 'standard') setMount('z_metal');
    }
  }, [color, isClassicFrame, mount]);

  const { total, install } = useMemo(() => {
    const wNum = parseFloat(width) || 0;
    const hNum = parseFloat(height) || 0;
    return calculatePrice(
      type, wNum, hNum, color, mesh, opening, threshold, handles, quantity, subType, mount, cornerType, handleType, prices, doorProfile, hingesCount, hasLatch, hasBolt, frameProfile
    );
  }, [type, width, height, color, mesh, opening, threshold, handles, quantity, subType, mount, cornerType, handleType, prices, frameProfile, doorProfile, hingesCount, hasLatch, hasBolt]);

  const validationWarnings = useMemo(() => {
    const warnings: { text: string; red?: boolean }[] = [];
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;

    if (!isMaintenance && (w > 0 || h > 0)) {
      if (w < 200 || w > 3000 || h < 200 || h > 3000) {
        warnings.push({ text: "Размеры нестандартные, расчет может быть неточным." });
      }
      // Сетка плиссе: высота более 2,9 м — изготовление не предоставляется возможным
      if (isPlisseNet && h > 2900) {
        warnings.push({ text: "Высота более 2,9 м: изготовление сетки не предоставляется возможным." });
      }
      // Сетка плиссе: открывание вбок при ширине > 1200 мм — не по нормам, без гарантии
      if (isPlisseNet && opening === 'side' && w > 1200) {
        warnings.push({ text: "Габариты изделия не соответствуют нормам. Без гарантии. Советуем выбрать встречное открывание.", red: true });
      }
      if (isJalousie && w > 1500 && opening !== 'counter') {
        warnings.push({ text: "⚠️ Обратите внимание: при ширине > 1.5м и одностороннем открывании гарантия не предоставляется. Полотно может провисать." });
      }
    }
    return warnings;
  }, [width, height, opening, isPlisseNet, isJalousie, isMaintenance]);

  const handleSave = () => {
    if (!isMaintenance) {
      const wNum = parseFloat(width) || 0;
      const hNum = parseFloat(height) || 0;
      if (wNum <= 0 || hNum <= 0) return alert('Введите корректные размеры');
    }

    const item: CartItem = {
      id: initialItem?.id || Date.now().toString(),
      type,
      width: isMaintenance ? undefined : parseFloat(width),
      height: isMaintenance ? undefined : parseFloat(height),
      // Для всех типов сохраняем то же количество, с которым считали цену.
      quantity,
      color: !isMaintenance ? color : undefined,
      mesh: !isMaintenance ? mesh : undefined,
      mount: (isFrame || isDoor) ? mount : undefined,
      cornerType: isFrame ? cornerType : undefined,
      handleType: isFrame || type === ProductType.COMB ? handleType : undefined,
      frameProfile: isFrame ? frameProfile : undefined,
      doorProfile: isDoor ? doorProfile : undefined,
      hingesCount: isDoor ? hingesCount : undefined,
      hasLatch: isDoor ? hasLatch : undefined,
      hasBolt: isDoor ? hasBolt : undefined,
      opening: isPlisseNet || isJalousie ? opening : undefined,
      threshold: isPlisseNet || isJalousie ? threshold : undefined,
      handles: isPlisseNet || isJalousie ? handles : undefined,
      subType: type === ProductType.ADJUSTMENT ? subType : undefined,
      price: total,
      installPrice: install,
      details: isMaintenance 
        ? `${type === ProductType.COMB ? `Гребенка (${HANDLE_LABELS[handleType]}), ` : type === ProductType.ADJUSTMENT ? `${subType === 'door' ? 'Дверь ПВХ' : 'Оконная створка'}, ` : ''}${quantity} ${type === ProductType.SEAL ? 'м.п.' : 'шт.'}`
        : `${isFrame ? `${frameProfile}мм, ` : isDoor ? `${doorProfile}мм, ` : ''}${COLOR_LABELS[color]}, ${MESH_LABELS[mesh]}${isDoor ? `, ${hingesCount}п.` : ''}`,
    };
    onAddToCart(item);
  };

  const availableColors = useMemo(() => {
    if (isPlisseNet || isPortal) return ['white', 'brown', 'anthracite', 'ral'];
    if (type === ProductType.JALOUSIE_LIGHT) return ['white', 'brown', 'gray', 'gold', 'black', 'ral'];
    if (type === ProductType.JALOUSIE_COZY) return ['white', 'gray', 'anthracite', 'ral']; 
    if (isJalousie) return ['white', 'beige', 'gray', 'anthracite', 'ral'];
    return ['white', 'brown', 'gray', 'ral'];
  }, [isPlisseNet, isPortal, isJalousie, type]);

  const allowedFrameMeshes = ['standard', 'antimoshka', 'anticat', 'antipyl'];
  const allowedPlisseMeshes = ['standard', 'antikoshka', 'antipyl'];

  // Группировка тканей для штор
  const jalousieFabrics = useMemo(() => {
    const blackout = (Object.keys(MESH_LABELS) as MeshType[]).filter(m => m.startsWith('fb'));
    const semi = (Object.keys(MESH_LABELS) as MeshType[]).filter(m => m.startsWith('fa'));
    return { blackout, semi };
  }, []);

  const renderMeshButton = (m: MeshType) => (
    <button 
      key={m} 
      onClick={() => {
        setMesh(m);
        setIsFabricExpanded(false);
      }} 
      className={`px-3 py-2.5 rounded-xl text-[10px] font-bold border transition-all text-left flex items-center justify-between ${mesh === m ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
    >
      <span className="truncate flex-1">{MESH_LABELS[m]}</span>
      {mesh === m && <div className="w-1.5 h-1.5 bg-orange-400 rounded-full ml-2 shadow-sm" />}
    </button>
  );

  const getColorSwatchStyle = (colorKey: ColorType): React.CSSProperties => {
    if (type === ProductType.JALOUSIE_COZY && colorKey === 'gray') {
      return { background: '#7b4b2a' };
    }
    switch (colorKey) {
      case 'white':
        return { background: '#ffffff' };
      case 'brown':
        return { background: '#7b4b2a' };
      case 'gray':
      case 'anthracite':
        return { background: '#4b5563' };
      case 'black':
        return { background: '#111827' };
      case 'gold':
        return { background: '#d4af37' };
      case 'beige':
        return { background: '#d6c1a3' };
      case 'unpainted':
        return { background: '#9ca3af' };
      case 'gray7040':
        return { background: '#606b73' };
      case 'ral':
        return {
          background:
            'conic-gradient(#ef4444, #f97316, #eab308, #22c55e, #3b82f6, #8b5cf6, #ec4899, #ef4444)',
        };
      default:
        return { background: '#9ca3af' };
    }
  };

  const getColorDisplayLabel = (colorKey: ColorType): string => {
    if (type === ProductType.JALOUSIE_COZY && colorKey === 'gray') return 'Коричневый';
    return COLOR_LABELS[colorKey] || colorKey;
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <CalcSection title={!isMaintenance ? "Размеры изделия" : (type === ProductType.SEAL ? "Количество метров" : "Количество шт.")} icon={Maximize2}>
        {!isMaintenance ? (
          <div className="space-y-3">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-gray-400 mb-1 ml-1 uppercase tracking-widest">Ширина (мм)</label>
                <input type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-bold outline-none focus:border-orange-400" placeholder="600" />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-gray-400 mb-1 ml-1 uppercase tracking-widest">Высота (мм)</label>
                <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-bold outline-none focus:border-orange-400" placeholder="1400" />
              </div>
            </div>
            {validationWarnings.map((w, i) => (
              <div key={i} className={`p-3 rounded-xl flex gap-2 items-start animate-in fade-in slide-in-from-top-1 ${w.red ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-100'}`}>
                <ShieldAlert size={16} className={`flex-shrink-0 mt-0.5 ${w.red ? 'text-red-500' : 'text-amber-500'}`} />
                <p className={`text-[10px] font-bold leading-tight italic ${w.red ? 'text-red-700' : 'text-amber-700'}`}>{w.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl p-1">
               <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-3 text-gray-400 active:scale-90 transition-transform"><Minus size={20} /></button>
               <input type="number" value={quantity} onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))} className="flex-1 bg-transparent text-center text-xl font-bold outline-none" />
               <button onClick={() => setQuantity(quantity + 1)} className="p-3 text-[#f39200] active:scale-90 transition-transform"><Plus size={20} /></button>
            </div>
          </div>
        )}
      </CalcSection>

      {/* Специфические поля для обслуживания */}
      {type === ProductType.COMB && (
        <CalcSection title="Материал гребенки" icon={Layers}>
          <div className="flex gap-2">
            {['plastic', 'metal'].map((ht) => (
              <button key={ht} onClick={() => setHandleType(ht as any)} className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold border transition-all ${handleType === ht ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                {ht === 'metal' ? 'Металл' : 'Пластик'}
              </button>
            ))}
          </div>
        </CalcSection>
      )}

      {type === ProductType.ADJUSTMENT && (
        <CalcSection title="Тип створки" icon={Wrench}>
          <div className="flex gap-2">
            {['window', 'door'].map((st) => (
              <button key={st} onClick={() => setSubType(st as any)} className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold border transition-all ${subType === st ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                {st === 'door' ? 'Дверь ПВХ' : 'Окно'}
              </button>
            ))}
          </div>
        </CalcSection>
      )}

      {isFrame && (
        <CalcSection title="Тип профиля" icon={Box}>
          <div className="flex gap-2">
            {['25', '32'].map((p) => (
              <button key={p} onClick={() => setFrameProfile(p as any)} className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold border transition-all ${frameProfile === p ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                {p} мм
              </button>
            ))}
          </div>
        </CalcSection>
      )}

      {isDoor && (
        <CalcSection title="Профиль двери" icon={Box}>
          <div className="flex gap-2">
            {['32', '42'].map((p) => (
              <button key={p} onClick={() => setDoorProfile(p as any)} className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold border transition-all ${doorProfile === p ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                {p} мм
              </button>
            ))}
          </div>
        </CalcSection>
      )}

      {!isMaintenance && type !== ProductType.ROLL && (
        <CalcSection title={isJalousie ? "Вид полотна" : "Тип полотна"} icon={isJalousie ? Scissors : Layers}>
          {isJalousie ? (
            <div className="space-y-3">
              {/* Компактное отображение выбранной ткани */}
              {!isFabricExpanded ? (
                <button 
                  onClick={() => setIsFabricExpanded(true)}
                  className="w-full flex items-center justify-between p-3.5 bg-gray-50 border border-gray-200 rounded-xl hover:border-orange-300 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg text-[#f39200] shadow-sm">
                      {mesh.startsWith('fb') ? <Moon size={16} /> : <Sun size={16} />}
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-[10px] font-black text-[#f39200] uppercase tracking-tighter">
                        {mesh.startsWith('fb') ? 'Blackout 100%' : 'Semi-Blackout'}
                      </span>
                      <span className="text-[12px] font-bold text-gray-800 truncate max-w-[180px]">
                        {MESH_LABELS[mesh]}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-400 text-[10px] font-bold uppercase tracking-widest group-hover:text-orange-500">
                    Изменить <ChevronDown size={14} />
                  </div>
                </button>
              ) : (
                /* Раскрытый список с группировкой */
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <Moon size={12} className="text-blue-600" />
                      <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Блэкаут 100% (FB)</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {jalousieFabrics.blackout.map(renderMeshButton)}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <Sun size={12} className="text-orange-500" />
                      <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Полупрозрачные (FA)</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {jalousieFabrics.semi.map(renderMeshButton)}
                    </div>
                  </div>

                  <button 
                    onClick={() => setIsFabricExpanded(false)}
                    className="w-full py-2.5 text-gray-400 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1 hover:text-gray-600"
                  >
                    Свернуть <ChevronUp size={14} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(MESH_LABELS) as MeshType[])
                .filter(m => {
                  if (isPlisseNet) return allowedPlisseMeshes.includes(m);
                  if (isFrame || isDoor) return allowedFrameMeshes.includes(m);
                  return allowedFrameMeshes.includes(m);
                })
                .sort((a, b) => {
                  if (isPlisseNet) return allowedPlisseMeshes.indexOf(a) - allowedPlisseMeshes.indexOf(b);
                  return allowedFrameMeshes.indexOf(a) - allowedFrameMeshes.indexOf(b);
                })
                .map((m) => (
                <button key={m} onClick={() => setMesh(m)} className={`px-3 py-2.5 rounded-xl text-[10px] font-bold border transition-all text-left ${mesh === m ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                  {MESH_LABELS[m]}
                </button>
              ))}
            </div>
          )}
        </CalcSection>
      )}

      {!isMaintenance && (
        <CalcSection title="Цвет профиля" icon={Palette}>
          <div className="grid grid-cols-4 gap-2">
            {availableColors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c as ColorType)}
                title={getColorDisplayLabel(c as ColorType)}
                aria-label={`Цвет: ${getColorDisplayLabel(c as ColorType)}`}
                className={`flex flex-col items-center justify-start gap-1 p-1.5 rounded-xl border transition-all ${color === c ? 'border-[#f39200] bg-orange-50 shadow-sm' : 'border-gray-200 bg-white hover:border-orange-200'}`}
              >
                <span
                  className={`w-8 h-8 rounded-full border ${c === 'white' ? 'border-gray-300' : 'border-transparent'} ${color === c ? 'ring-2 ring-[#f39200] ring-offset-1' : ''}`}
                  style={getColorSwatchStyle(c as ColorType)}
                />
                <span className={`text-[9px] leading-tight text-center font-bold ${color === c ? 'text-[#f39200]' : 'text-gray-500'}`}>
                  {getColorDisplayLabel(c as ColorType)}
                </span>
              </button>
            ))}
          </div>
        </CalcSection>
      )}

      {isDoor && (
        <>
          <CalcSection title="Количество петель" icon={Layers}>
            <div className="flex gap-2">
              {[2, 3].map((num) => (
                <button key={num} onClick={() => setHingesCount(num)} className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold border transition-all ${hingesCount === num ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                  {num} шт.
                </button>
              ))}
            </div>
          </CalcSection>
          <CalcSection title="Доп. фурнитура" icon={Layers}>
            <div className="space-y-2">
              <button onClick={() => setHasLatch(!hasLatch)} className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all ${hasLatch ? 'bg-orange-50 border-orange-200 text-orange-900' : 'bg-white border-gray-100 text-gray-400'}`}>
                <span className="text-[10px] font-bold uppercase">Защелка</span>
                <div className={`w-10 h-5 rounded-full p-0.5 transition-colors ${hasLatch ? 'bg-orange-500' : 'bg-gray-200'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${hasLatch ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </button>
              <button onClick={() => setHasBolt(!hasBolt)} className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all ${hasBolt ? 'bg-orange-50 border-orange-200 text-orange-900' : 'bg-white border-gray-100 text-gray-400'}`}>
                <span className="text-[10px] font-bold uppercase">Шпингалет</span>
                <div className={`w-10 h-5 rounded-full p-0.5 transition-colors ${hasBolt ? 'bg-orange-500' : 'bg-gray-200'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${hasBolt ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </button>
            </div>
          </CalcSection>
        </>
      )}

      {isFrame && (
        <>
          <CalcSection title="Тип уголков" icon={Layers}>
            {color === 'ral' && (
              <p className="text-[9px] text-amber-600 font-bold mb-2">RAL — порошковая покраска: только алюминиевые уголки</p>
            )}
            <div className="flex gap-2">
              {['plastic', 'aluminum'].map((ct) => (
                <button 
                  key={ct} 
                  disabled={(frameProfile === '32' && ct === 'aluminum') || (color === 'ral' && ct === 'plastic')}
                  onClick={() => setCornerType(ct as CornerType)} 
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold border transition-all ${cornerType === ct ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'} ${((frameProfile === '32' && ct === 'aluminum') || (color === 'ral' && ct === 'plastic')) ? 'opacity-50' : ''}`}
                >
                  {CORNER_LABELS[ct]}
                </button>
              ))}
            </div>
          </CalcSection>

          <CalcSection title="Тип ручек" icon={MousePointer2}>
            {color === 'ral' && (
              <p className="text-[9px] text-amber-600 font-bold mb-2">RAL — порошковая покраска: только металлические ручки</p>
            )}
            <div className="flex gap-2">
              {['plastic', 'metal'].map((ht) => (
                <button 
                  key={ht} 
                  disabled={color === 'ral' && ht === 'plastic'}
                  onClick={() => setHandleType(ht as HandleType)} 
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold border transition-all ${handleType === ht ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'} ${color === 'ral' && ht === 'plastic' ? 'opacity-50' : ''}`}
                >
                  {HANDLE_LABELS[ht]}
                </button>
              ))}
            </div>
          </CalcSection>

          <CalcSection title="Тип крепления" icon={Layers}>
            {color === 'ral' && (
              <p className="text-[9px] text-amber-600 font-bold mb-2">RAL: Z-пластик недоступен (плавление в камере)</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(MOUNT_LABELS) as MountType[]).map((m) => (
                <button 
                  key={m} 
                  disabled={color === 'ral' && m === 'standard'}
                  onClick={() => setMount(m as MountType)} 
                  className={`px-2 py-2.5 rounded-xl text-[10px] font-bold border transition-all ${mount === m ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'} ${color === 'ral' && m === 'standard' ? 'opacity-50' : ''}`}
                >
                  {MOUNT_LABELS[m]}
                </button>
              ))}
            </div>
          </CalcSection>
        </>
      )}

      {(isPlisseNet || isJalousie) && (
        <>
          {type !== ProductType.JALOUSIE_LIGHT && (
            <CalcSection title="Тип открывания" icon={MousePointer2}>
              <div className="flex gap-2">
                {(Object.keys(OPENING_LABELS) as PlisseOpening[])
                  .filter(o => type === ProductType.JALOUSIE_COZY ? o !== 'counter' : true) 
                  .map((o) => (
                  <button key={o} onClick={() => setOpening(o)} className={`flex-1 px-2 py-2.5 rounded-xl text-[10px] font-bold border transition-all ${opening === o ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>{OPENING_LABELS[o]}</button>
                ))}
              </div>
            </CalcSection>
          )}
          {(isPlisseNet || isPortal) && (
            <CalcSection title="Тип порога" icon={MousePointer2}>
              <div className="flex gap-2">
                {(Object.keys(THRESHOLD_LABELS) as PlisseThreshold[]).map((t) => (
                  <button key={t} onClick={() => setThreshold(t)} className={`flex-1 px-2 py-2.5 rounded-xl text-[10px] font-bold border transition-all ${threshold === t ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>{THRESHOLD_LABELS[t]}</button>
                ))}
              </div>
            </CalcSection>
          )}
          {type !== ProductType.JALOUSIE_COZY && type !== ProductType.JALOUSIE_LIGHT && ( 
            <CalcSection title="Количество ручек" icon={Fingerprint}>
              <div className="flex gap-2">
                {[0, 1, 2, 4].map((num) => (
                  <button 
                    key={num} 
                    disabled={opening === 'counter' && num !== 4}
                    onClick={() => setHandles(num)} 
                    className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold border transition-all ${handles === num ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'} ${opening === 'counter' && num !== 4 ? 'opacity-30' : ''}`}>
                    {num === 0 ? 'НЕТ' : `${num} шт.`}
                  </button>
                ))}
              </div>
            </CalcSection>
          )}
        </>
      )}
      
      <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100 flex flex-col items-center justify-center gap-1 shadow-sm">
        <span className="text-orange-400 text-[10px] font-black uppercase tracking-widest">Итоговая Стоимость</span>
        <span className="text-4xl font-black text-orange-900 tracking-tight">{total} ₽</span>
      </div>

      <div className="flex gap-4 pb-8">
        <button onClick={onCancel} className="flex-1 p-4 border border-gray-200 text-gray-400 rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:bg-gray-50 transition-colors">Отмена</button>
        <button onClick={handleSave} className="flex-[2] p-4 bg-gray-800 text-white rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"><Save size={18} /> {initialItem ? 'Сохранить изменения' : 'Добавить в корзину'}</button>
      </div>
    </div>
  );
};

export default CalcScreen;
