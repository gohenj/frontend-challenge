# Arquitetura

TanStack Router valida a busca e protege as rotas privadas. TanStack Query associa o catálogo aos parâmetros da URL, os favoritos, carteiras e pedidos à conta, e passa o AbortSignal das leituras ao Axios. O cache é revalidado após mutações, eventos e reconexão. Falhas de leitura ficam disponíveis para nova tentativa manual. Favoritos atualizam o cache imediatamente e restauram o snapshot anterior em caso de erro.

MSW intercepta HTTP e WebSocket no navegador. O cliente Socket.IO usa transporte WebSocket e o binding MSW traduz os frames. A simulação roda na página, sem infraestrutura remota e sem sincronização de alterações entre abas. Eventos carregam id, recurso e versão. O cliente ignora versões já vistas e busca a representação atual via REST. Eventos de pedido são direcionados à sessão assinante.

O mock persiste catálogo, contas, sessão, carrinhos e pedidos no armazenamento local. A sessão fictícia dura uma hora. Favoritos e pedidos são vinculados à conta. O checkout guarda a tentativa por conta até recuperar um pedido ou receber erro definitivo. A mesma chave com o mesmo corpo recupera o pedido, inclusive após timeout. Uma chave reaproveitada com outro corpo recebe 409. O recibo usa um snapshot independente do catálogo. Quantidades são inteiras e as cotações usam unidades inteiras de 0,0001 ETH para os valores da fixture.

## Contratos

Todas as rotas REST usam o prefixo /api. Erros retornam um objeto com message.

| Recurso | Operações |
| --- | --- |
| Sessão | GET /session, DELETE /session, POST /login, POST /register |
| Catálogo | GET /nfts com q, category, sort, available e page. GET /nfts/:id |
| Favoritos | GET /favorites e POST /favorites com id para alternar |
| Carrinho | GET /cart e POST /cart com id e quantity. Zero remove o item |
| Cotação | GET /quote e POST /quote com coupon. String vazia remove o cupom |
| Pedidos | POST /orders com assinatura da cotação, nome, e-mail, carteira e rede, mais Idempotency-Key. GET /orders/:id |
| Perfil | GET /profile e POST /profile com name, avatar e campos opcionais de senha |
| Carteiras | GET /wallets e POST /wallets com address e secondary |
| Cenário | POST /demo com scenario |

Os eventos nft.updated e order.updated usam o mesmo envelope com id, resource e version. A cotação retorna subtotal, desconto, taxa, total e assinatura opaca. A simulação recusa cotação desatualizada e valida disponibilidade antes de criar o pedido.

## Limitações

A interface usa como referência os frames e a gravação do protótipo, com as quatro artes fornecidas. O acesso direto ao Figma segue pendente e alguns detalhes de composição foram aproximados. As fixtures oferecem as edições Genesis, Limitada e Aberta, com estoques separados. Linhas do carrinho e do recibo são identificadas pelo NFT e pela edição. Linhas antigas sem edição são lidas como Genesis. As credenciais e carteiras são fictícias, a conexão da carteira é simulada e a autenticação local serve à demonstração.


