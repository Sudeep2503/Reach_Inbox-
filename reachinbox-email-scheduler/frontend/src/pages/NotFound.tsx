import { Link } from 'react-router-dom';
import { Home as HomeIcon } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-white">
      <p className="text-6xl font-bold text-indigo-400">404</p>
      <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-slate-400">The page you are looking for does not exist.</p>
      <Link
        to="/"
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold transition hover:bg-indigo-400"
      >
        <HomeIcon className="h-4 w-4" />
        Back to Home
      </Link>
    </div>
  );
}
