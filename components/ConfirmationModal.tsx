import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  isDestructive?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ 
  isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', isDestructive = false 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100 border border-white/20">
        <div className="p-6 text-center">
            <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${isDestructive ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">{title}</h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">{message}</p>
            
            <div className="flex gap-3">
                <button 
                    onClick={onClose}
                    className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition"
                >
                    Cancel
                </button>
                <button 
                    onClick={() => { onConfirm(); onClose(); }}
                    className={`flex-1 py-3 text-white font-bold rounded-xl shadow-lg transition ${
                        isDestructive 
                        ? 'bg-red-600 hover:bg-red-700 shadow-red-200' 
                        : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                    }`}
                >
                    {confirmText}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;