-- Add custom_heading column to monthly_department_addons table
ALTER TABLE monthly_department_addons ADD COLUMN IF NOT EXISTS custom_heading TEXT DEFAULT NULL;

-- Add custom_heading column to ot_monthly_addons table
ALTER TABLE ot_monthly_addons ADD COLUMN IF NOT EXISTS custom_heading TEXT DEFAULT NULL;
