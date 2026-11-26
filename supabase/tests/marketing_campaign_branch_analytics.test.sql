BEGIN;
SELECT plan(5);

SELECT has_column('public', 'marketing_campaign_events', 'branch_id',
  'Campaign engagement events store their campaign branch');

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'marketing_campaign_events'
      AND indexname = 'marketing_campaign_events_branch_campaign_idx'
  ),
  'Branch-scoped campaign events have a supporting index'
);

SELECT ok(
  position('private.can_access_branch' IN pg_get_functiondef(
    'private.record_marketing_campaign_event(uuid,text)'::regprocedure
  )) > 0,
  'Engagement recording enforces the campaign branch boundary'
);

SELECT ok(
  position('private.can_access_branch' IN pg_get_functiondef(
    'private.get_marketing_campaign_analytics(uuid)'::regprocedure
  )) > 0,
  'Campaign analytics enforce the campaign branch boundary'
);

SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc
       WHERE oid = 'public.record_marketing_campaign_event(uuid,text)'::regprocedure)
  AND NOT (SELECT prosecdef FROM pg_proc
           WHERE oid = 'public.get_marketing_campaign_analytics(uuid)'::regprocedure),
  'Public campaign RPC entry points remain SECURITY INVOKER'
);

SELECT * FROM finish();
ROLLBACK;
