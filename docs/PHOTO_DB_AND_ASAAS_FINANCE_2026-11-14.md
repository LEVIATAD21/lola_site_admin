# LOLA — D1 exclusivo de fotos + pagamentos/reembolsos (14/11/2026)

## Resultado técnico
O projeto usa **dois bancos Cloudflare D1 distintos**, conectados por bindings nos projetos Pages.

| Projeto | Binding | Conteúdo |
|---|---|---|
| `lola_site` (vitrine) e `lola_site_admin` (Admin) | `DB` | Produtos, estoque, referência de existência da foto, login do Admin, eventos financeiros, status de pagamentos e reembolsos |
| `lola_site` e `lola_site_admin` | `PHOTOS_DB` | **Somente** `product_photos`: bytes WebP/JPEG/PNG, MIME e timestamps |

O **PHOTOS_DB não guarda informações de clientes, pedidos, sessões, pagamentos, comprovantes financeiros ou estoque**. O catálogo do cliente acessa o DB principal para verificar se um produto está publicado, e então acessa o PHOTOS_DB para buscar a foto. O painel grava e deleta bytes no PHOTOS_DB; no DB principal fica só a referência `catalog_photo_index`.

As duas aplicações permanecem em **projetos Pages separados**. O binding `PHOTOS_DB` deve apontar para o **mesmo** banco de fotos nos dois projetos. Não crie uma tabela de fotos dentro do `DB` atual.

## Criar o banco na conta Cloudflare (ação necessária no painel)

1. Entre em `https://dash.cloudflare.com/` → **Storage & databases** → **D1 SQL Database**.
2. Clique em **Create database** e nomeie `lola-admin-fotos`, escolhendo Free quando aplicável. **Não confunda esse banco com o D1 existente da loja**.
3. No console SQL desse banco, rode **somente** a migration `lola_site_admin/infra/d1/0001_photos_only.sql`. Ela cria a tabela vazia `product_photos`; **não insere fotos**.
4. Nos projetos Cloudflare Pages **Admin** e **Vitrine**, configure **Settings → Bindings → Add binding → D1 database** com variável **PHOTOS_DB** e selecione `lola-admin-fotos`; faça redeploy **de ambos**.
5. Preserve o binding **DB** dos dois projetos para o banco principal **da LOLA**, já aprovado, e confirme qual D1 é usado pela vitrine.

**Este chat edita o GitHub, mas não cria o D1 remoto dentro da sua conta Cloudflare**: é necessário executar esse passo numa sessão do painel autorizada.

## Banco principal: migrations em ordem e sem seeds

1. Garanta backup/Time Travel e confirme o banco correto.
2. Caso as tabelas ainda não existam, execute `lola_site/infra/cloudflare/d1-preview/migrations/0001_catalog.sql` (**products**, **inventory**).
3. Execute `lola_site_admin/infra/d1/0002_admin_photos.sql` (nome histórico, mas **somente** login, sessions e rate limit).
4. Execute `lola_site_admin/infra/d1/0003_photo_references.sql` (sem BLOB: índice de foto).
5. Execute `lola_site_admin/infra/d1/0004_finance_receipts_refunds.sql` (eventos Asaas, pagamentos e reembolsos).

**Migração de fotos antigas:** versões anteriores possuíam `product_photos` no `DB` principal. Se essa tabela já existir e contiver dados, exporte, copie e valide cada foto em `PHOTOS_DB`, confirme que os URLs respondem e só então remova a tabela antiga em procedimento supervisionado com backup. Não faça `DROP TABLE` automaticamente; não confunda um banco vazio com permissão de apagar dados de clientes.

Verificações **somente leitura**:

```sql
-- Executar no PHOTOS_DB (novo banco de fotos)
SELECT COUNT(*) AS fotos_no_banco_de_imagens FROM product_photos;

-- Executar no DB (principal)
SELECT COUNT(*) AS produtos FROM products;
SELECT COUNT(*) AS fotos_referenciadas FROM catalog_photo_index;
SELECT COUNT(*) AS eventos_financeiros FROM finance_webhook_events;
SELECT COUNT(*) AS pagamentos FROM finance_payments;
SELECT COUNT(*) AS reembolsos FROM finance_refunds;
```

## Excluir foto

- O Admin envia `DELETE /api/admin/imagens/{id}` autenticado (cookie HttpOnly + CSRF).
- O servidor apaga **`product_photos.bytes`/linha inteira** no `PHOTOS_DB` via `DELETE FROM product_photos WHERE product_id=?`.
- Depois apaga `catalog_photo_index` no `DB` e só então retorna sucesso.
- O endpoint público de imagens requer produto publicado e referência de foto. **Cache-Control: no-store** evita servir a imagem excluída de um cache normal.
- Excluir um produto com estoque zero também apaga sua foto primeiro, antes de excluir o registro do catálogo.

**Limitação física de D1:** dois bancos não compartilham transação atômica. Se uma das etapas falhar, a API retorna erro e o administrador deve repetir/reconciliar; snapshots/Time Travel podem conservar cópias temporárias de dados já excluídos da tabela ativa, conforme política e capacidade do provedor.

## Recibos de pagamento e reembolso (Asaas)

1. Configure o Asaas (Sandbox primeiro) e gere um **authToken de webhook** independente da API Key. Em **Admin Pages → Settings → Variables and Secrets (Production)**, salve `LOLA_ASAAS_WEBHOOK_TOKEN` como **Secret** com 32+ caracteres. Não exponha no GitHub ou navegador.
2. No Asaas, configure o webhook em `https://SEU-ADMIN.pages.dev/api/webhooks/asaas`. Ative os eventos necessários de cobrança, recebimento, reembolso (total e parcial), reembolso em andamento/negado e chargeback. Use o mesmo authToken.
3. O endpoint valida `asaas-access-token` e corpo JSON, filtra os eventos previstos, usa o ID do evento para idempotência e persiste no `DB` somente valores, referências sem PII e status. Os bytes e dados bancários/CPF/cartão não são importados.
4. As abas **Recibos de pagamento** e **Reembolsos** mostram **apenas eventos recebidos**. A URL de comprovante, quando o Asaas fornecê-la e pertencer a `asaas.com`, pode ser aberta pelo operador. **Se não houver URL, aparecerá “Não disponibilizado”**.
5. Um reembolso fica **concluído apenas com status `DONE`** no item `payment.refunds[]`. O painel é **consulta**, não executa devoluções nem cobranças.
6. Para produção financeira, concluir KYC da conta, sandbox, conciliação periódica usando API oficial, retenção fiscal/LGPD, procedimentos de estorno e atendimento ao titular. Sem webhook autenticado, o painel mostra **integração não configurada** e listas vazias; nunca inventa recibos.

**Importante:** o registro de webhook sozinho não substitui conciliação com a API do provedor; eventos podem chegar repetidos ou fora de ordem, e os links de comprovantes podem estar indisponíveis até o processamento terminar.

## Consultar comprovantes anteriores ao início do webhook

O Admin possui um botão **Consultar histórico no Asaas**, que faz uma consulta **GET, somente leitura**, aos **primeiros 50 pagamentos** da conta, sem salvar dados completos de clientes e sem permitir cobrança ou reembolso. Isso ajuda a localizar transações anteriores à instalação do webhook. A consulta é manual, sob login administrativo, para reduzir chamadas desnecessárias e riscos de limite de API.

Configure no **Admin Pages → Secrets** o valor `LOLA_ASAAS_API_KEY` (chave de API da conta com privilégios mínimos de leitura, nunca no navegador) e a variável de texto `LOLA_ASAAS_ENV` como **`sandbox`** para testes ou **`production`** somente com a conta real aprovada. Não confunda com o secret de webhook `LOLA_ASAAS_WEBHOOK_TOKEN`: são credenciais diferentes.

Somente URLs HTTPS originadas de `asaas.com` são mostradas como comprovantes. Pode haver cobranças sem comprovantes emitidos ou reembolsos ainda pendentes. O histórico completo, com paginação, permanece acessível no painel oficial do Asaas.

## Hospedagem e variáveis do Admin

Além dos bindings `DB` e `PHOTOS_DB`, o Admin requer os secrets `LOLA_ADMIN_USERNAME`, `LOLA_ADMIN_PASSWORD` e `LOLA_ADMIN_SESSION_SECRET`; opcionalmente `LOLA_PUBLIC_SITE_URL`. Nunca compartilhe senhas por chat.

No Admin Pages use `LEVIATAD21/lola_site_admin` branch `main`, build `npm ci && npm run build && node scripts/verify-pages-admin.mjs`, output `dist`.

O D1 Free possui limites de armazenamento e de consultas; fotos limitadas a 300KiB cada são adequadas apenas a um catálogo inicial. Se crescer, considere R2 após avaliação de custos e controle de acesso.
