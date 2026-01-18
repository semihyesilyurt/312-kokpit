/**
 * Change Password DTO
 * Validation for password change request
 */

import { IsString, MinLength, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password for verification',
    example: 'currentPassword123',
  })
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword!: string;

  @ApiProperty({
    description: 'New password (minimum 6 characters)',
    example: 'newSecurePassword456',
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: 'New password must be at least 6 characters' })
  @Matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/, {
    message: 'Password must contain at least one letter and one number',
  })
  newPassword!: string;

  @ApiProperty({
    description: 'Confirm new password (must match newPassword)',
    example: 'newSecurePassword456',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password confirmation is required' })
  confirmPassword!: string;
}
