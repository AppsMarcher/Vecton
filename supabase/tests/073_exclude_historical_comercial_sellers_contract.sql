-- Contrato: situação histórica no Time Comercial é exclusão absoluta dos
-- relatórios, independentemente de vigência, meta, venda ou seleção anterior.
do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.comercial_report_execute(uuid,integer,integer,uuid,boolean)'::regprocedure
  );
  if position('(v_include_historical or h.situacao <> ''historico'')' in v_definition) > 0
     or position('coalesce(pr.situacao, v.situacao, ''historico'')' in v_definition) > 0
     or position('where v.situacao = ''ativo''' in v_definition) = 0 then
    raise exception 'Contrato violado: motor ainda permite status histórico';
  end if;

  v_definition := pg_get_functiondef(
    'public.comercial_report_team(uuid,integer,integer)'::regprocedure
  );
  if position('v.situacao = ''ativo''' in v_definition) = 0 then
    raise exception 'Contrato violado: filtro de equipe ainda lista históricos';
  end if;

  if to_regprocedure('public.comercial_bateu_levou(uuid,integer,integer,uuid)') is not null then
    v_definition := pg_get_functiondef(
      'public.comercial_bateu_levou(uuid,integer,integer,uuid)'::regprocedure
    );
    if position('v.situacao=''ativo''' in v_definition) = 0 then
      raise exception 'Contrato violado: Bateu, Levou legado ainda lista históricos';
    end if;
  end if;

  if to_regprocedure('public.comercial_final_de_ano(uuid,integer,integer,uuid)') is not null then
    v_definition := pg_get_functiondef(
      'public.comercial_final_de_ano(uuid,integer,integer,uuid)'::regprocedure
    );
    if position('v.situacao=''ativo''' in v_definition) = 0 then
      raise exception 'Contrato violado: Final de Ano legado ainda lista históricos';
    end if;
  end if;
end;
$$;
