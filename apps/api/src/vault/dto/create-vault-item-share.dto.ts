import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBase64,
  IsEmail,
  IsIn,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateVaultItemShareDto {
  @ApiProperty({ example: 'member@empresa.com' })
  @IsEmail()
  recipientEmail!: string;

  @ApiProperty({
    description:
      'Clave de documento envuelta con la clave pública del destinatario.',
  })
  @IsBase64()
  encryptedItemKey!: string;

  @ApiProperty({ description: 'Nonce AES-GCM del envelope.' })
  @IsBase64()
  itemKeyNonce!: string;

  @ApiProperty({ description: 'JWK pública efímera ECDH del remitente.' })
  @IsObject()
  senderPublicKey!: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Ciphertext promovido a la clave de documento. Requerido al compartir un item aún cifrado con la vault key.',
  })
  @IsOptional()
  @IsBase64()
  encryptedData?: string;

  @ApiPropertyOptional({ description: 'Nonce del ciphertext promovido.' })
  @IsOptional()
  @IsBase64()
  nonce?: string;

  @ApiPropertyOptional({
    description:
      'Envelope opaco de la clave de documento cifrado con la vault key del owner.',
  })
  @IsOptional()
  @IsBase64()
  encryptedDocumentKey?: string;

  @ApiPropertyOptional({ description: 'Nonce del envelope opaco del owner.' })
  @IsOptional()
  @IsBase64()
  documentKeyNonce?: string;

  @ApiPropertyOptional({
    description:
      'Versión que se promueve; evita perder una actualización concurrente.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @ApiPropertyOptional({ enum: ['read', 'write'] })
  @IsOptional()
  @IsIn(['read', 'write'])
  permission?: 'read' | 'write';

  @ApiPropertyOptional({ description: 'Caducidad opcional en ISO 8601.' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
