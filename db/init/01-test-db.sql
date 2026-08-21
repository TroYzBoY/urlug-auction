-- Runs once, when Postgres initialises an empty data directory.
--
-- The integration tests TRUNCATE every table between runs, so they must never
-- point at a database anybody cares about. They refuse to run unless the
-- database name ends in `_test` — this creates the one they expect.
CREATE DATABASE maison_test OWNER maison;
