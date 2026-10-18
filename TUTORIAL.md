# Tutorial: painel de atendimento de clientes com agente semanal

Este tutorial parte de uma conversa com o Claude sobre **gestão de atendimento de clientes de marketing digital**, e transforma o que foi decidido nela numa aplicação que você hospeda e controla.

O código completo está neste repositório:

| Pasta / arquivo | O que é |
|---|---|
| `app/` | O painel (HTML + JavaScript, sem build) |
| `agente/` | O agente semanal que lê o painel e escreve o resumo com o Claude |
| `.github/workflows/resumo-semanal.yml` | O agendamento: roda o agente toda segunda |
| `firestore.rules`, `firebase.json` | Banco de dados e hospedagem no Firebase |

---

## 1. O que a conversa decidiu

**Ponto de partida.** A conversa começou com um modelo de agente do Console da Anthropic que monta a retrospectiva de sprint de equipes de software. Ele tem três partes:

1. **Agendamento**: roda sozinho em dias fixos.
2. **Conectores**: lê as ferramentas onde o trabalho acontece (Linear e Slack, no caso).
3. **Documento gerado**: entrega um resumo pronto.

**A pergunta.** Dá para usar a mesma lógica no atendimento de clientes de marketing digital? Sim. Os agentes que fariam sentido:

- status semanal por cliente (entregue, aguardando aprovação, prazos);
- cobrança de aprovação de peças paradas, já com a mensagem escrita;
- relatório mensal de entregas;
- calendário do mês seguinte.

**O obstáculo.** Hoje o atendimento todo acontece no **WhatsApp**, e o agente não consegue ler o WhatsApp comum. Apareceram três caminhos:

| Caminho | Como funciona | Prós e contras |
|---|---|---|
| 1. Exportar conversas | Exportar o `.txt` de cada conversa para o Drive toda semana | Sem custo, mas depende de lembrar e é trabalhoso |
| **2. Tirar só o controle do WhatsApp** | A conversa continua no WhatsApp, mas o **status de cada peça** vai para um painel | Rápido de montar e não muda nada para o cliente |
| 3. Plataforma de WhatsApp Business API | Integra o número a um sistema que a IA consegue ler | O mais automático, mas tem mensalidade e exige migrar o número |

**A escolha foi o caminho 2**, e é ele que este tutorial constrói:

- um **painel** onde cada peça tem cliente, tipo, prazo e status, com um botão para a próxima etapa;
- um **agente agendado** que lê o painel toda segunda e entrega a lista de cobranças da semana. Na conversa, esse foi o "próximo passo natural" oferecido.

> Na conversa, o painel foi publicado como um Artifact do claude.ai, com o banco de dados embutido do próprio Artifact. Aqui ele roda **fora do claude.ai**, com Firebase, para você ter controle total, poder abrir no celular e ligar o agente agendado.

---

## 2. Arquitetura

```
 Você (celular / computador)
        │  atualiza o status com um toque
        ▼
 ┌──────────────────────┐        ┌─────────────────────────┐
 │  Painel (app/)       │◄──────►│  Firestore (Firebase)   │
 │  Firebase Hosting    │ tempo  │  clientes / pecas /     │
 │  login Google        │  real  │  relatorios             │
 └──────────────────────┘        └───────────▲─────────────┘
        │ "Cobrar aprovação"                 │ lê peças e grava resumo
        ▼                                    │
   WhatsApp (wa.me)              ┌───────────┴─────────────┐
                                 │  Agente semanal         │
                                 │  (GitHub Actions, seg.) │
                                 │  regras em código +     │
                                 │  texto escrito pelo     │
                                 │  Claude (API)           │
                                 └─────────────────────────┘
```

Três peças, e cada uma pode ser trocada sem mexer nas outras:

1. **Painel**: uma página estática. Não tem servidor próprio.
2. **Banco**: Firestore, que avisa o painel na hora quando algo muda (`onSnapshot`).
3. **Agente**: um script Node que roda uma vez por semana, agendado de graça no GitHub Actions.

---

## 3. Modelo de dados

São três coleções.

**`clientes`**
```json
{ "nome": "Savisa", "whatsapp": "55999998888", "criadoEm": "2026-10-18T10:00:00Z" }
```

**`pecas`**
```json
{
  "titulo": "Carrossel Outubro Rosa",
  "cliente": "<id do cliente>",
  "tipo": "Carrossel",
  "prazo": "2026-10-20",
  "status": "aguardando",
  "statusDesde": "2026-10-15",
  "obs": "Cliente pediu trocar a foto",
  "criadoEm": "...", "atualizadoEm": "..."
}
```

**`relatorios`** (gravada pelo agente)
```json
{ "texto": "PRIORIDADES DA SEMANA ...", "criadoEm": "2026-10-19T10:00:00Z" }
```

### O fluxo de status

O coração do sistema é este fluxo. Cada status tem um botão para a próxima etapa:

```
briefing ──► producao ──► aguardando ──► aprovado ──► publicado
 "Começar      "Enviei pra    │  ▲        "Marcar
  produção"     aprovação"    │  │         publicado"
                              ▼  │
                            ajustes
                     "Pediu ajuste" / "Reenviei"
```

No código (`app/app.js`), isso é uma tabela simples:

```js
const ACTIONS = {
  briefing:   [['producao',  'Começar produção', 'primary']],
  producao:   [['aguardando','Enviei pra aprovação', 'primary']],
  aguardando: [['aprovado','Aprovou','ok'], ['ajustes','Pediu ajuste',''], ['@cobrar','Cobrar aprovação','']],
  ajustes:    [['aguardando','Reenviei pra aprovação','primary']],
  aprovado:   [['publicado','Marcar publicado','primary']],
  publicado:  [['producao','Reabrir','ghost']]
};
```

Quer outro fluxo, com "Agendado", por exemplo? Acrescente o status em `ORDER`, `ST` (rótulo), `ICON` e `ACTIONS`.

**Por que existe o `statusDesde`.** É a data em que a peça entrou no status atual. É com ela que o sistema descobre que uma peça está **parada com o cliente há 3 dias ou mais** (`PARADA_DIAS = 3`), sem ninguém precisar anotar nada.

---

## 4. Passo 1: rodar no seu computador (5 minutos)

Sem configurar nada, o painel salva os dados no próprio navegador. É o jeito de testar antes de ligar o Firebase.

```bash
git clone <este repositório>
cd ASSISTENTE/app
python3 -m http.server 8000
```

Abra `http://localhost:8000` e:

1. em **Clientes**, cadastre um cliente (o WhatsApp é opcional, com DDD);
2. toque em **+ Nova peça**, preencha e cadastre;
3. vá avançando a peça pelos botões e veja os contadores do topo mudarem.

> Ele precisa ser aberto por um servidor (`http://`), não com dois cliques no arquivo. O painel usa módulos JavaScript (`type="module"`), e o navegador bloqueia módulos abertos como `file://`.

---

## 5. Passo 2: entender o código do painel

### 5.1 A camada de dados (`app/db.js`)

O `app.js` sempre fala com a mesma interface, parecida com a do Firestore:

```js
db.collection('pecas').add({...})
db.collection('pecas').doc(id).update({...})
db.collection('clientes').orderBy('nome').onSnapshot(cb, erro)
```

O `db.js` decide onde os dados moram:

- `FIREBASE_CONFIG = null` em `config.js`: **modo local** (localStorage);
- `FIREBASE_CONFIG` preenchido: **modo Firebase**, com login Google.

Assim o painel é o mesmo nos dois casos. Se um dia você quiser trocar o Firebase por Supabase ou por um servidor próprio, só o `db.js` muda.

### 5.2 Urgência: o que aparece primeiro

`info(p)` calcula, para cada peça:

- `late`: passou do prazo e ainda não foi aprovada;
- `dueToday`: vence hoje;
- `parada`: está com o cliente há `PARADA_DIAS` dias ou mais.

`score(p)` ordena a lista: primeiro as atrasadas (as mais atrasadas no topo), depois as paradas, depois por prazo. Os quatro contadores do topo (Atrasadas, Com o cliente, Na sua mão, Publicadas no mês) também funcionam como filtro.

### 5.3 A ponte com o WhatsApp

O painel não lê o WhatsApp. Ele **escreve para você colar lá**:

- `cobranca(p)` monta a mensagem de lembrete de aprovação ("Oi! Tudo bem? Passando pra lembrar da aprovação de...");
- `statusMsg(clienteId)` monta o resumo de tudo o que está em aberto com aquele cliente, em seções;
- `waLink(numero, texto)` cria um link `https://wa.me/55...?text=...`. Se o cliente tiver número cadastrado, aparece o botão **Abrir WhatsApp** com o texto já preenchido.

Ajuste o tom dessas mensagens ao seu jeito de falar com os clientes. São só templates em JavaScript.

---

## 6. Passo 3: colocar no ar com Firebase

### 6.1 Criar o projeto

1. Acesse <https://console.firebase.google.com> e crie um projeto. O Analytics não é necessário.
2. **Firestore Database** › Criar banco de dados › modo de produção › região `southamerica-east1` (São Paulo).
3. **Authentication** › Começar › Provedores de login › ative **Google**.
4. **Configurações do projeto** › Seus apps › ícone **Web** (`</>`) › registre o app e copie o objeto `firebaseConfig`.

### 6.2 Configurar o painel

Em `app/config.js`:

```js
export const FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  appId: "...",
};
export const EMAIL_DONO = "seu-email@gmail.com";
```

> A `apiKey` do Firebase Web **não é secreta**: ela só identifica o projeto. Quem protege os dados são as **regras** do próximo passo.

### 6.3 Proteger os dados

Em `firestore.rules`, troque `SEU_EMAIL@gmail.com` pelo seu e-mail:

```
allow read, write: if request.auth != null
  && request.auth.token.email == "seu-email@gmail.com"
  && request.auth.token.email_verified == true;
```

Só a sua conta Google lê e grava. Mesmo que alguém descubra o endereço do painel, vai ver só a tela de login.

### 6.4 Publicar

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # escolha o projeto criado
firebase deploy               # publica app/ e as regras
```

O painel fica em `https://seu-projeto.web.app`. No celular, abra o endereço e use **Adicionar à tela inicial**: o painel passa a funcionar como um app.

---

## 7. Passo 4: o agente semanal

### 7.1 A ideia principal: código calcula, Claude escreve

O agente (`agente/resumo-semanal.mjs`) trabalha em duas etapas, e essa separação é a decisão de projeto mais importante do tutorial:

1. **`analisar()`, em código comum**: calcula atrasos, dias parados, o que vence em 7 dias e o que foi publicado. São as mesmas regras do painel. Datas e números **não** ficam a cargo da IA, porque precisam estar sempre certos.
2. **`resumoClaude()`, com o Claude**: recebe esse JSON já pronto e escreve o texto: prioridades da semana, mensagens de cobrança agrupadas por cliente, prazos e entregas.

```js
const resposta = await client.beta.messages.create({
  model: 'claude-opus-5-5',
  max_tokens: 16000,
  output_config: { effort: 'low' },          // tarefa simples: mais rápido e mais barato
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default',                       // se o modelo recusar, a API tenta outro
  system: INSTRUCOES,
  messages: [{ role: 'user', content: JSON.stringify(analise, null, 2) }],
});
```

As instruções (`INSTRUCOES`) dizem ao Claude para usar **só os dados recebidos**, sem inventar peças ou datas, e para escrever em texto simples, que cola bem no WhatsApp.

**Plano B.** Se a chamada ao Claude falhar (sem chave, sem crédito, fora do ar), o agente usa `resumoSimples()`, uma lista montada só com código. Você nunca fica sem o resumo da segunda.

### 7.2 Testar sem gastar nada

```bash
cd agente
npm install
npm run teste      # usa exemplo.json e não chama o Claude
```

Saída esperada (com as datas do exemplo):

```
ATRASADAS
• Savisa: Carrossel Outubro Rosa (4 dia(s) de atraso)

COBRAR APROVAÇÃO
• Savisa: Carrossel Outubro Rosa (com o cliente há 9 dias)
• Santa Inês: Stories matrículas 2027 (com o cliente há 5 dias)
...
```

Para testar com o Claude usando os dados de exemplo:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node resumo-semanal.mjs --dados exemplo.json
```

### 7.3 Credenciais

**Chave do Claude.** Crie em <https://console.anthropic.com> › API Keys. O uso da API é **cobrado por consumo**, separado da assinatura do app Claude, como foi dito na conversa.

**Conta de serviço do Firebase.** É ela que deixa o agente ler o Firestore sem login Google.

1. Console do Firebase › Configurações do projeto › **Contas de serviço**.
2. **Gerar nova chave privada**. Isso baixa um `.json`.
3. Trate esse arquivo como uma senha: não faça commit dele. O `.gitignore` já ignora `*.local.json`, caso você o renomeie assim.

### 7.4 Agendar no GitHub Actions

No repositório do GitHub, vá em **Settings › Secrets and variables › Actions › New repository secret** e crie:

| Nome | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | a chave do Claude |
| `FIREBASE_SERVICE_ACCOUNT` | o conteúdo inteiro do `.json` da conta de serviço |

O arquivo `.github/workflows/resumo-semanal.yml` já está pronto:

```yaml
on:
  schedule:
    - cron: "0 10 * * 1"   # segunda, 10h UTC = 7h em Brasília
  workflow_dispatch: {}    # botão "Run workflow" para rodar na mão
```

Para testar na hora: aba **Actions** › *Resumo semanal de atendimento* › **Run workflow**. O resumo:

- aparece no topo do painel, na seção **Resumo da semana**;
- fica no resumo da execução no GitHub;
- é gravado na coleção `relatorios`, o histórico.

> O GitHub pode atrasar alguns minutos as execuções agendadas, e pausa o agendamento de repositórios sem nenhuma atividade por 60 dias. Se isso acontecer, é só reativar na aba Actions.

---

## 8. Quanto custa

| Item | Custo para este volume |
|---|---|
| Firebase (Hosting, Firestore, Auth) | Gratuito no plano Spark: dezenas de clientes e centenas de peças ficam muito abaixo do limite |
| GitHub Actions | Gratuito: uma execução de cerca de 1 minuto por semana |
| API do Claude | Uma chamada por semana com alguns kB de JSON. Fica em centavos por mês com `effort: 'low'` |

---

## 9. Próximos passos

Os outros agentes da conversa reaproveitam a mesma estrutura: os dados no Firestore, `analisar()` em código e o texto com o Claude.

1. **Relatório mensal de entregas**: um segundo workflow no dia 1 que filtra as peças `publicado` do mês anterior, por cliente, e gera o texto para mandar junto com a cobrança. Copie `resumo-semanal.mjs` e troque `analisar()` e `INSTRUCOES`.
2. **Calendário do mês seguinte**: mande ao Claude o histórico de peças do cliente e as datas comemorativas do mês, e peça sugestões de pauta. Guarde as aprovadas como peças com status `briefing`.
3. **Entregar o resumo no celular**: além de gravar em `relatorios`, envie para um bot do Telegram ou por e-mail. É uma chamada HTTP no fim do script.
4. **Encaixar no app de pauta**: como a conversa sugeriu, o painel pode virar uma aba do app de pauta. Basta apontar os dois para o mesmo projeto Firebase.
5. **Caminho 3 (WhatsApp Business API)**: se o volume crescer, uma plataforma oficial permite que o agente leia as conversas e marque sozinho "cliente aprovou". O painel continua servindo como fonte da verdade.

---

## 10. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Página em branco, erro de "module" no console | Você abriu o arquivo direto (`file://`). Use `python3 -m http.server` |
| "A conta ... não tem acesso" | O e-mail usado no login é diferente de `EMAIL_DONO` em `config.js` |
| "Sem acesso aos dados" depois do login | O e-mail em `firestore.rules` está errado, ou as regras não foram publicadas (`firebase deploy --only firestore:rules`) |
| Popup de login não abre | O domínio não está autorizado: Authentication › Settings › Authorized domains |
| Agente imprime "Falha ao chamar o Claude" | O secret `ANTHROPIC_API_KEY` não existe ou está sem crédito. O resumo simples foi usado no lugar |
| Agente falha em `JSON.parse` | `FIREBASE_SERVICE_ACCOUNT` não tem o conteúdo completo do `.json` |
