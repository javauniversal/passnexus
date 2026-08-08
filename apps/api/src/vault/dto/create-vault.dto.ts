import { ApiProperty } from '@nestjs/swagger';
import {
  IsBase64,
  IsObject,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateVaultDto {
  @ApiProperty({ example: 'Vault personal' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: 'Clave del vault cifrada en el navegador.' })
  @IsBase64()
  encryptedVaultKey!: string;

  @ApiProperty({ description: 'Nonce AES-GCM del envelope de clave.' })
  @IsBase64()
  vaultKeyNonce!: string;

  @ApiProperty({
    description: 'Salt de derivación de clave, codificado en base64.',
  })
  @IsBase64()
  keyDerivationSalt!: string;

  @ApiProperty({
    example: { algorithm: 'PBKDF2', hash: 'SHA-256', iterations: 600000 },
  })
  @IsObject()
  keyDerivationParams!: Record<string, unknown>;

  @ApiProperty({
    description:
      'Clave del vault cifrada con una clave de recuperación generada en el navegador.',
  })
  @IsBase64()
  encryptedRecoveryVaultKey!: string;

  @ApiProperty({ description: 'Nonce AES-GCM del envelope de recuperación.' })
  @IsBase64()
  recoveryVaultKeyNonce!: string;
}
