import { test, expect, type Page } from "@playwright/test";
const scenario = async (page: Page, value: string) => {
  await page.evaluate(async (scenario) => {
    const response = await fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario }),
    });
    if (!response.ok) throw new Error("Scenario failed");
  }, value);
};
const signIn = async (page: Page, email = "demo@jungle.test") => {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("jungle123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
};
const add = async (page: Page) => {
  await page.goto("/nft/1");
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await page.getByRole("link", { name: "Ver carrinho" }).click();
};
const checkout = async (page: Page) => {
  await add(page);
  await page.getByRole("link", { name: "Conectar e finalizar" }).click();
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Pagamento" })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Carteira", exact: true })
    .selectOption({ index: 1 });
  await page.getByRole("button", { name: "Conectar carteira" }).click();
};
const review = (page: Page) =>
  page.getByRole("button", { name: "Revisar pedido" }).click();
const confirm = (page: Page) =>
  page.getByRole("button", { name: "Confirmar compra" }).click();

test("catálogo, filtros, histórico e rota inválida", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Próxima" }).click();
  await expect(page.getByText("Página 2 de 2")).toBeVisible();
  await page.getByLabel("Categoria").selectOption("Criaturas");
  await page.getByLabel("Disponíveis").check();
  await page.getByLabel("Ordenar").selectOption("price");
  await page.getByLabel("Busca").fill("onça");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(
    page.getByRole("heading", { name: "Onça Espectral" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Arara Solar" })).toHaveCount(
    0,
  );
  await page.goBack();
  await expect(page.getByLabel("Busca")).toHaveValue("");
  await page.goto("/nft/inexistente");
  await expect(page.getByRole("alert")).toHaveText("NFT não encontrado.");
});
test("compra preserva carrinho ao autenticar e recupera recibo", async ({
  page,
}) => {
  await checkout(page);
  await review(page);
  await expect(page.getByRole("dialog")).toBeVisible();
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Compra confirmada" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 × Onça Espectral")).toBeVisible();
  await page.getByRole("link", { name: "Carrinho", exact: true }).click();
  await expect(page.getByText("Seu carrinho está vazio.")).toBeVisible();
});
test("preço recebido pelo socket invalida revisão", async ({ page }) => {
  await checkout(page);
  await review(page);
  await scenario(page, "price");
  await expect(
    page.getByText("Preço ou disponibilidade atualizados."),
  ).toBeAttached();
  await expect(
    page.getByText("A cotação mudou.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar compra" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await review(page);
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Compra confirmada" }),
  ).toBeVisible();
});
test("timeout após criação recupera a mesma tentativa", async ({ page }) => {
  await checkout(page);
  await scenario(page, "timeout");
  await review(page);
  await confirm(page);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("alert")
      .filter({ hasText: "Falha de conexão" }),
  ).toContainText("Falha de conexão");
  await page.reload();
  await page
    .getByRole("button", { name: "Recuperar tentativa de pagamento" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Compra confirmada" }),
  ).toBeVisible();
  await expect(page.getByText("1 × Onça Espectral")).toBeVisible();
});
test("pagamento recusado conserva os itens", async ({ page }) => {
  await checkout(page);
  await scenario(page, "decline");
  await review(page);
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Pagamento recusado" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Voltar ao carrinho" }).click();
  await expect(
    page.getByRole("link", { name: "Onça Espectral", exact: true }),
  ).toBeVisible();
});
test("favorito faz rollback e fica isolado por conta", async ({ page }) => {
  await page.goto("/login");
  await signIn(page);
  await expect(page.getByRole("link", { name: "Perfil" })).toBeVisible();
  await page.goto("/nft/1");
  const favorite = page.getByRole("button", { name: "Favorito" });
  await expect(favorite).toBeVisible();
  await scenario(page, "favorite-error");
  await favorite.click();
  await expect(page.getByRole("alert")).toHaveText(
    "Não foi possível salvar o favorito.",
  );
  await expect(favorite).toHaveAttribute("aria-pressed", "false");
  await scenario(page, "default");
  await favorite.click();
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Sair" }).click();
  await page.getByRole("link", { name: "Entrar", exact: true }).click();
  await signIn(page, "outra@jungle.test");
  await expect(page.getByRole("link", { name: "Perfil" })).toBeVisible();
  await page.goto("/nft/1");
  await expect(favorite).toHaveAttribute("aria-pressed", "false");
});

test("regressão visual das telas principais", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Onça Espectral" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("inicio.png", {
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/nft/1");
  await expect(
    page.getByRole("button", { name: "Adicionar ao carrinho" }),
  ).toBeEnabled();
  await expect(page).toHaveScreenshot("detalhe.png", {
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await page.getByRole("link", { name: "Ver carrinho" }).click();
  await expect(page.getByText("0.1250 ETH")).toBeVisible();
  await expect(page).toHaveScreenshot("carrinho.png", {
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Conectar e finalizar" }).click();
  await signIn(page);
  await expect(page.getByRole("option", { name: /0x111/ })).toBeAttached();
  await expect(page).toHaveScreenshot("pagamento.png", {
    fullPage: true,
    animations: "disabled",
  });
});

test("login social abre sobre a home e retoma o checkout", async ({ page }) => {
  await add(page);
  await page.getByRole("link", { name: "Conectar e finalizar" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Continuar com Google" }).click();
  await expect(page.getByRole("heading", { name: "Pagamento" })).toBeVisible();
  await expect(page.getByText("0.1250 ETH")).toBeVisible();
  await page.getByRole("button", { name: "Sair" }).click();
  await page.getByRole("link", { name: "Entrar", exact: true }).click();
  await dialog.getByRole("button", { name: "Continuar com Facebook" }).click();
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  await expect(page.getByLabel("E-mail")).toHaveValue("outra@jungle.test");
});

test("cadastro valida senha, cria sessão e rejeita e-mail repetido", async ({
  page,
}) => {
  await page.goto("/register");
  const dialog = page.getByRole("dialog");
  const email = "nova@jungle.test";
  async function fill(confirmation: string) {
    await dialog.getByLabel("Nome de usuário").fill("Nova Pessoa");
    await dialog.getByLabel("E-mail").fill(email);
    await dialog.getByLabel("Senha", { exact: true }).fill("jungle123");
    await dialog.getByLabel("Confirmar senha").fill(confirmation);
    await dialog
      .getByRole("button", { name: "Criar conta", exact: true })
      .click();
  }
  await fill("different123");
  await expect(dialog.getByRole("alert")).toContainText(
    "As senhas precisam ser iguais",
  );
  await fill("jungle123");
  await expect(
    page.getByRole("link", { name: "Perfil", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await page.goto("/register");
  await fill("jungle123");
  await expect(dialog.getByRole("alert")).toContainText("E-mail já cadastrado");
});

test("sessão expirada bloqueia perfil e permite retomar", async ({ page }) => {
  await page.goto("/profile");
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Perfil", exact: true }),
  ).toBeVisible();
  await scenario(page, "expire");
  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible();
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Perfil", exact: true }),
  ).toBeVisible();
});

test("carteira secundária valida endereço e persiste após recarregar", async ({
  page,
}) => {
  await page.goto("/wallets");
  await signIn(page);
  const secondary = page.getByLabel("Carteira secundária");
  const save = page.getByRole("button", { name: "Salvar carteiras" });
  await secondary.fill("inválida");
  await save.click();
  await expect(page.getByRole("alert")).toBeVisible();
  const address = "0x" + "2".repeat(40);
  await secondary.fill(address);
  await save.click();
  await expect(page.getByText("Carteiras salvas.")).toBeVisible();
  await page.reload();
  await expect(secondary).toHaveValue(address);
});

test("catálogo mostra carregamento, erro e recuperação", async ({ page }) => {
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "Onça Espectral" });
  await expect(heading).toBeVisible();
  await scenario(page, "slow");
  await page.getByRole("button", { name: "Próxima" }).click();
  await expect(page.getByLabel("Carregando")).toBeVisible();
  await expect(page.getByText("Página 2 de 2")).toBeVisible();
  await scenario(page, "error");
  await page.getByRole("button", { name: "Anterior" }).click();
  await expect(page.getByRole("alert")).toContainText("Serviço indisponível");
  await scenario(page, "default");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(heading).toBeVisible();
});

test("cupom inválido, aplicação, quantidade e remoção", async ({ page }) => {
  await add(page);
  const coupon = page.getByLabel("Cupom");
  await coupon.fill("INVALIDO");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/inválido/i);
  await coupon.fill("JUNGLE10");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByText("0.1130 ETH")).toBeVisible();
  await page.getByRole("button", { name: "Aumentar Onça Espectral" }).click();
  await expect(page.getByText("0.2210 ETH")).toBeVisible();
  await page.reload();
  await expect(page.getByText("0.2210 ETH")).toBeVisible();
  await page.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(page.getByText("Seu carrinho está vazio.")).toBeVisible();
});

test("perfil valida senha atual e persiste nome, avatar e nova senha", async ({
  page,
}) => {
  await page.goto("/profile");
  await signIn(page);
  const name = page.getByLabel("Nome", { exact: true });
  const avatar = page.getByLabel("URL do avatar");
  const previous = page.getByLabel("Senha atual");
  const nextPassword = "novaSenha123";
  await name.fill("Alex Atualizado");
  await avatar.fill("https://example.test/avatar.png");
  await previous.fill("senhaErrada");
  await page.getByLabel("Nova senha", { exact: true }).fill(nextPassword);
  await page.getByLabel("Confirmar nova senha").fill(nextPassword);
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByRole("alert")).toContainText("Confira a senha atual");
  await previous.fill("jungle123");
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByText("Perfil salvo.")).toBeVisible();
  await page.reload();
  await expect(name).toHaveValue("Alex Atualizado");
  await expect(avatar).toHaveValue("https://example.test/avatar.png");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByRole("link", { name: "Entrar", exact: true }).click();
  await page.getByLabel("E-mail").fill("demo@jungle.test");
  await page.getByLabel("Senha", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Perfil", exact: true }),
  ).toBeVisible();
});

test("login mantém o foco no diálogo e fecha com Escape", async ({ page }) => {
  await page.goto("/");
  const entry = page.getByRole("link", { name: "Entrar", exact: true });
  await entry.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let step = 0; step < 10; step++) {
    await page.keyboard.press("Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(entry).toBeVisible();
});

test("pedido pendente mantém o mesmo recibo após recarregar", async ({
  page,
}) => {
  const start = new Date();
  await page.clock.setFixedTime(start);
  await checkout(page);
  await review(page);
  await confirm(page);
  await expect(
    page.getByRole("heading", { name: "Pagamento pendente" }),
  ).toBeVisible();
  const receiptUrl = page.url();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Pagamento pendente" }),
  ).toBeVisible();
  await page.clock.setFixedTime(new Date(start.getTime() + 2000));
  await expect(
    page.getByRole("heading", { name: "Compra confirmada" }),
  ).toBeVisible();
  await expect(page).toHaveURL(receiptUrl);
});

test("NFT favoritado aparece na lista de interesse após recarregar", async ({
  page,
}) => {
  await page.goto("/login");
  await signIn(page);
  await expect(
    page.getByRole("link", { name: "Perfil", exact: true }),
  ).toBeVisible();
  await page.goto("/nft/1");
  const favorite = page.getByRole("button", { name: "Favorito", exact: true });
  await favorite.click();
  await expect(favorite).toBeEnabled();
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  await page.getByRole("link", { name: "Lista de interesse" }).click();
  const nft = page.getByRole("heading", { name: "Onça Espectral" });
  await expect(nft).toBeVisible();
  await page.reload();
  await expect(nft).toBeVisible();
});
