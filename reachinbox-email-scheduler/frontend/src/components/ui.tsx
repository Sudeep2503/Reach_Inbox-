import { AlertCircle, ChevronLeft, ChevronRight, LoaderCircle, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Pagination } from '../types/api';
import type { EmailJobStatus } from '../types/email';

export function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  const styles = { primary: 'bg-[#3458f5] text-white shadow-lg shadow-[#3458f5]/20 hover:bg-[#2949d4]', secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50', ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-900' };
  return <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#3458f5]/30 disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}>{children}</button>;
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700"><span>{label}</span>{children}{error && <span className="mt-1 block text-xs font-normal text-rose-600">{error}</span>}</label>;
}

export function StatusBadge({ status }: { status: EmailJobStatus | string }) {
  const tone = status === 'SENT' ? 'bg-emerald-50 text-emerald-700' : status === 'FAILED' ? 'bg-rose-50 text-rose-700' : status === 'PROCESSING' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${tone}`}>{status}</span>;
}

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3" aria-label="Loading"><LoaderCircle className="mx-auto h-6 w-6 animate-spin text-[#3458f5]" />{Array.from({ length: rows }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 text-center"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#eef2ff] text-[#3458f5]"><Plus className="h-5 w-5" /></div><h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-rose-100 bg-rose-50/50 px-6 text-center"><AlertCircle className="h-6 w-6 text-rose-500" /><p className="mt-3 text-sm font-medium text-rose-800">{message}</p><Button variant="secondary" className="mt-4" onClick={onRetry}>Try again</Button></div>;
}

export function PaginationControls({ pagination, onPageChange }: { pagination: Pagination; onPageChange: (page: number) => void }) {
  return <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm text-slate-500"><span>Page {pagination.page} of {Math.max(pagination.totalPages, 1)}</span><div className="flex gap-2"><Button variant="secondary" className="px-3 py-2" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}><ChevronLeft className="h-4 w-4" />Previous</Button><Button variant="secondary" className="px-3 py-2" disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)}>Next<ChevronRight className="h-4 w-4" /></Button></div></div>;
}