import React from "react";
import { DashboardLayout } from "./DashboardLayout";

export function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout role="employee">
      {children}
    </DashboardLayout>
  );
}
