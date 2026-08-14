
import React from 'react';
import { Clock, Loader2 } from 'lucide-react';

const InProgressScreen: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col bg-gray-50 p-6 items-center justify-center text-center">
      <div className="bg-white p-10 rounded-[40px] shadow-sm border border-gray-100 flex flex-col items-center gap-6">
        <div className="bg-indigo-50 p-5 rounded-3xl text-indigo-600 animate-pulse">
          <Clock size={48} />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight">Замеры в работе</h2>
          <p className="text-xs text-gray-400 mt-2 font-medium max-w-[200px] leading-relaxed">
            Здесь будут отображаться замеры, которые находятся в процессе обработки.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full border border-gray-100">
          <Loader2 size={14} className="animate-spin text-indigo-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Синхронизация</span>
        </div>
      </div>
    </div>
  );
};

export default InProgressScreen;
