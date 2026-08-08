import { HttpStatus } from '@nestjs/common';
import { VaultController } from './vault.controller';

describe('VaultController', () => {
  const vaultService = {
    getCryptoKey: jest.fn(),
  };
  const controller = new VaultController(vaultService as never);

  beforeEach(() => jest.resetAllMocks());

  it('returns no content when the sharing key has not been created', async () => {
    vaultService.getCryptoKey.mockResolvedValue(null);
    const response = { status: jest.fn() };

    await expect(
      controller.getCryptoKey(
        { user: { sub: 'user-id' } } as never,
        response as never,
      ),
    ).resolves.toBeNull();
    expect(response.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
  });
});
