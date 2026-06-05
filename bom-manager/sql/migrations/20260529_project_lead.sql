-- Adds a real Project Lead assignment to projects.
-- Run this in Supabase SQL editor before using the Project Lead dropdown.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_lead_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_project_lead_id
  ON projects(project_lead_id);
