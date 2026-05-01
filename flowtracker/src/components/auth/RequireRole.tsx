import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import type { UserRole } from "@/types";

function homeForRole(role: UserRole) {
  if (role === "admin") return "/admin";
  if (role === "team_lead") return "/team_lead";
  return "/employee";
}

export default function RequireRole({
  allow,
  children,
}: {
  allow: UserRole | UserRole[];
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  const allowList = Array.isArray(allow) ? allow : [allow];

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  // Profile is fetched asynchronously outside of auth callbacks to avoid Supabase auth-js deadlocks.
  if (!profile) return <div className="p-8 text-sm text-muted-foreground">Loading profile...</div>;

  if (profile.approval_status !== "approved" && profile.role !== "admin") {
    return <Navigate to="/pending-approval" replace />;
  }

  if (!allowList.includes(profile.role)) {
    return <Navigate to={homeForRole(profile.role)} replace />;
  }

  return <>{children}</>;
}
