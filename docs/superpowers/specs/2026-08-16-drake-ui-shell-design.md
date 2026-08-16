# Drake — UI in-client (shell + Auto Accept)

Segundo spec do Drake. O primeiro
([fundação/infra](2026-08-15-drake-fundacao-infra-design.md)) entrega injeção,
bandeja e o plugin que faz check-in. Este entrega a interface que o usuário
abre com `Ctrl+D` dentro do próprio client, mais uma feature real ligada de
ponta a ponta para provar o caminho inteiro.

## Contexto

O `lol-profiler-tool` tinha 15 telas e ~13 features. Portar tudo junto com a
construção do shell seria vários specs em um. A decomposição acordada:

1. **Este spec — shell + Auto Accept.** Carrega todo o risco técnico.
2. Features de fila: dodge, lobby reveal, insta lock, auto ban.
3. Features de perfil: status, rank, banner, badges, Riot ID, friends.

Depois que o shell existe, 2 e 3 viram trabalho repetitivo.

O problema novo que o app antigo nunca teve: ele era uma janela Tauri dona do
próprio DOM. Este renderiza *dentro* de um app React que a Riot controla e que
se repinta sozinho.

## Medições (probe descartável, client real)

Tudo abaixo foi medido, não presumido. O probe foi removido depois.

| Fato | Consequência no design |
|---|---|
| `document.body` é **null** quando `index.js` roda | Montagem tem que esperar `load`. Matou a v1 do probe. |
| `Ctrl+D` chega em captura, `defaultPrevented: false`, `target: BODY` | O atalho é nosso; ninguém no client disputa. |
| Host sobrevive aos repaints do React (15s+) | Overlay é viável. Era o maior risco. |
| Assets carregam por `https://plugins/<Plugin>/...` | Podíamos servir arquivos; ver decisão sobre fontes. |
| Fontes carregadas no client: **só `Shentox`** | Beaufort/Spiegel da Riot não estão disponíveis para nós. |
| CommunityDragon responde **200** | Arte de campeão é viável — mas não neste spec. |
| **Não há `<meta>` CSP** na página | `data:` URIs e estilos inline são livres. |
| Um `getComputedStyle` vazio num host com id duplicado no `<body>` | O nó pode ser trocado/duplicado embaixo de nós; ver Guardas. |

A última linha não foi isolada até a causa raiz. O design usa o superconjunto
que sobrevive às duas explicações possíveis (o client troca o `<body>`, ou o
script é avaliado mais de uma vez), porque o custo de cobrir ambas é pequeno e
o custo de errar é uma UI que não aparece.

## Decisões tomadas

1. **Shadow DOM, host no `documentElement`.** Não no `<body>`: é justamente o
   nó que o client troca. Shadow DOM é a única coisa que impede o CSS global da
   Riot de restilizar a nossa UI e o nosso de vazar no client deles.
2. **Bandeja continua a fonte da verdade.** A UI não escreve `settings.json`
   direto; ela fala com a bandeja. Mantém a decisão do spec 1 intacta.
3. **Fontes embutidas como `data:` URI no bundle.** Não como arquivos soltos.
   Ver "Assets" — preserva a invariante de arquivo único, que é load-bearing.
4. **Sem arte de campeão / CommunityDragon neste spec.** Confirmado que
   funciona; nada no v1 precisa. Entra com as features de fila.
5. **`Ctrl+D` é ignorado quando o foco está em campo de texto.** Nunca engolir
   tecla enquanto o usuário digita no chat do client.

## Componentes

```
plugin/src/
  ui/
    mount.js        cria o host, shadow root, guardas de reattach
    hotkey.js       matcher puro de atalho + regra de campo de texto
    styles.js       tokens, @font-face, CSS do shell (string)
    panel.js        shell: header, nav, corpo, footer
    components/
      toggle.js     switch on/off
    screens/
      autoAccept.js a única tela do v1
  settingsClient.js POST /settings para a bandeja
```

### `mount.js`

Uma função, `mountUI({ document, onToggle })`, com três guardas — cada uma
vinda de uma medição, não de precaução genérica:

- **Idempotência.** Sentinela `window.__drakeUI`. Se o script for avaliado duas
  vezes, a segunda não monta um segundo host nem registra um segundo listener.
- **Montagem adiada.** `document.body` é null na avaliação; espera `load`.
- **Reattach.** `MutationObserver` no `documentElement`; se o host sumir, ele é
  reanexado. O client é dono do DOM e não nos deve permanência.

O host: `position:fixed; inset:0; z-index:2147483647; pointer-events:none`. O
painel dentro dele reativa `pointer-events:auto`, para nunca comermos clique
destinado ao client quando estamos fechados.

### `hotkey.js`

`matchesToggle(event)` puro: `ctrlKey && key === 'd'` e o alvo **não** é
`input`, `textarea` nem `contenteditable`. Separado do listener para ser testado
sem DOM. Registrado em fase de **captura** com `preventDefault()`.

`Escape` fecha o painel quando aberto.

### Fluxo de dados

A mudança arquitetural real. Hoje settings andam num sentido só: bandeja
escreve `config.json`, plugin lê. A UI precisa escrever.

```
toggle na UI → POST /settings {token, settings} → configd
             → ConfigdState atualizado + settings.json salvo
             → checkboxes da bandeja acompanham
             → próximo tick reescreve config.json
```

Reusa o transporte que já existe: mesma porta, mesmo token, mesmo CORS medido
no spec 1. Sem porta nova e sem fronteira de confiança nova.

**De onde a UI lê o estado inicial:** do `config.json` que o plugin já carrega
no boot (`loadConfig`), não de um GET novo. O tick reescreve esse arquivo a
cada 2s, então ele é sempre a visão atual da bandeja, e não precisamos de um
segundo caminho de leitura. A UI mantém a cópia em memória e a atualiza
otimisticamente ao salvar.

**Token velho (401):** só acontece se a bandeja reiniciou (token é gerado por
processo). A UI recarrega `config.json`, pega o token novo e tenta uma vez
mais; se falhar de novo, mostra erro. Sem laço de retry.

**Endpoint novo (`configd.rs`):**

```rust
POST /settings
body: { token: String, settings: Settings }
200 -> aplicado e persistido
401 -> token errado
```

Mesma checagem de token do `/checkin`. Falha de escrita em disco retorna 500 e
**não** aplica em memória, para a UI nunca mostrar um estado que não sobreviveu.

## Assets

Duas faces, ambas OFL, herdadas do app antigo com o `ATTRIBUTION.md` junto:
Cinzel (display) e Marcellus SC (botões). São substitutas livres da "Beaufort
for LOL", que é proprietária da Riot.

Essa escolha pesa mais aqui do que pesava no app antigo: agora renderizamos
*dentro* do client da Riot, onde embutir a fonte proprietária deles seria um
problema mais claro do que numa janela separada. E o probe mostrou que nem dá
para pegar emprestado — só `Shentox` está carregada.

**Embutidas como `data:` URI** dentro do CSS do bundle, não como arquivos no
plugin. O motivo é a invariante de arquivo único: `deploy::ensure_plugin`
compara conteúdo, o uninstall remove a pasta, e em modo convidado tudo isso
acontece *dentro do diretório de um terceiro*. Mais arquivos = mais coisa para
errar no produto de outra pessoa. ~92KB de fonte viram ~123KB em base64, lidos
uma vez do disco local. Não há CSP, então `data:` é livre.

## Tratamento de erro

- **Falha ao montar** (sem `document.body`, host rejeitado): loga e desiste em
  silêncio. Nunca quebra o client; o Auto Accept do spec 1 não depende da UI.
- **`POST /settings` falha**: o toggle volta ao estado anterior e mostra o erro
  no painel. Nunca fingir que salvou.
- **Bandeja fechada**: detectada pelo `POST` falhando na conexão (não por um
  ping separado). O painel abre normalmente, os toggles ficam desabilitados e
  o rodapé diz que a bandeja não está rodando — em vez de toggles que se mexem
  e não salvam nada. `config.json` continua legível do disco, então a UI ainda
  mostra os valores corretos, só não deixa mudar.

## Testes

**vitest (lógica pura, sem client):**
- `matchesToggle`: dispara com Ctrl+D; não dispara em `input`/`textarea`/
  `contenteditable`; não dispara sem Ctrl.
- `mountUI` contra jsdom: monta uma vez só quando chamado duas vezes; reanexa
  quando o host é removido; não monta antes de `body` existir.
- `settingsClient`: manda token; trata 401; trata rede caída sem lançar.

**Rust:**
- `POST /settings` com token certo aplica e persiste; com token errado devolve
  401 e **não** altera nada; falha de disco devolve 500 sem aplicar em memória.

**Manual (`docs/manual-verification.md`, seção nova):** o painel realmente
pinta; `Ctrl+D` abre e fecha; `Escape` fecha; digitar "d" com Ctrl no chat do
client não abre o painel; marcar Auto Accept na UI marca junto na bandeja; e o
painel continua funcionando depois de navegar entre telas do client (é o que
exercita o reattach).

## Fora de escopo deste spec

- As outras ~12 features do app antigo.
- Arte de campeão / CommunityDragon.
- Configuração do próprio atalho (`Ctrl+D` é fixo).
- Qualquer coisa dentro do jogo — isto é só o client.

## Riscos aceitos

- **A causa raiz do host duplicado não foi isolada.** Mitigado pelo
  superconjunto de guardas, não explicado. Se a UI sumir em campo, é aqui que
  se olha primeiro.
- **`Ctrl+D` pode colidir com um atalho futuro da Riot.** É fixo neste spec;
  tornar configurável é trabalho de um spec posterior.
- **Peso do bundle.** ~123KB de fonte em base64 num arquivo que hoje tem 4KB.
  Aceito: é leitura local, uma vez, e o custo alternativo é mexer no deploy.
