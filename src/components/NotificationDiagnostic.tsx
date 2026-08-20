import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function NotificationDiagnostic() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [unreadItems, setUnreadItems] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  const addLog = (msg: string) => {
    console.log("[DIAGNOSTIC]", msg);
    setLogMessages((prev) => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
  };

  // 1. Raw Fetch: Direct Supabase database query on mount
  useEffect(() => {
    async function loadRawData() {
      setLoading(true);
      addLog("Fetching authenticated user session...");
      
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        addLog(`Auth Error: ${authErr?.message || "No logged in user"}`);
        setLoading(false);
        return;
      }

      setCurrentUser(user);
      addLog(`Authenticated as: ${user.id} (${user.email})`);

      // Raw Fetch 1: Unread notifications only (is_read = false)
      addLog(`Executing raw query: SELECT * FROM notifications WHERE user_id = '${user.id}' AND is_read = false`);
      const { data: unreadData, error: unreadErr } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (unreadErr) {
        addLog(`Unread Query Error: ${unreadErr.message} (Code: ${unreadErr.code})`);
      } else {
        addLog(`Found ${unreadData?.length || 0} unread notification rows.`);
        setUnreadItems(unreadData || []);
      }

      // Raw Fetch 2: All notifications for user
      const { data: allData, error: allErr } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (allErr) {
        addLog(`All Notifications Query Error: ${allErr.message}`);
      } else {
        setAllItems(allData || []);
      }

      setLoading(false);
    }

    loadRawData();
  }, []);

  // 2. Raw Update: Direct database update followed by 3. Hard Reload Test
  const handleForceMarkRead = async () => {
    if (!currentUser) {
      alert("No authenticated user found!");
      return;
    }

    setIsUpdating(true);
    addLog("Sending raw UPDATE: UPDATE notifications SET is_read = true WHERE user_id = '" + currentUser.id + "' AND is_read = false");

    try {
      const { data, error, count, status } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", currentUser.id)
        .eq("is_read", false)
        .select();

      if (error) {
        addLog(`UPDATE FAILED! Status: ${status}, Error: ${error.message} (Code: ${error.code})`);
        alert(`Update failed with status ${status}: ${error.message}`);
        setIsUpdating(false);
      } else {
        addLog(`UPDATE SUCCESSFUL! HTTP Status: ${status}. Updated ${data?.length || 0} rows.`);
        addLog("TRIGGERING HARD BROWSER RELOAD (window.location.reload())...");

        // 3. The Hard Reload Test: Force browser refresh to verify database persistence
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    } catch (err: any) {
      addLog(`Unexpected exception during update: ${err.message}`);
      setIsUpdating(false);
    }
  };

  return (
    <div style={{ padding: "24px", fontFamily: "monospace", background: "#f8fafc", minHeight: "100vh", color: "#0f172a" }}>
      <h2>Notification Diagnostic (Bare-Bones Standalone Component)</h2>
      <hr />

      <div style={{ margin: "16px 0" }}>
        <strong>Current Auth User:</strong> {currentUser ? `${currentUser.email} (${currentUser.id})` : "Loading..."}
      </div>

      <div style={{ margin: "16px 0", display: "flex", gap: "12px", alignItems: "center" }}>
        <button
          onClick={handleForceMarkRead}
          disabled={isUpdating || loading || !currentUser}
          style={{
            padding: "10px 20px",
            fontSize: "14px",
            fontWeight: "bold",
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          {isUpdating ? "Updating & Reloading..." : "Force Mark Read"}
        </button>

        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "10px 20px",
            fontSize: "14px",
            background: "#64748b",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          Manual Hard Refresh
        </button>
      </div>

      <div style={{ margin: "16px 0", background: "#1e293b", color: "#38bdf8", padding: "12px", borderRadius: "4px" }}>
        <strong>Console Trace Log:</strong>
        <div style={{ marginTop: "8px", maxHeight: "150px", overflowY: "auto", fontSize: "12px" }}>
          {logMessages.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div>
          <h3>Raw Unread Notifications ({unreadItems.length})</h3>
          <pre style={{ background: "#e2e8f0", padding: "12px", borderRadius: "4px", maxHeight: "400px", overflowY: "auto" }}>
            {loading ? "Loading unread items..." : JSON.stringify(unreadItems, null, 2)}
          </pre>
        </div>

        <div>
          <h3>All Notifications for User ({allItems.length})</h3>
          <pre style={{ background: "#e2e8f0", padding: "12px", borderRadius: "4px", maxHeight: "400px", overflowY: "auto" }}>
            {loading ? "Loading all items..." : JSON.stringify(allItems, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
