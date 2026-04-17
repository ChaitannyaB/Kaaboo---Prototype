import { IsEmail, IsString, Length } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(2, 20)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 100)
  password: string;
}
