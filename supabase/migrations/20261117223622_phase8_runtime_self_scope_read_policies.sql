
DROP POLICY IF EXISTS user_effective_permissions_self_read ON app.user_effective_permissions;
CREATE POLICY user_effective_permissions_self_read
ON app.user_effective_permissions
FOR SELECT TO myschool_runtime
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_membership_scopes_self_read ON app.user_membership_scopes;
CREATE POLICY user_membership_scopes_self_read
ON app.user_membership_scopes
FOR SELECT TO myschool_runtime
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS student_user_links_self_read ON app.student_user_links;
CREATE POLICY student_user_links_self_read
ON app.student_user_links
FOR SELECT TO myschool_runtime
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS student_guardian_links_self_read ON app.student_guardian_links;
CREATE POLICY student_guardian_links_self_read
ON app.student_guardian_links
FOR SELECT TO myschool_runtime
USING (guardian_user_id = (SELECT auth.uid()));
