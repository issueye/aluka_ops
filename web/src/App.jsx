import { Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthGate } from "@/components/AuthGate";
import { AgentProvider } from "@/lib/agentContext";
import { Dashboard } from "@/pages/Dashboard";
import { Services } from "@/pages/Services";
import { ServiceDetail } from "@/pages/ServiceDetail";
import { Agents } from "@/pages/Agents";
import { Runtimes } from "@/pages/Runtimes";
import { Files } from "@/pages/Files";
import { Sites } from "@/pages/Sites";
import { SiteDetail } from "@/pages/SiteDetail";
import { TerminalPage } from "@/pages/Terminal";
import { Tunnels } from "@/pages/Tunnels";
import { Operations } from "@/pages/Operations";
import { AuditLog } from "@/pages/AuditLog";
import { Settings } from "@/pages/Settings";
import { Login } from "@/pages/Login";

export default function App() {
  return (
    <AgentProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <AuthGate>
            <AppLayout />
          </AuthGate>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/services" element={<Services />} />
        <Route path="/services/:id" element={<ServiceDetail />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/runtimes" element={<Runtimes />} />
        <Route path="/sites" element={<Sites />} />
        <Route path="/sites/:id" element={<SiteDetail />} />
        <Route path="/tunnels" element={<Tunnels />} />
        <Route path="/terminal" element={<TerminalPage />} />
        <Route path="/files" element={<Files />} />
        <Route path="/operations" element={<Operations />} />
        <Route path="/audit-logs" element={<AuditLog />} />
        <Route path="/settings" element={<Settings />} />
        {/* 兼容旧路径 */}
        <Route path="/proxy-ports" element={<Sites />} />
        <Route path="/apps" element={<Sites />} />
        {/* 兜底:未知路径回到仪表盘 */}
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
    </AgentProvider>
  );
}
