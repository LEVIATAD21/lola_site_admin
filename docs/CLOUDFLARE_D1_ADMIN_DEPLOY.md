# LOLA Admin — Cloudflare Pages / D1, sem dados fictícios

**Objetivo:** administrar os produtos exibidos na vitrine real usando somente o banco D1 compartilhado. Não criar produtos de exemplo. A primeira publicação contém **0 produtos e 0 unidades** se as tabelas estiverem vazias.

## Arquitetura

- Vitrine pública: `LEVIATAD21/lola_site`, Cloudflare Pages; lê apenas produtos publicados via `GET /api/catalog`.
- Painel Admin: `LEVIATAD21/lola_site_admin`, projeto **Cloudflare Pages separado**, domínio `*.pages.dev` próprio; operações autenticadas exclusivamente em Pages Functions.
- **Ambos** os projetos devem apontar o binding D1 **DB** para o **mesmo banco da LOLA** (não crie um DB diferente para Admin). O navegador nunca recebe credenciais D1.
- Fotos de produtos **até 300 KiB, após compactação WebP no navegador**, ficam em tabela `product_photos` no próprio D1; os bytes são servidos na vitrine pela rota `/api/imagens/:id` apenas se o produto estiver publicado. Não usa R2 ou pagamento por armazenamento separado.
- Esta primeira integração só oferece: autenticação administrativa, catálogo, fotos, preço, descrição, estado de publicação, quantidade e exclusão protegida. **Pedidos, pagamento, clientes, frete e relatórios financeiros não foram habilitados.**

## Passo 1 — conferir banco

Pelo painel **Cloudflare → Storage & databases → D1**, selecione o banco efetivo da vitrine LOLA. **Não elimine dados existentes sem confirmação.** Antes de aplicar migrations:
1. Verifique que é o banco da LOLA e faça backup/exportação.
2. Aplique, uma única vez, `lola_site/infra/cloudflare/d1-preview/migrations/0001_catalog.sql` se as tabelas `products` e `inventory` ainda não existirem.
3. Aplique `lola_site/infra/cloudflare/d1-preview/migrations/0002_admin_photos.sql` para habilitar sessões administrativas, proteção de login e fotos reais.
4. Confirme com estas consultas **somente leitura**:

```sql
SELECT COUNT(*) AS produtos FROM products;
SELECT COUNT(*) AS linhas_estoque FROM inventory;
SELECT COALESCE(SUM(quantity_on_hand),0) AS unidades FROM inventory;
SELECT COUNT(*) AS fotos FROM product_photos;
```

Para iniciar com catálogo completamente vazio, os quatro resultados devem ser **0**. Se houver registros existentes, pare e valide sua origem antes de remover qualquer coisa.

## Passo 2 — publicar o painel independente

Cloudflare → Workers & Pages → Create application → **Continue para o Pages** → Connect to Git → selecione **`LEVIATAD21/lola_site_admin`**.

| Campo | Valor |
| --- | --- |
| Name | `lola-admin` (ou um nome disponível) |
| Production branch | `main` |
| Root | `/` |
| Build command | `npm ci && npm run build && node scripts/verify-pages-admin.mjs` |
| Output directory | `dist` |
| Plan | Free, sem upgrades |

**Importante:** este painel já tem APIs em `functions/`. Não selecione o fluxo Workers `npx wrangler deploy` para uma aplicação Pages.

## Passo 3 — permissões e segredos do Admin

No projeto **Admin → Settings → Bindings**, crie:
- **D1 binding**: variable `DB` → selecione o mesmo banco real do catálogo da vitrine.

Em **Settings → Variables and Secrets**, configure **Production**:

| Nome | Tipo | Valor |
| --- | --- | --- |
| `LOLA_ADMIN_USERNAME` | Secret | Usuário proprietário escolhido, ao menos 3 caracteres |
| `LOLA_ADMIN_PASSWORD` | Secret | Senha longa, exclusiva e aleatória de 20+ caracteres |
| `LOLA_ADMIN_SESSION_SECRET` | Secret | Segredo aleatório de 32+ caracteres, diferente da senha |
| `LOLA_PUBLIC_SITE_URL` | Texto | URL HTTPS definitiva atual da vitrine, por exemplo `https://lola-site-9ng.pages.dev` |

**Nunca publique a senha nem segredos no repositório, no chat, em `VITE_*` ou nos prints.** Gere o segredo com `openssl rand -hex 32` no seu dispositivo. Este MVP possui **login de operador único com senha e rate limit persistido no D1, sem MFA**. Recomenda-se Cloudflare Access com MFA (quando disponível ao domínio/conta) antes de operação comercial sensível.

Defina os segredos no ambiente Production, salve e **redeploy** o Admin, porque novos bindings e secrets não valem em deploys antigos.

## Passo 4 — conectar fotos na vitrine

No projeto Pages da **vitrine**, mantenha o binding **DB** apontando para o mesmo D1 e atualize o deploy com a versão do repositório `lola_site` que contém `functions/api/imagens/[id].js` e o campo `image` em `/api/catalog`.

Teste:
- GET `/api/health`: esperado `status=ok, database=ready`.
- GET `/api/catalog`: esperado `products: []` antes de cadastrar produtos.
- Acesso anônimo ao Admin `/api/admin/catalog` deve ser **401**.
- Login da proprietária deve abrir o painel; novo produto começa em **Rascunho**.
- Foto pequena, preço e estoque: salvar e atualizar; publicar: produto aparece na vitrine. O público não pode editar.
- Voltar para **Rascunho**: produto e foto deixam de aparecer na vitrine.
- Excluir: só com estoque zerado.
- Fotos de produtos são comprimidas no navegador e armazenadas no banco; tamanho máximo **300 KiB** após compressão.

## Segurança e limites

- Nunca hospedar Admin como site estático sem Functions ativas; a UI só funciona após login.
- Sessão armazenada no D1 com cookie Secure, HttpOnly e SameSite=Strict; mutações exigem token CSRF e mesma origem.
- Tentativas de senha limitadas com contador por IP convertido em hash; dados administrativos não são públicos.
- Fotos permitidas somente WebP/JPEG/PNG, com validação de assinaturas binárias; sem SVG nem HTML.
- O D1 **não é storage ideal para catálogos grandes**; migre fotos para R2 quando houver volume suficiente e orçamento acordado. O MVP evita uma nova assinatura ou cobrança por objeto.
- Migrar com backup e testar restauração; estruturar atendimento aos titulares da LGPD e identificação da empresa antes de ativar cadastros de clientes.
- Não há garantia de uptime absoluto e cada serviço Free tem limites.

## O que NÃO está feito automaticamente

Os arquivos e APIs podem ser implantados pelo GitHub, mas **este chat não tem permissão de escrita no painel Cloudflare** para associar DB, executar migration ou configurar os segredos. Não considerar o Admin público até testar o login e cadastrar a primeira peça com foto e preço reais.
