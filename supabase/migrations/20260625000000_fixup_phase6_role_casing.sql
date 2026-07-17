-- =============================================================================
-- Fixup: Phase 6 RLS policies used uppercase roles ('ADMIN', 'HR') but
-- profiles stores roles in lowercase ('admin', 'hr'). Drop and recreate all
-- affected policies with correct casing.
-- =============================================================================

-- 1. resignations policies (lines 40-45)
DROP POLICY IF EXISTS resignations_select_all_admin ON resignations;
CREATE POLICY resignations_select_all_admin ON resignations FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

DROP POLICY IF EXISTS resignations_update_all_admin ON resignations;
CREATE POLICY resignations_update_all_admin ON resignations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- 2. company_announcements policies (line 58-60)
DROP POLICY IF EXISTS company_announcements_insert_admin ON company_announcements;
CREATE POLICY company_announcements_insert_admin ON company_announcements FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- 3. recruitment_announcements policies (line 73-75)
DROP POLICY IF EXISTS recruitment_announcements_insert_hr ON recruitment_announcements;
CREATE POLICY recruitment_announcements_insert_hr ON recruitment_announcements FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- 4. employee_attrition policies (lines 86-91)
DROP POLICY IF EXISTS employee_attrition_select_admin ON employee_attrition;
CREATE POLICY employee_attrition_select_admin ON employee_attrition FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

DROP POLICY IF EXISTS employee_attrition_insert_admin ON employee_attrition;
CREATE POLICY employee_attrition_insert_admin ON employee_attrition FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- 5. reports policies (lines 102-107)
DROP POLICY IF EXISTS reports_select_admin ON reports;
CREATE POLICY reports_select_admin ON reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

DROP POLICY IF EXISTS reports_insert_admin ON reports;
CREATE POLICY reports_insert_admin ON reports FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- 6. hiring_stats policies (line 118-120)
DROP POLICY IF EXISTS hiring_stats_select_admin ON hiring_stats;
CREATE POLICY hiring_stats_select_admin ON hiring_stats FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- 7. pipeline_stats policies (line 130-132)
DROP POLICY IF EXISTS pipeline_stats_select_admin ON pipeline_stats;
CREATE POLICY pipeline_stats_select_admin ON pipeline_stats FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- 8. weekly_attendance policies (line 143-145)
DROP POLICY IF EXISTS weekly_attendance_select_admin ON weekly_attendance;
CREATE POLICY weekly_attendance_select_admin ON weekly_attendance FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- 9. performance_trends policies (line 155-157)
DROP POLICY IF EXISTS performance_trends_select_admin ON performance_trends;
CREATE POLICY performance_trends_select_admin ON performance_trends FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- 10. executive_metrics policies (line 167-169)
DROP POLICY IF EXISTS executive_metrics_select_admin ON executive_metrics;
CREATE POLICY executive_metrics_select_admin ON executive_metrics FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- 11. projects_select_all policy (line 327-331) — fixed 'TEAM_LEAD' to 'team_lead'
DROP POLICY IF EXISTS projects_select_all ON projects;
CREATE POLICY projects_select_all ON projects FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr', 'team_lead')
  )
);
