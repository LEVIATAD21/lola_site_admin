# LOLA — Painel Administrativo

Aplicação administrativa independente para LOLA Aço Inox & Acessórios.

## Executar localmente

Requer Node.js 22.12 ou superior.

```bash
npm install
npm run dev
```

Validar a compilação:

```bash
npm run build
```

## Funcionalidades da interface

- Dashboard com resumo do catálogo e alertas de estoque locais.
- Pesquisa e filtros por seção.
- Seleção individual e em lote.
- Criar e editar produtos, preços, SKUs, categorias e quantidades.
- Prévia local de fotografias e substituição da imagem de um produto selecionado.
- Ações em lote para preço, estoque, publicação e remoção da demonstração.
- Exportação CSV do catálogo filtrado.
- Vistas para estoque, pedidos, clientes, relatórios e configurações.
- Interface responsiva para desktop e dispositivos móveis.
- Persistência de demonstração no armazenamento local do navegador.

## Estado atual: modo de demonstração

**Este repositório contém a interface administrativa; ainda não é um sistema de produção conectado à loja pública.** Os dados iniciais são demonstrativos. Alterações, imagens, preços e remoções ficam apenas no navegador. Nenhuma ação chama a API da loja e nenhuma exclusão real é executada.

Não coloque credenciais, tokens de administrador ou segredos em variáveis `VITE_*`: variáveis com esse prefixo são incorporadas ao bundle público.

## Integração de produção necessária

O painel pode ser hospedado em domínio/servidor separado, mas deve consumir uma API administrativa autenticada. A API e a loja pública precisam compartilhar a fonte oficial de dados; o frontend nunca deve acessar diretamente o banco.

Endpoints propostos, ainda não implementados:

- `GET /api/admin/v1/products`
- `POST /api/admin/v1/products`
- `PATCH /api/admin/v1/products/:id`
- `POST /api/admin/v1/products/bulk-archive`
- `POST /api/admin/v1/products/:id/image`
- `GET /api/admin/v1/orders`
- `GET /api/admin/v1/customers`
- `GET /api/admin/v1/audit-log`

Antes da produção, implementar autenticação real e MFA, autorização no servidor, validação, rate limiting, proteção CSRF quando aplicável, upload persistente de imagens, transações para estoque e arquivamento, auditoria, sincronização de cache/eventos, testes e deploy seguro.

## Identidade visual

Paleta LOLA: marrom-escuro, creme e dourado suave. O projeto não inclui marcas, logotipos ou créditos de ferramentas de IA.
