-- ============================================
-- Hospital Share Management System
-- Database Schema Migration (v2 - Enhanced)
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. DEPARTMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'clinical' CHECK (type IN ('clinical', 'non_clinical')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 2. SHARE RULES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS share_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  share_percentage DECIMAL(5,2) NOT NULL CHECK (share_percentage >= 0 AND share_percentage <= 100),
  share_type TEXT NOT NULL CHECK (share_type IN ('fixed', 'group')),
  distribution_type TEXT NOT NULL DEFAULT 'pool' CHECK (distribution_type IN ('per_person', 'pool')),
  absent_handling TEXT NOT NULL DEFAULT 'exclude' CHECK (absent_handling IN ('exclude', 'include')),
  effective_from DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(department_id, role_name)
);

-- ============================================
-- 3. STAFF TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  share_rule_id UUID NOT NULL REFERENCES share_rules(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 4. MONTHLY INCOME TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS monthly_income (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year >= 2020),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  income_amount DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (income_amount >= 0),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(department_id, year, month)
);

-- ============================================
-- 5. ATTENDANCE TABLE (Enhanced)
-- ============================================
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year >= 2020),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  total_days INTEGER NOT NULL CHECK (total_days > 0 AND total_days <= 31),
  worked_days INTEGER NOT NULL CHECK (worked_days >= 0),
  paid_leaves INTEGER NOT NULL DEFAULT 0 CHECK (paid_leaves >= 0),
  unpaid_leaves INTEGER NOT NULL DEFAULT 0 CHECK (unpaid_leaves >= 0),
  half_days INTEGER NOT NULL DEFAULT 0 CHECK (half_days >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id, year, month),
  CHECK (worked_days + paid_leaves + unpaid_leaves + half_days <= total_days)
);

-- ============================================
-- 6. MONTHLY RESULTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS monthly_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  share_rule_id UUID NOT NULL REFERENCES share_rules(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year >= 2020),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  department_income DECIMAL(15,2) NOT NULL DEFAULT 0,
  rule_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  distribution_type TEXT NOT NULL DEFAULT 'pool',
  share_pool DECIMAL(15,2) NOT NULL DEFAULT 0,
  staff_in_pool INTEGER NOT NULL DEFAULT 1,
  base_share DECIMAL(15,2) NOT NULL DEFAULT 0,
  effective_worked_days DECIMAL(5,1) NOT NULL DEFAULT 0,
  total_days INTEGER NOT NULL DEFAULT 0,
  attendance_ratio DECIMAL(5,4) NOT NULL DEFAULT 0,
  final_share DECIMAL(15,2) NOT NULL DEFAULT 0,
  manual_override DECIMAL(15,2),
  override_reason TEXT,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id, year, month)
);

-- ============================================
-- 7. AUDIT LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'calculate', 'override', 'lock', 'unlock')),
  old_values JSONB,
  new_values JSONB,
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_share_rules_department ON share_rules(department_id);
CREATE INDEX IF NOT EXISTS idx_share_rules_effective ON share_rules(effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_staff_department ON staff(department_id);
CREATE INDEX IF NOT EXISTS idx_staff_rule ON staff(share_rule_id);
CREATE INDEX IF NOT EXISTS idx_monthly_income_period ON monthly_income(year, month);
CREATE INDEX IF NOT EXISTS idx_attendance_period ON attendance(year, month);
CREATE INDEX IF NOT EXISTS idx_attendance_staff ON attendance(staff_id);
CREATE INDEX IF NOT EXISTS idx_monthly_results_period ON monthly_results(year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_results_staff ON monthly_results(staff_id);
CREATE INDEX IF NOT EXISTS idx_monthly_results_department ON monthly_results(department_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow authenticated users full access
CREATE POLICY "auth_departments" ON departments FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_share_rules" ON share_rules FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_staff" ON staff FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_monthly_income" ON monthly_income FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_attendance" ON attendance FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_monthly_results" ON monthly_results FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_audit_log" ON audit_log FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_share_rules_updated_at BEFORE UPDATE ON share_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
