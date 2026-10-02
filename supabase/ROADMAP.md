# Roadmap de evolução — BI EPC-15 + Supabase

## Estado atual

O projeto Supabase dedicado do BI já existe e a branch de integração está configurada para usar:
- região: São Paulo (`sa-east-1`);
- snapshot versionado do dataset EPC-15;
- publicação manual pelo BI;
- carregamento automático da versão atual;
- histórico de versões;
- dados manuais da Visão PB junto com a publicação;
- fallback de operação pelo Excel local quando não houver dataset publicado.

O Excel bruto não é armazenado no banco. O navegador continua extraindo e tratando os dados primeiro.

## Próximos avanços recomendados

1. **Validar em dois computadores**
   - PC de planejamento: carregar Excel e publicar;
   - PC da apresentação: abrir o site sem Excel e validar a mesma data-base.

2. **Trocar o login compartilhado por Supabase Auth**
   - usuário individual para planejamento;
   - usuário individual para apresentação;
   - perfis `editor` e `viewer`;
   - retirar definitivamente a senha compartilhada do fluxo.

3. **Separar permissões**
   - editor: pode publicar nova versão e editar informações PB;
   - viewer: somente leitura/apresentação;
   - registrar quem publicou cada versão.

4. **Versionamento e rollback pela interface**
   - mostrar últimas publicações;
   - botão para comparar versões;
   - botão controlado para restaurar uma publicação anterior.

5. **Sincronizar o BI Rundown**
   - usar `dataset_type = rundown`;
   - não misturar o dataset Rundown com o EPC-15;
   - manter os dois painéis no mesmo projeto Supabase.

6. **Histórico semanal real**
   - manter snapshots por data-base;
   - gerar evolução do Real ao longo do tempo sem depender de histórico fictício no Excel;
   - usar esse histórico para Curva S e tendência.

7. **Observabilidade**
   - guardar tempo de processamento e tamanho do snapshot;
   - validar `schema_version` antes de abrir uma publicação;
   - mostrar aviso claro quando uma publicação for incompatível.

8. **Escalabilidade**
   - enquanto o snapshot for pequeno/médio, JSONB versionado é simples e adequado;
   - se o dataset crescer muito, separar detalhes pesados em tabelas/chunks mantendo o snapshot executivo leve.

## Regras de segurança

- Nunca usar `service_role` no GitHub Pages.
- A publishable key pode ficar no frontend.
- Tabelas permanecem sem acesso direto para `anon`.
- A superfície pública atual é limitada às RPCs necessárias.
- O helper interno de senha não é executável por `anon`.
- Antes de uso amplo, migrar para Supabase Auth é a evolução recomendada.

## Critério para merge do PR

Não fazer merge apenas porque o banco existe. Validar primeiro:
- login;
- Excel local;
- publicação;
- recarga da versão publicada;
- Visão PB;
- outro navegador/computador;
- fallback;
- console sem erros.
