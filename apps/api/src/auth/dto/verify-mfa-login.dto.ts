import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class VerifyMfaLoginDto {
  @ApiProperty()
  @IsString()
  @MinLength(32)
  challengeToken!: string;

  @ApiProperty({ example: '123456', pattern: '^\\d{6}$' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código debe tener seis dígitos.' })
  code!: string;
}
