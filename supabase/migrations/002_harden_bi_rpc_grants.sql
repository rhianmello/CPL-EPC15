-- Hardening: the helper interno não deve ficar exposto pelo PostgREST.
revoke execute on function public.bi_access_ok(text,text) from anon, authenticated;

-- O frontend usa a publishable key no papel anon.
-- Removemos permissões desnecessárias do papel authenticated.
revoke execute on function public.verify_bi_access(text,text) from authenticated;
revoke execute on function public.get_current_bi_snapshot(text,text,text) from authenticated;
revoke execute on function public.publish_bi_snapshot(text,text,text,text,bigint,timestamptz,date,text,jsonb,jsonb) from authenticated;
revoke execute on function public.list_bi_publications(text,text,text,integer) from authenticated;
