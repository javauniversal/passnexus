import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { CreateVaultItemDto } from './create-vault-item.dto';

export class ImportVaultItemsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateVaultItemDto)
  items!: CreateVaultItemDto[];
}
