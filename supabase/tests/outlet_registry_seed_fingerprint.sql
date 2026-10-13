-- Fingerprint of the outlet registry (every column, including ids and timestamps): a re-run that changes
-- nothing leaves it identical.
SELECT (SELECT count(*) FROM public.outlets) || ' outlets, ' || (SELECT count(*) FROM public.outlet_aliases) || ' aliases, md5 '
    || md5(coalesce((SELECT string_agg(o::text, E'\n' ORDER BY o.name) FROM public.outlets o), '')
        || coalesce((SELECT string_agg(a::text, E'\n' ORDER BY a.alias_kind, a.alias) FROM public.outlet_aliases a), ''));
