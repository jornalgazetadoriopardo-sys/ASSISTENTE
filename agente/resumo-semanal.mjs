// Agente semanal: lê o painel, separa o que precisa de atenção e pede ao
// Claude um resumo com as mensagens de cobrança prontas para o WhatsApp.
//
// Uso:
//   node resumo-semanal.mjs                          lê o Firestore e grava o resumo lá
//   node resumo-semanal.mjs --dados exemplo.json     lê um arquivo local (teste)
//   node resumo-semanal.mjs --dados exemplo.json --sem-ia   não chama o Claude
//
// Variáveis de ambiente:
//   ANTHROPIC_API_KEY          chave da API do Claude
//   FIREBASE_SERVICE_ACCOUNT   JSON da conta de serviço do Firebase (modo Firestore)

import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const PARADA_DIAS = 3;
const FUSO = 'America/Sao_Paulo';
const ST = {
  briefing: 'Briefing', producao: 'Em produção', aguardando: 'Aguardando cliente',
  ajustes: 'Ajustes pedidos', aprovado: 'Aprovado', publicado: 'Publicado',
};

const args = process.argv.slice(2);
const arquivo = args.includes('--dados') ? args[args.indexOf('--dados') + 1] : null;
const semIA = args.includes('--sem-ia');

// ---------- Datas no fuso de Brasília ----------
function hoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date()); // AAAA-MM-DD
}
function dias(a, b) {
  return Math.round((Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 864e5);
}

// ---------- Leitura dos dados ----------
async function lerDados() {
  if (arquivo) return { ...JSON.parse(fs.readFileSync(arquivo, 'utf8')), salvar: null };

  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = getFirestore();
  const lista = async (col) => (await db.collection(col).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  return {
    clientes: await lista('clientes'),
    pecas: await lista('pecas'),
    salvar: (texto) => db.collection('relatorios').add({ texto, criadoEm: new Date().toISOString() }),
  };
}

// ---------- Regras de negócio (as mesmas do painel) ----------
// A conta é feita aqui, no código, e não pelo Claude: prazos e dias parados
// precisam estar certos. O Claude só escreve o texto.
function analisar({ clientes, pecas }) {
  const t = hoje();
  const nome = (id) => (clientes.find((c) => c.id === id) || {}).nome || 'Sem cliente';
  const abertas = pecas.filter((p) => p.status !== 'publicado' && !p.exemplo);

  const itens = abertas.map((p) => {
    const emAberto = !['aprovado', 'publicado'].includes(p.status);
    const atraso = emAberto && p.prazo ? Math.max(0, dias(t, p.prazo)) : 0;
    const parada = p.status === 'aguardando' && p.statusDesde ? dias(t, p.statusDesde) : 0;
    return {
      cliente: nome(p.cliente),
      peca: p.titulo,
      tipo: p.tipo || '',
      status: ST[p.status] || p.status,
      prazo: p.prazo || null,
      diasDeAtraso: atraso,
      diasComOCliente: parada,
      cobrar: p.status === 'aguardando' && parada >= PARADA_DIAS,
      venceEm7Dias: emAberto && p.prazo ? dias(p.prazo, t) >= 0 && dias(p.prazo, t) <= 7 : false,
      obs: p.obs || '',
    };
  });

  const semanaPassada = pecas.filter(
    (p) => p.status === 'publicado' && p.statusDesde && dias(t, p.statusDesde) <= 7 && !p.exemplo,
  ).map((p) => ({ cliente: nome(p.cliente), peca: p.titulo }));

  return { hoje: t, itens, publicadasUltimos7Dias: semanaPassada };
}

// ---------- Versão sem IA (também serve de plano B) ----------
function resumoSimples(a) {
  const linhas = [`Resumo de ${a.hoje}`];
  const sec = (titulo, lista, fmt) => {
    if (!lista.length) return;
    linhas.push('', titulo, ...lista.map(fmt));
  };
  sec('ATRASADAS', a.itens.filter((i) => i.diasDeAtraso > 0), (i) => `• ${i.cliente}: ${i.peca} (${i.diasDeAtraso} dia(s) de atraso)`);
  sec('COBRAR APROVAÇÃO', a.itens.filter((i) => i.cobrar), (i) => `• ${i.cliente}: ${i.peca} (com o cliente há ${i.diasComOCliente} dias)`);
  sec('VENCEM NOS PRÓXIMOS 7 DIAS', a.itens.filter((i) => i.venceEm7Dias), (i) => `• ${i.cliente}: ${i.peca} (prazo ${i.prazo}, ${i.status})`);
  sec('PUBLICADAS NA ÚLTIMA SEMANA', a.publicadasUltimos7Dias, (i) => `• ${i.cliente}: ${i.peca}`);
  if (linhas.length === 1) linhas.push('', 'Nada pendente. Semana tranquila.');
  return linhas.join('\n');
}

// ---------- Texto escrito pelo Claude ----------
const INSTRUCOES = `Você ajuda um profissional de marketing digital que atende vários clientes pelo WhatsApp.
Toda segunda-feira você recebe, em JSON, a situação das peças (posts, carrosséis, vídeos etc.) e escreve o resumo da semana em português do Brasil.

Escreva em texto simples, sem Markdown, nesta ordem:
1. PRIORIDADES DA SEMANA: no máximo 5 linhas, o que fazer primeiro e por quê.
2. COBRANÇAS: para cada peça com "cobrar": true, uma mensagem curta e cordial pronta para colar no WhatsApp do cliente, citando a peça pelo nome. Agrupe as peças do mesmo cliente numa só mensagem.
3. PRAZOS: o que está atrasado e o que vence nos próximos 7 dias.
4. ENTREGUES: o que foi publicado nos últimos 7 dias, por cliente.

Use só os dados recebidos. Não invente peças, datas nem números. Se uma seção estiver vazia, escreva "Nada por aqui."`;

async function resumoClaude(analise) {
  const client = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente
  const resposta = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: { effort: 'low' }, // tarefa simples: mais rápido e mais barato
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // se o modelo recusar, a API tenta outro automaticamente
    system: INSTRUCOES,
    messages: [{ role: 'user', content: JSON.stringify(analise, null, 2) }],
  });
  if (resposta.stop_reason === 'refusal') throw new Error('O Claude recusou o pedido.');
  return resposta.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

// ---------- Execução ----------
const dados = await lerDados();
const analise = analisar(dados);

let texto;
if (semIA) {
  texto = resumoSimples(analise);
} else {
  try {
    texto = await resumoClaude(analise);
  } catch (e) {
    console.error('Falha ao chamar o Claude, usando o resumo simples:', e.message);
    texto = resumoSimples(analise);
  }
}

console.log(texto);
if (dados.salvar) await dados.salvar(texto);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + texto + '\n```\n');
