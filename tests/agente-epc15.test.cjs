"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"js","agente-epc15-core.js"),"utf8");
const sandbox={};
vm.runInNewContext(source,sandbox,{filename:"agente-epc15-core.js"});
const agent=sandbox.EPC15AgentCore;
const model={
 contract:{planned:0.70,actual:0.63,variance:-0.07},
 units:[
   {code:"U-8222",rawName:"U-8222",planned:0.75,actual:0.52,variance:-0.23,
     status:{label:"Crítico"},phases:[{phase:"Civil",variance:-0.15}],
     details:[{phase:"Civil",criterion:"Montagem de estruturas",variance:-0.20,weightedVariance:-0.04}]},
   {code:"U-8224",rawName:"U-8224",planned:0.80,actual:0.82,variance:0.02,
     status:{label:"No prazo"},phases:[],details:[]}
 ],
 coordinationRows:[
   {criterion:"Consolidado (não deve ser contado)",weightedVariance:-0.5}
 ],
 dataBase:"2026-10-20"
};
const ctx={model,fileName:"teste.xlsb"};
test("não inventa indicadores sem a base carregada",()=>{
  const response=agent.answer("Resumo do contrato",{model:null});
  assert.match(response.text,/não há uma base/i);
});
test("resumo e desvio do contrato",()=>{
  const response=agent.answer("Qual o resumo do contrato?",ctx);
  assert.match(response.text,/70%/);
  assert.match(response.text,/63%/);
  assert.match(response.text,/-7 p.p./);
});
test("localiza unidade com ou sem hífen",()=>{
  assert.equal(agent.unitCode("avanço da U8222"),"U-8222");
  assert.match(agent.answer("Avanço da U-8222",ctx).text,/52%/);
});
test("unidades atrasadas excluem desvio positivo",()=>{
  const response=agent.answer("Quais unidades estão atrasadas?",ctx);
  assert.match(response.text,/U-8222/);
  assert.doesNotMatch(response.text,/U-8224/);
});
test("frentes ofensoras consultam apenas linhas-folha por AB",()=>{
  const response=agent.answer("Maiores frentes ofensoras da coluna AB",ctx);
  assert.match(response.text,/Montagem de estruturas/);
  assert.doesNotMatch(response.text,/Consolidado/);
});
test("explica Pareto separadamente da consulta de AB",()=>{
  assert.match(agent.answer("Como funciona o Pareto da coluna AB?",ctx).text,/O Pareto/);
});
test("consulta a data-base sem assumir que é a mais recente",()=>{
  assert.match(agent.answer("Qual data da última atualização da planilha?",ctx).text,/Não assumo/);
});
test("não atribui prazo sem método de projeção",()=>{
  assert.match(agent.answer("Quando vai terminar a obra?",ctx).text,/Não calculo/);
});
test("links e rotas do agente não alteram dados",()=>{
  const response=agent.answer("Abrir reunião de coordenação",ctx);
  assert.equal(response.page,"pb");
  assert.equal(response.link,undefined);
});
test("index carrega o agente depois do aplicativo",()=>{
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  assert.ok(html.indexOf("js/agente-epc15-core.js")>html.indexOf("js/app.js"));
  assert.ok(html.includes("css/agente-epc15.css"));
  assert.ok(html.includes("js/agente-epc15.js"));
});
