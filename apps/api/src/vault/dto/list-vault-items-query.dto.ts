import { IsIn, IsOptional } from 'class-validator';

export class ListVaultItemsQueryDto {
  @IsOptional()
  @IsIn(['active', 'deleted'])
  status: 'active' | 'deleted' = 'active';
}
