-- Add output configuration fields to configs table
ALTER TABLE configs ADD COLUMN output_type TEXT DEFAULT 'structured' CHECK(output_type IN ('structured', 'text'));
ALTER TABLE configs ADD COLUMN output_schema TEXT;
ALTER TABLE configs ADD COLUMN schema_version TEXT;

-- Update existing configs to have the default output_type
UPDATE configs SET output_type = 'structured' WHERE output_type IS NULL;