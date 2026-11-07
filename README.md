# LOLA — Painel Administrativo

Painel administrativo independente da loja LOLA Aço Inox & Acessórios. O navegador conversa somente com o BFF deste repositório; o BFF encaminha operações permitidas ao Data Server privado do repositório `LEVIATAD21/lola_site`.

## Estado desta branch

- Login de operador único por variáveis de ambiente, sessão HttpOnly/SameSite e CSRF nas mutações.
- Catálogo real carregado pelo endpoint administrativo do Data Server.
- Criação, edição, exclusão protegida e ajuste de estoque passam pelo BFF.
- O painel não usa mais seed/localStorage para catálogo operacional.
- As seções de pedidos, clientes, relatórios, configurações e notificações ainda não estão conectadas.
- A edição de imagem aceita URL; upload binário seguro e persistente ainda não está implementado.

**Não declarar produção pronta:** sessão em memória, operador único sem MFA/RBAC e armazenamento de catálogo/estoque em arquivo single-process ainda limitam a operação.

## Requisitos

- Node.js 22.12 ou superior.
- Data Server do repositório LOLA SITE acessível a partir do BFF.
- IP privado de saída do BFF incluído em `LOLA_ADMIN_ALLOWED_IPS` no Data Server.
- `LOLA_ADMIN_API_KEY` igual nos ambientes servidor do Admin e do Data Server; nunca no Vite/browser.
- Em hosts separados, HTTPS entre BFF e Data Server.

## Configuração local

1. Instale dependências:

```bash
npm install
```

2. Copie `.env.example` para `.env` e substitua todos os placeholders. Gere segredos aleatórios:

```bash
openssl rand -hex 32
```

Use valores diferentes para `LOLA_ADMIN_SESSION_SECRET` e para `LOLA_ADMIN_API_KEY`. A chave administrativa deve ser compartilhada apenas entre os dois processos de servidor.

3. Inicie o Data Server do LOLA SITE em outro terminal, com `LOLA_ADMIN_API_KEY` e `LOLA_ADMIN_ALLOWED_IPS` configuradas.

4. Inicie o BFF:

```bash
npm run dev:api
```

5. Inicie a interface:

```bash
npm run dev
```

O Vite encaminha `/api` para `127.0.0.1:4101`. O BFF escuta em loopback por padrão.

## Endpoints BFF

- `GET /api/health` — saúde do BFF.
- `POST /api/login` — autenticação do operador.
- `GET /api/session` — sessão atual e token CSRF.
- `POST /api/logout` — encerra a sessão (exige CSRF).
- `GET /api/admin/catalog` — lista catálogo e disponibilidade.
- `POST /api/admin/catalog` — cria produto.
- `PUT /api/admin/catalog/:id` — atualiza dados do produto.
- `DELETE /api/admin/catalog/:id` — remove somente quando as regras de integridade do Site permitem.
- `POST /api/estoque/definir` — define saldo absoluto (inteiro não negativo).

O BFF injeta `x-admin-key` no servidor; o navegador nunca recebe essa chave. Mutações exigem sessão e CSRF. O proxy restringe métodos/caminhos, limita corpo/resposta, aplica timeout e não segue redirects.

## Variáveis de ambiente do BFF

Consulte `.env.example`. Em produção:
- `NODE_ENV=production`
- `LOLA_ADMIN_COOKIE_SECURE=true`
- `LOLA_ADMIN_BEHIND_HTTPS_PROXY=true` quando o bind público estiver atrás de proxy TLS.
- `LOLA_DATA_SERVICE_URL` deve usar `https://` quando o Data Server estiver em host remoto.
- Nunca definir qualquer segredo com prefixo `VITE_`.

## Proxy HTTPS de produção

Há um exemplo de Nginx em `deploy/nginx.conf.example`. Ele serve `dist/`, encaminha somente `/api/` ao BFF em loopback, aplica TLS, CSP, HSTS, proteção contra framing e `X-Robots-Tag`. Revise domínio, certificados, diretório de build e versão do Nginx antes de usar. O exemplo não configura firewall nem a allowlist do Data Server.

## Limitações e próximos bloqueios

- Sessões em memória: reiniciar o BFF invalida sessões; não há store compartilhado para múltiplas instâncias.
- Operador único: sem MFA, RBAC, convites, gestão de usuários ou revogação individual.
- Upload binário: ainda não há pipeline de validação MIME real, decodificação, storage e remoção de órfãos.
- Produtos não possuem fluxo completo de publicação/arquivamento; exclusão é recusada quando há saldo, venda, reserva ou hold.
- Pedidos, clientes, relatórios, configurações e notificações ainda precisam de endpoints e telas integrados.
- O Data Server e o armazenamento em arquivo do Site são single-process; não declarar consistência multi-instância nem escalar horizontalmente sem banco transacional.
- Configurar proxy HTTPS público do painel, firewall e allowlist privada; não publicar diretamente o Data Server.

## Testes

```bash
npm test
npm run lint
npm run build
```

O CI da branch executa os testes HTTP de segurança, validação TypeScript e build. Sempre consultar a execução mais recente do GitHub antes de declarar uma alteração validada.
