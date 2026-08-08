import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { OrganizationRole } from '@prisma/client';

export class AddOrganizationMemberDto {
  @ApiProperty({ example: 'persona@empresa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    enum: [OrganizationRole.ADMIN, OrganizationRole.MEMBER],
    required: false,
  })
  @IsOptional()
  @IsEnum(OrganizationRole)
  role?: 'ADMIN' | 'MEMBER';
}
