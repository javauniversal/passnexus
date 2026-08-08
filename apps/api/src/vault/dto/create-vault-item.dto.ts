import { VaultItemType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsBase64, IsEnum } from 'class-validator';

export class CreateVaultItemDto {
  @ApiProperty({ enum: VaultItemType, example: VaultItemType.LOGIN })
  @IsEnum(VaultItemType)
  type!: VaultItemType;

  @ApiProperty({
    description: 'Payload cifrado en el navegador mediante AES-GCM.',
  })
  @IsBase64()
  encryptedData!: string;

  @ApiProperty({ description: 'Nonce AES-GCM del elemento.' })
  @IsBase64()
  nonce!: string;
}
