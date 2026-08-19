import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './components/AuthContext.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import Login from './pages/Login.js';
import Dashboard from './pages/Dashboard.js';
import ScheduledEmails from './pages/ScheduledEmails.js';
import SentEmails from './pages/SentEmails.js';
import NotFound from './pages/NotFound.js';
import { ToastProvider } from './components/Toast.js';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
            />
            <Route
              path="/scheduled"
              element={<ProtectedRoute><ScheduledEmails /></ProtectedRoute>}
            />
            <Route
              path="/sent"
              element={<ProtectedRoute><SentEmails /></ProtectedRoute>}
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ToastProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
