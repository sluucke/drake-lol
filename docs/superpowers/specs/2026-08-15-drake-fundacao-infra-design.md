# Drake — Fundação, parte 1: infraestrutura de injeção

Data: 2026-08-15
Status: design aprovado em conversa, aguardando revisão escrita.
Escopo: spec 1 de 2 da Fundação. A parte 2 (porte das 10 features restantes)
tem spec próprio e depende do contrato definido aqui.

## Contexto

O Drake é a sucessora do `lol-status-updater` (LoL Profiler Tool), que hoje é
um app Tauri standalone falando HTTP com a LCU via lockfile. O Drake roda
**dentro** do client, como plugin do Pengu Loader, com um tray app mínimo
cuidando da injeção.

A viabilidade foi validada empiricamente em 2026-08-15 (ver
`pengu-loader-viability.md` na raiz). Os fatos que este design assume, todos
medidos e não inferidos:

- O `core.dll` do Pengu Loader carrega qualquer pasta em `plugins/`, sem
  filtro por prefixo, servindo `https://plugins/<pasta>/index.js`.
- Um plugin é só `plugins/<Nome>/index.js`. Manifest (`pengu.yml`) é opcional.
- `fetch` same-origin na LCU funciona sem lockfile, porta ou senha.
- `Toast`, `DataStore`, `Effect` e `Pengu` estão disponíveis (`Pengu.version`
  2.0.0 no core que o Rose distribui).
- A chave IFEO guarda `rundll32 "<caminho do core.dll>", #6000`, e **some**
  quando nenhum loader está ativo — não fica com valor vazio.
- A enumeração de `plugins/` acontece uma única vez, quando a UX do client
  sobe. `POST /riotclient/kill-and-restart-ux` (204) força nova enumeração
  sem deslogar o usuário.
- O loader que hospeda pode apagar pastas de `plugins/` por conta própria (o
  Rose faz isso via updater).

## Decisões tomadas

1. **Sem janela.** Só bandeja. Toda configuração de feature acontece dentro do
   client, na UIKit real. Isso descarta do porte todo o CSS, fontes e SFX do
   app antigo, que existiam apenas para imitar o client.
2. **O tray é a fonte da verdade das configurações**, persistidas em
   `%PROGRAMDATA%\Drake\state\settings.json`, em pasta própria do Drake — de modo
   que sobrevivem à troca de loader hospedeiro. O `config.json` que o tray
   escreve junto do plugin é simultaneamente o canal de leitura e o cache:
   como fica em disco, o plugin continua operando com a última configuração
   conhecida mesmo se o tray estiver fechado.
3. **Nunca sobrescrevemos slot ocupado.** Slot livre → assumimos; slot de
   terceiro → viramos hóspede na pasta `plugins/` dele.
4. **Automático, mas visível.** Nenhuma decisão é silenciosa: a bandeja sempre
   informa o modo atual e o motivo de qualquer falha.
5. **Invariante por polling, não reação a eventos.** Detalhado abaixo.

### Por que polling e não eventos

O único instante que importa é o lançamento do `LeagueClientUx.exe`: é aí que
o Windows lê a chave IFEO e o core enumera `plugins/`. Reagir ao lançamento
chega tarde — o sistema precisa já estar correto antes dele. Isso torna o
problema um de **manutenção de invariante**, não de reação a evento, e um
loop idempotente de 2 s é a expressão mais simples e mais testável disso.
Como bônus, ele absorve de graça o cenário do loader hospedeiro apagar nosso
plugin: a próxima iteração recoloca.

A alternativa considerada e rejeitada foi reagir via
`RegNotifyChangeKeyValue` + watcher de diretório + evento WMI de criação de
processo. Três mecanismos nativos, cada um com seu modo de falhar em
silêncio, comprando uma precisão que não muda decisão nenhuma.

## Componentes

Mecanismo puro, sem política:

- **`slot`** — a única unidade que conhece a chave IFEO. Lê o valor, extrai o
  caminho do `core.dll` de dentro de `rundll32 "<path>", #6000`, e classifica
  em `Ausente | Nosso | Terceiro { path }`. Escreve o valor (única operação
  que exige privilégio). Fica atrás de um trait de acesso ao registro, para
  ser testável sem tocar no registro real.
- **`deploy`** — dado o caminho de um loader qualquer, garante que
  `<loader>/plugins/Drake/index.js` existe e corresponde ao bundle, comparando o
  conteúdo diretamente. Não conhece registro nem política.

  *Nota de implementação (2026-08-15):* esta seção dizia antes "comparando hash,
  recalculado apenas quando o mtime mudou". Isso foi descartado na implementação,
  deliberadamente. `ensure_plugin` é uma função sem estado; guardar hash ou mtime
  entre chamadas exigiria estado escondido só para evitar reler alguns KB a cada
  2 segundos — complexidade real em troca de um ganho não mensurável. Comparar
  conteúdo é também estritamente mais correto que comparar hash, por não ter
  superfície de colisão.

Política e superfície:

- **`supervisor`** — o loop de 2 s e o único lugar com política. Seu miolo é
  uma função pura `estado → ação`, testável exaustivamente sem tocar no
  sistema. Publica o modo atual.
- **`configd`** — serve as configurações ao plugin e as persiste em
  `%PROGRAMDATA%\Drake\state\settings.json`. Recebe o check-in do plugin.
- **`tray`** — ícone, menu e texto de estado. Só consome o que o `supervisor`
  publica; não decide nada.
- **`plugin`** — o `index.js` injetado. Neste spec é deliberadamente magro:
  faz check-in, lê config e implementa **Auto Accept** como fatia vertical
  para provar o contrato ponta a ponta.

Artefato embutido:

- **loader vendorizado** — Pengu Loader oficial (Rust, MIT), instalado em
  `%PROGRAMDATA%\Drake\loader\` com `core.dll` e `plugins/` irmãos, seguindo
  a mesma convenção que o Rose usa.

  Quem coloca o `core.dll` ali é o **instalador**, elevado, a partir do
  recurso embutido — nunca o tray. O motivo é de segurança e define o layout
  de permissões da árvore inteira: o `core.dll` é apontado por um valor
  `HKLM` de máquina e executa dentro da sessão de *qualquer* usuário que
  abrir o League, inclusive a de um administrador. Se um usuário padrão
  pudesse escrevê-lo, o usuário A trocaria o DLL e ele rodaria como o usuário
  B. Portanto:

  | caminho | ACL |
  |---|---|
  | `Drake\` | padrão (admin escreve, usuário lê) |
  | `Drake\loader\core.dll` | padrão — só admin escreve |
  | `Drake\loader\plugins\` | `Users:(OI)(CI)M` — o tray sem privilégio escreve o nosso plugin aqui |
  | `Drake\state\` | `Users:(OI)(CI)M` — `settings.json` mora aqui |

  O tray, ao subir, apenas **compara** o `core.dll` instalado com o recurso
  embutido; divergência ou ausência viram `Inativo { motivo }` pedindo
  reinstalação, nunca uma tentativa de escrita que ele não pode fazer.

A fronteira que importa: se o mecanismo de injeção do Windows ou do client
mudar, o estrago fica contido em `slot` e `deploy`.

## Máquina de estados

| Slot lido | Ação | Modo publicado |
|---|---|---|
| `Ausente` | dispara a tarefa elevada para assumir o slot, depois deploy no nosso loader | `LoaderPróprio` |
| `Nosso` | deploy no nosso loader (idempotente) | `LoaderPróprio` |
| `Terceiro { path }` | **não escreve no registro**; deploy em `<pasta do core.dll>/plugins/` | `Hóspede { host }` |

Qualquer passo que falhe — sem privilégio, pasta do host não gravável, valor
de registro em formato inesperado — produz `Inativo { motivo }`, e o motivo é
literalmente o texto exibido na bandeja.

O nome do host em `Hóspede { host }` é derivado do caminho (o nome da pasta
que contém o `core.dll`), nunca de uma lista de produtos conhecidos. O código
não referencia "Rose" em lugar nenhum.

Transições esperadas, ambas já observadas na máquina de teste:

- Loader de terceiro é ativado no meio da sessão: `Nosso` → `Terceiro`.
  Cedemos sem brigar e passamos a hóspede. Nosso plugin fica órfão na nossa
  pasta `plugins/`, inofensivo.
- Loader de terceiro é fechado: a chave some, estado vira `Ausente`,
  reassumimos.

### Estado desejado versus estado efetivo

Mexer no slot não afeta um client já aberto: a chave só é lida no lançamento e
`plugins/` é enumerado uma única vez. O `supervisor` mantém as duas noções
separadas:

- **desejado** — o que ele acabou de garantir no registro e no disco;
- **efetivo** — o que de fato está rodando dentro do client agora.

O efetivo não é adivinhado: o plugin faz **check-in** no `configd` ao
carregar, informando quem o hospedou. Se o `LeagueClientUx` está no ar e
nenhum check-in chegou dentro de uma janela de tolerância, o efetivo é "não
injetado", e a bandeja oferece *recarregar o client para aplicar*, que executa
`POST /riotclient/kill-and-restart-ux`.

O check-in é **repetido**, não único: um *heartbeat* de 5 s, começando com uma
chamada imediata no carregamento. Isso não é detalhe de implementação — é o
que torna a janela de tolerância coerente. Com um único check-in no
carregamento, qualquer janela de tolerância finita expira em uma sessão
perfeitamente saudável, e a bandeja passa a oferecer *recarregar o client*
para sempre, para um problema que não existe. O intervalo (5 s) fica
confortavelmente dentro da tolerância (20 s, `configd::CHECKIN_TOLERANCE`), de
modo que várias batidas podem se perder sem falso negativo. Um check-in que
falha ou lança nunca interrompe as batidas seguintes: o tray reiniciando no
meio da sessão rejeita o token antigo, e desistir ali deixaria a bandeja cega
pelo resto da sessão.

O supervisor **nunca** reinicia o client por conta própria. É sempre ação
explícita do usuário.

## Elevação

O tray roda **sem privilégio**. Quem escreve em `HKLM` é uma tarefa agendada
criada na instalação, com privilégio máximo, que o tray apenas dispara. O
usuário vê o prompt de UAC uma única vez, na instalação.

**A tarefa não aceita parâmetro algum.** Sua ação é fixa: escrever o slot
apontando para o `core.dll` no caminho de instalação do Drake. Se ela
aceitasse o valor como argumento, qualquer processo sem privilégio na máquina
poderia disparar a tarefa e fazer o Windows executar um comando arbitrário
elevado no próximo lançamento do client — uma escalada de privilégio clássica,
criada por acidente. Com a ação fixa, o pior que um atacante local consegue é
reativar o Drake.

O desinstalador remove a tarefa agendada e limpa a chave IFEO **apenas se ela
ainda apontar para o nosso `core.dll`** — se outro loader assumiu o slot no
meio tempo, não tocamos nele.

## Contrato tray ↔ plugin

O plugin roda em uma página `https://` dentro do client. Isso cria uma
restrição real no transporte, então o contrato é definido em duas direções
com garantias diferentes.

**Leitura (tray → plugin): via arquivo, sem rede.** O `configd` escreve
`<loader>/plugins/Drake/config.json` junto do `index.js`, e o plugin lê com
`fetch('/config.json?t=<timestamp>')` relativo ao próprio plugin, servido pelo
esquema `https://plugins/` que o core já registra. Esse caminho não tem
incógnita: é o mesmo mecanismo que serve o `index.js`, comprovado no teste de
viabilidade. O cache-buster evita que o CEF sirva versão velha.

**Escrita (plugin → tray): `TRANSPORT = localhost`, medido em 2026-08-15.**
`fetch('http://127.0.0.1:<porta>/checkin')` a partir da página `https://` do
client **funciona**. O Chromium trata `127.0.0.1` como origem potencialmente
confiável, então não conta como mixed content, e isso se confirma no CEF 108
embutido no client.

A evidência é do lado do servidor, não do console do plugin — o listener
descartável registrou o request chegando de dentro do client, o que descarta a
possibilidade de um `fetch` que apenas não lançou exceção:

```
probe listening on 48151
HIT POST /checkin {"host":"probe"}
```

O servidor precisa mandar `Access-Control-Allow-Origin`, já que a página do
client é outra origem. Sem isso o CORS bloqueia.

O fallback via `DataStore` continua implementado atrás da mesma interface, como
seguro contra uma mudança futura de política do Chromium. O round-trip
`set`/`get` do `DataStore` não foi exercitado nesta medição — só a presença da
API foi confirmada, no spike de viabilidade.

O transporte fica atrás de uma interface no plugin, para que a escolha entre
os dois não vaze para a lógica das features.

**Autenticação.** O `configd` escuta apenas em `127.0.0.1` e exige um token
compartilhado, gerado a cada início do tray e escrito no `config.json`.

O modelo de ameaça aqui é explícito e limitado: o token existe para impedir
que uma página qualquer aberta no navegador do usuário converse com o
`configd`. Ele **não** protege contra outros plugins convivendo no mesmo
loader, que conseguem ler `https://plugins/Drake/config.json` como qualquer
outro asset. Isso é aceito, e não é uma fraqueza real: um plugin co-residente
já executa no mesmo contexto que o nosso, com acesso total à LCU — não há
fronteira de segurança a defender ali.

## Tratamento de erro

Nenhum erro é fatal e nenhum é silencioso. Toda falha vira um
`Inativo { motivo }` legível na bandeja, e o loop continua tentando — o
próximo tick reavalia do zero. Isso é possível justamente porque o loop é
idempotente: não há estado parcial para desfazer.

Casos explicitamente cobertos:

- Loader hospedeiro apaga nosso plugin → próximo tick recoloca.
- Loader hospedeiro em caminho não gravável → `Inativo`, com o caminho no
  motivo.
- Tarefa agendada ausente ou falhando → `Inativo { sem privilégio }`, com ação
  na bandeja para reinstalá-la.
- Valor de registro em formato desconhecido → tratado como `Terceiro` com host
  desconhecido; nunca sobrescrevemos algo que não entendemos.
- Client fechado → estado efetivo indefinido, sem erro.

## Testes

- **`supervisor`**: a função `estado → ação` é pura e cobre a tabela inteira
  com testes de unidade, incluindo as transições de handoff. É onde mora o
  risco de lógica, e é 100% testável sem tocar no sistema.
- **`slot`**: testado contra um fake do trait de registro, incluindo o parse
  do valor `rundll32` com aspas, espaços no caminho e formatos inesperados.
- **`deploy`**: testado em diretórios temporários — plugin ausente, presente e
  correto, presente e desatualizado, pasta somente leitura.
- **`configd`**: testes do contrato, com o token e a rejeição sem token.
- **Verificação manual na máquina real**, com roteiro escrito, para o que não
  dá para simular: assumir slot livre, virar hóspede com outro loader ativo,
  handoff nos dois sentidos, e o plugin carregando de fato dentro do client.

## O que vem do repositório antigo

Copiado deliberadamente, arquivo a arquivo — o repositório antigo **não** é
clonado, porque apagar arquivo em git não apaga do histórico, e o
`lol-status-updater` carrega 38 MB de histórico incluindo uma versão Python
abandonada e todo o material visual que este projeto não usa.

- Dados: `bannerSkins.ts`, `champions.ts`, `champion_skins.json`.
- Shell Tauri, como base a ser reduzida: `tray.rs`, `autostart.rs`,
  `settings.rs`, `league_path.rs`, configuração do NSIS.
- `engine.rs` e `lcu.rs` como **referência** de endpoints e semântica das
  features — vão ser reescritos em JS, não portados linha a linha.

Não vem: `App.css`, fontes, SFX, componentes de janela, telas React, e todo o
diretório `legacy/`.

## Fora de escopo deste spec

- Porte das 10 features restantes (spec 2 da Fundação).
- Análise de lobby in-client e builds recomendadas (sub-projetos 2 e 3).
- Suporte a macOS. O mecanismo de ativação é diferente (`dylib` em vez de
  IFEO) e não há nada aqui que dependa de resolvê-lo agora.

## Riscos aceitos

- **Manutenção do core nativo.** Passamos a depender de acompanhar releases do
  Pengu Loader quando a Riot atualizar o Chromium interno do client. É o maior
  custo recorrente do projeto e não tem mitigação boa além de vigiar.
- **ToS.** Injetar no processo do client é superfície maior que falar HTTP com
  a LCU. Para as automações que o app já faz hoje o risco de detecção não muda
  materialmente; a injeção em si é o que sobe de categoria. Decisão consciente.
- **Transporte de escrita não validado.** Mitigado por ser a primeira tarefa do
  plano e por ter fallback conhecido.

### Residuais adiados na revisão final (não corrigidos de propósito)

- **Reinstalar pela opção "desinstalar antes de instalar" apaga
  `state\settings.json`.** O uninstaller remove `%PROGRAMDATA%\Drake` inteiro. A
  reinstalação normal, no lugar, preserva. É uma escolha visível do usuário na
  página de reinstalação, então vira item de checklist (G.6) em vez de código.
- **Plugin órfão fora do dono atual do slot.** O uninstall limpa só o loader
  apontado pelo `Debugger` no momento. Se o Drake rodou como convidado no loader
  X, X soltou o slot depois, e só então o Drake foi desinstalado,
  `X\plugins\Drake\` fica para trás. Rastrear todo loader onde já fomos hóspede
  exigiria estado persistente que não existe hoje; o dano é um `index.js` inerte
  que falha check-in.
- **Log repetido de check-in rejeitado.** Com o heartbeat de 5s, um token velho
  loga a cada batida em vez de uma vez. Desistir cegaria a bandeja, então o
  barulho no devtools é o preço certo.
- **`install_error` calculado uma vez no `setup`.** O tooltip "reinstale o Drake"
  persiste pela vida do processo mesmo depois de uma reinstalação com o Drake
  aberto. Mesma classe do erro de bind, que já retenta; unificar os dois é
  trabalho de uma tarefa futura.
- **Desinstalar deixa a entrada `Run` do HKCU para trás.** O desinstalador roda
  elevado e não alcança de forma confiável o `HKCU` do usuário que instalou,
  muito menos o dos outros. A entrada aponta para um exe que não existe mais e
  o Windows a ignora em silêncio, então o dano é lixo, não falha. Consertar
  direito exigiria uma etapa de desinstalação por usuário.
- **Reiniciar o client durante o campeão select.** O `auto_reload_on_open`
  dispara assim que a janela de carência passa, sem olhar em que tela o
  usuário está. Decisão consciente do usuário depois de eu levantar o risco:
  mantém a lógica simples e previsível.
- **`Rejected` do `restart_ux` só sai por `eprintln!`.** O binário de release é
  `windows_subsystem = "windows"`, então ninguém lê. A falha ainda aparece
  indiretamente: o item de reload continua habilitado no tick seguinte.
