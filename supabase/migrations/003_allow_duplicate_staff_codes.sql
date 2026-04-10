-- ============================================
-- 003_allow_duplicate_staff_codes.sql
-- Allow the same staff code to be used for 
-- different departments or roles.
-- ============================================

-- 1. Drop the strict unique constraint on staff_code
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_code_unique;

-- 2. Add a composite unique constraint to prevent exact duplicates 
-- (same code, same department, same role)
ALTER TABLE staff ADD CONSTRAINT staff_assignment_unique UNIQUE (staff_code, department_id, share_rule_id);
