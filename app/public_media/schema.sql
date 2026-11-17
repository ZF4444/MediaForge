CREATE SCHEMA IF NOT EXISTS media;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS media.schema_version(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS media.media_policy_state (
 scope text NOT NULL CHECK(scope IN ('global','user','provider','task','file')), key text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 daily_bytes bigint NOT NULL DEFAULT 34359738368 CHECK(daily_bytes>0),
 active_bytes bigint NOT NULL DEFAULT 2147483648 CHECK(active_bytes>0),
 used_bytes bigint NOT NULL DEFAULT 0 CHECK(used_bytes>=0), used_requests bigint NOT NULL DEFAULT 0,
 request_limit bigint NOT NULL DEFAULT 10000 CHECK(request_limit>0),
 window_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(scope,key)
);
INSERT INTO media.media_policy_state(scope,key) VALUES('global','*') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS media.media_sources (
 id text PRIMARY KEY CHECK(id ~ '^[0-9a-f]{32}$'), owner_id text NOT NULL, file_id text NOT NULL,
 task_id text NOT NULL, provider_id text NOT NULL, bucket text NOT NULL, object_key text NOT NULL,
 version_id text NOT NULL DEFAULT '', object_etag text NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes>0), ext text NOT NULL CHECK(ext IN ('mp4','mov')),
 retention_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,file_id,task_id,provider_id)
);
CREATE TABLE IF NOT EXISTS media.media_grants (
 id text PRIMARY KEY CHECK(id ~ '^[0-9a-f]{32}$'), source_id text NOT NULL REFERENCES media.media_sources(id),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 idempotency_key text NOT NULL, state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, reason text NOT NULL DEFAULT '', get_count integer NOT NULL DEFAULT 0,
 head_count integer NOT NULL DEFAULT 0, reserved_bytes bigint NOT NULL DEFAULT 0,
 upstream_id text NOT NULL DEFAULT '', submission_state text NOT NULL DEFAULT 'prepared'
 CHECK(submission_state IN ('prepared','submitting','submitted','terminal')),
 CHECK(expires_at>created_at), UNIQUE(source_id,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_grant ON media.media_grants(source_id) WHERE state='active';
CREATE INDEX IF NOT EXISTS grant_expiry ON media.media_grants(expires_at);
CREATE INDEX IF NOT EXISTS grant_created ON media.media_grants(created_at);
CREATE INDEX IF NOT EXISTS source_owner ON media.media_sources(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS source_file ON media.media_sources(file_id);
CREATE INDEX IF NOT EXISTS source_task ON media.media_sources(task_id);
CREATE OR REPLACE FUNCTION media.prevent_source_update() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,media AS $$
BEGIN
 IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'media source snapshots are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS source_snapshot_immutable ON media.media_sources;
CREATE TRIGGER source_snapshot_immutable BEFORE UPDATE ON media.media_sources
 FOR EACH ROW EXECUTE FUNCTION media.prevent_source_update();
CREATE TABLE IF NOT EXISTS media.media_deliveries (
 grant_id text PRIMARY KEY REFERENCES media.media_grants(id) ON DELETE CASCADE,
 ciphertext bytea NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS media.media_access_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, grant_id text,
 request_id text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 method text NOT NULL, status integer NOT NULL, bytes_read bigint NOT NULL DEFAULT 0,
 bytes_sent bigint NOT NULL DEFAULT 0, reason text NOT NULL, client_ip text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS access_grant ON media.media_access_events(grant_id,occurred_at DESC);
CREATE OR REPLACE FUNCTION media.constant_equal(a text,b text) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,media AS $$
DECLARE v integer := 0; i integer;
BEGIN
 IF length(a)<>64 OR length(b)<>64 OR a IS NULL OR b IS NULL THEN RETURN false; END IF;
 FOR i IN 1..64 LOOP v := v | (ascii(substr(a,i,1)) # ascii(substr(b,i,1))); END LOOP;
 RETURN v=0;
END $$;
CREATE OR REPLACE FUNCTION media.validate_and_admit(p_id text,p_hash text,p_method text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,media AS $$
DECLARE g media.media_grants%ROWTYPE; s media.media_sources%ROWTYPE;
 p media.media_policy_state%ROWTYPE; k text; sc text; amount bigint;
 today date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
 -- Global lock also serializes signing, policy changes and revocation. No grant
 -- or object data is returned until the entire authorization transaction succeeds.
 PERFORM 1 FROM media.media_policy_state WHERE scope='global' AND key='*' FOR UPDATE;
 SELECT * INTO g FROM media.media_grants WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT media.constant_equal(g.token_hash,p_hash) THEN RETURN '{"allowed":false,"reason":"not_found"}'; END IF;
 IF p_method NOT IN ('GET','HEAD') OR g.state<>'active' OR g.expires_at<=clock_timestamp() THEN RETURN '{"allowed":false,"reason":"not_found"}'; END IF;
 SELECT * INTO STRICT s FROM media.media_sources WHERE id=g.source_id;
 IF s.retention_until IS NOT NULL AND s.retention_until<=clock_timestamp() THEN RETURN '{"allowed":false,"reason":"not_found"}'; END IF;
 amount := CASE WHEN p_method='GET' THEN s.size_bytes ELSE 0 END;
 IF (p_method='GET' AND g.get_count>=64) OR (p_method='HEAD' AND g.head_count>=64) THEN RETURN '{"allowed":false,"reason":"limit"}'; END IF;
 -- Global permission is mandatory; file/task policies are sticky revocation barriers.
 FOR sc,k IN SELECT * FROM (VALUES ('global','*'),('file',s.file_id),('task',s.task_id)) x LOOP
   SELECT * INTO p FROM media.media_policy_state WHERE scope=sc AND key=k FOR UPDATE;
   IF NOT FOUND THEN
     IF sc='global' THEN RETURN '{"allowed":false,"reason":"not_found"}'; END IF;
   ELSE
     IF NOT p.enabled THEN RETURN '{"allowed":false,"reason":"not_found"}'; END IF;
     IF (CASE WHEN p.window_date=today THEN p.used_bytes ELSE 0 END)+amount>p.daily_bytes
       OR (CASE WHEN p.window_date=today THEN p.used_requests ELSE 0 END)>=p.request_limit THEN
       RETURN '{"allowed":false,"reason":"limit"}';
     END IF;
   END IF;
 END LOOP;
 UPDATE media.media_policy_state SET used_bytes=(CASE WHEN window_date=today THEN used_bytes ELSE 0 END)+amount,
 used_requests=(CASE WHEN window_date=today THEN used_requests ELSE 0 END)+1,window_date=today
 WHERE (scope,key) IN (('global','*'),('file',s.file_id),('task',s.task_id));
 UPDATE media.media_grants SET get_count=get_count+CASE WHEN p_method='GET' THEN 1 ELSE 0 END,
 head_count=head_count+CASE WHEN p_method='HEAD' THEN 1 ELSE 0 END,reserved_bytes=reserved_bytes+amount WHERE id=p_id;
 RETURN jsonb_build_object('allowed',true,'source',to_jsonb(s),'expires_at',g.expires_at);
END $$;
CREATE OR REPLACE FUNCTION media.append_access(p_grant text,p_request text,p_method text,p_status integer,p_read bigint,p_sent bigint,p_reason text,p_ip text) RETURNS void
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,media AS $$
 INSERT INTO media.media_access_events(grant_id,request_id,method,status,bytes_read,bytes_sent,reason,client_ip)
 VALUES(left(p_grant,32),left(p_request,64),left(p_method,8),p_status,greatest(0,p_read),greatest(0,p_sent),left(p_reason,64),left(p_ip,64));
$$;
CREATE OR REPLACE FUNCTION media.runtime_status() RETURNS integer
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,media AS $$
 SELECT max(version) FROM media.schema_version;
$$;
REVOKE ALL ON SCHEMA media FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA media FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA media FROM PUBLIC;
-- Changing authorization semantics must never make an old URL valid again.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM media.schema_version) AND NOT EXISTS (SELECT 1 FROM media.schema_version WHERE version=3) THEN
   UPDATE media.media_grants SET state='revoked',revoked_at=now(),reason='policy_model_upgrade' WHERE state='active';
   DELETE FROM media.media_deliveries;
 END IF;
END $$;
DELETE FROM media.media_policy_state WHERE scope IN ('user','provider');
INSERT INTO media.schema_version(version) VALUES(1),(2),(3) ON CONFLICT DO NOTHING;
