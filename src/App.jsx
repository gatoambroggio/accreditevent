import { Toaster } from "@/components/ui/toaster"
import ErrorBoundary from '@/components/ErrorBoundary'
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
import PersonasAutonomas from '@/pages/PersonasAutonomas';
import Accreditations from '@/pages/Accreditations';
import PersonalAcreditado from '@/pages/PersonalAcreditado';
import AccessLevels from '@/pages/AccessLevels';
import Documents from '@/pages/Documents';
import Users from '@/pages/Users';
import Audit from '@/pages/Audit';
import ProviderPortal from '@/pages/ProviderPortal';
import AccessControl from '@/pages/AccessControl';
import AccessHub from '@/pages/AccessHub';
import AccessMonitor from '@/pages/AccessMonitor';
import AccessStation from '@/pages/AccessStation';
import AccessQrStation from '@/pages/AccessQrStation';
import AccessManual from '@/pages/AccessManual';
import ProviderRegister from '@/pages/ProviderRegister';
import Messages from '@/pages/Messages';
import AccreditationFacial from '@/pages/AccreditationFacial';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import ZKTecoDevices from '@/pages/ZKTecoDevices';
import DahuaDevices from '@/pages/DahuaDevices';
import Vehicles from '@/pages/Vehicles';
import ParkingSectors from '@/pages/ParkingSectors';
import ParkingCapacities from '@/pages/ParkingCapacities';
import Companies from '@/pages/Companies';
import RegisteredPeople from '@/pages/RegisteredPeople';
import RegisteredVehicles from '@/pages/RegisteredVehicles';
import ProviderCompanies from '@/pages/ProviderCompanies';
import EmpresaRegister from '@/pages/EmpresaRegister';
import EmpresaPortal from '@/pages/EmpresaPortal';
import DniScan from '@/pages/DniScan';
import CustomFields from '@/pages/CustomFields';
import Appearance from '@/pages/Appearance';
import EmergencyScan from '@/pages/EmergencyScan';
import PdaStations from '@/pages/PdaStations';
import PdaId from '@/pages/PdaId';
import Notifications from '@/pages/Notifications';

const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password', '/provider-register', '/registro-empresa'];

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, authChecked } = useAuth();
  const location = useLocation();
  const isAuthRoute = AUTH_ROUTES.includes(location.pathname) || location.pathname.startsWith('/registro');

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
      <Route path="/registro/:eventId" element={<ProviderRegister />} />
      <Route path="/provider-register" element={<ProviderRegister />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/events" element={<Events />} />
        <Route path="/people" element={<People />} />
        <Route path="/personas-autonomas" element={<PersonasAutonomas />} />
        <Route path="/accreditations" element={<Accreditations />} />
        <Route path="/personal-acreditado" element={<PersonalAcreditado />} />
        <Route path="/access-levels" element={<AccessLevels />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/users" element={<Users />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/accreditation-facial" element={<AccreditationFacial />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/access-control" element={<AccessHub />} />
        <Route path="/access-monitor" element={<AccessMonitor />} />
        <Route path="/pda-stations" element={<PdaStations />} />
        <Route path="/pda-id" element={<PdaId />} />
        <Route path="/zkteco-devices" element={<ZKTecoDevices />} />
        <Route path="/dahua-devices" element={<DahuaDevices />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/parking-sectors" element={<ParkingSectors />} />
        <Route path="/parking-capacities" element={<ParkingCapacities />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/registered-people" element={<RegisteredPeople />} />
        <Route path="/registered-vehicles" element={<RegisteredVehicles />} />
        <Route path="/provider-companies" element={<ProviderCompanies />} />
        <Route path="/dni-scan" element={<DniScan />} />
        <Route path="/custom-fields" element={<CustomFields />} />
        <Route path="/apariencia" element={<Appearance />} />
        <Route path="/emergency-scan" element={<EmergencyScan />} />
        <Route path="/notifications" element={<Notifications />} />
      </Route>
      <Route path="/portal" element={<ProviderPortal />} />
      <Route path="/registro-empresa" element={<EmpresaRegister />} />
      <Route path="/empresa-portal" element={<EmpresaPortal />} />
      <Route path="/control-acceso" element={<AccessStation />} />
      <Route path="/control-qr" element={<AccessQrStation mode="person" />} />
      <Route path="/control-vehicular" element={<AccessQrStation mode="vehicle" />} />
      <Route path="/control-manual" element={<AccessManual />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App