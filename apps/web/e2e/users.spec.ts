import { expect, test } from '@playwright/test';

test('creates internal users and copies their setup links', async ({ page, context }) => {
  const pageErrors: string[] = [];
  const createPayloads: unknown[] = [];
  const updatePayloads: unknown[] = [];
  const generatedUserIds: string[] = [];
  const temporaryPasswordUserIds: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:5174',
  });

  const roles = [
    {
      code: 'ADMINISTRATOR',
      name: 'Administrador',
      description: 'Gestiona usuarios y configuración.',
    },
    {
      code: 'MEMBER',
      name: 'Miembro',
      description: 'Usa los vaults a los que tiene acceso.',
    },
  ];
  const users = [
    {
      id: 'active-user',
      email: 'alice@example.com',
      displayName: 'Alice Torres',
      status: 'ACTIVE',
      emailVerifiedAt: '2026-01-02T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      roles: [{ role: roles[0] }],
    },
    {
      id: 'pending-user',
      email: 'bruno@example.com',
      displayName: 'Bruno Díaz',
      status: 'PENDING_VERIFICATION',
      emailVerifiedAt: null,
      createdAt: '2026-01-03T00:00:00.000Z',
      roles: [{ role: roles[1] }],
    },
    {
      id: 'suspended-user',
      email: 'carla@example.com',
      displayName: 'Carla Ruiz',
      status: 'SUSPENDED',
      emailVerifiedAt: '2026-01-04T00:00:00.000Z',
      createdAt: '2026-01-04T00:00:00.000Z',
      roles: [],
    },
  ];

  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        accessToken: 'test-token',
        user: {
          id: 'admin-id',
          email: 'admin@example.com',
          displayName: 'Admin',
          roles: ['ADMINISTRATOR'],
          permissions: ['users.read', 'users.create', 'users.update'],
        },
      },
    }),
  );
  await page.route('**/api/navigation/menu', (route) =>
    route.fulfill({
      json: [
        {
          id: 'users-menu',
          key: 'users',
          label: 'Usuarios',
          path: '/admin/users',
          icon: 'Users',
          type: 'PAGE',
          children: [],
        },
      ],
    }),
  );
  await page.route('**/api/vaults', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/users/role-options', (route) =>
    route.fulfill({ json: roles }),
  );
  await page.route('**/api/admin/users', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: users });
      return;
    }
    const payload = route.request().postDataJSON();
    createPayloads.push(payload);
    const invitedUser = {
      id: 'invited-user',
      email: payload.email,
      displayName: payload.displayName,
      status: 'PENDING_VERIFICATION',
      emailVerifiedAt: null,
      createdAt: '2026-01-05T00:00:00.000Z',
      roles: payload.roleCodes.map((code: string) => ({
        role: roles.find((role) => role.code === code),
      })),
    };
    users.unshift(invitedUser);
    await route.fulfill({
      status: 201,
      json: {
        ...invitedUser,
        setupUrl: 'http://127.0.0.1:5174/#reset?token=ana-setup-token',
      },
    });
  });
  await page.route(
    /\/api\/admin\/users\/([^/]+)\/setup-link$/,
    async (route) => {
      generatedUserIds.push(route.request().url().split('/').at(-2) ?? '');
      await route.fulfill({
        json: {
          setupUrl: 'http://127.0.0.1:5174/#reset?token=bruno-new-token',
        },
      });
    },
  );
  await page.route(
    /\/api\/admin\/users\/([^/]+)\/temporary-password$/,
    async (route) => {
      temporaryPasswordUserIds.push(
        route.request().url().split('/').at(-2) ?? '',
      );
      await route.fulfill({
        json: { temporaryPassword: 'TemporaryPass8-Secure' },
      });
    },
  );
  await page.route(/\/api\/admin\/users\/([^/]+)$/, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    const userId = route.request().url().split('/').at(-1);
    const payload = route.request().postDataJSON();
    updatePayloads.push(payload);
    const user = users.find((candidate) => candidate.id === userId)!;
    user.status = payload.status;
    user.roles = payload.roleCodes.map((code: string) => ({
      role: roles.find((role) => role.code === code)!,
    }));
    await route.fulfill({ json: user });
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Usuarios' }).click();
  await expect(page.getByRole('heading', { name: 'Directorio de usuarios' })).toBeVisible();
  await expect(page.getByLabel('Resumen de usuarios')).toContainText('3 Total');

  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await page.getByLabel('Nombre completo').fill('Ana García');
  await page.getByLabel('Correo electrónico').fill('ana@example.com');
  await expect(page.getByRole('checkbox', { name: /Miembro/ })).toBeChecked();
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).click();

  await expect(page.getByText('Usuario ana@example.com creado.')).toBeVisible();
  await expect(page.getByLabel('Enlace de configuración')).toHaveValue(
    'http://127.0.0.1:5174/#reset?token=ana-setup-token',
  );
  await page.getByRole('button', { name: 'Copiar enlace' }).click();
  await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    'http://127.0.0.1:5174/#reset?token=ana-setup-token',
  );
  await page.getByRole('button', { name: 'Cerrar' }).click();
  expect(createPayloads).toEqual([
    {
      displayName: 'Ana García',
      email: 'ana@example.com',
      roleCodes: ['MEMBER'],
    },
  ]);

  await page.getByLabel('Editar acceso de Ana García').click();
  await page.getByLabel('Estado de la cuenta').click();
  await page.getByRole('option', { name: 'Activo' }).click();
  await page.getByRole('checkbox', { name: /Administrador/ }).check();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.getByText('Cambios guardados.')).toBeVisible();
  expect(updatePayloads).toEqual([
    { status: 'ACTIVE', roleCodes: ['MEMBER', 'ADMINISTRATOR'] },
  ]);

  await page.getByLabel('Generar enlace de acceso para bruno@example.com').click();
  await expect(page.getByText('Enlace de acceso generado para bruno@example.com.')).toBeVisible();
  await expect(page.getByLabel('Enlace de configuración')).toHaveValue(
    'http://127.0.0.1:5174/#reset?token=bruno-new-token',
  );
  expect(generatedUserIds).toEqual(['pending-user']);
  await page.getByRole('button', { name: 'Cerrar' }).click();

  await page.getByLabel('Generar contraseña temporal para alice@example.com').click();
  await expect(page.getByText('Contraseña temporal generada para alice@example.com.')).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Contraseña temporal' }),
  ).toHaveValue(
    'TemporaryPass8-Secure',
  );
  await page.getByRole('button', { name: 'Copiar contraseña' }).click();
  await expect(page.getByRole('button', { name: 'Copiada' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    'TemporaryPass8-Secure',
  );
  expect(temporaryPasswordUserIds).toEqual(['active-user']);
  await page.getByRole('button', { name: 'Cerrar' }).click();

  const usersTable = page.locator('.users-table');
  await page.getByPlaceholder('Buscar por nombre o correo').fill('Carla');
  await expect(usersTable.getByText('carla@example.com')).toBeVisible();
  await expect(usersTable.getByText('alice@example.com')).toBeHidden();
  await page.getByPlaceholder('Buscar por nombre o correo').clear();
  await page.getByLabel('Rol').click();
  await page.getByRole('option', { name: 'Administrador' }).click();
  await expect(usersTable.getByText('alice@example.com')).toBeVisible();
  await expect(usersTable.getByText('bruno@example.com')).toBeHidden();
  expect(pageErrors).toEqual([]);
});