import React, { useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error';

interface ToastProps {
  message: string;
  type: ToastType;
  isVisible: boolean;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, isVisible, onClose }) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[70] animate-slide-up">
      <div className={`flex items-center p-4 rounded-xl shadow-xl border backdrop-blur-md ${
          type === 'success' 
          ? 'bg-white/95 border-emerald-100 text-emerald-800 shadow-emerald-900/5' 
          : 'bg-white/95 border-red-100 text-red-800 shadow-red-900/5'
      }`}>
        {type === 'success' ? (
            <div className="bg-emerald-100 p-1.5 rounded-full mr-3"><CheckCircle className="w-5 h-5 text-emerald-600" /></div>
        ) : (
            <div className="bg-red-100 p-1.5 rounded-full mr-3"><XCircle className="w-5 h-5 text-red-600" /></div>
        )}
        <div className="mr-6">
            <p className="font-bold text-sm">{type === 'success' ? 'Success' : 'Error'}</p>
            <p className="text-xs opacity-80 font-medium">{message}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
};

export default Toast;