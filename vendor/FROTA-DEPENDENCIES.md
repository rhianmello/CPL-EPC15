# Bibliotecas do módulo de frota

O módulo reutiliza Chart.js e Lucide existentes. O cliente Supabase do módulo é fixado em `@supabase/supabase-js@2.117.2`, sem alterar os scripts dos demais painéis.

O leitor Excel do módulo usa **SheetJS CE 0.20.3**, obtido da distribuição oficial:

- Origem: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
- Arquivo: `xlsx-frota-0.20.3.min.js`
- SHA-256: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`
- Licença original: `xlsx-frota-LICENSE.txt`
- Instalação oficial: https://docs.sheetjs.com/docs/getting-started/installation/standalone/

A cópia separada evita modificar a leitura dos dashboards existentes e inclui as correções de Prototype Pollution e ReDoS documentadas nos avisos oficiais:

- https://cdn.sheetjs.com/advisories/CVE-2023-30533
- https://cdn.sheetjs.com/advisories/CVE-2024-22363

Os dados originais da planilha de referência não são distribuídos neste diretório. A carga inicial permanece no banco em uma conferência privada, acessível somente com sessão de edição válida.
