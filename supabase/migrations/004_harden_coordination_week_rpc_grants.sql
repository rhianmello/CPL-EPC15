-- Restrict weekly coordination RPCs to the anonymous frontend role.
-- The GitHub Pages client uses the Supabase publishable key (anon).
revoke execute on function public.list_coordination_weeks(text,text) from authenticated;
revoke execute on function public.verify_coordination_master(text,text,text,integer) from authenticated;
revoke execute on function public.get_coordination_week(text,text,integer) from authenticated;
revoke execute on function public.save_coordination_week(text,text,text,integer,text,date,text,date,text,jsonb,jsonb,jsonb) from authenticated;
