# Plano completo de implementação — LOLA Admin

**Repositório:** `LEVIATAD21/lola_site_admin`  
**Branch:** `feat/admin-integracao-producao`  
**Dependência principal:** API administrativa autenticada no repositório `lola_site`.

> O painel atual é uma demonstração local. Este plano define o que deve ser implementado e testado. Não considerar nenhum endpoint listado como existente até ser implementado e validado no backend.

## 1. Diagnóstico atual
- React 19 + TypeScript + Vite.
- `src/App.tsx` concentra navegação, estado, seed e operações locais.
- Produtos iniciais são dados fictícios; `localStorage` persiste alterações somente no navegador.
- Imagens são convertidas para data URL e guardadas localmente.
- CRUD, exclusão, lote, estoque e CSV não chegam ao servidor.
- Pedidos, clientes, relatórios e configurações são placeholders.
- Não há cliente HTTP, login, sessão, MFA, RBAC, CSRF, auditoria remota ou testes automatizados identificados no manifesto.
- Scripts disponíveis: `dev`, `build`, `lint`; adicionar testes e CI próprios.

## 2. Regra de arquitetura
1. O painel é frontend não confiável, mesmo hospedado em domínio separado.
2. A API da loja é a autoridade para autenticação, permissões, validação, dados e auditoria.
3. Browser usa sessão humana por cookie HttpOnly/Secure/SameSite; nunca recebe HMAC, chave AES, API key interna ou segredo.
4. O HMAC continua apenas entre servidores.
5. O painel não conecta diretamente ao banco nem ao servidor de dados privado.
6. Toda ação só mostra sucesso após resposta confirmada do backend.
7. Cache em memória pode melhorar UX, mas não é persistência nem autoridade.

## 3. Sequência de construção

### Fase A — Fundação
- [ ] Criar estrutura `src/api`, `src/auth`, `src/features`, `src/components`, `src/hooks`, `src/lib`, `src/types` e `src/test`.
- [ ] Definir configuração pública `VITE_API_BASE_URL` sem qualquer segredo.
- [ ] Criar cliente HTTP com timeout, credentials include, JSON/multipart, correlation ID e tratamento padronizado de erro.
- [ ] Definir schemas TypeScript e validação runtime (ex.: Zod, se aprovado como dependência).
- [ ] Criar estados globais de sessão, loading, erro e permissões.
- [ ] Adicionar Error Boundary, página 401/403/404/500 e fallback offline.
- [ ] Configurar lint, testes, build e CI; fixar Node e lockfile.

### Fase B — Autenticação e segurança
- [ ] Tela de login com validação e feedback genérico para não enumerar usuários.
- [ ] `GET /auth/session` ao iniciar; nunca inferir sessão por estado local.
- [ ] MFA obrigatório para perfis administrativos.
- [ ] Fluxos de recuperação/troca de senha seguros.
- [ ] Logout remoto e limpeza do estado em 401/expiração.
- [ ] Renovação de sessão controlada pelo backend; não criar JWT em localStorage.
- [ ] Proteção CSRF em mutações; enviar token conforme contrato do backend.
- [ ] Validar origem e CORS estrito; credenciais apenas para origem autorizada.
- [ ] Guards de interface por permissão, lembrando que backend também deve bloquear.
- [ ] Não colocar tokens/segredos em logs, URLs, analytics ou armazenamento persistente do browser.
- [ ] MFA, sessão expirada, revogada, CSRF e usuário sem permissão com testes.

### Fase C — Produtos e mídia
- [ ] Substituir seed como fonte de dados por `GET /products` paginado.
- [ ] Listagem com busca, filtros, ordenação, paginação e estado vazio.
- [ ] Formulário completo: nome, slug, descrição, SKU, categoria, preço, preço promocional, material, cor, variações, status, destaque, SEO e alt text.
- [ ] Validação client-side para UX e server-side como autoridade.
- [ ] Criar/editar/arquivar/publicar com confirmação e tratamento de conflito.
- [ ] Exibir histórico de alteração de preço/publicação se API fornecer.
- [ ] Upload multipart com progresso, preview temporária e URL persistida retornada pelo backend.
- [ ] Não salvar base64/data URL no localStorage.
- [ ] Validar limite e tipo antes de enviar; backend revalida conteúdo real.
- [ ] Operações em lote com prévia, confirmação, resultado por item e rollback/atomicidade definidos.
- [ ] Exportação CSV com escaping e autorização.

### Fase D — Estoque
- [ ] Mostrar estoque conforme permissão: disponível/reservado/total ou valores mascarados.
- [ ] Movimentações com tipo, quantidade, motivo, operador e timestamp.
- [ ] Ajuste exige justificativa; nunca permitir valor inválido ou negativo.
- [ ] Reservas e vendas são estados do backend, não edição direta no frontend.
- [ ] Alertas de mínimo/zerado e filtros.
- [ ] Ações concorrentes atualizam/revalidam dados e tratam 409 Conflict.
- [ ] Não permitir que edição de produto altere estoque implicitamente sem endpoint/motivo.

### Fase E — Pedidos
- [ ] Listar com paginação e filtros por data, status e identificador.
- [ ] Detalhe com snapshot de itens/preços, totais, entrega e timeline.
- [ ] Dados pessoais mascarados por padrão e revelados somente com permissão/necessidade.
- [ ] Ações de status com transições permitidas pelo backend.
- [ ] Exibir status financeiro separado do logístico.
- [ ] Não criar botão para marcar pago manualmente sem fluxo de reconciliação autorizado.
- [ ] Cancelamento, reembolso e devolução com confirmação, motivo e auditoria.
- [ ] Não permitir acesso a pedido por ID sem autorização server-side.
- [ ] Impressão/etiqueta somente após autorização e com dados mínimos.

### Fase F — Clientes
- [ ] Listar apenas dados necessários, com busca e paginação limitadas.
- [ ] Mascarar telefone/endereço por padrão.
- [ ] Detalhe de cliente apenas com permissão explícita.
- [ ] Histórico de pedidos com minimização e proteção contra enumeração.
- [ ] Exportação de dados separada, auditada e com justificativa.
- [ ] Ações LGPD: encaminhar solicitação; não apagar dados sujeitos a retenção legal sem política.
- [ ] Não permitir pesquisa indiscriminada por telefone sem permissão.

### Fase G — Dashboard e relatórios
- [ ] Definir métricas e fórmulas com backend: faturamento bruto/líquido, pedidos, ticket médio, cancelamentos, produtos e estoque.
- [ ] Intervalo de datas, timezone, moeda e instante de atualização visíveis.
- [ ] Agregação no servidor; não baixar toda a PII para calcular gráfico.
- [ ] Distinguir pedido criado, pago, enviado e concluído.
- [ ] Exportação de relatório autorizada e auditada.
- [ ] Estados de ausência de dados e falha de API sem números fictícios.

### Fase H — Configurações e usuários
- [ ] Dados públicos da loja, contatos, horários e políticas.
- [ ] Configuração de frete/tabela somente se suportada pela API.
- [ ] Configuração de promoções/cupom com vigência, limite, elegibilidade e regras no servidor.
- [ ] Gestão de operadores, papéis, permissões, convite, suspensão e revogação.
- [ ] MFA e sessões ativas por operador.
- [ ] Configurações sensíveis nunca exibem segredos completos após gravação.
- [ ] Alterações críticas exigem reautenticação/MFA e confirmação.

### Fase I — UX, acessibilidade e confiabilidade
- [ ] Preservar identidade visual atual LOLA; não redesenhar sem necessidade.
- [ ] Responsividade real para celular/tablet/desktop.
- [ ] Teclado, foco visível, labels, aria, contraste e leitor de tela.
- [ ] Loading skeleton, empty state, retry e erro acionável.
- [ ] Desabilitar botão durante envio e prevenir duplo submit.
- [ ] Em falha, preservar formulário e indicar que nada foi salvo.
- [ ] Confirmar operações destrutivas; não usar alertas ambíguos.
- [ ] Não mostrar toast de sucesso antes de 2xx e validação da resposta.
- [ ] Tratar 401, 403, 409, 422, 429 e 5xx de forma distinta.
- [ ] Paginação e filtros persistem na navegação sem expor PII em URL.
- [ ] Nunca mostrar dados seed em ambiente de produção.

## 4. Contrato mínimo esperado da API

Prefixo sugerido: `/api/admin/v1`. A implementação do backend deve publicar OpenAPI/contratos e testes.

| Método | Endpoint | Permissão | Observação |
|---|---|---|---|
| POST | `/auth/login` | pública com rate limit | inicia autenticação/MFA |
| POST | `/auth/mfa/verify` | pré-sessão | completa MFA |
| GET | `/auth/session` | sessão | usuário e permissões não sensíveis |
| POST | `/auth/logout` | sessão | revoga sessão |
| POST | `/auth/password/change` | sessão + reauth | troca segura |
| GET | `/products` | catalog:read | paginação |
| POST | `/products` | catalog:write | criar |
| GET | `/products/:id` | catalog:read | detalhe |
| PATCH | `/products/:id` | catalog:write | atualização allowlist |
| POST | `/products/:id/publish` | catalog:publish | transição |
| POST | `/products/:id/archive` | catalog:write | arquivar |
| POST | `/products/:id/images` | catalog:write | multipart |
| GET | `/inventory` | inventory:read | saldos autorizados |
| GET | `/inventory/:id/movements` | inventory:read | histórico |
| POST | `/inventory/:id/adjustments` | inventory:adjust | motivo obrigatório |
| GET | `/orders` | orders:read | dados minimizados |
| GET | `/orders/:id` | orders:read | autorização por recurso |
| POST | `/orders/:id/transitions` | orders:update | máquina de estados |
| GET | `/customers` | customers:read | mascarado/paginado |
| GET | `/customers/:id` | customers:read | mínimo necessário |
| GET | `/reports/summary` | reports:read | agregados |
| GET | `/reports/sales` | reports:read | agregados |
| GET | `/audit-log` | audit:read | somente leitura |
| GET/POST/PATCH | `/settings` | settings:read/write | sem revelar segredos |
| GET/POST/PATCH | `/users` | users:manage | RBAC e MFA |

O browser não deve chamar rotas `/internal/*`, nem usar `x-admin-key` ou segredo HMAC.

## 5. Matriz de telas x permissões
- Visão geral: `reports:read`; cards só com dados autorizados.
- Produtos: `catalog:read`; criar/editar requer `catalog:write`; publicar requer `catalog:publish`.
- Estoque: `inventory:read`; ajuste requer `inventory:adjust`.
- Pedidos: `orders:read`; transição requer `orders:update`.
- Clientes: `customers:read`; exportação exige permissão específica adicional.
- Relatórios: `reports:read`; exportação auditada.
- Configurações: `settings:read/write`; usuários exigem `users:manage`.
- Auditoria: `audit:read`; registros imutáveis para operadores comuns.

## 6. Testes obrigatórios do painel
- [ ] Sem sessão: redireciona/login; API responde 401.
- [ ] Sessão expirada/revogada: limpa estado e bloqueia mutações.
- [ ] Sem permissão: tela/ação indisponível e API 403.
- [ ] CSRF inválido/origin incorreta: mutação rejeitada.
- [ ] Usuário A não acessa pedido/cliente de B alterando ID.
- [ ] Campos extras como role, price, stock, paymentStatus e permissions são ignorados/rejeitados pelo backend.
- [ ] Produto inválido, SKU duplicado, preço negativo e conflito de edição.
- [ ] Upload executável, MIME falso, arquivo grande e imagem corrompida.
- [ ] Duplo clique e retry não duplicam operação.
- [ ] Falha de rede mantém formulário e não exibe sucesso.
- [ ] CSV protege contra formula injection.
- [ ] Dados seed não aparecem em build de produção.
- [ ] Testes de acessibilidade, viewport mobile e teclado.
- [ ] Build reproduzível e CI bloqueia regressão.

## 7. Critérios de aceite
1. Alterar preço no painel e ver o mesmo preço na vitrine e no cálculo do checkout do servidor.
2. Alteração persiste após logout, novo navegador e reinício do backend.
3. Upload persiste após restart e URL não depende do navegador local.
4. Cliente comum e operador sem permissão não acessam operações administrativas.
5. Cada ação crítica gera auditoria com operador, ação, recurso, horário e resultado.
6. Nenhum segredo interno aparece no bundle, source map público, storage, request ou log.
7. Estoque e pedidos permanecem consistentes sob concorrência e restart.
8. Painel mostra status real e não inventa pedidos, clientes, vendas ou métricas.
9. Todos os testes de contrato, integração, segurança e E2E passam.

## 8. Bloqueios externos
- URL/domínio final da API e origem autorizada do painel.
- Certificados/DNS e configuração do provedor.
- Primeiro usuário administrador criado por procedimento seguro fora de endpoint público de signup.
- Escolha de PSP e logística não pertence ao frontend; depende do responsável e do backend.
- Nenhuma credencial, assinatura ou contratação paga deve ser solicitada ou embutida no código.

## 9. Definition of Done
Uma funcionalidade só está concluída quando: contrato definido; autorização backend aplicada; frontend integrado; estados de erro/loading tratados; testes unitários/integração/E2E relevantes aprovados; auditoria aplicada quando sensível; documentação atualizada; CI verde; evidência ligada ao PR. Implementado não é sinônimo de validado.
