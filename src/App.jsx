import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Auth pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
// Add page imports here
import AppLayout from '@/components/AppLayout';
import Home from '@/pages/Home';
import Events from '@/pages/Events';
import People from '@/pages/People';
import Accreditations from '@/pages/Accreditations';
import AccessLevels from '@/pages/AccessLevels';
import Documents from '@/pages/Documents';
import Users from '@/pages/Users';
import Audit from '@/pages/Audit';
import ProviderPortal from '@/pages/ProviderPortal';
import AccessControl from '@/pages/AccessControl';
import AccessMonitor from '@/pages/AccessMonitor';
import AccessStation from '@/pages/AccessStation';
import AccessManual from '@/pages/AccessManual';
import ProviderRegister from '@/pages/ProviderRegister';
import Messages from '@/pages/Messages';
import AccreditationFacial from '@/pages/AccreditationFacial';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import ZKTecoDevices from '@/pages/ZKTecoDevices';
import Vehicles from '@/pages/Vehicles';
import ParkingSectors from '@/pages/ParkingSectors';
import Companies from '@/pages/Companies';

const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password', '/provider-register'];

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, authChecked } = useAuth();
  const location = useLocation();
  const isAuthRoute = AUTH_ROUTES.includes(location.pathname);

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors — skip redirect when already on an auth route
  if (authError && !isAuthRoute) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login page instead of platform login
      return <Navigate to="/login" replace />;
    }
  }

  // Unauthenticated visitors (public app) land on login page
  if (!isAuthenticated && authChecked && !isAuthRoute) {
    return <Navigate to="/login" replace />;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/registro/:company" element={<ProviderRegister />} />
      <Route path="/provider-register" element={<ProviderRegister />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/events" element={<Events />} />
        <Route path="/people" element={<People />} />
        <Route path="/accreditations" element={<Accreditations />} />
        <Route path="/access-levels" element={<AccessLevels />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/users" element={<Users />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/accreditation-facial" element={<AccreditationFacial />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/access-control" element={<AccessControl />} />
        <Route path="/access-monitor" element={<AccessMonitor />} />
        <Route path="/zkteco-devices" element={<ZKTecoDevices />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/parking-sectors" element={<ParkingSectors />} />
        <Route path="/companies" element={<Companies />} />
      </Route>
      <Route path="/portal" element={<ProviderPortal />} />
      <Route path="/control-acceso" element={<AccessStation />} />
      <Route path="/control-manual" element={<AccessManual />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App