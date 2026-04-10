-- ============================================
-- Add Staff Code Migration
-- Follows strict safe migration order
-- ============================================

-- 1. Add column as nullable
ALTER TABLE staff ADD COLUMN staff_code TEXT;

-- 2. Generate sequential codes for existing records
DO $$
BEGIN
  -- We use a CTE to map roles to prefixes and generate a sequential row number per prefix
  WITH mapped_roles AS (
    SELECT 
      s.id AS staff_id,
      CASE 
        WHEN sr.role_name ILIKE '%doctor%' OR sr.role_name ILIKE '%dr%' THEN 'DOC'
        WHEN sr.role_name ILIKE '%nurse%' THEN 'NUR'
        WHEN sr.role_name ILIKE '%technician%' OR sr.role_name ILIKE '%tech%' THEN 'TEC'
        ELSE 'STF'
      END AS prefix
    FROM staff s
    JOIN share_rules sr ON s.share_rule_id = sr.id
  ),
  numbered_staff AS (
    SELECT 
      staff_id,
      prefix,
      ROW_NUMBER() OVER (PARTITION BY prefix ORDER BY staff_id) as seq_num
    FROM mapped_roles
  )
  UPDATE staff s
  SET staff_code = ns.prefix || '-' || LPAD(ns.seq_num::text, 3, '0')
  FROM numbered_staff ns
  WHERE s.id = ns.staff_id;
  
  -- Double check that no rows were missed (edge case: missing share_rule lookup)
  UPDATE staff
  SET staff_code = 'STF-' || LPAD(EXTRACT(EPOCH FROM now())::bigint::text, 6, '0')
  WHERE staff_code IS NULL;
END $$;

-- 3. Ensure no NULL values remain (handled by the UPDATE statements above)

-- 4. Add UNIQUE constraint
ALTER TABLE staff ADD CONSTRAINT staff_code_unique UNIQUE (staff_code);

-- 5. Set NOT NULL
ALTER TABLE staff ALTER COLUMN staff_code SET NOT NULL;

-- 6. Add Index for fast lookups (Optional but requested)
CREATE INDEX IF NOT EXISTS idx_staff_code ON staff(staff_code);
