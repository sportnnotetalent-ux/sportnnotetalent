-- Teams for doubles, phase 4b (docs/security/breaks/team-who-played.md WH10–WH16).
-- Founder 2026-11-08: a side's team captain / admins (not only the scorer or host)
-- can say who really played for stand-ins ("{Team} Player 1 / 2"). This function
-- adds the one "who played" AMEND correction, the side's matchday squad and the
-- mapped players' stat lines — after checking every play in the database.

create or replace function map_team_stand_ins(
  p_match uuid, p_side text, p_starters uuid[], p_ops jsonb, p_lines text[], p_by_name text, p_stats jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  v_team uuid;
  v_roster text[];
  v_n int;
  v_plays int;
  op jsonb;
  v_seq int;
  v_now jsonb;
  v_expect text;
  v_got text;
  i int;
  ln jsonb;
  kv record;
  v_player uuid;
begin
  if p_side not in ('home', 'away') then raise exception 'bad side' using errcode = '22023'; end if;
  select * into m from matches where id = p_match;
  if not found then raise exception 'no such match' using errcode = '22023'; end if;
  v_team := case p_side when 'home' then m.home_team_id else m.away_team_id end;
  -- WH10 / WH15: that side's team managers, or the match's managers
  if v_team is null or not (can_manage_team(v_team) or can_manage_match(p_match)) then
    raise exception 'Only this team''s captain or admins, or the match''s hosts, can say who played' using errcode = '42501';
  end if;

  -- WH11: exactly the number playing, distinct, from the squad
  select coalesce(array_agg(x), '{}') into v_roster from teams t, jsonb_array_elements_text(coalesce(t.roster, '[]'::jsonb)) x where t.id = v_team;
  v_n := coalesce(nullif(m.format->>'playersPerSide', '')::int, 2);
  if coalesce(array_length(p_starters, 1), 0) <> v_n or (select count(distinct s) from unnest(p_starters) s) <> v_n then
    raise exception 'Pick exactly % players', v_n using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_starters) s where not (s::text = any(v_roster))) then
    raise exception 'That player is not in the squad' using errcode = '22023';
  end if;

  -- WH12 / WH16: every op is a replace that only swaps this team's stand-ins
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) = 0 then raise exception 'nothing to map' using errcode = '22023'; end if;
  for op in select * from jsonb_array_elements(p_ops) loop
    if op->>'op' is distinct from 'replace' then raise exception 'only replace' using errcode = '22023'; end if;
    v_seq := (op->>'seq')::int;
    select coalesce(
      (select o->'action' from match_events am, jsonb_array_elements(am.payload->'ops') o
        where am.match_id = p_match and am.type = 'AMEND' and o->>'op' = 'replace' and (o->>'seq')::int = v_seq
        order by am.seq desc limit 1),
      (select jsonb_build_object('type', e.type, 'side', e.side, 'payload', e.payload, 'attribution', e.attribution)
        from match_events e where e.match_id = p_match and e.seq = v_seq and e.type <> 'AMEND'))
      into v_now;
    if v_now is null then raise exception 'no play %', v_seq using errcode = '22023'; end if;
    v_expect := jsonb_build_object('type', v_now->'type', 'side', coalesce(v_now->'side', 'null'::jsonb),
      'payload', coalesce(nullif(v_now->'payload', '{}'::jsonb), 'null'::jsonb), 'attribution', coalesce(v_now->'attribution', 'null'::jsonb))::text;
    if position(('"ph:' || v_team || ':') in v_expect) = 0 then raise exception 'play % has no stand-in', v_seq using errcode = '22023'; end if;
    for i in 1..v_n loop
      v_expect := replace(v_expect, '"ph:' || v_team || ':' || i || '"', '"' || p_starters[i] || '"');
    end loop;
    v_got := jsonb_build_object('type', op->'action'->'type', 'side', coalesce(op->'action'->'side', 'null'::jsonb),
      'payload', coalesce(nullif(op->'action'->'payload', '{}'::jsonb), 'null'::jsonb), 'attribution', coalesce(op->'action'->'attribution', 'null'::jsonb))::text;
    if v_got is distinct from v_expect then
      raise exception 'Play % would change more than who played', v_seq using errcode = '22023';
    end if;
  end loop;

  -- WH13: stats only for the mapped players, whole numbers, within the match
  select count(*) into v_plays from match_events where match_id = p_match and type <> 'AMEND';
  for ln in select * from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) loop
    v_player := (ln->>'playerId')::uuid;
    if not (v_player = any(p_starters)) then raise exception 'stats only for the players who played' using errcode = '22023'; end if;
    for kv in select * from jsonb_each(coalesce(ln->'stats', '{}'::jsonb)) loop
      if jsonb_typeof(kv.value) <> 'number' or (kv.value)::numeric <> trunc((kv.value)::numeric)
         or (kv.value)::numeric < 0 or (kv.value)::numeric > v_plays then
        raise exception 'stat % is not a count within this match', kv.key using errcode = '22023';
      end if;
    end loop;
  end loop;

  -- WH14: one transaction — the correction, the squad, the stat lines
  perform set_config('app.trusted_rpc', 'on', true);
  insert into match_events (match_id, seq, type, side, payload, attribution, created_by, recorded_by)
  values (p_match, (select coalesce(max(seq), 0) + 1 from match_events where match_id = p_match), 'AMEND', null,
    jsonb_build_object('ops', p_ops, 'lines', to_jsonb(coalesce(p_lines, '{}')), 'byName', coalesce(p_by_name, ''), 'deltas', '[]'::jsonb),
    null, auth.uid(), (select id from players where profile_id = auth.uid() order by created_at limit 1));
  insert into match_squads (match_id, side, starters, subs)
  values (p_match, p_side, to_jsonb(p_starters::text[]), '[]'::jsonb)
  on conflict (match_id, side) do update set starters = excluded.starters, subs = '[]'::jsonb;
  for ln in select * from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) loop
    v_player := (ln->>'playerId')::uuid;
    delete from stat_lines where match_id = p_match and player_id = v_player and sport = m.sport and event_id is null;
    insert into stat_lines (match_id, player_id, sport, stats, opponent)
    values (p_match, v_player, m.sport, coalesce(ln->'stats', '{}'::jsonb), nullif(ln->>'opponent', ''));
  end loop;
  perform set_config('app.trusted_rpc', 'off', true);
end $$;

revoke all on function map_team_stand_ins(uuid, text, uuid[], jsonb, text[], text, jsonb) from public;
grant execute on function map_team_stand_ins(uuid, text, uuid[], jsonb, text[], text, jsonb) to authenticated;
