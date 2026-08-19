import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/auth.service.js';
import { ArrowRight, Mail } from 'lucide-react';

export default function Login() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleGoogleLogin = () => {
    window.location.href = authService.getGoogleLoginUrl();
  };

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <div className="mx-auto grid min-h-screen max-w-7xl items-center gap-16 px-6 py-12 lg:grid-cols-[1fr_430px] lg:px-16">
        <div className="hidden lg:block">
          <div className="flex items-center gap-3 text-lg font-bold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#3458f5] text-white"><Mail className="h-5 w-5" /></span>
            ReachInbox
          </div>
          <p className="mt-28 max-w-xl text-6xl font-semibold leading-[1.05] tracking-[-0.06em] text-[#111827]">Your inbox,<br />on your schedule.</p>
          <p className="mt-7 max-w-md text-lg leading-8 text-slate-500">Plan thoughtful outreach, keep every delivery visible, and let the queue handle the timing.</p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_70px_rgba(30,41,59,0.10)] sm:p-10">
          <div className="flex flex-col text-center">
            <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-[#eef2ff] text-[#3458f5]"><Mail className="h-7 w-7" /></div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em]">Welcome back</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Sign in to manage your email campaigns.</p>
          </div>
          <button
            onClick={handleGoogleLogin}
            type="button"
            className="mt-10 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#3458f5] focus:ring-offset-2"
          >
            <span className="flex items-center gap-3"><span className="font-bold text-[#4285f4]">G</span> Continue with Google</span><ArrowRight className="h-4 w-4 text-slate-400" />
          </button>
          <p className="mt-8 text-center text-xs leading-5 text-slate-400">Authentication is handled securely by Google and your ReachInbox server session.</p>
        </div>
      </div>
    </div>
  );
}
