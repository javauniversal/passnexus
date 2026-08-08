import { ApiProperty } from '@nestjs/swagger';
import { IsBase64 } from 'class-validator';

export class UpdateVaultRecoveryEnvelopeDto {
  @ApiProperty()
  @IsBase64()
  encryptedRecoveryVaultKey!: string;

  @ApiProperty()
  @IsBase64()
  recoveryVaultKeyNonce!: string;
}
