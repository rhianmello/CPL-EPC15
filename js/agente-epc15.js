(function () {
  "use strict";
  if (!window.EPC15AgentCore || document.getElementById("epc-agent-root")) return;
  var host=document.createElement("section");
  host.id="epc-agent-root";
  host.className="epc-agent-root";
  host.innerHTML=
    '<button class="epc-agent-launcher" id="epc-agent-launcher" type="button" aria-label="Abrir Agente EPC-15" aria-expanded="false" aria-controls="epc-agent-panel"><span class="epc-agent-spark" aria-hidden="true">✦</span><span>Agente EPC-15</span></button>'+
    '<aside class="epc-agent-panel" id="epc-agent-panel" aria-label="Agente de Planejamento EPC-15" hidden>'+
      '<header class="epc-agent-header"><div><strong>✦ Agente de Planejamento</strong><small>Consultas reais • somente leitura</small></div><button id="epc-agent-close" type="button" aria-label="Fechar agente">×</button></header>'+
      '<div id="epc-agent-status" class="epc-agent-status" aria-live="polite"></div>'+
      '<div id="epc-agent-messages" class="epc-agent-messages" role="log" aria-live="polite" aria-relevant="additions text"></div>'+
      '<div id="epc-agent-suggestions" class="epc-agent-suggestions" aria-label="Perguntas sugeridas"></div>'+
      '<form id="epc-agent-form" class="epc-agent-form"><label class="epc-agent-sr" for="epc-agent-question">Pergunte ao agente</label><input id="epc-agent-question" name="question" maxlength="450" autocomplete="off" placeholder="Pergunte sobre o planejamento..." required><button type="submit">Enviar</button></form>'+
      '<footer>Respostas baseadas na planilha carregada. Não altera dados e não usa IA externa.</footer>'+
    '</aside>';
  document.body.appendChild(host);
  var launcher=document.getElementById("epc-agent-launcher");
  var panel=document.getElementById("epc-agent-panel");
  var close=document.getElementById("epc-agent-close");
  var messages=document.getElementById("epc-agent-messages");
  var suggestions=document.getElementById("epc-agent-suggestions");
  var form=document.getElementById("epc-agent-form");
  var input=document.getElementById("epc-agent-question");
  var status=document.getElementById("epc-agent-status");
  var greeted=false;
  var prompts=["Resumo do contrato","Quais unidades estão atrasadas?","Maiores frentes ofensoras","Como carregar o Excel?"];
  function currentContext() {
    var shell=document.getElementById("app-shell");
    var visible=shell && !shell.classList.contains("hidden");
    var ready=visible && window.EPC15State && window.EPC15State.hasData && window.EPC15State.hasData();
    var file=ready && window.EPC15State.getCurrentFile && window.EPC15State.getCurrentFile();
    return {
      model:ready && window.EPC15State.getCurrentModel ? window.EPC15State.getCurrentModel() : null,
      fileName:file && file.name ? String(file.name) : ""
    };
  }
  function refreshStatus() {
    var context=currentContext();
    status.textContent=context.model ? "● Base carregada: " +
      (context.fileName || "versão publicada") : "○ Sem planilha ativa nesta tela";
    status.dataset.active=context.model?"yes":"no";
  }
  function addMessage(kind,text,info) {
    var article=document.createElement("article");
    article.className="epc-agent-bubble epc-agent-"+kind;
    var content=document.createElement("p");
    content.textContent=text;
    article.appendChild(content);
    if (info && info.source) {
      var small=document.createElement("small");
      small.textContent=info.source;
      article.appendChild(small);
    }
    if (info && (info.page || info.link)) {
      var action;
      if (info.link) {
        action=document.createElement("a");
        var links={"rundown.html":"rundown.html"};
        action.href=links[info.link] || "#";
        action.target="_blank";
        action.rel="noopener noreferrer";
      } else {
        action=document.createElement("button");
        action.type="button";
        action.addEventListener("click",function () {
          var shell=document.getElementById("app-shell");
          if (!shell || shell.classList.contains("hidden")) {
            addMessage("bot","Abra primeiro o Painel de Planejamento para acessar essa seção.");
            return;
          }
          var nav=document.querySelector('.main-nav [data-page="'+info.page+'"]');
          if (nav) { nav.click(); toggle(false); }
          else addMessage("bot","A seção não está disponível nesta tela.");
        });
      }
      action.className="epc-agent-action";
      action.textContent=info.actionLabel || "Abrir";
      article.appendChild(action);
    }
    messages.appendChild(article);
    while(messages.children.length>45) messages.firstElementChild.remove();
    messages.scrollTop=messages.scrollHeight;
  }
  function ask(question) {
    var value=String(question||"").trim();
    if (!value) return;
    addMessage("user",value);
    try {
      var info=window.EPC15AgentCore.answer(value,currentContext());
      addMessage("bot",info.text,info);
    } catch(error) {
      console.error("Falha no Agente EPC-15",error);
      addMessage("bot","Não consegui consultar estes dados. Verifique a base carregada e tente outra pergunta.");
    }
    refreshStatus();
  }
  function toggle(open) {
    panel.hidden=!open;
    launcher.setAttribute("aria-expanded",String(open));
    host.classList.toggle("epc-agent-open",open);
    if (open) {
      refreshStatus();
      if (!greeted) {
        greeted=true;
        addMessage("bot","Olá! Sou o agente de consulta do EPC-15. Posso explicar os módulos e analisar os dados da versão carregada, sem modificar o planejamento.");
      }
      input.focus();
    } else launcher.focus();
  }
  prompts.forEach(function(prompt) {
    var button=document.createElement("button");
    button.type="button";
    button.textContent=prompt;
    button.addEventListener("click",function(){ask(prompt);});
    suggestions.appendChild(button);
  });
  launcher.addEventListener("click",function(){toggle(panel.hidden);});
  close.addEventListener("click",function(){toggle(false);});
  form.addEventListener("submit",function(event) {
    event.preventDefault();
    var value=input.value;
    input.value="";
    ask(value);
    input.focus();
  });
  document.addEventListener("keydown",function(event) {
    if (event.key==="Escape" && !panel.hidden) toggle(false);
  });
  window.EPC15Agent={open:function(){toggle(true);},ask:function(q){toggle(true);ask(q);}};
})();
