SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;

SET search_path = public, pg_catalog;
SET default_tablespace = '';
SET default_with_oids = false;

CREATE TABLE daily (
    ip character varying(16) NOT NULL,
    date date NOT NULL,
    upload integer,
    download integer
);

CREATE TABLE hourly (
    ip character varying(16) NOT NULL,
    "time" timestamp without time zone NOT NULL,
    upload integer,
    download integer
);

ALTER TABLE ONLY daily
    ADD CONSTRAINT daily_pkey PRIMARY KEY (ip, date);

ALTER TABLE ONLY hourly
    ADD CONSTRAINT hourly_pkey PRIMARY KEY (ip, "time");
