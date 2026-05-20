create or replace function public.project_part_duplicate_exempt(
  p_part_type text,
  p_part_id bigint
)
returns boolean
language plpgsql
as $$
declare
  v_part_number text;
  v_description text;
  v_manufacturer_part_number text;
  v_beperp_part_no text;
  v_haystack text;
begin
  if p_part_type = 'electrical_bought_out' then
    select part_number, description, manufacturer_part_number, beperp_part_no
      into v_part_number, v_description, v_manufacturer_part_number, v_beperp_part_no
    from electrical_bought_out
    where id = p_part_id;
  elsif p_part_type = 'electrical_manufacture' then
    select part_number, description, manufacturer_part_number, beperp_part_no
      into v_part_number, v_description, v_manufacturer_part_number, v_beperp_part_no
    from electrical_manufacture
    where id = p_part_id;
  elsif p_part_type = 'mechanical_bought_out' then
    select part_number, description, manufacturer_part_number, beperp_part_no
      into v_part_number, v_description, v_manufacturer_part_number, v_beperp_part_no
    from mechanical_bought_out
    where id = p_part_id;
  elsif p_part_type = 'mechanical_manufacture' then
    select part_number, description, manufacturer_part_number, beperp_part_no
      into v_part_number, v_description, v_manufacturer_part_number, v_beperp_part_no
    from mechanical_manufacture
    where id = p_part_id;
  elsif p_part_type = 'pneumatic_bought_out' then
    select part_number, description, manufacturer_part_number, beperp_part_no
      into v_part_number, v_description, v_manufacturer_part_number, v_beperp_part_no
    from pneumatic_bought_out
    where id = p_part_id;
  end if;

  v_haystack := lower(
    concat_ws(
      ' ',
      coalesce(v_part_number, ''),
      coalesce(v_description, ''),
      coalesce(v_manufacturer_part_number, ''),
      coalesce(v_beperp_part_no, '')
    )
  );

  return v_haystack ~ '(packing|forwarding|freight|insurance|transport|loading|unloading|cd applicable|cash discount|commercial adjustment|discount|round ?off)';
end;
$$;

create or replace function public.enforce_unique_project_part_mapping()
returns trigger
language plpgsql
as $$
declare
  v_project_id bigint;
  v_old_project_id bigint;
  v_existing_id bigint;
  v_existing_subsection text;
begin
  select project_id
    into v_project_id
  from project_subsections
  where id = new.project_section_id;

  if tg_op = 'UPDATE' then
    select project_id
      into v_old_project_id
    from project_subsections
    where id = old.project_section_id;

    if coalesce(v_old_project_id, -1) = coalesce(v_project_id, -1)
       and old.part_type is not distinct from new.part_type
       and old.part_id is not distinct from new.part_id then
      return new;
    end if;
  end if;

  if v_project_id is null or new.part_type is null or new.part_id is null then
    return new;
  end if;

  if public.project_part_duplicate_exempt(new.part_type, new.part_id) then
    return new;
  end if;

  select pp.id, ps.section_name
    into v_existing_id, v_existing_subsection
  from project_parts pp
  join project_subsections ps
    on ps.id = pp.project_section_id
  where ps.project_id = v_project_id
    and pp.part_type = new.part_type
    and pp.part_id = new.part_id
    and pp.id <> coalesce(new.id, -1)
  order by pp.id
  limit 1;

  if v_existing_id is not null then
    raise exception
      using
        errcode = '23505',
        message = format(
          'Duplicate project part mapping blocked: %s #%s is already mapped in project #%s (project_part_id=%s, subsection="%s"). Duplicate mappings are only allowed for packing, forwarding, discount, or similar commercial lines.',
          new.part_type,
          new.part_id,
          v_project_id,
          v_existing_id,
          coalesce(v_existing_subsection, 'unknown')
        );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_project_part_unique_mapping on public.project_parts;

create trigger trg_project_part_unique_mapping
before insert or update of project_section_id, part_type, part_id
on public.project_parts
for each row
execute function public.enforce_unique_project_part_mapping();
