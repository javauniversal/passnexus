import { expect, test } from '@playwright/test';

const vaultMemberRole = {
  id: 'vault-member-role',
  code: 'VAULT_MEMBER',
  name: 'Miembro de vault',
  description: 'Gestiona sus propios secretos.',
  permissions: [
    {
      permission: {
        code: 'organizations.read',
        name: 'Ver organizaciones',
      },
    },
  ],
  _count: { users: 4 },
};

const permissionCatalog = [
  ['organizations.read', 'Ver organizaciones'],
  ['organizations.create', 'Crear organizaciones'],
  ['organizations.update', 'Editar organizaciones'],
  ['organizations.delete', 'Eliminar en organizaciones'],
  ['roles.create', 'Crear roles'],
].map(([code, name]) => ({ code, name, description: name }));

test('creates a configurable role with initial permissions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let createPayload: {
    code: string;
    name: string;
    description: string;
    permissionCodes: string[];
  } | null = null;
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        accessToken: 'role-creator-token',
        user: {
          id: 'admin-id',
          email: 'admin@example.com',
          displayName: 'Admin',
          roles: ['ADMINISTRATOR'],
          permissions: ['roles.read', 'roles.create'],
        },
      },
    }),
  );
  await page.route('**/api/navigation/menu', (route) =>
    route.fulfill({
      json: [
        {
          id: 'roles-menu',
          key: 'roles',
          label: 'Roles y permisos',
          path: '/admin/roles',
          icon: 'ShieldCheck',
          type: 'PAGE',
          children: [],
        },
      ],
    }),
  );
  await page.route('**/api/vaults', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/permissions', (route) =>
    route.fulfill({ json: permissionCatalog }),
  );
  await page.route('**/api/admin/roles', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [vaultMemberRole] });
      return;
    }
    createPayload = route.request().postDataJSON() as typeof createPayload;
    await route.fulfill({
      status: 201,
      json: {
        id: 'organization-auditor-role',
        code: createPayload!.code,
        name: createPayload!.name,
        description: createPayload!.description,
        permissions: createPayload!.permissionCodes.map((code) => ({
          permission: permissionCatalog.find(
            (permission) => permission.code === code,
          ),
        })),
        _count: { users: 0 },
      },
    });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Roles y permisos' }).click();
  await page.getByRole('button', { name: 'Crear rol' }).click();
  const dialog = page.getByRole('dialog', { name: 'Crear rol' });
  await expect(dialog.getByRole('button', { name: 'Crear rol' })).toBeVisible();
  const mobileDialogMetrics = await dialog.evaluate((element) => {
    const content = element.querySelector('.role-create-dialog');
    const action = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Crear rol',
    );
    return {
      contentOverflow: content
        ? content.scrollWidth > content.clientWidth
        : true,
      actionBottom: action?.getBoundingClientRect().bottom ?? Infinity,
      viewportHeight: window.innerHeight,
    };
  });
  expect(mobileDialogMetrics.contentOverflow).toBe(false);
  expect(mobileDialogMetrics.actionBottom).toBeLessThanOrEqual(
    mobileDialogMetrics.viewportHeight,
  );
  await dialog.getByLabel('Nombre del rol').fill('Auditor de organizaciones');
  await expect(dialog.getByLabel('Código')).toHaveValue(
    'AUDITOR_DE_ORGANIZACIONES',
  );
  await dialog
    .getByLabel('Descripción (opcional)')
    .fill('Consulta organizaciones sin modificarlas.');
  await dialog
    .getByRole('checkbox', { name: 'Ver Organizaciones' })
    .check();
  await dialog.getByRole('button', { name: 'Crear rol' }).click();

  expect(createPayload).toEqual({
    code: 'AUDITOR_DE_ORGANIZACIONES',
    name: 'Auditor de organizaciones',
    description: 'Consulta organizaciones sin modificarlas.',
    permissionCodes: ['organizations.read'],
  });
  await expect(
    page.getByRole('heading', {
      name: 'Auditor de organizaciones',
      level: 3,
    }),
  ).toBeVisible();
  await expect(page.getByText('Rol Auditor de organizaciones creado.')).toBeVisible();
  await expect(page.getByText('0 usuarios')).toBeVisible();
});

test('configures module actions from the roles matrix', async ({ page }) => {
  let updatePayload: { permissionCodes: string[] } | null = null;
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        accessToken: 'admin-token',
        user: {
          id: 'admin-id',
          email: 'admin@example.com',
          displayName: 'Admin',
          roles: ['ADMINISTRATOR'],
          permissions: ['roles.read', 'roles.update'],
        },
      },
    }),
  );
  await page.route('**/api/navigation/menu', (route) =>
    route.fulfill({
      json: [
        {
          id: 'roles-menu',
          key: 'roles',
          label: 'Roles y permisos',
          path: '/admin/roles',
          icon: 'ShieldCheck',
          type: 'PAGE',
          children: [],
        },
      ],
    }),
  );
  await page.route('**/api/vaults', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/permissions', (route) =>
    route.fulfill({ json: permissionCatalog }),
  );
  await page.route('**/api/admin/roles', (route) =>
    route.fulfill({ json: [vaultMemberRole] }),
  );
  await page.route('**/api/admin/roles/vault-member-role/permissions', async (route) => {
    updatePayload = route.request().postDataJSON() as {
      permissionCodes: string[];
    };
    await route.fulfill({
      json: {
        ...vaultMemberRole,
        permissions: updatePayload.permissionCodes.map((code) => ({
          permission: permissionCatalog.find((permission) => permission.code === code),
        })),
      },
    });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Roles y permisos' }).click();
  await expect(page.getByRole('button', { name: 'Crear rol' })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Roles y permisos', level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Ver Organizaciones' }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Crear Organizaciones' }),
  ).not.toBeChecked();

  await page
    .getByRole('checkbox', { name: 'Crear Organizaciones' })
    .check();
  await expect(page.getByText('Cambios sin guardar')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  expect(updatePayload).toEqual({
    permissionCodes: ['organizations.read', 'organizations.create'],
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  const matrixDimensions = await page
    .locator('.permission-matrix')
    .evaluate((matrix) => ({
      clientWidth: matrix.clientWidth,
      scrollWidth: matrix.scrollWidth,
    }));
  expect(matrixDimensions.scrollWidth).toBeGreaterThan(
    matrixDimensions.clientWidth,
  );
});

test('shows organizations without mutation controls when only read is granted', async ({
  page,
}) => {
  const mutationRequests: string[] = [];
  page.on('request', (request) => {
    if (
      request.url().includes('/api/organizations') &&
      request.method() !== 'GET'
    ) {
      mutationRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        accessToken: 'member-token',
        user: {
          id: 'member-id',
          email: 'member@example.com',
          displayName: 'Member',
          roles: ['VAULT_MEMBER'],
          permissions: ['organizations.read'],
        },
      },
    }),
  );
  await page.route('**/api/navigation/menu', (route) =>
    route.fulfill({
      json: [
        {
          id: 'organizations-menu',
          key: 'organizations',
          label: 'Organizaciones',
          path: '/organizations',
          icon: 'Building2',
          type: 'PAGE',
          children: [],
        },
      ],
    }),
  );
  await page.route('**/api/vaults', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/organizations', (route) =>
    route.fulfill({
      json: [
        {
          id: 'organization-id',
          name: 'Operaciones',
          ownerId: 'owner-id',
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
          members: [
            {
              role: 'MEMBER',
              joinedAt: '2026-08-01T00:00:00.000Z',
              user: {
                id: 'member-id',
                email: 'member@example.com',
                displayName: 'Member',
              },
            },
          ],
          teams: [],
        },
      ],
    }),
  );

  await page.goto('/');
  await page.getByRole('link', { name: 'Organizaciones' }).click();
  await expect(page.getByText('Acceso de consulta')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Operaciones', level: 3 }),
  ).toBeVisible();
  await expect(page.getByText('member@example.com')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Nueva organización' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Agregar miembro' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Crear equipo' })).toHaveCount(0);
  expect(mutationRequests).toEqual([]);
});

test('does not offer vault creation when only read is granted', async ({
  page,
}) => {
  const mutationRequests: string[] = [];
  page.on('request', (request) => {
    if (
      request.url().includes('/api/vaults') &&
      request.method() !== 'GET'
    ) {
      mutationRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        accessToken: 'reader-token',
        user: {
          id: 'reader-id',
          email: 'reader@example.com',
          displayName: 'Reader',
          roles: ['VAULT_READER'],
          permissions: ['vault.read'],
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
      ],
    }),
  );
  await page.route('**/api/vaults', (route) => route.fulfill({ json: [] }));

  await page.goto('/');
  await expect(page.getByText('Acceso de consulta')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No hay un vault disponible.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Crear vault protegido' }),
  ).toHaveCount(0);
  expect(mutationRequests).toEqual([]);
});