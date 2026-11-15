import DashboardPage from "./DemoDashboardView";
import { createDemoDashboard } from "@/lib/demo-dashboard";

export default function DemoDashboardPreviewPage() {
  return <DashboardPage previewData={createDemoDashboard()} />;
}
