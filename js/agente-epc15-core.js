(function (root) {
  "use strict";
  function normalize(value) {
    return String(value == null ? "" : value).normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function finite(value) { return typeof value === "number" && Number.isFinite(value); }
  function pct(value) {
    return finite(value) ? (value * 100).toLocaleString("pt-BR", {maximumFractionDigits: 1}) + "%" : "não disponível";
  }
  function pp(value) {
    return finite(value) ? (value > 0 ? "+" : "") +
      (value * 100).toLocaleString("pt-BR", {maximumFractionDigits: 2}) + " p.p." : "não disponível";
  }
  function dataDate(value) {
    if (!value) return "não informada";
    var date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? "não informada" :
      date.toLocaleDateString("pt-BR", {timeZone: "UTC"});
  }
  function unitCode(question) {
    var match = normalize(question).match(/\bu\s*[-–]?\s*(\d{4})\b/);
    return match ? "U-" + match[1] : null;
  }
  function unitFor(model, code) {
    return (model.units || []).find(function (unit) {
      return normalize(unit.code).replace(/[^a-z0-9]/g, "") ===
        normalize(code).replace(/[^a-z0-9]/g, "");
    });
  }
  function source(context) {
    var model = context && context.model;
    return model ? "Base carregada: " + dataDate(model.dataBase) +
      (context.fileName ? " • " + context.fileName : "") : "";
  }
  function result(text, context, extra) {
    return Object.assign({text: text, source: context && context.model ? source(context) : ""}, extra || {});
  }
  function stats(item) {
    return "Previsto: " + pct(item.planned) + " | Realizado: " + pct(item.actual) +
      " | Desvio: " + pp(item.variance);
  }
  function offendingRows(units, limit) {
    var risks = [];
    units.forEach(function (unit) {
      (unit.details || []).forEach(function (row) {
        if (!finite(row.weightedVariance) || row.weightedVariance >= 0) return;
        risks.push({
          unit: unit.code,
          phase: row.phase || "",
          name: row.criterion || row.step || row.component || row.grouping || row.subphase || row.phase || "Item sem descrição",
          value: row.weightedVariance,
          variance: row.variance
        });
      });
    });
    return risks.sort(function(a,b){return a.value-b.value;}).slice(0,limit);
  }
  function risksText(units, limit) {
    var items = offendingRows(units, limit);
    if (!items.length) return "Não encontrei linhas-folha com desvio ponderado (AB) negativo nesta base.";
    return "Maiores frentes ofensoras (coluna AB, somente linhas-folha):\n" +
      items.map(function (row,i) {
        return (i+1) + ". " + row.unit + " • " + row.name +
          (row.phase ? " [" + row.phase + "]" : "") +
          " — AB: " + pp(row.value);
      }).join("\n");
  }
  function unitDetails(unit) {
    var phases = (unit.phases || []).filter(function(p){return finite(p.variance);})
      .sort(function(a,b){return a.variance-b.variance;}).slice(0,3);
    var text = unit.code + " — " + (unit.rawName || unit.name || "Unidade") +
      "\n" + stats(unit) +
      "\nStatus: " + (unit.status && unit.status.label ? unit.status.label : "sem classificação");
    if (phases.length) {
      text += "\nFases com menor desempenho:\n" + phases.map(function(p) {
        return "• " + (p.phase || "Fase sem nome") + ": " + pp(p.variance);
      }).join("\n");
    }
    return text;
  }
  function help(question) {
    var q=normalize(question);
    if (/carregar|importar arquivo|selecionar excel/.test(q) || (/planilha|excel/.test(q) && /como|onde|preciso|quero|passo a passo/.test(q))) {
      return "Para carregar os indicadores, abra o Painel de Planejamento, clique em 'Selecionar Excel' e escolha o arquivo oficial .xlsb, .xlsx ou .xlsm. O arquivo deve estar recalculado e salvo. A leitura ocorre no navegador; a publicação é uma ação separada.";
    }
    if (/publica|salvar semana/.test(q) || (/atualiz/.test(q) && /como|onde|passo|fazer|quero/.test(q))) {
      return "Para publicar dados oficiais: carregue e confira o Excel, valide os indicadores e use 'Publicar atualização' com autorização de editor. A Reunião de Coordenação tem seu próprio controle de semana e salvamento. Eu não publico nem altero informações.";
    }
    if (/auditor|controle semanal|saude dos dados/.test(q)) {
      return "Abra 'Controle Semanal' no menu do BI, selecione a semana e verifique Saúde dos Dados, Verificações Automáticas, Evolução, Pendências e Pré-reunião. A auditoria não deve apagar dados automaticamente.";
    }
    if (/rundown/.test(q)) {
      return "A Curva Rundown mostra o saldo restante, realizado e projeções ao longo das semanas. Abra 'BI Rundown' no menu. Para analisar uma semana, utilize os dados publicados ou carregue a planilha compatível.";
    }
    if (/foto|drone|imagem/.test(q)) {
      return "As evidências visuais ficam em 'Tempo Fotográfico' e 'Acompanhamento por Drone'. Use os filtros de semana, entrega e fase. Fotos não são prova de avanço numérico sem conferência com a base física.";
    }
    if (/relatorio|pdf|imprimir/.test(q)) {
      return "Para emitir o relatório, abra o Painel Gerencial, selecione semana/unidade e use 'Emitir PDF da semana'. Antes de distribuir, confira a data-base e os filtros aplicados.";
    }
    if (/pareto|coluna ab|peso x desvio/.test(q) && /o que e|como funciona|como calcula|explique|significa|conceito|criterio/.test(q)) {
      return "O Pareto usa o desvio ponderado (coluna AB). Ele prioriza a contribuição dos itens ao atraso. O desvio simples indica a diferença entre realizado e previsto; o AB considera a ponderação. Para evitar dupla contagem, consultas do agente usam linhas-folha do primeiro bloco hierárquico.";
    }
    if (/frota/.test(q)) {
      return "Gestão de Frota é um módulo separado do BI, em 'frota.html'. Consulte veículos, PTRANs, manutenção, inspeções e documentação diretamente no módulo.";
    }
    if (/suprimento|materia(l|is)|almoxarifado/.test(q)) {
      return "O módulo de Suprimentos é separado do Plano de Ataque. Consulte ali requisições, cotações, recebimentos e saldo; o agente desta tela não altera estoques nem pedidos.";
    }
    return null;
  }
  function navigation(question) {
    var q=normalize(question), go=/\b(abrir|acessar|ir para|me leva|navegar|mostrar painel)\b/.test(q);
    if (!go) return null;
    if (/rundown/.test(q)) return {text:"Abrir BI Rundown em uma nova página.", link:"rundown.html", actionLabel:"Abrir BI Rundown"};
    var routes=[
      [/reuniao|coordenacao/,"pb","Reunião de Coordenação"],
      [/controle semanal|auditoria/,"week-health","Controle Semanal"],
      [/fotograf|fotos/,"photo-time","Tempo Fotográfico"],
      [/drone/,"drone","Acompanhamento por Drone"],
      [/analise/,"analysis","Análises"],
      [/gerencial|visao geral|planejamento/,"executive","Painel Gerencial"]
    ];
    for (var i=0;i<routes.length;i++) {
      if (routes[i][0].test(q)) return {text:"Abrir " + routes[i][2] + " no BI.", page:routes[i][1], actionLabel:"Abrir " + routes[i][2]};
    }
    return null;
  }
  function answer(question, context) {
    var q=normalize(question), model=context && context.model;
    if (!q) return result("Digite uma pergunta sobre planejamento, unidades, atrasos ou uso do sistema.", null);
    var nav=navigation(q);
    if (nav) return result(nav.text, null, nav);
    var instructions=help(q);
    if (instructions) return result(instructions, null);
    if (/\b(oi|ola|bom dia|boa tarde|boa noite|ajuda|o que voce faz)\b/.test(q) && q.length<48) {
      return result("Posso consultar o avanço do contrato, o previsto x realizado de uma unidade, o ranking de atrasos e as frentes ofensoras da coluna AB. Também ensino a usar os painéis e a auditoria. Minhas consultas são somente leitura.", null);
    }
    if (/previsao futura|quando vai terminar|data de conclusao|quando conclui|projetar prazo/.test(q)) {
      return result("Não calculo datas futuras sem uma linha de base e um método de projeção validados. Consulte a Curva Rundown e o cronograma oficial antes de afirmar uma previsão.", null);
    }
    if (!model || !model.contract || !Array.isArray(model.units)) {
      return result("Ainda não há uma base disponível nesta tela. Abra o Painel Gerencial e carregue o Excel oficial ou use a versão publicada. Depois, posso responder com números reais.", null);
    }
    var code=unitCode(q);
    var unit=code ? unitFor(model,code) : null;
    if (code && !unit) return result("A " + code + " não consta da versão carregada. Confira a unidade e a data-base.", context);
    var wantsRisk=/ofensor|maior(es)? atraso|atrasos? critico|pior(es)? frente|coluna ab|desvio ponderado|pareto/.test(q);
    if (wantsRisk) return result(risksText(unit ? [unit] : model.units, 5), context);
    if (unit) return result(unitDetails(unit), context);
    if (/unidade(s)? (atrasad|critica)|quais unidades|ranking|pior(es)? unidade|mais atrasad/.test(q)) {
      var all=model.units.filter(function(u){return finite(u.variance);})
        .sort(function(a,b){return a.variance-b.variance;});
      var delayed=all.filter(function(u){return u.variance<0;});
      if (!delayed.length) return result("Nenhuma unidade apresenta desvio negativo na versão carregada.", context);
      return result("Unidades com desvio negativo (" + delayed.length + " de " + model.units.length + "):\n" +
        delayed.slice(0,8).map(function(u,i){return (i+1)+". "+u.code+" — "+pp(u.variance)+" (realizado "+pct(u.actual)+")";}).join("\n"), context);
    }
    if (/unidades|quantas/.test(q) && /total|quantas|numero|existem/.test(q)) {
      return result("A base contém " + model.units.length + " unidades consolidadas (nível 1) no primeiro bloco hierárquico.", context);
    }
    if (/fonte|data.base|arquivo|versao|semana atual|atualiz/.test(q)) {
      return result("Consulta realizada sobre a versão atualmente carregada no BI.\nData-base: " +
        dataDate(model.dataBase) + ".\nArquivo: " + (context.fileName || "não identificado") +
        ".\nNão assumo que a base carregada seja a mais recente do projeto.", context);
    }
    if (/contrato|resumo|geral|avanco|progresso|previsto|realizado|desvio|status|situacao|quanto/.test(q)) {
      var negative=model.units.filter(function(u){return finite(u.variance)&&u.variance<0;}).length;
      return result("Resumo do contrato EPC-15:\n" + stats(model.contract) +
        "\nUnidades na base: " + model.units.length +
        " | Unidades com desvio negativo: " + negative +
        "\nOs totais usam exclusivamente o primeiro bloco hierárquico.", context);
    }
    return result("Posso responder a: 'Resumo do contrato', 'Quais unidades atrasadas?', 'Avanço da U-8222', 'Maiores frentes ofensoras' ou 'Como publicar o Excel?'. Para análises avançadas, informe uma unidade e o indicador.", context);
  }
  root.EPC15AgentCore = {answer:answer, normalize:normalize, unitCode:unitCode};
})(typeof window !== "undefined" ? window : globalThis);
