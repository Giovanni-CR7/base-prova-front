> Este ZIP contém o frontend. As referências a `front/` abaixo significam a raiz desta pasta após extrair. O outro projeto está no ZIP separado.

# Base genérica pronta para adaptar à prova

## Estado desta entrega

- Código preparado localmente; ainda NÃO enviado aos seus repositórios nem publicado nas suas contas.
- Front compilou com `npm run build` e passou pelo oxlint local.
- Não foi possível compilar Java neste ambiente: o acesso Maven não funcionou. O primeiro build do Actions/IntelliJ precisa confirmar compilação.
- Não foi possível executar a conferência no navegador automatizado por restrições do ambiente. Nenhum fluxo foi declarado validado em execução real.
- A aplicação mantém o modelo de Auth0/JPA/EC2 do simulado, mas usa porta 8081, container `base-prova` e tabela `base_prova_itens`, para não substituir a API original na 8080.

## O que a base implementa

Item: id, título, conteúdo, categoria, autorId (sub do JWT, definido pelo servidor), criadoEm e atualizadoEm (UTC).

| Método | Endpoint | Permissão |
|---|---|---|
| GET | /itens?busca=&categoria=&pagina=0&tamanho=8&ordem=recentes | read:itens |
| GET | /itens/{id} | read:itens |
| POST | /itens | write:itens |
| PUT | /itens/{id} | write:itens |
| DELETE | /itens/{id} | write:itens |

Ordenações: recentes, antigos, titulo. Categoria é filtro exato sem diferenciar maiúsculas. Busca procura trecho de título/conteúdo, sem diferenciar maiúsculas. Página começa em 0. DELETE retorna 204, criação 201, ID ausente 404, JSON inválido 400.

ADMIN gerencia todas as publicações. USER lê. Não há regra de edição apenas do dono; autorId já fica disponível caso o enunciado exija implementar isso depois. Não há PATCH sem implementação: para novo verbo, acrescente Controller e regra de SecurityConfig. Não foram incluídos testes automatizados no projeto, conforme a orientação da prova.

## Ordem de configuração

### 1. Auth0 — reutilizar sua API original

Applications → APIs → API cujo Identifier é https://api-avaliacoes → Permissions:

- criar read:itens;
- criar write:itens.

Manter Enable RBAC e Add Permissions in the Access Token ligados, como já estavam.

User Management → Roles:

- ADMIN: adicionar read:itens e write:itens dessa API;
- USER: adicionar só read:itens dessa API.

Não remova as permissões read:avaliacoes/write:avaliacoes do simulado que funciona.

Crie uma conta de teste USER separada ou use uma existente. Ela deve ter só leitura para itens, sem ADMIN, sem outro papel ou permissão direta write:itens. Sua conta ADMIN atual pode ser mantida. Não é necessário alterar a Action antiga de outra atividade.

O front usa a SPA original cujo Client ID é 1EErawNITNj7bN6GLUMuMkMzvWOR2tRq, Domain dev-1vbhhb524hr3h5zd.us.auth0.com e audience https://api-avaliacoes. Mantenha localhost:5173 nas três URLs da aplicação para execução local. Ao publicar, adicione a origem Vercel nova em Callback URLs, Logout URLs e Web Origins dessa MESMA SPA.

### 2. Abrir os projetos

back/pom.xml → abrir no IntelliJ como Maven, JDK 21. Lombok não é necessário nesta base.

Para iniciar localmente contra um banco LOCAL, configure as variáveis de conexão apropriadas. O default usa localhost:5432/prova_db com os defaults didáticos usuario/senha do simulado. Rodar o Java local não faz localhost apontar para a EC2. Na EC2, o workflow usa a rede host para alcançar o PostgreSQL já existente.

PowerShell dentro de back:

```powershell
.\mvnw.cmd -B clean package -Dmaven.test.skip=true
```

Não é necessário executar o backend local se for conferir a API após o deploy na EC2.

### 3. Enviar o backend ao repositório NOVO

Dentro da pasta back:

```powershell
git init
git add .
git commit -m "Base generica de publicacoes"
git branch -M main
git remote add origin https://github.com/Giovanni-CR7/simulado-avaliacoes-back.git
git push -u origin main
```

Os comandos pressupõem repositório novo vazio e ausência de origin nesse checkout. Se já tiver conteúdo remoto, confira antes; não use force push.

Settings → Secrets and variables → Actions do repositório NOVO:

- DOCKERHUB_USERNAME: seu usuário Docker Hub (givil no simulado).
- DOCKERHUB_TOKEN: seu token privado de publicação.
- HOST: 3.239.159.144.
- SSH_KEY: conteúdo completo da chave projsoft26b.pem.

São os nomes cadastrados anteriormente para os repositórios novos. Não são HOST_TEST/KEY_TEST do backend original. Confirme antes do push para o job não começar sem os secrets.

O Actions executa Maven sem testes, cria a imagem usuario/base-prova:SHA, envia ao Docker Hub e cria o container base-prova na EC2 com SERVER_PORT=8081. Reutiliza o PostgreSQL existente na 5432 e cria uma tabela própria. Não para app-avaliacoes nem remove banco/volume.

### 4. EC2 — liberar e conferir a porta nova

No PowerShell do Windows:

```powershell
ssh -i "$HOME\Downloads\projsoft26b.pem" ubuntu@3.239.159.144
```

Dentro da EC2, antes de publicar, confira se 8081 está livre:

```bash
sudo ss -ltnp | grep ':8081' || true
```

Se aparecer processo desconhecido ocupando 8081, pare a configuração e identifique-o; não encerre serviços de outra atividade.

Para liberar o acesso à API nova no UFW:

```bash
sudo ufw allow 8081/tcp
```

Depois do deploy:

```bash
sudo docker ps -a --filter name=base-prova
sudo docker logs --tail 80 base-prova
curl -i --max-time 10 http://127.0.0.1:8081/itens
```

Esperado: HTTP 401 sem token. No Windows:

```powershell
curl.exe -i --max-time 10 http://3.239.159.144:8081/itens
```

Também deve retornar 401. Se internamente funciona e de fora não, conferir UFW e eventual bloqueio externo da AWS com o professor. Liberar 8080 no simulado não libera automaticamente 8081.

### 5. Enviar o front e publicar na Vercel

Dentro de front:

```powershell
git init
git add .
git commit -m "Front generico de publicacoes"
git branch -M main
git remote add origin https://github.com/Giovanni-CR7/simulado-avaliacoes-front.git
git push -u origin main
```

Vercel → Add New → Project → importar simulado-avaliacoes-front.

Framework: Vite; raiz: ./; build: npm run build; saída: dist. Use Node compatível com a versão do Vite (Node 22 recente, como 22.12+, ou superior compatível). Aguarde Ready. O package-lock faz parte da entrega.

O arquivo vercel.json já aponta para 3.239.159.144:8081. src/config.js já aponta para /api/itens e para a aplicação Auth0 original. Não adicione Client Secret em VITE_*.

Adicione a origem de produção às três URLs da SPA original no Auth0 e salve. Se houver variáveis VITE_AUTH0_* na Vercel, elas têm prioridade sobre os defaults do config.js.

Localmente, dentro de front:

```powershell
npm ci
npm run dev
```

O Vite local também usa a API DA EC2 na 8081. Se houver outro front local usando 5173, pare-o ou configure uma origem de callback correspondente à porta que for usar.

### 6. Conferir o fluxo completo

ADMIN: listar, criar, editar, filtrar e excluir. Cancelar a confirmação de exclusão não deve apagar. Dados inválidos não devem persistir.

USER: listar, buscar, filtrar, paginar. Controles de criar/editar/excluir não aparecem. Chamada direta POST/PUT/DELETE com token USER deve receber 403.

Sem login: API responde 401. Excluir um ID inexistente como ADMIN responde 404. DELETE 204 não é interpretado como JSON no front.

O retorno de GET /itens é uma página: lista em content, número em number, total em totalElements e totalPages. Não trate o objeto inteiro como array.

## O que adaptar quando receber a prova

| Requisito novo | Arquivos principais |
|---|---|
| Campos/tipos/constraints | Item.java + ItemRequest.java + ItemResponse.java |
| Regras de criação/edição | ItemService.java |
| Novas rotas | ItemController.java |
| Filtros/buscas | ItemRepository.java + Service + Controller |
| Níveis de acesso | SecurityConfig.java + permissões/roles Auth0 |
| Tela/form/lista | front/src/App.jsx |
| Recurso/permissão no cliente | front/src/config.js |
| Porta/IP | workflow + vite.config.js + vercel.json + firewall |
| Rota de inicialização | URL curl no workflow |

Uma variável não cria nova entidade nem rota. Código novo exige novo build/imagem. O workflow recria base-prova, preservando seu nome e a configuração de execução. Para trocar variáveis de banco, atualize o ambiente do docker run de forma privada; o caminho atual usa os defaults já verificados no simulado.

Não adicione endpoints sem autorização explícita: o SecurityConfig nega as demais rotas por padrão. Se a prova pedir outro modelo de permissão, adapte a matriz, não apenas a tela.

## Retomar a configuração sem misturar atividades

Original: app-avaliacoes / 8080 / tabela avaliacoes / read:avaliacoes, write:avaliacoes.

Base nova: base-prova / 8081 / tabela base_prova_itens / read:itens, write:itens.

Ambas usam a mesma EC2, o mesmo PostgreSQL e o mesmo tenant/audience da API original. Há isolamento por tabela e container, não por servidor de banco. Cuidado com alterações globais de schema ou limpeza de volumes.
