import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { Loader2, Search, Shield } from "lucide-react";

export default function AdminAuditLog() {
  useEffect(() => { document.title = "Audit Log - TaskFlow"; }, []);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEntity, setFilterEntity] = useState("All");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const entityTypes = [
    "All",
    "profiles",
    "job_applications",
    "candidates",
    "offer_letters",
    "interview_sessions",
    "assessment_attempts",
    "work_logs",
    "leaves",
    "complaints",
    "background_verifications"
  ] as const;

  useEffect(() => {
    fetchLogs();
  }, [page, filterEntity]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterEntity !== "All") {
        query = query.eq("entity_type", filterEntity);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error("Failed to load audit log:", err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      log.actor_id?.toLowerCase().includes(q) ||
      log.entity_id?.toLowerCase().includes(q) ||
      log.action?.toLowerCase().includes(q) ||
      log.entity_type?.toLowerCase().includes(q)
    );
  });

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      INSERT: "bg-emerald-100 text-emerald-800",
      UPDATE: "bg-blue-100 text-blue-800",
      DELETE: "bg-red-100 text-red-800",
    };
    return colors[action] || "bg-slate-100 text-slate-800";
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "CRITICAL": return "text-red-500";
      case "WARNING": return "text-amber-500";
      default: return "text-slate-400";
    }
  };

  const formatTime = (t: string) =>
    new Date(t).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

  return (
    <DashboardLayout role="admin">
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <Shield className="w-8 h-8 text-slate-700" /> Audit Log
          </h1>
          <p className="text-slate-500 mt-1">
            Track all changes made to critical data across the system.
          </p>
        </div>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="border-b border-slate-100">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by ID, action, or table..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-800"
                />
              </div>
              <select
                value={filterEntity}
                onChange={(e) => { setFilterEntity(e.target.value); setPage(0); }}
                className="p-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
              >
                {entityTypes.map((t) => (
                  <option key={t} value={t}>{t === "All" ? "All Tables" : t}</option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center p-12">
                <Shield className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">No audit records found</p>
                <p className="text-sm text-slate-400 mt-1">
                  {search ? "Try a different search term." : "Audit records will appear as changes are made."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-left p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Time</th>
                      <th className="text-left p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                      <th className="text-left p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Table</th>
                      <th className="text-left p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Record ID</th>
                      <th className="text-left p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Changed Columns</th>
                      <th className="text-left p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 text-slate-600 font-mono text-xs whitespace-nowrap">
                          {formatTime(log.created_at)}
                        </td>
                        <td className="p-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${getActionBadge(log.action)}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700 font-medium text-xs">{log.entity_type}</td>
                        <td className="p-3 text-slate-500 font-mono text-xs">{log.entity_id?.substring(0, 8)}...</td>
                        <td className="p-3 text-slate-600 text-xs max-w-[200px] truncate">
                          {log.changed_columns?.join(", ") || "-"}
                        </td>
                        <td className="p-3">
                          <span className={`inline-block w-2 h-2 rounded-full ${getSeverityIcon(log.severity)}`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-between items-center p-3 border-t border-slate-100 bg-slate-50/50">
              <span className="text-xs text-slate-500">
                Page {page + 1}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 text-xs font-medium rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={logs.length < PAGE_SIZE}
                  className="px-3 py-1 text-xs font-medium rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
