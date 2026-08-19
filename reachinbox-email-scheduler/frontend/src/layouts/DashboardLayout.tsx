import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Inbox, LayoutDashboard, LogOut, Mail, Menu, Plus, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui';

export default function DashboardLayout({ children, onCompose }: { children: ReactNode; onCompose?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const handleLogout = async () => { await logout(); navigate('/login', { replace: true }); };
  const navItems = [{ to: '/dashboard', label: 'Overview', icon: LayoutDashboard }, { to: '/scheduled', label: 'Scheduled', icon: Inbox }, { to: '/sent', label: 'Sent emails', icon: Mail }];
  return <div className="min-h-screen bg-[#f7f8fa] text-slate-900">
    <header className="fixed inset-x-0 top-0 z-30 h-16 border-b border-slate-200 bg-white/90 backdrop-blur"><div className="flex h-full items-center justify-between px-5 lg:px-8"><Link to="/dashboard" className="flex items-center gap-2.5 text-lg font-bold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#3458f5] text-white"><Mail className="h-5 w-5" /></span>ReachInbox</Link><div className="flex items-center gap-4"><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{user?.name}</p><p className="text-xs text-slate-400">{user?.email}</p></div><Avatar name={user?.name ?? 'User'} src={user?.avatarUrl} /><button type="button" onClick={() => setOpen((value) => !value)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button></div></div></header>
    <aside className={`fixed bottom-0 left-0 top-16 z-20 w-64 border-r border-slate-200 bg-white p-4 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}><div className="flex items-center justify-between lg:hidden"><span className="text-sm font-semibold">Navigation</span><button type="button" onClick={() => setOpen(false)} aria-label="Close navigation"><X className="h-5 w-5" /></button></div><Button className="mt-5 w-full" onClick={onCompose}><Plus className="h-4 w-4" />Compose new email</Button><nav className="mt-8 space-y-1">{navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-[#eef2ff] text-[#3458f5]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><Icon className="h-4 w-4" />{label}</NavLink>)}</nav><div className="absolute inset-x-4 bottom-5 border-t border-slate-100 pt-4"><button type="button" onClick={() => void handleLogout()} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600"><LogOut className="h-4 w-4" />Log out</button></div></aside>
    {open && <button type="button" className="fixed inset-0 z-10 bg-slate-900/20 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation overlay" />}
    <main className="min-h-screen pt-16 lg:pl-64"><div className="mx-auto max-w-[1440px] px-5 py-8 lg:px-10">{children}</div></main>
  </div>;
}

function Avatar({ name, src }: { name: string; src?: string | null }) { return src ? <img src={src} alt={`${name} avatar`} className="h-9 w-9 rounded-full object-cover" /> : <div className="grid h-9 w-9 place-items-center rounded-full bg-[#dbe3ff] text-sm font-bold text-[#3458f5]">{name.slice(0, 1).toUpperCase()}</div>; }