import { VaultItemType } from '@prisma/client';
import { IsBase64, IsEnum, IsInt, Min } from 'class-validator';

export class UpdateSharedVaultItemDto {
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
