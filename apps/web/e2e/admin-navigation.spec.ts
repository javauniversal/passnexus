import { expect, test } from '@playwright/test';

test('keeps admin records isolated while navigating between sections', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        accessToken: 'test-token',
        user: {
          id: 'admin-id',
          email: 'admin@example.com',
          displayName: 'Admin',
          roles: ['ADMINISTRATOR'],
          permissions: ['users.read', 'roles.read'],
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
              id: 'users-menu',
              key: 'users',
              label: 'Usuarios',
              path: '/admin/users',
              icon: 'Users',
              type: 'PAGE',
              children: [],
            },
            {
              id: 'roles-menu',
              key: 'roles',
              label: 'Roles',
              path: '/admin/roles',
              icon: 'ShieldCheck',
              type: 'PAGE',
              children: [],
            },
          ],
        },
      ],
    }),
  );
  await page.route('**/api/vaults', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/users', (route) =>
    route.fulfill({
      json: [
        {
          id: 'user-id',
          email: 'member@example.com',
          displayName: 'Member',
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00.000Z',
          roles: [],
        },
      ],
    }),
  );
  await page.route('**/api/admin/users/role-options', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route('**/api/admin/roles', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      json: [
        {
          id: 'role-id',
          code: 'MEMBER',
          name: 'Miembro',
          description: 'Acceso estándar',
          permissions: [],
          _count: { users: 1 },
        },
      ],
    });
  });
  await page.route('**/api/admin/permissions', (route) =>
    route.fulfill({ json: [] }),
  );

  await page.goto('/');
  await page.getByRole('link', { name: 'Usuarios' }).click();
  await expect(page.getByText('member@example.com')).toBeVisible();

  await page.getByRole('link', { name: 'Roles' }).click();
  await expect(page.getByLabel('Cargando administración')).toBeVisible();
  await expect(page.getByText('Acceso estándar')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('creates, edits and deletes navigation items from the menu map', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const createPayloads: Record<string, unknown>[] = [];
  const updatePayloads: Record<string, unknown>[] = [];
  const adminGroup = {
    id: '10000000-0000-4000-8000-000000000001',
    key: 'administration',
    label: 'Administración',
    path: null,
    icon: 'Settings',
    type: 'GROUP',
    sortOrder: 90,
    isVisible: true,
    parentId: null,
    permission: null,
  };
  const usersItem = {
    id: '10000000-0000-4000-8000-000000000002',
    key: 'users',
    label: 'Usuarios',
    path: '/admin/users',
    icon: 'Users',
    type: 'PAGE',
    sortOrder: 20,
    isVisible: true,
    parentId: adminGroup.id,
    permission: { code: 'users.read', name: 'Ver usuarios' },
  };

  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        accessToken: 'navigation-admin-token',
        user: {
          id: 'admin-id',
          email: 'admin@example.com',
          displayName: 'Admin',
          roles: ['ADMINISTRATOR'],
          permissions: ['navigation.read', 'navigation.update'],
        },
      },
    }),
  );
  await page.route('**/api/navigation/menu', (route) =>
    route.fulfill({
      json: [
        {
          id: 'navigation-menu',
          key: 'navigation',
          label: 'Navegación',
          path: '/admin/navigation',
          icon: 'PanelLeft',
          type: 'PAGE',
          children: [],
        },
      ],
    }),
  );
  await page.route('**/api/vaults', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/navigation/permissions', (route) =>
    route.fulfill({
      json: [
        {
          code: 'users.read',
          name: 'Ver usuarios',
          description: 'Permite consultar usuarios.',
        },
      ],
    }),
  );
  await page.route('**/api/admin/navigation', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      createPayloads.push(payload);
      await route.fulfill({
        status: 201,
        json: {
          id: '10000000-0000-4000-8000-000000000003',
          ...payload,
          permission: { code: 'users.read', name: 'Ver usuarios' },
        },
      });
      return;
    }
    await route.fulfill({ json: [adminGroup, usersItem] });
  });
  await page.route(
    '**/api/admin/navigation/10000000-0000-4000-8000-000000000003',
    async (route) => {
      if (route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        updatePayloads.push(payload);
        await route.fulfill({
          json: {
            id: '10000000-0000-4000-8000-000000000003',
            key: 'reportes',
            ...payload,
            permission: { code: 'users.read', name: 'Ver usuarios' },
          },
        });
        return;
      }
      await route.fulfill({ json: { id: '10000000-0000-4000-8000-000000000003' } });
    },
  );

  await page.goto('/');
  await page.getByRole('link', { name: 'Navegación' }).click();
  await expect(page.getByRole('heading', { name: 'Mapa de navegación' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBe(390);
  await page.getByRole('button', { name: 'Agregar elemento' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Agregar elemento' });
  await createDialog.getByLabel('Etiqueta').fill('Reportes');
  await createDialog.getByLabel('Ruta').fill('/admin/reportes');
  await createDialog.getByLabel('Elemento superior').click();
  await page.getByRole('option', { name: 'Administración' }).click();
  await createDialog.getByLabel('Permiso requerido').click();
  await page.getByRole('option', { name: /Ver usuarios/ }).click();
  await createDialog.getByRole('button', { name: 'Agregar elemento' }).click();

  await expect(page.getByRole('treeitem', { name: /Reportes/ })).toBeVisible();
  expect(createPayloads).toEqual([
    expect.objectContaining({
      key: 'reportes',
      label: 'Reportes',
      path: '/admin/reportes',
      parentId: adminGroup.id,
      permissionCode: 'users.read',
    }),
  ]);

  await page.getByRole('button', { name: 'Editar Reportes' }).click();
  const editDialog = page.getByRole('dialog', { name: 'Editar elemento' });
  await editDialog.getByLabel('Etiqueta').fill('Informes');
  await editDialog.getByLabel('Orden').fill('30');
  await editDialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('treeitem', { name: /Informes/ })).toBeVisible();
  expect(updatePayloads).toEqual([
    expect.objectContaining({ label: 'Informes', sortOrder: 30 }),
  ]);

  await page.getByRole('button', { name: 'Eliminar Informes' }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Eliminar elemento' });
  await deleteDialog.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByRole('treeitem', { name: /Informes/ })).toHaveCount(0);
});