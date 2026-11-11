-- audit_events is append-only for every database role, including the application's.
--
-- The single permitted change is anonymisation after an account is deleted: inside a
-- transaction that ran `SET LOCAL app.audit_anonymise = 'on'`, an UPDATE may set
-- actor_user_id and/or target_id to NULL and change nothing else. DELETE and TRUNCATE are
-- always refused.
CREATE FUNCTION "audit_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Only a row-level UPDATE can qualify; NEW and OLD exist only there.
  IF TG_OP = 'UPDATE' AND current_setting('app.audit_anonymise', true) = 'on' THEN
    IF NEW."id" = OLD."id"
       AND NEW."actor_role" IS NOT DISTINCT FROM OLD."actor_role"
       AND NEW."action" = OLD."action"
       AND NEW."target_type" IS NOT DISTINCT FROM OLD."target_type"
       AND NEW."request_id" IS NOT DISTINCT FROM OLD."request_id"
       AND NEW."metadata" = OLD."metadata"
       AND NEW."created_at" = OLD."created_at"
       AND (NEW."actor_user_id" IS NULL OR NEW."actor_user_id" = OLD."actor_user_id")
       AND (NEW."target_id" IS NULL OR NEW."target_id" = OLD."target_id")
    THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_events_no_update_delete"
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION "audit_events_append_only"();

CREATE TRIGGER "audit_events_no_truncate"
BEFORE TRUNCATE ON "audit_events"
FOR EACH STATEMENT EXECUTE FUNCTION "audit_events_append_only"();
