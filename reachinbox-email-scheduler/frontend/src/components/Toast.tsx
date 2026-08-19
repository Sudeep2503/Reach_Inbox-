import { createContext, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string }
interface ToastContextValue { showToast: (message: string, kind?: ToastKind) => void }

const ToastContext = createContext<ToastContextValue | null>(null);

export { ToastContext };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const showToast = (message: string, kind: ToastKind = 'info') => {
    const id = Date.now();
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
  };
  return <ToastContext.Provider value={{ showToast }}>
    {children}
    <div className="fixed right-4 top-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3" aria-live="polite">
      {toasts.map((toast) => <Toast key={toast.id} toast={toast} onClose={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} />)}
    </div>
  </ToastContext.Provider>;
}

function Toast({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? XCircle : Info;
  return <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-xl">
    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${toast.kind === 'success' ? 'text-emerald-500' : toast.kind === 'error' ? 'text-rose-500' : 'text-[#3458f5]'}`} />
    <span className="flex-1 leading-5">{toast.message}</span>
    <button type="button" onClick={onClose} aria-label="Dismiss notification" className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
  </div>;
}

