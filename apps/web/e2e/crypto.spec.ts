import { expect, test } from '@playwright/test';

test('unlocks legacy and recovery envelopes without changing vault data', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const cryptoModule = await import('/src/lib/crypto.ts');
    const created = await cryptoModule.createVaultEnvelope(
      'correct-master-password',
    );
    const legacyEnvelope = {
      encryptedVaultKey: created.envelope.encryptedVaultKey,
      vaultKeyNonce: created.envelope.vaultKeyNonce,
      keyDerivationSalt: created.envelope.keyDerivationSalt,
      keyDerivationParams: created.envelope.keyDerivationParams,
    };
    const unlockedLegacyKey = await cryptoModule.unlockVault(
      'correct-master-password',
      legacyEnvelope,
    );
    const encrypted = await cryptoModule.encryptVaultPayload(
      unlockedLegacyKey,
      { title: 'preserved secret' },
    );
    const decrypted = await cryptoModule.decryptVaultPayload<{ title: string }>(
      unlockedLegacyKey,
      encrypted.encryptedData,
      encrypted.nonce,
    );
    const recoveryKey = await cryptoModule.unlockVaultWithRecovery(
      created.recoveryKey,
      created.envelope,
    );
    const replacementEnvelope =
      await cryptoModule.createMasterPasswordEnvelope(
        'replacement-master-password',
        recoveryKey,
      );
    const replacementKey = await cryptoModule.unlockVault(
      'replacement-master-password',
      replacementEnvelope,
    );
    const recovered = await cryptoModule.decryptVaultPayload<{ title: string }>(
      replacementKey,
      encrypted.encryptedData,
      encrypted.nonce,
    );
    return { decrypted, recovered };
  });

  expect(result.decrypted.title).toBe('preserved secret');
  expect(result.recovered.title).toBe('preserved secret');
});

test('creates a sharing key when the API reports no content', async ({ page }) => {
  const requests: string[] = [];
  let sharingKeyPayload: Record<string, unknown> | null = null;
  await page.route('**/api/vaults/crypto-key', async (route) => {
    requests.push(route.request().method());
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 204 });
      return;
    }
    sharingKeyPayload = route.request().postDataJSON() as Record<string, unknown>;
    const fields = Object.keys(sharingKeyPayload).sort();
    if (
      fields.join(',') !==
      ['encryptedPrivateKey', 'privateKeyNonce', 'publicKey'].sort().join(',')
    ) {
      await route.fulfill({ status: 400, json: { message: 'Invalid payload' } });
      return;
    }
    await route.fulfill({ status: 201, json: {} });
  });

  await page.goto('/');
  await page.evaluate(async () => {
    const cryptoModule = await import('/src/lib/crypto.ts');
    const { vaultKey } = await cryptoModule.createVaultEnvelope(
      'correct-master-password',
    );
    await cryptoModule.ensureSharingKey(
      vaultKey,
      'test-access-token',
      'http://127.0.0.1:3000/api',
    );
  });

  expect(requests).toEqual(['GET', 'POST']);
  expect(sharingKeyPayload).toEqual({
    publicKey: expect.any(Object),
    encryptedPrivateKey: expect.any(String),
    privateKeyNonce: expect.any(String),
  });
});

test('never sends the recovery key to the API', async ({ page }) => {
  await page.goto('/');
  const legacyEnvelope = await page.evaluate(async () => {
    const cryptoModule = await import('/src/lib/crypto.ts');
    const { envelope } = await cryptoModule.createVaultEnvelope(
      'correct-master-password',
    );
    const {
      encryptedRecoveryVaultKey: _encryptedRecoveryVaultKey,
      recoveryVaultKeyNonce: _recoveryVaultKeyNonce,
      ...legacy
    } = envelope;
    return legacy;
  });
  const vault = {
    id: 'vault-id',
    name: 'Mi vault',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...legacyEnvelope,
  };
  let recoveryPayload: Record<string, unknown> | null = null;

  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        accessToken: 'test-token',
        user: {
          id: 'user-id',
          email: 'user@example.com',
          displayName: 'User',
          roles: ['MEMBER'],
          permissions: [
            'vault.read',
            'vault.create',
            'vault.update',
            'vault.delete',
          ],
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
  await page.route('**/api/vaults', (route) => route.fulfill({ json: [vault] }));
  await page.route('**/api/vaults/*/recovery-envelope', async (route) => {
    recoveryPayload = route.request().postDataJSON() as Record<string, unknown>;
    const fields = Object.keys(recoveryPayload).sort();
    if (
      fields.join(',') !==
      ['encryptedRecoveryVaultKey', 'recoveryVaultKeyNonce'].sort().join(',')
    ) {
      await route.fulfill({ status: 400, json: { message: 'Invalid payload' } });
      return;
    }
    await route.fulfill({ json: { ...vault, ...recoveryPayload } });
  });
  await page.route('**/api/vaults/vault-id/items**', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route('**/api/vaults/shared-items', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route('**/api/vaults/crypto-key', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 204 })
      : route.fulfill({ status: 201, json: {} }),
  );

  await page.reload();
  await page.getByLabel('Contraseña maestra').fill('correct-master-password');
  await page.getByRole('button', { name: 'Desbloquear vault' }).click();

  await expect(page.getByText('Guarda tu clave de recuperación.')).toBeVisible();
  expect(recoveryPayload).toEqual({
    encryptedRecoveryVaultKey: expect.any(String),
    recoveryVaultKeyNonce: expect.any(String),
  });
  expect(recoveryPayload).not.toHaveProperty('recoveryKey');

  await page.getByRole('button', { name: 'Ya la guardé, abrir mi vault' }).click();
  await expect(page.getByText('0 elementos')).toBeVisible();
  await expect(
    page.getByText('No fue posible descifrar uno o más elementos compartidos.'),
  ).toHaveCount(0);
});