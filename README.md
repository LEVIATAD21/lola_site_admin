# LOLA — Painel Administrativo

Aplicação administrativa independente para LOLA Aço Inox & Acessórios.

## Estado atual

O frontend ainda contém dados de demonstração e a integração completa de catálogo CRUD não está concluída. O BFF inicial foi adicionado nesta branch para estabelecer uma fronteira servidor-servidor: credenciais administrativas ficam no processo Node e não no bundle React/Vite.

**Não considerar este painel pronto para produção.** A interface ainda precisa trocar o fluxo demonstrativo por chamadas reais da API, e o Data Server do Site ainda precisa disponibilizar CRUD persistente do catálogo.

## Requisitos

- Node.js 22.12 ou superior.
- Data Server do repositório LOLA SITE acessível pelo BFF.
- IP de saída do BFF incluído em `LOLA_ADMIN_ALLOWED_IPS` no Data Server.
- `LOLA_ADMIN_API_KEY` configurada somente no ambiente do BFF e do Data Server.

## Configuração local

1. Instale dependências:

```bash
npm install
```

2. Copie `.env.example` para `.env` e preencha os valores. Gere `LOLA_ADMIN_SESSION_SECRET` com:

```bash
openssl rand -hex 32
```

3. Inicie o BFF:

```bash
npm run dev:api
```

4. Em outro terminal, inicie a interface:

```bash
npm run dev
```

O Vite encaminha `/api` para o BFF em `127.0.0.1:4101`. O BFF, por padrão, escuta somente em loopback.

## Endpoints BFF presentes nesta etapa

- `GET /api/health` — saúde do BFF.
- `POST /api/login` — autenticação do operador via variáveis de ambiente.
- `GET /api/session` — estado da sessão e token CSRF.
- `POST /api/logout` — encerra sessão (exige CSRF).
- Proxy autenticado para as rotas administrativas existentes no Site: consulta de pré-pedidos/titular, rastreamento e ajuste de estoque.

A sessão é mantida em memória neste primeiro incremento: reiniciar o processo invalida as sessões. É um BFF inicial para ambiente controlado, ainda sem MFA, gestão multiusuário/roles, persistência de sessão ou integração de todas as telas.

## Limitações explícitas / próximos bloqueios

- O Data Server ainda não oferece CRUD de catálogo; as rotas atuais não permitem criar/editar/publicar produtos.
- O frontend ainda não foi migrado do seed/localStorage para o BFF.
- Upload persistente, pedidos completos, clientes, relatórios e auditoria visual ainda não estão integrados.
- O BFF usa um operador configurado por ambiente; antes de produção, implementar gestão de identidade, MFA, rotação de sessão e armazenamento apropriado.
- A allowlist do Data Server deve aceitar somente o endereço privado do BFF; nunca abrir a API administrativa à internet.
- Em produção, usar HTTPS entre BFF e Data Server quando estiverem em hosts diferentes, proxy HTTPS na entrada e cookie Secure.

## Segurança

- Não coloque credenciais, tokens, chaves administrativas ou segredos em variáveis `VITE_*`.
- Não commite `.env`; somente `.env.example` sem valores reais.
- O BFF rejeita configuração incompleta, restringe caminhos upstream, não segue redirects, usa timeout, limita payload/resposta, sessão HttpOnly/SameSite e validação CSRF nas mutações.
- O processo e as sessões são single-instance nesta primeira versão. Não escalar horizontalmente sem store compartilhado e estratégia de sessão adequada.

## Validar

```bash
npm run lint
npm run build
```

Os comandos precisam ser executados em ambiente com dependências instaladas; a existência do código não comprova que os testes passaram.
