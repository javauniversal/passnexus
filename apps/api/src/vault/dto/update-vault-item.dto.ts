import { IsBase64, IsEnum, IsInt, Min } from 'class-validator';
import { VaultItemType } from '@prisma/client';

export class UpdateVaultItemDto {
  @IsEnum(VaultItemType)
  type!: VaultItemType;

  @IsBase64()
  encryptedData!: string;

  @IsBase64()
  nonce!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
