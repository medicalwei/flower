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

CREATE FUNCTION upsert_daily(m_ip varchar(16), m_date date, m_upload integer, m_download integer) RETURNS VOID AS
$$
BEGIN
    UPDATE daily SET upload = m_upload, download = m_download WHERE ip = m_ip AND date = m_date;
    IF NOT FOUND THEN
        INSERT INTO daily (upload, download, ip, date) VALUES (m_upload, m_download, m_ip, m_date);
    END IF;
END;
$$
LANGUAGE plpgsql;

CREATE FUNCTION upsert_hourly(m_ip varchar(16), m_time timestamp, m_upload integer, m_download integer) RETURNS VOID AS
$$
BEGIN
    UPDATE hourly SET upload = m_upload, download = m_download WHERE ip = m_ip AND time = m_time;
    IF NOT FOUND THEN
        INSERT INTO hourly (upload, download, ip, time) VALUES (m_upload, m_download, m_ip, m_time);
    END IF;
END;
$$
LANGUAGE plpgsql;

