\getenv app_user AUTOMATION_DB_USER
\getenv app_password AUTOMATION_DB_PASSWORD
\getenv database_name POSTGRES_DB

BEGIN;

CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password';

CREATE SCHEMA automation AUTHORIZATION :"app_user";

ALTER ROLE :"app_user" IN DATABASE :"database_name"
  SET search_path TO automation;

COMMIT;