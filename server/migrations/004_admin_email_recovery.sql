-- Add the registered admin recovery email.
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_email TEXT;
