import { ApiProperty } from '@nestjs/swagger';
import { IsBase64, IsObject } from 'class-validator';

export class UpsertUserCryptoKeyDto {
  @ApiProperty({
    description: 'JWK de la clave pública ECDH generado en el navegador.',
  })
  @IsObject()
  publicKey!: Record<string, unknown>;

  @ApiProperty({
    description: 'Clave privada JWK cifrada localmente con la clave del vault.',
  })
  @IsBase64()
  encryptedPrivateKey!: string;

  @ApiProperty({ description: 'Nonce AES-GCM de la clave privada cifrada.' })
  @IsBase64()
  privateKeyNonce!: string;
}
