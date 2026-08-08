import { validate } from 'class-validator';
import { ResetPasswordDto } from './reset-password.dto';

describe('ResetPasswordDto', () => {
  it('requires at least eight password characters', async () => {
    const sevenCharacters = Object.assign(new ResetPasswordDto(), {
      token: 't'.repeat(32),
      password: '1234567',
    });
    const eightCharacters = Object.assign(new ResetPasswordDto(), {
      token: 't'.repeat(32),
      password: '12345678',
    });

    await expect(validate(sevenCharacters)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'password' }),
      ]),
    );
    await expect(validate(eightCharacters)).resolves.toEqual([]);
  });
});
