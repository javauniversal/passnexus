import { ApiProperty } from '@nestjs/swagger';
import { IsBase64, IsObject } from 'class-validator';

export class UpdateVaultKeyEnvelopeDto {
  @ApiProperty()
  @IsBase64()
  encryptedVaultKey!: string;

  @ApiProperty()
  @IsBase64()
  vaultKeyNonce!: string;

  @ApiProperty()
  @IsBase64()
  keyDerivationSalt!: string;

  @ApiProperty()
  @IsObject()
  keyDerivationParams!: Record<string, unknown>;
}
