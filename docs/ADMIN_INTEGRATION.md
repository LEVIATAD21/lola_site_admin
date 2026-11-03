# Integração de produção — painel LOLA

## Regra central

Este painel não pode mais usar dados fictícios ou `localStorage` como fonte de verdade. Toda alteração deve ser confirmada pela API e persistida no servidor antes de aparecer como salva.

## Estado atual

O painel é uma demonstração visual. O código atual inicializa produtos em `seed`, grava alterações em `localStorage`, armazena imagens como data URL no navegador e exibe avisos de que nada foi enviado ao servidor. As telas de pedidos e clientes ainda não estão ligadas aos dados reais.

## API alvo

Base URL configurável por ambiente público, sem segredos: `VITE_API_BASE_URL`.

Prefixo administrativo: `/api/admin/v1`.

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`
- `GET /products`, `POST /products`, `GET /products/:id`, `PATCH /products/:id`
- `POST /products/:id/image`, `POST /products/:id/archive`
- `GET /orders`, `PATCH /orders/:id/status`
- `GET /inventory`, `PATCH /inventory/:productId`
- `GET /audit-log`

O contrato detalhado e critérios de aceite estão em `docs/ADMIN_INTEGRATION_PLAN.md` no repositório da loja. Endpoints acima são planejados e não devem ser tratados como já disponíveis.

## Segurança obrigatória

- Não armazenar chave administrativa, HMAC ou senha em código frontend, `localStorage`, `sessionStorage` ou variável `VITE_*`.
- Preferir sessão gerenciada pelo servidor com cookie HttpOnly, Secure e SameSite, proteção CSRF e rate limiting.
- A autenticação interna HMAC entre vitrine e plano de dados é independente da sessão humana do operador.
- Exibir sucesso somente após confirmação da API; erros de rede devem preservar o formulário e informar que nada foi salvo.
- Uploads devem usar multipart/form-data e armazenamento persistente; não usar data URLs em localStorage.
- Alterações de preço/estoque devem ser validadas novamente no servidor.

## Critérios de aceite

1. Alterar preço no painel e confirmar que a vitrine pública exibe o novo valor.
2. Recarregar o painel e confirmar persistência.
3. Criar, editar, arquivar e publicar produtos reais.
4. Upload de foto persiste após reinício.
5. Estoque é consistente entre painel, vitrine e checkout.
6. Pedidos e clientes vêm da API, com acesso mínimo necessário.
7. Operações administrativas são auditadas e bloqueadas sem sessão válida.

## Deploy

O painel deve permanecer num repositório e projeto de hospedagem próprios. O deploy de frontend só ocorre após build e verificações CI. A API fica no servidor brasileiro e não deve ser embutida no bundle estático.
