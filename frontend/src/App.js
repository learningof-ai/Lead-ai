import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { RealtimeProvider } from "@/context/RealtimeContext";
import Layout from "@/components/Layout";
import { FullPageLoading } from "@/components/PageHeader";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import Leads from "@/pages/Leads";
import Pipeline from "@/pages/Pipeline";
import LiveCalls from "@/pages/LiveCalls";
import VapiSetup from "@/pages/VapiSetup";
import SetupGuide from "@/pages/SetupGuide";
import WebhookLogs from "@/pages/WebhookLogs";
import Settings from "@/pages/Settings";

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return (
    <RealtimeProvider>
      <Layout>{children}</Layout>
    </RealtimeProvider>
  );
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoading />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/leads" element={<Protected><Leads /></Protected>} />
      <Route path="/pipeline" element={<Protected><Pipeline /></Protected>} />
      <Route path="/live-calls" element={<Protected><LiveCalls /></Protected>} />
      <Route path="/setup-guide" element={<Protected><SetupGuide /></Protected>} />
      <Route path="/vapi-setup" element={<Protected><VapiSetup /></Protected>} />
      <Route path="/webhook-logs" element={<Protected><WebhookLogs /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
