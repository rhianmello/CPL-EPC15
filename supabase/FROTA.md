# Gestão de Frota & Equipamentos — CPL EPC-15

O cadastro e os históricos são a fonte oficial. Excel é uma entrada revisável; sua ausência em uma planilha nunca exclui um ativo. Esta migration adiciona um módulo isolado ao projeto Supabase existente e não substitui as funções ou os dados dos demais painéis.

## Objetos do banco

Migration: `migrations/20261006194038_fleet_assets_and_append_only_history.sql`, criada com `supabase migration new fleet_assets_and_append_only_history` (CLI 2.81.3).

Correção incremental: `migrations/20261006224819_fleet_draft_human_review_metadata.sql`, criada com `supabase migration new fleet_draft_human_review_metadata`. Ela altera somente a comparação do payload original em `publish_import`, permitindo os metadados `raw.issues` e `raw.human_corrections` adicionados pelo drawer. Células/cabeçalhos/status original continuam iguais ao draft imutável. A definição esperada é verificada antes do patch; divergências abortam sem mudanças. Owner, ACL, `SECURITY DEFINER` e `search_path` são preservados. Reaplicar é uma operação sem efeito. Nenhuma tabela/dado é alterado por essa migration.

As dez tabelas ficam no schema **fleet_private**, sem acesso direto de `anon` ou `authenticated`, e todas têm RLS habilitada sem políticas para acesso do navegador:

| Tabela | Uso |
| --- | --- |
| `fleet_assets` | Cadastro atual com UUID imutável, identificação genérica, dados operacionais, km/horímetro, `extra` e fonte original |
| `fleet_ptrans` | PTRAN/ISC e suas versões, com validade e flag provisória opcionais |
| `fleet_inspections` | Inspeções sucessivas, tipos, resultados e validade |
| `fleet_maintenance` | Manutenções, revisões, próximas datas/km/horas e custos informados |
| `fleet_documents` | Documentos, validade e referência opcional a arquivo privado |
| `fleet_movements` | Eventos formais de entrada/saída/responsável/gerência/operação |
| `fleet_audit_log` | Auditoria imutável por campo com valor anterior/novo, origem e lote |
| `fleet_import_batches` | Conteúdo exato revisado, decisões inclusive ignoradas, hash e resultado de cada publicação |
| `fleet_import_drafts` | Fonte inicial pendente e imutável; acesso ao conteúdo exige sessão de edição |
| `fleet_edit_sessions` | Hash de capacidade temporária; não acessível pela leitura pública |

Identificadores não são únicos: uma placa, patrimônio ou serial repetido pode representar ativos distintos após decisão humana. Os índices usam uma chave de comparação sem espaços/pontuação e com letras minúsculas; o texto original continua salvo. PTRAN/ISC seguem o mesmo critério de comparação. Há índices para consultas por ativo, data, identificação, PTRAN, ISC, categoria, responsável e vencimento.

## RPCs públicas

Todas as wrappers em `public` usam `SECURITY INVOKER`, `search_path=''` e permissões explícitas para `anon`/`authenticated`.

| RPC / argumentos | Resultado |
| --- | --- |
| `fleet_open_edit_session(p_master_password text, p_actor text)` | `{token, expires_at}` |
| `fleet_close_edit_session(p_token text)` | `{ok:true}`; revogação idempotente |
| `fleet_list_assets_public(p_search text='', p_offset int=0, p_limit int=250)` | `{assets:[], total, updated_at, pending_import:{id,file_name,row_count}\|null}` |
| `fleet_asset_detail_public(p_asset_id uuid)` | `{asset,ptrans:[],inspections:[],maintenance:[],documents:[],movements:[],audit:[]}` |
| `fleet_history_public(p_filters jsonb={},p_offset int=0,p_limit int=250)` | `{events:[],total}` |
| `fleet_save_asset(p_token text,p_asset jsonb,p_expected_updated_at timestamptz=null)` | Ativo salvo |
| `fleet_add_record(p_token text,p_kind text,p_asset_id uuid,p_record jsonb,p_expected_updated_at timestamptz=null)` | Registro inserido + `asset_updated_at` |
| `fleet_publish_import(p_token text,p_batch_id uuid,p_file_name text,p_rows jsonb)` | `{batch_id,inserted,updated,ptran_inserted,ignored}` |
| `fleet_pending_import(p_token text,p_draft_id uuid)` | `{draft_id,file_name,row_count,parsed:{rows:[],issues:[],ignored:0}}` |

Os registros de listagem incluem PTRAN, inspeções, manutenções e documentos atuais. Uma versão com `supersedes_id` substitui o indicador anterior. Para inspeções/documentos, a listagem escolhe o registro mais recente por tipo e data do evento, sem excluir inspeções anteriores. Na ficha estão todas as versões, com `is_current` indicando apenas se houve substituição explícita. Novas inspeções/documentos podem existir independentemente de `supersedes_id`; manutenção sem substituição explícita continua visível porque uma nova OS não quita outra automaticamente.

Busca considera identificação, modelo, categoria, empresa, gerência, responsável, PTRAN e ISC. Paginação pública é limitada a 500 ativos/eventos por chamada. A ficha consulta somente um ativo e retorna seu histórico completo. Filtros do histórico: `from`, `to` (dia final incluído), `asset_id`, `kind`, `actor`/`user`, `responsavel`, `origin`/`origem`. `kind` aceita `ptrans`, `inspections`, `maintenance`, `documents`, `movements`, `assets` ou o nome `fleet_*`.

O audit retorna `occurred_at` e o alias `created_at`, `action`, `table_name`, `field_name`, `old_value`, `new_value`, `actor`, `actor_user_id`, `authenticated_as='master'`, `origin` e `import_batch_id`. O nome do operador é declarado, não uma identidade individual verificada: o login atual do BI é compartilhado. Quando houver Supabase Auth, o UUID real fica registrado e a capacidade se vincula a ele.

### Carga inicial pendente

A migration não contém dados da planilha. Após a revisão estrutural, um administrador autorizado pode registrar um draft com `file_name`, `row_count`, `source_rows` (linhas do parser, sem decisões de publicação) e `source_metadata` (hash SHA-256 e aba). Esse staging não cria ativos, PTRAN ou audit de publicação. O dashboard público exibe apenas nome/quantidade da carga pendente. Depois de liberar edição, o operador abre a carga, confere linha a linha, escolhe criar/vincular/ignorar e publica explicitamente.

O conteúdo original e seus metadados são imutáveis. A publicação utiliza `p_batch_id=draft_id`, exige todas as linhas inclusive as ignoradas com `reviewed=true`, e valida números de linha únicos/nome do arquivo/fonte original. Alterações humanas afetam os campos propostos; não reescrevem as células originais. Os metadados de conferência `raw.issues`/`raw.human_corrections` são adicionais, ficam na revisão publicada/audit e não modificam o draft. Somente após a transação completa o servidor marca `published_batch_id`/`published_at`. Se falhar, o draft permanece pendente. O conteúdo não é enviado como arquivo JSON público no GitHub Pages.

## Autorização e isolamento

O backend reutiliza **sem mudar corpo ou senha** `public.coordination_master_ok(text)`. Somente a senha correta emite capacidade de 256 bits aleatórios, válida por 15 minutos, armazenada no banco apenas como SHA-256. Cada escrita revalida validade, revogação e a identidade Auth vinculada antes e depois da operação; se um lock atrasar a execução até a expiração, a RPC inteira é revertida. Uma importação também revalida a cada linha. O frontend mantém senha/token só em memória e revoga a sessão ao sair; o limite de tempo é imposto pelo banco, mesmo que a revogação do navegador não chegue.

Os handlers são `SECURITY DEFINER` privados da role **cpl_fleet_executor**, `NOLOGIN`, sem superusuário, criação de roles/bancos ou bypass de RLS. Ela possui somente os objetos da frota, uso de `public`/`extensions` e EXECUTE no verificador master/rotinas de criptografia necessárias. A role é atribuída ao usuário de migration para transferir ownership; nunca a `anon`/`authenticated`. Helpers internos sem validação não recebem EXECUTE dos papéis da API. Todo SQL dinâmico usa tabelas fixas de uma lista permitida e parâmetros.

Há uma exceção pequena ao owner limitado: **fleet_private.request_user_id()** conserva o owner da migration (normalmente `postgres`). Seu corpo constante só retorna `auth.uid()`; apenas a role interna pode chamá-la. Isso é necessário porque `postgres` tem USAGE em `auth`, mas não pode transferir esse privilégio do schema que pertence ao Supabase. O helper não consulta tabelas nem aceita argumentos. Não se altera a ACL existente de `auth.uid()`.

Assets exigem versão `updated_at` ao editar. Eventos filhos também exigem a versão do ativo e atualizam esse relógio para impedir perda de alterações simultâneas. O banco rejeita campos desconhecidos, JSON excessivo, valores negativos e links de anexo sem HTTPS. Históricos e audit não aceitam UPDATE/DELETE, mesmo por gravação direta privilegiada. UUID/criação do ativo não podem mudar e não há RPC de exclusão física.

## Publicação de Excel

Cada linha enviada após conferência contém:

```json
{
  "row_number": 3,
  "raw": {"cells": [], "headers": [], "original_status": "PRONTA", "issues": []},
  "asset_id": null,
  "expected_updated_at": null,
  "asset": {"placa_identificador": "EXEMPLO001", "modelo": "MODELO FICTÍCIO"},
  "ptran": {"numero_ptran": "100001", "status": "Pronto"},
  "decision": "new",
  "reviewed": true
}
```

`decision` é `new`, `update` ou `ignore`. `new` ganha UUID próprio; `update` exige UUID/version conferidos; `ignore` não cria nada. Não enviar propriedades de UI como `changes`/`issues` no nível da linha: os alertas permanecem em `raw.issues`.

Regras do servidor:

- Tudo é uma transação. Se uma linha falhar, cadastro, histórico, audit e lote são desfeitos juntos.
- O mesmo `batch_id` e conteúdo retorna o mesmo resultado sem repetir gravações. Reutilizar o UUID com conteúdo/nome diferente falha.
- Identificação, PTRAN ou ISC repetidos no lote ou banco exigem `reviewed=true` nas linhas afetadas. Isso autoriza preservar registros distintos, jamais consolidá-los automaticamente.
- Alertas `raw.issues` com severidade `error`, status desconhecido e observação `CANCELAR` exigem revisão explícita. A sinalização original permanece na fonte.
- Valores nulos/textos vazios do Excel não apagam valores conhecidos. Limpar um campo exige edição manual explícita.
- Um PTRAN vira versão anterior somente por `supersedes_id` ou correspondência única de número presente; sem número, ISC presente e igual pode estabelecer vínculo. Dois identificadores ausentes jamais implicam o mesmo PTRAN. Versões semanticamente idênticas não fabricam eventos.
- Não se infere disponibilidade, permanência no contrato, emissão, validade, ano, marca ou data corrigida. Datas inválidas ficam nulas nos campos tipados e conservadas em `raw` para revisão.
- Entradas/saídas exigem data declarada. Uma nova entrada limpa `Fora do contrato` para estado operacional ainda não confirmado; não infere disponibilidade. Saída inativa e mantém todos os históricos.
- Até 2.000 linhas/8 MB por lote, 100 KB por registro. Arquivos maiores devem ser divididos antes da conferência/publicação.

## Documentos e expansão

`storage_bucket`/`storage_path` preparam referências ao Supabase Storage privado. `arquivo_url`/`anexo_url` aceitam HTTPS opcional, sem upload ou criação de bucket nesta fase. Não usar bucket público para documentos pessoais/contratuais. Para futura implantação de anexos, criar bucket privado e um endpoint que valide a capacidade para escrita e autorize URLs assinadas conforme o modelo de leitura escolhido; não basta esconder o botão. `extra` suporta futuros dados de combustível, CNH, locação, avarias e custos sem inventar informações.

## Verificação local e implantação

Os testes usam PostgreSQL embarcado **PGlite 0.5.8** com `pgcrypto`, sem rede e sem credenciais de produção. Rodam a migration sob role CREATEROLE **sem superusuário**, simulando o ownership/permissões do projeto. A suíte valida master, RLS/grants dos dois papéis de API, role interna, versões/audit, movimentos, concorrência, conflitos normalizados, dados desconhecidos, idempotência e rollback integral.

Na pasta que contém o checkout, instalar o runtime fora do repositório, mantendo a versão fixa:

```powershell
npm.cmd install --prefix fleet-tools --save-exact @electric-sql/pglite@0.5.8
```

No repositório:

```powershell
node --test tests/frota-sql.test.cjs
```

O teste tenta uma instalação normal do pacote e depois `../fleet-tools/node_modules`; alternativamente definir `PGLITE_MODULE_DIR` com o caminho absoluto do pacote. O runtime de teste não pertence ao frontend. Senha do fixture é somente local, sem relação com a master real. A suíte padrão inclui draft privado, fonte imutável, paginação com NULL bloqueada e uma gravação que expira durante a operação para provar rollback.

Para um ensaio adicional com a extração auditada da planilha real, definir `FROTA_SOURCE_JSON` com o arquivo privado de extração e repetir o teste. Ele percorre parser → draft → conferência simulada → publicação → RPC e valida todas as fontes/status/contagens. `reviewed=true` nessa simulação é um fixture local e **não autoriza carga de produção**; o banco real continua com a revisão inicial pendente.

Antes de aplicar em produção, confirmar ownership do verificador e USAGE/CREATE/grants necessários para `postgres`, executar a revisão SQL/advisors e registrar contagens/hash das tabelas/funções existentes. Aplicar **apenas esta migration**, sem importar o Excel. `fleet_private` deve permanecer fora dos schemas expostos pelo PostgREST. Confirmar RLS, grants, owner limitado e leitura vazia via chave pública; comparar as contagens anteriores. Dados existentes não devem mudar. A carga inicial é etapa separada após conferência humana das inconsistências do arquivo.

Para desativar o módulo, revogar EXECUTE das nove wrappers públicas e retirar os links de navegação; preservar tabelas/históricos. Não usar DROP/CASCADE para rollback de dados já publicados.
