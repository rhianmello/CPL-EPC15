# Consolidador documental PDF — CPL EPC-15

## Modos e garantias

1. **Preservar originais (recomendado)**: o PDF final contém índice e arquivos PDF anexados como fluxos binários. Os bytes originais entram na API `pdf-lib.attach`; o relatório `RELATORIO_SHA256.json` é anexado. Antes de liberar o arquivo, PDF.js lê os anexos do PDF gerado e o navegador compara tamanho e SHA-256 de **todos** os PDFs extraídos contra os bytes escolhidos. Falhas bloqueiam o download. A integridade dos arquivos anexos não é sinônimo de validade das assinaturas.
2. **Unir páginas**: cria novo documento contínuo. O PDF final **não contém** as assinaturas criptográficas originais válidas. Aparência de rubrica, assinatura escaneada, selo e imagem não demonstram assinatura digital.
3. **Unir para assinar novamente**: cria PDF contínuo não assinado. Um signatário autorizado deve assinar depois, com ferramenta apropriada. Não há integração com chaves privadas, ICP-Brasil ou Gov.br nesta versão.

A saída do modo 1 é um **PDF convencional com anexos**, não um arquivo PDF Portfolio com Collection Dictionary completo e não um pacote ASiC-E. Essa escolha mantém uma página de índice legível e compatibilidade ampla com leitores que suportam anexos, mas alguns visualizadores de navegador não mostram os anexos. O Adobe Acrobat permite abrir o painel de anexos via **Menu > Exibir > Mostrar/Ocultar > Painéis laterais > Anexos**. Extraia cada PDF e valide a assinatura nele, não no índice.

## Base técnica e limitações de assinatura

Assinaturas PDF usam dicionário de assinatura em AcroForm, `/ByteRange` e um CMS/PKCS#7 no `/Contents`, com subfiltros como `/adbe.pkcs7.detached` e `/ETSI.CAdES.detached`. Múltiplas assinaturas podem viver em revisões incrementais. Restrições `/DocMDP` e `/FieldMDP` podem proibir certas alterações. PAdES pode acrescentar informações de validação de longo prazo (DSS/VRI e carimbos do tempo), sem autorizar uma mesclagem arbitrária. A cópia de páginas não mantém esses objetos e intervalos de bytes do documento de origem, por isso não preserva assinaturas. A detecção feita pela interface é uma busca heurística de estruturas legíveis (falsos positivos e negativos são possíveis), **não é verificação CMS, PAdES, ICP-Brasil, revogação ou cadeia de certificados**.

Certificado existente, certificado confiável, assinatura criptograficamente íntegra, integridade do documento atual e conformidade com políticas de assinatura são avaliações diferentes. Para arquivos assinados via Gov.br ou ICP-Brasil, conferir com Acrobat e/ou VALIDAR do ITI. Não enviar documento sigiloso a validador externo sem autorização da empresa.

Os PDFs selecionados não são enviados a um backend. As bibliotecas `pdf-lib@1.17.1` (geração) e `pdf.js@3.11.174` (extração de verificação) são carregadas de CDNs. O código não envia os bytes a elas por rede, mas **o fornecedor de scripts externos passa a executar código no mesmo contexto do documento**. Para alta confidencialidade, baixar e hospedar versões auditadas localmente, fixar hashes SRI, impor CSP estrita e testar em rede corporativa. O processamento em memória pode ser pesado para arquivos grandes. PDFs criptografados podem ser anexados intactos; a ferramenta não tenta remover senha nem consegue mesclar páginas protegidas.

## Testes automatizados

Rodar da raiz do repositório:

```bash
pip install pytest playwright pypdf
python -m playwright install chromium
pytest -q PDF/test_e2e.py
```

Os testes exigem navegador Chromium e acesso às bibliotecas externas. Não há upload de documentos de teste.

| Cenário | Resultado esperado | Resultado real |
|---|---|---|
| Dois PDFs sem assinatura | Anexos idênticos após extração, SHA-256 igual | PASSOU no GitHub Actions (Chromium, 11/11/2026) |
| Dois PDFs com orientações diferentes | União com 2 páginas e tamanhos preservados | PASSOU no GitHub Actions (Chromium, 11/11/2026) |
| PDF criptografado | Pode anexar intacto; união deve rejeitar | PASSOU no GitHub Actions (Chromium, 11/11/2026) |
| Assinatura manuscrita digitalizada | Não classificar imagem como assinatura criptográfica validada | Amostra e teste manual pendentes |
| PDF assinado com Adobe Acrobat | Anexar bytes intactos; validar assinatura no extraído | Amostra autorizada e teste manual pendentes |
| PDF PAdES / ICP-Brasil | Anexar bytes intactos; validar no ITI/Acrobat | Amostra autorizada e teste manual pendentes |
| PDF assinado via Gov.br | Anexar bytes intactos; validar no ITI/Acrobat | Amostra autorizada e teste manual pendentes |
| PDF com múltiplas assinaturas | Manter bytes do original; conferir todas no extraído | Amostra autorizada e teste manual pendentes |
| PDF certificado com DocMDP/FieldMDP | Não alterar original; testar validade externa | Amostra autorizada e teste manual pendentes |
| Arquivo PDF corrompido ou não PDF | Tratar erro sem afetar originais | Teste manual pendente |
| PDF muito grande | Mensagem de erro, sem alterar os originais | Teste de carga pendente |

**Execução real:** 3 testes passaram em 4,58 s no GitHub Actions em 11/11/2026. Log: https://github.com/rhianmello/CPL-EPC15/actions/runs/43019046405 . Esta evidência cobre somente os PDFs sintéticos dos testes, não assinaturas reais. Nenhuma aprovação de assinaturas reais é reivindicada antes de verificação independente.

## Referências

- ISO 32000 (PDF), ETSI EN 319 142-1 (PAdES)
- ITI — Guia do Desenvolvedor, capítulo VI: https://validar.iti.gov.br/guia-desenvolvedor.html
- Adobe Acrobat — painel de anexos: https://helpx.adobe.com/acrobat/desktop/edit-documents/use-links-and-attachments/open-attachment.html
- pdf-lib — API attach: https://pdf-lib.js.org/docs/api/classes/pdfdocument
