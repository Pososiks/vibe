-- Security hardening for the profiles helper functions (Supabase linter 0011/0028/0029).

-- Pin a non-mutable search_path on the updated_at trigger function.
alter function public.set_profiles_updated_at() set search_path = '';

-- These functions are only ever invoked by triggers, never directly. Triggers do
-- not check EXECUTE privilege, so revoking it removes the public RPC surface of the
-- SECURITY DEFINER signup function without breaking the signup trigger.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_profiles_updated_at() from public, anon, authenticated;
