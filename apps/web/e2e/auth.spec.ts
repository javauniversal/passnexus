import { expect, test } from '@playwright/test';

test('renders the public authentication routes', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Bienvenido de nuevo' }),
  ).toBeVisible();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Contraseña' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Crear cuenta' })).toHaveCount(0);

  await page.goto('/#registro');
  await expect(
    page.getByRole('heading', { name: 'Bienvenido de nuevo' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Olvidé mi contraseña' }).click();
  await expect(
    page.getByRole('heading', { name: 'Recupera tu acceso' }),
  ).toBeVisible();
});

test('forces a temporary password change before loading protected data', async ({
  page,
}) => {
  let protectedRequests = 0;
  let submittedChange: Record<string, string> | null = null;

  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requiresPasswordChange: true,
        changeToken: 'restricted-change-token',
      }),
    }),
  );
  await page.route('**/api/auth/change-temporary-password', async (route) => {
    submittedChange = route.request().postDataJSON() as Record<string, string>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Contraseña actualizada. Inicia sesión con la nueva contraseña.',
      }),
    });
  });
  await page.route(/\/api\/(navigation\/menu|vaults)$/, (route) => {
    protectedRequests += 1;
    return route.abort();
  });

  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill('user@example.com');
  await page
    .getByRole('textbox', { name: 'Contraseña' })
    .fill('temporary-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(
    page.getByRole('heading', { name: 'Protege tu cuenta' }),
  ).toBeVisible();
  expect(protectedRequests).toBe(0);

  await page
    .getByRole('textbox', { name: 'Nueva contraseña', exact: true })
    .fill('new-secure-password');
  await page
    .getByRole('textbox', { name: 'Confirmar nueva contraseña', exact: true })
    .fill('new-secure-password');
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click();

  await expect(
    page.getByRole('heading', { name: 'Bienvenido de nuevo' }),
  ).toBeVisible();
  await expect(page.getByText('Contraseña actualizada.')).toBeVisible();
  expect(submittedChange).toEqual({
    changeToken: 'restricted-change-token',
    password: 'new-secure-password',
  });
  expect(protectedRequests).toBe(0);
});

test('verifies an email token from the public hash route', async ({ page }) => {
  let verificationPayload: Record<string, string> | null = null;
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/auth/verify-email', async (route) => {
    verificationPayload = route.request().postDataJSON() as Record<string, string>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Correo electrónico verificado.' }),
    });
  });

  await page.goto('/#verify-email?token=email-verification-token');

  await expect(
    page.getByRole('heading', { name: 'Correo verificado' }),
  ).toBeVisible();
  await expect(page.getByText('Correo electrónico verificado.')).toBeVisible();
  expect(verificationPayload).toEqual({ token: 'email-verification-token' });
});