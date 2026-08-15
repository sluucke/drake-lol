# Viabilidade: portar o LoL Profiler Tool para dentro do Pengu Loader

Data: 2026-08-15
Status: Spike concluído **e validado empiricamente na máquina do dev**
(ver "Teste empírico no Windows"). A hipótese central da arquitetura —
que o loader de terceiro hospeda nosso plugin — está confirmada. Pronto
para virar design arquitetural formal do sub-projeto 1 (Fundação).

## Objetivo

Avaliar se dá para portar as funcionalidades do `lol-profiler-tool` (hoje um app
Tauri/Rust standalone que fala HTTP com a LCU via lockfile/porta/senha) para
rodar **injetado dentro do próprio LoL Client**, via [Pengu Loader](https://pengu.lol/),
no formato de plugin — como os projetos [Rose](https://github.com/Alban1911/Rose)
e [Sona](https://github.com/wjz-p/sona) fazem — mantendo:

- Instalador único (o que já existe hoje).
- Experiência de tray app: o usuário abre o app, ele injeta no client sozinho.
- Independência total de outros produtos do ecossistema (em especial do Rose,
  que o usuário já usa e quer continuar usando em paralelo).

## Contexto do app atual

- Stack: Tauri 2 + React (frontend) + Rust (`src-tauri/`).
- `src-tauri/src/lcu.rs`: cliente HTTP puro pra LCU (lê lockfile, Basic Auth,
  `https://127.0.0.1:<porta>`).
- `src-tauri/src/engine.rs`: dois loops em background —
  - poll de 5s: status message, rank override, auto lobby reveal.
  - poll de 500ms: Auto Accept, Insta Lock, Auto Ban.
- Features hoje: Auto Accept, Insta Lock, Auto Ban, Dodge, Rank Override,
  Status Message, Riot ID Changer, Banner Skins, Lobby Reveal (abre no
  Porofessor), Friends cleanup, Badges/Challenges.

## O que aprendemos sobre Rose e Sona

### Sona (`wjz-p/sona`)
- É **só um plugin** — `pengu.yml` (manifest) + `index.js`/`index.css` bundlados.
- Não tem loader próprio, não toca no registro do Windows, não tem instalador.
- Depende do usuário já ter o **Pengu Loader oficial** instalado separadamente
  e colocar os arquivos do Sona na pasta `plugins/` dele.
- Runtime API exposta pelo loader ao plugin: `DataStore` (persistência em JSON),
  `Toast`, `Effect` (efeitos de janela), `Pengu.version`, e hooks pra RCP
  (`rcp.preInit/postInit/whenReady`) — tudo rodando *same-origin* dentro do
  processo do client, sem precisar de lockfile/porta/senha pra falar com a LCU.

### Rose (`Alban1911/Rose`)
- **Vendoriza o código-fonte oficial do Pengu Loader** (`vendor/PenguLoader-1.1.6/`)
  e compila como parte do próprio build — não é um fork modificado do motor,
  só customizações no launcher C# (`loader/Program.cs`, `loader/Main/IFEO.cs`).
- Tem instalador próprio (Inno Setup), roda como tray, ativa o loader vendorizado
  no próprio startup.
- Os plugins do Rose (`ROSE-UI`, `ROSE-SkinMonitor`, etc.) ficam em
  `Pengu Loader/plugins/` — a convenção padrão de pasta de plugin do Pengu
  Loader oficial. Isso sugere (não confirmado empiricamente) que o `core.dll`
  do Rose carrega qualquer plugin de terceiro colocado ali, não só os `ROSE-*`.
- Existe um `pengu_rework_plan.md` de 1286 linhas no repo do Rose — um plano
  de correção porque o launcher deles dessincronizou do comportamento de
  ativação do Pengu Loader oficial atual. Sinal de que manter um fork
  hand-rolled do launcher tem custo de manutenção real.
- Rose é um **skin changer** ("zero competitive advantage" é central ao
  posicionamento legal dele) — categoria de risco de ToS diferente das nossas
  features de automação de gameplay (Auto Accept/Insta Lock/Auto Ban).

### Pengu Loader oficial (`PenguLoader/PenguLoader`)
- Licença **MIT** — pode ser vendorizado/embutido livremente.
- Reescrito em **Rust + Tauri** — mesma stack do nosso app.
- Estrutura: `core/` (módulo nativo C++/CEF, compilado em `core.dll` no
  Windows / `core.dylib` no macOS, é o que é injetado no processo do client)
  + `loader/src-tauri/` (ativação por OS: `windows/mod_ifeo.rs`,
  `macos/dylib.rs`).
- Mecanismo de ativação no Windows: escreve a chave
  `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution
  Options\LeagueClientUx.exe\Debugger` = `rundll32 "<caminho do core.dll>", #6000`.
  O Windows lê esse valor uma vez, no momento em que `LeagueClientUx.exe` é
  lançado, e roda o `rundll32` apontado em vez do processo original.
- Essa chave só guarda **um** valor por vez — é o ponto central de todo o
  resto da análise.

## Conclusão de viabilidade

**Sim, é viável.** A abordagem recomendada é vendorizar o Pengu Loader oficial
(Rust, MIT) dentro do nosso próprio `src-tauri`, em vez de manter um fork
hand-rolled como o Rose fez em C#. Isso mantém:

- Instalador único (o nosso já existente).
- Tray app cuidando de: instalar/ativar/desativar a injeção, autostart, ícone
  de bandeja.
- Features de automação migrando de Rust (`engine.rs`) para um plugin JS/CSS
  próprio, rodando dentro do client — com acesso `fetch` *same-origin* à LCU
  (sem lockfile) e eventos push via `socket.observe` em vez de polling de
  500ms.

## Concorrência com Rose (e qualquer outro loader)

### O problema
A chave IFEO só guarda um `Debugger` por vez. Se dois apps ativam
independentemente (cada um sem saber do outro), o que ativou por último
sobrescreve o valor e "ganha" a injeção — o outro para de injetar
silenciosamente, sem erro visível, até reabrir e reativar.

- Não é crash, não corrompe nada — é só uma string de registro sendo trocada.
- É uma restrição física do mecanismo do Windows, não uma falha de design
  nossa — vale pra qualquer par de loaders independentes (inclusive Rose vs.
  Pengu Loader oficial "puro", sem nenhum dos dois nossos).
- Como ambos ativam no próprio startup, na prática vira "quem foi aberto por
  último nessa sessão do Windows é quem está injetando" — se autocorrige a
  cada reabertura de qualquer um dos dois.

### Solução adotada: detecção genérica de slot ocupado (sem acoplamento ao Rose)

Antes de ativar, nosso app lê o valor atual da chave IFEO:

- **Vazio ou já aponta pro nosso `core.dll`** → ativamos/mantemos nosso loader
  vendorizado normalmente (plano principal).
- **Aponta pra qualquer outro `core.dll`** (Rose, Pengu Loader oficial, ou
  qualquer fork futuro) → não sobrescrevemos nada. Extraímos a pasta
  `plugins/` irmã daquele `core.dll` (convenção de pasta é sempre a mesma) e
  colocamos nosso plugin lá, deixando o loader estrangeiro hospedar nosso
  código sem tocar no registro.

Isso é decoupling de verdade: o código nunca referencia "Rose" especificamente,
só reage ao estado do registro. O plugin em si (as features) é idêntico nos
dois casos — só muda onde o tray app decide colocá-lo e se ele precisa ativar
o próprio loader ou não.

### Riscos/pontos em aberto desse desenho

1. ~~**Hipótese não confirmada empiricamente**: o `core.dll` do Rose de fato
   carrega pasta de plugin de terceiro colocada em `plugins/`?~~
   **RESOLVIDO em 2026-08-15 — carrega.** Ver seção de teste empírico abaixo.
2. **Momento da checagem** — *melhor delimitado pelo teste*. O que importa
   não é "quem está ativo agora", e sim **quem estava ativo no instante em
   que `LeagueClientUx.exe` foi lançado**, porque é aí que o Windows lê a
   chave e é aí que o core enumera `plugins/` (uma única vez). Observado:
   com o Rose fechado a chave IFEO **não existe** — some, não fica vazia.
   Então o estado é ternário: ausente / nosso / de terceiro.
3. **Handoff dinâmico**: se o Rose estava ativo e o usuário fecha ele no
   meio da sessão, nosso app precisa perceber que o slot ficou livre e
   assumir sozinho (senão nosso plugin fica sem loader até o Rose reabrir).
   E se o Rose reabrir depois, precisamos ceder o slot de volta sem brigar.
   Mitigação disponível e barata: `POST /riotclient/kill-and-restart-ux`
   (retorna 204) recarrega só a UI do client e força nova enumeração, sem
   deslogar. Serve pra aplicar um plugin recém-colocado sem pedir pro
   usuário reiniciar o jogo.
4. **Compatibilidade de versão** — *reduzido*. A premissa de que o Rose
   estava pinado no 1.1.6 estava errada: o runtime reporta
   `Pengu.version = 2.0.0`, com `Toast`, `DataStore` e `Effect` presentes.
   Manter as checagens `typeof X !== 'undefined'` como higiene (o Rose pode
   voltar a pinar uma versão antiga sem avisar), mas isso não restringe mais
   o design.
5. **Elevação**: a chave IFEO fica em `HKLM`, exige processo elevado para
   ativar — diferente do NSIS atual (`installMode: currentUser`). Vira um
   prompt de admin, uma vez, no primeiro uso da ativação.
6. **Manutenção do `core` nativo**: não escrevemos o C++/CEF do zero, mas
   passamos a depender de acompanhar releases do Pengu Loader quando a Riot
   atualiza o client/Chromium interno — esse é o maior custo recorrente.
7. **ToS**: injetar no processo do client é superfície maior que só falar
   HTTP com a LCU (o que o app já faz hoje). Para Auto Ban/Insta
   Lock/Auto Accept o risco de detecção não muda muito (já são automações
   hoje); a injeção em si é o que sobe de categoria.
8. **NOVO — o Rose gerencia ativamente a própria pasta `plugins/`.** Os
   plugins dele têm arquivos `.git` e o `core.log` mostra a contagem de
   diretórios oscilando entre 11 e 12 ao longo dos dias (13/08: 12 → 11 →
   12; 14/08: 11). Ou seja, o Rose adiciona e remove pastas ali sozinho,
   via updater. Se ele fizer um sync destrutivo, nosso plugin hospedado é
   apagado silenciosamente. Isso não invalida a arquitetura, mas significa
   que no modo "hóspede" o tray app precisa **verificar a presença do
   próprio plugin a cada ciclo** e reinstalá-lo, em vez de copiar uma vez e
   assumir que ficou. Não testado: o que acontece com nosso plugin durante
   um update real do Rose.

## Teste empírico no Windows — EXECUTADO EM 2026-08-15: hipótese CONFIRMADA

O plugin de teste descartável (`plugins/ZZ-TesteViabilidade/index.js`, só
`index.js`, sem manifest) foi carregado pelo `core.dll` que o Rose vendoriza.
Evidências coletadas:

**Ambiente observado**
- Rose instalado em `%LOCALAPPDATA%\Rose`, loader em
  `%LOCALAPPDATA%\Rose\Pengu Loader\` (`core.dll` + `plugins/`).
- `Rose\config.ini` aponta `loaderpath` pra essa pasta; `disabled = 0`.
- Chave IFEO com Rose ativo, valor exato:
  `rundll32 "C:\Users\<user>\AppData\Local\Rose\Pengu Loader\core.dll", #6000`
  — confirma o formato que nossa detecção de slot precisa parsear.
- Com o Rose fechado, a chave **não existe** (não fica com valor vazio).

**Prova 1 — o core carrega plugin de terceiro (`Rose\core.log`)**
```
[13:00:35] [Assets] Found 0 files and 12 directories in plugins folder
   (antes do nosso plugin existir)
[13:39:41] [Assets] Found 0 files and 13 directories in plugins folder
[13:39:42] [Assets] Asset request: https://plugins/ZZ-TesteViabilidade/index.js
```
A enumeração é genérica — conta diretórios e serve
`https://plugins/<pasta>/index.js` em ordem alfabética, **sem filtro por
prefixo `ROSE-`**. Nenhuma whitelist de plugins existe em `config.ini` nem
no arquivo `Pengu Loader\config`.

**Prova 2 — a API do loader está inteira disponível ao plugin de terceiro**
```
[ZZ-TesteViabilidade] index.js avaliado. Pengu.version = 2.0.0
[ZZ-TesteViabilidade] APIs visiveis: {"Toast":"object","DataStore":"object",
                                      "Effect":"object","Pengu":"object",
                                      "fetch":"function"}
Pengu  Loaded plugin "ZZ-TesteViabilidade\index.js".
```
`Toast.success(...)` executou. `DataStore` e `Effect` também estão presentes.
E o próprio core loga explicitamente que carregou o plugin — não é inferência
nossa a partir do `Asset request`.

**Correção importante ao spike original: o Rose não está no 1.1.6.**
O runtime reporta `Pengu.version = 2.0.0`. A leitura anterior veio do nome da
pasta `vendor/PenguLoader-1.1.6/` no repo do Rose, que está desatualizado em
relação ao que é distribuído. Consequência: o risco #4 (rodar dentro de um
core antigo com API reduzida) é bem menor do que o estimado. A defesa em
runtime (`typeof Effect !== 'undefined'`) continua valendo como higiene
barata, mas não é mais um constrangimento de design.

**Prova 3 — `fetch` same-origin na LCU funciona (a premissa do porte)**
```
[ZZ-TesteViabilidade] LCU same-origin OK: {"locale":"pt_BR","region":"BR",...}
```
`fetch('/riotclient/region-locale')` sem lockfile, porta ou senha.

**Detalhes de convenção descobertos (corrigem o plano original)**
- Os 12 plugins do Rose **não têm `pengu.yml`** — é só
  `plugins/<Nome>/index.js`. O manifest do plano abaixo é convenção do
  Sona / Pengu mais novo, não requisito desse core. Nosso plugin deve
  funcionar sem manifest pra ser portável entre cores de versões diferentes.
- Desabilitar um plugin é renomear pra `index.js_` (o Rose faz isso com
  `ROSE-Jade`) — mecanismo simples e útil pro nosso toggle de ativação.
- A enumeração acontece **uma vez, quando a UX do client sobe**. Plugin
  adicionado com o client já aberto só carrega após
  `POST /riotclient/kill-and-restart-ux` (204) ou restart do client.

**Consequência para a arquitetura**
A "Solução adotada" (hospedar nosso plugin no loader estrangeiro quando o
slot IFEO está ocupado) é viável como está. O risco #1 sai da lista.

---

### Plano original do teste (mantido como registro)

Antes de desenhar a arquitetura formalmente, validar a hipótese central
(item 1 acima) com um teste barato:

1. Ter o Rose instalado e ativado normalmente no Windows.
2. Localizar a pasta `plugins/` usada pela instalação ativa do Rose (deve
   ficar ao lado do `core.dll` que o Rose vendoriza — dentro da pasta
   `Pengu Loader/` do install dele).
3. Criar um plugin mínimo de teste:
   - `pengu.yml`:
     ```yaml
     id: teste-viabilidade
     name: Teste Viabilidade
     description: Plugin de teste para validar carregamento de terceiros no Rose
     version: 0.0.1
     ```
   - `index.js`:
     ```js
     Toast.success("Plugin de terceiro carregou dentro do Rose!")
     ```
4. Colocar essa pasta dentro do `plugins/` identificado no passo 2.
5. Abrir o League of Legends com o Rose ativo e observar se o toast aparece.
6. Registrar o resultado (funcionou / não funcionou / funcionou parcialmente)
   — isso decide se a "Solução adotada" acima é viável como está ou precisa
   de ajuste (ex: sempre vendorizar nosso próprio loader e aceitar a janela
   de "quem ativou por último", sem tentar hospedar dentro do Rose).

## Ideias de features novas (fora do escopo deste spike, sub-projetos futuros)

Levantadas durante a conversa, ainda sem design — cada uma deve virar um
spec próprio depois que a Fundação (loader + porte do motor atual) estiver
fechada:

- **Análise de lobby in-client**: substituir o atual "abre no Porofessor"
  (via navegador externo) por um painel dentro do próprio client.
- **Builds recomendadas**: mostrar como os melhores jogadores do rank
  (OP.GG / League of Graphs) constroem o campeão selecionado — envolve
  dependência de dados de terceiros (scraping/API não documentada), com
  risco próprio de ToS e de quebrar quando o site muda de layout. Sona já
  tem uma feature parecida ("OP.GG Recommendation Panel"), então há
  precedente de viabilidade técnica.
- **Idioma seguindo o client**: detectar o idioma configurado no client
  (a LCU já expõe `/riotclient/region-locale`, que o app hoje usa em
  `get_region()`) e adaptar a UI — baixo risco, pequeno, pode entrar dentro
  da Fundação em vez de virar sub-projeto separado.

## Sub-projetos identificados (ordem sugerida)

1. **Fundação** — arquitetura do loader vendorizado + detecção de slot
   ocupado + porte do motor atual (Auto Accept, Insta Lock, Auto Ban, Dodge,
   Rank Override, Status Message, Riot ID, Banner, Lobby Reveal, Friends,
   Badges) para plugin JS. Pré-requisito de tudo abaixo.
2. **Análise in-client de lobby/oponentes.**
3. **Builds recomendadas** com dados de OP.GG/League of Graphs.

Idioma seguindo o client entra dentro do item 1.
