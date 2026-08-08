import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBase64,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class TeamShareRecipientEnvelopeDto {
  @ApiProperty()
  @IsUUID()
  recipientId!: string;

  @ApiProperty()
  @IsBase64()
  encryptedItemKey!: string;

  @ApiProperty()
  @IsBase64()
  itemKeyNonce!: string;

  @ApiProperty()
  @IsObject()
  senderPublicKey!: Record<string, unknown>;
}

export class CreateVaultItemTeamShareDto {
  @ApiProperty()
  @IsUUID()
  teamId!: string;

  @ApiProperty({ type: [TeamShareRecipientEnvelopeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TeamShareRecipientEnvelopeDto)
  recipients!: TeamShareRecipientEnvelopeDto[];

  @ApiPropertyOptional({ enum: ['read', 'write'] })
  @IsOptional()
  @IsIn(['read', 'write'])
  permission?: 'read' | 'write';

  @ApiPropertyOptional({ description: 'Caducidad opcional en ISO 8601.' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBase64()
  encryptedData?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBase64()
  nonce?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBase64()
  encryptedDocumentKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBase64()
  documentKeyNonce?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
