import { expect, test } from '@playwright/test';

const owner = {
  role: 'OWNER',
  joinedAt: '2026-08-01T00:00:00.000Z',
  user: {
    id: 'owner-id',
    email: 'owner@example.com',
    displayName: 'Propietaria Nexus',
  },
};

test('manages organization members, teams and deletion end to end', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const organization = {
    id: 'organization-id',
    name: 'Operaciones Nexus',
    ownerId: 'owner-id',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    members: [owner],
    teams: [] as Array<{
      id: string;
      name: string;
      members: Array<{
        membership: { user: (typeof owner)['user'] };
      }>;
    }>,
  };
  const mutationBodies: Array<{ path: string; body: unknown }> = [];

  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        accessToken: 'owner-token',
        user: {
          ...owner.user,
          roles: ['ADMINISTRATOR'],
          permissions: [
            'organizations.read',
            'organizations.create',
            'organizations.update',
            'organizations.delete',
          ],
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
  await page.route('**/api/organizations**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === 'GET') {
      return route.fulfill({ json: organization.id ? [organization] : [] });
    }

    const body = request.postDataJSON?.() ?? null;
    mutationBodies.push({ path, body });

    if (
      request.method() === 'POST' &&
      path === '/api/organizations/organization-id/members'
    ) {
      const member = {
        role: body.role,
        joinedAt: '2026-08-08T00:00:00.000Z',
        user: {
          id: 'auditor-id',
          email: body.email,
          displayName: 'Auditor Nexus',
        },
      };
      organization.members.push(member);
      return route.fulfill({ status: 201, json: member });
    }
    if (request.method() === 'POST' && path.endsWith('/teams')) {
      const team = { id: 'team-id', name: body.name, members: [] };
      organization.teams.push(team);
      return route.fulfill({ status: 201, json: team });
    }
    if (
      request.method() === 'POST' &&
      path.endsWith('/teams/team-id/members')
    ) {
      const member = organization.members.find(
        (candidate) => candidate.user.email === body.email,
      );
      organization.teams[0].members.push({ membership: { user: member!.user } });
      return route.fulfill({ status: 201, json: { teamId: 'team-id' } });
    }
    if (
      request.method() === 'DELETE' &&
      path.endsWith('/teams/team-id/members/auditor-id')
    ) {
      organization.teams[0].members = [];
      return route.fulfill({ status: 204 });
    }
    if (
      request.method() === 'DELETE' &&
      path === '/api/organizations/organization-id'
    ) {
      organization.id = '';
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 404, json: { message: 'Ruta no simulada' } });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Organizaciones' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBe(0);

  await page.getByRole('button', { name: 'Agregar miembro' }).click();
  const memberDialog = page.getByRole('dialog', { name: 'Agregar miembro' });
  await memberDialog.getByLabel('Correo del usuario').fill('auditor@example.com');
  await memberDialog.getByLabel('Rol en la organización').click();
  await page.getByRole('option', { name: 'Administrador' }).click();
  await memberDialog.getByRole('button', { name: 'Agregar miembro' }).click();
  await expect(page.getByText('auditor@example.com')).toBeVisible();
  expect(mutationBodies[0]).toEqual({
    path: '/api/organizations/organization-id/members',
    body: { email: 'auditor@example.com', role: 'ADMIN' },
  });

  await page.getByRole('button', { name: /Equipos/ }).click();
  await page.getByRole('button', { name: 'Crear equipo' }).click();
  const teamDialog = page.getByRole('dialog', { name: 'Crear equipo' });
  await teamDialog.getByLabel('Nombre del equipo').fill('Respuesta a incidentes');
  await teamDialog.getByRole('button', { name: 'Crear equipo' }).click();
  await expect(page.getByText('Respuesta a incidentes')).toBeVisible();

  await page.getByRole('button', { name: 'Asignar miembro' }).click();
  const assignmentDialog = page.getByRole('dialog', {
    name: 'Asignar a Respuesta a incidentes',
  });
  await assignmentDialog.getByLabel('Miembro').click();
  await page.getByRole('option', { name: /Auditor Nexus/ }).click();
  await assignmentDialog.getByRole('button', { name: 'Asignar miembro' }).click();
  await expect(
    page.getByRole('button', {
      name: 'Retirar a Auditor Nexus de Respuesta a incidentes',
    }),
  ).toBeVisible();

  await page
    .getByRole('button', {
      name: 'Retirar a Auditor Nexus de Respuesta a incidentes',
    })
    .click();
  await page.getByRole('dialog', { name: 'Quitar miembro' }).getByRole('button', {
    name: 'Eliminar',
  }).click();
  await expect(page.getByText('Miembro retirado.')).toBeVisible();

  await page
    .getByRole('button', { name: 'Eliminar organización Operaciones Nexus' })
    .click();
  const deletionDialog = page.getByRole('dialog', {
    name: 'Eliminar organización',
  });
  const deleteButton = deletionDialog.getByRole('button', { name: 'Eliminar' });
  await expect(deleteButton).toBeDisabled();
  await deletionDialog
    .getByLabel('Escribe Operaciones Nexus para confirmar')
    .fill('Operaciones Nexus');
  await deleteButton.click();
  await expect(page.getByText('No hay organizaciones disponibles')).toBeVisible();

  expect(mutationBodies.map(({ path }) => path)).toEqual([
    '/api/organizations/organization-id/members',
    '/api/organizations/organization-id/teams',
    '/api/organizations/organization-id/teams/team-id/members',
    '/api/organizations/organization-id/teams/team-id/members/auditor-id',
    '/api/organizations/organization-id',
  ]);
});
