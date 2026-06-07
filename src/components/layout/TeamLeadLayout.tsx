import React from "react";
import { DashboardLayout } from "./DashboardLayout";

export function TeamLeadLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout role="team_lead">
      {children}
    </DashboardLayout>
  );
}
