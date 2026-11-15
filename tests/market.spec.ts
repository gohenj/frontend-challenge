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
    page.getByRole("link", { name: "Onça Espectral" }),
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
