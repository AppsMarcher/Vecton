begin;

-- Rede de segurança: funções novas deixam de nascer abertas ao acesso anônimo.
--
-- Por padrão o Postgres dá EXECUTE a PUBLIC (todo mundo, inclusive o papel anônimo da API) em toda função
-- criada. Foi assim que funções SECURITY DEFINER sem checagem de quem chama ficaram expostas sem ninguém
-- notar (migrations 359 e 360 corrigiram dois casos).
--
-- Esta regra vale SÓ para funções criadas daqui em diante pelo dono do banco (postgres: migrations e
-- SQL Editor). Nenhuma função existente é alterada. O schema public já concede EXECUTE a authenticated e
-- service_role por padrão, então o app logado continua funcionando; só quem precisar de acesso anônimo
-- passa a escrever o grant de forma explícita:
--   grant execute on function public.minha_funcao(...) to anon;
--
-- Atenção ao instalar uma extensão nova por SQL como postgres: as funções dela também nascem sem PUBLIC.
-- Se algo reclamar de "permission denied for function", conceda EXECUTE a authenticated.
alter default privileges for role postgres revoke execute on functions from public;

-- Para desfazer:
--   alter default privileges for role postgres grant execute on functions to public;

commit;
