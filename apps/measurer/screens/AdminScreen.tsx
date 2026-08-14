
import React, { useState } from 'react';
import { 
  Save, 
  RotateCcw, 
  ChevronDown, 
  ChevronRight, 
  Calculator, 
  Percent, 
  User, 
  Scaling,
  Wrench,
  Bot,
  Copy,
  Check,
  Palmtree,
  Settings2,
  Box,
  Gem,
  Truck,
  Package,
  Anchor,
  Link
} from 'lucide-react';
import { PRICES as DEFAULT_PRICES, COLOR_LABELS, MESH_LABELS, generateAiPrompt } from '../constants';

interface AdminScreenProps {
  prices: typeof DEFAULT_PRICES;
  onSave: (newPrices: typeof DEFAULT_PRICES) => void;
  onReset: () => void;
}

const AdminScreen: React.FC<AdminScreenProps> = ({ prices, onSave, onReset }) => {
  const [localPrices, setLocalPrices] = useState<typeof DEFAULT_PRICES>(JSON.parse(JSON.stringify(prices)));
  const [expandedSection, setExpandedSection] = useState<string | null>('frames');
  const [expandedSubSection, setExpandedSubSection] = useState<string | null>(null);
  const [masterName, setMasterName] = useState(localStorage.getItem('measurer_master_name') || '');
  const [copied, setCopied] = useState(false);

  const handleInputChange = (path: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    const keys = path.split('.');
    const setByPath = (obj: any, pathKeys: string[], val: number): any => {
      if (pathKeys.length === 1) return { ...obj, [pathKeys[0]]: val };
      const [first, ...rest] = pathKeys;
      const child = obj && typeof obj === 'object' && obj !== null ? obj[first] : undefined;
      return { ...obj, [first]: setByPath(child ?? {}, rest, val) };
    };
    setLocalPrices(setByPath(localPrices, keys, numValue));
  };

  const handleSaveAll = () => {
    onSave(localPrices);
    localStorage.setItem('measurer_master_name', masterName);
    alert('Настройки успешно сохранены!');
  };

  const handleCopyPrompt = () => {
    const prompt = generateAiPrompt(localPrices);
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const SectionHeader: React.FC<{ id: string, title: string, icon: any, colorClass?: string }> = ({ id, title, icon: Icon, colorClass = "bg-orange-50 text-orange-600" }) => (
    <button 
      onClick={() => {
        setExpandedSection(expandedSection === id ? null : id);
        setExpandedSubSection(null);
      }}
      className="w-full flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm mb-2 active:bg-gray-50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl ${colorClass}`}>
          <Icon size={20} />
        </div>
        <span className="font-black text-[11px] uppercase tracking-widest text-gray-700 text-left">{title}</span>
      </div>
      {expandedSection === id ? <ChevronDown size={20} className="text-gray-400" /> : <ChevronRight size={20} className="text-gray-400" />}
    </button>
  );

  const SubSectionHeader: React.FC<{ id: string, title: string, icon?: any }> = ({ id, title, icon: Icon }) => (
    <button 
      onClick={() => setExpandedSubSection(expandedSubSection === id ? null : id)}
      className="w-full flex items-center justify-between p-3 bg-gray-50/50 rounded-xl mb-1.5 border border-gray-100 active:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} className="text-gray-400" />}
        <span className="text-[10px] font-black uppercase tracking-tight text-gray-600 text-left">{title}</span>
      </div>
      {expandedSubSection === id ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
    </button>
  );

  const InputField: React.FC<{ label: string, path: string, value: any, adornment?: string }> = ({ label, path, value, adornment = "₽" }) => (
    <div className="flex flex-col gap-1 mb-3">
      <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative">
        <input 
          type="number" 
          step="0.01"
          value={value ?? 0} 
          onChange={(e) => handleInputChange(path, e.target.value)}
          className="w-full p-2.5 bg-white border border-gray-200 rounded-xl font-bold text-sm outline-none focus:border-orange-500 transition-all"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-[9px]">{adornment}</div>
      </div>
    </div>
  );

  const PS = localPrices.price_settings;
  const CF = PS.classic_frames;
  const PN = PS.plisse_nets;
  const PB = PS.plisse_blinds;
  const WW = PS.window_works;
  const LOG = PS.logistics;

  return (
    <div className="p-4 space-y-4 pb-32">
      <div className="bg-white p-5 rounded-3xl border border-orange-100 shadow-sm mb-4">
        <h3 className="text-[10px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-2 mb-3">
          <User size={14} /> Личные данные
        </h3>
        <input 
          type="text" 
          value={masterName} 
          onChange={(e) => setMasterName(e.target.value)}
          placeholder="Имя Мастера"
          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm outline-none"
        />
      </div>

      <SectionHeader id="frames" title="Рамочные сетки (Классика)" icon={Calculator} />
      {expandedSection === 'frames' && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 mb-4 animate-in slide-in-from-top-1 space-y-2">
          <SubSectionHeader id="cf_profiles" title="Профили (м.п.)" icon={Box} />
          {expandedSubSection === 'cf_profiles' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
              <InputField label="Профиль 25мм Белый" path="price_settings.classic_frames.profiles.standard_25mm.white" value={CF.profiles.standard_25mm.white} />
              <InputField label="Профиль 25мм Коричневый" path="price_settings.classic_frames.profiles.standard_25mm.brown" value={CF.profiles.standard_25mm.brown} />
              <InputField label="Профиль 25мм Серый" path="price_settings.classic_frames.profiles.standard_25mm.gray" value={CF.profiles.standard_25mm.gray} />
              <InputField label="Дверной 42мм Белый" path="price_settings.classic_frames.profiles.door_42mm.white" value={CF.profiles.door_42mm.white} />
              <InputField label="Дверной 42мм Коричневый" path="price_settings.classic_frames.profiles.door_42mm.brown" value={CF.profiles.door_42mm.brown} />
              <InputField label="Дверной 42мм Серый" path="price_settings.classic_frames.profiles.door_42mm.gray" value={CF.profiles.door_42mm.gray} />
              <InputField label="Профиль 32мм Белый" path="price_settings.classic_frames.profiles.standard_32mm.white" value={CF.profiles.standard_32mm.white} />
              <InputField label="Профиль 32мм Коричневый" path="price_settings.classic_frames.profiles.standard_32mm.brown" value={CF.profiles.standard_32mm.brown} />
              <InputField label="Профиль 32мм Серый" path="price_settings.classic_frames.profiles.standard_32mm.gray" value={CF.profiles.standard_32mm.gray} />
              <InputField label="Профиль Крыло Белый" path="price_settings.classic_frames.profiles.wing_30mm.white" value={CF.profiles.wing_30mm.white} />
              <InputField label="Профиль Крыло Коричневый" path="price_settings.classic_frames.profiles.wing_30mm.brown" value={CF.profiles.wing_30mm.brown} />
              <InputField label="Профиль Крыло Серый" path="price_settings.classic_frames.profiles.wing_30mm.gray" value={CF.profiles.wing_30mm.gray} />
              <InputField label="Профиль Крыло Черный" path="price_settings.classic_frames.profiles.wing_30mm.black" value={CF.profiles.wing_30mm.black} />
              <InputField label="Профиль Внутривставной Белый" path="price_settings.classic_frames.profiles.vsn_vsm_25mm.white" value={CF.profiles.vsn_vsm_25mm.white} />
              <InputField label="Профиль Внутривставной Коричневый" path="price_settings.classic_frames.profiles.vsn_vsm_25mm.brown" value={CF.profiles.vsn_vsm_25mm.brown} />
              <InputField label="Профиль Внутривставной Серый" path="price_settings.classic_frames.profiles.vsn_vsm_25mm.gray" value={CF.profiles.vsn_vsm_25mm.gray} />
              <InputField label="Импост Белый" path="price_settings.classic_frames.profiles.impost_25mm.white" value={CF.profiles.impost_25mm.white} />
              <InputField label="Импост Коричневый" path="price_settings.classic_frames.profiles.impost_25mm.brown" value={CF.profiles.impost_25mm.brown} />
              <InputField label="Импост Серый" path="price_settings.classic_frames.profiles.impost_25mm.gray" value={CF.profiles.impost_25mm.gray} />
              <InputField label="Импост Черный" path="price_settings.classic_frames.profiles.impost_25mm.black" value={CF.profiles.impost_25mm.black} />
            </div>
          )}
          <SubSectionHeader id="cf_markups" title="Коэффициенты и Работа" icon={Percent} />
          {expandedSubSection === 'cf_markups' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
              <InputField label="Сборка окна" path="price_settings.classic_frames.markups.assembly_labor" value={CF.markups.assembly_labor} />
              <InputField label="Сборка ДВЕРИ" path="price_settings.classic_frames.markups.door_assembly_labor" value={CF.markups.door_assembly_labor} />
              <InputField label="Прибыль Окна (X)" path="price_settings.classic_frames.markups.company_profit_multiplier" value={CF.markups.company_profit_multiplier} adornment="X" />
              <InputField label="Прибыль Двери (X)" path="price_settings.classic_frames.markups.door_profit_multiplier" value={CF.markups.door_profit_multiplier} adornment="X" />
            </div>
          )}
          <SubSectionHeader id="cf_meshes" title="Полотна (м2)" icon={Gem} />
          {expandedSubSection === 'cf_meshes' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100 grid grid-cols-2 gap-x-2">
              {Object.entries(CF.meshes).map(([mKey, val]: [string, any]) => (
                <InputField key={mKey} label={MESH_LABELS[mKey] || mKey} path={`price_settings.classic_frames.meshes.${mKey}`} value={val} />
              ))}
            </div>
          )}
          <SubSectionHeader id="cf_corners" title="Уголки" icon={Package} />
          {expandedSubSection === 'cf_corners' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Пластик 25мм</p>
              <InputField label="Белый" path="price_settings.classic_frames.corners.plastic_25mm.white" value={CF.corners.plastic_25mm.white} />
              <InputField label="Коричневый" path="price_settings.classic_frames.corners.plastic_25mm.brown" value={CF.corners.plastic_25mm.brown} />
              <InputField label="Серый" path="price_settings.classic_frames.corners.plastic_25mm.gray" value={CF.corners.plastic_25mm.gray} />
              <InputField label="Черный" path="price_settings.classic_frames.corners.plastic_25mm.black" value={CF.corners.plastic_25mm.black} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Алюминий 25мм</p>
              <InputField label="Белый" path="price_settings.classic_frames.corners.aluminum_25mm.white" value={CF.corners.aluminum_25mm.white} />
              <InputField label="Коричневый" path="price_settings.classic_frames.corners.aluminum_25mm.brown" value={CF.corners.aluminum_25mm.brown} />
              <InputField label="Серый" path="price_settings.classic_frames.corners.aluminum_25mm.gray" value={CF.corners.aluminum_25mm.gray} />
              <InputField label="Черный" path="price_settings.classic_frames.corners.aluminum_25mm.black" value={CF.corners.aluminum_25mm.black} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Пластик 32мм</p>
              <InputField label="Белый" path="price_settings.classic_frames.corners.plastic_32mm.white" value={CF.corners.plastic_32mm.white} />
              <InputField label="Коричневый" path="price_settings.classic_frames.corners.plastic_32mm.brown" value={CF.corners.plastic_32mm.brown} />
              <InputField label="Серый" path="price_settings.classic_frames.corners.plastic_32mm.gray" value={CF.corners.plastic_32mm.gray} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Внутривставные 25мм</p>
              <InputField label="Белый" path="price_settings.classic_frames.corners.vsn_vsm_25mm.white" value={CF.corners.vsn_vsm_25mm.white} />
              <InputField label="Коричневый" path="price_settings.classic_frames.corners.vsn_vsm_25mm.brown" value={CF.corners.vsn_vsm_25mm.brown} />
              <InputField label="Серый" path="price_settings.classic_frames.corners.vsn_vsm_25mm.gray" value={CF.corners.vsn_vsm_25mm.gray} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Дверь 42мм (вн./внеш.)</p>
              <InputField label="Уголок" path="price_settings.classic_frames.corners.door_42mm_internal_external" value={CF.corners.door_42mm_internal_external} />
            </div>
          )}
          <SubSectionHeader id="cf_mounts" title="Крепления и шнур" icon={Anchor} />
          {expandedSubSection === 'cf_mounts' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
              <InputField label="Шнур 5мм (м.п.)" path="price_settings.classic_frames.mounts.cord_5mm" value={CF.mounts.cord_5mm} />
              <InputField label="Скоба импоста" path="price_settings.classic_frames.mounts.impost_bracket" value={CF.mounts.impost_bracket} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Z-пластик</p>
              <InputField label="Белый" path="price_settings.classic_frames.mounts.z_plastic.white" value={CF.mounts.z_plastic.white} />
              <InputField label="Коричневый" path="price_settings.classic_frames.mounts.z_plastic.brown" value={CF.mounts.z_plastic.brown} />
              <InputField label="Серый" path="price_settings.classic_frames.mounts.z_plastic.gray" value={CF.mounts.z_plastic.gray} />
              <InputField label="Черный" path="price_settings.classic_frames.mounts.z_plastic.black" value={CF.mounts.z_plastic.black} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Z-металл</p>
              <InputField label="Белый" path="price_settings.classic_frames.mounts.z_metal.white" value={CF.mounts.z_metal.white} />
              <InputField label="Коричневый" path="price_settings.classic_frames.mounts.z_metal.brown" value={CF.mounts.z_metal.brown} />
              <InputField label="Серый" path="price_settings.classic_frames.mounts.z_metal.gray" value={CF.mounts.z_metal.gray} />
              <InputField label="Черный" path="price_settings.classic_frames.mounts.z_metal.black" value={CF.mounts.z_metal.black} />
              <InputField label="Скоба ВСН/ВСМ" path="price_settings.classic_frames.mounts.vsn_metal_bracket" value={CF.mounts.vsn_metal_bracket} />
              <InputField label="Шток 41мм (плунжер)" path="price_settings.classic_frames.mounts.pin_41mm" value={CF.mounts.pin_41mm} />
              <InputField label="Саморез" path="price_settings.classic_frames.mounts.screw" value={CF.mounts.screw} />
            </div>
          )}
          <SubSectionHeader id="cf_handles" title="Ручки и дверная фурнитура" icon={Wrench} />
          {expandedSubSection === 'cf_handles' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Ручка рама (пластик)</p>
              <InputField label="Белый" path="price_settings.classic_frames.mounts.handle_frame_plastic.white" value={CF.mounts.handle_frame_plastic.white} />
              <InputField label="Коричневый" path="price_settings.classic_frames.mounts.handle_frame_plastic.brown" value={CF.mounts.handle_frame_plastic.brown} />
              <InputField label="Серый" path="price_settings.classic_frames.mounts.handle_frame_plastic.gray" value={CF.mounts.handle_frame_plastic.gray} />
              <InputField label="Черный" path="price_settings.classic_frames.mounts.handle_frame_plastic.black" value={CF.mounts.handle_frame_plastic.black} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Ручка рама (металл)</p>
              <InputField label="Белый" path="price_settings.classic_frames.mounts.handle_frame_metal.white" value={CF.mounts.handle_frame_metal.white} />
              <InputField label="Коричневый" path="price_settings.classic_frames.mounts.handle_frame_metal.brown" value={CF.mounts.handle_frame_metal.brown} />
              <InputField label="Серый" path="price_settings.classic_frames.mounts.handle_frame_metal.gray" value={CF.mounts.handle_frame_metal.gray} />
              <InputField label="Черный" path="price_settings.classic_frames.mounts.handle_frame_metal.black" value={CF.mounts.handle_frame_metal.black} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Ручка дверь 42мм</p>
              <InputField label="Белый" path="price_settings.classic_frames.mounts.handle_door_42mm.white" value={CF.mounts.handle_door_42mm.white} />
              <InputField label="Коричневый" path="price_settings.classic_frames.mounts.handle_door_42mm.brown" value={CF.mounts.handle_door_42mm.brown} />
              <InputField label="Серый" path="price_settings.classic_frames.mounts.handle_door_42mm.gray" value={CF.mounts.handle_door_42mm.gray} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Замок/защелка</p>
              <InputField label="Белый" path="price_settings.classic_frames.mounts.door_latch.white" value={CF.mounts.door_latch.white} />
              <InputField label="Коричневый" path="price_settings.classic_frames.mounts.door_latch.brown" value={CF.mounts.door_latch.brown} />
              <InputField label="Серый" path="price_settings.classic_frames.mounts.door_latch.gray" value={CF.mounts.door_latch.gray} />
              <InputField label="Шпингалет" path="price_settings.classic_frames.mounts.door_bolt" value={CF.mounts.door_bolt} />
            </div>
          )}
          <SubSectionHeader id="cf_hinges" title="Петли" icon={Link} />
          {expandedSubSection === 'cf_hinges' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Петли 42мм стандарт</p>
              <InputField label="Белый" path="price_settings.classic_frames.hinges_42mm.standard.white" value={CF.hinges_42mm.standard.white} />
              <InputField label="Коричневый" path="price_settings.classic_frames.hinges_42mm.standard.brown" value={CF.hinges_42mm.standard.brown} />
              <InputField label="Серый" path="price_settings.classic_frames.hinges_42mm.standard.gray" value={CF.hinges_42mm.standard.gray} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Усиленная петля (штифт)</p>
              <InputField label="Белый" path="price_settings.classic_frames.hinges_42mm.reinforced_pin.white" value={CF.hinges_42mm.reinforced_pin.white} />
              <InputField label="Коричневый" path="price_settings.classic_frames.hinges_42mm.reinforced_pin.brown" value={CF.hinges_42mm.reinforced_pin.brown} />
              <InputField label="Серый" path="price_settings.classic_frames.hinges_42mm.reinforced_pin.gray" value={CF.hinges_42mm.reinforced_pin.gray} />
              <InputField label="Черный" path="price_settings.classic_frames.hinges_42mm.reinforced_pin.black" value={CF.hinges_42mm.reinforced_pin.black} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Усиленная петля (доводчик)</p>
              <InputField label="Белый" path="price_settings.classic_frames.hinges_42mm.reinforced_closer.white" value={CF.hinges_42mm.reinforced_closer.white} />
              <InputField label="Коричневый" path="price_settings.classic_frames.hinges_42mm.reinforced_closer.brown" value={CF.hinges_42mm.reinforced_closer.brown} />
              <InputField label="Серый" path="price_settings.classic_frames.hinges_42mm.reinforced_closer.gray" value={CF.hinges_42mm.reinforced_closer.gray} />
              <InputField label="Черный" path="price_settings.classic_frames.hinges_42mm.reinforced_closer.black" value={CF.hinges_42mm.reinforced_closer.black} />
            </div>
          )}
        </div>
      )}

      <SectionHeader id="plisse_nets" title="Сетки ПЛИССЕ" icon={Scaling} colorClass="bg-blue-50 text-blue-600" />
      {expandedSection === 'plisse_nets' && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 mb-4 animate-in slide-in-from-top-1 space-y-2">
          <SubSectionHeader id="pn_markups" title="Коэффициенты и Работа" icon={Percent} />
          {expandedSubSection === 'pn_markups' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
              <InputField label="Коэффициент прибыли (X)" path="price_settings.plisse_nets.markups.profit_multiplier" value={PN.markups.profit_multiplier} adornment="X" />
              <InputField label="Сборка стандарт (м²)" path="price_settings.plisse_nets.markups.assembly_rate_standard" value={PN.markups.assembly_rate_standard} />
              <InputField label="Сборка встречное (м²)" path="price_settings.plisse_nets.markups.assembly_rate_meeting" value={PN.markups.assembly_rate_meeting} />
              <InputField label="RAL покраска (м.п.)" path="price_settings.plisse_nets.markups.ral_painting_rate_m" value={PN.markups.ral_painting_rate_m} />
            </div>
          )}
          <SubSectionHeader id="pn_profiles" title="Профили (м.п.)" icon={Box} />
          {expandedSubSection === 'pn_profiles' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Рама</p>
              <InputField label="Белый" path="price_settings.plisse_nets.profiles.frame.white" value={PN.profiles.frame.white} />
              <InputField label="Коричневый" path="price_settings.plisse_nets.profiles.frame.brown" value={PN.profiles.frame.brown} />
              <InputField label="Неокрас" path="price_settings.plisse_nets.profiles.frame.unpainted" value={PN.profiles.frame.unpainted} />
              <InputField label="Антрацит" path="price_settings.plisse_nets.profiles.frame.anthracite" value={PN.profiles.frame.anthracite} />
              <InputField label="RAL" path="price_settings.plisse_nets.profiles.frame.ral" value={PN.profiles.frame.ral} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Створка</p>
              <InputField label="Белый" path="price_settings.plisse_nets.profiles.sash.white" value={PN.profiles.sash.white} />
              <InputField label="Коричневый" path="price_settings.plisse_nets.profiles.sash.brown" value={PN.profiles.sash.brown} />
              <InputField label="Неокрас" path="price_settings.plisse_nets.profiles.sash.unpainted" value={PN.profiles.sash.unpainted} />
              <InputField label="Антрацит" path="price_settings.plisse_nets.profiles.sash.anthracite" value={PN.profiles.sash.anthracite} />
              <InputField label="RAL" path="price_settings.plisse_nets.profiles.sash.ral" value={PN.profiles.sash.ral} />
            </div>
          )}
          <SubSectionHeader id="pn_meshes" title="Полотна (м²)" icon={Gem} />
          {expandedSubSection === 'pn_meshes' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100 grid grid-cols-2 gap-x-2">
              <InputField label="Стандарт" path="price_settings.plisse_nets.meshes.standard" value={PN.meshes.standard} />
              <InputField label="Антикошка" path="price_settings.plisse_nets.meshes.antikoshka" value={PN.meshes.antikoshka} />
              <InputField label="АнтиПыль" path="price_settings.plisse_nets.meshes.antipyl" value={PN.meshes.antipyl} />
            </div>
          )}
          <SubSectionHeader id="pn_components" title="Комплектующие" icon={Package} />
          {expandedSubSection === 'pn_components' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
              <InputField label="Вставка в сетку (м.п.)" path="price_settings.plisse_nets.components.insert_mesh_m" value={PN.components.insert_mesh_m} />
              <InputField label="Вставка в раму (м.п.)" path="price_settings.plisse_nets.components.insert_frame_m" value={PN.components.insert_frame_m} />
              <InputField label="Ручка стандарт" path="price_settings.plisse_nets.components.handle_standard" value={PN.components.handle_standard} />
              <InputField label="Нить (м.п.)" path="price_settings.plisse_nets.components.thread_m" value={PN.components.thread_m} />
              <InputField label="Заклёпка (шт.)" path="price_settings.plisse_nets.components.rivet_pc" value={PN.components.rivet_pc} />
              <InputField label="Стопор (шт.)" path="price_settings.plisse_nets.components.stopper_pc" value={PN.components.stopper_pc} />
              <InputField label="Набор аксессуаров" path="price_settings.plisse_nets.components.accessories_set" value={PN.components.accessories_set} />
              <InputField label="Упаковка" path="price_settings.plisse_nets.components.packaging" value={PN.components.packaging} />
              <InputField label="Магнитная лента (м.п.)" path="price_settings.plisse_nets.components.magnetic_strip_m" value={PN.components.magnetic_strip_m} />
              <InputField label="Низкий порог (м.п.)" path="price_settings.plisse_nets.components.low_threshold_m" value={PN.components.low_threshold_m} />
            </div>
          )}
        </div>
      )}

      <SectionHeader id="plisse_blinds" title="Шторы ПЛИССЕ" icon={Palmtree} colorClass="bg-green-50 text-green-600" />
      {expandedSection === 'plisse_blinds' && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 mb-4 animate-in slide-in-from-top-1 space-y-2">
          <SubSectionHeader id="pb_markups" title="Коэффициенты и Работа" icon={Percent} />
          {expandedSubSection === 'pb_markups' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
              <InputField label="Коэффициент прибыли (X)" path="price_settings.plisse_blinds.markups.profit_multiplier" value={PB.markups.profit_multiplier} adornment="X" />
              <InputField label="Сборка (м²)" path="price_settings.plisse_blinds.markups.assembly_rate" value={PB.markups.assembly_rate} />
              <InputField label="RAL покраска (м.п.)" path="price_settings.plisse_blinds.ral_painting.rate_m" value={PB.ral_painting.rate_m} />
              <InputField label="RAL мин. за изделие" path="price_settings.plisse_blinds.ral_painting.min_per_item" value={PB.ral_painting.min_per_item} />
            </div>
          )}
          <SubSectionHeader id="pb_fabrics" title="Ткани (м²)" icon={Gem} />
          {expandedSubSection === 'pb_fabrics' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100 grid grid-cols-2 gap-x-2">
              <InputField label="Blackout 100%" path="price_settings.plisse_blinds.fabrics_m2.full_blackout" value={PB.fabrics_m2.full_blackout} />
              <InputField label="Semi-Blackout" path="price_settings.plisse_blinds.fabrics_m2.semi_blackout" value={PB.fabrics_m2.semi_blackout} />
            </div>
          )}
          <SubSectionHeader id="pb_lite" title="Система ЛАЙТ" icon={Box} />
          {expandedSubSection === 'pb_lite' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
              <InputField label="Профиль (м.п.)" path="price_settings.plisse_blinds.lite_system.profile_m" value={PB.lite_system.profile_m} />
              <InputField label="Вставка (м.п.)" path="price_settings.plisse_blinds.lite_system.insert_m" value={PB.lite_system.insert_m} />
              <InputField label="Набор аксессуаров" path="price_settings.plisse_blinds.lite_system.accessories_set" value={PB.lite_system.accessories_set} />
            </div>
          )}
          <SubSectionHeader id="pb_cozy" title="Система УЮТ" icon={Settings2} />
          {expandedSubSection === 'pb_cozy' && (
            <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Профиль рамы (м.п.)</p>
              <InputField label="Белый/стандарт" path="price_settings.plisse_blinds.cozy_system.frame_m.white" value={PB.cozy_system.frame_m.white} />
              <InputField label="Неокрас" path="price_settings.plisse_blinds.cozy_system.frame_m.unpainted" value={PB.cozy_system.frame_m.unpainted} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Профиль створки (м.п.)</p>
              <InputField label="Белый/стандарт" path="price_settings.plisse_blinds.cozy_system.sash_m.white" value={PB.cozy_system.sash_m.white} />
              <InputField label="Неокрас" path="price_settings.plisse_blinds.cozy_system.sash_m.unpainted" value={PB.cozy_system.sash_m.unpainted} />
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1 mt-3">Прочее</p>
              <InputField label="Вставка (м.п.)" path="price_settings.plisse_blinds.cozy_system.insert_m" value={PB.cozy_system.insert_m} />
              <InputField label="Набор аксессуаров" path="price_settings.plisse_blinds.cozy_system.accessories_set" value={PB.cozy_system.accessories_set} />
              <InputField label="Сборка (м²)" path="price_settings.plisse_blinds.cozy_system.assembly_rate" value={PB.cozy_system.assembly_rate} />
              <InputField label="Пружина (шт.)" path="price_settings.plisse_blinds.cozy_system.spring_pc" value={PB.cozy_system.spring_pc} />
              <InputField label="Скотч-фиксация" path="price_settings.plisse_blinds.cozy_system.scotch_fix" value={PB.cozy_system.scotch_fix} />
            </div>
          )}
        </div>
      )}

      <SectionHeader id="window_works" title="Обслуживание окон" icon={Wrench} colorClass="bg-purple-50 text-purple-600" />
      {expandedSection === 'window_works' && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 mb-4 animate-in slide-in-from-top-1">
          <InputField label="Замена уплотнителя (м.п.)" path="price_settings.window_works.labor_rates.seal_replacement_m" value={WW.labor_rates.seal_replacement_m} />
          <InputField label="Гребенка ПЛАСТИК" path="price_settings.window_works.labor_rates.comb_plastic" value={WW.labor_rates.comb_plastic} />
          <InputField label="Гребенка МЕТАЛЛ" path="price_settings.window_works.labor_rates.comb_metal" value={WW.labor_rates.comb_metal} />
          <InputField label="Детский замок" path="price_settings.window_works.labor_rates.child_lock" value={WW.labor_rates.child_lock} />
          <InputField label="Регулировка ОКНО" path="price_settings.window_works.labor_rates.adjustment_window" value={WW.labor_rates.adjustment_window} />
          <InputField label="Регулировка ДВЕРЬ ПВХ" path="price_settings.window_works.labor_rates.adjustment_door" value={WW.labor_rates.adjustment_door} />
        </div>
      )}

      <SectionHeader id="logistics" title="Логистика и Монтаж" icon={Truck} colorClass="bg-gray-50 text-gray-600" />
      {expandedSection === 'logistics' && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 mb-4 animate-in slide-in-from-top-1">
          <InputField label="Доставка (база)" path="price_settings.logistics.delivery_base" value={LOG.delivery_base} />
          <InputField label="Цена за 1 км" path="price_settings.logistics.delivery_km" value={LOG.delivery_km} />
          <InputField label="Монтаж Плиссе (Окно)" path="price_settings.logistics.install_plisse_window" value={LOG.install_plisse_window} />
          <InputField label="Монтаж Плиссе (Дверь)" path="price_settings.logistics.install_plisse_door" value={LOG.install_plisse_door} />
          <InputField label="Монтаж Плиссе Портал" path="price_settings.logistics.install_plisse_portal" value={LOG.install_plisse_portal} />
          <InputField label="Монтаж Дверь стандарт" path="price_settings.logistics.install_door_standard" value={LOG.install_door_standard} />
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white/80 backdrop-blur-md border-t border-gray-100 flex gap-3 z-50">
        <button onClick={onReset} className="flex-1 py-4 border-2 border-gray-100 text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 active:bg-gray-50 transition-all"><RotateCcw size={16} /> Сброс</button>
        <button onClick={handleSaveAll} className="flex-[2] py-4 bg-gray-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-xl shadow-gray-200 active:scale-95 transition-all"><Save size={16} /> Сохранить всё</button>
      </div>
    </div>
  );
};

export default AdminScreen;
