import { test, expect } from "@playwright/test";
test("discovery filters, details, account gating and responsive layout", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hay noches. Y hay historias." }),
  ).toBeVisible();
  await expect(page.locator(".event-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Electrónica", exact: true }).click();
  await expect(page.locator(".event-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Buscar evento o ciudad" })
    .fill("Arequipa");
  await expect(page.locator(".event-card")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Buscar evento o ciudad" }).fill("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/home-${info.project.name}.png`,
    fullPage: true,
  });
  await page.locator(".event-card").first().click();
  await expect(page).toHaveURL(/\/events\/afterglow$/);
  await expect(
    page.getByRole("heading", { name: "AFTERGLOW", exact: true, level: 1 }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Reservar entrada" }).click();
  await expect(
    page.getByRole("heading", { name: "Una gran noche empieza aquí." }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Correo donde recibirás tu entrada"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar reserva" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/guest-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto("/auth");
  await expect(page.locator("button[type=submit]")).toBeDisabled();
  await page.getByRole("button", { name: "Crear una cuenta" }).click();
  await expect(
    page.getByRole("heading", { name: "Empieza algo memorable." }),
  ).toBeVisible();
  await expect(page.locator("button[type=submit]")).toBeDisabled();
  await page.goto("/manage");
  await expect(
    page.getByRole("heading", { name: "Tu experiencia empieza con tu cuenta" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
