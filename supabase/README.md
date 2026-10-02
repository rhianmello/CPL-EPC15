# Supabase — BI EPC-15

Esta pasta prepara a sincronização do BI sem substituir a leitura local do Excel.

## Fluxo

1. O Excel continua sendo processado no navegador.
2. O BI gera o mesmo modelo padronizado usado pelas telas.
3. **Publicar atualização** grava um snapshot versionado no Supabase.
4. Outro computador abre o mesmo GitHub Pages e carrega automaticamente a publicação atual.
5. Se o Supabase estiver indisponível, o botão **Selecionar Excel** continua funcionando.

## Segurança

- O frontend usa apenas a publishable key.
- Nunca coloque service_role no repositório.
- Leitura e publicação são feitas por RPCs security definer, protegidas pelo login compartilhado do BI.
- As tabelas não dão acesso direto para anon/authenticated.

## Configuração

Depois de criar o projeto Supabase:

1. aplique migrations/001_bi_publications.sql;
2. copie a URL e a publishable key para js/supabase-config.js;
3. defina enabled: true;
4. teste login, publicação, recarga e fallback.

A migration não publica senha padrão utilizável. Configure a credencial administrativa diretamente no Supabase após aplicar o esquema.
