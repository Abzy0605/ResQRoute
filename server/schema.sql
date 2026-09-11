--
-- PostgreSQL database dump
--

\restrict ZQKhmJV4gS0tFkgEfntu7MJFASmWhFpc5FzGJURFmzjL6Vk04Oh6if1XoYCo0Xt

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: disasters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disasters (
    id integer NOT NULL,
    type character varying(50) NOT NULL,
    severity integer NOT NULL,
    latitude numeric(10,7) NOT NULL,
    longitude numeric(10,7) NOT NULL,
    description text,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT disasters_severity_check CHECK (((severity >= 1) AND (severity <= 10)))
);


--
-- Name: disasters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.disasters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: disasters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.disasters_id_seq OWNED BY public.disasters.id;


--
-- Name: incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incidents (
    id integer NOT NULL,
    disaster_id integer,
    reported_by integer,
    description text NOT NULL,
    latitude numeric(10,7) NOT NULL,
    longitude numeric(10,7) NOT NULL,
    severity integer NOT NULL,
    status character varying(20) DEFAULT 'REPORTED'::character varying NOT NULL,
    assigned_team_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT incidents_severity_check CHECK (((severity >= 1) AND (severity <= 10)))
);


--
-- Name: incidents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.incidents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: incidents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.incidents_id_seq OWNED BY public.incidents.id;


--
-- Name: rescue_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rescue_teams (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    contact_number character varying(20),
    latitude numeric(10,7),
    longitude numeric(10,7),
    status character varying(20) DEFAULT 'AVAILABLE'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: rescue_teams_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rescue_teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rescue_teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rescue_teams_id_seq OWNED BY public.rescue_teams.id;


--
-- Name: resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resources (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    resource_type character varying(50) NOT NULL,
    quantity integer NOT NULL,
    location character varying(200),
    status character varying(20) DEFAULT 'AVAILABLE'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT resources_quantity_check CHECK ((quantity >= 0))
);


--
-- Name: resources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resources_id_seq OWNED BY public.resources.id;


--
-- Name: risk_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_zones (
    id integer NOT NULL,
    disaster_id integer,
    zone_name character varying(100) NOT NULL,
    risk_score integer NOT NULL,
    risk_level character varying(20) NOT NULL,
    center_latitude numeric(10,7) NOT NULL,
    center_longitude numeric(10,7) NOT NULL,
    radius_km numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT risk_zones_radius_km_check CHECK ((radius_km > (0)::numeric)),
    CONSTRAINT risk_zones_risk_score_check CHECK (((risk_score >= 0) AND (risk_score <= 100)))
);


--
-- Name: risk_zones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.risk_zones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: risk_zones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.risk_zones_id_seq OWNED BY public.risk_zones.id;


--
-- Name: roads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roads (
    id integer NOT NULL,
    road_name character varying(150) NOT NULL,
    start_latitude numeric(10,7) NOT NULL,
    start_longitude numeric(10,7) NOT NULL,
    end_latitude numeric(10,7) NOT NULL,
    end_longitude numeric(10,7) NOT NULL,
    distance_km numeric(10,2) NOT NULL,
    risk_level integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'OPEN'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roads_distance_km_check CHECK ((distance_km > (0)::numeric)),
    CONSTRAINT roads_risk_level_check CHECK (((risk_level >= 1) AND (risk_level <= 10)))
);


--
-- Name: roads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roads_id_seq OWNED BY public.roads.id;


--
-- Name: shelters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shelters (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    address text,
    latitude numeric(10,7) NOT NULL,
    longitude numeric(10,7) NOT NULL,
    capacity integer NOT NULL,
    current_occupancy integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'AVAILABLE'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT shelters_capacity_check CHECK ((capacity > 0)),
    CONSTRAINT shelters_current_occupancy_check CHECK ((current_occupancy >= 0))
);


--
-- Name: shelters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shelters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shelters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shelters_id_seq OWNED BY public.shelters.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'CITIZEN'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    rescue_team_id integer
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: disasters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disasters ALTER COLUMN id SET DEFAULT nextval('public.disasters_id_seq'::regclass);


--
-- Name: incidents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents ALTER COLUMN id SET DEFAULT nextval('public.incidents_id_seq'::regclass);


--
-- Name: rescue_teams id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rescue_teams ALTER COLUMN id SET DEFAULT nextval('public.rescue_teams_id_seq'::regclass);


--
-- Name: resources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources ALTER COLUMN id SET DEFAULT nextval('public.resources_id_seq'::regclass);


--
-- Name: risk_zones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_zones ALTER COLUMN id SET DEFAULT nextval('public.risk_zones_id_seq'::regclass);


--
-- Name: roads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roads ALTER COLUMN id SET DEFAULT nextval('public.roads_id_seq'::regclass);


--
-- Name: shelters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shelters ALTER COLUMN id SET DEFAULT nextval('public.shelters_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: disasters disasters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disasters
    ADD CONSTRAINT disasters_pkey PRIMARY KEY (id);


--
-- Name: incidents incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);


--
-- Name: rescue_teams rescue_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rescue_teams
    ADD CONSTRAINT rescue_teams_pkey PRIMARY KEY (id);


--
-- Name: resources resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pkey PRIMARY KEY (id);


--
-- Name: risk_zones risk_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_zones
    ADD CONSTRAINT risk_zones_pkey PRIMARY KEY (id);


--
-- Name: roads roads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roads
    ADD CONSTRAINT roads_pkey PRIMARY KEY (id);


--
-- Name: shelters shelters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shelters
    ADD CONSTRAINT shelters_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_users_rescue_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_rescue_team_id ON public.users USING btree (rescue_team_id);


--
-- Name: incidents incidents_assigned_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_assigned_team_id_fkey FOREIGN KEY (assigned_team_id) REFERENCES public.rescue_teams(id);


--
-- Name: incidents incidents_disaster_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_disaster_id_fkey FOREIGN KEY (disaster_id) REFERENCES public.disasters(id);


--
-- Name: incidents incidents_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.users(id);


--
-- Name: risk_zones risk_zones_disaster_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_zones
    ADD CONSTRAINT risk_zones_disaster_id_fkey FOREIGN KEY (disaster_id) REFERENCES public.disasters(id);


--
-- Name: users users_rescue_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_rescue_team_id_fkey FOREIGN KEY (rescue_team_id) REFERENCES public.rescue_teams(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict ZQKhmJV4gS0tFkgEfntu7MJFASmWhFpc5FzGJURFmzjL6Vk04Oh6if1XoYCo0Xt

