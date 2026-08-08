import { expect, test } from '@playwright/test';

test('opens a read-only shared credential below the vault filters', async ({
  context,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const fixture = await page.evaluate(async () => {
    const cryptoModule = await import('/src/lib/crypto.ts');
    const recipientVault = await cryptoModule.createVaultEnvelope(
      'shared-master-password',
    );
    const recipientKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey'],
    );
    const recipientPublicKey = await crypto.subtle.exportKey(
      'jwk',
      recipientKeyPair.publicKey,
    );
    const recipientPrivateKey = await crypto.subtle.exportKey(
      'jwk',
      recipientKeyPair.privateKey,
    );
    const encryptedPrivateKey = await cryptoModule.encryptVaultPayload(
      recipientVault.vaultKey,
      recipientPrivateKey,
    );
    const promoted = await cryptoModule.promoteToDocumentKey(
      recipientVault.vaultKey,
      {
        title: 'NAS FIISS',
        folder: 'Infraestructura',
        username: 'admin@fiiss.local',
        password: 'secreto-compartido-2026',
        website: 'https://nas.fiiss.local',
        notes: 'Acceso de contingencia',
      },
    );
    const recipientEnvelope =
      await cryptoModule.createRecipientDocumentKeyEnvelope(
        promoted.documentKey,
        recipientPublicKey,
      );

    return {
      vault: {
        id: 'vault-id',
        name: 'Mi vault',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...recipientVault.envelope,
      },
      storedKey: {
        publicKey: recipientPublicKey,
        encryptedPrivateKey: encryptedPrivateKey.encryptedData,
        privateKeyNonce: encryptedPrivateKey.nonce,
      },
      share: {
        id: 'share-id',
        vaultItemId: 'shared-item-id',
        permission: 'read',
        ...recipientEnvelope,
        vaultItem: {
          type: 'LOGIN',
          encryptedData: promoted.encryptedData,
          nonce: promoted.nonce,
          version: 1,
          encryptionScheme: 'DOCUMENT_KEY',
        },
      },
    };
  });
  const mutationRequests: string[] = [];
  page.on('request', (request) => {
    if (
      ['PATCH', 'PUT', 'DELETE'].includes(request.method()) &&
      request.url().includes('/api/vaults/')
    ) {
      mutationRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        accessToken: 'recipient-token',
        user: {
          id: 'recipient-id',
          email: 'recipient@fiiss.local',
          displayName: 'Recipient',
          roles: ['VAULT_MEMBER'],
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
  await page.route('**/api/vaults', (route) =>
    route.fulfill({ json: [fixture.vault] }),
  );
  await page.route('**/api/vaults/vault-id/items**', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route('**/api/vaults/shared-items', (route) =>
    route.fulfill({ json: [fixture.share] }),
  );
  await page.route('**/api/vaults/crypto-key', (route) =>
    route.fulfill({ json: fixture.storedKey }),
  );

  await page.reload();
  await page
    .getByLabel('Contraseña maestra')
    .fill('shared-master-password');
  await page.getByRole('button', { name: 'Desbloquear vault' }).click();

  const toolbar = page.locator('.vault-organization-toolbar');
  const sharedSection = page.locator('.shared-vault-section');
  await expect(sharedSection).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBe(390);
  const [toolbarBox, sharedBox] = await Promise.all([
    toolbar.boundingBox(),
    sharedSection.boundingBox(),
  ]);
  expect(sharedBox!.y).toBeGreaterThanOrEqual(toolbarBox!.y + toolbarBox!.height);
  await expect(page.getByText('2 elementos')).toHaveCount(0);
  await expect(page.getByText('1 elemento')).toBeVisible();

  await page.getByRole('button', { name: 'Ver' }).click();
  const viewer = page.getByRole('dialog');
  await expect(viewer.getByText('Solo lectura')).toBeVisible();
  await expect(viewer.getByText('admin@fiiss.local')).toBeVisible();
  await expect(viewer.getByText('secreto-compartido-2026')).toHaveCount(0);
  await viewer.getByRole('button', { name: 'Mostrar Contraseña' }).click();
  await expect(viewer.getByText('secreto-compartido-2026')).toBeVisible();
  await viewer.getByRole('button', { name: 'Copiar Contraseña' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('secreto-compartido-2026');
  await expect(viewer.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  expect(mutationRequests).toEqual([]);
});
