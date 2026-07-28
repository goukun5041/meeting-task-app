CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  local_data_migrated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, project_id) REFERENCES projects(user_id, id) ON DELETE CASCADE,
  CONSTRAINT tasks_status_check CHECK (status IN ('未着手', '対応中', 'レビュー待ち', '完了', '保留')),
  CONSTRAINT tasks_priority_check CHECK (priority IN ('低', '中', '高', '緊急'))
);

CREATE TABLE IF NOT EXISTS task_histories (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  action_date DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, task_id) REFERENCES tasks(user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_project ON tasks(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_priority ON tasks(user_id, priority);
CREATE INDEX IF NOT EXISTS idx_tasks_user_updated_at ON tasks(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_histories_user_task ON task_histories(user_id, task_id);

CREATE OR REPLACE FUNCTION begin_local_data_migration(target_user_id TEXT)
RETURNS VOID AS $$
DECLARE
  target_user users%ROWTYPE;
BEGIN
  SELECT * INTO target_user
  FROM users
  WHERE id = target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  IF target_user.local_data_migrated_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM projects WHERE user_id = target_user_id)
     OR EXISTS (SELECT 1 FROM tasks WHERE user_id = target_user_id) THEN
    RAISE EXCEPTION 'Local data migration is not available' USING ERRCODE = 'P0001';
  END IF;

  UPDATE users
  SET local_data_migrated_at = NOW()
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_task_histories_updated_at ON task_histories;
CREATE TRIGGER trg_task_histories_updated_at
BEFORE UPDATE ON task_histories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
