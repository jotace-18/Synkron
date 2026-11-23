\getenv app_user SPORT_DB_USER
\getenv app_password SPORT_DB_PASSWORD
\getenv database_name POSTGRES_DB

BEGIN;

CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password';

CREATE SCHEMA sport AUTHORIZATION :"app_user";

ALTER ROLE :"app_user" IN DATABASE :"database_name"
  SET search_path TO sport;

COMMIT;