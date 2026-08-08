import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class AddTeamMemberDto {
  @ApiProperty({ example: 'persona@empresa.com' })
  @IsEmail()
  email!: string;
}
