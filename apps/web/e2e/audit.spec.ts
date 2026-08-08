import { expect, test } from '@playwright/test';

test('renders audit events whose actor no longer exists', async ({ page }) => {
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        accessToken: 'test-token',
        user: {
          id: 'admin-id',
          email: 'admin@example.com',
          displayName: 'Admin',
          roles: ['ADMINISTRATOR'],
          permissions: ['audit.read'],
        },
      },
    }),
  );
  await page.route('**/api/navigation/menu', (route) =>
    route.fulfill({
      json: [
        {
          id: 'vault-menu',
          key: 'vault',
          label: 'Mi vault',
          path: '/vault',
          icon: 'KeyRound',
          type: 'PAGE',
          children: [],
        },
        {
          id: 'admin-menu',
          key: 'administration',
          label: 'Administración',
          path: null,
          icon: 'Settings',
          type: 'GROUP',
          children: [
            {
              id: 'audit-menu',
              key: 'audit',
              label: 'Auditoría',
              path: '/admin/audit',
              icon: 'ScrollText',
              type: 'PAGE',
              children: [],
            },
          ],
        },
      ],
    }),
  );
  await page.route('**/api/vaults', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/audit', (route) =>
    route.fulfill({
      json: [
        {
          id: 'audit-id',
          action: 'vault-item.deleted',
          entity: 'VaultItem',
          entityId: 'item-id',
          metadata: { reason: 'manual removal' },
          createdAt: new Date().toISOString(),
          user: null,
        },
        {
          id: 'audit-user-id',
          action: 'vault.created',
          entity: 'Vault',
          entityId: 'vault-id',
          metadata: null,
          createdAt: new Date().toISOString(),
          user: {
            displayName: 'Admin',
            email: 'admin@example.com',
          },
        },
      ],
    }),
  );

  await page.goto('/');
  await page.getByRole('link', { name: 'Auditoría' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Acción' })).toBeVisible();
  await expect(page.getByText('vault-item deleted')).toBeVisible();
  await expect(page.getByText('Usuario eliminado o sin actor')).toBeVisible();

  await page.getByLabel('Ver detalles de vault-item.deleted').click();
  await expect(page.getByText('manual removal')).toBeVisible();

  await page.getByRole('combobox', { name: 'Actor' }).click();
  await page.getByRole('option', { name: 'Sistema' }).click();
  await expect(page.getByText('vault-item deleted')).toBeVisible();
  await expect(page.getByText('vault created')).toBeHidden();

  await page.getByPlaceholder('Buscar por acción, actor o recurso').fill('sin resultados');
  await expect(page.getByText('No hay coincidencias')).toBeVisible();
});