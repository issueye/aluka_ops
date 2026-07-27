import { Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Dashboard } from "@/pages/Dashboard";
import { Services } from "@/pages/Services";
import { ServiceDetail } from "@/pages/ServiceDetail";
import { Runtimes } from "@/pages/Runtimes";
import { Artifacts } from "@/pages/Artifacts";
import { Operations } from "@/pages/Operations";
import { AuditLog } from "@/pages/AuditLog";
import { Settings } from "@/pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/services" element={<Services />} />
        <Route path="/services/:id" element={<ServiceDetail />} />
        <Route path="/runtimes" element={<Runtimes />} />
        <Route path="/artifacts" element={<Artifacts />} />
        <Route path="/operations" element={<Operations />} />
        <Route path="/audit-logs" element={<AuditLog />} />
        <Route path="/settings" element={<Settings />} />
        {/* 兜底:未知路径回到仪表盘 */}
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}
