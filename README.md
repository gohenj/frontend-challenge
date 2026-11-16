# Jungle Marketplace

Marketplace NFT demonstrativo em React e TypeScript. O catálogo, a conta, as carteiras e os pedidos usam dados fictícios.

## Executar

Use Node.js 22.12 ou superior.

```sh
npm ci
npm run dev
```

O MSW é ativado por padrão em desenvolvimento e no build. Defina VITE_ENABLE_MOCKS=false para desativar a simulação quando houver uma API compatível.

| Conta | Senha |
| --- | --- |
| demo@jungle.test | jungle123 |
| outra@jungle.test | jungle123 |

Adicione um NFT ao carrinho, aplique JUNGLE10 se quiser, abra o pagamento e entre com uma conta fictícia. Selecione e conecte a carteira, revise e confirme. O recibo aparece quando a API simulada confirma o pedido.

## Cenários

Use o seletor no rodapé. **Restaurar dados** restaura a fixture inicial. EXPIRED simula cupom expirado. Para testar a mudança de preço durante a revisão, escolha **Alterar preço** antes de abrir o diálogo ou envie POST /api/demo com {"scenario":"price"} enquanto a revisão está aberta. **Timeout após pedido** cria a compra e atrasa a resposta até o Axios expirar. Recarregue o checkout e recupere a mesma tentativa pelo botão de recuperação. **Recusar pagamento** conserva o carrinho. **Falha em favoritos** permite observar o rollback.

## Verificações e publicação

```sh
npm run typecheck
npm run lint
npm run build
npm run preview
npx playwright install chromium
npm test
npm run audit
```

Playwright usa o build local e grava relatório HTML em playwright-report. O Lighthouse usa o preview em localhost:4174 e grava HTML, JSON e medianas em reports/lighthouse. A configuração do Vercel inclui fallback das rotas e preserva o service worker do MSW. Configure o projeto como Vite e publique a pasta dist a partir do repositório da solução.

Consulte [ARCHITECTURE.md](ARCHITECTURE.md) para contratos, cache, eventos e limitações. O [repositório original](https://github.com/junglegaming/frontend-challenge) contém o enunciado.

Para conferir estoque por edição, selecione Genesis e Limitada no mesmo NFT e adicione cada uma ao carrinho. O checkout valida o estoque de cada linha e o recibo registra as edições. Os testes também exercitam os cenários de rede `disconnect` e `duplicates` via POST /api/demo.
